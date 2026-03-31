from django.utils import timezone
from rest_framework import serializers

from app.models import Assignment, SchoolClass, TaskBlock

MAX_DURATION_MINUTES : int = 24 * 60
MAX_BULK_TASKS : int = 100


def _validate_aware(dt, field_name):
    """Ensure datetime is timezone-aware."""
    if dt is not None:
        if timezone.is_naive(dt) or dt.tzinfo is None:
            raise serializers.ValidationError(
                {field_name: f"{field_name} must be timezone-aware."}
            )


def _validate_time_window(start_time, end_time):
    """Validate start_time and end_time are aware and end_time > start_time."""
    _validate_aware(start_time, "start_time")
    _validate_aware(end_time, "end_time")
    if start_time and end_time and end_time <= start_time:
        raise serializers.ValidationError(
            {"end_time": "end_time must be after start_time."}
        )


def _validate_duration(value):
    """Ensure duration_minutes is non-negative and within reasonable bounds."""
    if value is None:
        return
    if value < 0:
        raise serializers.ValidationError(
            {"actual_duration_minutes": "Must be greater than or equal to 0."}
        )
    if value > MAX_DURATION_MINUTES:
        raise serializers.ValidationError(
            {"actual_duration_minutes": f"Must be <= {MAX_DURATION_MINUTES}."}
        )


def _ensure_assignment_belongs_to_user(assignment, user):
    """Defense-in-depth: verify assignment ownership."""
    if assignment and user and assignment.user_id != user.id:
        raise serializers.ValidationError(
            {"assignment_id": "Selected assignment does not belong to the authenticated user."}
        )


def _has_overlap(user, start_time, end_time, exclude_id=None):
    """Check if a task block overlaps any existing block for the same user."""
    if not (user and start_time and end_time):
        return False
    qs = TaskBlock.objects.filter(
        user=user,
        start_time__lt=end_time,
        end_time__gt=start_time,
    )
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return qs.exists()


def _validate_due_date(due_date):
    """Ensure due_date is not in the past."""
    if due_date is None:
        return
    today = timezone.localdate()
    if hasattr(due_date, 'date'):
        due_date = due_date.date()
    if due_date < today:
        raise serializers.ValidationError(
            {"due_date": "Due date cannot be in the past."}
        )


