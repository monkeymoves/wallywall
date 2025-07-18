// public/app.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  getFirestore, collection, onSnapshot, query, orderBy,
  addDoc, updateDoc, serverTimestamp, doc, getDocs, getDoc,
  where
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef, uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

import { saveProblem, getProblemsByBoardId } from './firebase/firestore.js';

import {
  connectAuthEmulator
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  connectFirestoreEmulator
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import {
  connectStorageEmulator
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

import { auth, db, storage } from './firebase/firebaseConfig.mjs';
import { initAuth } from './firebase/auth.js';
import { by, DOM } from './ui.js';

const {
  menuBtn,
  boardsPanel,
  fileInput,
  fileStatus,
  boardsList,
  authPanel,
  emailInput,
  passwordInput,
  loginBtn,
  signOutBtn,
  hdrTitle,
  boardMain,
  currentBoard,
  canvas,
  problemSelect,
  newProblemBtn,
  editProblemBtn,
  drawControls,
  finishDrawBtn,
  cancelDrawBtn,
  problemSheet,
  cancelSheetBtn,
  saveProblemBtn,
  problemName,
  problemDesc,
  holdBtns
} = DOM;

window.addEventListener('DOMContentLoaded', () => {
  // Drawing constants
  const DOT_RADIUS = 10;
  const DOT_WIDTH = 3;

  // Initialize auth UI
  initAuth({
    loginBtn,
    signOutBtn,
    authPanel,
    emailInput,
    passwordInput,
    newProblemBtn,
    editProblemBtn,
    problemSelect
  });

  // Connect emulators in development
  if (location.hostname === 'localhost') {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
  }

  // App state
  let ctx, boardId, holds = [], mode = 'start';

  // Initial UI setup
  drawControls.classList.add('hidden');
  finishDrawBtn.classList.add('hidden');
  cancelDrawBtn.classList.add('hidden');
  problemSheet.classList.remove('visible');
  editProblemBtn.classList.add('hidden');
  newProblemBtn.classList.add('hidden');
  canvas.style.pointerEvents = 'none';
  newProblemBtn.classList.remove('fab');
  newProblemBtn.classList.add('hdr-btn');

  // Toggle sidebar
  menuBtn.onclick = () => boardsPanel.classList.toggle('open');

  // Upload board layout
  fileInput.onchange = async () => {
    const u = auth.currentUser;
    if (!u || u.isAnonymous) return alert('⚠️ Sign in to upload');
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const r = storageRef(storage, `layouts/${f.name}`);
      await uploadBytes(r, f);
      const url = await getDownloadURL(r);
      fileStatus.textContent = 'Uploading…';
      await addDoc(collection(db, 'boards'), {
        imageUrl: url,
        timestamp: serverTimestamp(),
        ownerUid: u.uid
      });
      fileStatus.textContent = '✅ Saved';
    } catch (e) {
      fileStatus.textContent = `❌ ${e.message}`;
    }
  };

  // Real-time boards + auto-load
  let firstLoad = false;
  onSnapshot(
    query(collection(db, 'boards'), orderBy('timestamp', 'desc')),
    snap => {
      boardsList.innerHTML = '';
      snap.docs.forEach(d => {
        const li = document.createElement('li');
        li.textContent = d.id;
        li.onclick = () => loadBoard(d.id, d.data().imageUrl);
        boardsList.append(li);
      });
      if (!firstLoad && snap.docs.length) {
        firstLoad = true;
        loadBoard(snap.docs[0].id, snap.docs[0].data().imageUrl);
      }
    }
  );

  // Load a board
  function loadBoard(id, url) {
    boardId = id;
    holds = [];
    exitPlacementMode();
    currentBoard.src = url;
    currentBoard.onload = () => {
      ctx = canvas.getContext('2d');
      canvas.width = currentBoard.naturalWidth;
      canvas.height = currentBoard.naturalHeight;
      canvas.style.width = `${currentBoard.clientWidth}px`;
      canvas.style.height = `${currentBoard.clientHeight}px`;
      loadProblems(id);
    };
  }

  // Populate problem dropdown
  async function loadProblems(bid) {
    problemSelect.innerHTML = '<option value="">— Select a problem —</option>';
    const problems = await getProblemsByBoardId(bid);
    problems
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      .forEach(p => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name;
        problemSelect.append(o);
      });
  }

  // Select / New / Edit handlers
  problemSelect.onchange = async () => {
    const loggedIn = !!auth.currentUser && !auth.currentUser.isAnonymous;
    editProblemBtn.classList.toggle('hidden', !(loggedIn && !!problemSelect.value));
    if (!problemSelect.value) {
      startPlacementMode(true);
    } else {
      const ds = await getDoc(doc(db, 'problems', problemSelect.value));
      holds = ds.data().holds || [];
      redraw();
    }
  };

  newProblemBtn.onclick = () => {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
      return alert('⚠️ Please sign in to create.');
    }
    startPlacementMode(true);
  };

  editProblemBtn.onclick = async () => {
    if (!auth.currentUser || auth.currentUser.isAnonymous || !problemSelect.value) {
      return alert('⚠️ Sign in & pick a problem first.');
    }
    const ds = await getDoc(doc(db, 'problems', problemSelect.value));
    const d = ds.data();
    holds = d.holds || [];
    problemName.value = d.name || '';
    problemDesc.value = d.description || '';
    redraw();
    startPlacementMode(false);
  };

  // Drawing modes
  function startPlacementMode(isNew) {
    if (isNew) {
      problemSelect.value = '';
      holds = [];
      redraw();
      problemName.value = '';
      problemDesc.value = '';
    }
    boardMain.classList.add('editing');
    hdrTitle.classList.add('hidden');
    problemSelect.classList.add('hidden');
    newProblemBtn.classList.add('hidden');
    editProblemBtn.classList.add('hidden');
    drawControls.classList.remove('hidden');
    finishDrawBtn.classList.remove('hidden');
    cancelDrawBtn.classList.remove('hidden');
    canvas.style.pointerEvents = 'auto';
    problemSheet.classList.remove('visible');
  }

  function exitPlacementMode() {
    boardMain.classList.remove('editing');
    hdrTitle.classList.remove('hidden');
    problemSelect.classList.remove('hidden');
    const loggedIn = !!auth.currentUser && !auth.currentUser.isAnonymous;
    newProblemBtn.classList.toggle('hidden', !loggedIn);
    editProblemBtn.classList.toggle('hidden', !(loggedIn && !!problemSelect.value));
    drawControls.classList.add('hidden');
    finishDrawBtn.classList.add('hidden');
    cancelDrawBtn.classList.add('hidden');
    canvas.style.pointerEvents = 'none';
  }

  cancelDrawBtn.onclick = () => {
    holds = [];
    redraw();
    exitPlacementMode();
  };

  finishDrawBtn.onclick = () => {
    if (!holds.length) return alert('⚠️ Place at least one hold.');
    exitPlacementMode();
    problemSheet.classList.add('visible');
  };

  // Hold palette
  holdBtns.forEach(b => {
    b.onclick = () => {
      mode = b.dataset.type;
      holdBtns.forEach(x => x.classList.toggle('active', x === b));
      canvas.style.cursor = mode === 'delete' ? 'not-allowed' : 'crosshair';
    };
  });

  // Canvas click for placing/deleting holds
  canvas.onclick = e => {
    if (!boardMain.classList.contains('editing')) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    const scale = canvas.width / canvas.clientWidth;
    if (mode === 'delete') {
      let idx = -1, best = (12 * scale) ** 2;
      holds.forEach((h, i) => {
        const dx = x - h.xRatio * canvas.width;
        const dy = y - h.yRatio * canvas.height;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; idx = i; }
      });
      if (idx >= 0) holds.splice(idx, 1);
    } else {
      holds.push({ xRatio: x / canvas.width, yRatio: y / canvas.height, type: mode });
    }
    redraw();
  };

  // Redraw circles
  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / canvas.clientWidth;
    holds.forEach(h => {
      const cx = h.xRatio * canvas.width;
      const cy = h.yRatio * canvas.height;
      ctx.beginPath();
      ctx.arc(cx, cy, DOT_RADIUS * scale, 0, 2 * Math.PI);
      ctx.lineWidth = DOT_WIDTH * scale;
      ctx.fillStyle = 'transparent';
      ctx.strokeStyle = (
        h.type === 'start' ? getComputedStyle(document.documentElement).getPropertyValue('--start-c') :
        h.type === 'hold' ? getComputedStyle(document.documentElement).getPropertyValue('--hold-c') :
        getComputedStyle(document.documentElement).getPropertyValue('--finish-c')
      ).trim();
      ctx.fill();
      ctx.stroke();
    });
  }

  // Bottom sheet actions
  cancelSheetBtn.onclick = () => {
    problemSheet.classList.remove('visible');
    exitPlacementMode();
  };

  saveProblemBtn.onclick = async () => {
    const nm = problemName.value.trim();
    if (!nm) return alert('⚠️ Name is required.');
    const u = auth.currentUser;
    if (!u || u.isAnonymous) return alert('⚠️ You must be signed in to save.');

    try {
      if (problemSelect.value) {
        await updateDoc(doc(db, 'problems', problemSelect.value), {
          name: nm,
          description: problemDesc.value.trim(),
          holds
        });
      } else {
        await addDoc(collection(db, 'problems'), {
          boardId,
          name: nm,
          description: problemDesc.value.trim(),
          holds,
          ownerUid: u.uid,
          createdAt: serverTimestamp()
        });
      }
      alert('✅ Saved!');
      problemSheet.classList.remove('visible');
      loadProblems(boardId);
    } catch (e) {
      alert(`❌ ${e.message}`);
    }
  };
});