"""
Apify-based Google Maps review fetcher.

Uses the Apify actor (default: compass/crawler-google-places) to retrieve
up to APIFY_MAX_REVIEWS_PER_PLACE reviews per location using its Google
place_id for reliable identification.
"""

import logging

from django.conf import settings

try:
    from apify_client import ApifyClient
except ImportError:
    ApifyClient = None

logger = logging.getLogger(__name__)

_RUN_TIMEOUT_SECS = 300


def fetch_apify_reviews(google_place_id: str, limit: int | None = None) -> dict:
    """
    Fetch Google Maps reviews for a single place via Apify.

    Args:
        google_place_id: The Google Maps ``place_id`` (e.g. ``ChIJ...``).
        limit: Maximum number of reviews to return. Defaults to the
               ``APIFY_MAX_REVIEWS_PER_PLACE`` Django setting.

    Returns:
        A dict with keys ``google_place_id``, ``status``, ``reviews_count``,
        and ``reviews`` (list of normalised review dicts).
    """
    if limit is None:
        limit = getattr(settings, "APIFY_MAX_REVIEWS_PER_PLACE", 100)

    api_token = getattr(settings, "APIFY_API_TOKEN", "").strip()
    actor_id = getattr(settings, "APIFY_REVIEWS_ACTOR_ID", "compass/crawler-google-places").strip()

    if not api_token:
        error_message = "APIFY_API_TOKEN is not configured — cannot fetch reviews"
        logger.error(error_message)
        raise RuntimeError(error_message)

    if ApifyClient is None:
        error_message = "apify-client package is not installed"
        logger.error(error_message)
        raise RuntimeError(error_message)

    client = ApifyClient(api_token)

    run_input = {
        "startUrls": [{"url": f"https://www.google.com/maps/place/?q=place_id:{google_place_id}"}],
        "maxReviews": limit,
        "language": "en",
        "reviewsSort": "newest",
        "scrapeReviewerName": True,
        "scrapeReviewerUrl": False,
        "scrapeResponseFromOwner": False,
    }

    try:
        logger.info(
            "Starting Apify actor %s for place_id=%s (maxReviews=%d)",
            actor_id, google_place_id, limit,
        )
        run = client.actor(actor_id).call(
            run_input=run_input,
            timeout_secs=_RUN_TIMEOUT_SECS,
        )

        dataset_items = list(
            client.dataset(run["defaultDatasetId"]).iterate_items()
        )
    except Exception as exc:
        logger.exception(
            "Apify actor run failed for place_id=%s: %s: %s",
            google_place_id, type(exc).__name__, exc,
        )
        raise

    reviews_raw = []
    for item in dataset_items:
        reviews_raw.extend(item.get("reviews", []) or [])

    normalized = _normalize_reviews(reviews_raw, limit)

    logger.info(
        "Fetched %d reviews via Apify for place_id=%s",
        len(normalized), google_place_id,
    )

    return {
        "google_place_id": google_place_id,
        "status": "ok",
        "reviews_count": len(normalized),
        "reviews": normalized,
    }


def _normalize_reviews(raw_reviews: list[dict], limit: int) -> list[dict]:
    """
    Convert Apify actor output into the normalised shape consumed by the
    rest of the pipeline.

    Note: ``rating`` is intentionally omitted — the local LLM scores
    dimensions purely from review text.
    """
    normalized = []
    for review in raw_reviews[:limit]:
        text = (review.get("text") or review.get("reviewText") or "").strip()
        if not text:
            continue

        normalized.append({
            "author": (
                review.get("name")
                or review.get("reviewerName")
                or review.get("author")
                or ""
            ).strip(),
            "relative_time": (
                review.get("publishedAtDate")
                or review.get("relative_time")
                or ""
            ),
            "text": text,
        })

    return normalized


def _error_response(google_place_id: str, error: str) -> dict:
    return {
        "google_place_id": google_place_id,
        "status": "error",
        "error": error,
        "reviews_count": 0,
        "reviews": [],
    }
