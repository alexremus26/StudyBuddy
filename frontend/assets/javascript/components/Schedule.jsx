import { useEffect, useRef, useState } from 'react';
import {
  listAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  deleteAllAssignments,
  listSchoolClasses,
  createSchoolClass,
  updateSchoolClass,
  deleteSchoolClass,
  deleteAllSchoolClasses,
  listTaskBlocks,
  createTaskBlock,
  deleteTaskBlock,
  deleteAllTaskBlocks,
  parseScheduleText,
  listPlanDrafts,
} from '../api/client';
import { TaskForm } from './TaskForm';
import { ScheduleView } from './ScheduleView';
import { runDocumentOcr } from '../utils/ocrService';

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

const IMPORT_CLASS_TYPE_ALIASES = {
  curs: 'course',
  course: 'course',
  seminar: 'seminar',
  sem: 'seminar',
  lab: 'lab',
  workshop: 'workshop',
  tutorial: 'tutorial',
};

const emptyClassForm = {
  name: '',
  class_type: 'course',
  day_of_week: 0,
  start_time: '',
  end_time: '',
  location: '',
  lecturer_name: '',
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

function parseTimeParts(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[Oo]/g, '0')
    .replace(/[.,]/g, ':');
  const match = normalized.match(/^(\d{1,2}):(\d{1,2})$/);
  let hour;
  let minute;
  if (!match) {
    const compact = normalized.match(/^(\d{3,4})$/);
    if (!compact) {
      return null;
    }
    const raw = compact[1];
    if (raw.length === 3) {
      hour = Number.parseInt(raw[0], 10);
      minute = Number.parseInt(raw.slice(1), 10);
    } else {
      hour = Number.parseInt(raw.slice(0, 2), 10);
      minute = Number.parseInt(raw.slice(2), 10);
    }
  } else {
    hour = Number.parseInt(match[1], 10);
    minute = Number.parseInt(match[2], 10);
  }

  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

const DAY_TOKEN_PATTERN = /^(monday|mon|lu|luni|tuesday|tue|tues|ma|marti|marți|wednesday|wed|mi|miercuri|thursday|thu|jo|joi|friday|fri|vi|vineri|saturday|sat|sa|sâ|sambata|sâmbătă|sunday|sun|du|duminica|duminică)$/i;

const INTERVAL_PATTERN = /(?:\d{1,2}[:.,]\d{1,2}|\d{3,4})\s*(?:-|to|–|—)\s*(?:\d{1,2}[:.,]\d{1,2}|\d{3,4})/gi;
const HEADER_INTERVAL_PATTERN = /(?:\d{1,2}[:.,]\d{1,2}|\d{3,4})\s*(?:-|to|–|—)\s*(?:\d{1,2}[:.,]\d{1,2}|\d{3,4})/i;

function extractTimeIntervalsFromText(text) {
  const intervals = [];
  const matches = String(text || '').match(INTERVAL_PATTERN) || [];

  for (const match of matches) {
    const [startValue, endValue] = match.split(/\s*(?:-|to|–|—)\s*/);
    const startParts = parseTimeParts(startValue);
    const endParts = parseTimeParts(endValue);
    if (!startParts || !endParts) {
      continue;
    }
    intervals.push({
      start_time: `${startParts.hour.toString().padStart(2, '0')}:${startParts.minute.toString().padStart(2, '0')}`,
      end_time: `${endParts.hour.toString().padStart(2, '0')}:${endParts.minute.toString().padStart(2, '0')}`,
    });
  }

  return intervals;
}

function isTableHeaderLine(line) {
  const lowered = String(line || '').trim().toLowerCase();
  if (!lowered) {
    return true;
  }
  if (lowered.startsWith('orar generat')) {
    return true;
  }
  if (lowered.includes('universitatea') || lowered.includes('facultatea')) {
    return true;
  }
  if (lowered.startsWith('cti ') || lowered.startsWith('grupa ')) {
    return true;
  }
  if (/^[\d\s]+$/.test(lowered)) {
    return true;
  }
  return HEADER_INTERVAL_PATTERN.test(lowered);
}

function parseTableLikeOcrText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const intervals = extractTimeIntervalsFromText(text);
  if (lines.length === 0 || intervals.length === 0) {
    return [];
  }

  const parsed = [];
  let currentDayIndex = null;
  let intervalIndex = 0;

  for (const line of lines) {
    if (DAY_TOKEN_PATTERN.test(line)) {
      currentDayIndex = Number.isInteger(currentDayIndex) ? currentDayIndex : null;
      const normalizedDay = line.toLowerCase();
      if (normalizedDay === 'monday' || normalizedDay === 'mon' || normalizedDay === 'lu' || normalizedDay === 'luni') currentDayIndex = 0;
      else if (normalizedDay === 'tuesday' || normalizedDay === 'tue' || normalizedDay === 'tues' || normalizedDay === 'ma' || normalizedDay === 'marti' || normalizedDay === 'marți') currentDayIndex = 1;
      else if (normalizedDay === 'wednesday' || normalizedDay === 'wed' || normalizedDay === 'mi' || normalizedDay === 'miercuri') currentDayIndex = 2;
      else if (normalizedDay === 'thursday' || normalizedDay === 'thu' || normalizedDay === 'jo' || normalizedDay === 'joi') currentDayIndex = 3;
      else if (normalizedDay === 'friday' || normalizedDay === 'fri' || normalizedDay === 'vi' || normalizedDay === 'vineri') currentDayIndex = 4;
      else if (normalizedDay === 'saturday' || normalizedDay === 'sat' || normalizedDay === 'sa' || normalizedDay === 'sâ' || normalizedDay === 'sambata' || normalizedDay === 'sâmbătă') currentDayIndex = 5;
      else if (normalizedDay === 'sunday' || normalizedDay === 'sun' || normalizedDay === 'du' || normalizedDay === 'duminica' || normalizedDay === 'duminică') currentDayIndex = 6;
      continue;
    }

    if (isTableHeaderLine(line)) {
      continue;
    }

    if (currentDayIndex == null) {
      continue;
    }

    if (!/[A-Za-z]/.test(line)) {
      continue;
    }

    const interval = intervals[Math.min(intervalIndex, intervals.length - 1)];
    parsed.push({
      day_of_week: currentDayIndex,
      start_time: interval.start_time,
      end_time: interval.end_time,
      title: line,
      raw_text: line,
    });
    intervalIndex += 1;
  }

  return parsed;
}

