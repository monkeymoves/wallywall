import { describe, expect, test } from 'vitest';

import {
  buildCalendarDays,
  buildMonthlyTrendRows,
  filterEntriesByMonth,
  formatCompletionRate,
  formatDateKey,
  getMonthRange,
  getTodayDateKey,
  parseDateKey,
  shiftMonth,
  summarizeTrainingEntries,
} from '../public/trainingLog.js';

const trainingHistory = [
  {
    dateKey: '2026-04-02',
    entries: [
      { problemGrade: 'V4', completed: true },
      { problemGrade: 'V5', completed: false },
    ],
  },
  {
    dateKey: '2026-04-14',
    entries: [
      { problemGrade: 'V5', completed: true },
      { problemGrade: 'V5', completed: true },
    ],
  },
  {
    dateKey: '2026-03-20',
    entries: [
      { problemGrade: 'V3', completed: true },
    ],
  },
];

describe('trainingLog date helpers', () => {
  test('formatDateKey and parseDateKey round-trip a date', () => {
    const date = new Date(2026, 3, 9);
    const key = formatDateKey(date);

    expect(key).toBe('2026-04-09');
    expect(formatDateKey(parseDateKey(key))).toBe(key);
  });

  test('shiftMonth and getMonthRange return the expected month values', () => {
    const monthStart = new Date(2026, 3, 1);

    expect(formatDateKey(shiftMonth(monthStart, -1))).toBe('2026-03-01');
    expect(getMonthRange(monthStart)).toEqual({
      startKey: '2026-04-01',
      endKey: '2026-04-30',
    });
  });

  test('getTodayDateKey always returns a yyyy-mm-dd string', () => {
    expect(getTodayDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('trainingLog review helpers', () => {
  test('summarizeTrainingEntries calculates totals and best send', () => {
    expect(summarizeTrainingEntries(trainingHistory)).toEqual({
      sessionCount: 3,
      attemptCount: 5,
      completedCount: 4,
      completionRate: 80,
      bestCompletedGrade: 'V5',
      attemptedGradesSummary: 'V5×3 · V4×1 · V3×1',
    });
  });

  test('filterEntriesByMonth isolates the visible month', () => {
    const aprilEntries = filterEntriesByMonth(trainingHistory, new Date(2026, 3, 1));

    expect(aprilEntries).toHaveLength(2);
    expect(aprilEntries.every((session) => session.dateKey.startsWith('2026-04'))).toBe(true);
  });

  test('buildMonthlyTrendRows groups history by month in descending order', () => {
    expect(buildMonthlyTrendRows(trainingHistory)).toEqual([
      {
        monthKey: '2026-04',
        monthLabel: 'Apr 2026',
        sessionCount: 2,
        attemptCount: 4,
        completedCount: 3,
        completionRate: 75,
        bestCompletedGrade: 'V5',
        attemptedGradesSummary: 'V5×3 · V4×1',
      },
      {
        monthKey: '2026-03',
        monthLabel: 'Mar 2026',
        sessionCount: 1,
        attemptCount: 1,
        completedCount: 1,
        completionRate: 100,
        bestCompletedGrade: 'V3',
        attemptedGradesSummary: 'V3×1',
      },
    ]);
  });

  test('formatCompletionRate and buildCalendarDays handle empty data safely', () => {
    const calendar = buildCalendarDays(new Date(2026, 3, 1), [], '2026-04-09', '2026-04-09');

    expect(formatCompletionRate(0, 0)).toBe('0%');
    expect(calendar.cells).toHaveLength(42);
    expect(calendar.cells.some((cell) => cell.isSelected)).toBe(true);
  });
});
