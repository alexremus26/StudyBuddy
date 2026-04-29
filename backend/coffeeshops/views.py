from celery.result import AsyncResult
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from django.db.models import Prefetch

from .models import AIAggregateProfile, Location
from .serializers import LocationMapSerializer


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def enqueue_reviews_demo(request):
    raw_limit = request.data.get("limit", 3)
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        limit = 3

    # for now
    if limit < 1:
        limit = 1
    if limit > 3:
        limit = 3

    google_place_ids = list(
        Location.objects.exclude(google_place_id="")
        .order_by("id")
        .values_list("google_place_id", flat=True)[:limit]
    )

    if not google_place_ids:
        return Response(
            {"detail": "No locations with google_place_id found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    from .tasks import enqueue_reviews_pipeline

    async_result = enqueue_reviews_pipeline(google_place_ids)

    return Response(
        {
            "message": "Jobs queued",
            "task_id": async_result.id,
            "google_place_ids": google_place_ids,
        },
        status=status.HTTP_202_ACCEPTED,
    )


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def reviews_task_status(request, task_id: str):
    result = AsyncResult(task_id)
    state = result.state

    if state in ["PENDING", "RECEIVED", "STARTED", "RETRY"]:
        return Response({"task_id": task_id, "state": state}, status=status.HTTP_200_OK)

    if state == "FAILURE":
        return Response(
            {"task_id": task_id, "state": state, "error": str(result.result)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(
        {"task_id": task_id, "state": state, "data": result.result},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def location_map_list(request):
    locations = (
        Location.objects.filter(coordinates__isnull=False)
        .order_by("name")
        .prefetch_related(
            Prefetch(
                "aggregate_profiles",
                queryset=AIAggregateProfile.objects.order_by("-created_at"),
            )
        )
    )

    serializer = LocationMapSerializer(locations, many=True, context={"request": request})
    return Response(serializer.data, status=status.HTTP_200_OK)