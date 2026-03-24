from datetime import timedelta

from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from app.models import Task, TaskBlock


class ScheduleApiTests(APITestCase):
	def setUp(self):
		self.user_one = User.objects.create_user(
			username="alex", email="alex@example.com", password="ciscosecpa55"
		)
		self.user_two = User.objects.create_user(
			username="andrei", email="andrei@example.com", password="ciscosecpa55"
		)

		self.user_one_task = Task.objects.create(
			user=self.user_one,
			title="Alex task",
			description="Task for alex",
			estimated_duration_minutes=45,
		)
		self.user_two_task = Task.objects.create(
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
		created_task = Task.objects.get(title="New task")
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
		second_task = Task.objects.create(
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
