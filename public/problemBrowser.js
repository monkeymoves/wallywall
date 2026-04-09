import { compareGradesAscending, gradeValue } from './gradeUtils.js';

export function getProblemById(problems, problemId) {
  return problems.find((problem) => problem.id === problemId) || null;
}

export function getProblemGradeOptions(problems) {
  const uniqueGrades = [...new Set(
    problems
      .map((problem) => problem.grade)
      .filter(Boolean)
  )];

  return uniqueGrades.sort(compareGradesAscending);
}

export function getFilteredProblems(problems, selectedGradeFilter = 'all') {
  return [...problems]
    .filter((problem) => selectedGradeFilter === 'all' || problem.grade === selectedGradeFilter)
    .sort((left, right) => {
      const gradeDiff = compareGradesAscending(left.grade, right.grade);
      if (gradeDiff !== 0) return gradeDiff;
      return (left.name || '').localeCompare(right.name || '');
    });
}

export function getAdjacentProblemId(filteredProblems, selectedProblemId, direction) {
  if (!filteredProblems.length || !selectedProblemId) return '';
  const index = filteredProblems.findIndex((problem) => problem.id === selectedProblemId);
  if (index === -1) return '';
  const nextProblem = filteredProblems[index + direction];
  return nextProblem?.id || '';
}

export function getProblemPosition(filteredProblems, selectedProblemId) {
  if (!selectedProblemId) {
    return { index: -1, total: filteredProblems.length };
  }

  return {
    index: filteredProblems.findIndex((problem) => problem.id === selectedProblemId),
    total: filteredProblems.length,
  };
}
