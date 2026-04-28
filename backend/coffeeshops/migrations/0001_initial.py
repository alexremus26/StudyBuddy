from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("app", "0006_remove_coffee_models"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name='Location',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=100)),
                        ('address', models.CharField(blank=True, max_length=255)),
                        ('has_wifi', models.BooleanField(default=True)),
                        ('has_outlets', models.BooleanField(default=True)),
                        ('is_quiet', models.BooleanField(default=False)),
                    ],
                    options={'db_table': 'app_location'},
                ),
                migrations.CreateModel(
                    name='UserFavPlace',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('saved_at', models.DateTimeField(auto_now_add=True)),
                        ('custom_note', models.CharField(blank=True, help_text="e.g., 'Best coffee, terrible chairs'", max_length=100)),
                        ('location', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='favorited_by', to='coffeeshops.location')),
                        ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='favorite_places', to=settings.AUTH_USER_MODEL)),
                    ],
                    options={'db_table': 'app_userfavplace'},
                ),
                migrations.CreateModel(
                    name='UserReview',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('rating', models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(5)])),
                        ('comment', models.TextField(blank=True, max_length=255, null=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('location', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reviews', to='coffeeshops.location')),
                        ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reviews', to=settings.AUTH_USER_MODEL)),
                    ],
                    options={'db_table': 'app_userreview'},
                ),
                migrations.CreateModel(
                    name='AIAggregateProfile',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('AIdescription', models.TextField(blank=True, max_length=255, null=True)),
                        ('laptop_friendly', models.IntegerField(default=2.5, validators=[MinValueValidator(0), MaxValueValidator(5)])),
                        ('study_friendly', models.IntegerField(default=2.5, validators=[MinValueValidator(0), MaxValueValidator(5)])),
                        ('overall_corwdness', models.IntegerField(default=2.5, validators=[MinValueValidator(0), MaxValueValidator(5)])),
                        ('noise_level', models.IntegerField(default=2.5, validators=[MinValueValidator(0), MaxValueValidator(5)])),
                        ('overall_rating', models.IntegerField(default=2.5, validators=[MinValueValidator(0), MaxValueValidator(5)])),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('location', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='aggregate_profiles', to='coffeeshops.location')),
                    ],
                    options={'db_table': 'app_aiaggregateprofile'},
                ),
            ],
        ),
    ]