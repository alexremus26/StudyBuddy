import logging

from celery import shared_task
from django.db import ProgrammingError, transaction

from coffeeshops.models import AIAggregateProfile, AIProfileGenerationJob, Location, BestTimeCrowdnessJob
from coffeeshops.services.ai_profile_service import build_ai_profile_from_reviews
from django.conf import settings
from django.utils import timezone
import requests
import random
from coffeeshops.services.apify_reviews import fetch_apify_reviews


logger = logging.getLogger(__name__)


def _get_job(job_id: int | None) -> AIProfileGenerationJob | None:
    if not job_id:
        return None
    try:
        return AIProfileGenerationJob.objects.get(id=job_id)
    except AIProfileGenerationJob.DoesNotExist:
        logger.warning("AI profile generation job %s no longer exists", job_id)
        return None


def get_latest_profile(location: Location) -> AIAggregateProfile | None:
    return location.aggregate_profiles.order_by("-created_at").first()


def get_active_generation_job(location: Location) -> AIProfileGenerationJob | None:
    return (
        location.ai_generation_jobs.filter(status__in=AIProfileGenerationJob.ACTIVE_STATUSES)
        .order_by("-updated_at")
        .first()
    )


def enqueue_location_profile_generation(location: Location) -> tuple[AIProfileGenerationJob, bool]:
    active_job = get_active_generation_job(location)
    if active_job:
        return active_job, False

    job = AIProfileGenerationJob.objects.create(
        location=location,
        status=AIProfileGenerationJob.STATUS_QUEUED,
    )
    async_result = process_location_profile_task.delay(location.id, job.id)
    job.mark_status(
        AIProfileGenerationJob.STATUS_QUEUED,
        process_task_id=async_result.id,
    )
    return job, True


def _serialize_user_reviews(location: Location) -> list[dict]:
    try:
        return [
            {
                "source": "app",
                "author": review.user.get_username() if review.user_id else "",
                "relative_time": review.created_at.isoformat(),
                "text": review.comment or "",
            }
            for review in location.reviews.select_related("user").order_by("-created_at")
        ]
    except ProgrammingError:
        logger.warning(
            "Skipping app reviews for location %s because the app_userreview table is missing",
            location.id,
            exc_info=True,
        )
        return []


def _collect_reviews(location: Location) -> list[dict]:
    apify_reviews_payload = fetch_apify_reviews(location.google_place_id)
    app_reviews = _serialize_user_reviews(location)
    return [
        *[{**review, "source": "google"} for review in apify_reviews_payload.get("reviews", []) or []],
        *app_reviews,
    ]


def _save_ai_profile(location: Location, combined_reviews: list[dict]) -> dict:
    profile_payload = build_ai_profile_from_reviews(location, {"reviews": combined_reviews})

    logger.info(
        "AI profile generated via %s for location %s",
        profile_payload.get("generation_source", "unknown"), location.id,
    )

    with transaction.atomic():
        profile, _ = AIAggregateProfile.objects.update_or_create(
            location=location,
            defaults={
                "AIdescription": profile_payload["AIdescription"],
                "laptop_friendly": profile_payload["laptop_friendly"],
                "study_friendly": profile_payload["study_friendly"],
                "noise_level": profile_payload["noise_level"],
            },
        )

    profile.update_overall_rating()

    return {
        "location_id": location.id,
        "location_name": location.name,
        "profile_id": profile.id,
        "overall_rating": profile.overall_rating,
        "status": "done",
        "generation_source": profile_payload.get("generation_source", "unknown"),
    }


@shared_task(bind=True, queue="coffeeshops")
def process_location_profile_task(self, location_id: int, job_id: int | None = None) -> dict:
    location = Location.objects.get(id=location_id)
    job = _get_job(job_id)
    # Stage 1: fetch reviews from Apify (I/O-bound, runs in parallel on apify queue)
    async_result = fetch_reviews_task.delay(location.id, job.id if job else None)
    if job:
        job.mark_status(
            AIProfileGenerationJob.STATUS_QUEUED,
            process_task_id=self.request.id,
            fetch_task_id=async_result.id,
        )

    return {
        "location_id": location.id,
        "location_name": location.name,
        "status": "queued",
        "fetch_task_id": async_result.id,
    }


