import { useState, useEffect } from 'react';

export function TaskForm({ task, onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    estimated_duration_minutes: '',
    due_date: '',
    is_completed: false,
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (task) {
      const dueDate = task.due_date ? task.due_date.split('T')[0] : '';
      setFormData({
        title: task.title || '',
        description: task.description || '',
        estimated_duration_minutes: task.estimated_duration_minutes || '',
        due_date: dueDate,
        is_completed: task.is_completed || false,
      });
    }
  }, [task]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (formData.estimated_duration_minutes && isNaN(formData.estimated_duration_minutes)) {
      newErrors.estimated_duration_minutes = 'Must be a valid number';
    }

    if (formData.estimated_duration_minutes && formData.estimated_duration_minutes < 0) {
      newErrors.estimated_duration_minutes = 'Duration must be positive';
    }

    if (formData.due_date) {
      const selectedDate = new Date(formData.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (selectedDate < today) {
        newErrors.due_date = 'Due date cannot be in the past';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
      };

      if (formData.estimated_duration_minutes) {
        payload.estimated_duration_minutes = parseInt(formData.estimated_duration_minutes, 10);
      }

      if (formData.due_date) {
        payload.due_date = formData.due_date;
      }

      // Only include is_completed if editing an existing task
      if (task) {
        payload.is_completed = formData.is_completed;
      }

      await onSubmit(payload);
    } catch (error) {
      setErrors({ submit: error.message || 'Failed to save assignment' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="bg-card rounded-lg border shadow-lg w-full max-w-md mx-4 p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h2 className="text-2xl font-bold mb-4">
            {task ? 'Edit Assignment' : 'Create Assignment'}
          </h2>

          {errors.submit && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">
              {errors.submit}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g., Study Math Chapter 5"
                className={`w-full px-3 py-2 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.title ? 'border-red-500' : 'border-input'
                }`}
              />
              {errors.title && (
                <p className="text-red-500 text-sm mt-1">{errors.title}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Add details about the assignment..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            {/* Duration */}
            <div>
              <label htmlFor="estimated_duration_minutes" className="block text-sm font-medium mb-2">
                Estimated Duration (minutes)
              </label>
              <input
                id="estimated_duration_minutes"
                name="estimated_duration_minutes"
                type="number"
                min="0"
                value={formData.estimated_duration_minutes}
                onChange={handleChange}
                placeholder="e.g., 60"
                className={`w-full px-3 py-2 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.estimated_duration_minutes ? 'border-red-500' : 'border-input'
                }`}
              />
              {errors.estimated_duration_minutes && (
                <p className="text-red-500 text-sm mt-1">{errors.estimated_duration_minutes}</p>
              )}
            </div>

            {/* Due Date */}
            <div>
              <label htmlFor="due_date" className="block text-sm font-medium mb-2">
                Due Date
              </label>
              <input
                id="due_date"
                name="due_date"
                type="date"
                value={formData.due_date}
                onChange={handleChange}
                min={new Date().toISOString().split('T')[0]}
                className={`w-full px-3 py-2 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.due_date ? 'border-red-500' : 'border-input'
                }`}
              />
              {errors.due_date && (
                <p className="text-red-500 text-sm mt-1">{errors.due_date}</p>
              )}
            </div>

            {/* Is Completed (only for editing) */}
            {task && (
              <div className="flex items-center gap-2">
                <input
                  id="is_completed"
                  name="is_completed"
                  type="checkbox"
                  checked={formData.is_completed}
                  onChange={handleChange}
                  className="w-4 h-4 rounded border-input cursor-pointer"
                />
                <label htmlFor="is_completed" className="text-sm font-medium cursor-pointer">
                  Mark as completed
                </label>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-input rounded-lg hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving...' : task ? 'Update Assignment' : 'Create Assignment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
