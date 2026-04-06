const by = (id) => document.getElementById(id);

export const DOM = {
  openBoardsBtn: by('openBoardsBtn'),
  openAccessBtn: by('openAccessBtn'),
  openAccountBtn: by('openAccountBtn'),
  currentBoardName: by('currentBoardName'),
  permissionPill: by('permissionPill'),
  welcomeMessage: by('welcomeMessage'),
  welcomeJoinBtn: by('welcomeJoinBtn'),
  welcomeBoardsBtn: by('welcomeBoardsBtn'),
  boardStatus: by('boardStatus'),
  boardScene: by('boardScene'),
  boardFrame: document.querySelector('.board-frame'),
  currentBoard: by('currentBoard'),
  canvas: by('overlayCanvas'),
  problemEmptyState: by('problemEmptyState'),
  problemInfoCard: by('problemInfoCard'),
  problemGradeDisplay: by('problemGradeDisplay'),
  problemInfoName: by('problemInfoName'),
  problemDescriptionText: by('problemDescriptionText'),
  browseControls: by('browseControls'),
  editControls: by('editControls'),
  problemSearchInput: by('problemSearchInput'),
  problemSearchSummary: by('problemSearchSummary'),
  problemResultsList: by('problemResultsList'),
  problemSelect: by('problemSelect'),
  newProblemBtn: by('newProblemBtn'),
  editProblemBtn: by('editProblemBtn'),
  deleteProblemBtn: by('deleteProblemBtn'),
  drawControls: by('drawControls'),
  holdBtns: Array.from(document.querySelectorAll('.hold-btn')),
  finishDrawBtn: by('finishDrawBtn'),
  cancelDrawBtn: by('cancelDrawBtn'),
  sheetBackdrop: by('sheetBackdrop'),
  boardsSheet: by('boardsSheet'),
  closeBoardsSheetBtn: by('closeBoardsSheetBtn'),
  boardsListMessage: by('boardsListMessage'),
  createBoardShortcutBtn: by('createBoardShortcutBtn'),
  joinBoardShortcutBtn: by('joinBoardShortcutBtn'),
  futureSessionsBtn: by('futureSessionsBtn'),
  ownedBoardsSection: by('ownedBoardsSection'),
  ownedBoardsList: by('ownedBoardsList'),
  sharedBoardsSection: by('sharedBoardsSection'),
  sharedBoardsList: by('sharedBoardsList'),
  accessSheet: by('accessSheet'),
  closeAccessSheetBtn: by('closeAccessSheetBtn'),
  accessSheetTitle: by('accessSheetTitle'),
  accessSheetDescription: by('accessSheetDescription'),
  ownerAccessSection: by('ownerAccessSection'),
  memberAccessSection: by('memberAccessSection'),
  memberAccessText: by('memberAccessText'),
  generateReadCodeBtn: by('generateReadCodeBtn'),
  generateEditCodeBtn: by('generateEditCodeBtn'),
  generatedCodePanel: by('generatedCodePanel'),
  generatedCodeValue: by('generatedCodeValue'),
  generatedCodeMeta: by('generatedCodeMeta'),
  copyGeneratedCodeBtn: by('copyGeneratedCodeBtn'),
  sharedUsersList: by('sharedUsersList'),
  sharedUsersEmpty: by('sharedUsersEmpty'),
  accountSheet: by('accountSheet'),
  closeAccountSheetBtn: by('closeAccountSheetBtn'),
  accountStatus: by('accountStatus'),
  signedOutAccountView: by('signedOutAccountView'),
  signedInAccountView: by('signedInAccountView'),
  emailInput: by('emailInput'),
  passwordInput: by('passwordInput'),
  signInBtn: by('signInBtn'),
  createAccountBtn: by('createAccountBtn'),
  signOutBtn: by('signOutBtn'),
  signedInEmail: by('signedInEmail'),
  accountHint: by('accountHint'),
  createBoardSheet: by('createBoardSheet'),
  closeCreateBoardSheetBtn: by('closeCreateBoardSheetBtn'),
  createBoardForm: by('createBoardForm'),
  boardNameInput: by('boardNameInput'),
  boardImageInput: by('boardImageInput'),
  boardImageLabel: by('boardImageLabel'),
  createBoardStatus: by('createBoardStatus'),
  createBoardSubmitBtn: by('createBoardSubmitBtn'),
  joinCodeSheet: by('joinCodeSheet'),
  closeJoinCodeSheetBtn: by('closeJoinCodeSheetBtn'),
  joinCodeForm: by('joinCodeForm'),
  joinCodeInput: by('joinCodeInput'),
  joinCodeStatus: by('joinCodeStatus'),
  joinCodeSubmitBtn: by('joinCodeSubmitBtn'),
  problemSheet: by('problemSheet'),
  problemSheetTitle: by('problemSheetTitle'),
  closeProblemSheetBtn: by('closeProblemSheetBtn'),
  problemName: by('problemName'),
  problemDesc: by('problemDesc'),
  problemGrade: by('problemGrade'),
  cancelSheetBtn: by('cancelSheetBtn'),
  saveProblemBtn: by('saveProblemBtn'),
  confirmDialog: by('confirmDialog'),
  confirmDialogTitle: by('confirmDialogTitle'),
  confirmDialogBody: by('confirmDialogBody'),
  confirmDialogCancelBtn: by('confirmDialogCancelBtn'),
  confirmDialogConfirmBtn: by('confirmDialogConfirmBtn'),
  toastStack: by('toastStack'),
};

