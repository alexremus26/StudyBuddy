from celery import shared_task
from django.db import transaction

from coffeeshops.models import AIAggregateProfile, Location
from coffeeshops.services.ai_profile_service import build_ai_profile_from_reviews
from coffeeshops.services.google_places import fetch_google_reviews


@shared_task(bind=True)
def process_location_profile_task(self, location_id: int) -> dict:
    location = Location.objects.get(id=location_id)

    reviews_payload = fetch_google_reviews(location.google_place_id, limit=5)
    profile_payload = build_ai_profile_from_reviews(location, reviews_payload)

    with transaction.atomic():
        profile, _ = AIAggregateProfile.objects.update_or_create(
            location=location,
            defaults={
                "AIdescription": profile_payload["AIdescription"],
                "laptop_friendly": profile_payload["laptop_friendly"],
                "study_friendly": profile_payload["study_friendly"],
                "overall_corwdness": profile_payload["overall_corwdness"],
                "noise_level": profile_payload["noise_level"],
                "overall_rating": profile_payload["overall_rating"],
            },
        )

    return {
        "location_id": location.id,
        "location_name": location.name,
        "profile_id": profile.id,
        "status": "done",
        "reviews": reviews_payload.get("reviews", []),
    }