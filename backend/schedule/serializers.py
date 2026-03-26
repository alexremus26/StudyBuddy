from django.utils import timezone
from rest_framework import serializers

from app.models import Task, TaskBlock

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


def _ensure_task_belongs_to_user(task, user):
    """Defense-in-depth: verify task ownership."""
    if task and user and task.user_id != user.id:
        raise serializers.ValidationError(
            {"task_id": "Selected task does not belong to the authenticated user."}
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


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
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


class TaskCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = [
            "title",
            "description",
            "estimated_duration_minutes",
            "due_date",
        ]


class TaskEditSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = [
            "title",
            "description",
            "estimated_duration_minutes",
            "is_completed",
            "due_date",
        ]


class TaskBlockSerializer(serializers.ModelSerializer):
    task = TaskSerializer(read_only=True)
    task_id = serializers.PrimaryKeyRelatedField(
        source="task", queryset=Task.objects.none(), write_only=True
    )

    class Meta:
        model = TaskBlock
        fields = [
            "id",
            "task",
            "task_id",
            "start_time",
            "end_time",
            "actual_duration_minutes",
            "completed",
        ]
        read_only_fields = ["id", "task"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["task_id"].queryset = Task.objects.filter(user=request.user)

    def validate(self, attrs):
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        task = attrs.get("task")
        request = self.context.get("request")
        user = request.user if request else None

        _validate_time_window(start_time, end_time)

        actual_duration = attrs.get("actual_duration_minutes")
        _validate_duration(actual_duration)

        _ensure_task_belongs_to_user(task, user)

        exclude_id = self.instance.id if self.instance else None
        if _has_overlap(user, start_time, end_time, exclude_id=exclude_id):
            raise serializers.ValidationError(
                {"non_field_errors": "This time slot overlaps with an existing task block."}
            )

        return attrs


class TaskBlockCreateSerializer(serializers.ModelSerializer):
    task_id = serializers.PrimaryKeyRelatedField(
        source="task", queryset=Task.objects.none()
    )

    class Meta:
        model = TaskBlock
        fields = [
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
            self.fields["task_id"].queryset = Task.objects.filter(user=request.user)

    def validate(self, attrs):
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        task = attrs.get("task")
        request = self.context.get("request")
        user = request.user if request else None

        _validate_time_window(start_time, end_time)

        actual_duration = attrs.get("actual_duration_minutes")
        _validate_duration(actual_duration)

        _ensure_task_belongs_to_user(task, user)

        if _has_overlap(user, start_time, end_time):
            raise serializers.ValidationError(
                {"non_field_errors": "This time slot overlaps with an existing task block."}
            )

        return attrs


class TaskBlockEditSerializer(serializers.ModelSerializer):
    task_id = serializers.PrimaryKeyRelatedField(
        source="task", queryset=Task.objects.none(), required=False
    )

    class Meta:
        model = TaskBlock
        fields = [
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
            self.fields["task_id"].queryset = Task.objects.filter(user=request.user)

    def validate(self, attrs):
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        task = attrs.get("task", getattr(self.instance, "task", None))
        request = self.context.get("request")
        user = request.user if request else None

        _validate_time_window(start_time, end_time)

        actual_duration = attrs.get("actual_duration_minutes", getattr(self.instance, "actual_duration_minutes", None))
        _validate_duration(actual_duration)

        _ensure_task_belongs_to_user(task, user)

        if _has_overlap(user, start_time, end_time, exclude_id=self.instance.id):
            raise serializers.ValidationError(
                {"non_field_errors": "This time slot overlaps with an existing task block."}
            )

        return attrs


class TaskBlockBulkCreateSerializer(serializers.Serializer):
    task_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Task.objects.none()),
        allow_empty=False,
    )
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()
    completed = serializers.BooleanField(default=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["task_ids"].child.queryset = Task.objects.filter(
                user=request.user
            )

    def validate_task_ids(self, value):
        """Ensure no duplicates and respect max batch size."""
        task_id_values = [t.id for t in value]
        if len(task_id_values) != len(set(task_id_values)):
            raise serializers.ValidationError("task_ids contains duplicate tasks.")
        if len(value) > MAX_BULK_TASKS:
            raise serializers.ValidationError(
                f"Maximum {MAX_BULK_TASKS} tasks allowed per bulk request."
            )
        return value

    def validate(self, attrs):
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        task_ids = attrs.get("task_ids", [])
        request = self.context.get("request")
        user = request.user if request else None

        _validate_time_window(start_time, end_time)

        for task in task_ids:
            _ensure_task_belongs_to_user(task, user)

        if _has_overlap(user, start_time, end_time):
            raise serializers.ValidationError(
                {"non_field_errors": "This time slot overlaps with an existing task block."}
            )

        return attrs

    def create(self, validated_data):
        user = validated_data.pop("user")
        task_ids = validated_data.pop("task_ids")

        created_blocks = []
        for task in task_ids:
            created_blocks.append(
                TaskBlock.objects.create(user=user, task=task, **validated_data)
            )
        return created_blocks

