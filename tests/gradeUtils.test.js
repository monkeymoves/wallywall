import { describe, expect, test } from 'vitest';

import {
  compareGradesAscending,
  compareGradesDescending,
  gradeValue,
} from '../public/gradeUtils.js';

describe('gradeUtils', () => {
  test('gradeValue parses V grades and plus grades', () => {
    expect(gradeValue('V0')).toBe(0);
    expect(gradeValue('V4')).toBe(4);
    expect(gradeValue('V5+')).toBe(5.5);
  });

  test('gradeValue falls back for missing or invalid grades', () => {
    expect(gradeValue('')).toBe(-1);
    expect(gradeValue('Font 6A')).toBe(-1);
  });

  test('grade comparators sort in the expected direction', () => {
    const grades = ['V6', 'V2', 'V4+'];

    expect([...grades].sort(compareGradesAscending)).toEqual(['V2', 'V4+', 'V6']);
    expect([...grades].sort(compareGradesDescending)).toEqual(['V6', 'V4+', 'V2']);
  });
});
