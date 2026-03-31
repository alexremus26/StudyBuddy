from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="schoolclass",
            name="class_type",
            field=models.CharField(
                choices=[
                    ("course", "Course"),
                    ("seminar", "Seminar"),
                    ("lab", "Lab"),
                    ("workshop", "Workshop"),
                    ("tutorial", "Tutorial"),
                ],
                default="course",
                max_length=20,
            ),
        ),
    ]
