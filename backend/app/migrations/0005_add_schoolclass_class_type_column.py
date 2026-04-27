from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0004_taskblock_assignment_db_column_task_id"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE app_schoolclass
                ADD COLUMN IF NOT EXISTS class_type varchar(20) NOT NULL DEFAULT 'course';
            """,
            reverse_sql="""
                ALTER TABLE app_schoolclass
                DROP COLUMN IF EXISTS class_type;
            """,
        ),
    ]