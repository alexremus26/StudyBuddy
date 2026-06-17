from rest_framework import serializers

from .models import AIAggregateProfile, AIProfileGenerationJob, Location, UserReview, UserFavPlace


class AIAggregateProfileSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    ai_description = serializers.CharField(source="AIdescription", allow_blank=True, allow_null=True, read_only=True)
    laptop_friendly = serializers.FloatField(read_only=True)
    study_friendly = serializers.FloatField(read_only=True)
    overall_crowdness = serializers.FloatField(source="overall_corwdness", read_only=True)
    noise_level = serializers.FloatField(read_only=True)
    overall_rating = serializers.FloatField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class LocationSummarySerializer(serializers.ModelSerializer):
    coordinates = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = ["id", "name", "address", "coordinates"]

    def get_coordinates(self, obj):
        if obj.coordinates is None:
            return None
        return {
            "latitude": obj.coordinates.y,
            "longitude": obj.coordinates.x,
        }


class LocationMapSerializer(serializers.ModelSerializer):
    coordinates = serializers.SerializerMethodField()
    aggregate_profile = serializers.SerializerMethodField()
    current_user_review = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = [
            "id",
            "google_place_id",
            "name",
            "address",
            "coordinates",
            "aggregate_profile",
            "current_user_review",
            "is_favorited",
        ]

    def get_coordinates(self, obj):
        coordinates = obj.coordinates
        if coordinates is None:
            return None

        return {
            "latitude": coordinates.y,
            "longitude": coordinates.x,
        }

    def get_aggregate_profile(self, obj):
        profile = next(iter(obj.aggregate_profiles.all()), None)
        if profile is None:
            return None

        return AIAggregateProfileSummarySerializer(profile).data

    def get_current_user_review(self, obj):
        request = self.context.get('request')
        if not request or not getattr(request, 'user', None) or not request.user.is_authenticated:
            return None

        review = next(iter(obj.reviews.filter(user=request.user).order_by('-created_at')), None)
        if not review:
            return None

        return UserReviewSerializer(review).data

    def get_is_favorited(self, obj):
        request = self.context.get('request')
        if not request or not getattr(request, 'user', None) or not request.user.is_authenticated:
            return False

        fav = obj.favorited_by.filter(user=request.user).exists()
        return bool(fav)


class AIProfileGenerationJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIProfileGenerationJob
        fields = (
            "id",
            "location",
            "status",
            "process_task_id",
            "fetch_task_id",
            "score_task_id",
            "error",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class UserReviewSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)
    user = serializers.CharField(source='user.username', read_only=True)
    reviewer = serializers.SerializerMethodField()

    class Meta:
        model = UserReview
        fields = (
            'id',
            'user',
            'reviewer',
            'laptop_friendly',
            'study_friendly',
            'overall_corwdness',
            'noise_level',
            'overall_rating',
            'comment',
            'created_at',
        )
        read_only_fields = ('overall_rating', 'created_at')

    def get_reviewer(self, obj):
        user = getattr(obj, 'user', None)
        profile = getattr(user, 'profile', None) if user else None
        avatar = None
        if profile and getattr(profile, 'avatar', None):
            try:
                if profile.avatar:
                    avatar = profile.avatar.url
            except Exception:
                avatar = None

        display_name = None
        if user:
            display_name = user.get_full_name().strip() if hasattr(user, 'get_full_name') else ''
            if not display_name:
                display_name = user.username

        request = self.context.get('request')
        if avatar and request is not None:
            try:
                avatar = request.build_absolute_uri(avatar)
            except Exception:
                pass

        return {
            'id': user.id if user else None,
            'username': user.username if user else None,
            'display_name': display_name,
            'avatar_url': avatar,
        }

    def validate(self, attrs):
        for field in ('laptop_friendly', 'study_friendly', 'overall_corwdness', 'noise_level'):
            val = attrs.get(field, None)
            if val is None:
                continue
            try:
                f = float(val)
            except (TypeError, ValueError):
                raise serializers.ValidationError({field: 'Must be a number between 0 and 5.'})
            if not 0 <= f <= 5:
                raise serializers.ValidationError({field: 'Must be between 0 and 5.'})
        return super().validate(attrs)


class UserFavPlaceSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)
    user = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = UserFavPlace
        fields = ('id', 'user', 'location', 'custom_note', 'saved_at')
        read_only_fields = ('id', 'user', 'saved_at')
