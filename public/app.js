import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

import { auth, storage } from './firebase/firebaseConfig.mjs';
import { createAccount, signInWithEmail, signOutUser } from './firebase/auth.js';
import {
  addAccessCode,
  addProblem,
  createBoard,
  deleteProblem,
  getAccessCode,
  getBoard,
  getProblemsByBoardId,
  getUserPermissionForBoard,
  listenForOwnedBoards,
  listenForSharedBoards,
  listenForSharedUsers,
  revokeAccess,
  shareBoardWithUser,
  updateProblem,
} from './firebase/firestore.js';
import {
  clearGuestSession,
  clearSelectedBoardId,
  getGuestSession,
  getSelectedBoardId,
  setGuestSession,
  setSelectedBoardId,
} from './appState.js';
import { ProblemEditor } from './problemEditor.js';
import {
  DOM,
  closeAllSheets,
  closeSheet,
  openSheet,
  setButtonBusy,
  setInlineStatus,
  setPill,
  showBoardStatus,
  showConfirm,
  showToast,
} from './ui.js';

const bottomDock = DOM.browseControls.closest('footer');
const editor = new ProblemEditor({
  canvas: DOM.canvas,
  image: DOM.currentBoard,
  holdButtons: DOM.holdBtns,
});

const state = {
  currentUser: null,
  currentBoard: null,
  currentProblems: [],
  filteredProblems: [],
  ownedBoards: [],
  sharedBoards: [],
  selectedProblemId: '',
  sharedAccessLevel: null,
  isPlacementMode: false,
  problemSheetMode: 'create',
  latestGeneratedCode: null,
  boardLoadToken: 0,
};

let unsubscribeOwnedBoards = null;
let unsubscribeSharedBoards = null;
let unsubscribeSharedUsers = null;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normalizeCode(value) {
  return value.trim().toUpperCase();
}

function gradeValue(grade) {
  if (!grade) return -1;
  const match = grade.match(/V(\d+)(\+)?/);
  if (!match) return -1;
  return Number.parseInt(match[1], 10) + (match[2] ? 0.5 : 0);
}

function randomCode() {
  return (Math.random().toString(36) + '000000000000')
    .slice(2, 8)
    .toUpperCase();
}

function isOwner() {
  return Boolean(
    state.currentUser &&
    state.currentBoard &&
    state.currentUser.uid === state.currentBoard.ownerUid
  );
}

function getGuestAccessForCurrentBoard() {
  const guestSession = getGuestSession();
  if (!guestSession || !state.currentBoard) return null;
  return guestSession.boardId === state.currentBoard.id ? guestSession : null;
}

function canEditCurrentBoard() {
  if (isOwner()) return true;
  if (state.currentUser && state.sharedAccessLevel === 'edit') return true;
  return getGuestAccessForCurrentBoard()?.level === 'edit';
}

function canDeleteCurrentBoard() {
  if (isOwner()) return true;
  return Boolean(state.currentUser && state.sharedAccessLevel === 'edit');
}

function getAccessPresentation() {
  if (!state.currentBoard) {
    return { label: '', className: 'hidden', description: '' };
  }

  if (isOwner()) {
    return {
      label: 'Owner',
      className: 'pill-owner',
      description: `You own ${state.currentBoard.name}.`,
    };
  }

  if (state.currentUser && state.sharedAccessLevel === 'edit') {
    return {
      label: 'Member editor',
      className: 'pill-member-edit',
      description: `You have signed-in edit access to ${state.currentBoard.name}.`,
    };
  }

  if (state.currentUser && state.sharedAccessLevel === 'read') {
    return {
      label: 'Member viewer',
      className: 'pill-member-read',
      description: `You can view ${state.currentBoard.name} but cannot edit problems.`,
    };
  }

  const guestAccess = getGuestAccessForCurrentBoard();
  if (guestAccess?.level === 'edit') {
    return {
      label: 'Guest editor',
      className: 'pill-guest-edit',
      description: `You are using a temporary edit code for ${state.currentBoard.name}.`,
    };
  }

  if (guestAccess?.level === 'read') {
    return {
      label: 'Guest viewer',
      className: 'pill-guest-read',
      description: `You are using a temporary read code for ${state.currentBoard.name}.`,
    };
  }

  return {
    label: 'View only',
    className: 'pill-view-only',
    description: `This board is visible, but you do not currently have edit access.`,
  };
}

function getSelectedProblem() {
  return state.currentProblems.find((problem) => problem.id === state.selectedProblemId) || null;
}

