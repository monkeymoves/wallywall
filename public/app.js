import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

import { auth, storage } from './firebase/firebaseConfig.mjs';
import { createAccount, signInWithEmail, signOutUser } from './firebase/auth.js';
import {
  addAccessCode,
  addProblem,
  addTrainingEntry,
  createBoard,
  deleteProblem,
  getAccessCode,
  getBoard,
  getProblemsByBoardId,
  getTrainingEntriesForDate,
  getTrainingSessionsForBoard,
  getTrainingSessionsForMonth,
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
import {
  buildCalendarDays,
  buildMonthlyTrendRows,
  filterEntriesByMonth,
  formatCompletionRate,
  formatLoggedTime,
  getDateLabel,
  getMonthLabel,
  getMonthRange,
  getMonthStart,
  getTodayDateKey,
  isDateKeyInMonth,
  shiftMonth,
  summarizeTrainingEntries,
} from './trainingLog.js';
import { ProblemEditor } from './problemEditor.js';
import {
  DOM,
  closeSheet,
  openSheet,
  setButtonBusy,
  setInlineStatus,
  showBoardStatus,
  showConfirm,
  showToast,
} from './ui.js';
import {
  buildTrainingLogCsvContent,
  buildTrainingLogJsonPayload,
  createEmptyTrainingReviewCache,
  slugify,
} from './appHelpers.js';
import { createBoardViewportController } from './boardViewport.js';
import { createProblemController } from './problemController.js';
import { createTrainingLogController } from './trainingLogController.js';
import { createBoardAccessController } from './boardAccessController.js';

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
  boardZoom: 1,
  isBooting: true,
  initialAuthResolved: false,
  ownedBoardsReady: false,
  sharedBoardsReady: false,
  boardVisualReady: false,
  trainingMonthCursor: getMonthStart(new Date()),
  trainingSelectedDateKey: getTodayDateKey(),
  trainingMonthSessions: [],
  trainingDayEntries: [],
  quickLogCompleted: true,
  trainingLogTab: 'calendar',
  trainingReviewCache: createEmptyTrainingReviewCache(),
};

const MIN_BOARD_ZOOM = 1;
const MAX_BOARD_ZOOM = 2.6;
const BOARD_ZOOM_STEP = 0.2;

let renderShell = () => {};
let problemController;
let trainingLogController;

function canUseTrainingLog() {
  if (!state.currentUser || !state.currentBoard) return false;
  if (isOwner()) return true;
  if (state.sharedAccessLevel) return true;
  return state.ownedBoards.some((board) => board.id === state.currentBoard.id)
    || state.sharedBoards.some((board) => board.id === state.currentBoard.id);
}

function shouldShowSplash() {
  if (!state.isBooting) return false;
  if (!state.initialAuthResolved) return true;
  if (state.currentBoard) {
    return !state.boardVisualReady;
  }

  if (state.currentUser) {
    return !state.ownedBoardsReady || !state.sharedBoardsReady;
  }

  return false;
}

