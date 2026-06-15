import json
import time
from typing import Dict, List

from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError

from coffeeshops.models import Location
from coffeeshops.services.apify_places import (
	DEFAULT_SEARCH_TERMS,
	ApifyPlacesError,
	fetch_places_for_center,
)


DEFAULT_CENTERS: List[Dict[str, float]] = [
	{"latitude": 44.4341, "longitude": 26.0400},
	{"latitude": 44.4220, "longitude": 26.0698},
	{"latitude": 44.4352, "longitude": 26.1028},
	{"latitude": 44.4174, "longitude": 26.1131},
	{"latitude": 44.4411, "longitude": 26.1363},
	{"latitude": 44.4609, "longitude": 26.0959},
	{"latitude": 44.4364, "longitude": 26.0983},
	{"latitude": 44.4424, "longitude": 26.1060},
	{"latitude": 44.4669, "longitude": 26.0904},
	{"latitude": 44.4889, "longitude": 26.1000},
	{"latitude": 44.4592, "longitude": 26.0514},
]


class Command(BaseCommand):
	help = "Import cafes around Bucharest centers using Apify Google Maps Scraper."

	def add_arguments(self, parser):
		parser.add_argument("--min-rating", type=float, default=4.0)
		parser.add_argument("--limit", type=int, default=100, help="total unique places to persist")
		parser.add_argument("--radius-km", type=float, default=2.0, help="kilometers around each center")
		parser.add_argument(
			"--max-per-search",
			type=int,
			default=20,
			help="maximum places Apify should crawl per search term for each center",
		)
		parser.add_argument("--sleep", type=float, default=0.5, help="seconds between Apify runs")
		parser.add_argument("--language", type=str, default="en")
		parser.add_argument(
			"--search-term",
			action="append",
			dest="search_terms",
			default=[],
			help="search term to send to Apify; can be provided multiple times",
		)
		parser.add_argument(
			"--centers-json",
			type=str,
			default="",
			help="optional path to JSON file with array of {latitude,longitude} centers. If omitted uses embedded defaults.",
		)

	def handle(self, *args, **options):
		radius_km = float(options["radius_km"])
		limit = int(options["limit"])
		sleep_s = float(options["sleep"])
		search_terms = options["search_terms"] or DEFAULT_SEARCH_TERMS

		if options["centers_json"]:
			try:
				with open(options["centers_json"], "r", encoding="utf-8") as fh:
					centers = json.load(fh)
			except Exception as exc:
				raise CommandError(f"Cannot read centers file: {exc}") from exc
		else:
			centers: List[Dict[str, float]] = DEFAULT_CENTERS

		self.stdout.write(
			f"Using {len(centers)} centers, radius={radius_km:g}km, search_terms={search_terms}"
		)

		collected = {}
		for i, center in enumerate(centers, start=1):
			lat = center["latitude"]
			lng = center["longitude"]
			self.stdout.write(f"[{i}/{len(centers)}] fetching {lat:.6f},{lng:.6f}")

			try:
				places = fetch_places_for_center(
					lat=lat,
					lng=lng,
					radius_km=radius_km,
					search_terms=search_terms,
					max_crawled_places_per_search=int(options["max_per_search"]),
					language=options["language"],
				)
			except ApifyPlacesError as exc:
				self.stdout.write(self.style.WARNING(f"center failed: {exc}"))
				time.sleep(sleep_s)
				continue

			for place in places:
				pid = place.get("id")
				if not pid:
					continue

				current = collected.get(pid)
				rating = float(place.get("rating") or 0)
				count = int(place.get("userRatingCount") or 0)
				if current:
					current_rating = float(current.get("rating") or 0)
					current_count = int(current.get("userRatingCount") or 0)
					if (rating, count) > (current_rating, current_count):
						collected[pid] = place
				else:
					collected[pid] = place

			time.sleep(sleep_s)

		self.stdout.write(f"Collected {len(collected)} unique places")

		places_sorted = sorted(
			collected.values(),
			key=lambda item: (float(item.get("rating") or 0), int(item.get("userRatingCount") or 0)),
			reverse=True,
		)[:limit]

		created = 0
		updated = 0
		skipped = 0
		for place in places_sorted:
			if float(place.get("rating") or 0) < options["min_rating"]:
				skipped += 1
				continue

			pid = place.get("id")
			location = place.get("location") or {}
			lat = location.get("latitude")
			lng = location.get("longitude")
			if lat is None or lng is None:
				skipped += 1
				continue

			display = place.get("displayName") or {}
			defaults = {
				"name": display.get("text", "") if isinstance(display, dict) else "",
				"address": place.get("formattedAddress", "") or "",
				"coordinates": Point(float(lng), float(lat), srid=4326),
			}
			obj, was_created = Location.objects.update_or_create(google_place_id=pid, defaults=defaults)
			created += int(was_created)
			updated += int(not was_created)
			self.stdout.write(self.style.SUCCESS(f"{'Created' if was_created else 'Updated'} {obj.name} ({pid})"))

		self.stdout.write(
			self.style.SUCCESS(
				f"Done. created={created} updated={updated} skipped={skipped} total={created + updated}"
			)
		)
