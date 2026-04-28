from datetime import date, timedelta
from django.utils import timezone
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from app.models import Assignment, SchoolClass, TaskBlock
from schedule.models import GeneratedPlan, DraftTaskBlock

class PlannerApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="test_planner", password="password")
        self.client.force_authenticate(user=self.user)
        
        # Uncategorized assignments
        self.assignment1 = Assignment.objects.create(
            user=self.user,
            title="Read chapter 5",
            estimated_duration_minutes=60,
        )
        self.assignment2 = Assignment.objects.create(
            user=self.user,
            title="Math Exam prep",
            estimated_duration_minutes=120,
        )
        
        # School class on Monday
        self.school_class = SchoolClass.objects.create(
            user=self.user,
            name="History",
            day_of_week=0, # Monday
            start_time="14:00:00",
            end_time="16:00:00"
        )
        
    def test_planner_generation_categorization_and_draft_creation(self):
        start_date = date.today()
        end_date = start_date + timedelta(days=7)
        
        payload = {
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d")
        }
        
        response = self.client.post(reverse("planner-generate"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify categorisation
        self.assignment1.refresh_from_db()
        self.assignment2.refresh_from_db()
        
        self.assertEqual(self.assignment1.category, Assignment.CATEGORY_READING)
        self.assertEqual(self.assignment1.priority, Assignment.PRIORITY_LOW)
        self.assertEqual(self.assignment2.category, Assignment.CATEGORY_EXAM)
        self.assertEqual(self.assignment2.priority, Assignment.PRIORITY_HIGH)
        
        # Verify plan draft
        plan = GeneratedPlan.objects.get(user=self.user)
        self.assertEqual(plan.status, GeneratedPlan.STATUS_DRAFT)
        
        # Verify draft blocks (2 blocks generated)
        draft_blocks = plan.draft_blocks.all()
        self.assertEqual(draft_blocks.count(), 2)
        
    def test_planner_drafts_list(self):
        plan = GeneratedPlan.objects.create(
            user=self.user,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=7)
        )
        response = self.client.get(reverse("planner-drafts"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], plan.id)
        
    def test_planner_approval_flow(self):
        plan = GeneratedPlan.objects.create(
            user=self.user,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=7)
        )
        DraftTaskBlock.objects.create(
            plan=plan,
            assignment=self.assignment1,
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1)
        )
        
        response = self.client.post(reverse("planner-approve", kwargs={"pk": plan.id}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        plan.refresh_from_db()
        self.assertEqual(plan.status, GeneratedPlan.STATUS_APPROVED)
        
        # Verify task blocks converted
        self.assertEqual(TaskBlock.objects.filter(user=self.user).count(), 1)
        
        # Verify cannot approve twice
        response = self.client.post(reverse("planner-approve", kwargs={"pk": plan.id}))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
