import React from 'react';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CATEGORY_COLORS = {
  homework: 'bg-blue-100 text-blue-800 border-blue-200',
  project: 'bg-purple-100 text-purple-800 border-purple-200',
  exam: 'bg-red-100 text-red-800 border-red-200',
  reading: 'bg-green-100 text-green-800 border-green-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
};

function formatTime(timeStr) {
  // Assuming timeStr is like "14:00:00" or an ISO string
  if (!timeStr) return '';
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return timeStr.slice(0, 5);
}

export function MonthlyCalendar({ startDate, endDate, schoolClasses = [], taskBlocks = [] }) {
  // Compute start date of the grid (always a Monday)
  const start = new Date(startDate);
  // JS getDay() is 0=Sunday, 1=Monday... we want 0=Monday, 6=Sunday
  let dayOfWeek = start.getDay() - 1;
  if (dayOfWeek === -1) dayOfWeek = 6;
  
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - dayOfWeek);

  // Compute end date of the grid (always a Sunday)
  const end = new Date(endDate);
  let endDayOfWeek = end.getDay() - 1;
  if (endDayOfWeek === -1) endDayOfWeek = 6;
  const gridEnd = new Date(end);
  gridEnd.setDate(end.getDate() + (6 - endDayOfWeek));

  const days = [];
  let current = new Date(gridStart);
  
  while (current <= gridEnd) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  // Pre-process task blocks per day
  const blocksByDate = {};
  taskBlocks.forEach(tb => {
    const d = new Date(tb.start_time);
    const dateStr = d.toISOString().split('T')[0];
    if (!blocksByDate[dateStr]) blocksByDate[dateStr] = [];
    blocksByDate[dateStr].push(tb);
  });

  return (
    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="p-3 text-center text-sm font-semibold text-muted-foreground border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-7">
        {days.map((date, index) => {
          const dateStr = date.toISOString().split('T')[0];
          const isCurrentMonth = date >= new Date(startDate) && date <= new Date(endDate);
          const dayIndex = (date.getDay() + 6) % 7; // 0=Monday, 6=Sunday
          
          // Get school classes for this day of week
          const dayClasses = schoolClasses.filter(c => c.day_of_week === dayIndex);
          // Get tasks for this specific date
          const dayTasks = blocksByDate[dateStr] || [];
          
          // Combine and sort by start time
          const allItems = [
            ...dayClasses.map(c => ({ ...c, type: 'class', sortTime: c.start_time })),
            ...dayTasks.map(t => {
              const tTime = new Date(t.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
              return { ...t, type: 'task', sortTime: tTime };
            })
          ].sort((a, b) => a.sortTime.localeCompare(b.sortTime));

          return (
            <div 
              key={dateStr} 
              className={`min-h-[120px] p-2 border-r border-b last:border-r-0 ${
                index % 7 === 6 ? 'border-r-0' : ''
              } ${isCurrentMonth ? 'bg-background' : 'bg-muted/10 opacity-50'}`}
            >
              <div className="text-right text-xs font-medium text-muted-foreground mb-2">
                {date.getDate()} {date.getDate() === 1 ? date.toLocaleString('default', { month: 'short' }) : ''}
              </div>
              
              <div className="space-y-1">
                {allItems.map((item, i) => {
                  if (item.type === 'class') {
                    return (
                      <div key={`class-${i}`} className="text-[10px] p-1 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        <div className="font-semibold truncate">{item.name}</div>
                        <div>{formatTime(item.start_time)} - {formatTime(item.end_time)}</div>
                      </div>
                    );
                  } else {
                    const category = item.assignment?.category || 'other';
                    const colorClass = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
                    return (
                      <div key={`task-${i}`} className={`text-[10px] p-1 rounded border ${colorClass}`}>
                        <div className="font-semibold truncate">{item.assignment?.title || 'Study'}</div>
                        <div>{formatTime(item.start_time)} - {formatTime(item.end_time)}</div>
                        {item.assignment?.due_date && dateStr === item.assignment.due_date.split('T')[0] && (
                          <div className="text-red-600 font-bold mt-0.5">DUE TODAY</div>
                        )}
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
