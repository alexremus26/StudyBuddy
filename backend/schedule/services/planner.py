import datetime
from django.utils import timezone
from app.models import Assignment, SchoolClass, TaskBlock
from schedule.models import GeneratedPlan, DraftTaskBlock

# Tunning
MAX_STUDY_MINUTES_PER_DAY = 180   # increased to 3h to ensure all items fit in a 2-month window
PREFERRED_STUDY_WINDOW = (14, 20) # prefer afternoon slots (14:00-20:00)
FALLBACK_STUDY_WINDOW = (9, 22)   # if afternoon is full, widen to 09-22
REST_DAY_EVERY_N = 3              # after N consecutive study days, force a rest day
SESSION_CHUNK_MINUTES = 60        # break large assignments into chunks of this size

def simulate_ai_categorization(assignment):
    """Keyword-based mock categorizer (placeholder for Gemini)."""
    title = assignment.title.lower()
    if 'exam' in title or 'test' in title or 'quiz' in title:
        assignment.category = Assignment.CATEGORY_EXAM
        assignment.priority = Assignment.PRIORITY_HIGH
    elif 'project' in title:
        assignment.category = Assignment.CATEGORY_PROJECT
        assignment.priority = Assignment.PRIORITY_HIGH
    elif 'read' in title or 'chapter' in title:
        assignment.category = Assignment.CATEGORY_READING
        assignment.priority = Assignment.PRIORITY_LOW
    else:
        assignment.category = Assignment.CATEGORY_HOMEWORK
        assignment.priority = Assignment.PRIORITY_MEDIUM
    assignment.save()

def get_school_classes_for_day(user, weekday):
    return SchoolClass.objects.filter(user=user, day_of_week=weekday)

def get_task_blocks_for_date(user, date_obj):
    start_of_day = timezone.make_aware(datetime.datetime.combine(date_obj, datetime.time.min))
    end_of_day = timezone.make_aware(datetime.datetime.combine(date_obj, datetime.time.max))
    return TaskBlock.objects.filter(user=user, start_time__gte=start_of_day, start_time__lte=end_of_day)

def has_conflict(start_time, end_time, busy_blocks):
    """Check overlap against a list of (start, end) tuples."""
    for bs, be in busy_blocks:
        if start_time < be and end_time > bs:
            return True
    return False

def _busy_blocks_for_day(user, plan, date_obj):
    """Return a list of (start, end) tuples for everything already booked."""
    blocks = []

    # School classes (recurring weekly)
    weekday = date_obj.weekday()
    for sc in get_school_classes_for_day(user, weekday):
        sc_start = timezone.make_aware(datetime.datetime.combine(date_obj, sc.start_time))
        sc_end = timezone.make_aware(datetime.datetime.combine(date_obj, sc.end_time))
        blocks.append((sc_start, sc_end))

    # Existing (approved) task blocks
    for tb in get_task_blocks_for_date(user, date_obj):
        blocks.append((tb.start_time, tb.end_time))

    # Draft blocks already created in THIS plan
    start_of_day = timezone.make_aware(datetime.datetime.combine(date_obj, datetime.time.min))
    end_of_day = timezone.make_aware(datetime.datetime.combine(date_obj, datetime.time.max))
    for db in plan.draft_blocks.filter(start_time__gte=start_of_day, start_time__lte=end_of_day):
        blocks.append((db.start_time, db.end_time))

    return blocks

def _study_minutes_on_day(plan, date_obj):
    """How many draft-study minutes are already scheduled on this date?"""
    start_of_day = timezone.make_aware(datetime.datetime.combine(date_obj, datetime.time.min))
    end_of_day = timezone.make_aware(datetime.datetime.combine(date_obj, datetime.time.max))
    total = 0
    for db in plan.draft_blocks.filter(start_time__gte=start_of_day, start_time__lte=end_of_day):
        total += (db.end_time - db.start_time).total_seconds() / 60
    return total

def _find_slot(date_obj, duration_mins, busy_blocks, hour_range):
    """Try every half-hour inside hour_range; return (start, end) or None."""
    for hour in range(hour_range[0], hour_range[1]):
        for minute in (0, 30):
            start = timezone.make_aware(datetime.datetime.combine(date_obj, datetime.time(hour, minute)))
            end = start + datetime.timedelta(minutes=duration_mins)
            # Don't bleed past the window
            window_end = timezone.make_aware(
                datetime.datetime.combine(date_obj, datetime.time(hour_range[1], 0))
            )
            if end > window_end:
                continue
            if not has_conflict(start, end, busy_blocks):
                return start, end
    return None