@shared_task(
    bind=True,
    queue="apify",
    rate_limit="5/m",
    autoretry_for=(Exception,),
    retry_backoff=10,
    retry_backoff_max=120,
    max_retries=3,
)
def fetch_reviews_task(self, location_id: int, job_id: int | None = None) -> dict:
    """
    Stage 1 — Fetch reviews from Apify.

    Runs on the high-concurrency 'apify' queue (I/O-bound HTTP waits).
    On completion, enqueues score_location_task on the 'ai' queue.
    """
    location = Location.objects.get(id=location_id)
    job = _get_job(job_id)
    if job:
        job.mark_status(
            AIProfileGenerationJob.STATUS_FETCHING_REVIEWS,
            fetch_task_id=self.request.id,
        )

    try:
        combined_reviews = _collect_reviews(location)
    except Exception as exc:
        if job and self.request.retries >= self.max_retries:
            job.mark_status(AIProfileGenerationJob.STATUS_FAILED, error=str(exc))
        raise

    if not combined_reviews:
        error_message = (
            f"No reviews available for location {location.id} ({location.name}). "
            f"Cannot generate AI profile without review data."
        )
        logger.warning(error_message)
        if job:
            job.mark_status(AIProfileGenerationJob.STATUS_FAILED, error=error_message)
        raise RuntimeError(error_message)

    logger.info(
        "Fetched %d reviews for location %s (%s), enqueuing for AI scoring",
        len(combined_reviews), location.id, location.name,
    )

    async_result = score_location_task.delay(location.id, combined_reviews, job.id if job else None)
    if job:
        job.mark_status(
            AIProfileGenerationJob.STATUS_SCORING,
            score_task_id=async_result.id,
        )

    return {
        "location_id": location.id,
        "location_name": location.name,
        "status": "reviews_fetched",
        "review_count": len(combined_reviews),
    }


@shared_task(
    bind=True,
    queue="ai",
    rate_limit="5/m",
    autoretry_for=(Exception,),
    retry_backoff=10,
    retry_backoff_max=120,
    max_retries=3,
    retry_kwargs={"countdown": 10},
)
def score_location_task(self, location_id: int, combined_reviews: list[dict], job_id: int | None = None) -> dict:
    """
    Stage 2 — Score reviews with the configured local Ollama model.

    Runs on the low-concurrency 'ai' queue (CPU/RAM-bound local inference).
    Receives reviews directly from fetch_reviews_task to avoid re-fetching.
    """
    location = Location.objects.get(id=location_id)
    job = _get_job(job_id)
    if job:
        job.mark_status(
            AIProfileGenerationJob.STATUS_SCORING,
            score_task_id=self.request.id,
        )

    try:
        profile_payload = _save_ai_profile(location, combined_reviews)
    except Exception as exc:
        if job and self.request.retries >= self.max_retries:
            job.mark_status(AIProfileGenerationJob.STATUS_FAILED, error=str(exc))
        raise

    if job:
        job.mark_status(AIProfileGenerationJob.STATUS_DONE)

    return {
        "location_id": location.id,
        "location_name": location.name,
        "profile_id": profile_payload["profile_id"],
        "overall_rating": profile_payload["overall_rating"],
        "status": profile_payload["status"],
        "review_count": len(combined_reviews),
        "generation_source": profile_payload.get("generation_source", "unknown"),
    }


