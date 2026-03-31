from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.shortcuts import render
from django.contrib.auth.models import User
from rest_framework import status, permissions
from rest_framework.decorators import permission_classes
from rest_framework.authtoken.models import Token
from drf_spectacular.utils import OpenApiTypes, extend_schema
from .serializers import UserSerializer, UserMeSerializer, UserProfileSerializer, UserRegisterSerializer
from .models import UserProfile


@extend_schema(
    methods=["GET"],
    operation_id="users_list",
    responses={200: UserSerializer(many=True)},
)
@extend_schema(
    methods=["POST"],
    operation_id="users_create",
    request=UserSerializer,
    responses={201: UserSerializer, 400: OpenApiTypes.OBJECT},
)
@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticatedOrReadOnly])
def user_list(request, format=None):
    if request.method == "GET":
        users = User.objects.all()
        serializer = UserSerializer(users, many=True, context={"request": request})
        return Response(serializer.data)

    elif request.method == "POST":
        serializer = UserSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)



@extend_schema(
    methods=["GET"],
    operation_id="users_retrieve",
    responses={200: UserSerializer, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
    methods=["PUT"],
    operation_id="users_update",
    request=UserSerializer,
    responses={200: UserSerializer, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
)
@extend_schema(
    methods=["DELETE"],
    operation_id="users_delete",
    responses={204: None, 404: OpenApiTypes.OBJECT},
)
@api_view(["GET", "PUT", "DELETE"])
@permission_classes([permissions.IsAuthenticatedOrReadOnly])
def user_detail(request, pk, format=None):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        serializer = UserSerializer(user, context={"request": request})
        return Response(serializer.data)

    elif request.method == "PUT":
        serializer = UserSerializer(user, data=request.data, context={"request": request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == "DELETE":
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    


@extend_schema(
    methods=["GET"],
    operation_id="users_me_retrieve",
    responses={200: UserMeSerializer},
)
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def me_overview(request):
    profile, created = UserProfile.objects.get_or_create(user=request.user)
    serializer = UserMeSerializer(profile, context={"request": request})
    return Response(serializer.data)

@extend_schema(
    methods=["GET"],
    operation_id="users_me_profile_retrieve",
    responses={200: UserProfileSerializer},
)
@extend_schema(
    methods=["PUT"],
    operation_id="users_me_profile_update",
    request=UserProfileSerializer,
    responses={200: UserProfileSerializer, 400: OpenApiTypes.OBJECT},
)
@api_view(["GET", "PUT"])
@permission_classes([permissions.IsAuthenticated])
def me_profile(request):
    profile, created = UserProfile.objects.get_or_create(user=request.user)

    if request.method == "GET":
        serializer = UserProfileSerializer(profile, context={"request": request})
        return Response(serializer.data)
    
    serializer = UserProfileSerializer(
        profile, data=request.data, partial=True, context={"request": request}
    )
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)



@extend_schema(
    methods=["POST"],
    operation_id="users_register",
    request=UserRegisterSerializer,
    responses={201: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
)
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def user_register(request):
    serializer = UserRegisterSerializer(data=request.data, context={"request": request})
    if serializer.is_valid():
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                "token": token.key,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                },
            },
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)



def overview(request):
    return render(request, "index.html")
