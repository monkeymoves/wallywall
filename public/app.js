// public/app.js

import { connectAuthEmulator, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  connectFirestoreEmulator, collection, onSnapshot, query, orderBy,
  addDoc, serverTimestamp, getDoc, doc
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { connectStorageEmulator, ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

import { auth, db, storage } from './firebase/firebaseConfig.mjs';
import { initAuth } from './firebase/auth.js';
import {
  addProblem, updateProblem, deleteProblem, getProblemsByBoardId,
  shareBoardWithUser, listenForOwnedBoards, listenForSharedBoards,
  listenForSharedUsers, revokeAccess, getUserPermissionForBoard, problemsCol, addAccessCode
} from './firebase/firestore.js';
import { DOM } from './ui.js';

// Guest globals
window.GUEST_CODE = null;
window.GUEST_LEVEL = null;
window.GUEST_BOARD_ID = null;
window.GUEST_BOARD_NAME = null;

let SHARED_ACCESS_LEVEL = null;
let firstLoad = false;

window.addEventListener('DOMContentLoaded', () => {
  const {
    menuBtn, boardsPanel,
    fileInput, fileStatus, boardsList,
    authPanel, emailInput, passwordInput, authDescription,
    loginBtn, signOutBtn, uploadControls, userAccessControls, sharedUsersList,
    hdrTitle,
    boardMain, welcomeMessage, boardContainer, currentBoard, canvas,
    problemInfoCard, problemGradeDisplay, problemDescriptionText, deleteProblemBtn,
    boardOwnerControls, generateReadCodeBtn, generateEditCodeBtn,
    problemSelect, newProblemBtn, editProblemBtn,
    drawControls, finishDrawBtn, cancelDrawBtn,
    problemSheet, cancelSheetBtn, saveProblemBtn, problemGrade,
    problemName, problemDesc,
    holdBtns, guestCodeBtn
  } = DOM;

  let isEditingExistingProblem = false;
  initAuth({ loginBtn, signOutBtn, emailInput, passwordInput });

  let currentUser = null;
  let currentBoardData = null;
  let unsubscribeOwned = null;
  let unsubscribeShared = null;

  onAuthStateChanged(auth, async user => {
    const hadGuestCode = !!window.GUEST_CODE;
    const guestBoardId = window.GUEST_BOARD_ID;
    const guestBoardName = window.GUEST_BOARD_NAME;

    currentUser = user;
    updateAuthUI(user);
    if (currentBoardData) updateOwnerControls(user, currentBoardData.ownerUid);

    if (user && !user.isAnonymous && hadGuestCode && guestBoardId) {
      try {
        await shareBoardWithUser(guestBoardId, guestBoardName, user.uid, user.email, window.GUEST_LEVEL, window.GUEST_CODE);
        alert(`Access to "${guestBoardName}" has been saved to your new account!`);
        window.GUEST_CODE = window.GUEST_LEVEL = window.GUEST_BOARD_ID = window.GUEST_BOARD_NAME = null;
      } catch (e) {
        console.error(e);
        alert("Could not save board access to your new account.");
      }
    }

    if (user) {
      listenForUserBoards(user.uid);
    } else {
      firstLoad = false;
      unsubscribeOwned?.(); unsubscribeOwned = null;
      unsubscribeShared?.(); unsubscribeShared = null;
      boardsList.innerHTML = '';
      welcomeMessage.classList.remove('hidden');
      boardContainer.classList.add('hidden');
      problemInfoCard.classList.add('hidden');
      problemSelect.innerHTML = '<option value="">— Select a problem —</option>';
      holds = [];
      redraw();
    }
  });

  function canEditCurrentBoard(){
    if (!currentUser || currentUser.isAnonymous) return window.GUEST_LEVEL === 'edit';
    if (currentBoardData && currentUser.uid === currentBoardData.ownerUid) return true;
    return SHARED_ACCESS_LEVEL === 'edit';
  }

  function updateAuthUI(user){
    const loggedIn = !!user && !user.isAnonymous;
    const canEdit = canEditCurrentBoard();

    authDescription.classList.toggle('hidden', loggedIn);
    emailInput.classList.toggle('hidden', loggedIn);
    passwordInput.classList.toggle('hidden', loggedIn);
    loginBtn.classList.toggle('hidden', loggedIn);
    signOutBtn.classList.toggle('hidden', !loggedIn);

    uploadControls.classList.toggle('hidden', !loggedIn);
    newProblemBtn.classList.toggle('hidden', !canEdit);
    editProblemBtn.classList.toggle('hidden', !(canEdit && !!problemSelect.value));

    authPanel.querySelector('h3')?.remove();
    if (loggedIn) {
      const h = document.createElement('h3');
      h.textContent = `Signed in: ${user.email}`;
      authPanel.prepend(h);
    }
  }

  if (location.hostname === 'localhost') {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
  }

  drawControls.classList.add('hidden');
  finishDrawBtn.classList.add('hidden');
  cancelDrawBtn.classList.add('hidden');
  problemSheet.classList.remove('visible');
  editProblemBtn.classList.add('hidden');
  newProblemBtn.classList.add('hidden');
  canvas.style.pointerEvents = 'none';
  newProblemBtn.classList.remove('fab');
  newProblemBtn.classList.add('hdr-btn');

  menuBtn.onclick = () => boardsPanel.classList.toggle('open');

  fileInput.onchange = async () => {
    const u = currentUser;
    if (!u || u.isAnonymous) return alert('⚠️ Sign in to upload');
    const f = fileInput.files[0];
    if (!f) return;
    const boardName = prompt('Enter a name for this board:', f.name.replace(/\.[^/.]+$/, ""));
    if (!boardName) return;
    try {
      const storageRefPath = storageRef(storage, `layouts/${f.name}`);
      await uploadBytes(storageRefPath, f);
      const url = await getDownloadURL(storageRefPath);
      fileStatus.textContent = 'Uploading…';

      const newBoardData = { name: boardName, imageUrl: url, timestamp: serverTimestamp(), ownerUid: u.uid };
      const newDocRef = await addDoc(collection(db, 'boards'), newBoardData);

      fileStatus.textContent = '✅ Saved';
      loadBoard(newDocRef.id, newBoardData);
      boardsPanel.classList.remove('open');
    } catch (e) {
      fileStatus.textContent = `❌ ${e.message}`;
    }
  };

  function listenForUserBoards(userId){
    if (unsubscribeOwned) return;

    boardsList.innerHTML = `
      <div id="my-boards-section" class="list-section hidden">
        <h4>My Boards</h4>
        <ul id="ownedBoardsList"></ul>
      </div>
      <div id="shared-boards-section" class="list-section hidden">
        <h4>Shared With Me</h4>
        <ul id="sharedBoardsList"></ul>
      </div>
    `;
    const ownedList  = document.getElementById('ownedBoardsList');
    const sharedList = document.getElementById('sharedBoardsList');
    const myBoardsSection = document.getElementById('my-boards-section');
    const sharedBoardsSection = document.getElementById('shared-boards-section');

    unsubscribeOwned = listenForOwnedBoards(userId, (snapshot) => {
      myBoardsSection.classList.toggle('hidden', snapshot.empty);
      const boardDocs = snapshot.docs;
      renderBoardList(ownedList, boardDocs);
      if (!firstLoad && boardDocs.length > 0) {
        firstLoad = true;
        loadBoard(boardDocs[0].id, boardDocs[0].data());
      }
    });

    unsubscribeShared = listenForSharedBoards(userId, async (snapshot) => {
      sharedBoardsSection.classList.toggle('hidden', snapshot.empty);
      const boardDocs = [];
      for (const docSnap of snapshot.docs) {
        const boardData = docSnap.data();
        const boardDoc = await getDoc(doc(db, 'boards', boardData.boardId));
        if (boardDoc.exists()) boardDocs.push(boardDoc);
      }
      renderBoardList(sharedList, boardDocs);
    });
  }

  function renderBoardList(listElement, boardDocs){
    listElement.innerHTML = '';
    if (boardDocs.length === 0) { listElement.innerHTML = '<li>None yet.</li>'; return; }
    boardDocs.forEach(d => {
      const li = document.createElement('li');
      li.textContent = d.data().name || d.id;
      li.onclick = () => loadBoard(d.id, d.data());
      listElement.append(li);
    });
  }

  guestCodeBtn.onclick = async () => {
    const code = prompt('Enter your board access code:');
    if (!code) return;
    try {
      const codeDoc = await getDoc(doc(db, 'accessCodes', code.trim()));
      if (!codeDoc.exists()) {
        alert('Invalid code. No board found for this code.');
        window.GUEST_LEVEL = null;
        return;
      }
      const { boardId, level: accessLevel } = codeDoc.data();
      const boardDoc = await getDoc(doc(db, 'boards', boardId));
      if (!boardDoc.exists()) { alert(`Board with ID '${boardId}' not found for this code.`); return; }
      const boardData = boardDoc.data();

      loadBoard(boardId, boardData);

      if (currentUser && !currentUser.isAnonymous) {
        if (currentUser.uid !== boardData.ownerUid) {
          await shareBoardWithUser(boardId, boardData.name, currentUser.uid, currentUser.email, accessLevel, code.trim());
          alert(`Access to "${boardData.name}" has been saved to your account.`);
        }
      } else {
        window.GUEST_CODE = code.trim();
        window.GUEST_LEVEL = accessLevel;
        window.GUEST_BOARD_ID = boardId;
        window.GUEST_BOARD_NAME = boardData.name;
        alert(`Access granted to board "${boardData.name}" with ${accessLevel} permissions.`);
      }
      updateAuthUI(currentUser);
    } catch (err) {
      console.error(err);
      alert(`Error validating code: ${err.message}`);
    }
  };

  let isGeneratingCode = false;
  const generateAndShowCode = async (level) => {
    if (isGeneratingCode) return;
    isGeneratingCode = true;

    if (!boardId) { alert('Please select a board first.'); isGeneratingCode = false; return; }
    const code = (Math.random().toString(36) + '00000000000000000').slice(2, 8).toUpperCase();
    try {
      await addAccessCode(boardId, code, level);
      prompt(`Share this ${level} code:`, code);
    } catch (e) {
      alert(`Could not create code: ${e.message}`);
    } finally {
      isGeneratingCode = false;
    }
  };
  generateReadCodeBtn.onclick = () => generateAndShowCode('read');
  generateEditCodeBtn.onclick = () => generateAndShowCode('edit');

  function updateOwnerControls(user, ownerUid){
    const isOwner = user && !user.isAnonymous && user.uid === ownerUid;
    boardOwnerControls.classList.toggle('hidden', !isOwner);
    userAccessControls.classList.toggle('hidden', !isOwner);
  }

  // ===== Board + Problems =====
  let ctx, boardId, holds = [], mode = 'start';

  // Offscreen cache for background sampling (may be blocked by CORS; we handle that)
  let cacheCanvas = null, cacheCtx = null, canSampleBg = false;

  async function loadBoard(id, boardData){
    boardId = id;
    currentBoardData = boardData;
    SHARED_ACCESS_LEVEL = null;
    window.GUEST_LEVEL = window.GUEST_CODE = null;

    const { imageUrl, ownerUid } = boardData;
    welcomeMessage.classList.add('hidden');
    boardContainer.classList.remove('hidden');
    holds = [];
    exitPlacementMode();

    // try to enable sampling
    currentBoard.crossOrigin = 'anonymous';
    currentBoard.src = imageUrl;

    currentBoard.onload = () => {
      if (!ctx) ctx = canvas.getContext('2d');

      // build offscreen cache
      try {
        cacheCanvas = document.createElement('canvas');
        cacheCanvas.width = currentBoard.naturalWidth;
        cacheCanvas.height = currentBoard.naturalHeight;
        cacheCtx = cacheCanvas.getContext('2d', { willReadFrequently: true });
        cacheCtx.drawImage(currentBoard, 0, 0);
        cacheCtx.getImageData(0, 0, 1, 1); // test read
        canSampleBg = true;
      } catch {
        cacheCanvas = cacheCtx = null;
        canSampleBg = false;
      }

      syncCanvasAndRedraw();
      loadProblems(id);
    };

    if (currentUser && !currentUser.isAnonymous && currentUser.uid !== ownerUid) {
      SHARED_ACCESS_LEVEL = await getUserPermissionForBoard(id, currentUser.uid);
    }
    updateOwnerControls(currentUser, ownerUid);
    updateAuthUI(currentUser);
    if (currentUser && currentUser.uid === ownerUid) loadAndDisplaySharedUsers(id);
  }

  function syncCanvasAndRedraw(){
    if (!ctx || !currentBoard.naturalWidth) return;
    canvas.style.width = `${currentBoard.clientWidth}px`;
    canvas.style.height = `${currentBoard.clientHeight}px`;
    canvas.width = currentBoard.naturalWidth;
    canvas.height = currentBoard.naturalHeight;
    redraw();
  }

  async function loadProblems(bid){
    problemSelect.innerHTML = '<option value="">— Select a problem —</option>';
    const probs = await getProblemsByBoardId(bid);
    const gradeValue = (grade) => {
      if (!grade) return -1;
      const m = grade.match(/V(\d+)(\+)?/);
      if (!m) return -1;
      return parseInt(m[1], 10) + (m[2] ? 0.5 : 0);
    };
    probs.sort((a,b)=>gradeValue(a.grade)-gradeValue(b.grade)).forEach(p=>{
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.grade ? `${p.name} (${p.grade})` : p.name;
      problemSelect.append(o);
    });
  }

  let unsubscribeSharedUsers = null;
  function loadAndDisplaySharedUsers(boardId){
    unsubscribeSharedUsers?.();
    unsubscribeSharedUsers = listenForSharedUsers(boardId, (snapshot) => {
      sharedUsersList.innerHTML = '';
      if (snapshot.empty) { sharedUsersList.innerHTML = '<li>Not shared with any users.</li>'; return; }
      snapshot.forEach(doc => {
        const li = document.createElement('li');
        const emailSpan = document.createElement('span');
        emailSpan.textContent = doc.data().email;
        const revokeBtn = document.createElement('button');
        revokeBtn.textContent = 'Revoke';
        revokeBtn.onclick = async () => {
          if (confirm(`Revoke access for ${doc.data().email}?`)) await revokeAccess(boardId, doc.id);
        };
        li.append(emailSpan, revokeBtn);
        sharedUsersList.append(li);
      });
    });
  }

  problemSelect.onchange = async () => {
    const isOwner = currentUser && currentBoardData && currentUser.uid === currentBoardData.ownerUid;
    const canEdit = canEditCurrentBoard();

    editProblemBtn.classList.toggle('hidden', !(canEdit && !!problemSelect.value));
    deleteProblemBtn.classList.toggle('hidden', !(isOwner && !!problemSelect.value));

    if (problemSelect.value) {
      const ds = await getDoc(doc(db, `boards/${boardId}/problems/${problemSelect.value}`));
      const problemData = ds.data();
      holds = problemData.holds || [];
      problemGradeDisplay.textContent = problemData.grade || 'Ungraded';
      problemDescriptionText.textContent = problemData.description || '';
      problemInfoCard.classList.remove('hidden');
      redraw();
    } else {
      holds = [];
      problemInfoCard.classList.add('hidden');
      redraw();
    }
  };

  newProblemBtn.onclick = () => {
    if (!canEditCurrentBoard()) return alert('⚠️ You do not have permission to create problems on this board.');
    isEditingExistingProblem = false;
    startPlacementMode(true);
  };

  editProblemBtn.onclick = async () => {
    const problemId = problemSelect.value;
    if (!canEditCurrentBoard() || !problemId) return alert('⚠️ Sign in or enter an edit code & pick a problem first.');
    try {
      const problemDoc = await getDoc(doc(db, `boards/${boardId}/problems/${problemId}`));
      if (!problemDoc.exists()) return alert('Error: Could not find the selected problem to edit.');
      const problemData = problemDoc.data();
      problemName.value = problemData.name || '';
      problemDesc.value = problemData.description || '';
      problemGrade.value = problemData.grade || '';
      isEditingExistingProblem = true;
      startPlacementMode(false);
    } catch (e) { alert(`❌ Error preparing to edit: ${e.message}`); console.error(e); }
  };

  deleteProblemBtn.onclick = async () => {
    const problemId = problemSelect.value;
    if (!boardId || !problemId) return;
    const isOwner = currentUser && currentBoardData && currentUser.uid === currentBoardData.ownerUid;
    if (!isOwner) return alert('Only the board owner can delete problems.');
    const problemName = problemSelect.options[problemSelect.selectedIndex].text;
    if (confirm(`Are you sure you want to delete "${problemName}"?`)) {
      try {
        await deleteProblem(boardId, problemId);
        alert('✅ Problem deleted.');
        holds = []; problemInfoCard.classList.add('hidden'); redraw();
        await loadProblems(boardId);
      } catch (e) { alert(`❌ Could not delete problem: ${e.message}`); console.error(e); }
    }
  };

  holdBtns.forEach(b => {
    b.onclick = () => {
      mode = b.dataset.type;
      holdBtns.forEach(x => x.classList.toggle('active', x === b));
      canvas.style.cursor = mode === 'delete' ? 'not-allowed' : 'crosshair';
    };
  });

  canvas.onclick = e => {
    if (!boardMain.classList.contains('editing')) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top)  * (canvas.height / r.height);
    const scale = canvas.width / canvas.clientWidth;
    if (mode === 'delete') {
      let best = (12 * scale) ** 2, idx = -1;
      holds.forEach((h, i) => {
        const dx = x - h.xRatio * canvas.width;
        const dy = y - h.yRatio * canvas.height;
        const d2 = dx*dx + dy*dy;
        if (d2 < best) { best = d2; idx = i; }
      });
      if (idx >= 0) holds.splice(idx, 1);
    } else {
      holds.push({ xRatio: x / canvas.width, yRatio: y / canvas.height, type: mode });
    }
    redraw();
  };

  // ===== Pastel markers with same-hue darker ring (clean look) =====
  const SHOW_LABELS = true; // S/F/1..N labels

  function cssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function hexToRgb(hex){
    const h = hex.replace('#','').trim();
    const n = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
    const num = parseInt(n, 16);
    return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
  }
  function rgba(rgb, a){ return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`; }
  function darkenRgb(rgb, pct){
    const p = Math.max(0, Math.min(1, pct));
    return {
      r: Math.round(rgb.r * (1 - p)),
      g: Math.round(rgb.g * (1 - p)),
      b: Math.round(rgb.b * (1 - p)),
    };
  }

  function drawMarker(ctx, cx, cy, scale, colorHex, type, label){
    const baseRGB   = hexToRgb(colorHex);
    const ringRGB   = darkenRgb(baseRGB, 0.35);  // same hue, darker
    const textRGB   = darkenRgb(baseRGB, 0.55);  // darker for label
    const rBase     = (type === 'finish' ? 15 : (type === 'start' ? 14 : 13)) * scale;
    const ringW     = 5 * scale;

    const fillAlpha = (type === 'hold') ? 0.28 : 0.36; // pastel
    const ringAlpha = 1.0;

    ctx.save();

    // soft fill
    ctx.beginPath();
    ctx.arc(cx, cy, rBase, 0, Math.PI*2);
    ctx.fillStyle = rgba(baseRGB, fillAlpha);
    ctx.fill();

    // crisp same-hue ring
    ctx.beginPath();
    ctx.arc(cx, cy, rBase, 0, Math.PI*2);
    ctx.lineWidth   = ringW;
    ctx.strokeStyle = rgba(ringRGB, ringAlpha);
    ctx.stroke();

    // optional label
    if (SHOW_LABELS && label){
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const px = (type === 'hold' ? 11 : 12) * scale;
      ctx.font = `${px}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = rgba(textRGB, 0.98);
      ctx.fillText(label, cx, cy);
    }

    ctx.restore();
  }

  function redraw(){
    if(!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);

    const scale  = canvas.width / canvas.clientWidth;
    const START  = cssVar('--start-c');
    const HOLD   = cssVar('--hold-c');
    const FINISH = cssVar('--finish-c');

    let seq = 1;
    holds.forEach(h=>{
      const cx = h.xRatio * canvas.width;
      const cy = h.yRatio * canvas.height;
      const color = (h.type === 'start') ? START : (h.type === 'hold' ? HOLD : FINISH);
      const label = (h.type === 'start') ? 'S' : (h.type === 'finish') ? 'F' : String(seq++);
      drawMarker(ctx, cx, cy, scale, color, h.type, label);
    });
  }
  // ===== End markers =====

  finishDrawBtn.onclick = () => {
    if (!holds.length) return alert('⚠️ Place at least one hold.');
    exitPlacementMode();
    saveProblemBtn.textContent = isEditingExistingProblem ? 'Update' : 'Save';
    problemSheet.classList.add('visible');
  };
  cancelDrawBtn.onclick = () => { holds = []; redraw(); exitPlacementMode(); };
  cancelSheetBtn.onclick = () => { problemSheet.classList.remove('visible'); exitPlacementMode(); };

  saveProblemBtn.onclick = async () => {
    saveProblemBtn.disabled = true;
    const nm = problemName.value.trim();
    if (!nm) { alert('⚠️ Name is required.'); saveProblemBtn.disabled = false; return; }
    if (!canEditCurrentBoard()) { alert('⚠️ You do not have permission to save changes to this problem.'); saveProblemBtn.disabled = false; return; }

    try {
      const problemData = { name: nm, description: problemDesc.value.trim(), holds, grade: problemGrade.value };
      if (window.GUEST_LEVEL === 'edit' && window.GUEST_CODE) problemData.guestCode = window.GUEST_CODE;

      if (isEditingExistingProblem) {
        const problemId = problemSelect.value;
        if (!problemId) { alert('Error: Could not find problem to update.'); return; }
        await updateProblem(boardId, problemId, problemData);
        alert('✅ Problem updated!');
      } else {
        if (currentUser && !currentUser.isAnonymous) problemData.ownerUid = currentUser.uid;
        await addProblem(boardId, problemData);
        alert('✅ Problem saved!');
      }

      problemSheet.classList.remove('visible');
      await loadProblems(boardId);
      isEditingExistingProblem = false;
      problemSelect.value = '';
      problemInfoCard.classList.add('hidden');
      holds = [];
      redraw();
    } catch (e) {
      alert(`❌ ${e.message}`);
    } finally {
      saveProblemBtn.disabled = false;
    }
  };

  function startPlacementMode(isNew){
    if (isNew){
      problemSelect.value = '';
      holds = []; redraw();
      problemName.value = ''; problemDesc.value = ''; problemGrade.value = '';
    }
    boardMain.classList.add('editing');
    hdrTitle.classList.add('hidden');
    problemSelect.classList.add('hidden');
    newProblemBtn.classList.add('hidden');
    editProblemBtn.classList.add('hidden');
    deleteProblemBtn.classList.add('hidden');
    drawControls.classList.remove('hidden');
    finishDrawBtn.classList.remove('hidden');
    cancelDrawBtn.classList.remove('hidden');
    canvas.style.pointerEvents = 'auto';
    problemSheet.classList.remove('visible');
  }
  function exitPlacementMode(){
    boardMain.classList.remove('editing');
    hdrTitle.classList.remove('hidden');
    problemSelect.classList.remove('hidden');
    const canEdit = canEditCurrentBoard();
    const isOwner = currentUser && currentBoardData && currentUser.uid === currentBoardData.ownerUid;
    newProblemBtn.classList.toggle('hidden', !canEdit);
    editProblemBtn.classList.toggle('hidden', !(canEdit && !!problemSelect.value));
    deleteProblemBtn.classList.toggle('hidden', !(isOwner && !!problemSelect.value));
    drawControls.classList.add('hidden');
    finishDrawBtn.classList.add('hidden');
    cancelDrawBtn.classList.add('hidden');
    canvas.style.pointerEvents = 'none';
  }

  let resizeTimer;
  window.onresize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(syncCanvasAndRedraw, 100); };
});