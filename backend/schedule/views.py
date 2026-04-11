from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiTypes, extend_schema
from django.conf import settings

import time

from app.models import Assignment, SchoolClass, TaskBlock
from schedule.serializers import (
    AssignmentCreateSerializer,
    AssignmentEditSerializer,
    AssignmentSerializer,
	ScheduleParseRequestSerializer,
	ScheduleParseResponseSerializer,
    SchoolClassSerializer,
	TaskBlockBulkCreateSerializer,
	TaskBlockCreateSerializer,
	TaskBlockEditSerializer,
	TaskBlockSerializer,
)
from schedule.services.ollama_parser import OllamaScheduleParser


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


@extend_schema(
	methods=["POST"],
	operation_id="schedule_parse_text",
	request=ScheduleParseRequestSerializer,
	responses={200: ScheduleParseResponseSerializer, 400: OpenApiTypes.OBJECT},
)
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def parse_schedule_text(request):
	serializer = ScheduleParseRequestSerializer(data=request.data)
	if not serializer.is_valid():
		return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

	requested_parser_mode = serializer.validated_data.get("parser_mode", "auto")
	layout_pipeline_mode = getattr(settings, "SCHEDULE_LAYOUT_PIPELINE_MODE", "disabled")

	parser = OllamaScheduleParser()
	start = time.perf_counter()
	result = parser.parse(
		serializer.validated_data["ocr_text"],
		max_blocks=serializer.validated_data.get("max_blocks", 25),
		parser_mode=requested_parser_mode,
		layout_pipeline_mode=layout_pipeline_mode,
	)
	elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

	result = result or {}
	diagnostics = result.get("diagnostics")
	if not isinstance(diagnostics, dict):
		diagnostics = {}

	diagnostics.setdefault("requested_parser_mode", requested_parser_mode)
	diagnostics.setdefault("effective_parser_mode", requested_parser_mode)
	diagnostics["layout_pipeline_mode"] = layout_pipeline_mode
	diagnostics["layout_pipeline_enabled"] = layout_pipeline_mode in {"shadow", "active"}
	diagnostics["elapsed_ms"] = elapsed_ms

	warnings = [str(item) for item in (result.get("warnings") or []) if item]
	if layout_pipeline_mode == "shadow":
		shadow_msg = "Layout pipeline shadow mode is enabled; live output still uses the legacy extraction path."
		if shadow_msg not in warnings:
			warnings.append(shadow_msg)

	result["warnings"] = warnings
	result["diagnostics"] = diagnostics
	response_serializer = ScheduleParseResponseSerializer(data=result)
	response_serializer.is_valid(raise_exception=True)
	return Response(response_serializer.validated_data, status=status.HTTP_200_OK)