const sheets = [
  DOM.boardsSheet,
  DOM.accessSheet,
  DOM.accountSheet,
  DOM.createBoardSheet,
  DOM.joinCodeSheet,
  DOM.problemSheet,
].filter(Boolean);

let activeSheet = null;
let confirmResolver = null;

function toggleBackdrop() {
  const shouldShow = Boolean(activeSheet) || !DOM.confirmDialog.classList.contains('hidden');
  DOM.sheetBackdrop.classList.toggle('hidden', !shouldShow);
}

export function openSheet(sheet) {
  if (!sheet) return;
  if (activeSheet && activeSheet !== sheet) {
    activeSheet.classList.add('hidden');
  }
  activeSheet = sheet;
  sheet.classList.remove('hidden');
  toggleBackdrop();
}

export function closeSheet(sheet) {
  if (!sheet) return;
  sheet.classList.add('hidden');
  if (activeSheet === sheet) {
    activeSheet = null;
  }
  toggleBackdrop();
}

export function closeAllSheets() {
  sheets.forEach((sheet) => sheet.classList.add('hidden'));
  activeSheet = null;
  toggleBackdrop();
}

export function isSheetOpen(sheet) {
  return activeSheet === sheet && !sheet.classList.contains('hidden');
}

export function showToast(message, tone = 'info', timeoutMs = 3200) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${tone}`;
  toast.textContent = message;
  DOM.toastStack.append(toast);

  window.setTimeout(() => {
    toast.remove();
  }, timeoutMs);
}

export function setInlineStatus(element, message = '', tone = 'info') {
  if (!element) return;
  element.textContent = message;
  element.className = 'section-caption';
  if (message) {
    element.classList.add(`status-${tone}`);
  }
}

export function showBoardStatus(message = '', tone = 'info') {
  DOM.boardStatus.textContent = message;
  DOM.boardStatus.className = 'status-banner';
  if (!message) {
    DOM.boardStatus.classList.add('hidden');
    return;
  }
  DOM.boardStatus.classList.add(`status-${tone}`);
}

export function showConfirm({
  title,
  body,
  confirmLabel = 'Confirm',
  confirmTone = 'danger',
}) {
  DOM.confirmDialogTitle.textContent = title;
  DOM.confirmDialogBody.textContent = body;
  DOM.confirmDialogConfirmBtn.textContent = confirmLabel;
  DOM.confirmDialogConfirmBtn.className = `btn ${confirmTone === 'danger' ? 'danger' : 'primary'}`;
  DOM.confirmDialog.classList.remove('hidden');
  toggleBackdrop();

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

export function hideConfirm(result = false) {
  DOM.confirmDialog.classList.add('hidden');
  toggleBackdrop();
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
}

DOM.sheetBackdrop.addEventListener('click', () => {
  closeAllSheets();
  hideConfirm(false);
});
DOM.confirmDialogCancelBtn.addEventListener('click', () => hideConfirm(false));
DOM.confirmDialogConfirmBtn.addEventListener('click', () => hideConfirm(true));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!DOM.confirmDialog.classList.contains('hidden')) {
    hideConfirm(false);
    return;
  }
  closeAllSheets();
});

export function setButtonBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    return;
  }
  button.disabled = false;
  if (button.dataset.label) {
    button.textContent = button.dataset.label;
    delete button.dataset.label;
  }
}

export function setPill(pill, text, className) {
  if (!pill) return;
  pill.textContent = text;
  pill.className = 'pill';
  if (className) {
    pill.classList.add(className);
  }
}
