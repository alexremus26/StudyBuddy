import { useState, useEffect, useRef } from 'react';
import { runDocumentOcr, terminateOcrWorker } from '../utils/ocrService';
import { createAssignment } from '../api/client';

const OCR_STATUS = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  REVIEW_READY: 'review-ready',
  FAILED: 'failed',
};

function getFirstMeaningfulLine(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.find((line) => line.length >= 3) || lines[0] || '';
}

function parseOcrTextForSchedule(text) {
  const title = getFirstMeaningfulLine(text).slice(0, 255);
  const description = text.trim();
  
  const payload = {
    title,
    description,
  };

  return payload;
}

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
  const [ocrFile, setOcrFile] = useState(null);
  const [ocrStatus, setOcrStatus] = useState(OCR_STATUS.IDLE);
  const [ocrResult, setOcrResult] = useState(null);
  const [ocrReviewText, setOcrReviewText] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [ocrProgress, setOcrProgress] = useState({
    stage: '',
    current: 0,
    total: 0,
    message: '',
  });
  const [isAddingToSchedule, setIsAddingToSchedule] = useState(false);

  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);

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

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      terminateOcrWorker().catch(() => {
        // Worker termination best effort during unmount.
      });
    };
  }, []);

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

  const resetOcrState = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setOcrStatus(OCR_STATUS.IDLE);
    setOcrError('');
    setOcrProgress({ stage: '', current: 0, total: 0, message: '' });
    setOcrResult(null);
    setOcrReviewText('');
    setOcrFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0] || null;
    setOcrFile(file);
    setOcrError('');
    setOcrResult(null);
    setOcrReviewText('');
    setOcrStatus(OCR_STATUS.IDLE);
  };

  const handleImportFromDocument = async () => {
    if (!ocrFile) {
      setOcrError('Please select a PNG, JPG, or PDF file first.');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setOcrError('');
    setOcrResult(null);
    setOcrReviewText('');
    setOcrStatus(OCR_STATUS.PROCESSING);
    setOcrProgress({ stage: '', current: 0, total: 0, message: 'Preparing OCR...' });

    try {
      const result = await runDocumentOcr(
        ocrFile,
        {
          onProgress: (progress) => {
            setOcrProgress({
              stage: progress.stage || '',
              current: progress.current || 0,
              total: progress.total || 0,
              message: progress.message || '',
            });
          },
        },
        {
          signal: controller.signal,
          nativeTextThreshold: 50,
          maxPages: 15,
          scale: 2,
        },
      );

      if (!result?.fullText?.trim()) {
        throw new Error('OCR finished, but no readable text was found. Try a clearer file.');
      }

      setOcrResult(result);
      setOcrReviewText(result.fullText);
      setOcrStatus(OCR_STATUS.REVIEW_READY);
      setOcrProgress({ stage: '', current: 0, total: 0, message: '' });
    } catch (error) {
      if (error?.name === 'AbortError') {
        setOcrStatus(OCR_STATUS.IDLE);
        setOcrProgress({ stage: '', current: 0, total: 0, message: '' });
        setOcrError('OCR import cancelled.');
        return;
      }

      setOcrStatus(OCR_STATUS.FAILED);
      setOcrError(error?.message || 'OCR processing failed. Please try again.');
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelOcr = () => {
    abortControllerRef.current?.abort();
    setOcrStatus(OCR_STATUS.IDLE);
    setOcrProgress({ stage: '', current: 0, total: 0, message: '' });
  };

  const handleApplyOcr = () => {
    const reviewed = ocrReviewText.trim();
    if (!reviewed) {
      setOcrError('Review text is empty. Please edit or retry OCR.');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      title: getFirstMeaningfulLine(reviewed).slice(0, 255),
      description: reviewed,
    }));

    setOcrError('');
    setOcrStatus(OCR_STATUS.IDLE);
  };

  const handleAddToSchedule = async () => {
    const reviewed = ocrReviewText.trim();
    if (!reviewed) {
      setOcrError('Review text is empty. Please edit or retry.');
      return;
    }

    setIsAddingToSchedule(true);
    try {
      const payload = parseOcrTextForSchedule(reviewed);
      await createAssignment(payload);
      resetOcrState();
      onClose();
    } catch (error) {
      setOcrError(error?.message || 'Failed to add to schedule');
      setIsAddingToSchedule(false);
    }
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

            {/* OCR Import */}
            <div className="rounded-lg border border-input p-3 space-y-3">
              <div>
                <p className="text-sm font-medium">Import from document (OCR)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supported formats: PNG, JPG, PDF. You can review extracted text before applying.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                onChange={handleFileSelect}
                className="w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-input file:bg-secondary file:text-foreground"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleImportFromDocument}
                  disabled={ocrStatus === OCR_STATUS.PROCESSING || !ocrFile}
                  className="px-3 py-2 bg-secondary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ocrStatus === OCR_STATUS.PROCESSING ? 'Processing...' : 'Import from document'}
                </button>

                {ocrStatus === OCR_STATUS.PROCESSING && (
                  <button
                    type="button"
                    onClick={handleCancelOcr}
                    className="px-3 py-2 border border-input rounded-lg hover:bg-secondary transition-colors"
                  >
                    Cancel OCR
                  </button>
                )}

                {(ocrStatus === OCR_STATUS.REVIEW_READY || ocrStatus === OCR_STATUS.FAILED) && (
                  <button
                    type="button"
                    onClick={resetOcrState}
                    className="px-3 py-2 border border-input rounded-lg hover:bg-secondary transition-colors"
                  >
                    Reset OCR
                  </button>
                )}
              </div>

              {ocrStatus === OCR_STATUS.PROCESSING && (
                <p className="text-sm text-muted-foreground">
                  {ocrProgress.message || 'Processing document...'}
                  {ocrProgress.total > 0 && ` (${ocrProgress.current}/${ocrProgress.total})`}
                </p>
              )}

              {ocrError && (
                <p className="text-sm text-red-500">{ocrError}</p>
              )}

              {ocrStatus === OCR_STATUS.REVIEW_READY && (
                <div className="space-y-2">
                  <label htmlFor="ocr-review" className="block text-sm font-medium">
                    Review extracted text
                  </label>
                  <textarea
                    id="ocr-review"
                    value={ocrReviewText}
                    onChange={(event) => {
                      setOcrReviewText(event.target.value);
                      if (ocrError) {
                        setOcrError('');
                      }
                    }}
                    rows={7}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  />

                  {ocrResult?.warnings?.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {ocrResult.warnings.join(' ')}
                    </p>
                  )}

                  {Number.isFinite(ocrResult?.averageConfidence) && (
                    <p className="text-xs text-muted-foreground">
                      Average OCR confidence: {Math.round(ocrResult.averageConfidence)}%
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleApplyOcr}
                      className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isAddingToSchedule}
                    >
                      Apply to form
                    </button>
                    <button
                      type="button"
                      onClick={handleAddToSchedule}
                      disabled={isAddingToSchedule}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAddingToSchedule ? 'Adding...' : 'Add to Schedule'}
                    </button>
                  </div>
                </div>
              )}
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