function resetProblemForm() {
  DOM.problemName.value = '';
  DOM.problemDesc.value = '';
  DOM.problemGrade.value = '';
}

function populateProblemForm(problem) {
  DOM.problemName.value = problem?.name || '';
  DOM.problemDesc.value = problem?.description || '';
  DOM.problemGrade.value = problem?.grade || '';
}

function renderProblemDetails() {
  const selectedProblem = getSelectedProblem();

  if (state.isPlacementMode) {
    DOM.problemInfoCard.classList.add('hidden');
    return;
  }

  if (!selectedProblem) {
    DOM.problemInfoCard.classList.add('hidden');
    editor.clear();
    return;
  }

  DOM.problemInfoCard.classList.remove('hidden');
  DOM.problemGradeDisplay.textContent = selectedProblem.grade || 'Ungraded';
  DOM.problemInfoName.textContent = selectedProblem.name || 'Untitled problem';
  DOM.problemDescriptionText.textContent = selectedProblem.description || 'No description yet.';
  editor.setHolds(selectedProblem.holds || []);
}

function renderProblemOptions() {
  const filterValue = DOM.problemSearchInput.value.trim().toLowerCase();
  const selectedProblem = getSelectedProblem();

  const filteredProblems = [...state.currentProblems]
    .filter((problem) => {
      if (!filterValue) return true;
      const haystack = [problem.name, problem.grade, problem.description].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(filterValue);
    })
    .sort((left, right) => {
      const gradeDiff = gradeValue(left.grade) - gradeValue(right.grade);
      if (gradeDiff !== 0) return gradeDiff;
      return (left.name || '').localeCompare(right.name || '');
    });

  state.filteredProblems = filteredProblems;
  DOM.problemSelect.innerHTML = '<option value="">Select a problem</option>';
  filteredProblems.forEach((problem) => {
    const option = document.createElement('option');
    option.value = problem.id;
    option.textContent = problem.grade ? `${problem.name} (${problem.grade})` : problem.name;
    DOM.problemSelect.append(option);
  });

  if (selectedProblem && filteredProblems.some((problem) => problem.id === selectedProblem.id)) {
    DOM.problemSelect.value = selectedProblem.id;
  } else {
    state.selectedProblemId = '';
    DOM.problemSelect.value = '';
  }

  DOM.problemSearchSummary.classList.toggle('hidden', !filterValue);
  if (filterValue) {
    DOM.problemSearchSummary.textContent = filteredProblems.length === 0
      ? 'No problems match that search.'
      : `${filteredProblems.length} problem${filteredProblems.length === 1 ? '' : 's'} match.`;
  } else {
    DOM.problemSearchSummary.textContent = '';
  }

  DOM.problemResultsList.innerHTML = '';
  const showResultsList = Boolean(filterValue);
  DOM.problemResultsList.classList.toggle('hidden', !showResultsList);
  if (showResultsList) {
    filteredProblems.slice(0, 8).forEach((problem) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'problem-result-btn';
      button.classList.toggle('active', state.selectedProblemId === problem.id);
      button.textContent = problem.grade ? `${problem.name} (${problem.grade})` : problem.name;
      button.addEventListener('click', () => {
        state.selectedProblemId = problem.id;
        DOM.problemSelect.value = problem.id;
        renderProblemDetails();
        renderProblemOptions();
        renderShell();
      });
      DOM.problemResultsList.append(button);
    });
  }

  DOM.problemEmptyState.classList.toggle('hidden', !state.currentBoard || state.currentProblems.length > 0);
  renderProblemDetails();
  renderShell();
}

function renderBoardList(listElement, boards) {
  listElement.innerHTML = '';

  boards.forEach((board) => {
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.toggle('active', state.currentBoard?.id === board.id);

    const title = document.createElement('strong');
    title.textContent = board.name || 'Untitled board';

    const subtitle = document.createElement('span');
    subtitle.textContent = board.source === 'owned'
      ? 'Owned by you'
      : board.level === 'edit'
        ? 'Shared editor access'
        : 'Shared viewer access';

    button.append(title, subtitle);
    button.addEventListener('click', async () => {
      await loadBoard(board.id, board);
      closeSheet(DOM.boardsSheet);
    });

    listItem.append(button);
    listElement.append(listItem);
  });
}

