import { describe, expect, test } from 'vitest';

import {
  canDeleteProblem,
  canEditBoard,
  getAccessPresentation,
  getGuestAccessForBoard,
  isBoardOwner,
  normalizeCode,
} from '../public/accessHelpers.js';

describe('accessHelpers', () => {
  const owner = { uid: 'owner-1' };
  const member = { uid: 'member-1' };
  const board = { id: 'board-1', name: 'Home Board', ownerUid: 'owner-1' };

  test('normalizeCode trims and uppercases access codes', () => {
    expect(normalizeCode(' ab12cd34 ')).toBe('AB12CD34');
  });

  test('getGuestAccessForBoard only returns matching remembered access', () => {
    const session = { boardId: 'board-1', level: 'edit' };
    expect(getGuestAccessForBoard(session, 'board-1')).toEqual(session);
    expect(getGuestAccessForBoard(session, 'board-2')).toBeNull();
  });

  test('owner and edit guests can edit, but only signed-in editors can delete', () => {
    expect(isBoardOwner(owner, board)).toBe(true);
    expect(canEditBoard({
      currentUser: owner,
      currentBoard: board,
      sharedAccessLevel: null,
      guestSession: null,
    })).toBe(true);
    expect(canEditBoard({
      currentUser: null,
      currentBoard: board,
      sharedAccessLevel: null,
      guestSession: { level: 'edit' },
    })).toBe(true);
    expect(canDeleteProblem({
      currentUser: null,
      currentBoard: board,
      sharedAccessLevel: 'edit',
    })).toBe(false);
    expect(canDeleteProblem({
      currentUser: member,
      currentBoard: board,
      sharedAccessLevel: 'edit',
    })).toBe(true);
  });

  test('getAccessPresentation describes current access level', () => {
    expect(getAccessPresentation({
      currentBoard: board,
      currentUser: owner,
      sharedAccessLevel: null,
      guestSession: null,
    }).label).toBe('Owner');

    expect(getAccessPresentation({
      currentBoard: board,
      currentUser: member,
      sharedAccessLevel: 'read',
      guestSession: null,
    }).label).toBe('Member viewer');

    expect(getAccessPresentation({
      currentBoard: board,
      currentUser: null,
      sharedAccessLevel: null,
      guestSession: { level: 'edit' },
    }).label).toBe('Guest editor');
  });
});
