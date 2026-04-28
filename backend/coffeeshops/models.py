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
		self.overall_rating = (
			self.laptop_friendly
			+ self.study_friendly
			+ self.overall_corwdness
			+ self.noise_level
		) / 4
		self.save(update_fields=["overall_rating"])
		return self.overall_rating

	def apply_profile(
		self,
		ai_description: str,
		laptop_friendly: float,
		study_friendly: float,
		overall_crowdness: float,
		noise_level: float,
		overall_rating: float,
	) -> bool:
		ratings = {
			"laptop_friendly": laptop_friendly,
			"study_friendly": study_friendly,
			"overall_corwdness": overall_crowdness,
			"noise_level": noise_level,
			"overall_rating": overall_rating,
		}

		for field_name, rating in ratings.items():
			if not 0 <= float(rating) <= 5:
				print(f"Invalid rating for {field_name}: {rating}. Must be between 0 and 5.")
				return False

		self.AIdescription = ai_description
		self.laptop_friendly = float(laptop_friendly)
		self.study_friendly = float(study_friendly)
		self.overall_corwdness = float(overall_crowdness)
		self.noise_level = float(noise_level)
		self.overall_rating = float(overall_rating)
		self.save()
		return True

	def __str__(self):
		return f"Aggregate Profile (Overall: {self.overall_rating:.1f})"