function renderBoardLists() {
  DOM.ownedBoardsList.innerHTML = '';
  DOM.sharedBoardsList.innerHTML = '';

  if (!state.currentUser) {
    DOM.ownedBoardsSection.classList.add('hidden');
    DOM.sharedBoardsSection.classList.add('hidden');
    DOM.boardsListMessage.textContent = 'Sign in to see your saved boards. You can still join any board with a code.';
    return;
  }

  if (state.ownedBoards.length === 0 && state.sharedBoards.length === 0) {
    DOM.boardsListMessage.textContent = 'No boards yet. Create your first board or join one with a code.';
  } else {
    DOM.boardsListMessage.textContent = 'Open one of your boards, switch to a shared wall, or create a new board.';
  }
  DOM.ownedBoardsSection.classList.toggle('hidden', state.ownedBoards.length === 0);
  DOM.sharedBoardsSection.classList.toggle('hidden', state.sharedBoards.length === 0);

  renderBoardList(DOM.ownedBoardsList, state.ownedBoards);
  renderBoardList(DOM.sharedBoardsList, state.sharedBoards);
}

function renderSharedUsers(users = []) {
  DOM.sharedUsersList.innerHTML = '';
  DOM.sharedUsersEmpty.classList.toggle('hidden', users.length > 0);

  users.forEach((entry) => {
    const item = document.createElement('li');
    const copy = document.createElement('div');
    const email = document.createElement('strong');
    const level = document.createElement('span');
    const revokeButton = document.createElement('button');

    email.textContent = entry.email || entry.id;
    level.textContent = entry.level === 'edit' ? 'Can create, edit, and delete' : 'Read only';
    revokeButton.type = 'button';
    revokeButton.textContent = 'Revoke';
    revokeButton.addEventListener('click', async () => {
      const confirmed = await showConfirm({
        title: 'Revoke board access?',
        body: `Remove ${entry.email || 'this user'} from ${state.currentBoard?.name || 'this board'}?`,
        confirmLabel: 'Revoke access',
      });
      if (!confirmed) return;

      try {
        await revokeAccess(state.currentBoard.id, entry.id);
        showToast('Access revoked.', 'success');
      } catch (error) {
        showToast(`Could not revoke access: ${error.message}`, 'error');
      }
    });

    copy.append(email, level);
    item.append(copy, revokeButton);
    DOM.sharedUsersList.append(item);
  });
}

function renderAccountState() {
  const loggedIn = Boolean(state.currentUser);
  DOM.signedOutAccountView.classList.toggle('hidden', loggedIn);
  DOM.signedInAccountView.classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    DOM.signedInEmail.textContent = state.currentUser.email || 'Signed in';
    DOM.accountStatus.textContent = 'You can create boards, keep shared access between visits, and manage your boards.';
    return;
  }

  DOM.accountStatus.textContent = 'Sign in to create boards and keep shared boards saved to your account.';
}

function renderAccessSheet() {
  if (!state.currentBoard) {
    DOM.accessSheetTitle.textContent = 'Board access';
    DOM.accessSheetDescription.textContent = 'Choose a board first to see permissions, guest codes, and members.';
    DOM.ownerAccessSection.classList.add('hidden');
    DOM.memberAccessSection.classList.add('hidden');
    return;
  }

  const presentation = getAccessPresentation();
  DOM.accessSheetTitle.textContent = state.currentBoard.name || 'Board access';
  DOM.accessSheetDescription.textContent = presentation.description;

  if (isOwner()) {
    DOM.ownerAccessSection.classList.remove('hidden');
    DOM.memberAccessSection.classList.add('hidden');
  } else {
    DOM.ownerAccessSection.classList.add('hidden');
    DOM.memberAccessSection.classList.remove('hidden');
    DOM.memberAccessText.textContent = presentation.description;
  }

  DOM.generatedCodePanel.classList.toggle('hidden', !state.latestGeneratedCode);
  if (state.latestGeneratedCode) {
    DOM.generatedCodeValue.textContent = state.latestGeneratedCode.code;
    DOM.generatedCodeMeta.textContent = `${state.latestGeneratedCode.level.toUpperCase()} code for ${state.currentBoard.name}`;
  }
}

