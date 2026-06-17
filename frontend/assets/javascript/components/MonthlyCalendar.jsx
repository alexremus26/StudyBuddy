import React, { useState } from 'react';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CATEGORY_COLORS = {
  homework: 'bg-blue-100 text-blue-800 border-blue-200',
  project: 'bg-purple-100 text-purple-800 border-purple-200',
  exam: 'bg-red-100 text-red-800 border-red-200',
  reading: 'bg-green-100 text-green-800 border-green-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
};

function formatTime(timeStr) {
  if (!timeStr) return '';
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return timeStr.slice(0, 5);
}

function getMonthDays(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Convert to Monday-based (0=Mon, 6=Sun)
}

export function MonthlyCalendar({ startDate, endDate, schoolClasses = [], taskBlocks = [] }) {
  const today = new Date();
  const [displayYear, setDisplayYear] = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth());

  const planStart = startDate ? new Date(startDate) : null;
  const planEnd = endDate ? new Date(endDate) : null;

  const handlePrevMonth = () => {
    if (displayMonth === 0) {
      setDisplayYear((y) => y - 1);
      setDisplayMonth(11);
    } else {
      setDisplayMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (displayMonth === 11) {
      setDisplayYear((y) => y + 1);
      setDisplayMonth(0);
    } else {
      setDisplayMonth((m) => m + 1);
    }
  };

  const daysInMonth = getMonthDays(displayYear, displayMonth);
  const firstDayOffset = getFirstDayOfWeek(displayYear, displayMonth);

  // Build the grid cells: leading blanks + real days
  const gridCells = [];
  for (let i = 0; i < firstDayOffset; i += 1) {
    gridCells.push({ type: 'blank', key: `blank-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    gridCells.push({ type: 'day', day, key: `day-${day}` });
  }

  // Pre-process task blocks per date string
  const blocksByDate = {};
  taskBlocks.forEach((tb) => {
    const d = new Date(tb.start_time);
    const dateStr = d.toISOString().split('T')[0];
    if (!blocksByDate[dateStr]) blocksByDate[dateStr] = [];
    blocksByDate[dateStr].push(tb);
  });

  const isToday = (day) => (
    today.getFullYear() === displayYear
    && today.getMonth() === displayMonth
    && today.getDate() === day
  );

  const isInPlanRange = (day) => {
    if (!planStart || !planEnd) return true;
    const date = new Date(displayYear, displayMonth, day);
    return date >= new Date(planStart.toDateString()) && date <= new Date(planEnd.toDateString());
  };

  const monthLabel = `${MONTH_NAMES[displayMonth]} ${displayYear}`;

  return (
    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
      {/* Month navigation header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
        <button
          onClick={handlePrevMonth}
          className="p-1.5 rounded-lg hover:bg-background border border-transparent hover:border-border transition-all"
          aria-label="Previous month"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-lg font-bold tracking-tight">{monthLabel}</h3>
        <button
          onClick={handleNextMonth}
          className="p-1.5 rounded-lg hover:bg-background border border-transparent hover:border-border transition-all"
          aria-label="Next month"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DAYS_OF_WEEK.map((day) => (
          <div key={day} className="p-2 text-center text-xs font-semibold text-muted-foreground border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {gridCells.map((cell) => {
          if (cell.type === 'blank') {
            return (
              <div key={cell.key} className="min-h-[100px] p-1.5 border-r border-b last:border-r-0 bg-muted/5" />
            );
          }

          const { day } = cell;
          const dateObj = new Date(displayYear, displayMonth, day);
          const dateStr = dateObj.toISOString().split('T')[0];
          const dayIndex = (dateObj.getDay() + 6) % 7; // 0=Monday, 6=Sunday
          const inRange = isInPlanRange(day);
          const todayHighlight = isToday(day);

          // Get school classes for this weekday
          const dayClasses = inRange ? schoolClasses.filter((c) => c.day_of_week === dayIndex) : [];
          // Get task blocks for this specific date
          const dayTasks = blocksByDate[dateStr] || [];

          // Combine and sort by start time
          const allItems = [
            ...dayClasses.map((c) => ({ ...c, itemType: 'class', sortTime: c.start_time })),
            ...dayTasks.map((t) => {
              const tTime = new Date(t.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
              return { ...t, itemType: 'task', sortTime: tTime };
            }),
          ].sort((a, b) => a.sortTime.localeCompare(b.sortTime));

          return (
            <div
              key={cell.key}
              className={`min-h-[120px] p-1.5 border-r border-b last:border-r-0 transition-colors ${
                inRange ? 'bg-background' : 'bg-muted/10 opacity-40'
              } ${todayHighlight ? 'ring-1 ring-inset ring-indigo-500/40' : ''}`}
            >
              <div className={`text-right text-xs font-medium mb-1 ${
                todayHighlight
                  ? 'text-indigo-600 font-bold'
                  : 'text-muted-foreground'
              }`}>
                {day}
              </div>

              <div className="space-y-1">
                {allItems.slice(0, 5).map((item, i) => {
                  if (item.itemType === 'class') {
                    return (
                      <div key={`class-${item.id || i}`} className="text-[10px] p-1 rounded bg-amber-50/80 text-amber-800 border border-amber-200/60 shadow-sm">
                        <div className="font-bold truncate" title={item.name}>{item.name}</div>
                        <div className="text-[8px] text-amber-700/80 mt-0.5">{formatTime(item.start_time)} - {formatTime(item.end_time)}</div>
                      </div>
                    );
                  }
                  const category = item.assignment?.category || 'other';
                  const colorClass = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
                  return (
                    <div key={`task-${item.id || i}`} className={`text-[10px] p-1 rounded border ${colorClass}`}>
                      <div className="font-bold truncate" title={item.assignment?.title || 'Study'}>
                        {item.assignment?.title || 'Study'}
                      </div>
                      <div className="text-[8px] opacity-80 mt-0.5">{formatTime(item.start_time)} - {formatTime(item.end_time)}</div>
                      {item.assignment?.due_date && dateStr === item.assignment.due_date.split('T')[0] && (
                        <div className="text-[8px] text-red-600 font-extrabold mt-0.5">DUE TODAY</div>
                      )}
                    </div>
                  );
                })}
                {allItems.length > 5 && (
                  <div className="text-[9px] text-muted-foreground text-center font-medium mt-1">
                    +{allItems.length - 5} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
