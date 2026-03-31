from django.contrib.auth.models import Group, User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from .models import Assignment, UserProfile
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

RESERVED_USERNAMES = {"admin", "root", "me", "api", "support", "system"}

class GroupSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ["url", "name"]

class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = ["url", "username", "email", "groups"]

class AssignmentPreviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = ['title', 'due_date', 'is_completed']

class UserMeSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    streak = serializers.IntegerField(source='current_streak', read_only=True)
    upcoming_tasks = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ['id', 'username', 'avatar', 'streak', 'upcoming_tasks']

    @extend_schema_field(AssignmentPreviewSerializer(many=True))
    def get_upcoming_tasks(self, obj):
        today = timezone.localdate()
        qs = (
            Assignment.objects.filter(
                user = obj.user,
                due_date__date=today,
            ).order_by('due_date')
        )
        return AssignmentPreviewSerializer(qs, many=True).data

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
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ['username', 'email', 'password']

    def validate_username(self, value):
        username = value.strip()
        if not username:
            raise serializers.ValidationError("Username cannot be blank.")
        if username.lower() in RESERVED_USERNAMES:
            raise serializers.ValidationError("This username is reserved.")
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Username already in use.")
        return username

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Email already in use.")
        return email

    def validate_password(self, value):
        user = User(
            username=self.initial_data.get("username", "").strip(),
            email=self.initial_data.get("email", "").strip().lower(),
        )
        try:
            validate_password(value, user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )