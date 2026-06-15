"""
Apify-based Google Maps place discovery.

This replaces Google Places Nearby Search for importing cafes while still
returning Google Maps place IDs that the existing review pipeline can use.
"""

import logging

from django.conf import settings

try:
	from apify_client import ApifyClient
except ImportError:
	ApifyClient = None

logger = logging.getLogger(__name__)

DEFAULT_SEARCH_TERMS = ["coffee shop", "café", "study place", "library", "ted's", "tucano"]
DEFAULT_ACTOR_ID = "compass/crawler-google-places"
_RUN_TIMEOUT_SECS = 900


class ApifyPlacesError(RuntimeError):
	pass


def fetch_places_for_center(
	lat: float,
	lng: float,
	radius_km: float,
	search_terms: list[str] | None = None,
	max_crawled_places_per_search: int = 20,
	language: str = "en",
	actor_id: str | None = None,
) -> list[dict]:
	"""
	Discover Google Maps places around a coordinate using Apify.

	Returns a list normalized to the old Google Places import shape:
	``id``, ``displayName``, ``formattedAddress``, ``location``,
	``rating``, and ``userRatingCount``.
	"""
	api_token = getattr(settings, "APIFY_API_TOKEN", "").strip()
	if not api_token:
		raise ApifyPlacesError("APIFY_API_TOKEN is not set")

	if ApifyClient is None:
		raise ApifyPlacesError("apify-client is not installed")

	terms = [term.strip() for term in (search_terms or DEFAULT_SEARCH_TERMS) if term.strip()]
	if not terms:
		raise ApifyPlacesError("At least one search term is required")

	actor_id = (actor_id or getattr(settings, "APIFY_PLACES_ACTOR_ID", DEFAULT_ACTOR_ID)).strip()
	client = ApifyClient(api_token)
	run_input = _build_run_input(
		lat=lat,
		lng=lng,
		radius_km=radius_km,
		search_terms=terms,
		max_crawled_places_per_search=max_crawled_places_per_search,
		language=language,
	)

	try:
		logger.info(
			"Starting Apify place discovery actor %s for %.6f,%.6f radius=%.2fkm terms=%s",
			actor_id, lat, lng, radius_km, terms,
		)
		run = client.actor(actor_id).call(
			run_input=run_input,
			timeout_secs=_RUN_TIMEOUT_SECS,
		)
		dataset_items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
	except Exception as exc:
		logger.exception(
			"Apify place discovery failed for %.6f,%.6f: %s: %s",
			lat, lng, type(exc).__name__, exc,
		)
		raise ApifyPlacesError(str(exc)) from exc

	places = [_normalize_place(item) for item in dataset_items]
	return [place for place in places if place.get("id")]


def _build_run_input(
	lat: float,
	lng: float,
	radius_km: float,
	search_terms: list[str],
	max_crawled_places_per_search: int,
	language: str,
) -> dict:
	return {
		"searchStringsArray": search_terms,
		"maxCrawledPlacesPerSearch": int(max_crawled_places_per_search),
		"language": language,
		"customGeolocation": {
			"type": "Point",
			"coordinates": [float(lng), float(lat)],
			"radiusKm": float(radius_km),
		},
		"skipClosedPlaces": True,
		"maxReviews": 0,
		"maxImages": 0,
		"scrapePlaceDetailPage": False,
	}


def _normalize_place(item: dict) -> dict:
	location = item.get("location") or {}
	lat = location.get("lat", location.get("latitude", item.get("lat")))
	lng = location.get("lng", location.get("longitude", item.get("lng")))

	return {
		"id": item.get("placeId") or item.get("place_id") or item.get("id") or "",
		"displayName": {"text": item.get("title") or item.get("name") or ""},
		"formattedAddress": item.get("address") or "",
		"location": {
			"latitude": lat,
			"longitude": lng,
		},
		"rating": item.get("totalScore") or item.get("rating") or 0,
		"userRatingCount": item.get("reviewsCount") or item.get("userRatingCount") or 0,
		"source": "apify",
	}
