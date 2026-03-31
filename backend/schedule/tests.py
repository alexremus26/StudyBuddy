from datetime import timedelta

from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from app.models import Assignment, TaskBlock


class ScheduleApiTests(APITestCase):
	def setUp(self):
		self.user_one = User.objects.create_user(
			username="alex", email="alex@example.com", password="ciscosecpa55"
		)
		self.user_two = User.objects.create_user(
			username="andrei", email="andrei@example.com", password="ciscosecpa55"
		)

		self.user_one_task = Assignment.objects.create(
			user=self.user_one,
			title="Alex task",
			description="Task for alex",
			estimated_duration_minutes=45,
		)
		self.user_two_task = Assignment.objects.create(
			user=self.user_two,
			title="Andrei task",
			description="Task for andrei",
			estimated_duration_minutes=30,
		)

	def test_tasks_list_requires_authentication(self):
		response = self.client.get(reverse("task-list-create"))
		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_task_blocks_list_requires_authentication(self):
		response = self.client.get(reverse("task-block-list-create"))
		self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_tasks_list_returns_only_authenticated_users_tasks(self):
		self.client.force_authenticate(user=self.user_one)

		response = self.client.get(reverse("task-list-create"))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(response.data), 1)
		self.assertEqual(response.data[0]["id"], self.user_one_task.id)
		self.assertEqual(response.data[0]["title"], "Alex task")

	def test_task_block_create_with_overlapping_times_fails(self):
		"""Prevent overlapping blocks for same user."""
		self.client.force_authenticate(user=self.user_one)
		start = timezone.now()
		end = start + timedelta(hours=1)

		# Create first block
		payload1 = {
			"task_id": self.user_one_task.id,
			"start_time": start.isoformat(),
			"end_time": end.isoformat(),
			"completed": False,
		}
		response = self.client.post(reverse("task-block-list-create"), payload1)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)

		# Try to create overlapping block
		payload2 = {
			"task_id": self.user_one_task.id,
			"start_time": start.isoformat(),
			"end_time": end.isoformat(),
			"completed": False,
		}
		response = self.client.post(reverse("task-block-list-create"), payload2)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("non_field_errors", response.data)

	def test_task_block_create_partial_overlap_fails(self):
		"""Prevent partially overlapping blocks."""
		self.client.force_authenticate(user=self.user_one)
		start = timezone.now()

		# Create: 10:00-11:00
		payload1 = {
			"task_id": self.user_one_task.id,
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=1)).isoformat(),
			"completed": False,
		}
		self.client.post(reverse("task-block-list-create"), payload1)

		# Try to create: 10:30-11:30 (overlaps by 30 min)
		payload2 = {
			"task_id": self.user_one_task.id,
			"start_time": (start + timedelta(minutes=30)).isoformat(),
			"end_time": (start + timedelta(hours=1, minutes=30)).isoformat(),
			"completed": False,
		}
		response = self.client.post(reverse("task-block-list-create"), payload2)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_task_block_different_users_can_have_overlapping_times(self):
		"""Different users can have blocks at same time."""
		self.client.force_authenticate(user=self.user_one)
		start = timezone.now()

		# User 1 creates block
		payload1 = {
			"task_id": self.user_one_task.id,
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=1)).isoformat(),
			"completed": False,
		}
		response1 = self.client.post(reverse("task-block-list-create"), payload1)
		self.assertEqual(response1.status_code, status.HTTP_201_CREATED)

		# User 2 can create at same time
		self.client.force_authenticate(user=self.user_two)
		payload2 = {
			"task_id": self.user_two_task.id,
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=1)).isoformat(),
			"completed": False,
		}
		response2 = self.client.post(reverse("task-block-list-create"), payload2)
		self.assertEqual(response2.status_code, status.HTTP_201_CREATED)

	def test_task_block_task_ownership_defense_in_depth(self):
		"""Ensure task belongs to user even if queryset filtering passes."""
		self.client.force_authenticate(user=self.user_one)
		start = timezone.now()

		# Try to create block with user_two's task (malicious request)
		payload = {
			"task_id": self.user_two_task.id,
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=1)).isoformat(),
			"completed": False,
		}
		response = self.client.post(reverse("task-block-list-create"), payload)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("task_id", response.data)

	def test_task_block_negative_duration_fails(self):
		"""Reject negative actual_duration_minutes."""
		self.client.force_authenticate(user=self.user_one)
		start = timezone.now()

		payload = {
			"task_id": self.user_one_task.id,
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=1)).isoformat(),
			"actual_duration_minutes": -10,
			"completed": False,
		}
		response = self.client.post(reverse("task-block-list-create"), payload)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("actual_duration_minutes", response.data)

	def test_task_block_duration_exceeds_max_fails(self):
		"""Reject duration > 24 hours (1440 minutes)."""
		self.client.force_authenticate(user=self.user_one)
		start = timezone.now()

		payload = {
			"task_id": self.user_one_task.id,
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=1)).isoformat(),
			"actual_duration_minutes": 2000,  # > 24 hours
			"completed": False,
		}
		response = self.client.post(reverse("task-block-list-create"), payload)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("actual_duration_minutes", response.data)

	def test_task_block_with_timezone_aware_datetime_succeeds(self):
		"""Timezone-aware datetimes are always accepted."""
		self.client.force_authenticate(user=self.user_one)

		# Explicitly timezone-aware (with Z for UTC)
		start = timezone.now()
		payload = {
			"task_id": self.user_one_task.id,
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=1)).isoformat(),
			"completed": False,
		}
		response = self.client.post(reverse("task-block-list-create"), payload)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		# Verify stored data has timezone info
		self.assertIsNotNone(response.data["start_time"])
		self.assertIn("T", response.data["start_time"])

	def test_task_block_bulk_create_with_duplicate_task_ids_fails(self):
		"""Reject duplicate task IDs in bulk create."""
		self.client.force_authenticate(user=self.user_one)
		start = timezone.now()

		payload = {
			"task_ids": [
				self.user_one_task.id,
				self.user_one_task.id,
			],
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=1)).isoformat(),
			"completed": False,
		}
		response = self.client.post(reverse("task-block-bulk-create"), payload)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_task_block_bulk_create_exceeds_max_tasks_fails(self):
		"""Reject bulk create > 100 tasks."""
		self.client.force_authenticate(user=self.user_one)
		start = timezone.now()

		task_ids = []
		for i in range(101):
			task = Assignment.objects.create(
				user=self.user_one,
				title=f"Task {i}",
				estimated_duration_minutes=30,
			)
			task_ids.append(task.id)

		payload = {
			"task_ids": task_ids,
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=1)).isoformat(),
			"completed": False,
		}
		response = self.client.post(reverse("task-block-bulk-create"), payload)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_task_block_bulk_create_success(self):
		"""Bulk create multiple blocks with valid data."""
		self.client.force_authenticate(user=self.user_one)
		start = timezone.now()

		task2 = Assignment.objects.create(
			user=self.user_one, title="Task 2", estimated_duration_minutes=30
		)
		task3 = Assignment.objects.create(
			user=self.user_one, title="Task 3", estimated_duration_minutes=30
		)

		payload = {
			"task_ids": [self.user_one_task.id, task2.id, task3.id],
			"start_time": start.isoformat(),
			"end_time": (start + timedelta(hours=2)).isoformat(),
			"completed": False,
		}
		response = self.client.post(reverse("task-block-bulk-create"), payload)
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(len(response.data), 3)

	def test_task_detail_returns_404_for_other_users_task(self):
		self.client.force_authenticate(user=self.user_one)

		response = self.client.get(
			reverse("task-detail", kwargs={"pk": self.user_two_task.pk})
		)

		self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

	def test_create_task_assigns_authenticated_user(self):
		self.client.force_authenticate(user=self.user_one)
		payload = {
			"title": "New task",
			"description": "Created from API",
			"estimated_duration_minutes": 60,
			"due_date": (timezone.now() + timedelta(days=1)).isoformat(),
		}

		response = self.client.post(reverse("task-list-create"), payload, format="json")

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		created_task = Assignment.objects.get(title="New task")
		self.assertEqual(created_task.user, self.user_one)

	def test_create_task_block_rejects_task_owned_by_another_user(self):
		self.client.force_authenticate(user=self.user_one)
		start_time = timezone.now() + timedelta(hours=1)
		end_time = start_time + timedelta(hours=1)
		payload = {
			"task_id": self.user_two_task.id,
			"start_time": start_time.isoformat(),
			"end_time": end_time.isoformat(),
			"completed": False,
		}

		response = self.client.post(
			reverse("task-block-list-create"), payload, format="json"
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(TaskBlock.objects.count(), 0)

	def test_bulk_create_task_blocks_creates_for_authenticated_users_tasks_only(self):
		self.client.force_authenticate(user=self.user_one)
		second_task = Assignment.objects.create(
			user=self.user_one,
			title="Second alex task",
			estimated_duration_minutes=25,
		)

		start_time = timezone.now() + timedelta(days=1)
		end_time = start_time + timedelta(minutes=90)
		payload = {
			"task_ids": [self.user_one_task.id, second_task.id],
			"start_time": start_time.isoformat(),
			"end_time": end_time.isoformat(),
			"completed": False,
		}

		response = self.client.post(
			reverse("task-block-bulk-create"), payload, format="json"
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(TaskBlock.objects.filter(user=self.user_one).count(), 2)