function maybeFinishBoot() {
  if (!state.isBooting || shouldShowSplash()) return;
  state.isBooting = false;
  renderShell();
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

async function loadProblems(boardId, { preserveSelected = false, selectedProblemId = '' } = {}) {
  const nextProblems = await getProblemsByBoardId(boardId);
  const preservedId = preserveSelected ? selectedProblemId : '';

  return {
    problems: nextProblems,
    selectedProblemId: preservedId && nextProblems.some((problem) => problem.id === preservedId)
      ? preservedId
      : '',
  };
}

function applyLoadedProblems({ problems, selectedProblemId }) {
  state.currentProblems = problems;
  state.selectedProblemId = selectedProblemId;
  problemController.renderProblemBrowser();
}

async function refreshProblems(options) {
  if (!state.currentBoard) return;
  applyLoadedProblems(await loadProblems(state.currentBoard.id, options));
}

const boardViewport = createBoardViewportController({
  DOM,
  editor,
  state,
  minZoom: MIN_BOARD_ZOOM,
  maxZoom: MAX_BOARD_ZOOM,
  zoomStep: BOARD_ZOOM_STEP,
  navigateProblems: (...args) => problemController?.navigateProblems(...args),
});

trainingLogController = createTrainingLogController({
  DOM,
  state,
  createEmptyTrainingReviewCache,
  buildTrainingLogCsvContent,
  buildTrainingLogJsonPayload,
  buildCalendarDays,
  buildMonthlyTrendRows,
  filterEntriesByMonth,
  formatCompletionRate,
  formatLoggedTime,
  getDateLabel,
  getMonthLabel,
  getMonthRange,
  getMonthStart,
  getTodayDateKey,
  isDateKeyInMonth,
  shiftMonth,
  slugify,
  summarizeTrainingEntries,
  addTrainingEntry,
  getTrainingEntriesForDate,
  getTrainingSessionsForBoard,
  getTrainingSessionsForMonth,
  getSelectedProblem: () => problemController?.getSelectedProblem() || null,
  canUseTrainingLog,
  getCurrentBoard: () => state.currentBoard,
  getCurrentUser: () => state.currentUser,
  closeSheet,
  openSheet,
  setButtonBusy,
  showToast,
});

problemController = createProblemController({
  DOM,
  state,
  editor,
  emptyProblemDraft,
  applyDraftToForm,
  formToDraft,
  isDraftDirty,
  problemToDraft,
  getAdjacentProblemId,
  getFilteredProblems,
  getProblemById,
  getProblemGradeOptions,
  getProblemPosition,
  addProblem,
  updateProblem,
  deleteProblem,
  canEditCurrentBoard,
  canDeleteCurrentProblem,
  getGuestAccessForCurrentBoard,
  getCurrentUser: () => state.currentUser,
  getCurrentBoard: () => state.currentBoard,
  closeAllSheets: () => {
    closeSheet(DOM.boardsSheet);
    closeSheet(DOM.createBoardSheet);
    closeSheet(DOM.joinCodeSheet);
    closeSheet(DOM.problemsSheet);
    closeSheet(DOM.quickLogSheet);
    closeSheet(DOM.trainingLogSheet);
    closeSheet(DOM.problemSheet);
  },
  closeSheet,
  openSheet,
  setButtonBusy,
  showConfirm,
  showToast,
  resetBoardZoom: boardViewport.resetBoardZoom,
  refreshProblems,
  renderShell: () => renderShell(),
});

const boardAccessController = createBoardAccessController({
  DOM,
  state,
  editor,
  authApi: {
    createAccount,
    signInWithEmail,
    signOutUser,
  },
  storageApi: {
    getDownloadURL,
    storage,
    storageRef,
    uploadBytes,
  },
  firestoreApi: {
    addAccessCode,
    createBoard,
    getAccessCode,
    getBoard,
    getUserPermissionForBoard,
    listenForOwnedBoards,
    listenForSharedBoards,
    listenForSharedUsers,
    revokeAccess,
    shareBoardWithUser,
  },
  appStateApi: {
    clearGuestSession,
    clearSelectedBoardId,
    getGuestSession,
    getSelectedBoardId,
    setGuestSession,
    setSelectedBoardId,
  },
  accessApi: {
    getAccessPresentation,
    getGuestAccessForBoard,
    normalizeCode,
    randomAccessCode,
  },
  uiApi: {
    closeSheet,
    openSheet,
    setButtonBusy,
    setInlineStatus,
    showBoardStatus,
    showConfirm,
    showToast,
  },
  emptyProblemDraft,
  resetTrainingLogState: trainingLogController.resetTrainingLogState,
  syncBoardViewport: boardViewport.syncBoardViewport,
  resetBoardZoom: boardViewport.resetBoardZoom,
  renderProblemBrowser: () => problemController.renderProblemBrowser(),
  renderProblemDetails: () => problemController.renderProblemDetails(),
  renderShell: () => renderShell(),
  loadProblems,
  applyLoadedProblems,
  maybeFinishBoot,
});

renderShell = function renderAppShell() {
  const hasBoard = Boolean(state.currentBoard);
  const isCreateMode = state.problemSheetMode === 'create';
  const hasSelectedProblem = Boolean(state.selectedProblemId);
  const canLogTraining = canUseTrainingLog();

  if (!canLogTraining) {
    closeSheet(DOM.quickLogSheet);
    closeSheet(DOM.trainingLogSheet);
  }

  document.body.classList.toggle('editing-mode', state.isPlacementMode);
  document.body.classList.toggle('create-mode', state.isPlacementMode && isCreateMode);
  document.body.classList.toggle('update-mode', state.isPlacementMode && !isCreateMode);
  document.body.classList.toggle('booting', shouldShowSplash());
  document.body.classList.toggle('app-ready', !shouldShowSplash());

  DOM.currentBoardName.textContent = hasBoard ? state.currentBoard.name || 'Untitled board' : 'Choose a board';
  DOM.launchScreen.classList.toggle('hidden', !shouldShowSplash());
  DOM.welcomeMessage.classList.toggle('hidden', hasBoard);
  DOM.boardScene.classList.toggle('hidden', !hasBoard);
  DOM.openQuickLogBtn.classList.toggle('hidden', !hasBoard || !canLogTraining || state.isPlacementMode);
  DOM.openQuickLogBtn.disabled = !canLogTraining || !hasSelectedProblem || state.isPlacementMode;
  DOM.openProblemsBtn.classList.toggle('hidden', !hasBoard || state.isPlacementMode);

  DOM.editTopbar.classList.toggle('hidden', !state.isPlacementMode);
  DOM.placementMetaStrip.classList.toggle('hidden', !state.isPlacementMode);
  DOM.editControls.classList.toggle('hidden', !state.isPlacementMode);
  DOM.boardZoomControls.classList.toggle('hidden', !hasBoard);

  DOM.editModeBanner.textContent = isCreateMode ? 'Creating' : 'Editing';
  DOM.placementModePill.textContent = isCreateMode ? 'New draft' : 'Hold layout';
  DOM.openProblemDetailsBtn.textContent = 'Details';

  DOM.newProblemBtn.classList.toggle('hidden', !hasBoard || !canEditCurrentBoard() || state.isPlacementMode);
  DOM.editProblemBtn.classList.toggle('hidden', !hasBoard || !canEditCurrentBoard() || !hasSelectedProblem || state.isPlacementMode);
  DOM.openTrainingLogMenuBtn.classList.toggle('hidden', !canLogTraining);
  DOM.exportTrainingCsvBtn.disabled = !canLogTraining;
  DOM.exportTrainingJsonBtn.disabled = !canLogTraining;
  DOM.deleteProblemSheetBtn.classList.toggle(
    'hidden',
    !state.isPlacementMode || state.problemSheetMode !== 'edit' || !hasSelectedProblem || !canDeleteCurrentProblem()
  );

  boardViewport.updateBoardZoomUi();
  trainingLogController.renderQuickLogSheet();
  trainingLogController.renderTrainingLogPanels();
  problemController.configureProblemSheetForCurrentMode();
  boardAccessController.renderAccessSheet();
  boardAccessController.renderAccountState();
};

async function init() {
  boardAccessController.bindEvents();
  problemController.bindEvents();
  trainingLogController.bindEvents();
  boardViewport.bindEvents();
  boardViewport.observeResize();

  boardAccessController.renderBoardLists();
  problemController.renderProblemBrowser();
  problemController.renderProblemDetails();
  boardViewport.updateBoardZoomUi();
  renderShell();

  await boardAccessController.restoreBoardOnBoot();

  onAuthStateChanged(auth, (user) => {
    boardAccessController.handleAuthStateChange(user).catch((error) => {
      console.error(error);
      showToast(`Auth update failed: ${error.message}`, 'error');
    }).finally(() => {
      state.initialAuthResolved = true;
      maybeFinishBoot();
    });
  });
}

init().catch((error) => {
  console.error(error);
  state.initialAuthResolved = true;
  state.isBooting = false;
  renderShell();
  showBoardStatus('The app could not be initialised.', 'error');
});
