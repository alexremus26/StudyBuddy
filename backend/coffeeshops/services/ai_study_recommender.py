import json
import logging
import re
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_MAX_RETRIES = 2
_RETRY_BASE_DELAY = 1
_FALLBACK_RECOMMENDATION_COUNT = 3
_DEFAULT_RECOMMENDER_TIMEOUT_SECONDS = 120
_DEFAULT_MAX_LOCATIONS_IN_PROMPT = 60


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
        raise ValueError("No JSON object found in Ollama response")
    return json.loads(clean_text)


def _call_ollama_recommender(prompt: str) -> dict:
    """
    Call the local Ollama instance for recommendations.
    Throws Exception on failure.
    """
    ollama_host = settings.OLLAMA_HOST.strip("/") if getattr(settings, 'OLLAMA_HOST', None) else ""
    if not ollama_host:
        raise RuntimeError("OLLAMA_HOST is not configured")
        
    ollama_model = settings.OLLAMA_MODEL
    url = f"{ollama_host}/api/generate"
    request_timeout = int(getattr(settings, "OLLAMA_RECOMMENDER_TIMEOUT_SECONDS", _DEFAULT_RECOMMENDER_TIMEOUT_SECONDS))

    format_schema = {
        "type": "object",
        "properties": {
            "recommendations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "location_id": {"type": "integer"},
                        "location_name": {"type": "string"},
                        "reason": {"type": "string"}
                    },
                    "required": ["location_id", "location_name", "reason"]
                }
            }
        },
        "required": ["recommendations"]
    }

    last_exc = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.info("Ollama Recommender API call attempt %d/%d", attempt, _MAX_RETRIES)
            resp = requests.post(
                url,
                json={
                    "model": ollama_model,
                    "prompt": prompt,
                    "stream": False,
                    "format": format_schema,
                },
                timeout=request_timeout,
            )
            resp.raise_for_status()

            data = resp.json()
            text = data.get("response", "").strip()
            if not text:
                raise RuntimeError("Ollama returned an empty response")

            parsed = _extract_json_object(text)
            return parsed

        except requests.exceptions.RequestException as exc:
            last_exc = exc
            logger.warning("Ollama connection failed: %s", exc)
        except Exception as exc:
            last_exc = exc
            logger.warning("Ollama Recommender API attempt %d/%d failed: %s", attempt, _MAX_RETRIES, exc)

        if attempt < _MAX_RETRIES:
            time.sleep(_RETRY_BASE_DELAY)

    raise RuntimeError(f"AI recommendation failed after retries: {last_exc}") from last_exc


def _format_locations_for_prompt(locations_data: list) -> str:
    lines = []
    for loc in locations_data:
        prof = loc.get("aggregate_profile") or {}
        lines.append(
            f"ID: {loc['id']} | Name: {loc['name']} | "
            f"Rating: {prof.get('overall_rating', 'N/A')} | "
            f"Study Friendly: {prof.get('study_friendly', 'N/A')} | "
            f"Laptop Friendly: {prof.get('laptop_friendly', 'N/A')} | "
            f"Noise: {prof.get('noise_level', 'N/A')} | "
            f"Live Crowdness: {loc.get('besttime_live_busyness', 'N/A')}% | "
            f"Desc: {prof.get('ai_description', 'No description')}"
        )
    return "\n".join(lines)


def _score_location_for_prompt(location: dict) -> tuple:
    profile = location.get("aggregate_profile") or {}
    rating = profile.get("overall_rating")
    has_profile = 1 if profile else 0
    numeric_rating = float(rating) if isinstance(rating, (int, float)) else -1.0
    return (has_profile, numeric_rating, -(location.get("id") or 0))


def _select_locations_for_prompt(locations_data: list) -> list:
    max_locations = int(getattr(settings, "OLLAMA_RECOMMENDER_MAX_LOCATIONS", _DEFAULT_MAX_LOCATIONS_IN_PROMPT))
    if max_locations <= 0 or len(locations_data) <= max_locations:
        return locations_data

    ranked = sorted(locations_data, key=_score_location_for_prompt, reverse=True)
    selected = ranked[:max_locations]
    logger.info(
        "Trimming recommendation prompt candidates from %d to %d locations",
        len(locations_data),
        len(selected),
    )
    return selected


def _location_lookup(locations_data: list) -> dict[int, dict]:
    return {int(location["id"]): location for location in locations_data if location.get("id") is not None}