function renderShell() {
  const hasBoard = Boolean(state.currentBoard);
  const presentation = getAccessPresentation();

  DOM.currentBoardName.textContent = hasBoard ? state.currentBoard.name || 'Untitled board' : 'Choose a board';
  DOM.welcomeMessage.classList.toggle('hidden', hasBoard);
  DOM.boardScene.classList.toggle('hidden', !hasBoard);
  DOM.openAccessBtn.classList.toggle('hidden', !hasBoard);
  DOM.permissionPill.classList.toggle('hidden', !hasBoard);

  bottomDock.classList.toggle('hidden', !hasBoard);

  if (hasBoard) {
    setPill(DOM.permissionPill, presentation.label, presentation.className);
  }

  DOM.browseControls.classList.toggle('hidden', state.isPlacementMode || !hasBoard);
  DOM.editControls.classList.toggle('hidden', !state.isPlacementMode);

  const hasSelectedProblem = Boolean(state.selectedProblemId);
  DOM.problemSearchInput.disabled = !hasBoard || state.isPlacementMode;
  DOM.problemSelect.disabled = !hasBoard || state.isPlacementMode;
  DOM.newProblemBtn.classList.toggle('hidden', !hasBoard || !canEditCurrentBoard() || state.isPlacementMode);
  DOM.editProblemBtn.classList.toggle('hidden', !hasBoard || !canEditCurrentBoard() || !hasSelectedProblem || state.isPlacementMode);
  DOM.deleteProblemBtn.classList.toggle('hidden', !hasBoard || !canDeleteCurrentBoard() || !hasSelectedProblem || state.isPlacementMode);

  renderAccessSheet();
  renderAccountState();
}

function stopBoardListeners() {
  unsubscribeOwnedBoards?.();
  unsubscribeSharedBoards?.();
  unsubscribeOwnedBoards = null;
  unsubscribeSharedBoards = null;
}

function stopSharedUsersListener() {
  unsubscribeSharedUsers?.();
  unsubscribeSharedUsers = null;
  renderSharedUsers([]);
}

async function refreshCurrentBoardAccess() {
  if (!state.currentBoard) {
    state.sharedAccessLevel = null;
    return;
  }

  if (isOwner()) {
    state.sharedAccessLevel = null;
    return;
  }

  if (state.currentUser) {
    state.sharedAccessLevel = await getUserPermissionForBoard(state.currentBoard.id, state.currentUser.uid);
    return;
  }

  state.sharedAccessLevel = null;
}

async function loadProblems(boardId, { preserveSelected = false } = {}) {
  const selectedId = preserveSelected ? state.selectedProblemId : '';
  state.currentProblems = await getProblemsByBoardId(boardId);
  state.selectedProblemId = selectedId && state.currentProblems.some((problem) => problem.id === selectedId)
    ? selectedId
    : '';
  renderProblemOptions();
}

async function loadBoardById(boardId, options = {}) {
  const boardSnap = await getBoard(boardId);
  if (!boardSnap) {
    if (getGuestSession()?.boardId === boardId) {
      clearGuestSession();
    }
    clearSelectedBoardId();

    if (state.currentBoard?.id === boardId) {
      state.currentBoard = null;
      state.currentProblems = [];
      state.selectedProblemId = '';
      editor.clear();
      renderShell();
    }
    return false;
  }

  await loadBoard(boardSnap.id, { id: boardSnap.id, ...boardSnap.data() }, options);
  return true;
}

async function loadBoard(boardId, boardData, options = {}) {
  state.currentBoard = { ...boardData, id: boardId };
  state.selectedProblemId = '';
  state.latestGeneratedCode = null;
  DOM.problemSearchInput.value = '';
  setSelectedBoardId(boardId);

  const boardLoadToken = ++state.boardLoadToken;
  showBoardStatus('Loading board…', 'info');

  DOM.currentBoard.crossOrigin = 'anonymous';
  DOM.currentBoard.onload = () => {
    if (boardLoadToken !== state.boardLoadToken) return;
    editor.syncCanvasToImage();
  };
  DOM.currentBoard.onerror = () => {
    if (boardLoadToken !== state.boardLoadToken) return;
    showBoardStatus('The board image could not be loaded.', 'error');
  };
  DOM.currentBoard.src = boardData.imageUrl;

  await refreshCurrentBoardAccess();
  await loadProblems(boardId, { preserveSelected: options.preserveSelected });
  renderProblemDetails();
  renderShell();

  if (isOwner()) {
    stopSharedUsersListener();
    unsubscribeSharedUsers = listenForSharedUsers(
      boardId,
      (snapshot) => {
        const users = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        renderSharedUsers(users);
      },
      (error) => {
        showToast(`Could not load shared users: ${error.message}`, 'error');
      }
    );
  } else {
    stopSharedUsersListener();
  }

  showBoardStatus('', 'info');
}

