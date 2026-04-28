import json
import logging
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)


def fetch_google_reviews(google_place_id: str, limit: int = 5) -> dict:
	api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
	if not api_key:
		return {
			"google_place_id": google_place_id,
			"status": "error",
			"error": "GOOGLE_PLACES_API_KEY is not set",
			"reviews": [],
		}

	url = f"https://places.googleapis.com/v1/places/{google_place_id}"
	field_mask = ",".join(
		[
			"id",
			"displayName",
			"formattedAddress",
			"reviews",
		]
	)

	req = Request(
		url=url,
		method="GET",
		headers={
			"Content-Type": "application/json",
			"X-Goog-Api-Key": api_key,
			"X-Goog-FieldMask": field_mask,
		},
	)

	try:
		with urlopen(req, timeout=30) as resp:
			payload = json.loads(resp.read().decode("utf-8"))
	except HTTPError as exc:
		body = exc.read().decode("utf-8", errors="ignore")
		return {
			"google_place_id": google_place_id,
			"status": "error",
			"error": f"HTTPError {exc.code}: {body}",
			"reviews": [],
		}
	except URLError as exc:
		return {
			"google_place_id": google_place_id,
			"status": "error",
			"error": f"URLError: {exc}",
			"reviews": [],
		}

	reviews = payload.get("reviews", []) or []
	normalized = []

	for review in reviews[:limit]:
		normalized.append(
			{
				"author": (review.get("authorAttribution") or {}).get("displayName", ""),
				"rating": review.get("rating"),
				"relative_time": review.get("relativePublishTimeDescription", ""),
				"text": (review.get("text") or {}).get("text", ""),
			}
		)

	logger.info("Fetched %s reviews for %s", len(normalized), google_place_id)

	return {
		"google_place_id": google_place_id,
		"place_name": (payload.get("displayName") or {}).get("text", ""),
		"status": "ok",
		"reviews_count": len(normalized),
		"reviews": normalized,
	}


def post_json(url: str, api_key: str, payload: dict, field_mask: str) -> dict:
	data = json.dumps(payload).encode("utf-8")
	req = Request(
		url,
		data=data,
		method="POST",
		headers={
			"Content-Type": "application/json",
			"X-Goog-Api-Key": api_key,
			"X-Goog-FieldMask": field_mask,
		},
	)
	with urlopen(req, timeout=30) as resp:
		return json.loads(resp.read().decode("utf-8"))


def fetch_places_for_center(api_key: str, lat: float, lng: float, radius_m: int) -> list:
	body = {
		"includedTypes": ["coffee_shop"],
		"maxResultCount": 20,
		"rankPreference": "POPULARITY",
		"locationRestriction": {
			"circle": {
				"center": {"latitude": float(lat), "longitude": float(lng)},
				"radius": float(radius_m),
			}
		},
	}
	field_mask = ",".join(
		[
			"places.id",
			"places.displayName",
			"places.formattedAddress",
			"places.location",
			"places.rating",
			"places.userRatingCount",
		]
	)
	payload = post_json("https://places.googleapis.com/v1/places:searchNearby", api_key, body, field_mask)
	places = payload.get("places", [])
	if not isinstance(places, list):
		raise RuntimeError(f"Unexpected Google response: {payload}")
	return places
