from django.db import migrations, models
import django.db.models.deletion


def _get_columns(schema_editor, table_name):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table_name)
    return {column.name for column in description}


def _rename_assignment_to_task(apps, schema_editor):
    columns = _get_columns(schema_editor, "app_taskblock")
    if "assignment_id" in columns and "task_id" not in columns:
        schema_editor.execute(
            "ALTER TABLE app_taskblock RENAME COLUMN assignment_id TO task_id;"
        )


def _rename_task_to_assignment(apps, schema_editor):
    columns = _get_columns(schema_editor, "app_taskblock")
    if "task_id" in columns and "assignment_id" not in columns:
        schema_editor.execute(
            "ALTER TABLE app_taskblock RENAME COLUMN task_id TO assignment_id;"
        )


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0003_alter_assignment_table_alter_taskblock_table"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    _rename_assignment_to_task,
                    _rename_task_to_assignment,
                )
            ],
            state_operations=[
                migrations.AlterField(
                    model_name="taskblock",
                    name="assignment",
                    field=models.ForeignKey(
                        db_column="task_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="scheduled_blocks",
                        to="app.assignment",
                    ),
                ),
            ],
        ),
    ]
