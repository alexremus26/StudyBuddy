from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from app.models import Task, TaskBlock
from schedule.serializers import (
	TaskBlockBulkCreateSerializer,
	TaskBlockCreateSerializer,
	TaskBlockEditSerializer,
	TaskBlockSerializer,
	TaskCreateSerializer,
	TaskEditSerializer,
	TaskSerializer,
)


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def task_list_create(request):
	if request.method == "GET":
		tasks = Task.objects.filter(user=request.user).order_by("-created_at")
		serializer = TaskSerializer(tasks, many=True, context={"request": request})
		return Response(serializer.data)

	serializer = TaskCreateSerializer(data=request.data, context={"request": request})
	if serializer.is_valid():
		serializer.save(user=request.user)
		return Response(serializer.data, status=status.HTTP_201_CREATED)
	return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def task_detail(request, pk):
	try:
		task = Task.objects.get(pk=pk, user=request.user)
	except Task.DoesNotExist:
		return Response(status=status.HTTP_404_NOT_FOUND)

	if request.method == "GET":
		serializer = TaskSerializer(task, context={"request": request})
		return Response(serializer.data)

	if request.method == "PATCH":
		serializer = TaskEditSerializer(
			task, data=request.data, partial=True, context={"request": request}
		)
		if serializer.is_valid():
			serializer.save()
			return Response(serializer.data)
		return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

	task.delete()
	return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def task_block_list_create(request):
	if request.method == "GET":
		task_blocks = TaskBlock.objects.filter(user=request.user).order_by("start_time")
		serializer = TaskBlockSerializer(
			task_blocks, many=True, context={"request": request}
		)
		return Response(serializer.data)

	serializer = TaskBlockCreateSerializer(
		data=request.data, context={"request": request}
	)
	if serializer.is_valid():
		serializer.save(user=request.user)
		return Response(serializer.data, status=status.HTTP_201_CREATED)
	return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def task_block_detail(request, pk):
	try:
		task_block = TaskBlock.objects.get(pk=pk, user=request.user)
	except TaskBlock.DoesNotExist:
		return Response(status=status.HTTP_404_NOT_FOUND)

	if request.method == "GET":
		serializer = TaskBlockSerializer(task_block, context={"request": request})
		return Response(serializer.data)

	if request.method == "PATCH":
		serializer = TaskBlockEditSerializer(
			task_block, data=request.data, partial=True, context={"request": request}
		)
		if serializer.is_valid():
			serializer.save()
			return Response(serializer.data)
		return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

	task_block.delete()
	return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def task_block_bulk_create(request):
	serializer = TaskBlockBulkCreateSerializer(
		data=request.data, context={"request": request}
	)
	if serializer.is_valid():
		created_blocks = serializer.save(user=request.user)
		response_data = TaskBlockSerializer(
			created_blocks, many=True, context={"request": request}
		).data
		return Response(response_data, status=status.HTTP_201_CREATED)
	return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
