from django.contrib.auth.models import Group, User
from django.utils import timezone
from .models import Task, UserProfile
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

class GroupSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ["url", "name"]

class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = ["url", "username", "email", "groups"]

class TaskPreviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ['title', 'due_date', 'is_completed']

class UserMeSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    streak = serializers.IntegerField(source='current_streak', read_only=True)
    upcoming_tasks = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ['id', 'username', 'avatar', 'streak', 'upcoming_tasks']

    @extend_schema_field(TaskPreviewSerializer(many=True))
    def get_upcoming_tasks(self, obj):
        today = timezone.localdate()
        qs = (
            Task.objects.filter(
                user = obj.user,
                due_date__date=today,
            ).order_by('due_date')
        )
        return TaskPreviewSerializer(qs, many=True).data

class UserProfileSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    study_hours = serializers.IntegerField(source='total_study_hours')
    streak = serializers.IntegerField(source='current_streak')
    class Meta:
        model = UserProfile
        fields = ['id', 'username', 'email', 'timezone', 'study_hours', 'avatar', 'streak']

class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['username', 'email', 'password']

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already in use.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already in use.")
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )