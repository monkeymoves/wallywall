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
import {
  canDeleteProblem,
  canEditBoard,
  getAccessPresentation,
  getGuestAccessForBoard,
  isBoardOwner,
  normalizeCode,
  randomAccessCode,
} from './accessHelpers.js';
import {
  emptyProblemDraft,
  applyDraftToForm,
  formToDraft,
  isDraftDirty,
  problemToDraft,
} from './problemDraft.js';
import {
  getAdjacentProblemId,
  getFilteredProblems,
  getProblemById,
  getProblemGradeOptions,
  getProblemPosition,
} from './problemBrowser.js';
import { ProblemEditor } from './problemEditor.js';
import {
  DOM,
  closeAllSheets,
  closeSheet,
  openSheet,
  setButtonBusy,
  setInlineStatus,
  showBoardStatus,
  showConfirm,
  showToast,
} from './ui.js';

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
  selectedGradeFilter: 'all',
  sharedAccessLevel: null,
  isPlacementMode: false,
  problemSheetMode: 'create',
  latestGeneratedCode: null,
  boardLoadToken: 0,
  draftBaseline: emptyProblemDraft(),
  prePlacementProblemId: '',
};

let unsubscribeOwnedBoards = null;
let unsubscribeSharedBoards = null;
let unsubscribeSharedUsers = null;
let boardResizeObserver = null;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function getSelectedProblem() {
  return getProblemById(state.currentProblems, state.selectedProblemId);
}

function getGuestAccessForCurrentBoard() {
  return getGuestAccessForBoard(getGuestSession(), state.currentBoard?.id);
}

function isOwner() {
  return isBoardOwner(state.currentUser, state.currentBoard);
}

function canEditCurrentBoard() {
  return canEditBoard({
    currentUser: state.currentUser,
    currentBoard: state.currentBoard,
    sharedAccessLevel: state.sharedAccessLevel,
    guestSession: getGuestAccessForCurrentBoard(),
  });
}

function canDeleteCurrentProblem() {
  return canDeleteProblem({
    currentUser: state.currentUser,
    currentBoard: state.currentBoard,
    sharedAccessLevel: state.sharedAccessLevel,
  });
}

function getCurrentDraft() {
  return formToDraft(DOM, editor.getHolds());
}

function resetProblemForm() {
  applyDraftToForm(DOM, emptyProblemDraft());
}

function populateProblemForm(problem) {
  applyDraftToForm(DOM, problemToDraft(problem));
}

function clearCurrentBoardState() {
  state.currentBoard = null;
  state.currentProblems = [];
  state.filteredProblems = [];
  state.selectedProblemId = '';
  state.sharedAccessLevel = null;
  state.latestGeneratedCode = null;
  state.selectedGradeFilter = 'all';
  state.isPlacementMode = false;
  state.problemSheetMode = 'create';
  state.draftBaseline = emptyProblemDraft();
  state.prePlacementProblemId = '';
  editor.setActive(false);
  editor.clear();
  clearSelectedBoardId();
  stopSharedUsersListener();
  renderProblemBrowser();
  renderShell();
}

function syncProblemGradeFilterOptions() {
  const gradeOptions = getProblemGradeOptions(state.currentProblems);
  const hasSelectedGrade = state.selectedGradeFilter !== 'all' && gradeOptions.includes(state.selectedGradeFilter);

  if (!hasSelectedGrade) {
    state.selectedGradeFilter = 'all';
  }

  DOM.problemGradeFilter.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'All grades';
  DOM.problemGradeFilter.append(allOption);

  gradeOptions.forEach((grade) => {
    const option = document.createElement('option');
    option.value = grade;
    option.textContent = grade;
    DOM.problemGradeFilter.append(option);
  });

  DOM.problemGradeFilter.value = state.selectedGradeFilter;
}

function updateProblemNavButtons() {
  const previousId = getAdjacentProblemId(state.filteredProblems, state.selectedProblemId, -1);
  const nextId = getAdjacentProblemId(state.filteredProblems, state.selectedProblemId, 1);
  DOM.prevProblemBtn.disabled = !previousId;
  DOM.nextProblemBtn.disabled = !nextId;
}

