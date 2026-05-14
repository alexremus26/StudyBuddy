from django.urls import path

from . import views


urlpatterns = [
	path("locations/", views.location_map_list, name="location-map-list"),
	path("locations/<int:location_id>/reviews/", views.location_reviews, name="location-reviews"),
	path("locations/<int:location_id>/favorite/", views.location_favorite, name="location-favorite"),
]
