const SELECTED_BOARD_KEY = 'wallywall:selectedBoardId';
const GUEST_SESSION_KEY = 'wallywall:guestSession';

export function getSelectedBoardId() {
  return localStorage.getItem(SELECTED_BOARD_KEY);
}

export function setSelectedBoardId(boardId) {
  if (!boardId) return;
  localStorage.setItem(SELECTED_BOARD_KEY, boardId);
}

export function clearSelectedBoardId() {
  localStorage.removeItem(SELECTED_BOARD_KEY);
}

export function getGuestSession() {
  const raw = localStorage.getItem(GUEST_SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(GUEST_SESSION_KEY);
    return null;
  }
}

export function setGuestSession(session) {
  localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
}

export function clearGuestSession() {
  localStorage.removeItem(GUEST_SESSION_KEY);
}