function renderProblemDetails() {
  const selectedProblem = getSelectedProblem();

  if (state.isPlacementMode) {
    DOM.problemInfoCard.classList.add('hidden');
    updateProblemNavButtons();
    return;
  }

  if (!selectedProblem) {
    DOM.problemInfoCard.classList.add('hidden');
    DOM.problemPositionText.textContent = '';
    editor.clear();
    updateProblemNavButtons();
    return;
  }

  const { index, total } = getProblemPosition(state.filteredProblems, selectedProblem.id);

  DOM.problemInfoCard.classList.remove('hidden');
  DOM.problemGradeDisplay.textContent = selectedProblem.grade || 'Ungraded';
  DOM.problemInfoName.textContent = selectedProblem.name || 'Untitled problem';
  DOM.problemDescriptionText.textContent = selectedProblem.description || 'No notes yet.';
  DOM.problemPositionText.textContent = total ? `${index + 1} / ${total}` : '';
  editor.setHolds(selectedProblem.holds || []);
  updateProblemNavButtons();
}

function selectProblem(problemId, { closeBrowser = false } = {}) {
  state.selectedProblemId = problemId || '';
  renderProblemBrowser();
  renderProblemDetails();
  renderShell();
  if (closeBrowser) {
    closeSheet(DOM.problemsSheet);
  }
}

function navigateProblems(direction) {
  if (!state.filteredProblems.length || state.isPlacementMode) return;

  if (!state.selectedProblemId) {
    selectProblem(state.filteredProblems[0].id);
    return;
  }

  const adjacentId = getAdjacentProblemId(state.filteredProblems, state.selectedProblemId, direction);
  if (!adjacentId) return;
  selectProblem(adjacentId);
}

function renderProblemBrowser() {
  syncProblemGradeFilterOptions();
  state.filteredProblems = getFilteredProblems(state.currentProblems, state.selectedGradeFilter);

  if (state.selectedProblemId && !state.filteredProblems.some((problem) => problem.id === state.selectedProblemId)) {
    state.selectedProblemId = '';
  }

  DOM.problemSearchSummary.textContent = state.selectedGradeFilter === 'all'
    ? `${state.filteredProblems.length} problem${state.filteredProblems.length === 1 ? '' : 's'} on this board.`
    : `${state.filteredProblems.length} ${state.selectedGradeFilter} problem${state.filteredProblems.length === 1 ? '' : 's'}.`;

  DOM.problemResultsList.innerHTML = '';

  if (!state.filteredProblems.length) {
    const empty = document.createElement('p');
    empty.className = 'sheet-copy';
    empty.textContent = state.selectedGradeFilter === 'all'
      ? 'No problems have been added to this board yet.'
      : `No ${state.selectedGradeFilter} problems on this board yet.`;
    DOM.problemResultsList.append(empty);
  } else {
    state.filteredProblems.forEach((problem) => {
      const button = document.createElement('button');
      const title = document.createElement('strong');
      const meta = document.createElement('div');
      const grade = document.createElement('span');
      const note = document.createElement('span');

      button.type = 'button';
      button.className = 'problem-browser-item';
      button.classList.toggle('active', state.selectedProblemId === problem.id);

      title.textContent = problem.name || 'Untitled problem';
      grade.textContent = problem.grade || 'Ungraded';
      note.textContent = problem.description ? problem.description.slice(0, 88) : 'No notes';
      meta.className = 'problem-browser-meta';
      meta.append(grade, note);

      button.append(title, meta);
      button.addEventListener('click', () => {
        selectProblem(problem.id, { closeBrowser: true });
      });

      DOM.problemResultsList.append(button);
    });
  }

  DOM.problemEmptyState.classList.toggle('hidden', !state.currentBoard || state.currentProblems.length > 0);
  updateProblemNavButtons();
}

function renderBoardList(listElement, boards) {
  listElement.innerHTML = '';

  boards.forEach((board) => {
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    const title = document.createElement('strong');
    const subtitle = document.createElement('span');

    button.type = 'button';
    button.classList.toggle('active', state.currentBoard?.id === board.id);

    title.textContent = board.name || 'Untitled board';
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
    DOM.boardsListMessage.textContent = 'Sign in to keep your boards and shared access in sync.';
    return;
  }

  DOM.ownedBoardsSection.classList.toggle('hidden', state.ownedBoards.length === 0);
  DOM.sharedBoardsSection.classList.toggle('hidden', state.sharedBoards.length === 0);

  DOM.boardsListMessage.textContent = state.ownedBoards.length === 0 && state.sharedBoards.length === 0
    ? 'No saved boards yet. Create your wall or join one with a code.'
    : 'Open a wall, manage sharing, or add a new board photo.';

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
    DOM.accountStatus.textContent = 'Create boards, save shared access, and manage guest codes.';
    return;
  }

  DOM.accountStatus.textContent = 'Sign in to create boards and save shared boards to your account.';
}

