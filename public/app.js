// public/app.js

// 1️⃣ Firebase SDK imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

// 2️⃣ Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAA-PKUvVk4DnCMlYbMPNR6Zd3lBtbrBGE",
  authDomain: "wallywall-18303.firebaseapp.com",
  projectId: "wallywall-18303",
  storageBucket: "wallywall-18303.firebasestorage.app",
  messagingSenderId: "699677979638",
  appId: "1:699677979638:web:ecec0b42369c55fffdcdd7"
};

// 3️⃣ Initialize Firebase
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// 4️⃣ Cache DOM nodes
const emailEl          = document.getElementById('email');
const passEl           = document.getElementById('password');
const signupBtn        = document.getElementById('signup');
const loginBtn         = document.getElementById('login');
const statusEl         = document.getElementById('status');
const fileInput        = document.getElementById('file');
const fileStatusEl     = document.getElementById('fileStatus');
const boardsListEl     = document.getElementById('boardsList');
const currentBoardImg  = document.getElementById('currentBoard');

// disable file‐picker until signed in
fileInput.disabled = true;

// 5️⃣ Auth handlers
signupBtn.addEventListener('click', async () => {
  try {
    await createUserWithEmailAndPassword(auth, emailEl.value, passEl.value);
  } catch (e) {
    statusEl.textContent = e.message;
  }
});
loginBtn.addEventListener('click', async () => {
  try {
    await signInWithEmailAndPassword(auth, emailEl.value, passEl.value);
  } catch (e) {
    statusEl.textContent = e.message;
  }
});

// 6️⃣ React to auth state
let unsubscribeBoards = null;
onAuthStateChanged(auth, user => {
  if (user) {
    statusEl.textContent = `Logged in as ${user.email}`;
    fileInput.disabled   = false;
    startBoardsListener();
  } else {
    statusEl.textContent     = 'Please sign up or log in';
    fileInput.disabled       = true;
    fileStatusEl.textContent = '';
    boardsListEl.innerHTML   = '';
    currentBoardImg.src      = '';
    if (unsubscribeBoards) unsubscribeBoards();
  }
});

// 7️⃣ Upload board image → Firestore “boards” collection
fileInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  // put in layouts/ folder
  const sbRef = storageRef(storage, `layouts/${file.name}`);
  try {
    await uploadBytes(sbRef, file);
    const url = await getDownloadURL(sbRef);

    fileStatusEl.textContent = 'Uploaded! Saving board…';
    await addDoc(collection(db, 'boards'), {
      imageUrl:  url,
      timestamp: serverTimestamp(),
      owner:     auth.currentUser.uid
    });
    fileStatusEl.textContent = 'Board saved!';
  } catch (err) {
    fileStatusEl.textContent = `Upload error: ${err.message}`;
  }
});

// 8️⃣ Real-time listener for “boards”
function startBoardsListener() {
  if (unsubscribeBoards) unsubscribeBoards();

  const boardsQuery = query(
    collection(db, 'boards'),
    orderBy('timestamp')
  );

  unsubscribeBoards = onSnapshot(
    boardsQuery,
    snap => {
      boardsListEl.innerHTML = '';
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const li = document.createElement('li');
        li.textContent = docSnap.id;
        li.addEventListener('click', () => {
          currentBoardImg.src = data.imageUrl;
          currentBoardImg.alt = 'Selected board';
        });
        boardsListEl.appendChild(li);
      });
    },
    err => {
      console.error('Boards listener error:', err);
      statusEl.textContent = 'Could not load boards.';
    }
  );
}