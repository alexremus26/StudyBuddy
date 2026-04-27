from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0005_add_schoolclass_class_type_column"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name='Review'),
                migrations.DeleteModel(name='UserFavPlace'),
                migrations.DeleteModel(name='Location'),
            ],
        ),
    ]