function renderAccessSheet() {
  if (!state.currentBoard) {
    DOM.boardAccessSection.classList.add('hidden');
    DOM.boardAccessCaption.textContent = 'Choose a board to see permissions and sharing options.';
    DOM.ownerAccessSection.classList.add('hidden');
    DOM.memberAccessSection.classList.add('hidden');
    DOM.guestAccessSection.classList.add('hidden');
    return;
  }

  const presentation = getAccessPresentation({
    currentBoard: state.currentBoard,
    currentUser: state.currentUser,
    sharedAccessLevel: state.sharedAccessLevel,
    guestSession: getGuestAccessForCurrentBoard(),
  });

  DOM.boardAccessSection.classList.remove('hidden');
  DOM.boardAccessCaption.textContent = presentation.description;

  const guestAccess = getGuestAccessForCurrentBoard();

  if (isOwner()) {
    DOM.ownerAccessSection.classList.remove('hidden');
    DOM.memberAccessSection.classList.add('hidden');
  } else {
    DOM.ownerAccessSection.classList.add('hidden');
    DOM.memberAccessSection.classList.toggle('hidden', !state.currentUser);
    DOM.memberAccessText.textContent = presentation.description;
  }

  DOM.guestAccessSection.classList.toggle('hidden', !guestAccess);
  if (guestAccess) {
    DOM.guestAccessText.textContent = `${state.currentBoard.name} is remembered on this device with ${guestAccess.level} access. Remove it here if you want the code to be required again.`;
  }

  DOM.generatedCodePanel.classList.toggle('hidden', !state.latestGeneratedCode);
  if (state.latestGeneratedCode) {
    DOM.generatedCodeValue.textContent = state.latestGeneratedCode.code;
    DOM.generatedCodeMeta.textContent = `${state.latestGeneratedCode.level.toUpperCase()} code for ${state.currentBoard.name}`;
  }
}

function renderShell() {
  const hasBoard = Boolean(state.currentBoard);
  const isCreateMode = state.problemSheetMode === 'create';
  const hasSelectedProblem = Boolean(state.selectedProblemId);

  document.body.classList.toggle('editing-mode', state.isPlacementMode);
  document.body.classList.toggle('create-mode', state.isPlacementMode && isCreateMode);
  document.body.classList.toggle('update-mode', state.isPlacementMode && !isCreateMode);

  DOM.currentBoardName.textContent = hasBoard ? state.currentBoard.name || 'Untitled board' : 'Choose a board';
  DOM.welcomeMessage.classList.toggle('hidden', hasBoard);
  DOM.boardScene.classList.toggle('hidden', !hasBoard);
  DOM.openProblemsBtn.classList.toggle('hidden', !hasBoard || state.isPlacementMode);
  DOM.currentProblemSummary.classList.add('hidden');

  DOM.editTopbar.classList.toggle('hidden', !state.isPlacementMode);
  DOM.placementMetaStrip.classList.toggle('hidden', !state.isPlacementMode);
  DOM.editControls.classList.toggle('hidden', !state.isPlacementMode);

  DOM.editModeBanner.textContent = isCreateMode ? 'Creating' : 'Editing';
  DOM.placementModePill.textContent = isCreateMode ? 'New draft' : 'Hold layout';
  DOM.openProblemDetailsBtn.textContent = 'Details';
  DOM.problemSheetEyebrow.textContent = isCreateMode ? 'New problem' : 'Problem';
  DOM.problemSheetTitle.textContent = isCreateMode ? 'Name, grade & notes' : 'Edit details';

  DOM.newProblemBtn.classList.toggle('hidden', !hasBoard || !canEditCurrentBoard() || state.isPlacementMode);
  DOM.editProblemBtn.classList.toggle('hidden', !hasBoard || !canEditCurrentBoard() || !hasSelectedProblem || state.isPlacementMode);
  DOM.deleteProblemSheetBtn.classList.toggle(
    'hidden',
    !state.isPlacementMode || state.problemSheetMode !== 'edit' || !hasSelectedProblem || !canDeleteCurrentProblem()
  );
  DOM.deleteProblemRow.classList.toggle(
    'hidden',
    !state.isPlacementMode || state.problemSheetMode !== 'edit' || !hasSelectedProblem || !canDeleteCurrentProblem()
  );

  renderAccessSheet();
  renderAccountState();
}

