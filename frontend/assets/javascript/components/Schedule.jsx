import { useEffect, useRef, useState } from 'react';
import {
  listAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  listSchoolClasses,
  createSchoolClass,
  updateSchoolClass,
  deleteSchoolClass,
  listTaskBlocks,
  createTaskBlock,
  deleteTaskBlock,
  parseScheduleText,
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

const PARSER_MODES = [
  { value: 'auto', label: 'Auto (Ollama -> Fallback)' },
  { value: 'layout_hybrid', label: 'Layout Hybrid (new local)' },
  { value: 'ollama', label: 'Ollama only' },
  { value: 'regex', label: 'Regex only' },
];

const PARSER_COMPARE_MODES = ['layout_hybrid', 'auto', 'regex'];

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
  };
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

  if (source === 'ollama') {
    return {
      label: 'Parser: Ollama (qwen)',
      className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
    };
  }

  if (source === 'regex') {
    return {
      label: 'Parser: Backend Regex Fallback',
      className: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
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

function getParserModeLabel(mode) {
  const hit = PARSER_MODES.find((item) => item.value === mode);
  return hit?.label || mode;
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
  const [isOcrImporting, setIsOcrImporting] = useState(false);
  const [lastImportMeta, setLastImportMeta] = useState(null);
  const [lastComparisonMeta, setLastComparisonMeta] = useState(null);
  const [parserMode, setParserMode] = useState('auto');
  const [scheduleImportAction, setScheduleImportAction] = useState('import');
  const scheduleFileInputRef = useRef(null);

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

  const handleOpenForm = (task = null) => {
    setEditingTask(task);
    setShowTaskForm(true);
  };

  const handleCloseForm = () => {
    setShowTaskForm(false);
    setEditingTask(null);
  };

  const handleAddScheduleClick = (action = 'import') => {
    setError(null);
    setScheduleImportAction(action);
    scheduleFileInputRef.current?.click();
  };

  const buildComparisonEntry = (mode, parserResult, normalizedBlocks) => {
    const confidenceValues = normalizedBlocks
      .map((block) => Number(block.confidence || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgConfidence = confidenceValues.length > 0
      ? (confidenceValues.reduce((acc, value) => acc + value, 0) / confidenceValues.length)
      : 0;

    return {
      mode,
      modeLabel: getParserModeLabel(mode),
      source: String(parserResult?.source || 'unknown'),
      count: normalizedBlocks.length,
      avgConfidence,
      warnings: Array.isArray(parserResult?.warnings)
        ? parserResult.warnings.filter(Boolean).map((warning) => String(warning))
        : [],
      diagnostics: parserResult?.diagnostics || {},
      sampleTitles: normalizedBlocks.slice(0, 3).map((block) => block.title),
    };
  };

  const runParserComparison = async (parsedText) => {
    const results = await Promise.all(
      PARSER_COMPARE_MODES.map(async (mode) => {
        const parserResult = await parseScheduleText({
          ocr_text: parsedText,
          max_blocks: 25,
          parser_mode: mode,
        });
        const normalizedBlocks = normalizeScheduleBlocks(parserResult?.blocks);
        return buildComparisonEntry(mode, parserResult, normalizedBlocks);
      }),
    );

    const ranked = [...results].sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return b.avgConfidence - a.avgConfidence;
    });

    return {
      ranking: ranked,
      bestMode: ranked[0]?.mode || null,
      generatedAt: new Date().toISOString(),
    };
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

      const shouldCompareOnly = scheduleImportAction === 'compare';
      if (shouldCompareOnly) {
        const comparison = await runParserComparison(parsedText);
        setLastComparisonMeta(comparison);
        const best = comparison?.ranking?.[0];
        setLastImportMeta({
          source: String(best?.source || 'unknown'),
          importedCount: 0,
          warnings: [
            'Parser test mode only: no classes were imported.',
            best?.modeLabel ? `Top parser by extracted blocks: ${best.modeLabel}.` : '',
          ].filter(Boolean),
          modelOutput: '',
        });
        return;
      }

      setLastComparisonMeta(null);

      const parserResult = await parseScheduleText({
        ocr_text: parsedText,
        max_blocks: 25,
        parser_mode: parserMode,
      });

      const parsedBlocks = normalizeScheduleBlocks(parserResult?.blocks);
      const usedFrontendFallback = parserMode === 'auto' && parsedBlocks.length === 0;
      const blocksToUse = usedFrontendFallback ? parseScheduleBlocksFromText(parsedText) : parsedBlocks;
      const parserSource = usedFrontendFallback ? 'frontend-fallback' : String(parserResult?.source || 'unknown');
      const parserWarnings = Array.isArray(parserResult?.warnings)
        ? parserResult.warnings.filter(Boolean).map((warning) => String(warning))
        : [];
      const parserModelOutput = String(parserResult?.model_output || '').trim();
      if (blocksToUse.length === 0) {
        setLastImportMeta({
          source: parserSource,
          importedCount: 0,
          warnings: parserWarnings,
          modelOutput: parserModelOutput,
        });
        throw new Error('No school classes found. Use lines like: Monday 09:00-11:00 Math. Check parser output below.');
      }

      let importedCount = 0;
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
        await createSchoolClass({
          name: importedSchoolClass.name.slice(0, 255),
          class_type: importedSchoolClass.class_type,
          day_of_week: blockDay,
          start_time: formatImportedTimeParts(startParts),
          end_time: formatImportedTimeParts(endParts),
          location: importedSchoolClass.location.slice(0, 255),
        });
        importedCount += 1;
      }

      if (importedCount === 0) {
        throw new Error('Parsed schedule text, but no school classes were created. Check day/time format or existing overlaps.');
      }

      setLastImportMeta({
        source: parserSource,
        importedCount,
        warnings: parserWarnings,
        modelOutput: parserModelOutput,
      });

      await fetchScheduleData();
    } catch (err) {
      setError(err.message || 'Failed to import schedule from file');
    } finally {
      setIsOcrImporting(false);
      setScheduleImportAction('import');
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
          <select
            value={parserMode}
            onChange={(event) => setParserMode(event.target.value)}
            disabled={isOcrImporting}
            className="px-3 py-2 border border-input rounded-lg bg-background text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Choose parser mode for OCR import"
          >
            {PARSER_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
          <button
            onClick={() => handleAddScheduleClick('import')}
            disabled={isOcrImporting}
            className="px-4 py-2 border border-input rounded-lg hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isOcrImporting ? 'Importing Schedule...' : 'Add Schedule (OCR)'}
          </button>
          <button
            onClick={() => handleAddScheduleClick('compare')}
            disabled={isOcrImporting}
            className="px-4 py-2 border border-indigo-400/60 text-indigo-700 rounded-lg hover:bg-indigo-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Runs layout_hybrid, auto, and regex in parallel without importing classes"
          >
            {isOcrImporting ? 'Testing Parsers...' : 'Test OCR Parsers'}
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
          </div>
          {Array.isArray(lastImportMeta.warnings) && lastImportMeta.warnings.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {lastImportMeta.warnings.join(' ')}
            </p>
          ) : null}
          <details className="mt-3 rounded-md border border-input/80 bg-background/70 p-2">
            <summary className="cursor-pointer text-xs font-medium text-foreground">
              Show parser raw output
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word rounded bg-muted/40 p-2 text-xs text-muted-foreground">
              {lastImportMeta.modelOutput || 'No raw output captured for this attempt. If parser source is regex or frontend-fallback, Ollama content may not exist.'}
            </pre>
          </details>
        </div>
      ) : null}

      {lastComparisonMeta?.ranking?.length ? (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-semibold text-indigo-900">Parser Comparison (No Import)</h3>
            {lastComparisonMeta.bestMode ? (
              <span className="text-xs text-indigo-800/80">
                Best by extracted blocks: {getParserModeLabel(lastComparisonMeta.bestMode)}
              </span>
            ) : null}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {lastComparisonMeta.ranking.map((entry) => (
              <div key={entry.mode} className="rounded-md border border-indigo-500/20 bg-background/80 p-3">
                <p className="text-sm font-medium">{entry.modeLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">Source: {entry.source}</p>
                <p className="text-xs text-muted-foreground">Blocks: {entry.count}</p>
                <p className="text-xs text-muted-foreground">Avg confidence: {entry.avgConfidence.toFixed(2)}</p>
                {entry.sampleTitles.length ? (
                  <p className="mt-2 text-xs text-foreground/90">
                    Sample: {entry.sampleTitles.join(' | ')}
                  </p>
                ) : null}
                {entry.warnings.length ? (
                  <p className="mt-2 text-xs text-amber-700">
                    {entry.warnings.slice(0, 2).join(' ')}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
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
                      {editingSchoolClassId === schoolClass.id ? (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editingClassForm.name}
                            onChange={(event) => setEditingClassForm((prev) => ({ ...prev, name: event.target.value }))}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Class name"
                          />
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <select
                              value={editingClassForm.class_type}
                              onChange={(event) => setEditingClassForm((prev) => ({ ...prev, class_type: event.target.value }))}
                              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            >
                              {CLASS_TYPES.map((classType) => (
                                <option key={classType.value} value={classType.value}>{classType.label}</option>
                              ))}
                            </select>
                            <select
                              value={editingClassForm.day_of_week}
                              onChange={(event) => setEditingClassForm((prev) => ({ ...prev, day_of_week: event.target.value }))}
                              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            >
                              {DAYS.map((day) => (
                                <option key={day.value} value={day.value}>{day.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={editingClassForm.start_time}
                              onChange={(event) => setEditingClassForm((prev) => ({ ...prev, start_time: event.target.value.trim() }))}
                              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                              placeholder="HH:mm"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={editingClassForm.end_time}
                              onChange={(event) => setEditingClassForm((prev) => ({ ...prev, end_time: event.target.value.trim() }))}
                              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                              placeholder="HH:mm"
                            />
                          </div>
                          <input
                            type="text"
                            value={editingClassForm.location}
                            onChange={(event) => setEditingClassForm((prev) => ({ ...prev, location: event.target.value }))}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Location (optional)"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveSchoolClassEdit(schoolClass.id)}
                              disabled={classEditLoading}
                              className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-60"
                            >
                              {classEditLoading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEditSchoolClass}
                              disabled={classEditLoading}
                              className="rounded border border-input px-3 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
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
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEditSchoolClass(schoolClass)}
                              className="rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:opacity-80"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSchoolClass(schoolClass.id)}
                              className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
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
