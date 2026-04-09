export function createTrainingLogController({
  DOM,
  state,
  createEmptyTrainingReviewCache,
  slugify,
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
  summarizeTrainingEntries,
  addTrainingEntry,
  getTrainingEntriesForDate,
  getTrainingSessionsForBoard,
  getTrainingSessionsForMonth,
  getSelectedProblem,
  canUseTrainingLog,
  getCurrentBoard,
  getCurrentUser,
  closeSheet,
  openSheet,
  setButtonBusy,
  showToast,
}) {
  let trainingReviewLoad = null;

  function downloadTextFile(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function resetTrainingLogState() {
    state.trainingMonthCursor = getMonthStart(new Date());
    state.trainingSelectedDateKey = getTodayDateKey();
    state.trainingMonthSessions = [];
    state.trainingDayEntries = [];
    state.quickLogCompleted = true;
    state.trainingLogTab = 'calendar';
    state.trainingReviewCache = createEmptyTrainingReviewCache();
    trainingReviewLoad = null;
    if (DOM.quickLogNote) {
      DOM.quickLogNote.value = '';
    }
    renderTrainingLogPanels();
    renderTrainingReview();
  }

  function renderQuickLogSheet() {
    const selectedProblem = getSelectedProblem();
    DOM.quickLogProblemGrade.textContent = selectedProblem?.grade || 'Ungraded';
    DOM.quickLogProblemName.textContent = selectedProblem?.name || 'Select a problem first';
    DOM.quickLogProblemDescription.textContent = selectedProblem?.description
      ? selectedProblem.description
      : 'Choose whether the climb went or not, then add any quick notes.';
    DOM.quickLogCompleteBtn.classList.toggle('is-active', state.quickLogCompleted);
    DOM.quickLogFailBtn.classList.toggle('is-active', !state.quickLogCompleted);
    DOM.saveQuickLogBtn.disabled = !selectedProblem || !canUseTrainingLog();
  }

  function getSessionSummaryForDate(dateKey) {
    return state.trainingMonthSessions.find((session) => session.dateKey === dateKey) || null;
  }

  function renderTrainingDayEntries() {
    DOM.trainingEntriesList.innerHTML = '';
    const summary = getSessionSummaryForDate(state.trainingSelectedDateKey);

    DOM.trainingDayTitle.textContent = getDateLabel(state.trainingSelectedDateKey);
    DOM.trainingDaySummary.textContent = summary
      ? `${summary.entryCount || 0} attempts · ${summary.completedCount || 0} completed · ${summary.notCompletedCount || 0} not completed`
      : 'No attempts logged yet.';

    if (!state.trainingDayEntries.length) {
      const empty = document.createElement('p');
      empty.className = 'sheet-copy';
      empty.textContent = 'Nothing logged for this day yet.';
      DOM.trainingEntriesList.append(empty);
      return;
    }

    state.trainingDayEntries.forEach((entry) => {
      const item = document.createElement('article');
      const head = document.createElement('div');
      const title = document.createElement('div');
      const name = document.createElement('strong');
      const time = document.createElement('span');
      const meta = document.createElement('div');
      const grade = document.createElement('span');
      const result = document.createElement('span');

      item.className = 'training-entry';
      head.className = 'training-entry-head';
      title.className = 'training-entry-title';
      meta.className = 'training-entry-meta';

      name.textContent = entry.problemName || 'Untitled problem';
      time.className = 'section-caption';
      time.textContent = formatLoggedTime(entry.loggedAt);

      grade.className = 'pill';
      grade.textContent = entry.problemGrade || 'Ungraded';

      result.className = `pill ${entry.completed ? 'pill-success' : 'pill-fail'}`;
      result.textContent = entry.completed ? 'Completed' : 'Not completed';

      title.append(name, time);
      meta.append(grade, result);
      head.append(title, meta);
      item.append(head);

      if (entry.note) {
        const note = document.createElement('p');
        note.className = 'sheet-copy';
        note.textContent = entry.note;
        item.append(note);
      }

      DOM.trainingEntriesList.append(item);
    });
  }

  function getCachedTrainingHistoryForCurrentBoard() {
    const currentBoard = getCurrentBoard();
    const currentUser = getCurrentUser();
    if (!currentBoard || !currentUser) return null;

    const { boardId, userId, status, entriesByDate } = state.trainingReviewCache;
    if (
      status === 'ready'
      && boardId === currentBoard.id
      && userId === currentUser.uid
    ) {
      return entriesByDate;
    }

    return null;
  }

  function setTrainingReviewCache({
    boardId,
    userId,
    status,
    errorMessage = '',
    entriesByDate = [],
  }) {
    state.trainingReviewCache = {
      boardId,
      userId,
      status,
      errorMessage,
      entriesByDate,
    };
  }

  function isActiveTrainingReviewLoad(boardId, userId) {
    return trainingReviewLoad?.boardId === boardId && trainingReviewLoad?.userId === userId;
  }

  function showTrainingReviewLoadError(error) {
    showToast(`Could not load review stats: ${error.message}`, 'error');
  }

  function renderTrainingStatGrid(container, stats) {
    if (!container) return;

    const cards = [
      ['Sessions', stats.sessionCount],
      ['Attempts', stats.attemptCount],
      ['Completion', formatCompletionRate(stats.completedCount, stats.attemptCount)],
      ['Best send', stats.bestCompletedGrade || 'No sends'],
    ];

    container.innerHTML = '';
    cards.forEach(([label, value]) => {
      const card = document.createElement('article');
      const labelElement = document.createElement('span');
      const valueElement = document.createElement('strong');

      card.className = 'training-stat-card';
      labelElement.className = 'training-stat-label';
      valueElement.className = 'training-stat-value';

      labelElement.textContent = label;
      valueElement.textContent = String(value);

      card.append(labelElement, valueElement);
      container.append(card);
    });
  }

  function renderTrainingTrendRows(rows = []) {
    DOM.trainingTrendTableBody.innerHTML = '';
    DOM.trainingTrendEmpty.classList.toggle('hidden', rows.length > 0);

    rows.forEach((row) => {
      const tableRow = document.createElement('tr');
      const values = [
        row.monthLabel,
        row.sessionCount,
        row.attemptCount,
        formatCompletionRate(row.completedCount, row.attemptCount),
        row.bestCompletedGrade || 'No sends',
        row.attemptedGradesSummary,
      ];

      values.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        tableRow.append(cell);
      });

      DOM.trainingTrendTableBody.append(tableRow);
    });
  }

  function renderTrainingLogPanels() {
    const showCalendar = state.trainingLogTab !== 'review';

    DOM.trainingCalendarPanel.classList.toggle('hidden', !showCalendar);
    DOM.trainingReviewPanel.classList.toggle('hidden', showCalendar);
    DOM.trainingCalendarTabBtn.classList.toggle('is-active', showCalendar);
    DOM.trainingReviewTabBtn.classList.toggle('is-active', !showCalendar);
    DOM.trainingCalendarTabBtn.setAttribute('aria-selected', showCalendar ? 'true' : 'false');
    DOM.trainingReviewTabBtn.setAttribute('aria-selected', showCalendar ? 'false' : 'true');
  }

  function renderTrainingReview() {
    if (!DOM.trainingReviewStatus) return;

    if (!canUseTrainingLog()) {
      DOM.trainingReviewStatus.textContent = 'Open a saved board while signed in to see review stats.';
      renderTrainingStatGrid(DOM.trainingMonthStats, summarizeTrainingEntries([]));
      renderTrainingStatGrid(DOM.trainingAllTimeStats, summarizeTrainingEntries([]));
      renderTrainingTrendRows([]);
      DOM.trainingTrendEmpty.textContent = 'No monthly history yet for this board.';
      return;
    }

    const cachedEntriesByDate = getCachedTrainingHistoryForCurrentBoard();
    const { status, errorMessage } = state.trainingReviewCache;

    if (!cachedEntriesByDate) {
      if (status === 'loading') {
        DOM.trainingReviewStatus.textContent = 'Loading review stats…';
      } else if (status === 'error') {
        DOM.trainingReviewStatus.textContent = `Could not load review stats: ${errorMessage}`;
      } else {
        DOM.trainingReviewStatus.textContent = 'Open a saved board to see review stats.';
      }
      renderTrainingStatGrid(DOM.trainingMonthStats, summarizeTrainingEntries([]));
      renderTrainingStatGrid(DOM.trainingAllTimeStats, summarizeTrainingEntries([]));
      renderTrainingTrendRows([]);
      DOM.trainingTrendEmpty.textContent = 'No monthly history yet for this board.';
      return;
    }

    const monthEntries = filterEntriesByMonth(cachedEntriesByDate, state.trainingMonthCursor);
    const monthSummary = summarizeTrainingEntries(monthEntries);
    const allTimeSummary = summarizeTrainingEntries(cachedEntriesByDate);
    const trendRows = buildMonthlyTrendRows(cachedEntriesByDate);
    const monthLabel = getMonthLabel(state.trainingMonthCursor);

    DOM.trainingReviewStatus.textContent = monthEntries.length
      ? `${monthLabel} summary with all-time board history.`
      : `No attempts logged in ${monthLabel} yet. All-time board history is still shown.`;
    DOM.trainingTrendEmpty.textContent = 'No monthly history yet for this board.';

    renderTrainingStatGrid(DOM.trainingMonthStats, monthSummary);
    renderTrainingStatGrid(DOM.trainingAllTimeStats, allTimeSummary);
    renderTrainingTrendRows(trendRows);
  }

  async function fetchTrainingHistoryForBoard(userId, boardId) {
    const sessions = await getTrainingSessionsForBoard(userId, boardId);
    if (!sessions.length) {
      return [];
    }

    return Promise.all(
      sessions.map(async (session) => ({
        ...session,
        entries: await getTrainingEntriesForDate(userId, boardId, session.dateKey),
      }))
    );
  }

  async function exportTrainingLog(format) {
    if (!canUseTrainingLog()) {
      showToast('Open a saved board while signed in to export logs.', 'warning');
      return;
    }

    const targetButton = format === 'csv' ? DOM.exportTrainingCsvBtn : DOM.exportTrainingJsonBtn;
    setButtonBusy(targetButton, true, 'Exporting…');

    try {
      const currentBoard = getCurrentBoard();
      const currentUser = getCurrentUser();
      const boardId = currentBoard.id;
      const boardName = currentBoard.name || 'Untitled board';
      const userId = currentUser.uid;
      const entriesByDate = getCachedTrainingHistoryForCurrentBoard()
        || await fetchTrainingHistoryForBoard(userId, boardId);

      if (getCurrentBoard()?.id === boardId && getCurrentUser()?.uid === userId) {
        setTrainingReviewCache({
          boardId,
          userId,
          status: 'ready',
          entriesByDate,
        });
        renderTrainingReview();
      }

      if (!entriesByDate.length) {
        showToast('No training data yet for this board.', 'warning');
        return;
      }

      const safeBoardName = slugify(boardName || 'board') || 'board';
      const stamp = getTodayDateKey();

      if (format === 'json') {
        const payload = buildTrainingLogJsonPayload({
          boardId,
          boardName,
          entriesByDate,
        });

        downloadTextFile(
          `wallywall-${safeBoardName}-training-log-${stamp}.json`,
          'application/json;charset=utf-8',
          `${JSON.stringify(payload, null, 2)}\n`
        );
      } else {
        const csv = buildTrainingLogCsvContent({
          boardId,
          boardName,
          entriesByDate,
        });

        downloadTextFile(
          `wallywall-${safeBoardName}-training-log-${stamp}.csv`,
          'text/csv;charset=utf-8',
          `${csv}\n`
        );
      }

      showToast(`Exported ${format.toUpperCase()} for ${boardName}.`, 'success');
    } catch (error) {
      showToast(`Could not export training data: ${error.message}`, 'error');
    } finally {
      setButtonBusy(targetButton, false);
    }
  }

  function getDefaultTrainingDateKey(monthStart, sessions = []) {
    const todayKey = getTodayDateKey();
    const { startKey } = getMonthRange(monthStart);

    if (isDateKeyInMonth(todayKey, monthStart)) {
      return todayKey;
    }

    if (sessions.length) {
      return sessions[sessions.length - 1].dateKey;
    }

    return startKey;
  }

  function renderTrainingCalendar() {
    const grid = buildCalendarDays(
      state.trainingMonthCursor,
      state.trainingMonthSessions,
      state.trainingSelectedDateKey,
      getTodayDateKey()
    );

    DOM.trainingLogMonthLabel.textContent = getMonthLabel(state.trainingMonthCursor);
    DOM.trainingCalendarGrid.innerHTML = '';

    grid.cells.forEach((cell) => {
      const button = document.createElement('button');
      const day = document.createElement('span');
      const count = document.createElement('span');

      button.type = 'button';
      button.className = 'calendar-day';
      if (!cell.inCurrentMonth) button.classList.add('is-outside');
      if (cell.isToday) button.classList.add('is-today');
      if (cell.isSelected) button.classList.add('is-selected');
      if (cell.summary?.entryCount) button.classList.add('has-entries');

      day.className = 'calendar-day-number';
      day.textContent = cell.dayNumber;
      count.className = 'calendar-day-count';
      count.textContent = cell.summary?.entryCount ? `${cell.summary.entryCount}` : '';

      button.append(day, count);
      button.addEventListener('click', async () => {
        state.trainingSelectedDateKey = cell.dateKey;
        renderTrainingCalendar();
        try {
          await loadTrainingEntries(state.trainingSelectedDateKey);
        } catch (error) {
          showToast(`Could not load that day: ${error.message}`, 'error');
        }
      });

      DOM.trainingCalendarGrid.append(button);
    });
  }

  async function loadTrainingEntries(dateKey) {
    const currentUser = getCurrentUser();
    const currentBoard = getCurrentBoard();

    if (!canUseTrainingLog()) {
      state.trainingDayEntries = [];
      renderTrainingDayEntries();
      return;
    }

    DOM.trainingEntriesList.innerHTML = '<p class="sheet-copy">Loading attempts…</p>';
    const entries = await getTrainingEntriesForDate(currentUser.uid, currentBoard.id, dateKey);
    state.trainingDayEntries = entries;
    renderTrainingDayEntries();
  }

  async function loadTrainingLogMonth() {
    const currentBoard = getCurrentBoard();
    const currentUser = getCurrentUser();

    if (!canUseTrainingLog()) {
      DOM.trainingLogBoardContext.textContent = 'Open a saved board while signed in to use the training log.';
      DOM.trainingCalendarGrid.innerHTML = '<p class="sheet-copy">Training logs are available on your own boards and saved shared boards.</p>';
      state.trainingDayEntries = [];
      renderTrainingReview();
      renderTrainingDayEntries();
      return;
    }

    const { startKey, endKey } = getMonthRange(state.trainingMonthCursor);
    DOM.trainingLogBoardContext.textContent = `${currentBoard.name} · private to your account`;
    DOM.trainingCalendarGrid.innerHTML = '<p class="sheet-copy">Loading calendar…</p>';

    const sessions = await getTrainingSessionsForMonth(currentUser.uid, currentBoard.id, startKey, endKey);
    state.trainingMonthSessions = sessions;

    if (!state.trainingSelectedDateKey || !isDateKeyInMonth(state.trainingSelectedDateKey, state.trainingMonthCursor)) {
      state.trainingSelectedDateKey = getDefaultTrainingDateKey(state.trainingMonthCursor, sessions);
    }

    renderTrainingReview();
    renderTrainingCalendar();
    await loadTrainingEntries(state.trainingSelectedDateKey);
  }

  async function loadTrainingReview({ reportErrors = false } = {}) {
    const currentBoard = getCurrentBoard();
    const currentUser = getCurrentUser();

    if (!canUseTrainingLog()) {
      renderTrainingReview();
      return [];
    }

    const cachedEntriesByDate = getCachedTrainingHistoryForCurrentBoard();
    if (cachedEntriesByDate) {
      renderTrainingReview();
      return cachedEntriesByDate;
    }

    const boardId = currentBoard.id;
    const userId = currentUser.uid;

    if (isActiveTrainingReviewLoad(boardId, userId)) {
      try {
        return await trainingReviewLoad.promise;
      } catch (error) {
        if (reportErrors) {
          showTrainingReviewLoadError(error);
        }
        throw error;
      }
    }

    setTrainingReviewCache({
      boardId,
      userId,
      status: 'loading',
    });
    renderTrainingReview();

    const requestPromise = (async () => {
      try {
        const entriesByDate = await fetchTrainingHistoryForBoard(userId, boardId);
        if (getCurrentBoard()?.id !== boardId || getCurrentUser()?.uid !== userId) {
          return null;
        }

        setTrainingReviewCache({
          boardId,
          userId,
          status: 'ready',
          entriesByDate,
        });
        renderTrainingReview();
        return entriesByDate;
      } catch (error) {
        if (getCurrentBoard()?.id === boardId && getCurrentUser()?.uid === userId) {
          setTrainingReviewCache({
            boardId,
            userId,
            status: 'error',
            errorMessage: error.message,
          });
          renderTrainingReview();
        }
        throw error;
      } finally {
        if (isActiveTrainingReviewLoad(boardId, userId)) {
          trainingReviewLoad = null;
        }
      }
    })();

    trainingReviewLoad = {
      boardId,
      userId,
      promise: requestPromise,
    };

    try {
      return await requestPromise;
    } catch (error) {
      if (reportErrors) {
        showTrainingReviewLoadError(error);
      }
      throw error;
    }
  }

  function openQuickLogSheet() {
    if (!canUseTrainingLog()) {
      showToast('Training logs are only available on saved boards while signed in.', 'warning');
      return;
    }

    if (!getSelectedProblem()) {
      showToast('Choose a problem before logging an attempt.', 'warning');
      return;
    }

    state.quickLogCompleted = true;
    DOM.quickLogNote.value = '';
    renderQuickLogSheet();
    openSheet(DOM.quickLogSheet);
  }

  async function handleSaveQuickLog() {
    const selectedProblem = getSelectedProblem();
    const currentBoard = getCurrentBoard();
    const currentUser = getCurrentUser();
    if (!selectedProblem || !canUseTrainingLog()) return;

    setButtonBusy(DOM.saveQuickLogBtn, true, 'Saving…');
    try {
      const todayKey = getTodayDateKey();
      await addTrainingEntry(
        currentUser.uid,
        currentBoard.id,
        currentBoard.name,
        todayKey,
        {
          problemId: selectedProblem.id,
          problemName: selectedProblem.name || 'Untitled problem',
          problemGrade: selectedProblem.grade || 'Ungraded',
          completed: state.quickLogCompleted,
          note: DOM.quickLogNote.value.trim(),
        }
      );

      state.trainingSelectedDateKey = todayKey;
      state.trainingReviewCache = createEmptyTrainingReviewCache();
      closeSheet(DOM.quickLogSheet);
      showToast(state.quickLogCompleted ? 'Logged as completed.' : 'Logged as not completed.', 'success');
    } catch (error) {
      showToast(`Could not save the log entry: ${error.message}`, 'error');
    } finally {
      setButtonBusy(DOM.saveQuickLogBtn, false);
    }
  }

  async function openTrainingLogSheet() {
    if (!canUseTrainingLog()) {
      showToast('Open a saved board while signed in to use the training log.', 'warning');
      return;
    }

    state.trainingLogTab = 'calendar';
    openSheet(DOM.trainingLogSheet);
    renderTrainingLogPanels();
    renderTrainingReview();
    loadTrainingReview().catch(() => {});

    try {
      await loadTrainingLogMonth();
    } catch (error) {
      showToast(`Could not load the training log: ${error.message}`, 'error');
    }
  }

  function bindEvents() {
    DOM.openQuickLogBtn.addEventListener('click', openQuickLogSheet);
    DOM.closeQuickLogSheetBtn.addEventListener('click', () => closeSheet(DOM.quickLogSheet));
    DOM.cancelQuickLogBtn.addEventListener('click', () => closeSheet(DOM.quickLogSheet));
    DOM.closeTrainingLogSheetBtn.addEventListener('click', () => closeSheet(DOM.trainingLogSheet));
    DOM.openTrainingLogMenuBtn.addEventListener('click', openTrainingLogSheet);
    DOM.trainingCalendarTabBtn.addEventListener('click', () => {
      state.trainingLogTab = 'calendar';
      renderTrainingLogPanels();
    });
    DOM.trainingReviewTabBtn.addEventListener('click', () => {
      state.trainingLogTab = 'review';
      renderTrainingLogPanels();
      renderTrainingReview();
      loadTrainingReview({ reportErrors: true }).catch(() => {});
    });
    DOM.quickLogCompleteBtn.addEventListener('click', () => {
      state.quickLogCompleted = true;
      renderQuickLogSheet();
    });
    DOM.quickLogFailBtn.addEventListener('click', () => {
      state.quickLogCompleted = false;
      renderQuickLogSheet();
    });
    DOM.saveQuickLogBtn.addEventListener('click', handleSaveQuickLog);
    DOM.trainingPrevMonthBtn.addEventListener('click', async () => {
      state.trainingMonthCursor = shiftMonth(state.trainingMonthCursor, -1);
      state.trainingSelectedDateKey = '';
      try {
        await loadTrainingLogMonth();
      } catch (error) {
        showToast(`Could not load the previous month: ${error.message}`, 'error');
      }
    });
    DOM.trainingNextMonthBtn.addEventListener('click', async () => {
      state.trainingMonthCursor = shiftMonth(state.trainingMonthCursor, 1);
      state.trainingSelectedDateKey = '';
      try {
        await loadTrainingLogMonth();
      } catch (error) {
        showToast(`Could not load the next month: ${error.message}`, 'error');
      }
    });
    DOM.exportTrainingCsvBtn.addEventListener('click', () => exportTrainingLog('csv'));
    DOM.exportTrainingJsonBtn.addEventListener('click', () => exportTrainingLog('json'));
  }

  return {
    bindEvents,
    loadTrainingReview,
    renderQuickLogSheet,
    renderTrainingLogPanels,
    renderTrainingReview,
    resetTrainingLogState,
  };
}
