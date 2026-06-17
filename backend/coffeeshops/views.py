from celery.result import AsyncResult
from rest_framework import permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from django.db.models import Prefetch
from django.shortcuts import get_object_or_404

from app.models import Assignment
from .models import AIAggregateProfile, AIProfileGenerationJob, Location, UserReview, UserFavPlace
from .serializers import (
    AIAggregateProfileSummarySerializer,
    AIProfileGenerationJobSerializer,
    LocationMapSerializer,
    UserReviewSerializer,
    UserFavPlaceSerializer,
)
from .services import ai_study_recommender


class LocationReviewPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 50


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
            ),
            "reviews",
            "favorited_by",
        )
    )

    serializer = LocationMapSerializer(locations, many=True, context={"request": request})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([permissions.AllowAny])
def location_reviews(request, location_id: int):
    location = get_object_or_404(Location, id=location_id)

    if request.method == 'GET':
        ordering = request.query_params.get('ordering', '-created_at')
        if ordering not in {'created_at', '-created_at', 'overall_rating', '-overall_rating'}:
            ordering = '-created_at'

        reviews = location.reviews.select_related('user', 'user__profile').order_by(ordering, '-id')
        paginator = LocationReviewPagination()
        page = paginator.paginate_queryset(reviews, request)
        serializer = UserReviewSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)

    if not request.user or not request.user.is_authenticated:
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    existing = location.reviews.filter(user=request.user).order_by('-created_at').first()
    serializer = UserReviewSerializer(existing, data=request.data, partial=True, context={"request": request})
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    serializer.save(user=request.user, location=location)
    return Response(serializer.data, status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED)


def _latest_profile(location: Location):
    return location.aggregate_profiles.order_by("-created_at").first()


def _active_generation_job(location: Location):
    return (
        location.ai_generation_jobs.filter(status__in=AIProfileGenerationJob.ACTIVE_STATUSES)
        .order_by("-updated_at")
        .first()
    )


def _generation_payload(location: Location, job=None):
    profile = _latest_profile(location)
    if job is None:
        job = _active_generation_job(location) or location.ai_generation_jobs.order_by("-updated_at").first()

    return {
        "location_id": location.id,
        "profile": AIAggregateProfileSummarySerializer(profile).data if profile else None,
        "job": AIProfileGenerationJobSerializer(job).data if job else None,
    }


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def location_ai_profile_generation(request, location_id: int):
    location = get_object_or_404(Location, id=location_id)
    return Response(_generation_payload(location), status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def generate_location_ai_profile(request, location_id: int):
    location = get_object_or_404(Location, id=location_id)
    profile = _latest_profile(location)
    if profile:
        return Response(_generation_payload(location), status=status.HTTP_200_OK)

    from .tasks import enqueue_location_profile_generation

    job, created = enqueue_location_profile_generation(location)
    return Response(
        _generation_payload(location, job=job),
        status=status.HTTP_202_ACCEPTED if created else status.HTTP_200_OK,
    )


@api_view(["POST", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def location_favorite(request, location_id: int):
    location = get_object_or_404(Location, id=location_id)

    if request.method == 'POST':
        note = request.data.get('custom_note', '')
        fav, created = UserFavPlace.objects.update_or_create(
            user=request.user,
            location=location,
            defaults={
                'custom_note': note or '',
            },
        )
        serializer = UserFavPlaceSerializer(fav, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    fav = UserFavPlace.objects.filter(user=request.user, location=location).first()
    if not fav:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    fav.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


def _get_locations_for_recommendation(request):
    """Helper to fetch all locations with their profiles for AI prompt."""
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
    # Serialize using LocationMapSerializer to get the aggregate profile data easily
    return LocationMapSerializer(locations, many=True, context={"request": request}).data


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def ai_recommend_by_assignment(request):
    assignment_id = request.data.get("assignment_id")
    if not assignment_id:
        return Response({"detail": "assignment_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    assignment = get_object_or_404(Assignment, id=assignment_id, user=request.user)
    
    assignment_data = {
        "title": assignment.title,
        "category": assignment.get_category_display(),
        "estimated_duration_minutes": assignment.estimated_duration_minutes,
        "description": assignment.description,
    }

    locations_data = _get_locations_for_recommendation(request)

    try:
        recommendation = ai_study_recommender.recommend_by_assignment(assignment_data, locations_data)
        return Response(recommendation, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"detail": f"AI Recommendation failed: {str(e)}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def ai_recommend_by_mood(request):
    mood = request.data.get("mood")
    if not mood:
        return Response({"detail": "mood text is required."}, status=status.HTTP_400_BAD_REQUEST)

    locations_data = _get_locations_for_recommendation(request)

    try:
        recommendation = ai_study_recommender.recommend_by_mood(mood, locations_data)
        return Response(recommendation, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"detail": f"AI Recommendation failed: {str(e)}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
