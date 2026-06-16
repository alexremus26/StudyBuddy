import zoneinfo
from django.utils import timezone
from .models import UserProfile

def update_user_streak(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    try:
        tz = zoneinfo.ZoneInfo(profile.timezone)
    except Exception:
        tz = zoneinfo.ZoneInfo("UTC")

    # Fetch all completed task blocks for that user, ordered by start_time descending
    completed_blocks = user.task_blocks.filter(
        completed=True
    ).order_by("-start_time")

    local_dates = set()
    for block in completed_blocks:
        local_dt = block.start_time.astimezone(tz)
        local_dates.add(local_dt.date())

    sorted_dates = sorted(list(local_dates), reverse=True)

    now_local = timezone.now().astimezone(tz).date()
    yesterday_local = now_local - timezone.timedelta(days=1)

    if not sorted_dates:
        profile.current_streak = 0
        profile.save(update_fields=["current_streak"])
        return 0

    # If the user has not completed any task today or yesterday, the streak is broken (0)
    most_recent = sorted_dates[0]
    if most_recent != now_local and most_recent != yesterday_local:
        profile.current_streak = 0
        profile.save(update_fields=["current_streak"])
        return 0

    # Calculate streak
    streak = 1
    current_expected = most_recent - timezone.timedelta(days=1)

    for d in sorted_dates[1:]:
        if d == current_expected:
            streak += 1
            current_expected = d - timezone.timedelta(days=1)
        elif d > current_expected:
            # Skip duplicate tasks completed on the same date (already handled by set, but safe fallback)
            continue
        else:
            # Gap detected, break
            break

    profile.current_streak = streak
    profile.save(update_fields=["current_streak"])
    return streak
