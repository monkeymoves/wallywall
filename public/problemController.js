export function createProblemController({
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
  getCurrentUser,
  getCurrentBoard,
  closeAllSheets,
  closeSheet,
  openSheet,
  setButtonBusy,
  showConfirm,
  showToast,
  resetBoardZoom,
  refreshProblems,
  renderShell,
}) {
  function getSelectedProblem() {
    return getProblemById(state.currentProblems, state.selectedProblemId);
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
      DOM.problemInfoCard.classList.remove('is-clickable');
      updateProblemNavButtons();
      return;
    }

    if (!selectedProblem) {
      DOM.problemInfoCard.classList.add('hidden');
      DOM.problemInfoCard.classList.remove('is-clickable');
      DOM.problemPositionText.textContent = '';
      editor.clear();
      updateProblemNavButtons();
      return;
    }

    const { index, total } = getProblemPosition(state.filteredProblems, selectedProblem.id);

    DOM.problemInfoCard.classList.remove('hidden');
    DOM.problemInfoCard.classList.add('is-clickable');
    DOM.problemGradeDisplay.textContent = selectedProblem.grade || 'Ungraded';
    DOM.problemInfoName.textContent = selectedProblem.name || 'Untitled problem';
    DOM.problemDescriptionText.textContent = selectedProblem.description || 'No notes yet.';
    DOM.problemPositionText.textContent = total ? `${index + 1} / ${total}` : '';
    editor.setHolds(selectedProblem.holds || []);
    updateProblemNavButtons();
  }

  function configureProblemSheetForCurrentMode() {
    const selectedProblem = getSelectedProblem();
    const isReadOnly = !state.isPlacementMode;

    DOM.problemName.readOnly = isReadOnly;
    DOM.problemDesc.readOnly = isReadOnly;
    DOM.problemGrade.disabled = isReadOnly;

    if (isReadOnly) {
      DOM.problemSheetEyebrow.textContent = 'Problem';
      DOM.problemSheetTitle.textContent = selectedProblem?.name || 'Problem details';
      DOM.problemSheetIntro.textContent = 'View the full route description, grade, and notes for this problem.';
      DOM.cancelSheetBtn.textContent = 'Close details';
      DOM.saveProblemDetailsBtn.classList.add('hidden');
      DOM.deleteProblemRow.classList.add('hidden');
      return;
    }

    const isCreateMode = state.problemSheetMode === 'create';
    DOM.problemSheetEyebrow.textContent = isCreateMode ? 'New problem' : 'Problem';
    DOM.problemSheetTitle.textContent = isCreateMode ? 'Name, grade & notes' : 'Edit details';
    DOM.problemSheetIntro.textContent = 'Keep hold placement on the board and open this card only for the route name, grade, and notes.';
    DOM.cancelSheetBtn.textContent = 'Keep placing';
    DOM.saveProblemDetailsBtn.classList.remove('hidden');
    DOM.deleteProblemRow.classList.toggle(
      'hidden',
      state.problemSheetMode !== 'edit' || !selectedProblem || !canDeleteCurrentProblem()
    );
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

  function beginPlacement(mode) {
    if (!state.currentBoard || !canEditCurrentBoard()) {
      showToast('You do not have permission to edit problems on this board.', 'error');
      return;
    }

    state.problemSheetMode = mode;
    state.prePlacementProblemId = state.selectedProblemId;
    state.isPlacementMode = true;
    resetBoardZoom();

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
    const selectedProblem = getSelectedProblem();
    if (!state.isPlacementMode && !selectedProblem) return;

    if (!state.isPlacementMode && selectedProblem) {
      populateProblemForm(selectedProblem);
    }

    configureProblemSheetForCurrentMode();
    openSheet(DOM.problemSheet);
  }

  function closeProblemDetails() {
    closeSheet(DOM.problemSheet);
  }

  function exitPlacement({ restorePreviousSelection = true } = {}) {
    state.isPlacementMode = false;
    closeSheet(DOM.problemSheet);
    editor.setActive(false);
    resetBoardZoom();

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
    if (!getCurrentBoard() || !canEditCurrentBoard()) {
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
        await updateProblem(getCurrentBoard().id, selectedProblemId, problemData);
      } else {
        if (getCurrentUser()) {
          problemData.ownerUid = getCurrentUser().uid;
        }
        const newProblemRef = await addProblem(getCurrentBoard().id, problemData);
        selectedProblemId = newProblemRef.id;
      }

      state.selectedProblemId = selectedProblemId;
      exitPlacement({ restorePreviousSelection: false });
      await refreshProblems({
        preserveSelected: true,
        selectedProblemId,
      });
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
      await deleteProblem(getCurrentBoard().id, selectedProblem.id);
      state.selectedProblemId = '';
      exitPlacement({ restorePreviousSelection: false });
      await refreshProblems({ preserveSelected: false });
      renderShell();
      showToast('Problem deleted.', 'success');
    } catch (error) {
      showToast(`Could not delete the problem: ${error.message}`, 'error');
    }
  }

  function bindEvents() {
    DOM.openProblemsBtn.addEventListener('click', () => openSheet(DOM.problemsSheet));
    DOM.closeProblemsSheetBtn.addEventListener('click', () => closeSheet(DOM.problemsSheet));
    DOM.problemGradeFilter.addEventListener('change', (event) => {
      state.selectedGradeFilter = event.target.value || 'all';
      renderProblemBrowser();
      renderProblemDetails();
      renderShell();
    });
    DOM.newProblemBtn.addEventListener('click', () => beginPlacement('create'));
    DOM.editProblemBtn.addEventListener('click', () => beginPlacement('edit'));
    DOM.openProblemDetailsBtn.addEventListener('click', openProblemDetails);
    DOM.closeProblemSheetBtn.addEventListener('click', closeProblemDetails);
    DOM.cancelSheetBtn.addEventListener('click', closeProblemDetails);
    DOM.problemInfoCard.addEventListener('click', (event) => {
      if (state.isPlacementMode || !getSelectedProblem()) return;
      if (event.target.closest('#prevProblemBtn, #nextProblemBtn')) return;
      openProblemDetails();
    });
    DOM.problemInfoCard.addEventListener('keydown', (event) => {
      if (state.isPlacementMode || !getSelectedProblem()) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openProblemDetails();
    });
    DOM.deleteProblemSheetBtn.addEventListener('click', handleDeleteProblem);
    DOM.cancelDrawBtn.addEventListener('click', cancelPlacement);
    DOM.saveProblemBtn.addEventListener('click', handleSaveProblem);
    DOM.saveProblemDetailsBtn.addEventListener('click', handleSaveProblem);
    DOM.prevProblemBtn.addEventListener('click', () => navigateProblems(-1));
    DOM.nextProblemBtn.addEventListener('click', () => navigateProblems(1));
  }

  return {
    beginPlacement,
    bindEvents,
    cancelPlacement,
    closeProblemDetails,
    configureProblemSheetForCurrentMode,
    exitPlacement,
    getSelectedProblem,
    navigateProblems,
    openProblemDetails,
    renderProblemBrowser,
    renderProblemDetails,
    selectProblem,
  };
}
