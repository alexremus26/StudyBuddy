from django.contrib.gis.db import models as gis_models
from django.db import migrations

SQL_COPY = """
UPDATE app_location
SET temp_coordinates = ST_SetSRID(
    ST_MakePoint(
        (coordinates->>'longitude')::double precision,
        (coordinates->>'latitude')::double precision
    ),
    4326
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
            field=gis_models.PointField(null=True, blank=True, srid=4326),
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