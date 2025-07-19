// /public/firebase/auth.js

import { auth } from './firebaseConfig.mjs';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

function initAuth({ loginBtn, signOutBtn, emailInput, passwordInput }) {

  loginBtn.onclick = async () => {
    const email = emailInput.value.trim();
    const pass  = passwordInput.value;
    if (!email || !pass) return alert('Enter email & password.');
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      switch (e.code) {
        case 'auth/user-not-found':
          // If user not found, try to create a new account
          try {
            await createUserWithEmailAndPassword(auth, email, pass);
          } catch (creationError) {
            alert(`❌ Account creation failed: ${creationError.message}`);
          }
          break;
        case 'auth/invalid-email':
          alert('❌ Please enter a valid email address (e.g., user@example.com).');
          break;
        default:
          alert(`❌ Login failed: ${e.message}`);
      }
    }
  };

  signOutBtn.onclick = () => signOut(auth);
}

export { initAuth };