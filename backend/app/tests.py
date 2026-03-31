from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from app.models import UserProfile, Assignment

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