class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = [
            "id",
            "title",
            "description",
            "estimated_duration_minutes",
            "is_completed",
            "due_date",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AssignmentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = [
            "title",
            "description",
            "estimated_duration_minutes",
            "due_date",
        ]

    def validate_due_date(self, value):
        _validate_due_date(value)
        return value


class AssignmentEditSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = [
            "title",
            "description",
            "estimated_duration_minutes",
            "is_completed",
            "due_date",
        ]

    def validate_due_date(self, value):
        _validate_due_date(value)
        return value


class TaskBlockSerializer(serializers.ModelSerializer):
    assignment = AssignmentSerializer(read_only=True)
    assignment_id = serializers.PrimaryKeyRelatedField(
        source="assignment", queryset=Assignment.objects.none(), write_only=True
    )
    task_id = serializers.PrimaryKeyRelatedField(
        source="assignment", queryset=Assignment.objects.none(), write_only=True, required=False
    )

    class Meta:
        model = TaskBlock
        fields = [
            "id",
            "assignment",
            "assignment_id",
            "task_id",
            "start_time",
            "end_time",
            "actual_duration_minutes",
            "completed",
        ]
        read_only_fields = ["id", "assignment"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["assignment_id"].queryset = Assignment.objects.filter(user=request.user)
            self.fields["task_id"].queryset = Assignment.objects.filter(user=request.user)

    def validate(self, attrs):
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        assignment = attrs.get("assignment")
        request = self.context.get("request")
        user = request.user if request else None

        _validate_time_window(start_time, end_time)

        actual_duration = attrs.get("actual_duration_minutes")
        _validate_duration(actual_duration)

        _ensure_assignment_belongs_to_user(assignment, user)

        exclude_id = self.instance.id if self.instance else None
        if _has_overlap(user, start_time, end_time, exclude_id=exclude_id):
            raise serializers.ValidationError(
                {"non_field_errors": "This time slot overlaps with an existing task block."}
            )

        return attrs


class TaskBlockCreateSerializer(serializers.ModelSerializer):
    assignment_id = serializers.PrimaryKeyRelatedField(
        source="assignment", queryset=Assignment.objects.none()
    )
    task_id = serializers.PrimaryKeyRelatedField(
        source="assignment", queryset=Assignment.objects.none(), required=False
    )

    class Meta:
        model = TaskBlock
        fields = [
            "assignment_id",
            "task_id",
            "start_time",
            "end_time",
            "actual_duration_minutes",
            "completed",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["assignment_id"].queryset = Assignment.objects.filter(user=request.user)
            self.fields["task_id"].queryset = Assignment.objects.filter(user=request.user)

    def validate(self, attrs):
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        assignment = attrs.get("assignment")
        request = self.context.get("request")
        user = request.user if request else None

        _validate_time_window(start_time, end_time)

        actual_duration = attrs.get("actual_duration_minutes")
        _validate_duration(actual_duration)

        _ensure_assignment_belongs_to_user(assignment, user)

        if _has_overlap(user, start_time, end_time):
            raise serializers.ValidationError(
                {"non_field_errors": "This time slot overlaps with an existing task block."}
            )

        return attrs


class TaskBlockEditSerializer(serializers.ModelSerializer):
    assignment_id = serializers.PrimaryKeyRelatedField(
        source="assignment", queryset=Assignment.objects.none(), required=False
    )
    task_id = serializers.PrimaryKeyRelatedField(
        source="assignment", queryset=Assignment.objects.none(), required=False
    )

    class Meta:
        model = TaskBlock
        fields = [
            "assignment_id",
            "task_id",
            "start_time",
            "end_time",
            "actual_duration_minutes",
            "completed",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["assignment_id"].queryset = Assignment.objects.filter(user=request.user)
            self.fields["task_id"].queryset = Assignment.objects.filter(user=request.user)

    def validate(self, attrs):
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        assignment = attrs.get("assignment", getattr(self.instance, "assignment", None))
        request = self.context.get("request")
        user = request.user if request else None

        _validate_time_window(start_time, end_time)

        actual_duration = attrs.get("actual_duration_minutes", getattr(self.instance, "actual_duration_minutes", None))
        _validate_duration(actual_duration)

        _ensure_assignment_belongs_to_user(assignment, user)

        if _has_overlap(user, start_time, end_time, exclude_id=self.instance.id):
            raise serializers.ValidationError(
                {"non_field_errors": "This time slot overlaps with an existing task block."}
            )

        return attrs


class TaskBlockBulkCreateSerializer(serializers.Serializer):
    assignment_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Assignment.objects.none()),
        allow_empty=False,
        required=False,
    )
    task_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Assignment.objects.none()),
        allow_empty=False,
        required=False,
    )
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()
    completed = serializers.BooleanField(default=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["assignment_ids"].child.queryset = Assignment.objects.filter(
                user=request.user
            )
            self.fields["task_ids"].child.queryset = Assignment.objects.filter(
                user=request.user
            )

    def validate_assignment_ids(self, value):
        """Ensure no duplicates and respect max batch size."""
        assignment_id_values = [assignment.id for assignment in value]
        if len(assignment_id_values) != len(set(assignment_id_values)):
            raise serializers.ValidationError("assignment_ids contains duplicate assignments.")
        if len(value) > MAX_BULK_TASKS:
            raise serializers.ValidationError(
                f"Maximum {MAX_BULK_TASKS} assignments allowed per bulk request."
            )
        return value

    def validate(self, attrs):
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        assignment_ids = attrs.get("assignment_ids") or attrs.get("task_ids") or []
        request = self.context.get("request")
        user = request.user if request else None

        if not assignment_ids:
            raise serializers.ValidationError(
                {"assignment_ids": "Provide assignment_ids (or legacy task_ids)."}
            )

        assignment_id_values = [assignment.id for assignment in assignment_ids]
        if len(assignment_id_values) != len(set(assignment_id_values)):
            raise serializers.ValidationError(
                {"assignment_ids": "assignment_ids contains duplicate assignments."}
            )
        if len(assignment_ids) > MAX_BULK_TASKS:
            raise serializers.ValidationError(
                {"assignment_ids": f"Maximum {MAX_BULK_TASKS} assignments allowed per bulk request."}
            )

        _validate_time_window(start_time, end_time)

        for assignment in assignment_ids:
            _ensure_assignment_belongs_to_user(assignment, user)

        if _has_overlap(user, start_time, end_time):
            raise serializers.ValidationError(
                {"non_field_errors": "This time slot overlaps with an existing task block."}
            )

        attrs["assignment_ids"] = assignment_ids

        return attrs

    def create(self, validated_data):
        user = validated_data.pop("user")
        assignment_ids = validated_data.pop("assignment_ids")

        created_blocks = []
        for assignment in assignment_ids:
            created_blocks.append(
                TaskBlock.objects.create(user=user, assignment=assignment, **validated_data)
            )
        return created_blocks


class SchoolClassSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolClass
        fields = [
            "id",
            "name",
            "class_type",
            "day_of_week",
            "start_time",
            "end_time",
            "location",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        user = request.user if request else None

        name = attrs.get("name", getattr(self.instance, "name", ""))
        day_of_week = attrs.get("day_of_week", getattr(self.instance, "day_of_week", None))
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))

        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError(
                {"end_time": "end_time must be after start_time."}
            )

        if user and name and day_of_week is not None and start_time and end_time:
            duplicate_qs = SchoolClass.objects.filter(
                user=user,
                day_of_week=day_of_week,
                start_time=start_time,
                end_time=end_time,
                name__iexact=name.strip(),
            )
            if self.instance:
                duplicate_qs = duplicate_qs.exclude(id=self.instance.id)
            if duplicate_qs.exists():
                raise serializers.ValidationError(
                    {
                        "non_field_errors": "A class with the same name, day, and time already exists.",
                    }
                )

            overlap_qs = SchoolClass.objects.filter(
                user=user,
                day_of_week=day_of_week,
                start_time__lt=end_time,
                end_time__gt=start_time,
            )
            if self.instance:
                overlap_qs = overlap_qs.exclude(id=self.instance.id)
            if overlap_qs.exists():
                raise serializers.ValidationError(
                    {
                        "non_field_errors": "This class overlaps with an existing class on the same day.",
                    }
                )

        return attrs

