from django.urls import path

from schedule import views

urlpatterns = [
	path("assignments/", views.assignment_list_create, name="assignment-list-create"),
	path("assignments/<int:pk>/", views.assignment_detail, name="assignment-detail"),
	path("tasks/", views.assignment_list_create, name="task-list-create"),
	path("tasks/<int:pk>/", views.assignment_detail, name="task-detail"),
	path(
		"school-classes/",
		views.school_class_list_create,
		name="school-class-list-create",
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
		"task-blocks/<int:pk>/",
		views.task_block_detail,
		name="task-block-detail",
	),
	path(
		"task-blocks/bulk/",
		views.task_block_bulk_create,
		name="task-block-bulk-create",
	),
]
