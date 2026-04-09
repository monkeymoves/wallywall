import { compareGradesDescending, gradeValue } from './gradeUtils.js';

const CALENDAR_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getTodayDateKey() {
  return formatDateKey(new Date());
}

export function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function shiftMonth(monthStart, delta) {
  return getMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + delta, 1));
}

export function isDateKeyInMonth(dateKey, monthStart) {
  const date = parseDateKey(dateKey);
  return date.getFullYear() === monthStart.getFullYear() && date.getMonth() === monthStart.getMonth();
}

export function getMonthRange(monthStart) {
  const start = getMonthStart(monthStart);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return {
    startKey: formatDateKey(start),
    endKey: formatDateKey(end),
  };
}

export function getMonthLabel(monthStart) {
  return monthStart.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function getDateLabel(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatLoggedTime(timestampValue) {
  const date = timestampValue?.toDate ? timestampValue.toDate() : timestampValue instanceof Date ? timestampValue : null;
  if (!date) return 'Saved now';
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getSessionEntries(session) {
  return Array.isArray(session?.entries) ? session.entries : [];
}

function getSessionAttemptCount(session) {
  const entries = getSessionEntries(session);
  return entries.length || Number(session?.entryCount) || 0;
}

function getSessionCompletedCount(session) {
  const entries = getSessionEntries(session);
  if (entries.length) {
    return entries.filter((entry) => Boolean(entry.completed)).length;
  }
  return Number(session?.completedCount) || 0;
}

function getMonthKey(monthStart) {
  return `${monthStart.getFullYear()}-${pad(monthStart.getMonth() + 1)}`;
}

function formatMonthKeyLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

export function calculateCompletionRate(completedCount = 0, attemptCount = 0) {
  if (!attemptCount) return 0;
  return Math.round((completedCount / attemptCount) * 100);
}

export function formatCompletionRate(completedCount = 0, attemptCount = 0) {
  return `${calculateCompletionRate(completedCount, attemptCount)}%`;
}

export function filterEntriesByMonth(entriesByDate = [], monthStart) {
  if (!monthStart) return [];
  const monthKey = getMonthKey(monthStart);
  return entriesByDate.filter((session) => session?.dateKey?.startsWith(monthKey));
}

export function getBestCompletedGrade(entriesByDate = []) {
  let bestGrade = '';
  let bestValue = -1;

  entriesByDate.forEach((session) => {
    getSessionEntries(session).forEach((entry) => {
      if (!entry?.completed || !entry.problemGrade) return;
      const nextValue = gradeValue(entry.problemGrade);
      if (nextValue > bestValue) {
        bestValue = nextValue;
        bestGrade = entry.problemGrade;
      }
    });
  });

  return bestGrade;
}

export function getAttemptedGradesSummary(entriesByDate = [], limit = 3) {
  const counts = new Map();

  entriesByDate.forEach((session) => {
    getSessionEntries(session).forEach((entry) => {
      if (!entry?.problemGrade) return;
      counts.set(entry.problemGrade, (counts.get(entry.problemGrade) || 0) + 1);
    });
  });

  if (!counts.size) {
    return '—';
  }

  return [...counts.entries()]
    .sort((left, right) => {
      const countDiff = right[1] - left[1];
      if (countDiff !== 0) return countDiff;
      return compareGradesDescending(left[0], right[0]);
    })
    .slice(0, limit)
    .map(([grade, count]) => `${grade}×${count}`)
    .join(' · ');
}

export function summarizeTrainingEntries(entriesByDate = []) {
  const sessionCount = entriesByDate.length;
  const attemptCount = entriesByDate.reduce((total, session) => total + getSessionAttemptCount(session), 0);
  const completedCount = entriesByDate.reduce((total, session) => total + getSessionCompletedCount(session), 0);

  return {
    sessionCount,
    attemptCount,
    completedCount,
    completionRate: calculateCompletionRate(completedCount, attemptCount),
    bestCompletedGrade: getBestCompletedGrade(entriesByDate),
    attemptedGradesSummary: getAttemptedGradesSummary(entriesByDate),
  };
}

export function buildMonthlyTrendRows(entriesByDate = []) {
  const groups = new Map();

  entriesByDate.forEach((session) => {
    if (!session?.dateKey) return;
    const monthKey = session.dateKey.slice(0, 7);
    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }
    groups.get(monthKey).push(session);
  });

  return [...groups.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([monthKey, sessions]) => {
      const summary = summarizeTrainingEntries(sessions);
      return {
        monthKey,
        monthLabel: formatMonthKeyLabel(monthKey),
        ...summary,
      };
    });
}

export function buildCalendarDays(monthStart, sessionSummaries = [], selectedDateKey = '', todayDateKey = getTodayDateKey()) {
  const summaryMap = new Map(sessionSummaries.map((session) => [session.dateKey, session]));
  const firstDay = getMonthStart(monthStart);
  const firstWeekdayIndex = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstWeekdayIndex);

  const cells = [];

  for (let offset = 0; offset < 42; offset += 1) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + offset);
    const dateKey = formatDateKey(cellDate);
    cells.push({
      dateKey,
      dayNumber: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === monthStart.getMonth(),
      isToday: dateKey === todayDateKey,
      isSelected: dateKey === selectedDateKey,
      summary: summaryMap.get(dateKey) || null,
    });
  }

  return {
    weekdays: CALENDAR_WEEKDAYS,
    cells,
  };
}
