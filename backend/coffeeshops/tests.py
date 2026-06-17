from unittest.mock import patch
from types import SimpleNamespace

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.conf import settings

from coffeeshops.models import AIAggregateProfile, Location, BestTimeCrowdnessJob
from coffeeshops.services.ai_profile_service import build_ai_profile_from_reviews
from coffeeshops.tasks import process_location_profile_task, fetch_reviews_task, score_location_task, fetch_besttime_crowdness_task


class AIProfileServiceTests(TestCase):
	def setUp(self):
		self.location = Location.objects.create(
			google_place_id="place-123",
			name="Study Cafe",
			address="123 Library St",
		)

	@override_settings(OLLAMA_HOST="")
	def test_build_ai_profile_fails_without_ollama(self):
		payload = {
			"reviews": [
				{"author": "Ana", "text": "Quiet and good for laptops."},
				{"author": "Mihai", "text": "A bit noisy at lunch."},
			]
		}

		with self.assertRaises(RuntimeError) as ctx:
			build_ai_profile_from_reviews(self.location, payload)

		self.assertIn("OLLAMA_HOST is not configured", str(ctx.exception))


class ProcessLocationProfileTaskTests(TestCase):
	def setUp(self):
		self.user = User.objects.create_user(username="tester", password="password123")
		self.location = Location.objects.create(
			google_place_id="place-456",
			name="Notebook Cafe",
			address="45 Study Ave",
		)

	def test_process_location_profile_merges_apify_and_app_reviews(self):
		apify_reviews_payload = {
			"reviews": [
				{
					"author": "Google User",
					"text": "Good Wi-Fi and plenty of outlets.",
					"relative_time": "2 weeks ago",
				}
			]
		}
		app_reviews = [
			{
				"source": "app",
				"author": self.user.username,
				"relative_time": "2026-04-28T12:00:00Z",
				"text": "Great for studying.",
			}
		]

		captured_payload = {}

		with patch(
			"coffeeshops.tasks.fetch_reviews_task.delay",
			return_value=SimpleNamespace(id="task-123"),
		):
			result = process_location_profile_task.run(self.location.id)

		self.assertEqual(result["status"], "queued")
		self.assertEqual(result["fetch_task_id"], "task-123")

		def fake_build_ai_profile_from_reviews(location, reviews_payload):
			captured_payload["location_id"] = location.id
			captured_payload["reviews"] = reviews_payload["reviews"]
			return {
				"AIdescription": "Mock profile",
				"laptop_friendly": 4.0,
				"study_friendly": 4.5,
				"noise_level": 2.5,
				"generation_source": f"ollama-{settings.OLLAMA_MODEL}",
			}

		with patch(
			"coffeeshops.tasks.build_ai_profile_from_reviews",
			side_effect=fake_build_ai_profile_from_reviews,
		):
			combined_reviews = [
				{**apify_reviews_payload["reviews"][0], "source": "google"},
				app_reviews[0]
			]
			generate_result = score_location_task.run(self.location.id, combined_reviews)

		self.assertEqual(captured_payload["location_id"], self.location.id)
		self.assertEqual(len(captured_payload["reviews"]), 2)
		self.assertEqual(generate_result["status"], "done")
		self.assertEqual(generate_result["generation_source"], f"ollama-{settings.OLLAMA_MODEL}")

		profile = AIAggregateProfile.objects.get(location=self.location)
		self.assertEqual(profile.AIdescription, "Mock profile")
		self.assertEqual(profile.laptop_friendly, 4.0)
		self.assertEqual(profile.study_friendly, 4.5)
		self.assertEqual(profile.noise_level, 2.5)
		self.assertEqual(profile.overall_rating, 3.7)

	def test_fetch_reviews_task_fails_with_no_reviews(self):
		"""fetch_reviews_task should raise RuntimeError when no reviews are collected."""
		with patch(
			"coffeeshops.tasks._collect_reviews",
			return_value=[],
		):
			with self.assertRaises(RuntimeError) as ctx:
				fetch_reviews_task.run(self.location.id)

		self.assertIn("No reviews available", str(ctx.exception))
		self.assertFalse(AIAggregateProfile.objects.filter(location=self.location).exists())


class BestTimeCrowdnessTaskTests(TestCase):
	def setUp(self):
		self.location = Location.objects.create(
			google_place_id="place-789",
			name="Mocky Cafe",
			address="78 mock road",
		)

	@override_settings(BESTTIME_API_KEY_PRIVATE="")
	def test_fetch_besttime_crowdness_mock_fallback(self):
		job = BestTimeCrowdnessJob.objects.create(
			location=self.location,
			status=BestTimeCrowdnessJob.STATUS_QUEUED,
		)
		
		result = fetch_besttime_crowdness_task.run(self.location.id, job.id)
		
		self.assertEqual(result["status"], "done")
		self.assertTrue(result["mocked"])
		
		# Refresh from db
		self.location.refresh_from_db()
		self.assertIsNotNone(self.location.besttime_venue_id)
		self.assertIsNotNone(self.location.besttime_live_busyness)
		self.assertIsNotNone(self.location.besttime_forecast_data)
		
		job.refresh_from_db()
		self.assertEqual(job.status, BestTimeCrowdnessJob.STATUS_DONE)

	@override_settings(BESTTIME_API_KEY_PRIVATE="valid_api_key")
	@patch("requests.post")
	def test_fetch_besttime_crowdness_real_api(self, mock_post):
		job = BestTimeCrowdnessJob.objects.create(
			location=self.location,
			status=BestTimeCrowdnessJob.STATUS_QUEUED,
		)
		
		# Setup mock responses for both POST /forecasts and POST /forecasts/live
		mock_response_forecast = SimpleNamespace(
			status_code=200,
			json=lambda: {
				"status": "OK",
				"venue_info": {
					"venue_id": "ven_test_123",
					"venue_name": "Mocky Cafe",
					"venue_address": "78 mock road"
				},
				"analysis": [{"day_info": "Monday", "day_raw": [10]*24}]
			},
			raise_for_status=lambda: None
		)
		
		mock_response_live = SimpleNamespace(
			status_code=200,
			json=lambda: {
				"status": "OK",
				"analysis": {
					"venue_live_could_connect": True,
					"venue_live_busyness": 45
				}
			},
			raise_for_status=lambda: None
		)
		
		mock_post.side_effect = [mock_response_forecast, mock_response_live]
		
		result = fetch_besttime_crowdness_task.run(self.location.id, job.id)
		
		self.assertEqual(result["status"], "done")
		self.assertFalse(result["mocked"])
		self.assertEqual(result["live_busyness"], 45)
		
		# Refresh from db
		self.location.refresh_from_db()
		self.assertEqual(self.location.besttime_venue_id, "ven_test_123")
		self.assertEqual(self.location.besttime_live_busyness, 45)
		
		job.refresh_from_db()
		self.assertEqual(job.status, BestTimeCrowdnessJob.STATUS_DONE)
