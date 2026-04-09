import { db } from './firebaseConfig.mjs';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

export function problemsCol(boardId) {
  return collection(db, `boards/${boardId}/problems`);
}

export function trainingSessionsCol(userId, boardId) {
  return collection(db, `users/${userId}/trainingLogs/${boardId}/sessions`);
}

export function trainingEntriesCol(userId, boardId, dateKey) {
  return collection(db, `users/${userId}/trainingLogs/${boardId}/sessions/${dateKey}/entries`);
}

export function createBoard({ name, imageUrl, ownerUid }) {
  return addDoc(collection(db, 'boards'), {
    name,
    imageUrl,
    ownerUid,
    timestamp: serverTimestamp(),
  });
}

export async function getBoard(boardId) {
  const boardRef = doc(db, 'boards', boardId);
  const boardSnap = await getDoc(boardRef);
  if (!boardSnap.exists()) return null;
  return boardSnap;
}

export async function getProblemsByBoardId(boardId) {
  const problemsQuery = query(problemsCol(boardId), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(problemsQuery);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export function addProblem(boardId, problem) {
  return addDoc(problemsCol(boardId), {
    ...problem,
    createdAt: serverTimestamp(),
  });
}

export function updateProblem(boardId, problemId, updates) {
  const problemRef = doc(db, `boards/${boardId}/problems/${problemId}`);
  return updateDoc(problemRef, updates);
}

export function deleteProblem(boardId, problemId) {
  const problemRef = doc(db, `boards/${boardId}/problems/${problemId}`);
  return deleteDoc(problemRef);
}

export function addAccessCode(boardId, code, level, boardName, ownerUid) {
  const accessCodeRef = doc(db, 'accessCodes', code);
  return setDoc(accessCodeRef, {
    boardId,
    boardName,
    level,
    ownerUid,
    createdAt: serverTimestamp(),
  });
}

export async function getAccessCode(code) {
  const accessCodeRef = doc(db, 'accessCodes', code);
  const codeSnap = await getDoc(accessCodeRef);
  if (!codeSnap.exists()) return null;
  return codeSnap;
}

export async function shareBoardWithUser(boardId, boardName, userUid, userEmail, level, guestCode = null) {
  const batch = writeBatch(db);

  const permissionData = { email: userEmail, level };
  if (guestCode) {
    permissionData.guestCode = guestCode;
  }

  const permissionRef = doc(db, `boards/${boardId}/permissions/${userUid}`);
  batch.set(permissionRef, permissionData);

  const sharedBoardData = {
    boardId,
    boardName,
    level,
    sharedAt: serverTimestamp(),
  };
  if (guestCode) {
    sharedBoardData.guestCode = guestCode;
  }

  const sharedBoardRef = doc(db, `users/${userUid}/sharedBoards/${boardId}`);
  batch.set(sharedBoardRef, sharedBoardData);

  return batch.commit();
}

export function listenForSharedUsers(boardId, callback, errorCallback) {
  const permissionsCollection = collection(db, `boards/${boardId}/permissions`);
  return onSnapshot(permissionsCollection, callback, errorCallback);
}

export async function revokeAccess(boardId, userUid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, `boards/${boardId}/permissions/${userUid}`));
  batch.delete(doc(db, `users/${userUid}/sharedBoards/${boardId}`));
  return batch.commit();
}

export function listenForOwnedBoards(userId, callback, errorCallback) {
  const ownedBoardsQuery = query(
    collection(db, 'boards'),
    where('ownerUid', '==', userId),
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(ownedBoardsQuery, callback, errorCallback);
}

export function listenForSharedBoards(userId, callback, errorCallback) {
  const sharedBoardsQuery = query(
    collection(db, `users/${userId}/sharedBoards`),
    orderBy('sharedAt', 'desc')
  );

  return onSnapshot(
    sharedBoardsQuery,
    (snapshot) => {
      const sharedBoardDocs = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        source: 'sharedBoard',
        ...docSnap.data(),
      }));
      callback(sharedBoardDocs);
    },
    errorCallback
  );
}

export async function getUserPermissionForBoard(boardId, userId) {
  if (!userId) return null;
  const permissionRef = doc(db, `boards/${boardId}/permissions/${userId}`);
  const permissionSnap = await getDoc(permissionRef);
  return permissionSnap.exists() ? permissionSnap.data().level : null;
}

export async function getTrainingSessionsForMonth(userId, boardId, startKey, endKey) {
  const sessionsQuery = query(
    trainingSessionsCol(userId, boardId),
    where('dateKey', '>=', startKey),
    where('dateKey', '<=', endKey),
    orderBy('dateKey', 'asc')
  );

  const snapshot = await getDocs(sessionsQuery);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getTrainingSessionsForBoard(userId, boardId) {
  const sessionsQuery = query(
    trainingSessionsCol(userId, boardId),
    orderBy('dateKey', 'asc')
  );

  const snapshot = await getDocs(sessionsQuery);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getTrainingEntriesForDate(userId, boardId, dateKey) {
  const entriesQuery = query(
    trainingEntriesCol(userId, boardId, dateKey),
    orderBy('loggedAt', 'desc')
  );

  const snapshot = await getDocs(entriesQuery);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export function addTrainingEntry(userId, boardId, boardName, dateKey, entry) {
  const trainingLogRef = doc(db, `users/${userId}/trainingLogs/${boardId}`);
  const sessionRef = doc(db, `users/${userId}/trainingLogs/${boardId}/sessions/${dateKey}`);
  const entryRef = doc(trainingEntriesCol(userId, boardId, dateKey));
  const batch = writeBatch(db);

  batch.set(trainingLogRef, {
    boardId,
    boardName,
    lastLoggedAt: serverTimestamp(),
  }, { merge: true });

  batch.set(sessionRef, {
    boardId,
    boardName,
    dateKey,
    entryCount: increment(1),
    completedCount: increment(entry.completed ? 1 : 0),
    notCompletedCount: increment(entry.completed ? 0 : 1),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  batch.set(entryRef, {
    ...entry,
    note: entry.note || '',
    loggedAt: serverTimestamp(),
  });

  return batch.commit();
}
