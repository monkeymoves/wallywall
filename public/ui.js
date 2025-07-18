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
  passwordInput: by('passwordInput'),
  loginBtn: by('loginBtn'),
  signOutBtn: by('signOutBtn'),
  hdrTitle: document.querySelector('.hdr-title'),
  boardMain: by('boardMain'),
  currentBoard: by('currentBoard'),
  canvas: by('overlayCanvas'),
  problemSelect: by('problemSelect'),
  newProblemBtn: by('newProblemBtn'),
  editProblemBtn: by('editProblemBtn'),
  drawControls: by('drawControls'),
  finishDrawBtn: by('finishDrawBtn'),
  cancelDrawBtn: by('cancelDrawBtn'),
  problemSheet: by('problemSheet'),
  cancelSheetBtn: by('cancelSheetBtn'),
  saveProblemBtn: by('saveProblemBtn'),
  problemName: by('problemName'),
  problemDesc: by('problemDesc'),
  holdBtns: Array.from(document.querySelectorAll('.hold-btn'))
};