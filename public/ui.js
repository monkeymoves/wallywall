// public/ui.js

// Helper to get an element by its ID
export const by = id => document.getElementById(id);

// Centralized DOM references
export const DOM = {
  menuBtn: by('menuBtn'),
  boardsPanel: by('boardsPanel'),
  fileInput: by('file'),
  fileStatus: by('fileStatus'),
  boardsList: by('boardsList'),
  authPanel: by('authPanel'),
  emailInput: by('emailInput'),
  authDescription: by('auth-description'),
  passwordInput: by('passwordInput'),
  loginBtn: by('loginBtn'),
  signOutBtn: by('signOutBtn'),
  uploadControls: by('upload-controls'),
  boardOwnerControls: by('board-owner-controls'),
  generateReadCodeBtn: by('generate-read-code'),
  generateEditCodeBtn: by('generate-edit-code'),
  userAccessControls: by('user-access-controls'), // The container div
  sharedUsersList: by('shared-users-list'),
  hdrTitle: document.querySelector('.hdr-title'),
  boardMain: by('boardMain'),
  welcomeMessage: by('welcomeMessage'),
  boardContainer: document.querySelector('.board-container'),
  currentBoard: by('currentBoard'),
  canvas: by('overlayCanvas'),
  problemSelect: by('problemSelect'),
  problemInfoCard: by('problemInfoCard'),
  problemGradeDisplay: by('problemGradeDisplay'),
  problemDescriptionText: by('problemDescriptionText'),
  newProblemBtn: by('newProblemBtn'),
  editProblemBtn: by('editProblemBtn'),
  deleteProblemBtn: by('deleteProblemBtn'),
  drawControls: by('drawControls'),
  finishDrawBtn: by('finishDrawBtn'),
  cancelDrawBtn: by('cancelDrawBtn'),
  problemSheet: by('problemSheet'),
  cancelSheetBtn: by('cancelSheetBtn'),
  saveProblemBtn: by('saveProblemBtn'),
  problemName: by('problemName'),
  problemDesc: by('problemDesc'),
  problemGrade: by('problemGrade'),
  holdBtns: Array.from(document.querySelectorAll('.hold-btn')),
  guestCodeBtn: by('enter-guest-code')
};