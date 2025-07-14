// public/app.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
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
  const by               = id => document.getElementById(id);
  const menuBtn          = by('menuBtn');
  const boardsPanel      = by('boardsPanel');
  const fileInput        = by('file');
  const fileStatus       = by('fileStatus');
  const boardsList       = by('boardsList');
  const authPanel        = by('authPanel');
  const emailInput       = by('emailInput');
  const passwordInput    = by('passwordInput');
  const loginBtn         = by('loginBtn');
  const signOutBtn       = by('signOutBtn');
  const hdrTitle         = document.querySelector('.hdr-title');
  const boardMain        = by('boardMain');
  const currentBoard     = by('currentBoard');
  const canvas           = by('overlayCanvas');
  const problemSelect    = by('problemSelect');
  const newProblemBtn    = by('newProblemBtn');
  const editProblemBtn   = by('editProblemBtn');
  const drawControls     = by('drawControls');
  const finishDrawBtn    = by('finishDrawBtn');
  const cancelDrawBtn    = by('cancelDrawBtn');
  const problemSheet     = by('problemSheet');
  const cancelSheetBtn   = by('cancelSheetBtn');
  const saveProblemBtn   = by('saveProblemBtn');
  const problemName      = by('problemName');
  const problemDesc      = by('problemDesc');
  const holdBtns         = Array.from(document.querySelectorAll('.hold-btn'));

  // ── Drawing constants ──────────────────────────
  const DOT_RADIUS = 10;
  const DOT_WIDTH  = 3;

  // ── App state ──────────────────────────────────
  let ctx, boardId, holds = [], mode = 'start';

  // ── Initial UI ─────────────────────────────────
  drawControls.classList.add('hidden');
  finishDrawBtn .classList.add('hidden');
  cancelDrawBtn .classList.add('hidden');
  problemSheet.classList.remove('visible');
  editProblemBtn.classList.add('hidden');
  newProblemBtn .classList.add('hidden');
  canvas.style.pointerEvents = 'none';
  // make “＋” look like our hdr-btn
  newProblemBtn.classList.remove('fab');
  newProblemBtn.classList.add('hdr-btn');

  // ── AUTH UI ────────────────────────────────────
  function updateAuthUI(user) {
    const loggedIn = !!user && !user.isAnonymous;
    newProblemBtn.classList.toggle('hidden', !loggedIn);
    editProblemBtn .classList.toggle('hidden', !(loggedIn && !!problemSelect.value));

    if (!loggedIn) {
      authPanel.querySelector('h3')?.remove();
      loginBtn.classList.remove('hidden');
      signOutBtn.classList.add('hidden');
    } else {
      loginBtn .classList.add('hidden');
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
    if (!email||!pass) return alert('Enter email & password.');
    try {
      await signInWithEmailAndPassword(auth,email,pass);
    } catch(e) {
      if (e.code==='auth/user-not-found') {
        await createUserWithEmailAndPassword(auth,email,pass);
      } else {
        alert(`❌ ${e.message}`);
      }
    }
  };
  signOutBtn.onclick = () => signOut(auth);

  // ── Toggle sidebar ────────────────────────────
  menuBtn.onclick = () => boardsPanel.classList.toggle('open');

  // ── Upload board ──────────────────────────────
  fileInput.onchange = async () => {
    const u = auth.currentUser;
    if (!u||u.isAnonymous) return alert('⚠️ Sign in to upload');
    const f = fileInput.files[0]; if (!f) return;
    try {
      const r   = storageRef(storage, `layouts/${f.name}`);
      await uploadBytes(r,f);
      const url = await getDownloadURL(r);
      fileStatus.textContent = 'Uploading…';
      await addDoc(collection(db,'boards'), {
        imageUrl:url, timestamp:serverTimestamp(), ownerUid:u.uid
      });
      fileStatus.textContent = '✅ Saved';
    } catch(e) {
      fileStatus.textContent = `❌ ${e.message}`;
    }
  };

  // ── Real-time boards + auto-load ───────────────
  let firstLoad=false;
  onSnapshot(
    query(collection(db,'boards'),orderBy('timestamp','desc')),
    snap => {
      boardsList.innerHTML = '';
      snap.docs.forEach(d=>{
        const li = document.createElement('li');
        li.textContent = d.id;
        li.onclick = ()=> loadBoard(d.id,d.data().imageUrl);
        boardsList.append(li);
      });
      if (!firstLoad && snap.docs.length) {
        firstLoad = true;
        loadBoard(snap.docs[0].id,snap.docs[0].data().imageUrl);
      }
    }
  );

  // ── Load a board ──────────────────────────────
  function loadBoard(id,url) {
    boardId = id;
    holds   = [];
    exitPlacementMode();
    currentBoard.src = url;
    currentBoard.onload = () => {
      ctx = canvas.getContext('2d');
      canvas.width  = currentBoard.naturalWidth;
      canvas.height = currentBoard.naturalHeight;
      canvas.style.width  = `${currentBoard.clientWidth}px`;
      canvas.style.height = `${currentBoard.clientHeight}px`;
      loadProblems(id);
    };
  }

  // ── Populate problem dropdown ─────────────────
  async function loadProblems(bid) {
    problemSelect.innerHTML = '<option value="">— Select a problem —</option>';
    const snap = await getDocs(
      query(collection(db,'problems'),where('boardId','==',bid))
    );
    snap.docs
      .map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.createdAt?.toMillis()||0)-(a.createdAt?.toMillis()||0))
      .forEach(p=>{
        const o=document.createElement('option');
        o.value=p.id; o.textContent=p.name;
        problemSelect.append(o);
      });
  }

  // ── Select / New / Edit ───────────────────────
  problemSelect.onchange = async () => {
    const loggedIn = !!auth.currentUser && !auth.currentUser.isAnonymous;
    editProblemBtn.classList.toggle('hidden', !(loggedIn && !!problemSelect.value));
    if (!problemSelect.value) {
      startPlacementMode(true);
    } else {
      const ds = await getDoc(doc(db,'problems',problemSelect.value));
      holds = ds.data().holds||[];
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
    if (!auth.currentUser||auth.currentUser.isAnonymous||!problemSelect.value) {
      return alert('⚠️ Sign in & pick a problem first.');
    }
    const ds = await getDoc(doc(db,'problems',problemSelect.value));
    const d  = ds.data();
    holds              = d.holds||[];
    problemName.value  = d.name        || '';
    problemDesc.value  = d.description || '';
    redraw();
    startPlacementMode(false);
  };

  // ── Enter / Exit draw mode ────────────────────
  function startPlacementMode(isNew) {
    if (isNew) {
      // ←––––––––––——————— **clear the select** ———————–––––––––––––→
      problemSelect.value = '';
      //
      holds = [];
      redraw();
      problemName.value = '';
      problemDesc.value = '';
    }
    boardMain.classList.add('editing');
    hdrTitle.classList.add('hidden');
    problemSelect.classList.add('hidden');
    newProblemBtn .classList.add('hidden');
    editProblemBtn.classList.add('hidden');
    drawControls .classList.remove('hidden');
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
    newProblemBtn .classList.toggle('hidden', !loggedIn);
    editProblemBtn.classList.toggle('hidden', !(loggedIn && !!problemSelect.value));
    drawControls .classList.add('hidden');
    finishDrawBtn.classList.add('hidden');
    cancelDrawBtn.classList.add('hidden');
    canvas.style.pointerEvents = 'none';
  }

  cancelDrawBtn.onclick = () => {
    holds=[]; redraw();
    exitPlacementMode();
  };
  finishDrawBtn.onclick = () => {
    if (!holds.length) return alert('⚠️ Place at least one hold.');
    exitPlacementMode();
    problemSheet.classList.add('visible');
  };

  // ── Hold palette ─────────────────────────────
  holdBtns.forEach(b => {
    b.onclick = () => {
      mode = b.dataset.type;
      holdBtns.forEach(x => x.classList.toggle('active', x===b));
      canvas.style.cursor = mode==='delete'?'not-allowed':'crosshair';
    };
  });

  // ── Place / Delete circles ────────────────────
  canvas.onclick = e => {
    if (!boardMain.classList.contains('editing')) return;
    const r     = canvas.getBoundingClientRect();
    const x     = (e.clientX - r.left)*(canvas.width/r.width);
    const y     = (e.clientY - r.top )*(canvas.height/r.height);
    const scale = canvas.width/canvas.clientWidth;
    if (mode==='delete') {
      let idx=-1, best=(12*scale)**2;
      holds.forEach((h,i)=>{
        const dx=x-h.xRatio*canvas.width,
              dy=y-h.yRatio*canvas.height,
              d2=dx*dx+dy*dy;
        if (d2<best){ best=d2; idx=i; }
      });
      if (idx>=0) holds.splice(idx,1);
    } else {
      holds.push({ xRatio:x/canvas.width, yRatio:y/canvas.height, type:mode });
    }
    redraw();
  };

  // ── Redraw ────────────────────────────────────
  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const scale = canvas.width/canvas.clientWidth;
    holds.forEach(h => {
      const cx = h.xRatio*canvas.width,
            cy = h.yRatio*canvas.height;
      ctx.beginPath();
      ctx.arc(cx,cy,DOT_RADIUS*scale,0,2*Math.PI);
      ctx.lineWidth   = DOT_WIDTH*scale;
      ctx.fillStyle   = 'transparent';
      ctx.strokeStyle = (
        h.type==='start'? getComputedStyle(document.documentElement).getPropertyValue('--start-c') :
        h.type==='hold' ? getComputedStyle(document.documentElement).getPropertyValue('--hold-c') :
                           getComputedStyle(document.documentElement).getPropertyValue('--finish-c')
      ).trim();
      ctx.fill();
      ctx.stroke();
    });
  }

  // ── Bottom sheet Cancel/Save ─────────────────
  cancelSheetBtn.onclick = () => {
    problemSheet.classList.remove('visible');
    exitPlacementMode();
  };

  saveProblemBtn.onclick = async () => {
    const nm = problemName.value.trim();
    if (!nm) return alert('⚠️ Name is required.');
    const u = auth.currentUser;
    if (!u || u.isAnonymous) {
      return alert('⚠️ You must be signed in to save.');
    }
    try {
      if (problemSelect.value) {
        // update existing
        await updateDoc(doc(db,'problems',problemSelect.value), {
          name: nm,
          description: problemDesc.value.trim(),
          holds
        });
      } else {
        // create new
        await addDoc(collection(db,'problems'), {
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
    } catch(e) {
      alert(`❌ ${e.message}`);
    }
  };
});