import json
import logging
import re
import time

import requests
from django.conf import settings

from coffeeshops.models import Location

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 2


def _clamp_score(value, default=2.5):
    try:
        score = float(value)
    except (TypeError, ValueError):
        return default
    return round(max(0.0, min(5.0, score)), 1)


def _extract_json_object(text: str) -> dict:
    clean_text = text.strip()
    if clean_text.startswith("```"):
        clean_text = re.sub(r"^```(?:json)?\s*", "", clean_text)
        clean_text = re.sub(r"\s*```$", "", clean_text)
    start = clean_text.find("{")
    end = clean_text.rfind("}")
    if start != -1 and end != -1 and end > start:
        clean_text = clean_text[start : end + 1]
    if not clean_text:
        raise ValueError("No JSON object found in Ollama response (response was empty after extraction)")
    return json.loads(clean_text)





def _call_ollama(prompt: str, location_id: int) -> str:
    """
    Call the local Ollama instance with retry logic.

    Sends a POST to ``{OLLAMA_HOST}/api/generate`` and returns the raw
    response text.  Retries transient failures up to ``_MAX_RETRIES`` times
    with exponential back-off.
    """
    ollama_host = settings.OLLAMA_HOST.rstrip("/")
    ollama_model = settings.OLLAMA_MODEL
    url = f"{ollama_host}/api/generate"

    last_exc = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.info(
                "Ollama API call attempt %d/%d for location %s (model=%s)",
                attempt, _MAX_RETRIES, location_id, ollama_model,
            )
            resp = requests.post(
                url,
                json={
                    "model": ollama_model,
                    "prompt": prompt,
                    "stream": False,
                    "format": {
                        "type": "object",
                        "properties": {
                            "AIdescription": {"type": "string"},
                            "laptop_friendly": {"type": "number"},
                            "study_friendly": {"type": "number"},
                            "noise_level": {"type": "number"},
                        },
                        "required": [
                            "AIdescription",
                            "laptop_friendly",
                            "study_friendly",
                            "noise_level",
                        ],
                    },
                },
                timeout=120,
            )
            resp.raise_for_status()

            data = resp.json()
            text = data.get("response", "").strip()
            logger.debug(
                "Ollama raw response for location %s (length=%d): %s",
                location_id, len(text), text[:500],
            )
            if not text:
                raise RuntimeError(
                    f"Ollama returned an empty response (keys: {list(data.keys())})"
                )

            logger.info(
                "Ollama API call succeeded for location %s on attempt %d "
                "(response length: %d chars)",
                location_id, attempt, len(text),
            )
            return text

        except Exception as exc:
            last_exc = exc
            logger.warning(
                "Ollama API attempt %d/%d failed for location %s: %s: %s",
                attempt, _MAX_RETRIES, location_id, type(exc).__name__, exc,
            )

            if attempt < _MAX_RETRIES:
                delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
                logger.info("Retrying in %ds for location %s...", delay, location_id)
                time.sleep(delay)

    raise last_exc


