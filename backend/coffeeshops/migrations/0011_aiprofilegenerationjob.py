from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("coffeeshops", "0010_remove_userreview_rating_userreview_laptop_friendly_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="AIProfileGenerationJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("queued", "Queued"),
                            ("fetching_reviews", "Fetching reviews"),
                            ("scoring", "Scoring"),
                            ("done", "Done"),
                            ("failed", "Failed"),
                        ],
                        db_index=True,
                        default="queued",
                        max_length=32,
                    ),
                ),
                ("process_task_id", models.CharField(blank=True, max_length=255)),
                ("fetch_task_id", models.CharField(blank=True, max_length=255)),
                ("score_task_id", models.CharField(blank=True, max_length=255)),
                ("error", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "location",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_generation_jobs",
                        to="coffeeshops.location",
                    ),
                ),
            ],
            options={
                "db_table": "app_aiprofilegenerationjob",
                "ordering": ["-updated_at"],
            },
        ),
        migrations.AddIndex(
            model_name="aiprofilegenerationjob",
            index=models.Index(fields=["location", "status"], name="app_aiprofi_locatio_3e4f85_idx"),
        ),
        migrations.AddIndex(
            model_name="aiprofilegenerationjob",
            index=models.Index(fields=["updated_at"], name="app_aiprofi_updated_5819d0_idx"),
        ),
    ]
