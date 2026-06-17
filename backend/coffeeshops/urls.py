from django.urls import path

from . import views


urlpatterns = [
	path("locations/", views.location_map_list, name="location-map-list"),
	path("locations/<int:location_id>/reviews/", views.location_reviews, name="location-reviews"),
	path("locations/<int:location_id>/ai-profile-generation/", views.location_ai_profile_generation, name="location-ai-profile-generation"),
	path("locations/<int:location_id>/generate-ai-profile/", views.generate_location_ai_profile, name="generate-location-ai-profile"),
	path("locations/<int:location_id>/besttime-status/", views.location_besttime_status, name="location-besttime-status"),
	path("locations/<int:location_id>/generate-besttime/", views.generate_location_besttime_crowdness, name="generate-location-besttime"),
	path("locations/<int:location_id>/favorite/", views.location_favorite, name="location-favorite"),
	path("recommend/by-assignment/", views.ai_recommend_by_assignment, name="ai-recommend-by-assignment"),
	path("recommend/by-mood/", views.ai_recommend_by_mood, name="ai-recommend-by-mood"),
]
