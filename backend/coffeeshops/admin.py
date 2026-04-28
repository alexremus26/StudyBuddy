from django.contrib import admin

from .models import AIAggregateProfile, Location, UserFavPlace, UserReview


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
	list_display = ('name', 'address', 'coordinates', 'status')
	search_fields = ('name', 'address')


@admin.register(UserFavPlace)
class UserFavPlaceAdmin(admin.ModelAdmin):
	list_display = ('user', 'location', 'saved_at')
	search_fields = ('user__username', 'location__name', 'custom_note')


@admin.register(UserReview)
class UserReviewAdmin(admin.ModelAdmin):
	list_display = ('user', 'location', 'rating', 'created_at')
	search_fields = ('user__username', 'location__name', 'comment')


@admin.register(AIAggregateProfile)
class AIAggregateProfileAdmin(admin.ModelAdmin):
	list_display = ('location', 'overall_rating', 'created_at')
	search_fields = ('location__name', 'AIdescription')
