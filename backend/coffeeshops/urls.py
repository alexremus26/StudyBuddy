from django.urls import path

from . import views


urlpatterns = [
	path("locations/", views.location_map_list, name="location-map-list"),
]
