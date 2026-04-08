function cloneHolds(holds = []) {
  return holds.map((hold) => ({ ...hold }));
}

function normalizeText(value = '') {
  return value.trim();
}

function normalizeDraft(draft = {}) {
  return {
    name: normalizeText(draft.name),
    description: normalizeText(draft.description),
    grade: draft.grade || '',
    holds: cloneHolds(draft.holds || []),
  };
}

export function emptyProblemDraft() {
  return normalizeDraft({});
}

export function problemToDraft(problem) {
  if (!problem) return emptyProblemDraft();
  return normalizeDraft(problem);
}

export function applyDraftToForm(dom, draft) {
  dom.problemName.value = draft?.name || '';
  dom.problemDesc.value = draft?.description || '';
  dom.problemGrade.value = draft?.grade || '';
}

export function formToDraft(dom, holds = []) {
  return normalizeDraft({
    name: dom.problemName.value,
    description: dom.problemDesc.value,
    grade: dom.problemGrade.value,
    holds,
  });
}

export function isDraftDirty(baselineDraft, currentDraft) {
  return JSON.stringify(normalizeDraft(baselineDraft)) !== JSON.stringify(normalizeDraft(currentDraft));
}
