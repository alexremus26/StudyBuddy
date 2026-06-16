import zoneinfo
from django.utils import timezone
from .models import UserProfile, Achievement, UserAchievement

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
    total_minutes = 0
    for block in completed_blocks:
        local_dt = block.start_time.astimezone(tz)
        local_dates.add(local_dt.date())
        # Calculate duration
        duration = (block.end_time - block.start_time).total_seconds() / 60
        total_minutes += max(duration, 0)

    # 1. Update total study hours (convert minutes to full hours)
    profile.total_study_hours = int(total_minutes // 60)

    sorted_dates = sorted(list(local_dates), reverse=True)
    now_local = timezone.now().astimezone(tz).date()
    yesterday_local = now_local - timezone.timedelta(days=1)

    # 2. Calculate current streak
    if not sorted_dates:
        profile.current_streak = 0
    else:
        most_recent = sorted_dates[0]
        if most_recent != now_local and most_recent != yesterday_local:
            profile.current_streak = 0
        else:
            streak = 1
            current_expected = most_recent - timezone.timedelta(days=1)
            for d in sorted_dates[1:]:
                if d == current_expected:
                    streak += 1
                    current_expected = d - timezone.timedelta(days=1)
                elif d > current_expected:
                    continue
                else:
                    break
            profile.current_streak = streak

    profile.save(update_fields=["current_streak", "total_study_hours"])

    # 3. Seed and check achievements
    seed_default_achievements()
    check_and_award_achievements(user, profile, completed_blocks, local_dates, tz)

    return profile.current_streak

def seed_default_achievements():
    default_achievements = [
        {
            "name": "First Step",
            "description": "Check off your first study session block.",
            "rarity": 95,
            "points_awarded": 10,
        },
        {
            "name": "Streak Starter",
            "description": "Maintain a study streak of 3 days.",
            "rarity": 70,
            "points_awarded": 25,
        },
        {
            "name": "Streak Elite",
            "description": "Maintain a study streak of 7 days.",
            "rarity": 30,
            "points_awarded": 50,
        },
        {
            "name": "Academic Beast",
            "description": "Complete 5 study sessions in a single day.",
            "rarity": 15,
            "points_awarded": 100,
        },
        {
            "name": "Night Owl",
            "description": "Complete a study session ending after 10:00 PM (22:00).",
            "rarity": 50,
            "points_awarded": 30,
        },
        {
            "name": "Weekend Warrior",
            "description": "Complete a study session on a Saturday or Sunday.",
            "rarity": 60,
            "points_awarded": 40,
        },
    ]

    for data in default_achievements:
        Achievement.objects.get_or_create(
            name=data["name"],
            defaults={
                "description": data["description"],
                "rarity": data["rarity"],
                "points_awarded": data["points_awarded"]
            }
        )

def check_and_award_achievements(user, profile, completed_blocks, local_dates, tz):
    earned_ids = set(user.achievements.values_list("achievement_id", flat=True))

    def award(achievement_name):
        ach = Achievement.objects.filter(name=achievement_name).first()
        if ach and ach.id not in earned_ids:
            UserAchievement.objects.create(user=user, achievement=ach)
            earned_ids.add(ach.id)

    # Rule: First Step (Count of completed task blocks >= 1)
    if completed_blocks.count() >= 1:
        award("First Step")

    # Rule: Streak Starter (Streak >= 3)
    if profile.current_streak >= 3:
        award("Streak Starter")

    # Rule: Streak Elite (Streak >= 7)
    if profile.current_streak >= 7:
        award("Streak Elite")

    # Rule: Academic Beast (5+ study sessions in a single local day)
    date_counts = {}
    for block in completed_blocks:
        local_date = block.start_time.astimezone(tz).date()
        date_counts[local_date] = date_counts.get(local_date, 0) + 1
    if any(count >= 5 for count in date_counts.values()):
        award("Academic Beast")

    # Rule: Night Owl (completed block ending after 22:00 local time)
    has_late_night = False
    for block in completed_blocks:
        local_end = block.end_time.astimezone(tz)
        if local_end.hour >= 22 or (local_end.hour == 21 and local_end.minute > 0):
            has_late_night = True
            break
    if has_late_night:
        award("Night Owl")

    # Rule: Weekend Warrior (completed block on Sat/Sun)
    has_weekend = False
    for d in local_dates:
        if d.weekday() in (5, 6):
            has_weekend = True
            break
    if has_weekend:
        award("Weekend Warrior")
