from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('coffeeshops', '0007_allow_null_description'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
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
    ]