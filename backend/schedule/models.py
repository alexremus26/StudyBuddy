from django.db import models
from django.contrib.auth.models import User
from app.models import Assignment

class GeneratedPlan(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_APPROVED = 'approved'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_APPROVED, 'Approved'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='generated_plans')
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)

class DraftTaskBlock(models.Model):
    plan = models.ForeignKey(GeneratedPlan, on_delete=models.CASCADE, related_name='draft_blocks')
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='draft_blocks')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
