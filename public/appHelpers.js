export function createEmptyTrainingReviewCache() {
  return {
    boardId: '',
    userId: '',
    status: 'idle',
    errorMessage: '',
    entriesByDate: [],
  };
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function isActiveBoardLoad(state, boardId, boardLoadToken) {
  return state.boardLoadToken === boardLoadToken && state.currentBoard?.id === boardId;
}

export function chooseBoardFromCollections({
  currentBoard,
  preferredBoardId,
  ownedBoards = [],
  sharedBoards = [],
}) {
  if (currentBoard) return null;

  const allBoards = [...ownedBoards, ...sharedBoards];
  const preferredBoard = allBoards.find((board) => board.id === preferredBoardId);
  return preferredBoard || ownedBoards[0] || sharedBoards[0] || null;
}

export function timestampToIso(timestampValue) {
  const date = timestampValue?.toDate ? timestampValue.toDate() : timestampValue instanceof Date ? timestampValue : null;
  return date ? date.toISOString() : '';
}

export function csvEscape(value) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

export function buildTrainingLogJsonPayload({
  boardId,
  boardName,
  entriesByDate = [],
  exportedAt = new Date().toISOString(),
}) {
  return {
    exportedAt,
    board: {
      id: boardId,
      name: boardName,
    },
    sessions: entriesByDate.map((session) => ({
      dateKey: session.dateKey,
      entryCount: session.entryCount || 0,
      completedCount: session.completedCount || 0,
      notCompletedCount: session.notCompletedCount || 0,
      entries: (session.entries || []).map((entry) => ({
        problemId: entry.problemId,
        problemName: entry.problemName,
        problemGrade: entry.problemGrade,
        completed: Boolean(entry.completed),
        note: entry.note || '',
        loggedAt: timestampToIso(entry.loggedAt),
      })),
    })),
  };
}

export function buildTrainingLogCsvContent({
  boardId,
  boardName,
  entriesByDate = [],
}) {
  const header = [
    'boardId',
    'boardName',
    'dateKey',
    'problemId',
    'problemName',
    'problemGrade',
    'completed',
    'note',
    'loggedAt',
  ];

  const rows = entriesByDate.flatMap((session) => (session.entries || []).map((entry) => ([
    boardId,
    boardName,
    session.dateKey,
    entry.problemId || '',
    entry.problemName || '',
    entry.problemGrade || '',
    entry.completed ? 'true' : 'false',
    entry.note || '',
    timestampToIso(entry.loggedAt),
  ])));

  return [
    header.join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\n');
}
