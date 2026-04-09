import { describe, expect, test } from 'vitest';

import {
  getAdjacentProblemId,
  getFilteredProblems,
  getProblemGradeOptions,
  getProblemPosition,
} from '../public/problemBrowser.js';

const problems = [
  { id: 'one', name: 'Warm Up', grade: 'V1' },
  { id: 'two', name: 'Tension', grade: 'V4+' },
  { id: 'three', name: 'Benchmark', grade: 'V4' },
  { id: 'four', name: 'Project', grade: 'V6' },
];

describe('problemBrowser', () => {
  test('getProblemGradeOptions returns unique grades in ascending order', () => {
    expect(getProblemGradeOptions(problems)).toEqual(['V1', 'V4', 'V4+', 'V6']);
  });

  test('getFilteredProblems filters by grade and preserves sorted output', () => {
    expect(getFilteredProblems(problems, 'V4').map((problem) => problem.id)).toEqual(['three']);
    expect(getFilteredProblems(problems, 'all').map((problem) => problem.id)).toEqual([
      'one',
      'three',
      'two',
      'four',
    ]);
  });

  test('getAdjacentProblemId walks the filtered collection', () => {
    const filtered = getFilteredProblems(problems, 'all');

    expect(getAdjacentProblemId(filtered, 'three', -1)).toBe('one');
    expect(getAdjacentProblemId(filtered, 'three', 1)).toBe('two');
    expect(getAdjacentProblemId(filtered, 'one', -1)).toBe('');
  });

  test('getProblemPosition returns the correct index and total', () => {
    const filtered = getFilteredProblems(problems, 'all');

    expect(getProblemPosition(filtered, 'two')).toEqual({ index: 2, total: 4 });
    expect(getProblemPosition(filtered, '')).toEqual({ index: -1, total: 4 });
  });
});
