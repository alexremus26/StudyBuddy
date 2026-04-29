import json
import logging
import re
import time

from django.conf import settings
from coffeeshops.models import Location

try:
    import google.generativeai as genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 2


def _clamp_score(value, default=2.5):
    try:
        score = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(5.0, score))


def _extract_json_object(text: str) -> dict:
    clean_text = text.strip()
    if clean_text.startswith("```"):
        clean_text = re.sub(r"^```(?:json)?\s*", "", clean_text)
        clean_text = re.sub(r"\s*```$", "", clean_text)
    start = clean_text.find("{")
    end = clean_text.rfind("}")
    if start != -1 and end != -1 and end > start:
        clean_text = clean_text[start : end + 1]
    return json.loads(clean_text)


def _build_fallback_profile(location: Location, reviews: list[dict], error_message: str) -> dict:
    return {
        "AIdescription": f"Gemini profile unavailable for {location.name}.",
        "laptop_friendly": 0.0,
        "study_friendly": 0.0,
        "overall_corwdness": 0.0,
        "noise_level": 0.0,
        "overall_rating": 0.0,
        "generation_source": "fallback",
        "generation_error": error_message,
    }


def _get_model(api_key: str, model_name: str):
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(model_name)


def _call_gemini_with_retry(model, prompt: str, location_id: int) -> str:
    last_exc = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.info(
                "Gemini API call attempt %d/%d for location %s",
                attempt, _MAX_RETRIES, location_id,
            )
            response = model.generate_content(prompt)

            if not response:
                raise RuntimeError("Gemini returned a None response object")

            if hasattr(response, "prompt_feedback") and response.prompt_feedback:
                block_reason = getattr(response.prompt_feedback, "block_reason", None)
                if block_reason:
                    raise RuntimeError(
                        f"Gemini blocked the prompt (reason: {block_reason})"
                    )

            text = getattr(response, "text", None)
            if not text:
                candidates = getattr(response, "candidates", None)
                if candidates:
                    finish_reason = getattr(candidates[0], "finish_reason", None)
                    raise RuntimeError(
                        f"Gemini returned empty text (finish_reason: {finish_reason}, "
                        f"candidates: {len(candidates)})"
                    )
                raise RuntimeError("Gemini returned an empty response with no text")

            logger.info(
                "Gemini API call succeeded for location %s on attempt %d (response length: %d chars)",
                location_id, attempt, len(text),
            )
            return text

        except Exception as exc:
            last_exc = exc
            exc_str = str(exc)
            logger.warning(
                "Gemini API attempt %d/%d failed for location %s: %s: %s",
                attempt, _MAX_RETRIES, location_id, type(exc).__name__, exc_str,
            )

            is_non_transient = any(keyword in exc_str.lower() for keyword in [
                "invalid api key", "api_key_invalid", "permission denied",
                "blocked", "safety", "not found",
            ])
            if is_non_transient:
                logger.error(
                    "Non-transient Gemini error for location %s, skipping retries: %s",
                    location_id, exc_str,
                )
                raise

            if attempt < _MAX_RETRIES:
                delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
                logger.info("Retrying in %ds for location %s...", delay, location_id)
                time.sleep(delay)

    raise last_exc


def build_ai_profile_from_reviews(location: Location, reviews_payload: dict) -> dict:
    reviews = reviews_payload.get("reviews", []) or []
    if not isinstance(reviews, list):
        reviews = []

    review_lines = []
    for review in reviews:
        author = (review.get("author") or "").strip()
        text = (review.get("text") or "").strip()
        rating = review.get("rating")
        if text:
            source = (review.get("source") or "external").strip()
            review_lines.append(
                f"Source: {source}\nAuthor: {author}\nRating: {rating}\nReview: {text}"
            )

    prompt = (
         "You are generating a structured cafe profile from reviews.\n"
        "Return ONLY valid JSON with these keys:\n"
        "AIdescription, laptop_friendly, study_friendly, overall_corwdness, noise_level, overall_rating.\n"
        "Each numeric score must be from 0 (Poor/Bad) to 5 (Excellent/Perfect).\n"
        "For noise_level: 5 means Very Quiet/Silent, 0 means Extremely Noisy.\n"
        "For overall_corwdness: 5 means Very Spacious/Empty, 0 means Extremely Crowded.\n"
        "Use the reviews to infer these scores.\n"
        "Be consistent, conservative, and deterministic.\n"
        f"Location name: {location.name}\n"
        f"Address: {location.address}\n\n"
        "Reviews:\n"
        + ("\n\n".join(review_lines[:10]) if review_lines else "No reviews were provided.")
    )

    api_key = getattr(settings, "GEMINI_API_KEY", "").strip()
    model_name = settings.GEMINI_MODEL

    if not api_key or genai is None:
        error_message = "GEMINI_API_KEY is missing" if not api_key else "google.generativeai is not installed"
        logger.error("Gemini unavailable for location %s: %s", location.id, error_message)
        return _build_fallback_profile(location, reviews, error_message)

    try:
        model = _get_model(api_key, model_name)
        response_text = _call_gemini_with_retry(model, prompt, location.id)
        data = _extract_json_object(response_text)
    except Exception as exc:
        logger.exception(
            "Gemini profile generation FAILED for location %s (%s) after all retries: %s: %s",
            location.id, location.name, type(exc).__name__, exc,
        )
        return _build_fallback_profile(location, reviews, str(exc))

    if not isinstance(data, dict):
        error_message = "Gemini response was not a JSON object"
        logger.error("Gemini profile generation failed for location %s: %s", location.id, error_message)
        return _build_fallback_profile(location, reviews, error_message)

    logger.info(
        "Successfully generated AI profile for location %s (%s): scores=%s",
        location.id, location.name,
        {k: data.get(k) for k in ["laptop_friendly", "study_friendly", "noise_level", "overall_rating"]},
    )

    return {
        "AIdescription": str(data.get("AIdescription", "")).strip()[:255],
        "laptop_friendly": _clamp_score(data.get("laptop_friendly")),
        "study_friendly": _clamp_score(data.get("study_friendly")),
        "overall_corwdness": _clamp_score(data.get("overall_corwdness")),
        "noise_level": _clamp_score(data.get("noise_level")),
        "overall_rating": _clamp_score(data.get("overall_rating")),
        "generation_source": "gemini",
        "generation_error": "",
    }