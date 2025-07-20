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
  getDoc,
  doc,
  serverTimestamp,
  setDoc,
  where,
  limit,
  onSnapshot,
  writeBatch
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

// --- User and Permissions ---

/**
 * Creates a public record for a user, mapping their UID to their email.
 * This is used to allow other users to share boards with them by email.
 * @param {string} uid The user's UID.
 * @param {string} email The user's email.
 */
export function createUserRecord(uid, email) {
  const userRef = doc(db, 'users', uid);
  return setDoc(userRef, { email });
}

/**
 * Grants a user edit access to a board.
 * @param {string} boardId The ID of the board.
 * @param {string} userUid The UID of the user to grant access to.
 * @param {string} userEmail The email of the user (for display).
 */
export async function shareBoardWithUser(boardId, boardName, userUid, userEmail, level, guestCode = null) {
  const batch = writeBatch(db);

  // Data for the board's permissions subcollection
  const permData = { email: userEmail, level };
  if (guestCode) {
    permData.guestCode = guestCode; // Pass guest code for rule validation
  }
  const permRef = doc(db, `boards/${boardId}/permissions/${userUid}`);
  batch.set(permRef, permData);

  // Data for the user's sharedBoards subcollection
  const sharedBoardData = { boardId, sharedAt: serverTimestamp() };
  if (boardName) {
    sharedBoardData.boardName = boardName;
  }
  if (guestCode) {
    sharedBoardData.guestCode = guestCode; // Pass guest code for rule validation
  }
  const userSharedBoardRef = doc(db, `users/${userUid}/sharedBoards/${boardId}`);
  batch.set(userSharedBoardRef, sharedBoardData);

  return batch.commit();
}

export function listenForSharedUsers(boardId, callback) {
  const permsCol = collection(db, `boards/${boardId}/permissions`);
  return onSnapshot(permsCol, callback);
}
export async function revokeAccess(boardId, userUid) {
  const batch = writeBatch(db);

  // Revoke from board's permissions
  const permRef = doc(db, `boards/${boardId}/permissions/${userUid}`);
  batch.delete(permRef);

  // Revoke from user's shared list
  const userSharedBoardRef = doc(db, `users/${userUid}/sharedBoards/${boardId}`);
  batch.delete(userSharedBoardRef);

  return batch.commit();
}

export function listenForOwnedBoards(userId, callback) {
    const q = query(collection(db, 'boards'), where('ownerUid', '==', userId), orderBy('timestamp', 'desc'));
    return onSnapshot(q, callback);
}

export function listenForSharedBoards(userId, callback) {
    const sharedBoardsCol = collection(db, `users/${userId}/sharedBoards`);
    // Note: We can't order by a server timestamp on the board itself here,
    // so we order by when it was shared with the user.
    const q = query(sharedBoardsCol, orderBy('sharedAt', 'desc'));
    return onSnapshot(q, callback);
}

/**
 * Gets the permission level for a given user on a specific board.
 * @param {string} boardId The ID of the board.
 * @param {string} userId The UID of the user.
 * @returns {Promise<'read'|'edit'|null>} The permission level or null.
 */
export async function getUserPermissionForBoard(boardId, userId) {
    if (!userId) return null;
    const permRef = doc(db, `boards/${boardId}/permissions/${userId}`);
    const docSnap = await getDoc(permRef);
    return docSnap.exists() ? docSnap.data().level : null;
}