async function restoreBoardOnBoot() {
  const guestSession = getGuestSession();
  const selectedBoardId = guestSession?.boardId || getSelectedBoardId();
  if (!selectedBoardId) {
    renderShell();
    return;
  }

  try {
    await loadBoardById(selectedBoardId, { preserveSelected: true });
  } catch (error) {
    console.error(error);
    showBoardStatus('Could not restore the last board.', 'warning');
  }
}

function chooseBoardFromCollectionsIfNeeded() {
  if (state.currentBoard) return;

  const preferredBoardId = getSelectedBoardId();
  const allBoards = [...state.ownedBoards, ...state.sharedBoards];
  const preferredBoard = allBoards.find((board) => board.id === preferredBoardId);
  const fallbackBoard = preferredBoard || state.ownedBoards[0] || state.sharedBoards[0];

  if (fallbackBoard) {
    loadBoard(fallbackBoard.id, fallbackBoard).catch((error) => {
      showToast(`Could not open board: ${error.message}`, 'error');
    });
  }
}

function subscribeToBoards(userId) {
  stopBoardListeners();

  unsubscribeOwnedBoards = listenForOwnedBoards(
    userId,
    (snapshot) => {
      state.ownedBoards = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        source: 'owned',
        ...docSnap.data(),
      }));
      renderBoardLists();
      chooseBoardFromCollectionsIfNeeded();
    },
    (error) => {
      console.error(error);
      DOM.boardsListMessage.textContent = 'Could not load your owned boards.';
      showToast(`Owned boards failed to load: ${error.message}`, 'error');
    }
  );

  unsubscribeSharedBoards = listenForSharedBoards(
    userId,
    async (snapshot) => {
      try {
        const sharedBoards = await Promise.all(snapshot.docs.map(async (docSnap) => {
          const sharedData = docSnap.data();
          const boardSnap = await getBoard(sharedData.boardId);
          if (!boardSnap) return null;
          return {
            id: boardSnap.id,
            source: 'shared',
            level: sharedData.level,
            ...boardSnap.data(),
          };
        }));

        state.sharedBoards = sharedBoards.filter(Boolean);
        renderBoardLists();
        chooseBoardFromCollectionsIfNeeded();
      } catch (error) {
        console.error(error);
        DOM.boardsListMessage.textContent = 'Could not load shared boards.';
        showToast(`Shared boards failed to load: ${error.message}`, 'error');
      }
    },
    (error) => {
      console.error(error);
      DOM.boardsListMessage.textContent = 'Could not load shared boards.';
      showToast(`Shared boards failed to load: ${error.message}`, 'error');
    }
  );
}

async function promoteGuestAccessIfNeeded(user) {
  const guestSession = getGuestSession();
  if (!guestSession) return;

  const boardSnap = await getBoard(guestSession.boardId);
  if (!boardSnap) {
    clearGuestSession();
    return;
  }

  const boardData = boardSnap.data();
  if (boardData.ownerUid === user.uid) {
    clearGuestSession();
    return;
  }

  await shareBoardWithUser(
    guestSession.boardId,
    boardData.name,
    user.uid,
    user.email,
    guestSession.level,
    guestSession.code
  );

  clearGuestSession();
  showToast(`Saved ${boardData.name} to your account.`, 'success');
}

async function handleAuthStateChange(user) {
  state.currentUser = user;

  stopBoardListeners();
  state.ownedBoards = [];
  state.sharedBoards = [];
  renderBoardLists();

  try {
    if (user) {
      await promoteGuestAccessIfNeeded(user);
      subscribeToBoards(user.uid);
    }
  } catch (error) {
    console.error(error);
    showToast(`Could not save guest access: ${error.message}`, 'error');
  }

  await refreshCurrentBoardAccess();
  renderShell();
}

async function handleSignIn() {
  setButtonBusy(DOM.signInBtn, true, 'Signing in…');
  try {
    await signInWithEmail(DOM.emailInput.value, DOM.passwordInput.value);
    closeSheet(DOM.accountSheet);
    showToast('Signed in.', 'success');
  } catch (error) {
    setInlineStatus(DOM.accountHint, error.message, 'error');
  } finally {
    setButtonBusy(DOM.signInBtn, false);
  }
}

async function handleCreateAccount() {
  setButtonBusy(DOM.createAccountBtn, true, 'Creating…');
  try {
    await createAccount(DOM.emailInput.value, DOM.passwordInput.value);
    closeSheet(DOM.accountSheet);
    showToast('Account created.', 'success');
  } catch (error) {
    setInlineStatus(DOM.accountHint, error.message, 'error');
  } finally {
    setButtonBusy(DOM.createAccountBtn, false);
  }
}

