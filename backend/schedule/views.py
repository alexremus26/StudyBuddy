from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiTypes, extend_schema

from app.models import Assignment, SchoolClass, TaskBlock
from schedule.serializers import (
    AssignmentCreateSerializer,
    AssignmentEditSerializer,
    AssignmentSerializer,
    SchoolClassSerializer,
	TaskBlockBulkCreateSerializer,
	TaskBlockCreateSerializer,
	TaskBlockEditSerializer,
	TaskBlockSerializer,
)


@extend_schema(
	methods=["GET"],
	operation_id="assignments_list",
	responses={200: AssignmentSerializer(many=True)},
)
@extend_schema(
	methods=["POST"],
	operation_id="assignments_create",
	request=AssignmentCreateSerializer,
	responses={201: AssignmentCreateSerializer, 400: OpenApiTypes.OBJECT},
)
@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def assignment_list_create(request):
	if request.method == "GET":
		assignments = Assignment.objects.filter(user=request.user).order_by("-created_at")
		serializer = AssignmentSerializer(assignments, many=True, context={"request": request})
		return Response(serializer.data)

	serializer = AssignmentCreateSerializer(data=request.data, context={"request": request})
	if serializer.is_valid():
		serializer.save(user=request.user)
		return Response(serializer.data, status=status.HTTP_201_CREATED)
	return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
	methods=["GET"],
	operation_id="assignments_retrieve",
	responses={200: AssignmentSerializer, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
	methods=["PATCH"],
	operation_id="assignments_update",
	request=AssignmentEditSerializer,
	responses={200: AssignmentEditSerializer, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
	methods=["DELETE"],
	operation_id="assignments_delete",
	responses={204: None, 404: OpenApiTypes.OBJECT},
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def assignment_detail(request, pk):
	try:
		assignment = Assignment.objects.get(pk=pk, user=request.user)
	except Assignment.DoesNotExist:
		return Response(status=status.HTTP_404_NOT_FOUND)

	if request.method == "GET":
		serializer = AssignmentSerializer(assignment, context={"request": request})
		return Response(serializer.data)

	if request.method == "PATCH":
		serializer = AssignmentEditSerializer(
			assignment, data=request.data, partial=True, context={"request": request}
		)
		if serializer.is_valid():
			serializer.save()
			return Response(serializer.data)
		return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

	assignment.delete()
	return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
	methods=["GET"],
	operation_id="school_classes_list",
	responses={200: SchoolClassSerializer(many=True)},
)
@extend_schema(
	methods=["POST"],
	operation_id="school_classes_create",
	request=SchoolClassSerializer,
	responses={201: SchoolClassSerializer, 400: OpenApiTypes.OBJECT},
)
@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def school_class_list_create(request):
	if request.method == "GET":
		school_classes = SchoolClass.objects.filter(user=request.user).order_by("day_of_week", "start_time")
		serializer = SchoolClassSerializer(school_classes, many=True, context={"request": request})
		return Response(serializer.data)

	serializer = SchoolClassSerializer(data=request.data, context={"request": request})
	if serializer.is_valid():
		serializer.save(user=request.user)
		return Response(serializer.data, status=status.HTTP_201_CREATED)
	return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
	methods=["GET"],
	operation_id="school_classes_retrieve",
	responses={200: SchoolClassSerializer, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
	methods=["PATCH"],
	operation_id="school_classes_update",
	request=SchoolClassSerializer,
	responses={200: SchoolClassSerializer, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
	methods=["DELETE"],
	operation_id="school_classes_delete",
	responses={204: None, 404: OpenApiTypes.OBJECT},
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def school_class_detail(request, pk):
	try:
		school_class = SchoolClass.objects.get(pk=pk, user=request.user)
	except SchoolClass.DoesNotExist:
		return Response(status=status.HTTP_404_NOT_FOUND)

	if request.method == "GET":
		serializer = SchoolClassSerializer(school_class, context={"request": request})
		return Response(serializer.data)

	if request.method == "PATCH":
		serializer = SchoolClassSerializer(
			school_class, data=request.data, partial=True, context={"request": request}
		)
		if serializer.is_valid():
			serializer.save()
			return Response(serializer.data)
		return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

	school_class.delete()
	return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
	methods=["GET"],
	operation_id="task_blocks_list",
	responses={200: TaskBlockSerializer(many=True)},
)
@extend_schema(
	methods=["POST"],
	operation_id="task_blocks_create",
	request=TaskBlockCreateSerializer,
	responses={201: TaskBlockCreateSerializer, 400: OpenApiTypes.OBJECT},
)
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


@extend_schema(
	methods=["GET"],
	operation_id="task_blocks_retrieve",
	responses={200: TaskBlockSerializer, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
	methods=["PATCH"],
	operation_id="task_blocks_update",
	request=TaskBlockEditSerializer,
	responses={200: TaskBlockEditSerializer, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
	methods=["DELETE"],
	operation_id="task_blocks_delete",
	responses={204: None, 404: OpenApiTypes.OBJECT},
)
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


@extend_schema(
	methods=["POST"],
	operation_id="task_blocks_bulk_create",
	request=TaskBlockBulkCreateSerializer,
	responses={201: TaskBlockSerializer(many=True), 400: OpenApiTypes.OBJECT},
)
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
