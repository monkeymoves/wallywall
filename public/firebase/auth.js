import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { auth } from './firebaseConfig.mjs';

function normalizeCredentials(email, password) {
  return {
    email: email.trim(),
    password: password.trim(),
  };
}

export async function signInWithEmail(email, password) {
  const normalized = normalizeCredentials(email, password);
  return signInWithEmailAndPassword(auth, normalized.email, normalized.password);
}

export async function createAccount(email, password) {
  const normalized = normalizeCredentials(email, password);
  return createUserWithEmailAndPassword(auth, normalized.email, normalized.password);
}

export function signOutUser() {
  return signOut(auth);
}