async function handleSignOut() {
  setButtonBusy(DOM.signOutBtn, true, 'Signing out…');
  try {
    await signOutUser();
    closeSheet(DOM.accountSheet);
    showToast('Signed out.', 'success');
  } catch (error) {
    showToast(`Could not sign out: ${error.message}`, 'error');
  } finally {
    setButtonBusy(DOM.signOutBtn, false);
  }
}

async function handleCreateBoardSubmit(event) {
  event.preventDefault();

  if (!state.currentUser) {
    setInlineStatus(DOM.createBoardStatus, 'Create an account or sign in before creating a board.', 'warning');
    openSheet(DOM.accountSheet);
    return;
  }

  const file = DOM.boardImageInput.files?.[0];
  const boardName = DOM.boardNameInput.value.trim();
  if (!boardName || !file) {
    setInlineStatus(DOM.createBoardStatus, 'Add a board name and choose an image first.', 'warning');
    return;
  }

  setButtonBusy(DOM.createBoardSubmitBtn, true, 'Creating…');
  try {
    const fileExtension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const objectName = `${Date.now()}-${slugify(boardName) || 'board'}.${fileExtension}`;
    const objectPath = `layouts/${state.currentUser.uid}/${objectName}`;
    const imageRef = storageRef(storage, objectPath);

    await uploadBytes(imageRef, file);
    const imageUrl = await getDownloadURL(imageRef);
    const newBoardRef = await createBoard({
      name: boardName,
      imageUrl,
      ownerUid: state.currentUser.uid,
    });

    DOM.createBoardForm.reset();
    DOM.boardImageLabel.textContent = 'Choose an image';
    setInlineStatus(DOM.createBoardStatus, 'Board created.', 'success');
    closeSheet(DOM.createBoardSheet);
    closeSheet(DOM.boardsSheet);

    await loadBoard(newBoardRef.id, {
      id: newBoardRef.id,
      name: boardName,
      imageUrl,
      ownerUid: state.currentUser.uid,
      source: 'owned',
    });
    showToast(`Created ${boardName}.`, 'success');
  } catch (error) {
    setInlineStatus(DOM.createBoardStatus, error.message, 'error');
  } finally {
    setButtonBusy(DOM.createBoardSubmitBtn, false);
  }
}

async function handleJoinCodeSubmit(event) {
  event.preventDefault();

  const code = normalizeCode(DOM.joinCodeInput.value);
  if (!code) {
    setInlineStatus(DOM.joinCodeStatus, 'Enter a valid board code.', 'warning');
    return;
  }

  setButtonBusy(DOM.joinCodeSubmitBtn, true, 'Joining…');
  try {
    const codeSnap = await getAccessCode(code);
    if (!codeSnap) {
      setInlineStatus(DOM.joinCodeStatus, 'That code was not found.', 'error');
      return;
    }

    const { boardId, level } = codeSnap.data();
    const boardSnap = await getBoard(boardId);
    if (!boardSnap) {
      setInlineStatus(DOM.joinCodeStatus, 'This code points to a board that no longer exists.', 'error');
      return;
    }

    const boardData = boardSnap.data();

    if (state.currentUser && boardData.ownerUid !== state.currentUser.uid) {
      await shareBoardWithUser(boardId, boardData.name, state.currentUser.uid, state.currentUser.email, level, code);
      showToast(`Saved ${boardData.name} to your account.`, 'success');
      clearGuestSession();
    } else if (!state.currentUser) {
      setGuestSession({
        boardId,
        boardName: boardData.name,
        code,
        level,
      });
      showToast(`Joined ${boardData.name} for this session.`, 'success');
    }

    DOM.joinCodeForm.reset();
    setInlineStatus(DOM.joinCodeStatus, 'If you sign in first, the board will be saved to your account automatically.', 'info');
    closeSheet(DOM.joinCodeSheet);
    closeSheet(DOM.boardsSheet);
    await loadBoard(boardId, { id: boardId, ...boardData });
  } catch (error) {
    setInlineStatus(DOM.joinCodeStatus, error.message, 'error');
  } finally {
    setButtonBusy(DOM.joinCodeSubmitBtn, false);
  }
}

