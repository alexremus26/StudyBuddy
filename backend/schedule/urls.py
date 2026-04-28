from django.urls import path

from schedule import views

urlpatterns = [
	path("parse-text/", views.parse_schedule_text, name="schedule-parse-text"),
	path("assignments/", views.assignment_list_create, name="assignment-list-create"),
	path("assignments/delete-all/", views.assignment_delete_all, name="assignment-delete-all"),
	path("assignments/<int:pk>/", views.assignment_detail, name="assignment-detail"),
	path("tasks/", views.assignment_list_create, name="task-list-create"),
	path("tasks/<int:pk>/", views.assignment_detail, name="task-detail"),
	path(
		"school-classes/",
		views.school_class_list_create,
		name="school-class-list-create",
	),
	path(
		"school-classes/delete-all/",
		views.school_class_delete_all,
		name="school-class-delete-all",
	),
	path(
		"school-classes/<int:pk>/",
		views.school_class_detail,
		name="school-class-detail",
	),
	path(
		"task-blocks/",
		views.task_block_list_create,
		name="task-block-list-create",
	),
	path(
		"task-blocks/delete-all/",
		views.task_block_delete_all,
		name="task-block-delete-all",
	),
	path(
		"task-blocks/<int:pk>/",
		views.task_block_detail,
		name="task-block-detail",
	),
	path(
		"task-blocks/bulk/",
		views.task_block_bulk_create,
		name="task-block-bulk-create",
	),
	path("planner/generate/", views.planner_generate, name="planner-generate"),
	path("planner/drafts/", views.planner_draft_list, name="planner-drafts"),
	path("planner/approve/<int:pk>/", views.planner_approve, name="planner-approve"),
	path("planner/delete/<int:pk>/", views.planner_delete, name="planner-delete"),
]
