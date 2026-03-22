from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from app.models import UserProfile

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