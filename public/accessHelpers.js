export function normalizeCode(value = '') {
  return value.trim().toUpperCase();
}

export function randomAccessCode(length = 8) {
  let code = '';
  while (code.length < length) {
    code += Math.random().toString(36).slice(2).toUpperCase();
  }
  return code.slice(0, length);
}

export function getGuestAccessForBoard(guestSession, boardId) {
  if (!guestSession || !boardId) return null;
  return guestSession.boardId === boardId ? guestSession : null;
}

export function isBoardOwner(currentUser, currentBoard) {
  return Boolean(
    currentUser &&
    currentBoard &&
    currentUser.uid === currentBoard.ownerUid
  );
}

export function canEditBoard({
  currentUser,
  currentBoard,
  sharedAccessLevel,
  guestSession,
}) {
  if (isBoardOwner(currentUser, currentBoard)) return true;
  if (currentUser && sharedAccessLevel === 'edit') return true;
  return guestSession?.level === 'edit';
}

export function canDeleteProblem({
  currentUser,
  currentBoard,
  sharedAccessLevel,
}) {
  if (isBoardOwner(currentUser, currentBoard)) return true;
  return Boolean(currentUser && sharedAccessLevel === 'edit');
}

export function getAccessPresentation({
  currentBoard,
  currentUser,
  sharedAccessLevel,
  guestSession,
}) {
  if (!currentBoard) {
    return { label: '', className: 'hidden', description: '' };
  }

  if (isBoardOwner(currentUser, currentBoard)) {
    return {
      label: 'Owner',
      className: 'pill-owner',
      description: `You own ${currentBoard.name}.`,
    };
  }

  if (currentUser && sharedAccessLevel === 'edit') {
    return {
      label: 'Member editor',
      className: 'pill-member-edit',
      description: `You can create, edit, and delete problems on ${currentBoard.name}.`,
    };
  }

  if (currentUser && sharedAccessLevel === 'read') {
    return {
      label: 'Member viewer',
      className: 'pill-member-read',
      description: `You can browse ${currentBoard.name} but cannot edit problems.`,
    };
  }

  if (guestSession?.level === 'edit') {
    return {
      label: 'Guest editor',
      className: 'pill-guest-edit',
      description: `${currentBoard.name} is remembered on this device with edit access.`,
    };
  }

  if (guestSession?.level === 'read') {
    return {
      label: 'Guest viewer',
      className: 'pill-guest-read',
      description: `${currentBoard.name} is remembered on this device with read access.`,
    };
  }

  return {
    label: 'View only',
    className: 'pill-view-only',
    description: `This board is visible, but you do not currently have edit access.`,
  };
}
