from django.db import migrations

SQL = """
-- ensure no NULLs remain
UPDATE app_location SET description = '' WHERE description IS NULL;

-- then allow NULLs (makes inserts that don't supply description succeed)
ALTER TABLE app_location ALTER COLUMN description DROP NOT NULL;
"""

REVERSE_SQL = """
-- reverse: make column NOT NULL again (will fail if empty strings exist)
ALTER TABLE app_location ALTER COLUMN description SET NOT NULL;
"""

class Migration(migrations.Migration):
    dependencies = [
        ('coffeeshops', '0006_convert_coordinates_to_json'),
    ]

    operations = [
        migrations.RunSQL(SQL, reverse_sql=REVERSE_SQL),
    ]