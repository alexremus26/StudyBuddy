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
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='scheduled_blocks')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    actual_duration_minutes = models.PositiveIntegerField(blank=True, null=True, help_text="How long did it actually take?")
    completed = models.BooleanField(default=False)

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
    name = models.CharField(max_length=100)
    description = models.TextField()
    address = models.CharField(max_length=255, blank=True)
    has_wifi = models.BooleanField(default=True)
    has_outlets = models.BooleanField(default=True)
    is_quiet = models.BooleanField(default=False)

class UserFavPlace(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='favorite_places')
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='favorited_by')
    saved_at = models.DateTimeField(auto_now_add=True)
    custom_note = models.CharField(max_length=100, blank=True, help_text="e.g., 'Best coffee, terrible chairs'")

class Review(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviews')
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='reviews')
    rating = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)