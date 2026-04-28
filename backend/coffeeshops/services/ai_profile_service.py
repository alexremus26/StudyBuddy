from coffeeshops.models import Location


def build_ai_profile_from_reviews(location: Location, reviews_payload: dict) -> dict:
	reviews = reviews_payload.get("reviews", [])
	combined_text = "\n".join(
		f"{review.get('author', '')}: {review.get('text', '')}"
		for review in reviews
		if review.get("text")
	)

	# Temporary deterministic placeholder until Gemini is added.
	# Replace this with Gemini output later.
	review_count = len(reviews)
	rating_boost = min(review_count, 5)

	return {
		"AIdescription": f"Auto-generated profile for {location.name}. Reviews analyzed: {review_count}.",
		"laptop_friendly": float(3 + rating_boost * 0.2),
		"study_friendly": float(3 + rating_boost * 0.2),
		"overall_corwdness": float(2 + rating_boost * 0.1),
		"noise_level": float(2 + rating_boost * 0.1),
		"overall_rating": float(3 + rating_boost * 0.2),
		"debug_reviews_text": combined_text,
	}