function buildNextDateForWeekday(dayIndex, hour, minute) {
  const now = new Date();
  const todaySchoolIndex = (now.getDay() + 6) % 7;
  let delta = dayIndex - todaySchoolIndex;
  if (delta < 0) {
    delta += 7;
  }

  const date = new Date(now);
  date.setSeconds(0, 0);
  date.setDate(now.getDate() + delta);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function parseScheduleBlocksFromText(text) {
  const dayMap = {
    monday: 0,
    lu: 0,
    luni: 0,
    mon: 0,
    tuesday: 1,
    ma: 1,
    marti: 1,
    marți: 1,
    tue: 1,
    wednesday: 2,
    mi: 2,
    miercuri: 2,
    wed: 2,
    thursday: 3,
    jo: 3,
    joi: 3,
    thu: 3,
    friday: 4,
    vi: 4,
    vineri: 4,
    fri: 4,
    saturday: 5,
    sa: 5,
    sâ: 5,
    sambata: 5,
    sâmbătă: 5,
    sat: 5,
    sunday: 6,
    du: 6,
    duminica: 6,
    duminică: 6,
    sun: 6,
  };

  const dayPatterns = [
    /\b(monday|mon|lu|luni)\b/i,
    /\b(tuesday|tue|ma|marti|marți)\b/i,
    /\b(wednesday|wed|mi|miercuri)\b/i,
    /\b(thursday|thu|jo|joi)\b/i,
    /\b(friday|fri|vi|vineri)\b/i,
    /\b(saturday|sat|sa|sâ|sambata|sâmbătă)\b/i,
    /\b(sunday|sun|du|duminica|duminică)\b/i,
  ];

  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = [];
  let currentDayIndex = null;

  const linePatterns = [
    /^(?<day>monday|mon|lu|luni|tuesday|tue|ma|marti|marți|wednesday|wed|mi|miercuri|thursday|thu|jo|joi|friday|fri|vi|vineri|saturday|sat|sa|sâ|sambata|sâmbătă|sunday|sun|du|duminica|duminică)\s+(?<start>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:-|to|–|—)\s*(?<end>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:[-:|]\s*)?(?<title>.*)$/i,
    /^(?<start>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:-|to|–|—)\s*(?<end>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:[-:|]\s*)?(?<title>.*)$/i,
    /^(?<title>.*?)(?:[-:|]\s*)?(?<start>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:-|to|–|—)\s*(?<end>\d{1,4}(?:[:.,]\d{1,2})?)$/i,
  ];

  const flushLineToBlock = (line, fallbackDayIndex = null) => {
    for (const pattern of linePatterns) {
      const match = line.match(pattern);
      if (!match?.groups) {
        continue;
      }

      const dayName = match.groups.day?.toLowerCase?.();
      const dayIndex = dayName != null ? dayMap[dayName] : fallbackDayIndex;
      const startParts = parseTimeParts(match.groups.start);
      const endParts = parseTimeParts(match.groups.end);
      if (dayIndex == null || !startParts || !endParts) {
        continue;
      }

      const title = (match.groups.title || '').trim() || 'Imported schedule block';
      parsed.push({
        day_of_week: dayIndex,
        title,
        start_time: formatImportedTimeParts(startParts),
        end_time: formatImportedTimeParts(endParts),
        raw_text: line,
      });
      return true;
    }

    return false;
  };

  for (const line of lines) {
    const cleanedLine = line.replace(/\s+/g, ' ').trim();
    const directDayMatch = cleanedLine.match(/\b(monday|mon|lu|luni|tuesday|tue|ma|marti|marți|wednesday|wed|mi|miercuri|thursday|thu|jo|joi|friday|fri|vi|vineri|saturday|sat|sa|sâ|sambata|sâmbătă|sunday|sun|du|duminica|duminică)\b/i);
    if (directDayMatch) {
      currentDayIndex = dayMap[directDayMatch[1].toLowerCase()] ?? currentDayIndex;
    }

    const isDayHeaderOnly = dayPatterns.some((regex) => regex.test(cleanedLine)) && !cleanedLine.match(/(\d{1,2}[:.,]\d{1,2}|\d{3,4})/);
    if (isDayHeaderOnly) {
      continue;
    }

    if (flushLineToBlock(cleanedLine, currentDayIndex)) {
      continue;
    }

    const splitSegments = cleanedLine
      .split(/\s{2,}|\s*[•·|]\s*|\s+-\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of splitSegments) {
      if (flushLineToBlock(segment, currentDayIndex)) {
        break;
      }
    }
  }

  if (parsed.length === 0) {
    return parseTableLikeOcrText(text);
  }

  return parsed;
}

function normalizeScheduleBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return [];
  }

  return blocks
    .map((block) => ({
      day_of_week: Number(block.day_of_week),
      start_time: String(block.start_time || '').trim(),
      end_time: String(block.end_time || '').trim(),
      title: String(block.title || '').trim(),
      confidence: Number(block.confidence || 0),
      raw_text: String(block.raw_text || '').trim(),
    }))
    .filter((block) => (
      Number.isInteger(block.day_of_week)
      && block.day_of_week >= 0
      && block.day_of_week <= 6
      && isValidTime24(block.start_time)
      && isValidTime24(block.end_time)
      && block.title
    ));
}

