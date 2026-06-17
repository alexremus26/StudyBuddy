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

	# BestTime fields
	besttime_venue_id = models.CharField(max_length=255, blank=True, null=True, db_index=True)
	besttime_live_busyness = models.IntegerField(null=True, blank=True)
	besttime_live_fetched_at = models.DateTimeField(null=True, blank=True)
	besttime_forecast_data = models.JSONField(null=True, blank=True)

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
	laptop_friendly = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=0)
	study_friendly = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=0)
	overall_corwdness = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=0)
	noise_level = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=0)
	overall_rating = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=0)
	comment = models.TextField(max_length=255, blank=True, null=True)
	created_at = models.DateTimeField(auto_now_add=True)

	def update_overall_rating(self, save: bool = True) -> float:
		self.overall_rating = round(
			self.study_friendly * 0.35
			+ self.noise_level * 0.35
			+ self.laptop_friendly * 0.25
			+ self.overall_corwdness * 0.05,
			1,
		)
		if save:
			self.save(update_fields=["overall_rating"])
		return self.overall_rating

	def save(self, *args, **kwargs):
		try:
			self.overall_rating = round(
				self.study_friendly * 0.35
				+ self.noise_level * 0.35
				+ self.laptop_friendly * 0.25
				+ self.overall_corwdness * 0.05,
				1,
			)
		except Exception:
			if not isinstance(self.overall_rating, (int, float)):
				self.overall_rating = 0
		return super().save(*args, **kwargs)

	class Meta:
		db_table = "app_userreview"


class AIAggregateProfile(models.Model):
	location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="aggregate_profiles")
	AIdescription = models.TextField(max_length=255, blank=True, null=True)
	laptop_friendly = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
	study_friendly = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
	noise_level = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
	overall_rating = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		db_table = "app_aiaggregateprofile"
	
	def update_overall_rating(self):
		self.overall_rating = round(
			self.study_friendly    * 0.40
			+ self.noise_level     * 0.35
			+ self.laptop_friendly * 0.25
		, 1)
		self.save(update_fields=["overall_rating"])
		return self.overall_rating

	def apply_profile(
		self,
		ai_description: str,
		laptop_friendly: float,
		study_friendly: float,
		noise_level: float,
	) -> bool:
		ratings = {
			"laptop_friendly": laptop_friendly,
			"study_friendly": study_friendly,
			"noise_level": noise_level,
		}

		for field_name, rating in ratings.items():
			if not 0 <= float(rating) <= 5:
				print(f"Invalid rating for {field_name}: {rating}. Must be between 0 and 5.")
				return False

		self.AIdescription = ai_description
		self.laptop_friendly = float(laptop_friendly)
		self.study_friendly = float(study_friendly)
		self.noise_level = float(noise_level)
		self.save()

		self.update_overall_rating()
		return True

	def __str__(self):
		return f"Aggregate Profile (Overall: {self.overall_rating:.1f})"


class AIProfileGenerationJob(models.Model):
	STATUS_QUEUED = "queued"
	STATUS_FETCHING_REVIEWS = "fetching_reviews"
	STATUS_SCORING = "scoring"
	STATUS_DONE = "done"
	STATUS_FAILED = "failed"

	ACTIVE_STATUSES = {
		STATUS_QUEUED,
		STATUS_FETCHING_REVIEWS,
		STATUS_SCORING,
	}

	STATUS_CHOICES = [
		(STATUS_QUEUED, "Queued"),
		(STATUS_FETCHING_REVIEWS, "Fetching reviews"),
		(STATUS_SCORING, "Scoring"),
		(STATUS_DONE, "Done"),
		(STATUS_FAILED, "Failed"),
	]

	location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="ai_generation_jobs")
	status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_QUEUED, db_index=True)
	process_task_id = models.CharField(max_length=255, blank=True)
	fetch_task_id = models.CharField(max_length=255, blank=True)
	score_task_id = models.CharField(max_length=255, blank=True)
	error = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = "app_aiprofilegenerationjob"
		indexes = [
			models.Index(fields=["location", "status"]),
			models.Index(fields=["updated_at"]),
		]
		ordering = ["-updated_at"]

	def mark_status(self, status: str, error: str = "", **task_ids):
		self.status = status
		self.error = error
		for field_name, value in task_ids.items():
			if value:
				setattr(self, field_name, value)
		update_fields = ["status", "error", "updated_at", *task_ids.keys()]
		self.save(update_fields=update_fields)
		return self


class BestTimeCrowdnessJob(models.Model):
	STATUS_QUEUED = "queued"
	STATUS_FETCHING = "fetching"
	STATUS_DONE = "done"
	STATUS_FAILED = "failed"

	ACTIVE_STATUSES = {
		STATUS_QUEUED,
		STATUS_FETCHING,
	}

	STATUS_CHOICES = [
		(STATUS_QUEUED, "Queued"),
		(STATUS_FETCHING, "Fetching BestTime data"),
		(STATUS_DONE, "Done"),
		(STATUS_FAILED, "Failed"),
	]

	location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="besttime_jobs")
	status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_QUEUED, db_index=True)
	task_id = models.CharField(max_length=255, blank=True)
	error = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = "app_besttimecrowdnessjob"
		indexes = [
			models.Index(fields=["location", "status"]),
			models.Index(fields=["updated_at"]),
		]
		ordering = ["-updated_at"]

	def mark_status(self, status: str, error: str = "", task_id: str = ""):
		self.status = status
		self.error = error
		if task_id:
			self.task_id = task_id
		update_fields = ["status", "error", "updated_at"]
		if task_id:
			update_fields.append("task_id")
		self.save(update_fields=update_fields)
		return self
