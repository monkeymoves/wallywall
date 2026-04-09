import { describe, expect, test } from 'vitest';

import {
  buildTrainingLogCsvContent,
  buildTrainingLogJsonPayload,
  chooseBoardFromCollections,
  createEmptyTrainingReviewCache,
  csvEscape,
  isActiveBoardLoad,
  slugify,
  timestampToIso,
} from '../public/appHelpers.js';

describe('appHelpers', () => {
  test('createEmptyTrainingReviewCache returns the idle shape', () => {
    expect(createEmptyTrainingReviewCache()).toEqual({
      boardId: '',
      userId: '',
      status: 'idle',
      errorMessage: '',
      entriesByDate: [],
    });
  });

  test('slugify and csvEscape normalize export-safe strings', () => {
    expect(slugify(' The Church Wall!! ')).toBe('the-church-wall');
    expect(csvEscape('He said, "go"')).toBe('"He said, ""go"""');
  });

  test('chooseBoardFromCollections prefers the selected board, then owned, then shared', () => {
    const ownedBoards = [{ id: 'owned-1', name: 'Owned' }];
    const sharedBoards = [{ id: 'shared-1', name: 'Shared' }];

    expect(chooseBoardFromCollections({
      currentBoard: null,
      preferredBoardId: 'shared-1',
      ownedBoards,
      sharedBoards,
    })?.id).toBe('shared-1');

    expect(chooseBoardFromCollections({
      currentBoard: null,
      preferredBoardId: 'missing',
      ownedBoards,
      sharedBoards,
    })?.id).toBe('owned-1');
  });

  test('isActiveBoardLoad validates both token and current board id', () => {
    const state = {
      boardLoadToken: 3,
      currentBoard: { id: 'board-1' },
    };

    expect(isActiveBoardLoad(state, 'board-1', 3)).toBe(true);
    expect(isActiveBoardLoad(state, 'board-2', 3)).toBe(false);
    expect(isActiveBoardLoad(state, 'board-1', 4)).toBe(false);
  });

  test('training export helpers preserve session and entry details', () => {
    const entriesByDate = [
      {
        dateKey: '2026-04-09',
        entryCount: 1,
        completedCount: 1,
        notCompletedCount: 0,
        entries: [
          {
            problemId: 'problem-1',
            problemName: 'Warm Up',
            problemGrade: 'V3',
            completed: true,
            note: 'Smooth',
            loggedAt: new Date('2026-04-09T18:30:00Z'),
          },
        ],
      },
    ];

    expect(timestampToIso(entriesByDate[0].entries[0].loggedAt)).toBe('2026-04-09T18:30:00.000Z');

    expect(buildTrainingLogJsonPayload({
      boardId: 'board-1',
      boardName: 'Wall',
      entriesByDate,
      exportedAt: '2026-04-09T20:00:00.000Z',
    })).toEqual({
      exportedAt: '2026-04-09T20:00:00.000Z',
      board: {
        id: 'board-1',
        name: 'Wall',
      },
      sessions: [
        {
          dateKey: '2026-04-09',
          entryCount: 1,
          completedCount: 1,
          notCompletedCount: 0,
          entries: [
            {
              problemId: 'problem-1',
              problemName: 'Warm Up',
              problemGrade: 'V3',
              completed: true,
              note: 'Smooth',
              loggedAt: '2026-04-09T18:30:00.000Z',
            },
          ],
        },
      ],
    });

    expect(buildTrainingLogCsvContent({
      boardId: 'board-1',
      boardName: 'Wall',
      entriesByDate,
    })).toContain('boardId,boardName,dateKey,problemId,problemName,problemGrade,completed,note,loggedAt');
  });
});
