import { useState } from 'react';

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CLASS_TYPE_LABELS = {
  course: 'Course',
  seminar: 'Seminar',
  lab: 'Lab',
  workshop: 'Workshop',
  tutorial: 'Tutorial',
};

const CATEGORY_COLORS = {
  homework: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  project: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  exam: 'bg-red-500/10 text-red-700 border-red-500/20',
  reading: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  other: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
};

function getSchoolDayFromDate(date) {
  return (date.getDay() + 6) % 7;
}

function toMinutesFromTimeString(timeString) {
  const [hour, minute] = timeString.split(':').map((v) => parseInt(v, 10));
  return hour * 60 + minute;
}

function toMinutesFromDate(date) {
  return date.getHours() * 60 + date.getMinutes();
}

const TrashIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

export function ScheduleView({ schoolClasses, taskBlocks, onDeleteSchoolClass, onDeleteTaskBlock }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);

  // Calculate the dates for the visible week
  const today = new Date();
  const currentDay = (today.getDay() + 6) % 7;
  const mondayOfSelectedWeek = new Date(today);
  mondayOfSelectedWeek.setDate(today.getDate() - currentDay + (weekOffset * 7));
  mondayOfSelectedWeek.setHours(0, 0, 0, 0);

  const sundayOfSelectedWeek = new Date(mondayOfSelectedWeek);
  sundayOfSelectedWeek.setDate(mondayOfSelectedWeek.getDate() + 6);
  sundayOfSelectedWeek.setHours(23, 59, 59, 999);

  const dateRangeStr = `${mondayOfSelectedWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${sundayOfSelectedWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;

  const eventsByDay = WEEK_DAYS.map(() => []);

  // 1. Process School Classes (Weekly Recurring)
  schoolClasses.forEach((sc) => {
    const dayIndex = sc.day_of_week;
    if (dayIndex < 0 || dayIndex > 6) return;
    const classTypeLabel = CLASS_TYPE_LABELS[String(sc.class_type || '').toLowerCase()] || 'Course';
    eventsByDay[dayIndex].push({
      id: `school-${sc.id}`,
      rawId: sc.id,
      type: 'school',
      title: sc.name,
      classTypeLabel,
      location: sc.location || '',
      timeLabel: `${sc.start_time.slice(0, 5)} - ${sc.end_time.slice(0, 5)}`,
      sortMinutes: toMinutesFromTimeString(sc.start_time),
    });
  });

  // 2. Process Task Blocks (Specific Dates)
  taskBlocks.forEach((tb) => {
    const blockDate = new Date(tb.start_time);
    const blockEnd = new Date(tb.end_time);
    
    // Only include if it's within the currently viewed week
    if (blockDate >= mondayOfSelectedWeek && blockDate <= sundayOfSelectedWeek) {
      const dayIndex = getSchoolDayFromDate(blockDate);
      eventsByDay[dayIndex].push({
        id: tb.id.toString().startsWith('draft') ? tb.id : `task-${tb.id}`,
        rawId: tb.id,
        type: 'task',
        isDraft: tb.id.toString().startsWith('draft'),
        title: tb.assignment?.title || 'Assignment block',
        category: tb.assignment?.category || 'other',
        timeLabel: `${blockDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} - ${blockEnd.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
        sortMinutes: toMinutesFromDate(blockDate),
      });
    }
  });

  eventsByDay.forEach((evs) => evs.sort((a, b) => a.sortMinutes - b.sortMinutes));

  return (
    <section className="rounded-xl border bg-card/60 p-4 md:p-6 shadow-sm overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold">Weekly Schedule</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              Week: <span className="font-medium text-foreground">{dateRangeStr}</span>
            </p>
            {weekOffset !== 0 && (
              <button 
                onClick={() => setWeekOffset(0)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
              >
                Back to Today
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex bg-muted p-1 rounded-lg border">
            <button 
              onClick={() => setWeekOffset(prev => prev - 1)}
              className="p-1 hover:bg-background rounded transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button 
              onClick={() => setWeekOffset(prev => prev + 1)}
              className="p-1 hover:bg-background rounded transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          <div className="hidden sm:flex gap-3 text-[10px] uppercase tracking-wider font-bold">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500/20 border border-amber-500/50" />
              <span className="text-muted-foreground">Classes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-indigo-500/20 border border-indigo-500/50" />
              <span className="text-muted-foreground">Study</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-7 w-full">
        {WEEK_DAYS.map((dayName, index) => {
          const dayDate = new Date(mondayOfSelectedWeek);
          dayDate.setDate(mondayOfSelectedWeek.getDate() + index);
          const isToday = new Date().toDateString() === dayDate.toDateString();

          return (
            <div
              key={dayName}
              className={`rounded-lg border bg-background/40 p-3 min-h-[300px] flex flex-col transition-all min-w-0
                ${isToday ? 'border-indigo-500/50 ring-1 ring-indigo-500/20 shadow-lg' : 'border-border/50'}`}
            >
              <div className={`mb-3 border-b pb-2 flex justify-between items-center ${isToday ? 'border-indigo-500/20' : ''}`}>
                <div className="flex flex-col">
                  <h3 className={`text-[10px] font-bold uppercase tracking-tight ${isToday ? 'text-indigo-600' : 'text-muted-foreground'}`}>
                    {dayName}
                  </h3>
                  <span className="text-[10px] font-medium opacity-50">{dayDate.getDate()} {dayDate.toLocaleDateString('en-GB', { month: 'short' })}</span>
                </div>
                {isToday && <span className="text-[9px] bg-indigo-600 text-white px-1 rounded-sm">NOW</span>}
              </div>

              <div className="space-y-2 flex-1">
                {eventsByDay[index].length === 0 ? (
                  <div className="h-full flex items-center justify-center py-8">
                    <p className="text-[10px] text-muted-foreground/60 italic">Free Day</p>
                  </div>
                ) : (
                  eventsByDay[index].map((event) => {
                    const isHovered = hoveredId === event.id;
                    return (
                      <article
                        key={event.id}
                        onMouseEnter={() => setHoveredId(event.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        className={`relative rounded-lg p-2 text-[11px] border transition-all min-w-0
                          ${event.type === 'school'
                            ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
                            : event.isDraft 
                              ? 'bg-indigo-500/5 border-dashed border-indigo-500/40 opacity-70 scale-95'
                              : `${CATEGORY_COLORS[event.category] || CATEGORY_COLORS.other} shadow-sm`
                          }`}
                      >
                        {isHovered && !event.isDraft && (event.type === 'school' ? onDeleteSchoolClass : onDeleteTaskBlock) && (
                          <button
                            onClick={() =>
                              event.type === 'school'
                                ? onDeleteSchoolClass?.(event.rawId)
                                : onDeleteTaskBlock?.(event.rawId)
                            }
                            className="absolute top-1 right-1 p-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/30 transition-colors z-10"
                          >
                            <TrashIcon />
                          </button>
                        )}

                        <div className="flex flex-col gap-0.5 min-w-0">
                          <p className={`font-bold leading-tight line-clamp-2 break-words ${event.isDraft ? 'italic' : ''}`}>
                            {event.isDraft ? '[PREVIEW] ' : ''}{event.title}
                          </p>
                          <p className="text-[9px] font-medium opacity-70">{event.timeLabel}</p>
                        </div>

                        {event.type === 'school' && (
                          <div className="mt-1 opacity-60 text-[9px] truncate">
                            {event.classTypeLabel}{event.location ? ` • ${event.location}` : ''}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
