const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CLASS_TYPE_LABELS = {
  course: 'Course',
  seminar: 'Seminar',
  lab: 'Lab',
  workshop: 'Workshop',
  tutorial: 'Tutorial',
};

function getSchoolDayFromDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return (date.getDay() + 6) % 7;
}

function toMinutesFromTimeString(timeString) {
  const [hour, minute] = timeString.split(':').map((value) => parseInt(value, 10));
  return hour * 60 + minute;
}

function toMinutesFromDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }
  return date.getHours() * 60 + date.getMinutes();
}

function formatTime24(date) {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTimeRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
    return `${formatTime24(startDate)} - ${formatTime24(endDate)}`;
  }

  return `${start} - ${end}`;
}

export function ScheduleView({ schoolClasses, taskBlocks }) {
  const eventsByDay = WEEK_DAYS.map(() => []);

  schoolClasses.forEach((schoolClass) => {
    const dayIndex = schoolClass.day_of_week;
    if (dayIndex < 0 || dayIndex > 6) {
      return;
    }

    const classTypeLabel = CLASS_TYPE_LABELS[String(schoolClass.class_type || '').toLowerCase()] || 'Course';

    eventsByDay[dayIndex].push({
      id: `school-${schoolClass.id}`,
      type: 'school',
      title: schoolClass.name,
      classTypeLabel,
      location: schoolClass.location || '',
      timeLabel: `${schoolClass.start_time.slice(0, 5)} - ${schoolClass.end_time.slice(0, 5)}`,
      sortMinutes: toMinutesFromTimeString(schoolClass.start_time),
    });
  });

  taskBlocks.forEach((taskBlock) => {
    const dayIndex = getSchoolDayFromDate(taskBlock.start_time);
    if (dayIndex == null) {
      return;
    }

    const assignmentTitle = taskBlock.assignment?.title || 'Assignment block';
    const details = taskBlock.completed ? 'Completed block' : 'Scheduled study block';

    eventsByDay[dayIndex].push({
      id: `task-${taskBlock.id}`,
      type: 'task',
      title: assignmentTitle,
      details,
      timeLabel: formatTimeRange(taskBlock.start_time, taskBlock.end_time),
      sortMinutes: toMinutesFromDate(taskBlock.start_time),
    });
  });

  eventsByDay.forEach((events) => {
    events.sort((a, b) => a.sortMinutes - b.sortMinutes);
  });

  return (
    <section className="rounded-xl border bg-card/60 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Weekly Schedule</h2>
          <p className="text-sm text-muted-foreground">
            Manual output view for classes and task blocks.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-7">
        {WEEK_DAYS.map((dayName, index) => (
          <div key={dayName} className="rounded-lg border bg-background/70 p-3 min-h-44">
            <div className="mb-2 border-b pb-2">
              <h3 className="text-sm font-semibold">{dayName}</h3>
            </div>

            <div className="space-y-2">
              {eventsByDay[index].length === 0 ? (
                <p className="text-xs text-muted-foreground">No blocks yet</p>
              ) : (
                eventsByDay[index].map((event) => (
                  <article
                    key={event.id}
                    className={`rounded-md p-2 text-xs border ${
                      event.type === 'school'
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-emerald-500/10 border-emerald-500/30'
                    }`}
                  >
                    <p className="font-semibold">{event.title}</p>
                    {event.type === 'school' ? (
                      <p className="mt-1 text-muted-foreground">{event.classTypeLabel}</p>
                    ) : null}
                    <p className="mt-1 text-muted-foreground">{event.timeLabel}</p>
                    {event.type === 'school' ? (
                      event.location ? <p className="mt-1 text-muted-foreground">Location: {event.location}</p> : null
                    ) : (
                      <p className="mt-1 text-muted-foreground">{event.details}</p>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