def build_ai_profile_from_reviews(location: Location, reviews_payload: dict) -> dict:
    """
    Build an AI profile by sending review text to the local Ollama model.

    The model is asked to return four dimension scores on a 0–5 scale plus a
    short description.  ``overall_rating`` is intentionally excluded — it is
    computed downstream by ``AIAggregateProfile.update_overall_rating()``
    with study-focused weighting.
    """
    reviews = reviews_payload.get("reviews", []) or []
    if not isinstance(reviews, list):
        reviews = []

    review_lines = []
    for review in reviews:
        author = (review.get("author") or "").strip()
        text = (review.get("text") or "").strip()
        if text:
            source = (review.get("source") or "external").strip()
            review_lines.append(
                f"Source: {source}\nAuthor: {author}\nReview: {text}"
            )

    prompt = (
        "You are generating a structured cafe profile from customer reviews.\n"
        "This app helps university students find good study spots.\n\n"
        "Return ONLY valid JSON with exactly these keys:\n"
        "  AIdescription, laptop_friendly, study_friendly, noise_level\n\n"
        "CRITICAL: All scores MUST use ONE DECIMAL PLACE (e.g., 3.7, 2.4, 4.1).\n"
        "Prefer granular scores (non-whole numbers) — use whole numbers (1.0, 2.0, 3.0, 4.0, 5.0) sparingly, only when the review evidence is extremely clear-cut.\n\n"
        "Score definitions (0.0 to 5.0):\n"
        "  laptop_friendly — How suitable is this place for working on a laptop?\n"
        "    4.8-5.0 = excellent: multiple outlets, spacious tables, fast stable WiFi\n"
        "    4.0-4.7 = good: most spots have power, decent tables, solid WiFi\n"
        "    3.0-3.9 = moderate: some outlets, limited seating for laptops\n"
        "    1.5-2.9 = poor: few outlets or unstable WiFi, cramped\n"
        "    0.0-1.4 = terrible: no outlets, tiny tables, no WiFi\n"
        "  study_friendly — How good is this place for studying or focused work?\n"
        "    4.8-5.0 = excellent: quiet, respectful patrons, long-stay friendly\n"
        "    4.0-4.7 = good: mostly quiet, welcoming to students\n"
        "    3.0-3.9 = moderate: occasional noise, mixed environment\n"
        "    1.5-2.9 = poor: consistently loud, not welcoming\n"
        "    0.0-1.4 = terrible: loud music, rushed service, not for studying\n"
        "  noise_level — How quiet is this place? (inverse of busyness)\n"
        "    4.8-5.0 = excellent: library-like silence, minimal background noise\n"
        "    4.0-4.7 = good: quiet, only soft background conversations\n"
        "    3.0-3.9 = moderate: average cafe noise, somewhat distracting\n"
        "    1.5-2.9 = poor: noticeably loud, music, hard to concentrate\n"
        "    0.0-1.4 = terrible: extremely noisy, impossible to concentrate\n\n"
        "AIdescription — Summary of all reviews in English (always write the description in English, even if the input reviews are in Romanian or another language), focus on presenting the place for study enjoyers (BETWEEN 180 - 220 CHARACTERS).\n"
        "It is CRITICAL that you do not exceed this limit, or the text will be cut off.\n\n"
        "Be consistent, conservative, and deterministic.\n"
        "If reviews are insufficient for a dimension, default to 2.5.\n"
        "Always round scores to ONE decimal place (e.g., 3.4, not 3.33 or 3).\n\n"
        f"Location name: {location.name}\n"
        f"Address: {location.address}\n\n"
        "Reviews:\n"
        + ("\n\n".join(review_lines[:100]) if review_lines else "No reviews were provided.")
    )

    ollama_host = settings.OLLAMA_HOST.strip()
    if not ollama_host:
        error_message = "OLLAMA_HOST is not configured"
        logger.error("Ollama unavailable for location %s: %s", location.id, error_message)
        raise RuntimeError(error_message)

    try:
        response_text = _call_ollama(prompt, location.id)
        data = _extract_json_object(response_text)
    except Exception as exc:
        logger.exception(
            "Ollama profile generation FAILED for location %s (%s) after all retries: %s: %s",
            location.id, location.name, type(exc).__name__, exc,
        )
        raise RuntimeError(f"Ollama profile generation failed: {exc}") from exc

    if not isinstance(data, dict):
        error_message = "Ollama response was not a JSON object"
        logger.error("AI profile generation failed for location %s: %s", location.id, error_message)
        raise RuntimeError(error_message)

    logger.info(
        "Successfully generated AI profile for location %s (%s): scores=%s",
        location.id, location.name,
        {k: data.get(k) for k in ["laptop_friendly", "study_friendly", "noise_level"]},
    )

    return {
        "AIdescription": str(data.get("AIdescription", "")).strip()[:255],
        "laptop_friendly": _clamp_score(data.get("laptop_friendly")),
        "study_friendly": _clamp_score(data.get("study_friendly")),
        "noise_level": _clamp_score(data.get("noise_level")),
        "generation_source": f"ollama-{settings.OLLAMA_MODEL}",
        "generation_error": "",
    }