def _fallback_recommendations(locations_data: list) -> list[dict]:
    ranked_locations = sorted(
        locations_data,
        key=lambda location: (
            -(location.get("aggregate_profile") or {}).get("overall_rating")
            if isinstance((location.get("aggregate_profile") or {}).get("overall_rating"), (int, float))
            else 0,
            location.get("name") or "",
        ),
    )

    recommendations = []
    for location in ranked_locations[:_FALLBACK_RECOMMENDATION_COUNT]:
        profile = location.get("aggregate_profile") or {}
        reason_parts = []
        if profile.get("study_friendly") is not None:
            reason_parts.append(f"study score {profile.get('study_friendly')}")
        if profile.get("laptop_friendly") is not None:
            reason_parts.append(f"laptop score {profile.get('laptop_friendly')}")
        if profile.get("noise_level") is not None:
            reason_parts.append(f"noise score {profile.get('noise_level')}")

        recommendations.append({
            "location_id": location.get("id"),
            "location_name": location.get("name", "Unknown location"),
            "reason": (
                "Fallback recommendation based on available ratings"
                + (f" ({', '.join(reason_parts)})" if reason_parts else "")
                + "."
            ),
        })

    return recommendations


def _normalize_recommendations(payload: dict, locations_data: list) -> dict:
    lookup = _location_lookup(locations_data)
    raw_items = payload.get("recommendations")

    if not isinstance(raw_items, list):
        logger.warning(
            "AI recommendation payload missing recommendations list; using fallback shortlist. payload_keys=%s",
            list(payload.keys()) if isinstance(payload, dict) else type(payload).__name__,
        )
        fallback = _fallback_recommendations(locations_data)
        return {
            "recommendations": fallback,
            "candidate_locations": fallback,
        }

    normalized = []
    seen_ids = set()
    for item in raw_items:
        if not isinstance(item, dict):
            continue

        raw_location_id = item.get("location_id")
        try:
            location_id = int(raw_location_id)
        except (TypeError, ValueError):
            logger.warning("Skipping AI recommendation with invalid location_id=%r", raw_location_id)
            continue

        location = lookup.get(location_id)
        if not location or location_id in seen_ids:
            logger.warning(
                "Skipping AI recommendation for missing/duplicate location_id=%s (present=%s)",
                location_id,
                bool(location),
            )
            continue

        seen_ids.add(location_id)
        normalized.append({
            "location_id": location_id,
            "location_name": location.get("name", item.get("location_name", "Unknown location")),
            "reason": str(item.get("reason") or "This location matches your request.").strip(),
        })

    if normalized:
        fallback = _fallback_recommendations(locations_data)
        return {
            "recommendations": normalized,
            "candidate_locations": fallback,
        }

    logger.warning("AI recommendations normalized to empty list; using fallback shortlist.")
    fallback = _fallback_recommendations(locations_data)
    return {
        "recommendations": fallback,
        "candidate_locations": fallback,
    }


def _build_recommendation_prompt(title: str, context_lines: list[str], locations_text: str, *, mood_text: str | None = None) -> str:
    context_block = "\n".join(context_lines)
    mood_block = f"User's Mood: {mood_text}\n\n" if mood_text else ""

    return (
        "You are an AI study assistant. Your goal is to recommend the best cafe or study spot "
        "from the provided list based on the user's input.\n\n"
        "Return ONLY a JSON object with one key:\n"
        "  - \"recommendations\": an array of 3 objects ordered from best to good fit. Each object must include:\n"
        "    - \"location_id\": the integer ID of the location\n"
        "    - \"location_name\": the exact name of the location\n"
        "    - \"reason\": a short (1-2 sentence) explanation in English of why this location fits (always write the reason in English, even if the location details or description are in another language)\n\n"
        f"{context_block}\n"
        f"{mood_block}"
        "Available Locations:\n"
        f"{locations_text}\n"
    )


def recommend_by_assignment(assignment_data: dict, locations_data: list) -> dict:
    if not locations_data:
        raise ValueError("No locations available to recommend from.")

    prompt_locations = _select_locations_for_prompt(locations_data)
    locations_text = _format_locations_for_prompt(prompt_locations)

    prompt = _build_recommendation_prompt(
        "assignment",
        [
            f"Assignment Title: {assignment_data.get('title')}",
            f"Category: {assignment_data.get('category')}",
            f"Duration: {assignment_data.get('estimated_duration_minutes')} mins",
            f"Description: {assignment_data.get('description', '')}",
        ],
        locations_text,
    )

    response = _call_ollama_recommender(prompt)
    return _normalize_recommendations(response, locations_data)


def recommend_by_mood(mood_text: str, locations_data: list) -> dict:
    if not locations_data:
        raise ValueError("No locations available to recommend from.")

    prompt_locations = _select_locations_for_prompt(locations_data)
    locations_text = _format_locations_for_prompt(prompt_locations)

    prompt = _build_recommendation_prompt(
        "mood",
        [f"User's Mood: {mood_text}"],
        locations_text,
        mood_text=mood_text,
    )

    response = _call_ollama_recommender(prompt)
    return _normalize_recommendations(response, locations_data)
