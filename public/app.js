// public/app.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  getFirestore, collection, onSnapshot,
  query, orderBy, addDoc, updateDoc,
  serverTimestamp, doc, getDocs, getDoc, where
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef,
  uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

window.addEventListener('DOMContentLoaded', () => {
  // ── Firebase init ─────────────────────────────
  initializeApp({
    apiKey: "AIzaSyAA-PKUvVk4DnCMlYbMPNR6Zd3lBtbrBGE",
    authDomain: "wallywall-18303.firebaseapp.com",
    projectId: "wallywall-18303",
    storageBucket: "wallywall-18303.firebasestorage.app",
    messagingSenderId: "699677979638",
    appId: "1:699677979638:web:ecec0b42369c55fffdcdd7",
    measurementId: "G-5KRL7X1N81"
  });
  const auth    = getAuth();
  const db      = getFirestore();
  const storage = getStorage();

  // ── DOM refs ────────────────────────────────────
  const $ = id => document.getElementById(id);
  const menuBtn        = $('menuBtn');
  const boardsPanel    = $('boardsPanel');
  const fileInput      = $('file');
  const fileStatus     = $('fileStatus');
  const boardsList     = $('boardsList');
  const authStatus     = $('authStatus');
  const emailInput     = $('emailInput');
  const passwordInput  = $('passwordInput');
  const loginBtn       = $('loginBtn');
  const signOutBtn     = $('signOutBtn');
  const boardMain      = $('boardMain');
  const currentBoard   = $('currentBoard');
  const canvas         = $('overlayCanvas');
  const problemSelect  = $('problemSelect');
  const newBtn         = $('newProblemBtn');
  const editBtn        = $('editProblemBtn');
  const drawControls   = $('drawControls');
  const finishBtn      = $('finishDrawBtn');
  const cancelBtn      = $('cancelDrawBtn');
  const sheet          = $('problemSheet');
  const cancelSheetBtn = $('cancelSheetBtn');
  const saveSheetBtn   = $('saveProblemBtn');
  const pNameInput     = $('problemName');
  const pDescInput     = $('problemDesc');
  const holdBtns       = Array.from(document.querySelectorAll('.hold-btn'));

  // ── Drawing constants ──────────────────────────
  const DOT_R = 10, DOT_W = 3;

  // ── State ─────────────────────────────────────
  let ctx, boardId, holds = [], mode = 'start';

  // ── Helpers ───────────────────────────────────
  const isLoggedIn = () => {
    const u = auth.currentUser;
    return u && !u.isAnonymous;
  };

  // ── Auth-UI updates ────────────────────────────
  function updateAuthUI(u) {
    if (!u || u.isAnonymous) {
      authStatus.textContent = 'Not signed in';
      loginBtn.classList.remove('hidden');
      signOutBtn.classList.add('hidden');
      newBtn.classList.add('hidden');
      editBtn.classList.add('hidden');
    } else {
      authStatus.textContent = `Signed in: ${u.email||'Anonymous'}`;
      loginBtn.classList.add('hidden');
      signOutBtn.classList.remove('hidden');
      newBtn.classList.remove('hidden');
      editBtn.classList.toggle('hidden', !problemSelect.value);
    }
  }
  onAuthStateChanged(auth, updateAuthUI);

  // ── Login / Sign-up ────────────────────────────
  loginBtn.onclick = async () => {
    const e = emailInput.value.trim(), p = passwordInput.value;
    if (!e || !p) return alert('Enter both email & password.');
    try {
      await signInWithEmailAndPassword(auth, e, p);
    } catch(err) {
      if (err.code === 'auth/user-not-found') {
        await createUserWithEmailAndPassword(auth, e, p);
      } else {
        alert(err.message);
      }
    }
  };
  signOutBtn.onclick = () => signOut(auth);

  // ── Sidebar toggle ────────────────────────────
  menuBtn.onclick = () => boardsPanel.classList.toggle('open');

  // ── Upload new board ──────────────────────────
  fileInput.onchange = async () => {
    if (!isLoggedIn()) return alert('Sign in to upload boards.');
    const f = fileInput.files[0]; if (!f) return;
    try {
      const r   = storageRef(storage, `layouts/${f.name}`);
      await uploadBytes(r, f);
      const url = await getDownloadURL(r);
      fileStatus.textContent = 'Uploading…';
      await addDoc(collection(db,'boards'), {
        imageUrl:url,
        timestamp:serverTimestamp(),
        ownerUid:auth.currentUser.uid
      });
      fileStatus.textContent = '✅ Saved';
    } catch(e) {
      fileStatus.textContent = `❌ ${e.message}`;
    }
  };

  // ── Real-time boards + auto-load ──────────────
  let firstLoad = false;
  onSnapshot(
    query(collection(db,'boards'), orderBy('timestamp','desc')),
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
        const f = snap.docs[0];
        loadBoard(f.id, f.data().imageUrl);
      }
    }
  );

  // ── Load board & reset UI ─────────────────────
  function loadBoard(id, url) {
    boardId = id;
    exits();  // hide any drawing UI
    currentBoard.src = url;
    currentBoard.onload = async () => {
      ctx = canvas.getContext('2d');
      canvas.width  = currentBoard.naturalWidth;
      canvas.height = currentBoard.naturalHeight;
      canvas.style.width  = currentBoard.clientWidth + 'px';
      canvas.style.height = currentBoard.clientHeight + 'px';
      await loadProblems(id);
    };
  }

  // ── Populate problem dropdown ─────────────────
  async function loadProblems(bid) {
    problemSelect.innerHTML = '<option value="">— Select a problem —</option>';
    const snap = await getDocs(
      query(collection(db,'problems'), where('boardId','==',bid))
    );
    snap.docs
      .map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=>(b.createdAt?.toMillis()||0)-(a.createdAt?.toMillis()||0))
      .forEach(p => {
        const o = document.createElement('option');
        o.value       = p.id;
        o.textContent = p.name;
        problemSelect.append(o);
      });
  }

  // ── Select vs New/Edit toggle ─────────────────
  problemSelect.onchange = async () => {
    editBtn.classList.toggle('hidden', !(isLoggedIn() && problemSelect.value));
    if (!problemSelect.value) {
      // blank → new
      startNew();
    } else {
      // load existing holds
      const ds = await getDoc(doc(db,'problems',problemSelect.value));
      holds = ds.data().holds || [];
      redraw();
      exits();  // just viewing
    }
  };

  // ── New & Edit handlers ──────────────────────
  newBtn.onclick = () => {
    if (!isLoggedIn()) return alert('Sign in to create.');
    startNew();
  };
  editBtn.onclick = async () => {
    if (!isLoggedIn()) return alert('Sign in to edit.');
    if (!problemSelect.value) return;
    // fetch problem data
    const ds = await getDoc(doc(db,'problems',problemSelect.value));
    const data = ds.data();
    pNameInput.value = data.name || '';
    pDescInput.value = data.description || '';
    holds = data.holds || [];
    startEdit();
  };

  function startNew() {
    holds = []; redraw();
    enterDrawUI();
  }
  function startEdit() {
    redraw();  // already loaded holds
    enterDrawUI();
  }

  function enterDrawUI() {
    boardMain.classList.add('editing');
    problemSelect .classList.add('hidden');
    newBtn        .classList.add('hidden');
    editBtn       .classList.add('hidden');
    drawControls  .classList.remove('hidden');
    finishBtn     .classList.remove('hidden');
    cancelBtn     .classList.remove('hidden');
    canvas.style.pointerEvents = 'auto';
    sheet.classList.add('hidden');
  }

  function exits() {
    boardMain.classList.remove('editing');
    problemSelect .classList.remove('hidden');
    newBtn        .classList.toggle('hidden', !isLoggedIn());
    editBtn       .classList.toggle('hidden', !(isLoggedIn()&&problemSelect.value));
    drawControls  .classList.add('hidden');
    finishBtn     .classList.add('hidden');
    cancelBtn     .classList.add('hidden');
    canvas.style.pointerEvents = 'none';
    sheet.classList.add('hidden');
  }

  cancelBtn.onclick = () => exits();
  finishBtn.onclick = () => {
    if (!holds.length) return alert('Place at least one hold.');
    exits();
    sheet.classList.remove('hidden');
  };

  // ── Hold-type palette ─────────────────────────
  holdBtns.forEach(b => {
    b.onclick = () => {
      mode = b.dataset.type;
      holdBtns.forEach(x => x.classList.toggle('active', x===b));
      canvas.style.cursor = mode==='delete' ? 'not-allowed' : 'crosshair';
    };
  });

  // ── Place/Delete circles ──────────────────────
  canvas.onclick = e => {
    if (!boardMain.classList.contains('editing')) return;
    const r     = canvas.getBoundingClientRect();
    const x     = (e.clientX - r.left ) * (canvas.width  / r.width);
    const y     = (e.clientY - r.top  ) * (canvas.height / r.height);
    const scale = canvas.width / canvas.clientWidth;

    if (mode==='delete') {
      let idx=-1, best=(12*scale)**2;
      holds.forEach((h,i) => {
        const dx = x - h.xRatio*canvas.width;
        const dy = y - h.yRatio*canvas.height;
        const d2 = dx*dx + dy*dy;
        if (d2<best) { best=d2; idx=i; }
      });
      if (idx>=0) holds.splice(idx,1);
    } else {
      holds.push({ xRatio:x/canvas.width, yRatio:y/canvas.height, type:mode });
    }
    redraw();
  };

  // ── Redraw all circles ─────────────────────────
  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const scale = canvas.width / canvas.clientWidth;
    holds.forEach(h => {
      const cx = h.xRatio*canvas.width, cy = h.yRatio*canvas.height;
      ctx.beginPath();
      ctx.arc(cx, cy, DOT_R*scale, 0, 2*Math.PI);
      ctx.lineWidth   = DOT_W*scale;
      ctx.fillStyle   = 'transparent';
      ctx.strokeStyle = (
        h.type==='start'? getComputedStyle(document.documentElement).getPropertyValue('--start-c') :
        h.type==='hold' ? getComputedStyle(document.documentElement).getPropertyValue('--hold-c')  :
                           getComputedStyle(document.documentElement).getPropertyValue('--finish-c')
      ).trim();
      ctx.fill();
      ctx.stroke();
    });
  }

  // ── Sheet “Cancel” / “Save” ───────────────────
  cancelSheetBtn.onclick = () => sheet.classList.add('hidden');
  saveSheetBtn.onclick   = async () => {
    const nm = pNameInput.value.trim();
    if (!nm) return alert('Name is required.');
    try {
      if (problemSelect.value) {
        // update
        await updateDoc(doc(db,'problems',problemSelect.value), {
          name:nm,
          description: pDescInput.value.trim(),
          holds
        });
      } else {
        // create
        await addDoc(collection(db,'problems'), {
          boardId,
          name:nm,
          description: pDescInput.value.trim(),
          holds,
          ownerUid: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
      }
      alert('✅ Saved!');
      sheet.classList.add('hidden');
      await loadProblems(boardId);
      exits();
    } catch(e) {
      alert(`❌ ${e.message}`);
    }
  };

});