from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    
    timezone = models.CharField(max_length=50, default='UTC', help_text="Crucial for a planner app!")
    total_study_hours = models.PositiveIntegerField(default=0)
    current_streak = models.PositiveIntegerField(default=0)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)

    def __str__(self):
        return self.user.username


class Assignment(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='assignments')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    estimated_duration_minutes = models.PositiveIntegerField(default=60)
    is_completed = models.BooleanField(default=False)
    due_date = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'app_task'

    def __str__(self):
        return self.title


class SchoolClass(models.Model):
    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4
    SATURDAY = 5
    SUNDAY = 6

    DAY_OF_WEEK_CHOICES = [
        (MONDAY, "Monday"),
        (TUESDAY, "Tuesday"),
        (WEDNESDAY, "Wednesday"),
        (THURSDAY, "Thursday"),
        (FRIDAY, "Friday"),
        (SATURDAY, "Saturday"),
        (SUNDAY, "Sunday"),
    ]

    CLASS_TYPE_COURSE = "course"
    CLASS_TYPE_SEMINAR = "seminar"
    CLASS_TYPE_LAB = "lab"
    CLASS_TYPE_WORKSHOP = "workshop"
    CLASS_TYPE_TUTORIAL = "tutorial"

    CLASS_TYPE_CHOICES = [
        (CLASS_TYPE_COURSE, "Course"),
        (CLASS_TYPE_SEMINAR, "Seminar"),
        (CLASS_TYPE_LAB, "Lab"),
        (CLASS_TYPE_WORKSHOP, "Workshop"),
        (CLASS_TYPE_TUTORIAL, "Tutorial"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='school_classes')
    name = models.CharField(max_length=255)
    class_type = models.CharField(max_length=20, choices=CLASS_TYPE_CHOICES, default=CLASS_TYPE_COURSE)
    day_of_week = models.PositiveSmallIntegerField(choices=DAY_OF_WEEK_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()
    location = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.get_day_of_week_display()})"

class TaskBlock(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='task_blocks')
    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.CASCADE,
        related_name='scheduled_blocks',
        db_column='task_id',
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    actual_duration_minutes = models.PositiveIntegerField(blank=True, null=True, help_text="How long did it actually take?")
    completed = models.BooleanField(default=False)

    class Meta:
        db_table = 'app_taskblock'

class Achievement(models.Model):
    name = models.CharField(max_length=50)
    description = models.CharField(max_length=255)
    rarity = models.IntegerField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    points_awarded = models.PositiveIntegerField(default=10)
    icon = models.ImageField(upload_to='achievement_icons/', blank=True, null=True)

class UserAchievement(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='achievements')
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE, related_name='earned_by')
    earned_at = models.DateTimeField(auto_now_add=True)

class Location(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=255, blank=True)
    has_wifi = models.BooleanField(default=True)
    has_outlets = models.BooleanField(default=True)
    is_quiet = models.BooleanField(default=False)

class UserFavPlace(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='favorite_places')
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='favorited_by')
    saved_at = models.DateTimeField(auto_now_add=True)
    custom_note = models.CharField(max_length=100, blank=True, help_text="e.g., 'Best coffee, terrible chairs'")

class UserReview(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviews')
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='reviews')
    rating = models.IntegerField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=0)
    comment = models.TextField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class AIAggregateProfile(models.Model):
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='aggregate_profiles')
    AIdescription = models.TextField(max_length=255, blank=True, null=True)
    laptop_friendly = models.IntegerField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
    study_friendly = models.IntegerField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
    overall_corwdness = models.IntegerField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
    noise_level = models.IntegerField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
    overall_rating = models.IntegerField(validators=[MinValueValidator(0), MaxValueValidator(5)], default=2.5)
    created_at = models.DateTimeField(auto_now_add=True)

    def update_overall_rating(self):
        total = self.laptop_friendly + self.study_friendly + self.overall_corwdness + self.noise_level + self.overall_rating
        self.overall_rating = total / 5
        self.save()

    def apply_profile(self, ai_description: str, laptop_friendly: int, study_friendly: int, crowdness: int, noise_level: int) -> bool:
        self.AIdescription = ai_description

        for rating, name in [(laptop_friendly, "Laptop Friendly"), (study_friendly, "Study Friendly"), (crowdness, "Overall Crowdness"), (noise_level, "Noise Level")]:
            if 0 <= rating <= 5:
                setattr(self, name.lower().replace(" ", "_"), rating)
            else:
                print(f"Invalid rating for {name}: {rating}. Must be between 0 and 5.")
                return False

        self.update_overall_rating()
        return True


    def __str__(self):
        return f"Aggregate Profile (Overall: {self.overall_rating:.1f})"