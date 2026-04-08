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
