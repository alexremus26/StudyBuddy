"""
Assignment text parser using Gemini Vision API.

Parses OCR text from assignment documents into structured assignment fields.
Uses the same GEMINI_API_KEY configured in Django settings.
"""

import json
import logging
import re

from django.conf import settings

logger = logging.getLogger(__name__)

try:
    import google.generativeai as genai
except ImportError:
    genai = None
    logger.info("google.generativeai not installed; Gemini assignment parsing disabled.")

# Strict allow-list for category values returned by the model
VALID_CATEGORIES = {"homework", "project", "exam", "reading", "other"}

# Maximum text length we send to the model to avoid abuse / excessive token use
MAX_OCR_TEXT_LENGTH = 8000


def _sanitize_category(value):
    """Return a valid category string or 'other'."""
    cleaned = str(value or "").strip().lower()
    return cleaned if cleaned in VALID_CATEGORIES else "other"


def _sanitize_duration(value):
    """Return a positive integer duration in minutes, or None."""
    try:
        minutes = int(value)
        if 1 <= minutes <= 14400:  # max ~10 days
            return minutes
    except (TypeError, ValueError):
        pass
    return None


def _sanitize_date(value):
    """Return a YYYY-MM-DD string if valid, else None."""
    raw = str(value or "").strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    return None


def parse_assignment_text(ocr_text):
    """
    Parse OCR text into structured assignment fields using Gemini.

    Returns a dict with keys: title, description, due_date,
    estimated_duration_minutes, category.
    Falls back to simple heuristic extraction if Gemini is unavailable.
    """
    text = str(ocr_text or "").strip()
    if not text:
        return {"title": "", "description": "", "due_date": None,
                "estimated_duration_minutes": None, "category": "other"}

    # Truncate to avoid excessive API cost
    truncated = text[:MAX_OCR_TEXT_LENGTH]

    gemini_api_key = getattr(settings, "GEMINI_API_KEY", "").strip()
    gemini_model = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash").strip()

    if not gemini_api_key or genai is None:
        logger.info("Gemini unavailable for assignment parsing; using fallback.")
        return _fallback_parse(truncated)

    try:
        genai.configure(api_key=gemini_api_key)
        client = genai.GenerativeModel(gemini_model)

        prompt = (
            "You are an academic assignment extraction assistant.\n"
            "Given the following OCR text from a student's assignment document, "
            "extract structured information.\n\n"
            "Return ONLY a valid JSON object with these keys:\n"
            '- "title": string (short assignment title, max 200 chars)\n'
            '- "description": string (full assignment description)\n'
            '- "due_date": string or null (format YYYY-MM-DD if found)\n'
            '- "estimated_duration_minutes": integer or null (estimated time to complete in minutes)\n'
            '- "category": string (one of: homework, project, exam, reading, other)\n\n'
            "OCR Text:\n"
            f"---\n{truncated}\n---\n\n"
            "JSON response:"
        )

        response = client.generate_content(prompt, request_options={"timeout": 45.0})

        if not response or not response.text:
            logger.warning("Gemini returned empty response for assignment parsing.")
            return _fallback_parse(truncated)

        # Extract JSON from response (handle markdown code blocks)
        raw_response = response.text.strip()
        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", raw_response, re.DOTALL)
        json_str = json_match.group(1).strip() if json_match else raw_response

        parsed = json.loads(json_str)

        return {
            "title": str(parsed.get("title") or "")[:255],
            "description": str(parsed.get("description") or ""),
            "due_date": _sanitize_date(parsed.get("due_date")),
            "estimated_duration_minutes": _sanitize_duration(
                parsed.get("estimated_duration_minutes")
            ),
            "category": _sanitize_category(parsed.get("category")),
        }

    except json.JSONDecodeError:
        logger.warning("Gemini response was not valid JSON for assignment parsing.")
        return _fallback_parse(truncated)
    except Exception as exc:
        logger.error(
            "Gemini assignment parsing failed: %s", exc, exc_info=True
        )
        return _fallback_parse(truncated)


def _fallback_parse(text):
    """Simple heuristic parse when Gemini is unavailable."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    title = ""
    for line in lines:
        if len(line) >= 3:
            title = line[:255]
            break
    if not title and lines:
        title = lines[0][:255]

    return {
        "title": title,
        "description": text,
        "due_date": None,
        "estimated_duration_minutes": None,
        "category": "other",
    }
