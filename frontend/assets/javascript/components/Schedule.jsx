import { useEffect, useState } from 'react';
import {
  listAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  listSchoolClasses,
  createSchoolClass,
  deleteSchoolClass,
  listTaskBlocks,
  createTaskBlock,
  deleteTaskBlock,
} from '../api/client';
import { TaskForm } from './TaskForm';
import { ScheduleView } from './ScheduleView';

const DAYS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

const CLASS_TYPES = [
  { value: 'course', label: 'Course' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'lab', label: 'Lab' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'tutorial', label: 'Tutorial' },
];

const emptyClassForm = {
  name: '',
  class_type: 'course',
  day_of_week: 0,
  start_time: '',
  end_time: '',
  location: '',
};

const emptyTaskBlockForm = {
  assignment_id: '',
  start_time: '',
  end_time: '',
};

function isValidTime24(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function formatDateTime24(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function toMinutesFromHHmm(value) {
  const parts = value.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }
  return parts[0] * 60 + parts[1];
}

export function Schedule() {
  const [assignments, setAssignments] = useState([]);
  const [schoolClasses, setSchoolClasses] = useState([]);
  const [taskBlocks, setTaskBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [classForm, setClassForm] = useState(emptyClassForm);
  const [taskBlockForm, setTaskBlockForm] = useState(emptyTaskBlockForm);
  const [classFormLoading, setClassFormLoading] = useState(false);
  const [taskBlockFormLoading, setTaskBlockFormLoading] = useState(false);

  const fetchScheduleData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [assignmentsData, schoolClassesData, taskBlocksData] = await Promise.all([
        listAssignments(),
        listSchoolClasses(),
        listTaskBlocks(),
      ]);
      setAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
      setSchoolClasses(Array.isArray(schoolClassesData) ? schoolClassesData : []);
      setTaskBlocks(Array.isArray(taskBlocksData) ? taskBlocksData : []);
    } catch (err) {
      setError(err.message || 'Failed to load schedule data');
      setAssignments([]);
      setSchoolClasses([]);
      setTaskBlocks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduleData();
  }, []);

  const handleCreateTask = async (formData) => {
    try {
      setError(null);
      await createAssignment(formData);
      setShowTaskForm(false);
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to create assignment');
    }
  };

  const handleUpdateTask = async (taskId, formData) => {
    try {
      setError(null);
      await updateAssignment(taskId, formData);
      setEditingTask(null);
      setShowTaskForm(false);
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to update assignment');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;

    try {
      setError(null);
      await deleteAssignment(taskId);
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to delete assignment');
    }
  };

  const handleCreateSchoolClass = async (event) => {
    event.preventDefault();
    const name = classForm.name.trim();
    const startTime = classForm.start_time.trim();
    const endTime = classForm.end_time.trim();
    const dayOfWeek = Number(classForm.day_of_week);

    if (!name) {
      setError('Class name is required.');
      return;
    }
    if (!startTime || !endTime) {
      setError('School class requires both start and end time.');
      return;
    }
    if (!isValidTime24(startTime) || !isValidTime24(endTime)) {
      setError('Use 24h time format HH:mm (example: 16:00).');
      return;
    }
    if (endTime <= startTime) {
      setError('Class end time must be after start time.');
      return;
    }

    const hasDuplicate = schoolClasses.some((schoolClass) => (
      schoolClass.name?.trim().toLowerCase() === name.toLowerCase()
      && Number(schoolClass.day_of_week) === dayOfWeek
      && schoolClass.start_time?.slice(0, 5) === startTime
      && schoolClass.end_time?.slice(0, 5) === endTime
    ));

    if (hasDuplicate) {
      setError('This class already exists for the same day and time.');
      return;
    }

    const newStartMinutes = toMinutesFromHHmm(startTime);
    const newEndMinutes = toMinutesFromHHmm(endTime);
    const hasOverlap = schoolClasses.some((schoolClass) => {
      if (Number(schoolClass.day_of_week) !== dayOfWeek) {
        return false;
      }

      const existingStartMinutes = toMinutesFromHHmm((schoolClass.start_time || '').slice(0, 5));
      const existingEndMinutes = toMinutesFromHHmm((schoolClass.end_time || '').slice(0, 5));

      if (
        newStartMinutes == null
        || newEndMinutes == null
        || existingStartMinutes == null
        || existingEndMinutes == null
      ) {
        return false;
      }

      return existingStartMinutes < newEndMinutes && existingEndMinutes > newStartMinutes;
    });

    if (hasOverlap) {
      setError('This class overlaps with another class on the same day.');
      return;
    }

    try {
      setError(null);
      setClassFormLoading(true);
      await createSchoolClass({
        name,
        class_type: classForm.class_type,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        location: classForm.location.trim(),
      });
      setClassForm(emptyClassForm);
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to create school class');
    } finally {
      setClassFormLoading(false);
    }
  };

  const handleDeleteSchoolClass = async (schoolClassId) => {
    if (!confirm('Delete this school class?')) return;

    try {
      setError(null);
      await deleteSchoolClass(schoolClassId);
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to delete school class');
    }
  };

  const handleCreateTaskBlock = async (event) => {
    event.preventDefault();
    if (!taskBlockForm.assignment_id) {
      setError('Choose an assignment first.');
      return;
    }
    if (!taskBlockForm.start_time || !taskBlockForm.end_time) {
      setError('Task block requires start and end date/time.');
      return;
    }

    const start = new Date(taskBlockForm.start_time);
    const end = new Date(taskBlockForm.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError('Invalid task block time.');
      return;
    }

    if (end <= start) {
      setError('Task block end time must be after start time.');
      return;
    }

    try {
      setError(null);
      setTaskBlockFormLoading(true);
      await createTaskBlock({
        assignment_id: Number(taskBlockForm.assignment_id),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      setTaskBlockForm(emptyTaskBlockForm);
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to create task block');
    } finally {
      setTaskBlockFormLoading(false);
    }
  };

  const handleDeleteTaskBlock = async (taskBlockId) => {
    if (!confirm('Delete this task block?')) return;

    try {
      setError(null);
      await deleteTaskBlock(taskBlockId);
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to delete task block');
    }
  };

  const handleOpenForm = (task = null) => {
    setEditingTask(task);
    setShowTaskForm(true);
  };

  const handleCloseForm = () => {
    setShowTaskForm(false);
    setEditingTask(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Manage assignments, classes, and manual tasks as a demo.
          </p>
        </div>
        <button
          onClick={() => handleOpenForm()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          + Add Assignment
        </button>
      </div>

      {error ? (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {showTaskForm ? (
        <TaskForm
          task={editingTask}
          onSubmit={editingTask ? (data) => handleUpdateTask(editingTask.id, data) : handleCreateTask}
          onClose={handleCloseForm}
        />
      ) : null}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading schedule...</p>
        </div>
      ) : (
        <>
          <ScheduleView schoolClasses={schoolClasses} taskBlocks={taskBlocks} />

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card/60 p-4 md:p-6">
              <h2 className="text-xl font-semibold">School Classes</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add weekly fixed slots that represent your school timetable.
              </p>

              <form className="mt-4 space-y-3" onSubmit={handleCreateSchoolClass}>
                <input
                  type="text"
                  placeholder="Class name (e.g., OOP)"
                  value={classForm.name}
                  onChange={(event) => setClassForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2"
                />

                <select
                  value={classForm.class_type}
                  onChange={(event) => setClassForm((prev) => ({ ...prev, class_type: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2"
                >
                  {CLASS_TYPES.map((classType) => (
                    <option key={classType.value} value={classType.value}>{classType.label}</option>
                  ))}
                </select>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <select
                    value={classForm.day_of_week}
                    onChange={(event) => setClassForm((prev) => ({ ...prev, day_of_week: event.target.value }))}
                    className="rounded-lg border border-input bg-background px-3 py-2"
                  >
                    {DAYS.map((day) => (
                      <option key={day.value} value={day.value}>{day.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    value={classForm.start_time}
                    onChange={(event) => setClassForm((prev) => ({ ...prev, start_time: event.target.value.trim() }))}
                    className="rounded-lg border border-input bg-background px-3 py-2"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    value={classForm.end_time}
                    onChange={(event) => setClassForm((prev) => ({ ...prev, end_time: event.target.value.trim() }))}
                    className="rounded-lg border border-input bg-background px-3 py-2"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Use 24h format, for example 16:00.</p>

                <input
                  type="text"
                  placeholder="Location (optional)"
                  value={classForm.location}
                  onChange={(event) => setClassForm((prev) => ({ ...prev, location: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2"
                />

                <button
                  type="submit"
                  disabled={classFormLoading}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {classFormLoading ? 'Adding class...' : 'Add School Class'}
                </button>
              </form>

              <div className="mt-4 space-y-2">
                {schoolClasses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No classes yet.</p>
                ) : (
                  schoolClasses.map((schoolClass) => (
                    <div key={schoolClass.id} className="rounded-lg border bg-background p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{schoolClass.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {DAYS[schoolClass.day_of_week]?.label} {schoolClass.start_time.slice(0, 5)}-{schoolClass.end_time.slice(0, 5)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {CLASS_TYPES.find((classType) => classType.value === schoolClass.class_type)?.label || 'Course'}
                          </p>
                          {schoolClass.location ? (
                            <p className="text-xs text-muted-foreground">{schoolClass.location}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSchoolClass(schoolClass.id)}
                          className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-card/60 p-4 md:p-6">
              <h2 className="text-xl font-semibold">Manual Task Blocks</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Temporary scheduler for testing - TO BE IMPLEMENTED
              </p>

              <form className="mt-4 space-y-3" onSubmit={handleCreateTaskBlock}>
                <select
                  value={taskBlockForm.assignment_id}
                  onChange={(event) => setTaskBlockForm((prev) => ({ ...prev, assignment_id: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2"
                >
                  <option value="">Select assignment</option>
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
                  ))}
                </select>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    type="datetime-local"
                    lang="en-GB"
                    step="60"
                    value={taskBlockForm.start_time}
                    onChange={(event) => setTaskBlockForm((prev) => ({ ...prev, start_time: event.target.value }))}
                    className="rounded-lg border border-input bg-background px-3 py-2"
                  />
                  <input
                    type="datetime-local"
                    lang="en-GB"
                    step="60"
                    value={taskBlockForm.end_time}
                    onChange={(event) => setTaskBlockForm((prev) => ({ ...prev, end_time: event.target.value }))}
                    className="rounded-lg border border-input bg-background px-3 py-2"
                  />
                </div>

                <button
                  type="submit"
                  disabled={taskBlockFormLoading}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-white hover:opacity-90 disabled:opacity-60"
                >
                  {taskBlockFormLoading ? 'Adding block...' : 'Add Task Block'}
                </button>
              </form>

              <div className="mt-4 space-y-2">
                {taskBlocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No task blocks yet.</p>
                ) : (
                  taskBlocks.map((taskBlock) => (
                    <div key={taskBlock.id} className="rounded-lg border bg-background p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{taskBlock.assignment?.title || 'Assignment block'}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime24(taskBlock.start_time)} - {formatDateTime24(taskBlock.end_time)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteTaskBlock(taskBlock.id)}
                          className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card/60 p-4 md:p-6">
            <h2 className="text-xl font-semibold">Assignments</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Homework and deliverables the planner should schedule around your classes.
            </p>

            <div className="mt-4 space-y-3">
              {assignments.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-card p-8 text-center">
                  <p className="text-muted-foreground">No assignments yet. Create one to get started.</p>
                </div>
              ) : (
                assignments.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{task.title}</h3>
                        {task.description ? (
                          <p className="text-muted-foreground text-sm mt-1">{task.description}</p>
                        ) : null}
                        <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
                          {task.estimated_duration_minutes ? (
                            <span>{task.estimated_duration_minutes} min</span>
                          ) : null}
                          {task.due_date ? (
                            <span>{new Date(task.due_date).toLocaleDateString()}</span>
                          ) : null}
                          <span className={`font-medium ${task.is_completed ? 'text-green-600' : 'text-amber-600'}`}>
                            {task.is_completed ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleOpenForm(task)}
                          className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:opacity-80 transition-opacity"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="px-3 py-1 text-sm bg-destructive/10 text-destructive rounded hover:bg-destructive/20 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
