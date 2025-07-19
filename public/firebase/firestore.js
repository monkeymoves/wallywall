// public/firebase/firestore.js

import { db } from './firebaseConfig.mjs';
import {
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// --- Helpers for nested collections ---
/**
 * Get the 'problems' sub-collection for a specific board
 * @param {string} boardId
 */
export function problemsCol(boardId) {
  return collection(db, `boards/${boardId}/problems`);
}

// --- Problem CRUD operations ---
/**
 * Fetch all problems for a given board, ordered by creation date
 * @param {string} boardId
 */
export async function getProblemsByBoardId(boardId) {
  const q = query(
    problemsCol(boardId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Add a new problem under the specified board
 * @param {string} boardId
 * @param {object} problem  Fields: title, color, holds, status
 */
export function addProblem(boardId, problem) {
  return addDoc(problemsCol(boardId), {
    ...problem,
    createdAt: serverTimestamp(),
  });
}

/**
 * Update an existing problem
 * @param {string} boardId
 * @param {string} problemId
 * @param {object} updates  Fields to update
 */
export function updateProblem(boardId, problemId, updates) {
  const ref = doc(db, `boards/${boardId}/problems/${problemId}`);
  return updateDoc(ref, updates);
}

/**
 * Delete a problem
 * @param {string} boardId
 * @param {string} problemId
 */
export function deleteProblem(boardId, problemId) {
  const ref = doc(db, `boards/${boardId}/problems/${problemId}`);
  return deleteDoc(ref);
}

/**
 * Creates a new access code for a board.
 * @param {string} boardId
 * @param {string} code The generated code.
 * @param {'read'|'edit'} level The access level for the code.
 */
export function addAccessCode(boardId, code, level) {
  const accessCodeRef = doc(db, 'accessCodes', code);
  return setDoc(accessCodeRef, { boardId, level });
}