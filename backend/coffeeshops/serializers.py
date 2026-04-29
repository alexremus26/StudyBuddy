from rest_framework import serializers

from .models import AIAggregateProfile, Location


class AIAggregateProfileSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    ai_description = serializers.CharField(source="AIdescription", allow_blank=True, allow_null=True, read_only=True)
    laptop_friendly = serializers.FloatField(read_only=True)
    study_friendly = serializers.FloatField(read_only=True)
    overall_crowdness = serializers.FloatField(source="overall_corwdness", read_only=True)
    noise_level = serializers.FloatField(read_only=True)
    overall_rating = serializers.FloatField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class LocationMapSerializer(serializers.ModelSerializer):
    coordinates = serializers.SerializerMethodField()
    aggregate_profile = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = [
            "id",
            "google_place_id",
            "name",
            "address",
            "coordinates",
            "aggregate_profile",
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