@shared_task(
    bind=True,
    queue="besttime",
    rate_limit="10/m",
    autoretry_for=(requests.RequestException,),
    retry_backoff=10,
    retry_backoff_max=120,
    max_retries=3,
)
def fetch_besttime_crowdness_task(self, location_id: int, job_id: int | None = None) -> dict:
    """
    Fetch crowdness data from BestTime.app API for a location.
    If no API key is configured, fallback to generating realistic mock data.
    """
    location = Location.objects.get(id=location_id)
    
    job = None
    if job_id:
        try:
            job = BestTimeCrowdnessJob.objects.get(id=job_id)
        except BestTimeCrowdnessJob.DoesNotExist:
            logger.warning("BestTime job %s no longer exists", job_id)

    if job:
        job.mark_status(BestTimeCrowdnessJob.STATUS_FETCHING, task_id=self.request.id)

    api_key_private = getattr(settings, "BESTTIME_API_KEY_PRIVATE", "").strip()

    try:
        # Fallback to mock data if no API key is configured
        if not api_key_private:
            logger.warning("BESTTIME_API_KEY_PRIVATE is not configured. Using mock data for location %s.", location_id)
            
            # Simulate network delay
            import time
            time.sleep(1.5)
            
            # Generate mock venue_id if not present
            venue_id = location.besttime_venue_id or f"ven_mock_{location.google_place_id or location_id}"
            
            # Generate mock weekly forecast (24h raw data for each day)
            days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            mock_forecast = []
            for day in days:
                raw_data = []
                for hour in range(24):
                    if hour < 7 or hour > 22:
                        raw_data.append(random.randint(5, 15))
                    elif 7 <= hour < 11:
                        raw_data.append(random.randint(30, 60)) # breakfast rush
                    elif 11 <= hour < 14:
                        raw_data.append(random.randint(40, 75)) # lunch
                    elif 14 <= hour < 17:
                        raw_data.append(random.randint(20, 50)) # afternoon lull
                    else:
                        raw_data.append(random.randint(50, 85)) # evening peak
                mock_forecast.append({
                    "day_info": day,
                    "day_raw": raw_data
                })

            # Mock live busyness level (say, based on current hour)
            current_hour = timezone.localtime().hour
            mock_live_busyness = mock_forecast[timezone.localtime().weekday()]["day_raw"][current_hour]
            mock_live_busyness = max(0, min(100, mock_live_busyness + random.randint(-10, 10)))

            # Save mock details to DB
            location.besttime_venue_id = venue_id
            location.besttime_forecast_data = mock_forecast
            location.besttime_live_busyness = mock_live_busyness
            location.besttime_live_fetched_at = timezone.now()
            location.save()

            if job:
                job.mark_status(BestTimeCrowdnessJob.STATUS_DONE)
            
            return {
                "location_id": location.id,
                "venue_id": venue_id,
                "live_busyness": mock_live_busyness,
                "status": "done",
                "mocked": True
            }

        # Real API logic
        venue_id = location.besttime_venue_id
        forecast_data = location.besttime_forecast_data

        # 1. Resolve venue_id if we don't have it
        if not venue_id:
            logger.info("Resolving venue_id for location %s (%s) from BestTime API", location.id, location.name)
            url = "https://besttime.app/api/v1/forecasts"
            params = {
                "api_key_private": api_key_private,
                "venue_name": location.name,
                "venue_address": location.address or location.name
            }
            response = requests.post(url, params=params, timeout=15)
            response.raise_for_status()
            res_json = response.json()
            
            if res_json.get("status") == "OK" and "venue_info" in res_json:
                venue_id = res_json["venue_info"]["venue_id"]
                forecast_data = res_json.get("analysis", [])
                location.besttime_venue_id = venue_id
                location.besttime_forecast_data = forecast_data
                location.save()
            else:
                raise RuntimeError(f"Failed to create BestTime forecast: {res_json.get('message', 'Unknown error')}")

        # 2. Query live busyness
        logger.info("Querying live busyness for location %s (venue_id: %s)", location.id, venue_id)
        url = "https://besttime.app/api/v1/forecasts/live"
        params = {
            "api_key_private": api_key_private,
            "venue_id": venue_id
        }
        response = requests.post(url, params=params, timeout=15)
        response.raise_for_status()
        res_json = response.json()

        if res_json.get("status") == "OK" and "analysis" in res_json:
            analysis = res_json["analysis"]
            if analysis.get("venue_live_could_connect", True):
                live_busyness = analysis.get("venue_live_busyness")
                location.besttime_live_busyness = live_busyness
                location.besttime_live_fetched_at = timezone.now()
                location.save()
            else:
                # Fallback to forecasted current busyness if live cannot connect
                current_hour = timezone.localtime().hour
                day_idx = timezone.localtime().weekday()
                forecast_busyness = None
                try:
                    if forecast_data and len(forecast_data) > day_idx:
                        forecast_busyness = forecast_data[day_idx]["day_raw"][current_hour]
                except Exception:
                    pass
                
                location.besttime_live_busyness = forecast_busyness
                location.besttime_live_fetched_at = timezone.now()
                location.save()
                logger.warning("BestTime live signals could not connect for venue %s. Falling back to forecast.", venue_id)
        else:
            raise RuntimeError(f"Failed to query BestTime live data: {res_json.get('message', 'Unknown error')}")

        if job:
            job.mark_status(BestTimeCrowdnessJob.STATUS_DONE)

        return {
            "location_id": location.id,
            "venue_id": venue_id,
            "live_busyness": location.besttime_live_busyness,
            "status": "done",
            "mocked": False
        }

    except Exception as exc:
        logger.warning("BestTime API request failed for location %s: %s. Falling back to mock data.", location_id, exc)
        try:
            # Fallback to mock data
            venue_id = location.besttime_venue_id or f"ven_mock_{location.google_place_id or location_id}"
            days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            mock_forecast = []
            for day in days:
                raw_data = []
                for hour in range(24):
                    if hour < 7 or hour > 22:
                        raw_data.append(random.randint(5, 15))
                    elif 7 <= hour < 11:
                        raw_data.append(random.randint(30, 60))
                    elif 11 <= hour < 14:
                        raw_data.append(random.randint(40, 75))
                    elif 14 <= hour < 17:
                        raw_data.append(random.randint(20, 50))
                    else:
                        raw_data.append(random.randint(50, 85))
                mock_forecast.append({
                    "day_info": day,
                    "day_raw": raw_data
                })

            current_hour = timezone.localtime().hour
            mock_live_busyness = mock_forecast[timezone.localtime().weekday()]["day_raw"][current_hour]
            mock_live_busyness = max(0, min(100, mock_live_busyness + random.randint(-10, 10)))

            location.besttime_venue_id = venue_id
            location.besttime_forecast_data = mock_forecast
            location.besttime_live_busyness = mock_live_busyness
            location.besttime_live_fetched_at = timezone.now()
            location.save()

            if job:
                job.mark_status(BestTimeCrowdnessJob.STATUS_DONE)
            
            return {
                "location_id": location.id,
                "venue_id": venue_id,
                "live_busyness": mock_live_busyness,
                "status": "done",
                "mocked": True,
                "fallback": True,
                "error": str(exc)
            }
        except Exception as fallback_exc:
            logger.exception("Error in BestTime mock fallback for location %s", location_id)
            if job:
                job.mark_status(BestTimeCrowdnessJob.STATUS_FAILED, error=f"Real API failed: {exc}. Fallback failed: {fallback_exc}")
            raise
