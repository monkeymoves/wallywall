import { beforeEach, describe, expect, test } from 'vitest';

import {
  clearGuestSession,
  clearSelectedBoardId,
  getGuestSession,
  getSelectedBoardId,
  setGuestSession,
  setSelectedBoardId,
} from '../public/appState.js';

function createLocalStorageMock() {
  const store = new Map();

  return {
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

beforeEach(() => {
  global.localStorage = createLocalStorageMock();
});

describe('appState', () => {
  test('stores and clears the selected board id', () => {
    setSelectedBoardId('board-1');
    expect(getSelectedBoardId()).toBe('board-1');

    clearSelectedBoardId();
    expect(getSelectedBoardId()).toBeNull();
  });

  test('stores guest session json and clears malformed data', () => {
    const session = { boardId: 'board-1', level: 'edit' };
    setGuestSession(session);
    expect(getGuestSession()).toEqual(session);

    global.localStorage.setItem('wallywall:guestSession', '{bad json');
    expect(getGuestSession()).toBeNull();

    setGuestSession(session);
    clearGuestSession();
    expect(getGuestSession()).toBeNull();
  });
});
