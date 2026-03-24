from rest_framework import serializers

from app.models import Task, TaskBlock


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

        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError(
                {"end_time": "end_time must be after start_time."}
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

        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError(
                {"end_time": "end_time must be after start_time."}
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

        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError(
                {"end_time": "end_time must be after start_time."}
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

    def validate(self, attrs):
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError(
                {"end_time": "end_time must be after start_time."}
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

