from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from app.models import UserProfile, Assignment
from django.core.files.uploadedfile import SimpleUploadedFile
from io import BytesIO
from PIL import Image

# Create your tests here.

class AuthFlowTests(APITestCase):
    def test_register_returns_token(self):
        payload = {
            "username": "test_register_1",
            "email": "test_register_1@example.com",
            "password": "studybuddy123",
        }
        response = self.client.post("/api/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", response.data)
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["username"], payload["username"])

    def test_me_requires_auth(self):
        response = self.client.get("/me/", format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_profile_with_token(self):
        payload = {
            "username": "test_register_2",
            "email": "test_register_2@example.com",
            "password": "studybuddy123",
        }
        response = self.client.post("/api/register/", payload, format="json")
        token = response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

        response = self.client.get("/me/", format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], payload["username"])

    def test_me_profile_put_update_timezone(self):
        payload = {
            "username": "test_register_3",
            "email": "test_register_3@example.com",
            "password": "studybuddy123",
        }
        response = self.client.post("/api/register/", payload, format="json")
        token = response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

        put_payload = {
            "timezone": "Europe/Bucharest"
        }

        put_response = self.client.put("/me/profile/", put_payload, format="json")

        self.assertEqual(put_response.status_code, status.HTTP_200_OK)
        self.assertEqual(put_response.data["timezone"], "Europe/Bucharest")

        user = User.objects.get(username="test_register_3")
        profile = UserProfile.objects.get(user=user)
        self.assertEqual(profile.timezone, "Europe/Bucharest")

    def test_me_profile_put_update_avatar(self):
        payload = {
            "username": "test_register_4",
            "email": "test_register_4@example.com",
            "password": "studybuddy123",
        }
        response = self.client.post("/api/register/", payload, format="json")
        token = response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

        image_buffer = BytesIO()
        Image.new("RGB", (1, 1), color=(255, 0, 0)).save(image_buffer, format="PNG")
        image = SimpleUploadedFile(
            "avatar.png",
            image_buffer.getvalue(),
            content_type="image/png",
        )

        put_response = self.client.put(
            "/me/profile/",
            {"avatar": image},
            format="multipart",
        )

        self.assertEqual(put_response.status_code, status.HTTP_200_OK)
        self.assertIn("avatar", put_response.data)

        user = User.objects.get(username="test_register_4")
        profile = UserProfile.objects.get(user=user)
        self.assertTrue(profile.avatar.name.startswith("avatars/"))
        self.assertTrue(profile.avatar.name.endswith(".png"))

    def test_register_reserved_username_fails(self):
        """Reject reserved usernames like 'admin', 'root', etc."""
        reserved_names = ["admin", "root", "me", "api", "support", "system"]
        
        for name in reserved_names:
            payload = {
                "username": name,
                "email": f"{name}@example.com",
                "password": "studybuddy123",
            }
            response = self.client.post("/api/register/", payload, format="json")
            self.assertEqual(
                response.status_code,
                status.HTTP_400_BAD_REQUEST,
                f"Reserved username '{name}' should be rejected",
            )
            self.assertIn("username", response.data)

    def test_register_case_insensitive_username_duplicate_fails(self):
        """Reject duplicate usernames regardless of case."""
        User.objects.create_user(
            username="lowercaseuser",
            email="lowercaseuser@example.com",
            password="studybuddy123",
        )

        payload = {
            "username": "LOWERCASEUSER",
            "email": "uppercase@example.com",
            "password": "studybuddy123",
        }
        response = self.client.post("/api/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_register_case_insensitive_email_duplicate_fails(self):
        """Reject duplicate emails regardless of case."""
        User.objects.create_user(
            username="testuser1",
            email="lowercase@example.com",
            password="studybuddy123",
        )

        payload = {
            "username": "testuser2",
            "email": "LOWERCASE@EXAMPLE.COM",
            "password": "studybuddy123",
        }
        response = self.client.post("/api/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_blank_username_fails(self):
        """Reject blank/whitespace-only usernames."""
        payload = {
            "username": "   ",  # Only whitespace
            "email": "blankuser@example.com",
            "password": "studybuddy123",
        }
        response = self.client.post("/api/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_weak_password_fails(self):
        """Reject weak passwords (use Django validators)."""
        weak_passwords = [
            "123456",
            "password",
            "test",
            "aaaaaaaaa",
        ]

        for weak_pass in weak_passwords:
            payload = {
                "username": f"testuser_{weak_passwords.index(weak_pass)}",
                "email": f"test_{weak_passwords.index(weak_pass)}@example.com",
                "password": weak_pass,
            }
            response = self.client.post("/api/register/", payload, format="json")
            self.assertEqual(
                response.status_code,
                status.HTTP_400_BAD_REQUEST,
                f"Weak password '{weak_pass}' should be rejected",
            )
            self.assertIn("password", response.data)

    def test_register_strong_password_succeeds(self):
        """Accept strong passwords meeting all validator criteria."""
        payload = {
            "username": "strongpassuser",
            "email": "strongpass@example.com",
            "password": "MyStr0ng!Pass2024",
        }
        response = self.client.post("/api/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="strongpassuser").exists())

    def test_register_password_validation_error_messages(self):
        """Ensure password validation errors are descriptive."""
        payload = {
            "username": "weakpass",
            "email": "weakpass@example.com",
            "password": "password",
        }
        response = self.client.post("/api/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertIsInstance(response.data["password"], list)
        self.assertGreater(len(response.data["password"]), 0)

    def test_register_email_trimmed_and_lowercased(self):
        """Email should be trimmed and lowercased for uniqueness check."""
        User.objects.create_user(
            username="existinguser",
            email="test@example.com",
            password="studybuddy123",
        )

        payload = {
            "username": "newuser",
            "email": "  TEST@EXAMPLE.COM  ",
            "password": "StudyBuddy123!",
        }
        response = self.client.post("/api/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_username_trimmed(self):
        """Username should be trimmed before storage/uniqueness check."""
        payload = {
            "username": "  trimmeduser  ",
            "email": "trimmed@example.com",
            "password": "StudyBuddy123!",
        }
        response = self.client.post("/api/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Username stored without padding
        user = User.objects.get(username="trimmeduser")
        self.assertEqual(user.username, "trimmeduser")


class TaskValidationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="taskuser",
            email="taskuser@example.com",
            password="TestPass123!",
        )

    def test_create_task_with_past_due_date_fails(self):
        """Reject task creation with due_date in the past."""
        self.client.force_authenticate(user=self.user)
        from datetime import datetime, timedelta

        past_date = (datetime.now() - timedelta(days=1)).date().isoformat()

        payload = {
            "title": "Past Task",
            "description": "This task is due in the past",
            "due_date": past_date,
        }
        response = self.client.post("/api/schedule/tasks/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("due_date", response.data)

    def test_create_task_with_today_due_date_succeeds(self):
        """Allow task creation with due_date as today."""
        self.client.force_authenticate(user=self.user)
        from datetime import datetime

        today = datetime.now().date().isoformat()

        payload = {
            "title": "Today Task",
            "description": "This task is due today",
            "due_date": today,
        }
        response = self.client.post("/api/schedule/tasks/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_task_with_future_due_date_succeeds(self):
        """Allow task creation with due_date in the future."""
        self.client.force_authenticate(user=self.user)
        from datetime import datetime, timedelta

        future_date = (datetime.now() + timedelta(days=7)).date().isoformat()

        payload = {
            "title": "Future Task",
            "description": "This task is due in a week",
            "due_date": future_date,
        }
        response = self.client.post("/api/schedule/tasks/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_edit_task_with_past_due_date_fails(self):
        """Reject task edit with past due_date."""
        self.client.force_authenticate(user=self.user)
        from datetime import datetime, timedelta

        task = Assignment.objects.create(
            user=self.user,
            title="Original Task",
            estimated_duration_minutes=60,
        )

        past_date = (datetime.now() - timedelta(days=1)).date().isoformat()

        payload = {"due_date": past_date}
        response = self.client.patch(
            f"/api/schedule/tasks/{task.id}/", payload, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("due_date", response.data)


class StreakAndGamificationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="streakuser",
            email="streakuser@example.com",
            password="TestPass123!",
        )
        self.profile = self.user.profile
        self.assignment = Assignment.objects.create(
            user=self.user,
            title="Streak assignment",
            estimated_duration_minutes=60,
        )

    def test_assignment_completed_at_set_on_completed(self):
        """completed_at should automatically populate/depopulate based on is_completed."""
        task = Assignment.objects.create(
            user=self.user,
            title="Streak test task",
            estimated_duration_minutes=60,
        )
        self.assertIsNone(task.completed_at)

        # Mark completed
        task.is_completed = True
        task.save()
        self.assertIsNotNone(task.completed_at)
        completed_time = task.completed_at

        # Mark incomplete
        task.is_completed = False
        task.save()
        self.assertIsNone(task.completed_at)

    def test_streak_calculation_consecutive_days(self):
        """Verify streak increments for consecutive days, caps on same day, and breaks on gaps."""
        from django.utils import timezone
        from app.utils import update_user_streak
        from app.models import TaskBlock
        import datetime

        profile = self.user.profile

        # No tasks completed -> streak 0
        update_user_streak(self.user)
        profile.refresh_from_db()
        self.assertEqual(profile.current_streak, 0)

        # TaskBlock completed today -> streak 1
        now = timezone.now()
        t1 = TaskBlock.objects.create(
            user=self.user,
            assignment=self.assignment,
            start_time=now,
            end_time=now + datetime.timedelta(hours=1),
            completed=True,
        )
        update_user_streak(self.user)
        profile.refresh_from_db()
        self.assertEqual(profile.current_streak, 1)

        # Capping: TaskBlock 2 completed today -> streak remains 1
        t2 = TaskBlock.objects.create(
            user=self.user,
            assignment=self.assignment,
            start_time=now,
            end_time=now + datetime.timedelta(hours=1),
            completed=True,
        )
        update_user_streak(self.user)
        profile.refresh_from_db()
        self.assertEqual(profile.current_streak, 1)

        # TaskBlock completed yesterday -> streak 2
        yesterday = now - datetime.timedelta(days=1)
        t3 = TaskBlock.objects.create(
            user=self.user,
            assignment=self.assignment,
            start_time=yesterday,
            end_time=yesterday + datetime.timedelta(hours=1),
            completed=True,
        )
        update_user_streak(self.user)
        profile.refresh_from_db()
        self.assertEqual(profile.current_streak, 2)

        # TaskBlock completed 2 days ago -> streak 3
        two_days_ago = now - datetime.timedelta(days=2)
        t4 = TaskBlock.objects.create(
            user=self.user,
            assignment=self.assignment,
            start_time=two_days_ago,
            end_time=two_days_ago + datetime.timedelta(hours=1),
            completed=True,
        )
        update_user_streak(self.user)
        profile.refresh_from_db()
        self.assertEqual(profile.current_streak, 3)

        # Gap: TaskBlock completed 4 days ago (skipping 3 days ago) -> streak remains 3
        four_days_ago = now - datetime.timedelta(days=4)
        t5 = TaskBlock.objects.create(
            user=self.user,
            assignment=self.assignment,
            start_time=four_days_ago,
            end_time=four_days_ago + datetime.timedelta(hours=1),
            completed=True,
        )
        update_user_streak(self.user)
        profile.refresh_from_db()
        self.assertEqual(profile.current_streak, 3)

        # Delete yesterday's task block -> streak breaks to 1 (since today's blocks are still complete)
        t3.delete()
        update_user_streak(self.user)
        profile.refresh_from_db()
        self.assertEqual(profile.current_streak, 1)


class AchievementsTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="achiever",
            email="achiever@example.com",
            password="TestPass123!",
        )
        self.profile = self.user.profile
        self.assignment = Assignment.objects.create(
            user=self.user,
            title="Achievement task",
            estimated_duration_minutes=60,
        )

    def test_achievements_awarded_on_task_block_completion(self):
        """TaskBlock completion should award 'First Step' and update study hours."""
        from django.utils import timezone
        from app.models import TaskBlock, UserAchievement
        import datetime

        self.assertEqual(self.user.achievements.count(), 0)
        self.assertEqual(self.profile.total_study_hours, 0)

        # Complete a 2-hour study session block
        now = timezone.now()
        t1 = TaskBlock.objects.create(
            user=self.user,
            assignment=self.assignment,
            start_time=now - datetime.timedelta(hours=2),
            end_time=now,
            completed=True,
        )

        self.profile.refresh_from_db()
        # Should update stats: 2 hours completed
        self.assertEqual(self.profile.total_study_hours, 2)
        # Should award "First Step" achievement
        self.assertTrue(self.user.achievements.filter(achievement__name="First Step").exists())

    def test_achievements_api_list_view(self):
        """Achievements endpoint should return all achievements with earned states."""
        from django.urls import reverse
        from django.utils import timezone
        from app.models import TaskBlock

        self.client.force_authenticate(user=self.user)

        # Complete one session to get "First Step"
        now = timezone.now()
        TaskBlock.objects.create(
            user=self.user,
            assignment=self.assignment,
            start_time=now,
            end_time=now + timezone.timedelta(hours=1),
            completed=True,
        )

        response = self.client.get(reverse("achievement-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 6) # At least 6 default achievements seeded

        # Verify "First Step" is earned and has an earned_at date
        first_step = next(a for a in response.data if a["name"] == "First Step")
        self.assertTrue(first_step["earned"])
        self.assertIsNotNone(first_step["earned_at"])

        # Verify other achievements are not earned
        streak_starter = next(a for a in response.data if a["name"] == "Streak Starter")
        self.assertFalse(streak_starter["earned"])
        self.assertIsNone(streak_starter["earned_at"])