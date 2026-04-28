from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

	dependencies = [
		("coffeeshops", "0008_alter_aiaggregateprofile_laptop_friendly_and_more"),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.SeparateDatabaseAndState(
			database_operations=[
				migrations.CreateModel(
					name="UserReview",
					fields=[
						(
							"id",
							models.BigAutoField(
								auto_created=True,
								primary_key=True,
								serialize=False,
								verbose_name="ID",
							),
						),
						("rating", models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(5)])),
						("comment", models.TextField(blank=True, max_length=255, null=True)),
						("created_at", models.DateTimeField(auto_now_add=True)),
						(
							"location",
							models.ForeignKey(
								on_delete=django.db.models.deletion.CASCADE,
								related_name="reviews",
								to="coffeeshops.location",
							),
						),
						(
							"user",
							models.ForeignKey(
								on_delete=django.db.models.deletion.CASCADE,
								related_name="reviews",
								to=settings.AUTH_USER_MODEL,
							),
						),
					],
					options={"db_table": "app_userreview"},
				),
			],
			state_operations=[],
		),
	]