function openAccountMenuSection() {
  openSheet(DOM.boardsSheet);
  if (DOM.accountMenuSection) {
    DOM.accountMenuSection.open = true;
  }
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
  if (!state.currentBoard || isOwner()) {
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
  renderProblemBrowser();
}

async function loadBoardById(boardId, options = {}) {
  const boardSnap = await getBoard(boardId);
  if (!boardSnap) {
    if (getGuestSession()?.boardId === boardId) {
      clearGuestSession();
    }
    clearCurrentBoardState();
    return false;
  }

  await loadBoard(boardSnap.id, { id: boardSnap.id, ...boardSnap.data() }, options);
  return true;
}

async function loadBoard(boardId, boardData, options = {}) {
  state.currentBoard = { ...boardData, id: boardId };
  state.selectedProblemId = options.preserveSelected ? state.selectedProblemId : '';
  state.latestGeneratedCode = null;
  state.selectedGradeFilter = 'all';
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
  if (!guestSession?.boardId) {
    renderShell();
    return;
  }

  try {
    const restored = await loadBoardById(guestSession.boardId, { preserveSelected: true });
    if (!restored) {
      clearGuestSession();
    }
  } catch (error) {
    console.error(error);
    clearGuestSession();
    showBoardStatus('Could not restore remembered guest access.', 'warning');
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
    state.currentUser?.email || '',
    async (sharedEntries) => {
      try {
        const sharedBoards = await Promise.all(sharedEntries.map(async (sharedData) => {
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

  if (!user && state.currentBoard && !getGuestAccessForCurrentBoard()) {
    clearCurrentBoardState();
  }

  if (user) {
    try {
      await promoteGuestAccessIfNeeded(user);
    } catch (error) {
      console.warn('Skipping guest access promotion:', error);
      clearGuestSession();
    }

    subscribeToBoards(user.uid);
  }

  await refreshCurrentBoardAccess();
  renderShell();
}

async function handleSignIn() {
  setButtonBusy(DOM.signInBtn, true, 'Signing in…');
  try {
    await signInWithEmail(DOM.emailInput.value, DOM.passwordInput.value);
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
    openAccountMenuSection();
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
      clearGuestSession();
      showToast(`Saved ${boardData.name} to your account.`, 'success');
    } else if (!state.currentUser) {
      setGuestSession({
        boardId,
        boardName: boardData.name,
        code,
        level,
        grantedAt: new Date().toISOString(),
      });
      showToast(`Remembering ${boardData.name} on this device.`, 'success');
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

async function generateUniqueAccessCode() {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = randomAccessCode(8);
    const existingCode = await getAccessCode(candidate);
    if (!existingCode) {
      return candidate;
    }
  }

  throw new Error('Could not generate a unique board code. Try again.');
}

async function handleGenerateCode(level) {
  if (!state.currentBoard || !isOwner()) {
    showToast('Only the board owner can generate access codes.', 'error');
    return;
  }

  const trigger = level === 'edit' ? DOM.generateEditCodeBtn : DOM.generateReadCodeBtn;
  setButtonBusy(trigger, true, 'Generating…');
  try {
    const code = await generateUniqueAccessCode();
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
  state.prePlacementProblemId = state.selectedProblemId;
  state.isPlacementMode = true;

  if (mode === 'create') {
    state.selectedProblemId = '';
    resetProblemForm();
    editor.clear();
    state.draftBaseline = emptyProblemDraft();
  } else {
    const selectedProblem = getSelectedProblem();
    if (!selectedProblem) {
      showToast('Choose a problem to edit first.', 'warning');
      state.isPlacementMode = false;
      return;
    }
    populateProblemForm(selectedProblem);
    editor.setHolds(selectedProblem.holds || []);
    state.draftBaseline = problemToDraft({
      ...selectedProblem,
      holds: selectedProblem.holds || [],
    });
  }

  editor.setActive(true);
  closeAllSheets();
  renderProblemBrowser();
  renderProblemDetails();
  renderShell();
}

function openProblemDetails() {
  if (!state.isPlacementMode) return;
  openSheet(DOM.problemSheet);
}

function closeProblemDetails() {
  closeSheet(DOM.problemSheet);
}

function exitPlacement({ restorePreviousSelection = true } = {}) {
  state.isPlacementMode = false;
  closeSheet(DOM.problemSheet);
  editor.setActive(false);

  if (restorePreviousSelection && state.problemSheetMode === 'create') {
    state.selectedProblemId = state.prePlacementProblemId;
  }

  state.prePlacementProblemId = '';
  state.draftBaseline = emptyProblemDraft();

  const selectedProblem = getSelectedProblem();
  if (selectedProblem) {
    editor.setHolds(selectedProblem.holds || []);
  } else {
    editor.clear();
  }

  renderProblemBrowser();
  renderProblemDetails();
  renderShell();
}

async function cancelPlacement() {
  const dirty = isDraftDirty(state.draftBaseline, getCurrentDraft());
  if (dirty) {
    const confirmed = await showConfirm({
      title: 'Discard this draft?',
      body: 'You have unsaved changes to the current problem. Discard them and leave edit mode?',
      confirmLabel: 'Discard changes',
    });

    if (!confirmed) return;
  }

  exitPlacement({ restorePreviousSelection: true });
}

async function handleSaveProblem() {
  if (!state.currentBoard || !canEditCurrentBoard()) {
    showToast('You do not have permission to save this problem.', 'error');
    return;
  }

  const currentDraft = getCurrentDraft();
  if (!currentDraft.name) {
    openProblemDetails();
    showToast('Add a problem name before saving.', 'warning');
    return;
  }

  if (!currentDraft.grade) {
    openProblemDetails();
    showToast('Choose a grade before saving the problem.', 'warning');
    return;
  }

  const problemData = {
    name: currentDraft.name,
    description: currentDraft.description,
    grade: currentDraft.grade,
    holds: currentDraft.holds,
  };

  const guestAccess = getGuestAccessForCurrentBoard();
  if (guestAccess?.level === 'edit') {
    problemData.guestCode = guestAccess.code;
  }

  const busyLabel = state.problemSheetMode === 'edit' ? 'Updating…' : 'Saving…';
  setButtonBusy(DOM.saveProblemBtn, true, busyLabel);
  setButtonBusy(DOM.saveProblemDetailsBtn, true, busyLabel);

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

    state.selectedProblemId = selectedProblemId;
    exitPlacement({ restorePreviousSelection: false });
    await loadProblems(state.currentBoard.id, { preserveSelected: true });
    renderProblemBrowser();
    renderProblemDetails();
    renderShell();
    showToast(state.problemSheetMode === 'edit' ? 'Problem updated.' : 'Problem saved.', 'success');
  } catch (error) {
    showToast(`Could not save the problem: ${error.message}`, 'error');
  } finally {
    setButtonBusy(DOM.saveProblemBtn, false);
    setButtonBusy(DOM.saveProblemDetailsBtn, false);
  }
}

async function handleDeleteProblem() {
  const selectedProblem = getSelectedProblem();
  if (!selectedProblem || !canDeleteCurrentProblem()) return;

  closeSheet(DOM.problemSheet);

  const firstConfirmed = await showConfirm({
    title: 'Delete problem?',
    body: `You are about to remove ${selectedProblem.name}. Continue to the final delete confirmation?`,
    confirmLabel: 'Continue',
    confirmTone: 'danger',
  });

  if (!firstConfirmed) return;

  const confirmed = await showConfirm({
    title: 'Delete this problem?',
    body: `Delete ${selectedProblem.name}? This cannot be undone.`,
    confirmLabel: 'Delete problem',
  });

  if (!confirmed) return;

  try {
    await deleteProblem(state.currentBoard.id, selectedProblem.id);
    state.selectedProblemId = '';
    exitPlacement({ restorePreviousSelection: false });
    await loadProblems(state.currentBoard.id, { preserveSelected: false });
    renderShell();
    showToast('Problem deleted.', 'success');
  } catch (error) {
    showToast(`Could not delete the problem: ${error.message}`, 'error');
  }
}

async function clearRememberedGuestAccess() {
  const guestAccess = getGuestAccessForCurrentBoard();
  if (!guestAccess) return;

  const confirmed = await showConfirm({
    title: 'Remove device access?',
    body: `Stop remembering ${state.currentBoard?.name || 'this board'} on this device? The access code will be required again later.`,
    confirmLabel: 'Remove access',
  });

  if (!confirmed) return;

  clearGuestSession();

  if (!state.currentUser) {
    clearCurrentBoardState();
    closeSheet(DOM.boardsSheet);
  } else {
    renderAccessSheet();
    renderShell();
  }

  showToast('Removed remembered guest access.', 'success');
}

function bindSwipeNavigation(element) {
  if (!element) return;

  let startX = 0;
  let startY = 0;

  element.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });

  element.addEventListener('touchend', (event) => {
    if (state.isPlacementMode) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return;
    }

    navigateProblems(deltaX < 0 ? 1 : -1);
  }, { passive: true });
}

function bindEvents() {
  DOM.openBoardsBtn.addEventListener('click', () => openSheet(DOM.boardsSheet));
  DOM.openProblemsBtn.addEventListener('click', () => openSheet(DOM.problemsSheet));
  DOM.closeBoardsSheetBtn.addEventListener('click', () => closeSheet(DOM.boardsSheet));
  DOM.closeProblemsSheetBtn.addEventListener('click', () => closeSheet(DOM.problemsSheet));
  DOM.closeCreateBoardSheetBtn.addEventListener('click', () => closeSheet(DOM.createBoardSheet));
  DOM.closeJoinCodeSheetBtn.addEventListener('click', () => closeSheet(DOM.joinCodeSheet));
  DOM.closeProblemSheetBtn.addEventListener('click', closeProblemDetails);
  DOM.cancelSheetBtn.addEventListener('click', closeProblemDetails);

  DOM.problemGradeFilter.addEventListener('change', (event) => {
    state.selectedGradeFilter = event.target.value || 'all';
    renderProblemBrowser();
    renderProblemDetails();
    renderShell();
  });

  DOM.welcomeJoinBtn.addEventListener('click', () => openSheet(DOM.joinCodeSheet));
  DOM.welcomeBoardsBtn.addEventListener('click', () => openSheet(DOM.boardsSheet));

  DOM.createBoardShortcutBtn.addEventListener('click', () => {
    openSheet(DOM.createBoardSheet);
    setInlineStatus(
      DOM.createBoardStatus,
      state.currentUser ? 'Upload a board photo to start setting problems.' : 'You need an account to create a board.',
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
  DOM.clearGuestAccessBtn.addEventListener('click', clearRememberedGuestAccess);

  DOM.newProblemBtn.addEventListener('click', () => beginPlacement('create'));
  DOM.editProblemBtn.addEventListener('click', () => beginPlacement('edit'));
  DOM.openProblemDetailsBtn.addEventListener('click', openProblemDetails);
  DOM.deleteProblemSheetBtn.addEventListener('click', handleDeleteProblem);
  DOM.cancelDrawBtn.addEventListener('click', cancelPlacement);
  DOM.saveProblemBtn.addEventListener('click', handleSaveProblem);
  DOM.saveProblemDetailsBtn.addEventListener('click', handleSaveProblem);
  DOM.prevProblemBtn.addEventListener('click', () => navigateProblems(-1));
  DOM.nextProblemBtn.addEventListener('click', () => navigateProblems(1));

  bindSwipeNavigation(DOM.boardMedia);
  bindSwipeNavigation(DOM.problemInfoCard);

  window.addEventListener('resize', () => {
    editor.syncCanvasToImage();
  });
}

async function init() {
  bindEvents();

  if ('ResizeObserver' in window) {
    boardResizeObserver = new ResizeObserver(() => {
      editor.syncCanvasToImage();
    });
    boardResizeObserver.observe(DOM.boardFrame);
    boardResizeObserver.observe(DOM.currentBoard);
  }

  renderBoardLists();
  renderProblemBrowser();
  renderProblemDetails();
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
