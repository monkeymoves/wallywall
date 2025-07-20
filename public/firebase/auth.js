import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { auth } from './firebaseConfig.mjs';

/**
 * Initializes the authentication UI and logic.
 * @param {object} elements - The DOM elements for auth.
 * @param {HTMLButtonElement} elements.loginBtn
 * @param {HTMLButtonElement} elements.signOutBtn
 * @param {HTMLInputElement} elements.emailInput
 * @param {HTMLInputElement} elements.passwordInput
 */
export function initAuth({ loginBtn, signOutBtn, emailInput, passwordInput }) {
  loginBtn.onclick = async () => {
    const email = emailInput.value;
    const password = passwordInput.value;

    try {
      // First, try to sign in.
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      // If sign-in fails because the user doesn't exist, try to sign them up.
      if (error.code === 'auth/invalid-login-credentials' || error.code === 'auth/user-not-found') {
        await createUserWithEmailAndPassword(auth, email, password).catch(signupError => {
          alert(`❌ Sign up failed: ${signupError.message}`);
        });
      } else {
        alert(`❌ Login failed: ${error.message}`);
      }
    }
  };

  signOutBtn.onclick = () => signOut(auth);
}