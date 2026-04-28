from django.db import migrations, models

SQL_COPY = """
UPDATE app_location
SET temp_coordinates = jsonb_build_object(
  'latitude', ST_Y(coordinates),
  'longitude', ST_X(coordinates)
)
WHERE coordinates IS NOT NULL;
"""

class Migration(migrations.Migration):

    dependencies = [
        ('coffeeshops', '0005_alter_location_google_place_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='location',
            name='temp_coordinates',
            field=models.JSONField(null=True, blank=True),
        ),
        migrations.RunSQL(SQL_COPY, reverse_sql=migrations.RunSQL.noop),
        migrations.RemoveField(
            model_name='location',
            name='coordinates',
        ),
        migrations.RenameField(
            model_name='location',
            old_name='temp_coordinates',
            new_name='coordinates',
        ),
    ]