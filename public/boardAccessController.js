import { chooseBoardFromCollections, isActiveBoardLoad, slugify } from './appHelpers.js';

export function createBoardAccessController({
  DOM,
  state,
  editor,
  authApi,
  storageApi,
  firestoreApi,
  appStateApi,
  accessApi,
  uiApi,
  emptyProblemDraft,
  resetTrainingLogState,
  syncBoardViewport,
  resetBoardZoom,
  renderProblemBrowser,
  renderProblemDetails,
  renderShell,
  loadProblems,
  applyLoadedProblems,
  maybeFinishBoot,
}) {
  let unsubscribeOwnedBoards = null;
  let unsubscribeSharedBoards = null;
  let unsubscribeSharedUsers = null;

  function getGuestAccessForCurrentBoard() {
    return accessApi.getGuestAccessForBoard(appStateApi.getGuestSession(), state.currentBoard?.id);
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
        uiApi.closeSheet(DOM.boardsSheet);
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
        const confirmed = await uiApi.showConfirm({
          title: 'Revoke board access?',
          body: `Remove ${entry.email || 'this user'} from ${state.currentBoard?.name || 'this board'}?`,
          confirmLabel: 'Revoke access',
        });
        if (!confirmed) return;

        try {
          await firestoreApi.revokeAccess(state.currentBoard.id, entry.id);
          uiApi.showToast('Access revoked.', 'success');
        } catch (error) {
          uiApi.showToast(`Could not revoke access: ${error.message}`, 'error');
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

    const presentation = accessApi.getAccessPresentation({
      currentBoard: state.currentBoard,
      currentUser: state.currentUser,
      sharedAccessLevel: state.sharedAccessLevel,
      guestSession: getGuestAccessForCurrentBoard(),
    });

    DOM.boardAccessSection.classList.remove('hidden');
    DOM.boardAccessCaption.textContent = presentation.description;

    const guestAccess = getGuestAccessForCurrentBoard();

    if (state.currentUser && state.currentUser.uid === state.currentBoard.ownerUid) {
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

  function openAccountMenuSection() {
    uiApi.openSheet(DOM.boardsSheet);
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
    state.boardZoom = 1;
    state.boardVisualReady = false;
    resetTrainingLogState();
    editor.setActive(false);
    editor.clear();
    uiApi.closeSheet(DOM.quickLogSheet);
    uiApi.closeSheet(DOM.trainingLogSheet);
    syncBoardViewport();
    appStateApi.clearSelectedBoardId();
    stopSharedUsersListener();
    renderProblemBrowser();
    renderShell();
  }

  async function refreshCurrentBoardAccess() {
    state.sharedAccessLevel = await fetchBoardAccessLevel(state.currentBoard);
  }

  async function fetchBoardAccessLevel(board) {
    if (!board || !state.currentUser || state.currentUser.uid === board.ownerUid) {
      return null;
    }

    return firestoreApi.getUserPermissionForBoard(board.id, state.currentUser.uid);
  }

  async function loadBoardById(boardId, options = {}) {
    const boardSnap = await firestoreApi.getBoard(boardId);
    if (!boardSnap) {
      if (appStateApi.getGuestSession()?.boardId === boardId) {
        appStateApi.clearGuestSession();
      }
      clearCurrentBoardState();
      return false;
    }

    await loadBoard(boardSnap.id, { id: boardSnap.id, ...boardSnap.data() }, options);
    return true;
  }

  async function loadBoard(boardId, boardData, options = {}) {
    const preservedProblemId = options.preserveSelected ? state.selectedProblemId : '';
    state.currentBoard = { ...boardData, id: boardId };
    state.selectedProblemId = preservedProblemId;
    state.latestGeneratedCode = null;
    state.selectedGradeFilter = 'all';
    state.boardVisualReady = false;
    resetTrainingLogState();
    appStateApi.setSelectedBoardId(boardId);
    resetBoardZoom();
    stopSharedUsersListener();

    const boardLoadToken = ++state.boardLoadToken;
    uiApi.showBoardStatus('Loading board…', 'info');

    DOM.currentBoard.onload = () => {
      if (boardLoadToken !== state.boardLoadToken) return;
      state.boardVisualReady = true;
      syncBoardViewport();
      maybeFinishBoot();
    };
    DOM.currentBoard.onerror = () => {
      if (boardLoadToken !== state.boardLoadToken) return;
      state.boardVisualReady = true;
      uiApi.showBoardStatus('The board image could not be loaded.', 'error');
      maybeFinishBoot();
    };
    DOM.currentBoard.src = boardData.imageUrl;

    const sharedAccessLevel = await fetchBoardAccessLevel(state.currentBoard);
    if (!isActiveBoardLoad(state, boardId, boardLoadToken)) return;
    state.sharedAccessLevel = sharedAccessLevel;

    const loadedProblems = await loadProblems(boardId, {
      preserveSelected: options.preserveSelected,
      selectedProblemId: preservedProblemId,
    });
    if (!isActiveBoardLoad(state, boardId, boardLoadToken)) return;
    applyLoadedProblems(loadedProblems);
    renderProblemDetails();
    renderShell();

    if (!isActiveBoardLoad(state, boardId, boardLoadToken)) return;
    if (state.currentUser && state.currentUser.uid === state.currentBoard.ownerUid) {
      unsubscribeSharedUsers = firestoreApi.listenForSharedUsers(
        boardId,
        (snapshot) => {
          if (!isActiveBoardLoad(state, boardId, boardLoadToken)) return;
          const users = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
          renderSharedUsers(users);
        },
        (error) => {
          if (!isActiveBoardLoad(state, boardId, boardLoadToken)) return;
          uiApi.showToast(`Could not load shared users: ${error.message}`, 'error');
        }
      );
    }

    if (!isActiveBoardLoad(state, boardId, boardLoadToken)) return;
    uiApi.showBoardStatus('', 'info');
  }

  async function restoreBoardOnBoot() {
    const guestSession = appStateApi.getGuestSession();
    if (!guestSession?.boardId) {
      renderShell();
      return;
    }

    try {
      const restored = await loadBoardById(guestSession.boardId, { preserveSelected: true });
      if (!restored) {
        appStateApi.clearGuestSession();
      }
    } catch (error) {
      console.error(error);
      appStateApi.clearGuestSession();
      uiApi.showBoardStatus('Could not restore remembered guest access.', 'warning');
    }
  }

  function chooseBoardFromCollectionsIfNeeded() {
    const fallbackBoard = chooseBoardFromCollections({
      currentBoard: state.currentBoard,
      preferredBoardId: appStateApi.getSelectedBoardId(),
      ownedBoards: state.ownedBoards,
      sharedBoards: state.sharedBoards,
    });

    if (fallbackBoard) {
      loadBoard(fallbackBoard.id, fallbackBoard).catch((error) => {
        uiApi.showToast(`Could not open board: ${error.message}`, 'error');
      });
    }
  }

  function subscribeToBoards(userId) {
    stopBoardListeners();

    unsubscribeOwnedBoards = firestoreApi.listenForOwnedBoards(
      userId,
      (snapshot) => {
        state.ownedBoardsReady = true;
        state.ownedBoards = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          source: 'owned',
          ...docSnap.data(),
        }));
        renderBoardLists();
        chooseBoardFromCollectionsIfNeeded();
        maybeFinishBoot();
      },
      (error) => {
        state.ownedBoardsReady = true;
        console.error(error);
        DOM.boardsListMessage.textContent = 'Could not load your owned boards.';
        uiApi.showToast(`Owned boards failed to load: ${error.message}`, 'error');
        maybeFinishBoot();
      }
    );

    unsubscribeSharedBoards = firestoreApi.listenForSharedBoards(
      userId,
      async (sharedEntries) => {
        try {
          state.sharedBoardsReady = true;
          const sharedBoards = await Promise.all(sharedEntries.map(async (sharedData) => {
            const boardSnap = await firestoreApi.getBoard(sharedData.boardId);
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
          maybeFinishBoot();
        } catch (error) {
          state.sharedBoardsReady = true;
          console.error(error);
          DOM.boardsListMessage.textContent = 'Could not load shared boards.';
          uiApi.showToast(`Shared boards failed to load: ${error.message}`, 'error');
          maybeFinishBoot();
        }
      },
      (error) => {
        state.sharedBoardsReady = true;
        console.error(error);
        DOM.boardsListMessage.textContent = 'Could not load shared boards.';
        uiApi.showToast(`Shared boards failed to load: ${error.message}`, 'error');
        maybeFinishBoot();
      }
    );
  }

  async function promoteGuestAccessIfNeeded(user) {
    const guestSession = appStateApi.getGuestSession();
    if (!guestSession) return;

    const boardSnap = await firestoreApi.getBoard(guestSession.boardId);
    if (!boardSnap) {
      appStateApi.clearGuestSession();
      return;
    }

    const boardData = boardSnap.data();
    if (boardData.ownerUid === user.uid) {
      appStateApi.clearGuestSession();
      return;
    }

    await firestoreApi.shareBoardWithUser(
      guestSession.boardId,
      boardData.name,
      user.uid,
      user.email,
      guestSession.level,
      guestSession.code
    );

    appStateApi.clearGuestSession();
    uiApi.showToast(`Saved ${boardData.name} to your account.`, 'success');
  }

  async function handleAuthStateChange(user) {
    state.currentUser = user;
    state.ownedBoardsReady = !user;
    state.sharedBoardsReady = !user;
    resetTrainingLogState();

    stopBoardListeners();
    state.ownedBoards = [];
    state.sharedBoards = [];
    renderBoardLists();

    if (!user && state.currentBoard && !getGuestAccessForCurrentBoard()) {
      clearCurrentBoardState();
    }

    if (!user) {
      uiApi.closeSheet(DOM.quickLogSheet);
      uiApi.closeSheet(DOM.trainingLogSheet);
    }

    if (user) {
      try {
        await promoteGuestAccessIfNeeded(user);
      } catch (error) {
        console.warn('Skipping guest access promotion:', error);
        appStateApi.clearGuestSession();
      }

      subscribeToBoards(user.uid);
    }

    await refreshCurrentBoardAccess();
    renderShell();
  }

  async function handleSignIn() {
    uiApi.setButtonBusy(DOM.signInBtn, true, 'Signing in…');
    try {
      await authApi.signInWithEmail(DOM.emailInput.value, DOM.passwordInput.value);
      uiApi.showToast('Signed in.', 'success');
    } catch (error) {
      uiApi.setInlineStatus(DOM.accountHint, error.message, 'error');
    } finally {
      uiApi.setButtonBusy(DOM.signInBtn, false);
    }
  }

  async function handleCreateAccount() {
    uiApi.setButtonBusy(DOM.createAccountBtn, true, 'Creating…');
    try {
      await authApi.createAccount(DOM.emailInput.value, DOM.passwordInput.value);
      uiApi.showToast('Account created.', 'success');
    } catch (error) {
      uiApi.setInlineStatus(DOM.accountHint, error.message, 'error');
    } finally {
      uiApi.setButtonBusy(DOM.createAccountBtn, false);
    }
  }

  async function handleSignOut() {
    uiApi.setButtonBusy(DOM.signOutBtn, true, 'Signing out…');
    try {
      await authApi.signOutUser();
      uiApi.showToast('Signed out.', 'success');
    } catch (error) {
      uiApi.showToast(`Could not sign out: ${error.message}`, 'error');
    } finally {
      uiApi.setButtonBusy(DOM.signOutBtn, false);
    }
  }

  async function handleCreateBoardSubmit(event) {
    event.preventDefault();

    if (!state.currentUser) {
      uiApi.setInlineStatus(DOM.createBoardStatus, 'Create an account or sign in before creating a board.', 'warning');
      openAccountMenuSection();
      return;
    }

    const file = DOM.boardImageInput.files?.[0];
    const boardName = DOM.boardNameInput.value.trim();
    if (!boardName || !file) {
      uiApi.setInlineStatus(DOM.createBoardStatus, 'Add a board name and choose an image first.', 'warning');
      return;
    }

    uiApi.setButtonBusy(DOM.createBoardSubmitBtn, true, 'Creating…');
    try {
      const fileExtension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const objectName = `${Date.now()}-${slugify(boardName) || 'board'}.${fileExtension}`;
      const objectPath = `layouts/${state.currentUser.uid}/${objectName}`;
      const imageRef = storageApi.storageRef(storageApi.storage, objectPath);

      await storageApi.uploadBytes(imageRef, file);
      const imageUrl = await storageApi.getDownloadURL(imageRef);
      const newBoardRef = await firestoreApi.createBoard({
        name: boardName,
        imageUrl,
        ownerUid: state.currentUser.uid,
      });

      DOM.createBoardForm.reset();
      DOM.boardImageLabel.textContent = 'Choose an image';
      uiApi.setInlineStatus(DOM.createBoardStatus, 'Board created.', 'success');
      uiApi.closeSheet(DOM.createBoardSheet);
      uiApi.closeSheet(DOM.boardsSheet);

      await loadBoard(newBoardRef.id, {
        id: newBoardRef.id,
        name: boardName,
        imageUrl,
        ownerUid: state.currentUser.uid,
        source: 'owned',
      });
      uiApi.showToast(`Created ${boardName}.`, 'success');
    } catch (error) {
      uiApi.setInlineStatus(DOM.createBoardStatus, error.message, 'error');
    } finally {
      uiApi.setButtonBusy(DOM.createBoardSubmitBtn, false);
    }
  }

  async function handleJoinCodeSubmit(event) {
    event.preventDefault();

    const code = accessApi.normalizeCode(DOM.joinCodeInput.value);
    if (!code) {
      uiApi.setInlineStatus(DOM.joinCodeStatus, 'Enter a valid board code.', 'warning');
      return;
    }

    uiApi.setButtonBusy(DOM.joinCodeSubmitBtn, true, 'Joining…');
    try {
      const codeSnap = await firestoreApi.getAccessCode(code);
      if (!codeSnap) {
        uiApi.setInlineStatus(DOM.joinCodeStatus, 'That code was not found.', 'error');
        return;
      }

      const { boardId, level } = codeSnap.data();
      const boardSnap = await firestoreApi.getBoard(boardId);
      if (!boardSnap) {
        uiApi.setInlineStatus(DOM.joinCodeStatus, 'This code points to a board that no longer exists.', 'error');
        return;
      }

      const boardData = boardSnap.data();

      if (state.currentUser && boardData.ownerUid !== state.currentUser.uid) {
        await firestoreApi.shareBoardWithUser(boardId, boardData.name, state.currentUser.uid, state.currentUser.email, level, code);
        appStateApi.clearGuestSession();
        uiApi.showToast(`Saved ${boardData.name} to your account.`, 'success');
      } else if (!state.currentUser) {
        appStateApi.setGuestSession({
          boardId,
          boardName: boardData.name,
          code,
          level,
          grantedAt: new Date().toISOString(),
        });
        uiApi.showToast(`Remembering ${boardData.name} on this device.`, 'success');
      }

      DOM.joinCodeForm.reset();
      uiApi.setInlineStatus(DOM.joinCodeStatus, 'If you sign in first, the board will be saved to your account automatically.', 'info');
      uiApi.closeSheet(DOM.joinCodeSheet);
      uiApi.closeSheet(DOM.boardsSheet);
      await loadBoard(boardId, { id: boardId, ...boardData });
    } catch (error) {
      uiApi.setInlineStatus(DOM.joinCodeStatus, error.message, 'error');
    } finally {
      uiApi.setButtonBusy(DOM.joinCodeSubmitBtn, false);
    }
  }

  async function generateUniqueAccessCode() {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const candidate = accessApi.randomAccessCode(8);
      const existingCode = await firestoreApi.getAccessCode(candidate);
      if (!existingCode) {
        return candidate;
      }
    }

    throw new Error('Could not generate a unique board code. Try again.');
  }

  async function handleGenerateCode(level) {
    if (!state.currentBoard || !state.currentUser || state.currentUser.uid !== state.currentBoard.ownerUid) {
      uiApi.showToast('Only the board owner can generate access codes.', 'error');
      return;
    }

    const trigger = level === 'edit' ? DOM.generateEditCodeBtn : DOM.generateReadCodeBtn;
    uiApi.setButtonBusy(trigger, true, 'Generating…');
    try {
      const code = await generateUniqueAccessCode();
      await firestoreApi.addAccessCode(state.currentBoard.id, code, level, state.currentBoard.name, state.currentUser.uid);
      state.latestGeneratedCode = { code, level };
      renderAccessSheet();
      uiApi.showToast(`${level === 'edit' ? 'Edit' : 'Read'} code created.`, 'success');
    } catch (error) {
      uiApi.showToast(`Could not create code: ${error.message}`, 'error');
    } finally {
      uiApi.setButtonBusy(trigger, false);
    }
  }

  async function copyGeneratedCode() {
    if (!state.latestGeneratedCode) return;
    try {
      await navigator.clipboard.writeText(state.latestGeneratedCode.code);
      uiApi.showToast('Code copied.', 'success');
    } catch (error) {
      uiApi.showToast(`Could not copy the code: ${error.message}`, 'error');
    }
  }

  async function clearRememberedGuestAccess() {
    const guestAccess = getGuestAccessForCurrentBoard();
    if (!guestAccess) return;

    const confirmed = await uiApi.showConfirm({
      title: 'Remove device access?',
      body: `Stop remembering ${state.currentBoard?.name || 'this board'} on this device? The access code will be required again later.`,
      confirmLabel: 'Remove access',
    });

    if (!confirmed) return;

    appStateApi.clearGuestSession();

    if (!state.currentUser) {
      clearCurrentBoardState();
      uiApi.closeSheet(DOM.boardsSheet);
    } else {
      renderAccessSheet();
      renderShell();
    }

    uiApi.showToast('Removed remembered guest access.', 'success');
  }

  function bindEvents() {
    DOM.openBoardsBtn.addEventListener('click', () => uiApi.openSheet(DOM.boardsSheet));
    DOM.closeBoardsSheetBtn.addEventListener('click', () => uiApi.closeSheet(DOM.boardsSheet));
    DOM.closeCreateBoardSheetBtn.addEventListener('click', () => uiApi.closeSheet(DOM.createBoardSheet));
    DOM.closeJoinCodeSheetBtn.addEventListener('click', () => uiApi.closeSheet(DOM.joinCodeSheet));
    DOM.welcomeJoinBtn.addEventListener('click', () => uiApi.openSheet(DOM.joinCodeSheet));
    DOM.welcomeBoardsBtn.addEventListener('click', () => uiApi.openSheet(DOM.boardsSheet));
    DOM.createBoardShortcutBtn.addEventListener('click', () => {
      uiApi.openSheet(DOM.createBoardSheet);
      uiApi.setInlineStatus(
        DOM.createBoardStatus,
        state.currentUser ? 'Upload a board photo to start setting problems.' : 'You need an account to create a board.',
        state.currentUser ? 'info' : 'warning'
      );
    });
    DOM.joinBoardShortcutBtn.addEventListener('click', () => uiApi.openSheet(DOM.joinCodeSheet));
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
  }

  return {
    bindEvents,
    handleAuthStateChange,
    loadBoard,
    refreshCurrentBoardAccess,
    renderAccessSheet,
    renderAccountState,
    renderBoardLists,
    restoreBoardOnBoot,
  };
}
