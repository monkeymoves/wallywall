export function gradeValue(grade) {
  if (!grade) return -1;
  const match = grade.match(/V(\d+)(\+)?/);
  if (!match) return -1;
  return Number.parseInt(match[1], 10) + (match[2] ? 0.5 : 0);
}

export function compareGradesAscending(left, right) {
  return gradeValue(left) - gradeValue(right);
}

export function compareGradesDescending(left, right) {
  return gradeValue(right) - gradeValue(left);
}
