// public/app.js

// — Emulator connectors & low‐level Firestore/Storage calls from CDN —
import {
  connectAuthEmulator,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  connectFirestoreEmulator,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import {
  connectStorageEmulator,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

// — Your modules —
import { auth, db, storage } from './firebase/firebaseConfig.mjs';
import { initAuth } from './firebase/auth.js';
import {
  addProblem,
  updateProblem,
  deleteProblem,
  getProblemsByBoardId,
  problemsCol,
  addAccessCode

} from './firebase/firestore.js';
import { DOM } from './ui.js';

// — Guest‐access globals —
window.GUEST_CODE = null;
window.GUEST_LEVEL = null;

window.addEventListener('DOMContentLoaded', () => {
  // Pull in all your UI elements
  const {
    menuBtn, boardsPanel,
    fileInput, fileStatus,
    boardsList,
    authPanel, emailInput, passwordInput, authDescription,
    loginBtn, signOutBtn, uploadControls,
    hdrTitle,
    boardMain, currentBoard, canvas,
    boardOwnerControls, generateReadCodeBtn, generateEditCodeBtn,
    problemSelect, newProblemBtn, editProblemBtn,
    drawControls, finishDrawBtn, cancelDrawBtn,
    problemSheet, cancelSheetBtn, saveProblemBtn, problemGrade,
    problemName, problemDesc,
    holdBtns, guestCodeBtn
  } = DOM;

  // 1️⃣ Init custom auth UI  
  initAuth({
    loginBtn,
    signOutBtn,
    emailInput,
    passwordInput
  });

  // 2️⃣ Centralized Auth State Handler
  let currentUser = null;
  let currentBoardData = null; // Keep track of the currently loaded board's data

  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAuthUI(user);
    // Re-evaluate owner controls if a board is loaded
    if (currentBoardData) {
      updateOwnerControls(user, currentBoardData.ownerUid);
    }
    if (user) {
      // If user is logged in, start listening for boards.
      listenForBoards();
    } else {
      // User signed out or is a guest
      if (unsubscribeBoards) {
        unsubscribeBoards(); // Stop listening
        unsubscribeBoards = null;
      }
      boardsList.innerHTML = '';
    }
  });

  function updateAuthUI(user) {
    const loggedIn = !!user && !user.isAnonymous;
    const canCreate = loggedIn || window.GUEST_LEVEL === 'edit';

    authDescription.classList.toggle('hidden', loggedIn);
    emailInput.classList.toggle('hidden', loggedIn);
    passwordInput.classList.toggle('hidden', loggedIn);
    loginBtn.classList.toggle('hidden', loggedIn);
    signOutBtn.classList.toggle('hidden', !loggedIn);

    uploadControls.classList.toggle('hidden', !loggedIn);
    newProblemBtn.classList.toggle('hidden', !canCreate);
    editProblemBtn.classList.toggle('hidden', !(canCreate && !!problemSelect.value));

    authPanel.querySelector('h3')?.remove();
    if (loggedIn) {
      const h = document.createElement('h3');
      h.textContent = `Signed in: ${user.email}`;
      authPanel.prepend(h);
    }
  }

  // 3️⃣ Hook up emulators (local only)
  if (location.hostname === 'localhost') {
    connectAuthEmulator(auth,      'http://localhost:9099');
    connectFirestoreEmulator(db,   'localhost', 8080);
    connectStorageEmulator(storage,'localhost', 9199);
  }

  // 4️⃣ Initial UI state
  drawControls.classList.add('hidden');
  finishDrawBtn.classList.add('hidden');
  cancelDrawBtn.classList.add('hidden');
  problemSheet.classList.remove('visible');
  editProblemBtn.classList.add('hidden');
  newProblemBtn.classList.add('hidden');
  canvas.style.pointerEvents = 'none';
  newProblemBtn.classList.remove('fab');
  newProblemBtn.classList.add('hdr-btn');

  // 5️⃣ Toggle sidebar
  menuBtn.onclick = () => boardsPanel.classList.toggle('open');

  // 6️⃣ Upload a board layout
  fileInput.onchange = async () => {
    const u = currentUser;
    if (!u || u.isAnonymous) {
      return alert('⚠️ Sign in to upload');
    }
    const f = fileInput.files[0];
    if (!f) return;
    const boardName = prompt('Enter a name for this board:', f.name.replace(/\.[^/.]+$/, ""));
    if (!boardName) return;
    try {
      const storageRefPath = storageRef(storage, `layouts/${f.name}`);
      await uploadBytes(storageRefPath, f);
      const url = await getDownloadURL(storageRefPath);
      fileStatus.textContent = 'Uploading…';
      await addDoc(collection(db, 'boards'), {
        name: boardName,
        imageUrl: url,
        timestamp: serverTimestamp(),
        ownerUid: u.uid
      });
      fileStatus.textContent = '✅ Saved';
    } catch (e) {
      fileStatus.textContent = `❌ ${e.message}`;
    }
  };

  // 7️⃣ Real‐time boards list & auto‐load
  let firstLoad = false; // To prevent auto-loading a board more than once
  let unsubscribeBoards = null; // To hold the listener unsubscribe function

  function listenForBoards() {
    // If we're already listening, do nothing.
    if (unsubscribeBoards) return;

    unsubscribeBoards = onSnapshot(
      query(collection(db, 'boards'), orderBy('timestamp', 'desc')),
      snap => {
        boardsList.innerHTML = '';
        const boardDocs = snap.docs;
        boardDocs.forEach(d => {
          const li = document.createElement('li');
          li.textContent = d.data().name || d.id;
          li.onclick = () => loadBoard(d.id, d.data());
          boardsList.append(li);
        });
        if (!firstLoad && boardDocs.length) {
          firstLoad = true;
          // Only auto-load if a user is logged in. Guests see a blank slate.
          if (currentUser) {
            loadBoard(boardDocs[0].id, boardDocs[0].data());
          }
        }
      }
    );
  }

  // 8️⃣ Guest‐code entry
  guestCodeBtn.onclick = async () => {
    const code = prompt('Enter your board access code:');
    if (!code) return;
    try {
      // Get the access code document from the top-level collection
      const codeDoc = await getDoc(doc(db, 'accessCodes', code.trim()));

      if (!codeDoc.exists()) {
        alert('Invalid code. No board found for this code.');
        window.GUEST_LEVEL = null;
        return;
      }

      const { boardId, level: accessLevel } = codeDoc.data();

      // Now fetch the board data
      const boardDoc = await getDoc(doc(db, 'boards', boardId));
      if (!boardDoc.exists()) {
        alert(`Board with ID '${boardId}' not found for this code.`);
        return;
      }

      // Load the board
      loadBoard(boardId, boardDoc.data());

      // Set guest level and alert user
      window.GUEST_CODE = code;
      window.GUEST_LEVEL = accessLevel;
      alert(`Access granted to board "${boardDoc.data().name}" with ${accessLevel} permissions.`);

      // Manually update the UI to reflect the new guest permissions
      updateAuthUI(currentUser);

    } catch (err) {
      console.error(err);
      alert(`Error validating code: ${err.message}`);
    }
  };

  // 9️⃣ Board owner actions
  let isGeneratingCode = false; // Add a flag to prevent re-entry.
  const generateAndShowCode = async (level) => {
    if (isGeneratingCode) return; // If a code is already being generated, do nothing.
    isGeneratingCode = true;

    if (!boardId) {
      alert('Please select a board first.');
      isGeneratingCode = false; // Reset the flag before exiting.
      return;
    }
    // Simple random code generator
    const code = (Math.random().toString(36) + '00000000000000000').slice(2, 8).toUpperCase();
    try {
      await addAccessCode(boardId, code, level);
      prompt(`Share this ${level} code:`, code);
    } catch (e) {
      alert(`Could not create code: ${e.message}`);
    } finally {
      isGeneratingCode = false; // Always reset the flag when the operation is complete.
    }
  };
  generateReadCodeBtn.onclick = () => generateAndShowCode('read');
  generateEditCodeBtn.onclick = () => generateAndShowCode('edit');

  function updateOwnerControls(user, ownerUid) {
    const isOwner = user && !user.isAnonymous && user.uid === ownerUid;
    boardOwnerControls.classList.toggle('hidden', !isOwner);
  }

  // 1️⃣0️⃣ Board + Problems
  let ctx, boardId, holds = [], mode = 'start';

  function loadBoard(id, boardData) {
    boardId = id;
    currentBoardData = boardData;
    const { imageUrl, ownerUid } = boardData;
    holds = [];
    exitPlacementMode();
    currentBoard.src = imageUrl;
    currentBoard.onload = () => {
      ctx = canvas.getContext('2d');
      canvas.width  = currentBoard.naturalWidth;
      canvas.height = currentBoard.naturalHeight;
      canvas.style.width  = `${currentBoard.clientWidth}px`;
      canvas.style.height = `${currentBoard.clientHeight}px`;
      loadProblems(id);
    };

    updateOwnerControls(currentUser, ownerUid);
  }

  async function loadProblems(bid) {
    problemSelect.innerHTML = '<option value="">— Select a problem —</option>';
    const probs = await getProblemsByBoardId(bid);
    probs.sort((a, b) => (b.createdAt?.toMillis()||0) - (a.createdAt?.toMillis()||0))
         .forEach(p => {
           const o = document.createElement('option');
           o.value = p.id;
           o.textContent = p.grade ? `${p.name} (${p.grade})` : p.name;
           problemSelect.append(o);
         });
  }

  // 1️⃣1️⃣ Problem selection / New / Edit
  problemSelect.onchange = async () => {
    const canEdit = (!!currentUser && !currentUser.isAnonymous)
                 || window.GUEST_LEVEL === 'edit';
    editProblemBtn.classList.toggle('hidden', !(canEdit && !!problemSelect.value));
    if (problemSelect.value) {
      // A problem was selected, load its holds
      const ds = await getDoc(doc(db, `boards/${boardId}/problems/${problemSelect.value}`));
      holds = ds.data().holds || [];
      redraw();
    } else {
      // The "Select a problem" placeholder was chosen, so clear any visible holds
      holds = [];
      redraw();
    }
  };

  newProblemBtn.onclick = () => {
    const canEdit = (!!currentUser && !currentUser.isAnonymous)
                 || window.GUEST_LEVEL === 'edit';
    if (!canEdit) {
      return alert('⚠️ Please sign in or enter an edit code to create.');
    }
    startPlacementMode(true);
  };

  editProblemBtn.onclick = async () => {
    const canEdit = (!!currentUser && !currentUser.isAnonymous)
                 || window.GUEST_LEVEL === 'edit';
    if (!canEdit || !problemSelect.value) {
      return alert('⚠️ Sign in or enter an edit code & pick a problem first.');
    }
    const ds = await getDoc(doc(db, `boards/${boardId}/problems/${problemSelect.value}`));
    const d = ds.data();
    holds = d.holds || [];
    problemName.value = d.name || '';
    problemDesc.value = d.description || '';
    problemGrade.value = d.grade || '';
    redraw();
    startPlacementMode(false);
  };

  // 1️⃣2️⃣ Hold‐palette, Canvas interactions, Redraw, Sheet etc.
  holdBtns.forEach(b => {
    b.onclick = () => {
      mode = b.dataset.type;
      holdBtns.forEach(x => x.classList.toggle('active', x===b));
      canvas.style.cursor = mode==='delete' ? 'not-allowed' : 'crosshair';
    };
  });

  canvas.onclick = e => {
    if (!boardMain.classList.contains('editing')) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top)  * (canvas.height / r.height);
    const scale = canvas.width / canvas.clientWidth;
    if (mode==='delete') {
      let best=(12*scale)**2, idx=-1;
      holds.forEach((h,i)=>{
        const dx=x-h.xRatio*canvas.width;
        const dy=y-h.yRatio*canvas.height;
        const d2=dx*dx+dy*dy;
        if(d2<best){best=d2;idx=i;}
      });
      if(idx>=0) holds.splice(idx,1);
    } else {
      holds.push({ xRatio:x/canvas.width, yRatio:y/canvas.height, type:mode });
    }
    redraw();
  };

  function redraw(){
    if(!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const scale=canvas.width/canvas.clientWidth;
    holds.forEach(h=>{
      const cx=h.xRatio*canvas.width;
      const cy=h.yRatio*canvas.height;
      ctx.beginPath();
      ctx.arc(cx,cy,10*scale,0,2*Math.PI);
      ctx.lineWidth=3*scale;
      ctx.fillStyle='transparent';
      ctx.strokeStyle=(
        h.type==='start'?getComputedStyle(document.documentElement).getPropertyValue('--start-c'):
        h.type==='hold'?getComputedStyle(document.documentElement).getPropertyValue('--hold-c'):
        getComputedStyle(document.documentElement).getPropertyValue('--finish-c')
      ).trim();
      ctx.fill();ctx.stroke();
    });
  }

  finishDrawBtn.onclick = () => {
    if (!holds.length) {
      return alert('⚠️ Place at least one hold.');
    }
    exitPlacementMode();
    problemSheet.classList.add('visible');
  };
  cancelDrawBtn.onclick = () => {
    holds=[];redraw();exitPlacementMode();
  };

  cancelSheetBtn.onclick = () => {
    problemSheet.classList.remove('visible');
    exitPlacementMode();
  };

  saveProblemBtn.onclick = async () => {
    // Disable button to prevent double-clicks
    saveProblemBtn.disabled = true;

    const nm = problemName.value.trim();
    if (!nm) {
      alert('⚠️ Name is required.');
      saveProblemBtn.disabled = false;
      return;
    }
    const u = currentUser;
    const canEdit = (!!u && !u.isAnonymous)
                 || window.GUEST_LEVEL==='edit';
    if (!canEdit) {
      alert('⚠️ Sign in or enter an edit code to save.');
      saveProblemBtn.disabled = false;
      return;
    }

    try {
      if (problemSelect.value) {
        const updates = {
          name: nm,
          description: problemDesc.value.trim(),
          holds,
          grade: problemGrade.value
        };
        // If guest, pass code for validation in security rules
        if (window.GUEST_LEVEL === 'edit' && window.GUEST_CODE) {
          updates.guestCode = window.GUEST_CODE;
        }
        await updateProblem(boardId, problemSelect.value, updates);
      } else {
        const problemData = {
          name: nm,
          description: problemDesc.value.trim(),
          holds,
          grade: problemGrade.value
        };
        if (u && !u.isAnonymous) {
          problemData.ownerUid = u.uid;
        }
        // If guest, pass code for validation in security rules
        if (window.GUEST_LEVEL === 'edit' && window.GUEST_CODE) {
          problemData.guestCode = window.GUEST_CODE;
        }
        await addProblem(boardId, problemData);
      }
      alert('✅ Saved!');
      problemSheet.classList.remove('visible');
      loadProblems(boardId);
    } catch(e) {
      alert(`❌ ${e.message}`);
    } finally {
      // Re-enable button after operation is complete
      saveProblemBtn.disabled = false;
    }
  };

  function startPlacementMode(isNew){
    if(isNew){
      problemSelect.value='';
      holds = [];
      redraw();
      problemName.value = '';
      problemDesc.value = '';
      problemGrade.value = '';
    }
    boardMain.classList.add('editing');
    hdrTitle.classList.add('hidden');
    problemSelect.classList.add('hidden');
    newProblemBtn.classList.add('hidden');
    editProblemBtn.classList.add('hidden');
    drawControls.classList.remove('hidden');
    finishDrawBtn.classList.remove('hidden');
    cancelDrawBtn.classList.remove('hidden');
    canvas.style.pointerEvents='auto';
    problemSheet.classList.remove('visible');
  }
  function exitPlacementMode(){
    boardMain.classList.remove('editing');
    hdrTitle.classList.remove('hidden');
    problemSelect.classList.remove('hidden');
    const canCreate = (!!currentUser && !currentUser.isAnonymous) || window.GUEST_LEVEL === 'edit';
    newProblemBtn.classList.toggle('hidden', !canCreate);
    editProblemBtn.classList.toggle('hidden', !(canCreate && !!problemSelect.value));
    drawControls.classList.add('hidden');
    finishDrawBtn.classList.add('hidden');
    cancelDrawBtn.classList.add('hidden');
    canvas.style.pointerEvents='none';
  }
});