def generate_plan_for_user(user, start_date, end_date):
    # ── 1. Categorize ────────────────────────────────────────
    assignments = Assignment.objects.filter(user=user, is_completed=False)
    for assignment in assignments:
        simulate_ai_categorization(assignment)

    assignments = list(assignments)
    far_future = timezone.now() + datetime.timedelta(days=3650)
    
    # ── 2. Smart Sort: Deadline-critical first ──────────────────
    # Split into two groups:
    # - Items with imminent due dates (within plan window) = schedule ASAP
    # - Items with later/no due dates = schedule by priority
    imminent = []
    flexible = []
    
    for a in assignments:
        has_due_date = a.due_date is not None
        if has_due_date:
            due_date_obj = a.due_date.date() if hasattr(a.due_date, 'date') else a.due_date
            # Imminent if due date is within our plan window
            if start_date <= due_date_obj <= end_date:
                imminent.append(a)
            else:
                flexible.append(a)
        else:
            flexible.append(a)
    
    # Sort imminent by due date (earliest first), then by priority
    imminent.sort(key=lambda a: (a.due_date or far_future, -a.priority))
    # Sort flexible by priority (highest first), then due date
    flexible.sort(key=lambda a: (-a.priority, a.due_date or far_future))
    
    # Process imminent first, then flexible
    assignments = imminent + flexible
    
    # ── 2. Create the plan draft ─────────────────────────────
    plan = GeneratedPlan.objects.create(
        user=user,
        start_date=start_date,
        end_date=end_date,
        status=GeneratedPlan.STATUS_DRAFT,
    )

    # ── 3. Global Day-by-Day Scheduling ──────────────────────
    total_days = (end_date - start_date).days + 1
    day_list = [start_date + datetime.timedelta(days=i) for i in range(total_days)]
    
    # Track remaining work for each assignment
    work_debt = {a.id: (a.estimated_duration_minutes or 60) for a in assignments}
    
    for date_obj in day_list:
        # 1. Identify and rank candidates for TODAY
        candidates = []
        for a in assignments:
            if work_debt[a.id] <= 0:
                continue
            
            # Check if assignment is already past due relative to this date
            if a.due_date:
                due_date_obj = a.due_date.date() if hasattr(a.due_date, 'date') else a.due_date
                if date_obj > due_date_obj:
                    continue
                
                # Calculate urgency
                days_left = (due_date_obj - date_obj).days
                # Avoid division by zero, prioritize things due today/tomorrow heavily
                urgency_weight = 100.0 / (days_left + 1.0)
            else:
                # No due date = lower urgency
                urgency_weight = 1.0
            
            # Score = Urgency * Priority
            score = urgency_weight * float(a.priority)
            candidates.append({
                'score': score,
                'assignment': a,
                'days_left': days_left if a.due_date else 999
            })
            
        # Sort candidates by score (highest urgency/priority first)
        candidates.sort(key=lambda x: x['score'], reverse=True)
        
        # 2. Fill the day's schedule
        daily_minutes_used = 0
        
        for cand in candidates:
            if daily_minutes_used >= MAX_STUDY_MINUTES_PER_DAY:
                break
                
            a = cand['assignment']
            
            # Determine chunk size for today
            # We don't want to do more than SESSION_CHUNK_MINUTES of the SAME task in one day 
            # UNLESS it's due tomorrow and we have a lot left.
            max_chunk_for_today = SESSION_CHUNK_MINUTES
            if cand['days_left'] <= 1:
                max_chunk_for_today = MAX_STUDY_MINUTES_PER_DAY # Cram if urgent
                
            available_today = MAX_STUDY_MINUTES_PER_DAY - daily_minutes_used
            chunk_duration = min(work_debt[a.id], max_chunk_for_today, available_today)
            
            if chunk_duration < 15:
                continue
                
            busy = _busy_blocks_for_day(user, plan, date_obj)
            
            # Find a slot
            slot = _find_slot(date_obj, chunk_duration, busy, PREFERRED_STUDY_WINDOW)
            if slot is None:
                slot = _find_slot(date_obj, chunk_duration, busy, FALLBACK_STUDY_WINDOW)
                
            if slot:
                DraftTaskBlock.objects.create(
                    plan=plan,
                    assignment=a,
                    start_time=slot[0],
                    end_time=slot[1],
                )
                work_debt[a.id] -= chunk_duration
                daily_minutes_used += chunk_duration

    return plan
