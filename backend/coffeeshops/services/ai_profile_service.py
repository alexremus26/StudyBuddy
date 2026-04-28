import json
import logging
import re

from django.conf import settings
from coffeeshops.models import Location

try:
    import google.generativeai as genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)


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
        "Each numeric score must be from 0 to 5 inclusive.\n"
        "Use the reviews to infer how suitable the place is for studying, laptop use, noise, crowding, and overall quality.\n"
        "Be consistent, conservative, and deterministic.\n"
        "Do not wrap the JSON in markdown fences.\n\n"
        f"Location name: {location.name}\n"
        f"Address: {location.address}\n\n"
        "Reviews:\n"
        + ("\n\n".join(review_lines[:10]) if review_lines else "No reviews were provided.")
    )

    api_key = getattr(settings, "GEMINI_API_KEY", "").strip()
    model_name = getattr(settings, "GEMINI_MODEL", "gemini-2.0-flash").strip()

    if not api_key or genai is None:
        error_message = "GEMINI_API_KEY is missing" if not api_key else "google.generativeai is not installed"
        logger.error("Gemini unavailable for location %s: %s", location.id, error_message)
        return _build_fallback_profile(location, reviews, error_message)

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        if not response or not getattr(response, "text", ""):
            raise RuntimeError("Gemini returned an empty response")
        data = _extract_json_object(response.text)
    except Exception as exc:
        logger.exception("Gemini profile generation failed for location %s", location.id)
        return _build_fallback_profile(location, reviews, str(exc))

    if not isinstance(data, dict):
        error_message = "Gemini response was not a JSON object"
        logger.error("Gemini profile generation failed for location %s: %s", location.id, error_message)
        return _build_fallback_profile(location, reviews, error_message)

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