function isLikelyLocationToken(value) {
  const token = String(value || '').trim();
  if (!token) {
    return false;
  }

  return /[0-9]/.test(token) || /[._-]/.test(token) || /^[A-Z]{1,6}\.?[A-Z0-9.-]*$/i.test(token);
}

function formatImportedTimeParts(parts) {
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function parseImportedSchoolClass(block) {
  const rawTitle = String(block?.title || '').trim();
  const titleWithoutType = rawTitle.replace(/\(([^)]+)\)/g, ' ').replace(/\s+/g, ' ').trim();
  const typeMatch = rawTitle.match(/\(([^)]+)\)/);
  const classType = typeMatch
    ? (IMPORT_CLASS_TYPE_ALIASES[typeMatch[1].trim().toLowerCase()] || 'course')
    : 'course';

  const pipeParts = titleWithoutType
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  if (pipeParts.length >= 2) {
    const [subject, instructor, locationCandidate] = pipeParts;
    const normalizedInstructor = String(instructor || '')
      .replace(/\s*\/\s*/g, ', ')
      .replace(/\s+,\s+/g, ', ')
      .trim();
    return {
      name: subject || rawTitle || 'Imported class',
      class_type: classType,
      lecturer_name: normalizedInstructor,
      location: locationCandidate || '',
    };
  }

  const titleTokens = titleWithoutType.split(' ').filter(Boolean);
  let location = '';
  if (titleTokens.length > 1) {
    const candidateLocation = titleTokens[titleTokens.length - 1];
    if (isLikelyLocationToken(candidateLocation)) {
      location = candidateLocation;
      titleTokens.pop();
    }
  }

  const name = titleTokens.join(' ').trim() || rawTitle || 'Imported class';

  return {
    name,
    class_type: classType,
    location,
    lecturer_name: '',
  };
}

