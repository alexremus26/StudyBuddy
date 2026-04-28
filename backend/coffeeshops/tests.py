from unittest.mock import patch
from types import SimpleNamespace

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from coffeeshops.models import AIAggregateProfile, Location
from coffeeshops.services.ai_profile_service import build_ai_profile_from_reviews
from coffeeshops.tasks import generate_ai_profile_task, process_location_profile_task


class AIProfileServiceTests(TestCase):
	def setUp(self):
		self.location = Location.objects.create(
			google_place_id="place-123",
			name="Study Cafe",
			address="123 Library St",
		)

	@override_settings(GEMINI_API_KEY="")
	def test_build_ai_profile_uses_fallback_without_gemini(self):
		payload = {
			"reviews": [
				{"author": "Ana", "rating": 4, "text": "Quiet and good for laptops."},
				{"author": "Mihai", "rating": 2, "text": "A bit noisy at lunch."},
			]
		}

		profile = build_ai_profile_from_reviews(self.location, payload)

		self.assertEqual(
			profile["AIdescription"],
			"Gemini profile unavailable for Study Cafe.",
		)
		self.assertEqual(profile["laptop_friendly"], 0.0)
		self.assertEqual(profile["study_friendly"], 0.0)
		self.assertEqual(profile["overall_rating"], 0.0)
		self.assertEqual(profile["noise_level"], 0.0)
		self.assertEqual(profile["overall_corwdness"], 0.0)
		self.assertEqual(profile["generation_source"], "fallback")
		self.assertIn("GEMINI_API_KEY", profile["generation_error"])


class ProcessLocationProfileTaskTests(TestCase):
	def setUp(self):
		self.user = User.objects.create_user(username="tester", password="password123")
		self.location = Location.objects.create(
			google_place_id="place-456",
			name="Notebook Cafe",
			address="45 Study Ave",
		)

	def test_process_location_profile_merges_google_and_app_reviews(self):
		google_reviews_payload = {
			"reviews": [
				{
					"author": "Google User",
					"rating": 4,
					"text": "Good Wi-Fi and plenty of outlets.",
					"relative_time": "2 weeks ago",
				}
			]
		}
		app_reviews = [
			{
				"source": "app",
				"author": self.user.username,
				"rating": 5,
				"relative_time": "2026-04-28T12:00:00Z",
				"text": "Great for studying.",
			}
		]

		captured_payload = {}

		with patch("coffeeshops.tasks.fetch_google_reviews", return_value=google_reviews_payload), patch(
			"coffeeshops.tasks._serialize_user_reviews",
			return_value=app_reviews,
		), patch(
			"coffeeshops.tasks.generate_ai_profile_task.delay",
			return_value=SimpleNamespace(id="task-123"),
		):
			result = process_location_profile_task.run(self.location.id)

		self.assertEqual(result["status"], "queued")
		self.assertEqual(result["generate_task_id"], "task-123")
		self.assertEqual(len(result["reviews"]), 2)
		self.assertEqual(result["reviews"][0]["source"], "google")
		self.assertEqual(result["reviews"][1]["source"], "app")

		def fake_build_ai_profile_from_reviews(location, reviews_payload):
			captured_payload["location_id"] = location.id
			captured_payload["reviews"] = reviews_payload["reviews"]
			return {
				"AIdescription": "Mock profile",
				"laptop_friendly": 4.0,
				"study_friendly": 4.5,
				"overall_corwdness": 2.0,
				"noise_level": 2.5,
				"overall_rating": 4.0,
				"generation_source": "gemini",
				"generation_error": "",
			}

		with patch(
			"coffeeshops.tasks.build_ai_profile_from_reviews",
			side_effect=fake_build_ai_profile_from_reviews,
		):
			generate_result = generate_ai_profile_task.run(self.location.id, result["reviews"])

		self.assertEqual(captured_payload["location_id"], self.location.id)
		self.assertEqual(len(captured_payload["reviews"]), 2)
		self.assertEqual(generate_result["status"], "done")
		self.assertEqual(generate_result["generation_source"], "gemini")
		self.assertEqual(generate_result["generation_error"], "")

		profile = AIAggregateProfile.objects.get(location=self.location)
		self.assertEqual(profile.AIdescription, "Mock profile")
		self.assertEqual(profile.laptop_friendly, 4.0)
		self.assertEqual(profile.study_friendly, 4.5)
		self.assertEqual(profile.overall_corwdness, 2.0)
		self.assertEqual(profile.noise_level, 2.5)
		self.assertEqual(profile.overall_rating, 4.0)
