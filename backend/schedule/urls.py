from django.urls import path

from schedule import views

urlpatterns = [
	path("tasks/", views.task_list_create, name="task-list-create"),
	path("tasks/<int:pk>/", views.task_detail, name="task-detail"),
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
