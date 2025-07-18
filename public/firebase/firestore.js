// public/firestore.js
import { db } from './firebaseConfig.mjs';
import { collection, addDoc, getDocs, onSnapshot, updateDoc, deleteDoc, doc, query, where } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const problemsCollection = collection(db, 'problems');

export async function saveProblem(problem) {
  const docRef = await addDoc(problemsCollection, problem);
  return docRef.id;
}

export async function getProblems() {
  const snapshot = await getDocs(problemsCollection);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export function subscribeToProblems(callback) {
  return onSnapshot(problemsCollection, snapshot => {
    const problems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(problems);
  });
}

export async function updateProblem(id, updatedFields) {
  const docRef = doc(db, 'problems', id);
  await updateDoc(docRef, updatedFields);
}

export async function deleteProblem(id) {
  const docRef = doc(db, 'problems', id);
  await deleteDoc(docRef);
}


export async function getProblemsByBoardId(boardId) {
  const q = query(problemsCollection, where('boardId', '==', boardId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}