async function handleGenerateCode(level) {
  if (!state.currentBoard || !isOwner()) {
    showToast('Only the board owner can generate access codes.', 'error');
    return;
  }

  const code = randomCode();
  const trigger = level === 'edit' ? DOM.generateEditCodeBtn : DOM.generateReadCodeBtn;
  setButtonBusy(trigger, true, 'Generating…');
  try {
    await addAccessCode(state.currentBoard.id, code, level, state.currentBoard.name, state.currentUser.uid);
    state.latestGeneratedCode = { code, level };
    renderAccessSheet();
    showToast(`${level === 'edit' ? 'Edit' : 'Read'} code created.`, 'success');
  } catch (error) {
    showToast(`Could not create code: ${error.message}`, 'error');
  } finally {
    setButtonBusy(trigger, false);
  }
}

async function copyGeneratedCode() {
  if (!state.latestGeneratedCode) return;
  try {
    await navigator.clipboard.writeText(state.latestGeneratedCode.code);
    showToast('Code copied.', 'success');
  } catch (error) {
    showToast(`Could not copy the code: ${error.message}`, 'error');
  }
}

function beginPlacement(mode) {
  if (!state.currentBoard || !canEditCurrentBoard()) {
    showToast('You do not have permission to edit problems on this board.', 'error');
    return;
  }

  state.problemSheetMode = mode;
  state.isPlacementMode = true;

  if (mode === 'create') {
    resetProblemForm();
    editor.clear();
  } else {
    const selectedProblem = getSelectedProblem();
    if (!selectedProblem) {
      showToast('Choose a problem to edit first.', 'warning');
      state.isPlacementMode = false;
      return;
    }
    populateProblemForm(selectedProblem);
    editor.setHolds(selectedProblem.holds || []);
  }

  editor.setActive(true);
  closeAllSheets();
  renderShell();
}

function cancelPlacement() {
  state.isPlacementMode = false;
  closeSheet(DOM.problemSheet);
  editor.setActive(false);

  const selectedProblem = getSelectedProblem();
  if (selectedProblem) {
    editor.setHolds(selectedProblem.holds || []);
  } else {
    editor.clear();
  }

  renderProblemDetails();
  renderShell();
}

function openProblemDetailsSheet() {
  if (!editor.getHolds().length) {
    showToast('Place at least one hold before continuing.', 'warning');
    return;
  }

  DOM.problemSheetTitle.textContent = state.problemSheetMode === 'edit' ? 'Update problem' : 'Save problem';
  openSheet(DOM.problemSheet);
}

async function handleSaveProblem() {
  if (!state.currentBoard || !canEditCurrentBoard()) {
    showToast('You do not have permission to save this problem.', 'error');
    return;
  }

  const name = DOM.problemName.value.trim();
  if (!name) {
    showToast('Add a name before saving the problem.', 'warning');
    return;
  }

  const problemData = {
    name,
    description: DOM.problemDesc.value.trim(),
    grade: DOM.problemGrade.value,
    holds: editor.getHolds(),
  };

  const guestAccess = getGuestAccessForCurrentBoard();
  if (guestAccess?.level === 'edit') {
    problemData.guestCode = guestAccess.code;
  }

  setButtonBusy(DOM.saveProblemBtn, true, state.problemSheetMode === 'edit' ? 'Updating…' : 'Saving…');
  try {
    let selectedProblemId = state.selectedProblemId;

    if (state.problemSheetMode === 'edit') {
      await updateProblem(state.currentBoard.id, selectedProblemId, problemData);
    } else {
      if (state.currentUser) {
        problemData.ownerUid = state.currentUser.uid;
      }
      const newProblemRef = await addProblem(state.currentBoard.id, problemData);
      selectedProblemId = newProblemRef.id;
    }

    state.isPlacementMode = false;
    editor.setActive(false);
    closeSheet(DOM.problemSheet);

    await loadProblems(state.currentBoard.id, { preserveSelected: false });
    state.selectedProblemId = selectedProblemId;
    renderProblemOptions();
    renderProblemDetails();
    renderShell();
    showToast(state.problemSheetMode === 'edit' ? 'Problem updated.' : 'Problem saved.', 'success');
  } catch (error) {
    showToast(`Could not save the problem: ${error.message}`, 'error');
  } finally {
    setButtonBusy(DOM.saveProblemBtn, false);
  }
}

