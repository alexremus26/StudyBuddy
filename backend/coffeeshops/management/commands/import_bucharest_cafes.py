import json
import os
import time
from urllib.request import Request, urlopen
from typing import List, Dict

from django.core.management.base import BaseCommand, CommandError
from coffeeshops.models import Location

API_URL = "https://places.googleapis.com/v1/places:searchNearby"

DEFAULT_CENTERS: List[Dict[str, float]] = [
    {"latitude": 44.4341, "longitude": 26.0400},
    {"latitude": 44.4220, "longitude": 26.0698},
    {"latitude": 44.4352, "longitude": 26.1028},
    {"latitude": 44.4174, "longitude": 26.1131},
    {"latitude": 44.4411, "longitude": 26.1363},
    {"latitude": 44.4609, "longitude": 26.0959},
]


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


def fetch_places_for_center(api_key: str, lat: float, lng: float, radius_m: int) -> List[dict]:
    body = {
        "includedTypes": ["cafe"],
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
    payload = post_json(API_URL, api_key, body, field_mask)
    places = payload.get("places", [])
    if not isinstance(places, list):
        raise CommandError(f"Unexpected Google response: {payload}")
    return places


class Command(BaseCommand):
    help = "Import cafes using a small set of centers (simple, deduped)."

    def add_arguments(self, parser):
        parser.add_argument("--min-rating", type=float, default=4.0)
        parser.add_argument("--limit", type=int, default=100, help="total unique places to persist")
        parser.add_argument("--radius", type=int, default=2000, help="meters per center (<=50000)")
        parser.add_argument("--sleep", type=float, default=0.5, help="seconds between API requests")
        parser.add_argument(
            "--centers-json",
            type=str,
            default="",
            help="optional path to JSON file with array of {latitude,longitude} centers. If omitted uses embedded defaults.",
        )

    def handle(self, *args, **options):
        api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
        if not api_key:
            raise CommandError("GOOGLE_PLACES_API_KEY is not set.")

        radius = int(options["radius"])
        limit = int(options["limit"])
        sleep_s = float(options["sleep"])

        if options["centers_json"]:
            try:
                with open(options["centers_json"], "r", encoding="utf-8") as fh:
                    centers = json.load(fh)
            except Exception as e:
                raise CommandError(f"Cannot read centers file: {e}")
        else:
            centers = DEFAULT_CENTERS

        self.stdout.write(f"Using {len(centers)} centers, radius={radius}m")

        collected = {}
        for i, c in enumerate(centers, start=1):
            lat = c["latitude"]
            lng = c["longitude"]
            self.stdout.write(f"[{i}/{len(centers)}] fetching {lat:.6f},{lng:.6f}")
            try:
                places = fetch_places_for_center(api_key, lat, lng, radius)
            except CommandError as e:
                self.stdout.write(self.style.WARNING(f"center failed: {e}"))
                time.sleep(sleep_s)
                continue

            for p in places:
                pid = p.get("id")
                if not pid:
                    continue
                cur = collected.get(pid)
                rating = float(p.get("rating") or 0)
                count = int(p.get("userRatingCount") or 0)
                if cur:
                    cr = float(cur.get("rating") or 0)
                    cc = int(cur.get("userRatingCount") or 0)
                    if (rating, count) > (cr, cc):
                        collected[pid] = p
                else:
                    collected[pid] = p

            time.sleep(sleep_s)

        self.stdout.write(f"Collected {len(collected)} unique places")

        places_sorted = sorted(
            collected.values(),
            key=lambda it: (float(it.get("rating") or 0), int(it.get("userRatingCount") or 0)),
            reverse=True,
        )[:limit]

        created = 0
        updated = 0
        for place in places_sorted:
            if float(place.get("rating") or 0) < options["min_rating"]:
                continue
            pid = place.get("id")
            loc = place.get("location") or {}
            lat = loc.get("latitude")
            lng = loc.get("longitude")
            if lat is None or lng is None:
                continue
            display = place.get("displayName") or {}
            defaults = {
                "name": display.get("text", "") if isinstance(display, dict) else "",
                "address": place.get("formattedAddress", "") or "",
                "coordinates": {"latitude": lat, "longitude": lng},
            }
            obj, was_created = Location.objects.update_or_create(google_place_id=pid, defaults=defaults)
            created += int(was_created)
            updated += int(not was_created)
            self.stdout.write(self.style.SUCCESS(f"{'Created' if was_created else 'Updated'} {obj.name} ({pid})"))

        self.stdout.write(self.style.SUCCESS(f"Done. created={created} updated={updated} total={created+updated}"))