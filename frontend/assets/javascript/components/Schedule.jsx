import { useEffect, useState } from 'react';
import {
  listAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from '../api/client';
import { TaskForm } from './TaskForm';

export function Schedule() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listAssignments();
      setAssignments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load assignments');
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const handleCreateTask = async (formData) => {
    try {
      setError(null);
      await createAssignment(formData);
      setShowTaskForm(false);
      fetchAssignments();
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
      fetchAssignments();
    } catch (err) {
      setError(err.message || 'Failed to update assignment');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;

    try {
      setError(null);
      await deleteAssignment(taskId);
      fetchAssignments();
    } catch (err) {
      setError(err.message || 'Failed to delete assignment');
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Schedule</h1>
          <p className="text-muted-foreground mt-1">Manage your assignments and study work</p>
        </div>
        <button
          onClick={() => handleOpenForm()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          + Add Assignment
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Task Form Modal */}
      {showTaskForm && (
        <TaskForm
          task={editingTask}
          onSubmit={editingTask ? (data) => handleUpdateTask(editingTask.id, data) : handleCreateTask}
          onClose={handleCloseForm}
        />
      )}

      {/* Tasks List */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading assignments...</p>
        </div>
      ) : assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center">
          <p className="text-muted-foreground">No assignments yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((task) => (
            <div
              key={task.id}
              className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{task.title}</h3>
                  {task.description && (
                    <p className="text-muted-foreground text-sm mt-1">{task.description}</p>
                  )}
                  <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
                    {task.estimated_duration_minutes && (
                      <span>{task.estimated_duration_minutes} min</span>
                    )}
                    {task.due_date && (
                      <span>{new Date(task.due_date).toLocaleDateString()}</span>
                    )}
                    <span className={`font-medium ${task.is_completed ? 'text-green-600' : 'text-amber-600'}`}>
                      {task.is_completed ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
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
          ))}
        </div>
      )}
    </div>
  );
}
