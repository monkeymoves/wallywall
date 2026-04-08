export function gradeValue(grade) {
  if (!grade) return -1;
  const match = grade.match(/V(\d+)(\+)?/);
  if (!match) return -1;
  return Number.parseInt(match[1], 10) + (match[2] ? 0.5 : 0);
}

export function getProblemById(problems, problemId) {
  return problems.find((problem) => problem.id === problemId) || null;
}

export function getProblemGradeOptions(problems) {
  const uniqueGrades = [...new Set(
    problems
      .map((problem) => problem.grade)
      .filter(Boolean)
  )];

  return uniqueGrades.sort((left, right) => gradeValue(left) - gradeValue(right));
}

export function getFilteredProblems(problems, selectedGradeFilter = 'all') {
  return [...problems]
    .filter((problem) => selectedGradeFilter === 'all' || problem.grade === selectedGradeFilter)
    .sort((left, right) => {
      const gradeDiff = gradeValue(left.grade) - gradeValue(right.grade);
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
