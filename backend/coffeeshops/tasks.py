import logging

from celery import shared_task
from django.db import ProgrammingError, transaction

from coffeeshops.models import AIAggregateProfile, AIProfileGenerationJob, Location
from coffeeshops.services.ai_profile_service import build_ai_profile_from_reviews
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

    generation_error = str(profile_payload.get("generation_error", "")).strip()
    if generation_error:
        logger.warning(
            "AI profile fallback used for location %s (%s): %s",
            location.id,
            location.name,
            generation_error,
        )
    else:
        logger.info("AI profile generated via %s for location %s", profile_payload.get("generation_source", "unknown"), location.id)

    with transaction.atomic():
        profile, _ = AIAggregateProfile.objects.update_or_create(
            location=location,
            defaults={
                "AIdescription": profile_payload["AIdescription"],
                "laptop_friendly": profile_payload["laptop_friendly"],
                "study_friendly": profile_payload["study_friendly"],
                "overall_corwdness": profile_payload["overall_corwdness"],
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
        "generation_error": generation_error,
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
        "generation_error": profile_payload.get("generation_error", ""),
    }
