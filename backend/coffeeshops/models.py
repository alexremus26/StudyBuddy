from django.contrib.auth.models import User
from django.contrib.gis.db import models as gis_models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models


class Location(models.Model):
	Pending = 0
	Done = 1

	STATUS_CHOICES = [
		(Pending, "Pending"),
		(Done, "Done"),
	]

	google_place_id = models.CharField(max_length=255, unique=True, db_index=True)
	name = models.CharField(max_length=100)
	address = models.CharField(max_length=255, blank=True)
	coordinates = gis_models.PointField(null=True, blank=True, srid=4326)
	status = models.CharField(max_length=8, choices=STATUS_CHOICES, default=Pending)

	class Meta:
		db_table = "app_location"


class UserFavPlace(models.Model):
	user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="favorite_places")
	location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="favorited_by")
	saved_at = models.DateTimeField(auto_now_add=True)
	custom_note = models.CharField(
		max_length=100,
		blank=True,
		help_text="e.g., 'Best coffee, terrible chairs'",
	)

	class Meta:
		db_table = "app_userfavplace"


class UserReview(models.Model):
	user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reviews")
	location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="reviews")
	rating = models.IntegerField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=0)
	comment = models.TextField(max_length=255, blank=True, null=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		db_table = "app_userreview"


class AIAggregateProfile(models.Model):
	location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="aggregate_profiles")
	AIdescription = models.TextField(max_length=255, blank=True, null=True)
	laptop_friendly = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
	study_friendly = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
	overall_corwdness = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
	noise_level = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
	overall_rating = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		db_table = "app_aiaggregateprofile"

	def update_overall_rating(self):
		total = (
			self.laptop_friendly
			+ self.study_friendly
			+ self.overall_corwdness
			+ self.noise_level
			+ self.overall_rating
		)
		self.overall_rating = total / 5
		self.save()

	def apply_profile(
		self,
		ai_description: str,
		laptop_friendly: int,
		study_friendly: int,
		crowdness: int,
		noise_level: int,
	) -> bool:
		self.AIdescription = ai_description

		for rating, name in [
			(laptop_friendly, "Laptop Friendly"),
			(study_friendly, "Study Friendly"),
			(crowdness, "Overall Crowdness"),
			(noise_level, "Noise Level"),
		]:
			if 0 <= rating <= 5:
				setattr(self, name.lower().replace(" ", "_"), rating)
			else:
				print(f"Invalid rating for {name}: {rating}. Must be between 0 and 5.")
				return False

		self.update_overall_rating()
		return True

	def __str__(self):
		return f"Aggregate Profile (Overall: {self.overall_rating:.1f})"
