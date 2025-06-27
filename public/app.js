// public/app.js

// 1️⃣ Firebase SDK imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
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
  getDocs,
  getDoc,
  where
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

// 2️⃣ Your config
const firebaseConfig = {
  apiKey: "AIzaSyAA-PKUvVk4DnCMlYbMPNR6Zd3lBtbrBGE",
  authDomain: "wallywall-18303.firebaseapp.com",
  projectId: "wallywall-18303",
  storageBucket: "wallywall-18303.firebasestorage.app",
  messagingSenderId: "699677979638",
  appId: "1:699677979638:web:ecec0b42369c55fffdcdd7",
  measurementId: "G-5KRL7X1N81"
};

// 3️⃣ Initialize SDKs
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// 4️⃣ Cache DOM nodes
const emailEl         = document.getElementById('email');
const passEl          = document.getElementById('password');
const signupBtn       = document.getElementById('signup');
const loginBtn        = document.getElementById('login');
const statusEl        = document.getElementById('status');

const fileInput       = document.getElementById('file');
const fileStatusEl    = document.getElementById('fileStatus');
const boardsListEl    = document.getElementById('boardsList');

const currentBoardImg = document.getElementById('currentBoard');
const overlayCanvas   = document.getElementById('overlayCanvas');
const problemControls = document.getElementById('problemControls');
const problemSelect   = document.getElementById('problemSelect');
const newProblemBtn   = document.getElementById('newProblemBtn');
const holdTypeEl      = document.getElementById('holdType');
const nameEl          = document.getElementById('problemName');
const descEl          = document.getElementById('problemDesc');
const saveBtn         = document.getElementById('saveProblemBtn');
const problemStatusEl = document.getElementById('problemStatus');

// disable file-picker until signed in
fileInput.disabled = true;

// 5️⃣ Auth handlers
signupBtn.onclick = async () => {
  try {
    await createUserWithEmailAndPassword(auth, emailEl.value, passEl.value);
  } catch (e) {
    statusEl.textContent = e.message;
  }
};
loginBtn.onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, emailEl.value, passEl.value);
  } catch (e) {
    statusEl.textContent = e.message;
  }
};

// 6️⃣ React to auth state
let unsubscribeBoards;
onAuthStateChanged(auth, user => {
  if (user) {
    statusEl.textContent = `Logged in as ${user.email}`;
    fileInput.disabled   = false;
    startBoardsListener();
  } else {
    statusEl.textContent       = 'Please sign up or log in';
    fileInput.disabled         = true;
    fileStatusEl.textContent   = '';
    boardsListEl.innerHTML     = '';
    overlayCanvas.style.display   = 'none';
    problemControls.style.display = 'none';
    currentBoardImg.src           = '';
    if (unsubscribeBoards) unsubscribeBoards();
  }
});

// 7️⃣ Upload a board image → Firestore “boards” collection
fileInput.onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;

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
};

// 8️⃣ Real-time listener for boards list
function startBoardsListener() {
  if (unsubscribeBoards) unsubscribeBoards();
  const q = query(
    collection(db, 'boards'),
    orderBy('timestamp')
  );
  unsubscribeBoards = onSnapshot(q, snap => {
    boardsListEl.innerHTML = '';
    snap.forEach(docSnap => {
      const li = document.createElement('li');
      li.textContent = docSnap.id;
      li.onclick    = () => loadBoard(docSnap.id, docSnap.data().imageUrl);
      boardsListEl.appendChild(li);
    });
  });
}

// 9️⃣ Load board image & set up overlay + problem picker
let overlayCtx, currentBoardId, holds = [];
function loadBoard(boardId, imageUrl) {
  currentBoardId = boardId;
  holds = [];
  overlayCanvas.style.display   = 'none';
  problemControls.style.display = 'none';

  currentBoardImg.src = imageUrl;
  currentBoardImg.onload = () => {
    // size canvas to match natural image
    overlayCanvas.width  = currentBoardImg.naturalWidth;
    overlayCanvas.height = currentBoardImg.naturalHeight;
    // and CSS-scale to match displayed image
    overlayCanvas.style.width  = currentBoardImg.clientWidth  + 'px';
    overlayCanvas.style.height = currentBoardImg.clientHeight + 'px';
    overlayCtx = overlayCanvas.getContext('2d');

    // populate problem dropdown
    loadProblemsForBoard(boardId);

    problemControls.style.display = 'block';
  };
}

// ——— populate saved problems without requiring an index ———
async function loadProblemsForBoard(boardId) {
  problemSelect.innerHTML = '<option value="">— Select a problem —</option>';
  try {
    const snap = await getDocs(
      query(collection(db, 'problems'), where('boardId', '==', boardId))
    );
    // sort client-side by createdAt descending
    const problems = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });
    problems.forEach(p => {
      const opt = document.createElement('option');
      opt.value       = p.id;
      opt.textContent = p.name;
      problemSelect.appendChild(opt);
    });
  } catch (e) {
    console.error('Couldn’t load problems:', e);
  }
}

// 🔟 When user selects an existing problem
problemSelect.onchange = async () => {
  const pid = problemSelect.value;
  if (!pid) { newProblemBtn.click(); return; }

  try {
    const dsnap = await getDoc(doc(db, 'problems', pid));
    holds = dsnap.data().holds || [];
    overlayCanvas.style.display = 'block';
    redrawHolds();
  } catch (e) {
    console.error('Error fetching problem:', e);
  }
};

// 1️⃣1️⃣ “New Problem” — clear overlay
newProblemBtn.onclick = () => {
  holds = [];
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  overlayCanvas.style.display = 'block';
  problemSelect.value = '';
};

// 1️⃣2️⃣ Place new holds on click
overlayCanvas.onclick = e => {
  const rect = overlayCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (overlayCanvas.width  / rect.width);
  const y = (e.clientY - rect.top)  * (overlayCanvas.height / rect.height);
  holds.push({
    xRatio: x / overlayCanvas.width,
    yRatio: y / overlayCanvas.height,
    type:   holdTypeEl.value
  });
  redrawHolds();
};

// 1️⃣3️⃣ Redraw all holds at a screen-fixed 20 px radius
function redrawHolds() {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // compute native radius so it draws as ~20px on screen
  const scale = overlayCanvas.width / overlayCanvas.clientWidth;
  const nativeR = 10 * scale;

  holds.forEach(h => {
    const x = h.xRatio * overlayCanvas.width;
    const y = h.yRatio * overlayCanvas.height;
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, nativeR, 0, 2 * Math.PI);

    if (h.type === 'start')    overlayCtx.fillStyle = 'rgba(144,238,144,0.6)';
    else if (h.type === 'hold') overlayCtx.fillStyle = 'rgba(255,255,0,0.6)';
    else                         overlayCtx.fillStyle = 'rgba(255,255,255,0.8)';

    overlayCtx.fill();
  });
}

// 1️⃣4️⃣ Save the problem
saveBtn.onclick = async () => {
  const name = nameEl.value.trim();
  if (!name || holds.length === 0) {
    problemStatusEl.textContent = 'Please give a name & place holds.';
    return;
  }
  try {
    await addDoc(collection(db, 'problems'), {
      boardId:     currentBoardId,
      name,
      description: descEl.value.trim(),
      holds,
      owner:       auth.currentUser.uid,
      createdAt:   serverTimestamp()
    });
    problemStatusEl.textContent = 'Problem saved!';
    overlayCanvas.style.display = 'none';
    await loadProblemsForBoard(currentBoardId);
  } catch (e) {
    problemStatusEl.textContent = `Error: ${e.message}`;
  }
};