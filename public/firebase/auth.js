// /public/firebase/auth.js

import { auth } from './firebaseConfig.mjs';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

function initAuth({
  loginBtn,
  signOutBtn,
  authPanel,
  emailInput,
  passwordInput,
  newProblemBtn,
  editProblemBtn,
  problemSelect
}) {
  function updateAuthUI(user) {
    const loggedIn = !!user && !user.isAnonymous;
    newProblemBtn.classList.toggle('hidden', !loggedIn);
    editProblemBtn.classList.toggle('hidden', !(loggedIn && !!problemSelect.value));

    if (!loggedIn) {
      authPanel.querySelector('h3')?.remove();
      loginBtn.classList.remove('hidden');
      signOutBtn.classList.add('hidden');
    } else {
      loginBtn.classList.add('hidden');
      signOutBtn.classList.remove('hidden');
      authPanel.querySelector('h3')?.remove();
      const h = document.createElement('h3');
      h.textContent = `Signed in: ${user.email}`;
      authPanel.prepend(h);
    }
  }

  onAuthStateChanged(auth, u => updateAuthUI(u));

  loginBtn.onclick = async () => {
    const email = emailInput.value.trim();
    const pass  = passwordInput.value;
    if (!email || !pass) return alert('Enter email & password.');
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        await createUserWithEmailAndPassword(auth, email, pass);
      } else {
        alert(`❌ ${e.message}`);
      }
    }
  };

  signOutBtn.onclick = () => signOut(auth);
}

export { initAuth };