async function handleDeleteProblem() {
  const selectedProblem = getSelectedProblem();
  if (!selectedProblem || !canDeleteCurrentBoard()) return;

  const confirmed = await showConfirm({
    title: 'Delete this problem?',
    body: `Delete ${selectedProblem.name}? This cannot be undone.`,
    confirmLabel: 'Delete problem',
  });

  if (!confirmed) return;

  try {
    await deleteProblem(state.currentBoard.id, selectedProblem.id);
    state.selectedProblemId = '';
    await loadProblems(state.currentBoard.id, { preserveSelected: false });
    renderShell();
    showToast('Problem deleted.', 'success');
  } catch (error) {
    showToast(`Could not delete the problem: ${error.message}`, 'error');
  }
}

function bindEvents() {
  DOM.openBoardsBtn.addEventListener('click', () => openSheet(DOM.boardsSheet));
  DOM.openAccessBtn.addEventListener('click', () => openSheet(DOM.accessSheet));
  DOM.openAccountBtn.addEventListener('click', () => openSheet(DOM.accountSheet));
  DOM.closeBoardsSheetBtn.addEventListener('click', () => closeSheet(DOM.boardsSheet));
  DOM.closeAccessSheetBtn.addEventListener('click', () => closeSheet(DOM.accessSheet));
  DOM.closeAccountSheetBtn.addEventListener('click', () => closeSheet(DOM.accountSheet));
  DOM.closeCreateBoardSheetBtn.addEventListener('click', () => closeSheet(DOM.createBoardSheet));
  DOM.closeJoinCodeSheetBtn.addEventListener('click', () => closeSheet(DOM.joinCodeSheet));
  DOM.closeProblemSheetBtn.addEventListener('click', cancelPlacement);
  DOM.cancelSheetBtn.addEventListener('click', cancelPlacement);

  DOM.welcomeJoinBtn.addEventListener('click', () => openSheet(DOM.joinCodeSheet));
  DOM.welcomeBoardsBtn.addEventListener('click', () => openSheet(DOM.boardsSheet));

  DOM.createBoardShortcutBtn.addEventListener('click', () => {
    openSheet(DOM.createBoardSheet);
    setInlineStatus(
      DOM.createBoardStatus,
      state.currentUser ? 'Upload a board image to start creating problems.' : 'You need an account to create a board.',
      state.currentUser ? 'info' : 'warning'
    );
  });
  DOM.joinBoardShortcutBtn.addEventListener('click', () => openSheet(DOM.joinCodeSheet));

  DOM.signInBtn.addEventListener('click', handleSignIn);
  DOM.createAccountBtn.addEventListener('click', handleCreateAccount);
  DOM.signOutBtn.addEventListener('click', handleSignOut);

  DOM.createBoardForm.addEventListener('submit', handleCreateBoardSubmit);
  DOM.joinCodeForm.addEventListener('submit', handleJoinCodeSubmit);
  DOM.boardImageInput.addEventListener('change', () => {
    const file = DOM.boardImageInput.files?.[0];
    DOM.boardImageLabel.textContent = file ? file.name : 'Choose an image';
  });

  DOM.generateReadCodeBtn.addEventListener('click', () => handleGenerateCode('read'));
  DOM.generateEditCodeBtn.addEventListener('click', () => handleGenerateCode('edit'));
  DOM.copyGeneratedCodeBtn.addEventListener('click', copyGeneratedCode);

  DOM.problemSearchInput.addEventListener('input', renderProblemOptions);
  DOM.problemSelect.addEventListener('change', () => {
    state.selectedProblemId = DOM.problemSelect.value;
    renderProblemDetails();
    renderShell();
  });
  DOM.newProblemBtn.addEventListener('click', () => beginPlacement('create'));
  DOM.editProblemBtn.addEventListener('click', () => beginPlacement('edit'));
  DOM.deleteProblemBtn.addEventListener('click', handleDeleteProblem);
  DOM.finishDrawBtn.addEventListener('click', openProblemDetailsSheet);
  DOM.cancelDrawBtn.addEventListener('click', cancelPlacement);
  DOM.saveProblemBtn.addEventListener('click', handleSaveProblem);

  window.addEventListener('resize', () => {
    editor.syncCanvasToImage();
  });
}

async function init() {
  bindEvents();
  renderBoardLists();
  renderShell();
  await restoreBoardOnBoot();
  onAuthStateChanged(auth, (user) => {
    handleAuthStateChange(user).catch((error) => {
      console.error(error);
      showToast(`Auth update failed: ${error.message}`, 'error');
    });
  });
}

init().catch((error) => {
  console.error(error);
  showBoardStatus('The app could not be initialised.', 'error');
});