function buildSchoolClassIdentity({ name, day_of_week, start_time, end_time }) {
  return [
    String(name || '').trim().toLowerCase(),
    Number(day_of_week),
    String(start_time || '').trim().slice(0, 5),
    String(end_time || '').trim().slice(0, 5),
  ].join('|');
}

function getDuplicateSchoolClassMessage(error) {
  const message = String(error?.message || '');
  if (!message) {
    return '';
  }

  if (message.includes('same name, day, and time already exists')) {
    return 'A class with the same name, day, and time already exists.';
  }

  if (message.includes('overlaps with an existing class on the same day')) {
    return 'This class overlaps with an existing class on the same day.';
  }

  return '';
}

function validateSchoolClassInput(formData, schoolClasses, options = {}) {
  const { excludeId = null } = options;
  const name = String(formData.name || '').trim();
  const startTime = String(formData.start_time || '').trim();
  const endTime = String(formData.end_time || '').trim();
  const dayOfWeek = Number(formData.day_of_week);

  if (!name) {
    return 'Class name is required.';
  }
  if (!startTime || !endTime) {
    return 'School class requires both start and end time.';
  }
  if (!isValidTime24(startTime) || !isValidTime24(endTime)) {
    return 'Use 24h time format HH:mm (example: 16:00).';
  }
  if (endTime <= startTime) {
    return 'Class end time must be after start time.';
  }

  const hasDuplicate = schoolClasses.some((schoolClass) => {
    if (excludeId != null && schoolClass.id === excludeId) {
      return false;
    }

    return (
      schoolClass.name?.trim().toLowerCase() === name.toLowerCase()
      && Number(schoolClass.day_of_week) === dayOfWeek
      && schoolClass.start_time?.slice(0, 5) === startTime
      && schoolClass.end_time?.slice(0, 5) === endTime
    );
  });

  if (hasDuplicate) {
    return 'This class already exists for the same day and time.';
  }

  const newStartMinutes = toMinutesFromHHmm(startTime);
  const newEndMinutes = toMinutesFromHHmm(endTime);
  const hasOverlap = schoolClasses.some((schoolClass) => {
    if (excludeId != null && schoolClass.id === excludeId) {
      return false;
    }
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
    return 'This class overlaps with another class on the same day.';
  }

  return null;
}

function getParserBadge(source) {
  if (source === 'layout_hybrid') {
    return {
      label: 'Parser: Layout Hybrid (new)',
      className: 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30',
    };
  }

  if (source === 'gemini_vision') {
    return {
      label: 'Parser: Gemini Vision',
      className: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
    };
  }

  if (source === 'frontend-fallback') {
    return {
      label: 'Parser: Frontend Fallback',
      className: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
    };
  }

  return {
    label: 'Parser: Unknown',
    className: 'bg-muted text-muted-foreground border-border',
  };
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
  const [editingSchoolClassId, setEditingSchoolClassId] = useState(null);
  const [editingClassForm, setEditingClassForm] = useState(emptyClassForm);
  const [taskBlockForm, setTaskBlockForm] = useState(emptyTaskBlockForm);
  const [classFormLoading, setClassFormLoading] = useState(false);
  const [classEditLoading, setClassEditLoading] = useState(false);
  const [taskBlockFormLoading, setTaskBlockFormLoading] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);
  const [showTaskBlockForm, setShowTaskBlockForm] = useState(false);
  const [isOcrImporting, setIsOcrImporting] = useState(false);
  const [lastImportMeta, setLastImportMeta] = useState(null);
  const scheduleFileInputRef = useRef(null);

  const fetchScheduleData = async () => {
    try {
      setLoading(true);
      setError(null);
      const assignmentsData = await listAssignments();
      const schoolClassesData = await listSchoolClasses();
      const taskBlocksData = await listTaskBlocks();
      const draftsData = await listPlanDrafts();
      
      setAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
      setSchoolClasses(Array.isArray(schoolClassesData) ? schoolClassesData : []);
      
      const combinedBlocks = [...(Array.isArray(taskBlocksData) ? taskBlocksData : [])];
      
      // Inject drafts into the view so user can see them before approving
      if (Array.isArray(draftsData)) {
        draftsData.forEach(plan => {
          if (plan.status === 'draft') {
            plan.draft_blocks?.forEach(db => {
              combinedBlocks.push({
                ...db,
                id: `draft-${db.id}`, // prefix to distinguish from real blocks
              });
            });
          }
        });
      }

      setTaskBlocks(combinedBlocks);
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
    const validationError = validateSchoolClassInput(classForm, schoolClasses);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError(null);
      setClassFormLoading(true);
      await createSchoolClass({
        name: classForm.name.trim(),
        class_type: classForm.class_type,
        day_of_week: Number(classForm.day_of_week),
        start_time: classForm.start_time.trim(),
        end_time: classForm.end_time.trim(),
        location: classForm.location.trim(),
        lecturer_name: classForm.lecturer_name.trim(),
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

  const handleDeleteAllSchoolClasses = async () => {
    if (!confirm('Delete ALL school classes? This cannot be undone.')) return;

    try {
      setError(null);
      await deleteAllSchoolClasses();
      setEditingSchoolClassId(null);
      setEditingClassForm(emptyClassForm);
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to delete all school classes');
    }
  };

  const handleStartEditSchoolClass = (schoolClass) => {
    setError(null);
    setEditingSchoolClassId(schoolClass.id);
    setEditingClassForm({
      name: schoolClass.name || '',
      class_type: schoolClass.class_type || 'course',
      day_of_week: Number(schoolClass.day_of_week) || 0,
      start_time: (schoolClass.start_time || '').slice(0, 5),
      end_time: (schoolClass.end_time || '').slice(0, 5),
      location: schoolClass.location || '',
      lecturer_name: schoolClass.lecturer_name || '',
    });
  };

  const handleCancelEditSchoolClass = () => {
    setEditingSchoolClassId(null);
    setEditingClassForm(emptyClassForm);
  };

  const handleSaveSchoolClassEdit = async (schoolClassId) => {
    const validationError = validateSchoolClassInput(
      editingClassForm,
      schoolClasses,
      { excludeId: schoolClassId },
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError(null);
      setClassEditLoading(true);
      await updateSchoolClass(schoolClassId, {
        name: editingClassForm.name.trim(),
        class_type: editingClassForm.class_type,
        day_of_week: Number(editingClassForm.day_of_week),
        start_time: editingClassForm.start_time.trim(),
        end_time: editingClassForm.end_time.trim(),
        location: editingClassForm.location.trim(),
        lecturer_name: editingClassForm.lecturer_name.trim(),
      });
      handleCancelEditSchoolClass();
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to update school class');
    } finally {
      setClassEditLoading(false);
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

  const handleDeleteAllTaskBlocks = async () => {
    if (!confirm('Delete ALL manual task blocks? This cannot be undone.')) return;

    try {
      setError(null);
      await deleteAllTaskBlocks();
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to delete all task blocks');
    }
  };

  const handleToggleAssignmentCompletion = async (assignmentId, currentStatus) => {
    try {
      setError(null);
      await updateAssignment(assignmentId, { is_completed: !currentStatus });
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to update assignment');
    }
  };

  const handleDeleteAllAssignments = async () => {
    if (!confirm('Delete ALL assignments? This cannot be undone.')) return;

    try {
      setError(null);
      await deleteAllAssignments();
      fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to delete all assignments');
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

  const handleAddScheduleClick = () => {
    setError(null);
    scheduleFileInputRef.current?.click();
  };

  const handleScheduleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsOcrImporting(true);
    setError(null);

    try {
      const ocrResult = await runDocumentOcr(
        file,
        {},
        {
          nativeTextThreshold: 50,
          maxPages: 15,
          scale: 2,
        },
      );

      const parsedText = ocrResult?.fullText?.trim();
      if (!parsedText) {
        throw new Error('Could not extract readable text from this file.');
      }

      const parserResult = await parseScheduleText({
        ocr_text: parsedText,
        max_blocks: 25,
      });

      const parsedBlocks = normalizeScheduleBlocks(parserResult?.blocks);
      const blocksToUse = parsedBlocks.length > 0 ? parsedBlocks : parseScheduleBlocksFromText(parsedText);
      const parserSource = parsedBlocks.length > 0 ? String(parserResult?.source || 'unknown') : 'frontend-fallback';
      const parserWarnings = Array.isArray(parserResult?.warnings)
        ? parserResult.warnings.filter(Boolean).map((warning) => String(warning))
        : [];
      const parserModelOutput = String(parserResult?.model_output || '').trim();
      const parserDiagnostics = parserResult?.diagnostics && typeof parserResult.diagnostics === 'object'
        ? parserResult.diagnostics
        : {};
      const parserConfidence = Number(parserDiagnostics?.hybrid_avg_confidence || 0);
      const parserConfidenceThreshold = Number(parserDiagnostics?.confidence_threshold || 0);
      if (blocksToUse.length === 0) {
        setLastImportMeta({
          source: parserSource,
          importedCount: 0,
          warnings: parserWarnings,
          modelOutput: parserModelOutput,
          confidence: Number.isFinite(parserConfidence) && parserConfidence > 0 ? parserConfidence : null,
          confidenceThreshold: Number.isFinite(parserConfidenceThreshold) && parserConfidenceThreshold > 0
            ? parserConfidenceThreshold
            : null,
        });
        throw new Error('No school classes found. Use lines like: Monday 09:00-11:00 Math. Check parser output below.');
      }

      let importedCount = 0;
      const seenImportKeys = new Set(
        schoolClasses.map((schoolClass) => buildSchoolClassIdentity(schoolClass)),
      );
      const skippedDuplicates = [];

      for (const block of blocksToUse) {
        const blockDay = Number.isInteger(block.day_of_week) ? block.day_of_week : null;
        if (blockDay == null) {
          continue;
        }

        const startParts = parseTimeParts(block.start_time);
        const endParts = parseTimeParts(block.end_time);
        if (!startParts || !endParts) {
          continue;
        }

        const importedSchoolClass = parseImportedSchoolClass(block);
        const draftSchoolClass = {
          name: importedSchoolClass.name.slice(0, 255),
          day_of_week: blockDay,
          start_time: formatImportedTimeParts(startParts),
          end_time: formatImportedTimeParts(endParts),
        };
        const importKey = buildSchoolClassIdentity(draftSchoolClass);

        if (seenImportKeys.has(importKey)) {
          skippedDuplicates.push(`${draftSchoolClass.name} (${draftSchoolClass.start_time}-${draftSchoolClass.end_time})`);
          continue;
        }

        try {
          await createSchoolClass({
            name: draftSchoolClass.name,
            class_type: importedSchoolClass.class_type,
            day_of_week: draftSchoolClass.day_of_week,
            start_time: draftSchoolClass.start_time,
            end_time: draftSchoolClass.end_time,
            location: importedSchoolClass.location.slice(0, 255),
            lecturer_name: importedSchoolClass.lecturer_name.slice(0, 255),
          });
          seenImportKeys.add(importKey);
          importedCount += 1;
        } catch (error) {
          const duplicateMessage = getDuplicateSchoolClassMessage(error);
          if (duplicateMessage) {
            skippedDuplicates.push(`${draftSchoolClass.name} (${draftSchoolClass.start_time}-${draftSchoolClass.end_time})`);
            continue;
          }
          throw error;
        }
      }

      if (importedCount === 0) {
        throw new Error('Parsed schedule text, but no school classes were created. Check day/time format or existing overlaps.');
      }

      setLastImportMeta({
        source: parserSource,
        importedCount,
        warnings: [...parserWarnings, ...skippedDuplicates.map((item) => `Skipped duplicate class: ${item}.`)],
        modelOutput: parserModelOutput,
        confidence: Number.isFinite(parserConfidence) && parserConfidence > 0 ? parserConfidence : null,
        confidenceThreshold: Number.isFinite(parserConfidenceThreshold) && parserConfidenceThreshold > 0
          ? parserConfidenceThreshold
          : null,
      });

      await fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to import schedule from file');
    } finally {
      setIsOcrImporting(false);
      if (event.target) {
        event.target.value = '';
      }
    }
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
        <div className="flex items-center gap-2">
          <a
            href="/planner"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go to AI Planner
          </a>
          <button
            onClick={() => handleAddScheduleClick()}
            disabled={isOcrImporting}
            className="px-4 py-2 border border-input rounded-lg hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isOcrImporting ? 'Importing Schedule...' : 'Add Schedule (OCR)'}
          </button>
          <button
            onClick={() => handleOpenForm()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            + Add Assignment
          </button>
        </div>
      </div>

      <input
        ref={scheduleFileInputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        onChange={handleScheduleFileSelected}
        className="hidden"
      />

      {error ? (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {lastImportMeta ? (
        <div className="rounded-lg border border-input bg-card/40 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getParserBadge(lastImportMeta.source).className}`}>
              {getParserBadge(lastImportMeta.source).label}
            </span>
            <span className="text-muted-foreground">
              Imported {lastImportMeta.importedCount} class{lastImportMeta.importedCount === 1 ? '' : 'es'}
            </span>
            {typeof lastImportMeta.confidence === 'number' ? (
              <span className="text-muted-foreground text-xs">
                Confidence: {lastImportMeta.confidence.toFixed(2)}
                {typeof lastImportMeta.confidenceThreshold === 'number'
                  ? ` (threshold ${lastImportMeta.confidenceThreshold.toFixed(2)})`
                  : ''}
              </span>
            ) : null}
          </div>
          {Array.isArray(lastImportMeta.warnings) && lastImportMeta.warnings.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {lastImportMeta.warnings.join(' ')}
            </p>
          ) : null}
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
          <ScheduleView
            schoolClasses={schoolClasses}
            taskBlocks={taskBlocks}
            onDeleteSchoolClass={handleDeleteSchoolClass}
            onDeleteTaskBlock={handleDeleteTaskBlock}
          />

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card/60 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold">School Classes</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Weekly timetable</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowClassForm(!showClassForm)}
                    className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-600 px-2 py-1 rounded border border-indigo-600/20 hover:bg-indigo-600/20 transition-colors"
                  >
                    {showClassForm ? 'Close' : 'Add Class'}
                  </button>
                  <button
                    onClick={handleDeleteAllSchoolClasses}
                    disabled={schoolClasses.length === 0}
                    className="text-[10px] font-bold uppercase tracking-wider text-destructive/60 hover:text-destructive disabled:opacity-30"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {showClassForm && (
                <form className="mb-4 space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50 animate-in fade-in slide-in-from-top-1" onSubmit={handleCreateSchoolClass}>
                  <input
                    type="text"
                    placeholder="Class name"
                    value={classForm.name}
                    onChange={(event) => setClassForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={classForm.class_type}
                      onChange={(event) => setClassForm((prev) => ({ ...prev, class_type: event.target.value }))}
                      className="rounded border border-input bg-background px-2 py-1.5 text-xs"
                    >
                      {CLASS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select
                      value={classForm.day_of_week}
                      onChange={(event) => setClassForm((prev) => ({ ...prev, day_of_week: event.target.value }))}
                      className="rounded border border-input bg-background px-2 py-1.5 text-xs"
                    >
                      {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Start HH:mm"
                      value={classForm.start_time}
                      onChange={(event) => setClassForm((prev) => ({ ...prev, start_time: event.target.value.trim() }))}
                      className="rounded border border-input bg-background px-2 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="End HH:mm"
                      value={classForm.end_time}
                      onChange={(event) => setClassForm((prev) => ({ ...prev, end_time: event.target.value.trim() }))}
                      className="rounded border border-input bg-background px-2 py-1.5 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={classFormLoading}
                    className="w-full rounded bg-indigo-600 px-3 py-1.5 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-colors disabled:opacity-60"
                  >
                    {classFormLoading ? 'Saving...' : 'Add School Class'}
                  </button>
                </form>
              )}

              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {schoolClasses.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-4 italic">No classes yet.</p>
                ) : (
                  schoolClasses.map((sc) => (
                    <div key={sc.id} className="group relative rounded border border-border/30 bg-background/30 px-2 py-1.5 hover:bg-muted/30 transition-all" title={`${sc.location ? `Location: ${sc.location}` : ''}${sc.lecturer_name ? `\nLecturer: ${sc.lecturer_name}` : ''}`.trim() || 'No additional details'}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-xs font-bold truncate">{sc.name}</span>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {DAYS[sc.day_of_week]?.label.slice(0, 3)} • {sc.start_time.slice(0, 5)}-{sc.end_time.slice(0, 5)} • {sc.class_type}
                          </span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => handleDeleteSchoolClass(sc.id)} className="text-muted-foreground hover:text-destructive">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-card/60 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold">Assignments</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Deadlines & Deliverables</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenForm()}
                    className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-600 px-2 py-1 rounded border border-indigo-600/20 hover:bg-indigo-600/20 transition-colors"
                  >
                    Add Assignment
                  </button>
                  <button
                    onClick={handleDeleteAllAssignments}
                    disabled={assignments.length === 0}
                    className="text-[10px] font-bold uppercase tracking-wider text-destructive/60 hover:text-destructive disabled:opacity-30"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {assignments.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-4 italic">No assignments yet.</p>
                ) : (
                  assignments.map((a) => (
                    <div key={a.id} className={`group relative rounded border px-2 py-1.5 transition-all ${a.is_completed ? 'bg-green-500/5 border-green-500/20 opacity-70' : 'border-border/30 bg-background/30 hover:bg-muted/30'}`} title={a.description || 'No description provided'}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 overflow-hidden flex-1">
                          <input
                            type="checkbox"
                            checked={a.is_completed}
                            onChange={() => handleToggleAssignmentCompletion(a.id, a.is_completed)}
                            className="w-3 h-3 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 shrink-0"
                          />
                          <div className="flex flex-col overflow-hidden">
                            <p className={`text-xs truncate ${a.is_completed ? 'line-through text-muted-foreground' : 'font-bold'}`}>
                              {a.title}
                            </p>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              Due: {a.due_date ? new Date(a.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : 'No date'}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => handleOpenForm(a)} className="text-muted-foreground hover:text-indigo-600">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                          </button>
                          <button onClick={() => handleDeleteTask(a.id)} className="text-muted-foreground hover:text-destructive">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
