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
  shareBoardWithUser,
  listenForOwnedBoards,
  listenForSharedBoards,
  listenForSharedUsers, // This is for the owner's management view
  revokeAccess

} from './firebase/firestore.js';
import { getUserPermissionForBoard } from './firebase/firestore.js';
import { problemsCol } from './firebase/firestore.js';
import { addAccessCode } from './firebase/firestore.js';
import { DOM } from './ui.js';

// — Guest‐access globals —
window.GUEST_CODE = null;
window.GUEST_LEVEL = null;
window.GUEST_BOARD_ID = null;
window.GUEST_BOARD_NAME = null;

let SHARED_ACCESS_LEVEL = null;
let firstLoad = false; // To prevent auto-loading a board more than once

window.addEventListener('DOMContentLoaded', () => {
  // Pull in all your UI elements
  const {
    menuBtn, boardsPanel,
    fileInput, fileStatus,
    boardsList,
    authPanel, emailInput, passwordInput, authDescription,
    loginBtn, signOutBtn, uploadControls, userAccessControls, sharedUsersList,
    hdrTitle,
    boardMain, welcomeMessage, boardContainer, currentBoard, canvas, problemDescription, deleteProblemBtn,
    boardOwnerControls, generateReadCodeBtn, generateEditCodeBtn,
    problemSelect, newProblemBtn, editProblemBtn,
    drawControls, finishDrawBtn, cancelDrawBtn,
    problemSheet, cancelSheetBtn, saveProblemBtn, problemGrade,
    problemName, problemDesc,
    holdBtns, guestCodeBtn
  } = DOM;

  let isEditingExistingProblem = false;
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
  let unsubscribeOwned = null;
  let unsubscribeShared = null;
  
  onAuthStateChanged(auth, async user => {
    const wasGuestWithCode = !!window.GUEST_CODE;
    const guestBoardId = window.GUEST_BOARD_ID;
    const guestBoardName = window.GUEST_BOARD_NAME;

    currentUser = user;
    updateAuthUI(user);
    // Re-evaluate owner controls if a board is loaded
    if (currentBoardData) {
      updateOwnerControls(user, currentBoardData.ownerUid);
    }

    // Guest-to-User Promotion Logic
    if (user && !user.isAnonymous && wasGuestWithCode && guestBoardId) {
        try {
            // Pass the guest code and access level to be validated by security rules
            await shareBoardWithUser(guestBoardId, guestBoardName, user.uid, user.email, window.GUEST_LEVEL, window.GUEST_CODE);
            alert(`Access to "${guestBoardName}" has been saved to your new account!`);
            // Clear guest state
            window.GUEST_CODE = null;
            window.GUEST_LEVEL = null;
            window.GUEST_BOARD_ID = null;
            window.GUEST_BOARD_NAME = null;
        } catch (e) {
            console.error("Error promoting guest to user:", e);
            alert("Could not save board access to your new account.");
        }
    }

    if (user) {
      // If user is logged in, start listening for boards.
      listenForUserBoards(user.uid);
    } else {
      // User signed out or is a guest
      firstLoad = false; // Reset on sign out
      if (unsubscribeOwned) {
        unsubscribeOwned();
        unsubscribeOwned = null;
      }
      if (unsubscribeShared) {
        unsubscribeShared();
        unsubscribeShared = null;
      }
      boardsList.innerHTML = '';
      // Reset view to welcome message
      welcomeMessage.classList.remove('hidden');
      boardContainer.classList.add('hidden');
      problemDescription.classList.add('hidden');
      problemSelect.innerHTML = '<option value="">— Select a problem —</option>';
      holds = [];
      redraw();
    }
  });

  function canEditCurrentBoard() {
    // If not logged in, rely on temporary guest level
    if (!currentUser || currentUser.isAnonymous) {
      return window.GUEST_LEVEL === 'edit';
    }
    // If logged in, check for ownership first
    if (currentBoardData && currentUser.uid === currentBoardData.ownerUid) {
      return true;
    }
    // Otherwise, check for persistent shared access level
    return SHARED_ACCESS_LEVEL === 'edit';
  }

  function updateAuthUI(user) {
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

      const newBoardData = {
        name: boardName,
        imageUrl: url,
        timestamp: serverTimestamp(),
        ownerUid: u.uid
      };
      const newDocRef = await addDoc(collection(db, 'boards'), newBoardData);

      fileStatus.textContent = '✅ Saved';

      // Automatically load the new board
      loadBoard(newDocRef.id, newBoardData);

      // Close the sidebar to show the new board
      boardsPanel.classList.remove('open');
    } catch (e) {
      fileStatus.textContent = `❌ ${e.message}`;
    }
  };

  // 7️⃣ Real‐time boards list & auto‐load
  function listenForUserBoards(userId) {
    if (unsubscribeOwned) return; // Already listening

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
    const ownedList = document.getElementById('ownedBoardsList');
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
        // The sharedBoards collection on the user only has a reference.
        // We need to fetch the full board document.
        const boardDoc = await getDoc(doc(db, 'boards', boardData.boardId));
        if (boardDoc.exists()) {
          boardDocs.push(boardDoc);
        }
      }
      renderBoardList(sharedList, boardDocs);
    });
  }

  function renderBoardList(listElement, boardDocs) {
    listElement.innerHTML = '';
    if (boardDocs.length === 0) {
      listElement.innerHTML = '<li>None yet.</li>';
      return;
    }
    boardDocs.forEach(d => {
      const li = document.createElement('li');
      li.textContent = d.data().name || d.id;
      li.onclick = () => loadBoard(d.id, d.data());
      listElement.append(li);
    });
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
      const boardData = boardDoc.data();

      // Load the board
      loadBoard(boardId, boardData);

      // If a user is already logged in, save this board access to their account.
      if (currentUser && !currentUser.isAnonymous) {
        // Don't save if they are the owner
        if (currentUser.uid !== boardData.ownerUid) {
          await shareBoardWithUser(boardId, boardData.name, currentUser.uid, currentUser.email, accessLevel, code.trim());
          alert(`Access to "${boardData.name}" has been saved to your account.`);
        }
      } else {
        // Set guest level and alert user
        window.GUEST_CODE = code.trim();
        window.GUEST_LEVEL = accessLevel;
        window.GUEST_BOARD_ID = boardId;
        window.GUEST_BOARD_NAME = boardData.name;
        alert(`Access granted to board "${boardData.name}" with ${accessLevel} permissions.`);
      }

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
    userAccessControls.classList.toggle('hidden', !isOwner);
  }

  // 1️⃣0️⃣ Board + Problems
  let ctx, boardId, holds = [], mode = 'start';

  async function loadBoard(id, boardData) {
    boardId = id;
    currentBoardData = boardData;
    // Reset all permissions for the new board
    SHARED_ACCESS_LEVEL = null;
    window.GUEST_LEVEL = null;
    window.GUEST_CODE = null;

    const { imageUrl, ownerUid } = boardData;
    welcomeMessage.classList.add('hidden');
    boardContainer.classList.remove('hidden');
    holds = [];
    exitPlacementMode();
    currentBoard.src = imageUrl;
    currentBoard.onload = () => {
      if (!ctx) {
        ctx = canvas.getContext('2d');
      }
      syncCanvasAndRedraw(); // Perform initial sync
      loadProblems(id);
    };

    // If the current user is logged in but is NOT the owner, check for shared permissions.
    if (currentUser && !currentUser.isAnonymous && currentUser.uid !== ownerUid) {
        SHARED_ACCESS_LEVEL = await getUserPermissionForBoard(id, currentUser.uid);
    }

    updateOwnerControls(currentUser, ownerUid);
    updateAuthUI(currentUser); // Call this to update buttons based on new permissions

    if (currentUser && currentUser.uid === ownerUid) {
      loadAndDisplaySharedUsers(id);
    }
  }

  /**
   * Keeps the canvas overlay perfectly aligned with the board image,
   * and redraws the holds. This is crucial for responsiveness.
   */
  function syncCanvasAndRedraw() {
    if (!ctx || !currentBoard.naturalWidth) {
      // Abort if we don't have a canvas context or the image metadata isn't ready.
      return;
    }
    // Match canvas rendering dimensions to the image's current display size.
    canvas.style.width = `${currentBoard.clientWidth}px`;
    canvas.style.height = `${currentBoard.clientHeight}px`;

    // Match canvas drawing buffer to the image's native resolution for clarity.
    canvas.width = currentBoard.naturalWidth;
    canvas.height = currentBoard.naturalHeight;

    redraw(); // Redraw holds with the new, correct dimensions.
  }

  async function loadProblems(bid) {
    problemSelect.innerHTML = '<option value="">— Select a problem —</option>';
    const probs = await getProblemsByBoardId(bid);
  
    // Helper function for grade sorting
    const gradeValue = (grade) => {
      if (!grade) return -1; // Problems with no grade go to the end
      const match = grade.match(/V(\d+)(\+)?/);
      if (!match) return -1;
      return parseInt(match[1], 10) + (match[2] ? 0.5 : 0);
    };
  
    probs.sort((a, b) => gradeValue(a.grade) - gradeValue(b.grade)).forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.grade ? `${p.name} (${p.grade})` : p.name;
      problemSelect.append(o);
    });
  }

  let unsubscribeSharedUsers = null;
  function loadAndDisplaySharedUsers(boardId) {
    if (unsubscribeSharedUsers) unsubscribeSharedUsers();

    unsubscribeSharedUsers = listenForSharedUsers(boardId, (snapshot) => {
      sharedUsersList.innerHTML = '';
      if (snapshot.empty) {
        sharedUsersList.innerHTML = '<li>Not shared with any users.</li>';
        return;
      }
      snapshot.forEach(doc => {
        const li = document.createElement('li');
        li.textContent = doc.data().email;
        const revokeBtn = document.createElement('button');
        revokeBtn.textContent = 'Revoke';
        revokeBtn.onclick = async () => {
          if (confirm(`Revoke access for ${doc.data().email}?`)) {
            await revokeAccess(boardId, doc.id);
          }
        };
        li.append(revokeBtn);
        sharedUsersList.append(li);
      });
    });
  }

  // 1️⃣1️⃣ Problem selection / New / Edit
  problemSelect.onchange = async () => {
    const isOwner = currentUser && currentBoardData && currentUser.uid === currentBoardData.ownerUid;
    const canEdit = canEditCurrentBoard();

    editProblemBtn.classList.toggle('hidden', !(canEdit && !!problemSelect.value));
    deleteProblemBtn.classList.toggle('hidden', !(isOwner && !!problemSelect.value));

    if (problemSelect.value) {
      // A problem was selected, load its holds
      const ds = await getDoc(doc(db, `boards/${boardId}/problems/${problemSelect.value}`));
      const problemData = ds.data();
      holds = problemData.holds || [];
      problemDescription.textContent = problemData.description || '';
      // Show the description card only if there is text for it
      problemDescription.classList.toggle('hidden', !problemData.description);
      redraw();
    } else {
      // The "Select a problem" placeholder was chosen, so clear any visible holds
      holds = [];
      // And hide the description
      problemDescription.textContent = '';
      problemDescription.classList.add('hidden');
      redraw();
    }
  };

  newProblemBtn.onclick = () => {
    if (!canEditCurrentBoard()) {
      return alert('⚠️ You do not have permission to create problems on this board.');
    }
    isEditingExistingProblem = false; // This is a new problem
    startPlacementMode(true);
  };

  editProblemBtn.onclick = async () => {
    const problemId = problemSelect.value;

    if (!canEditCurrentBoard() || !problemId) {
      return alert('⚠️ Sign in or enter an edit code & pick a problem first.');
    }

    try {
        // Fetch the existing problem data to pre-fill the form for later
        const problemDoc = await getDoc(doc(db, `boards/${boardId}/problems/${problemId}`));
        if (!problemDoc.exists()) {
            return alert('Error: Could not find the selected problem to edit.');
        }
        const problemData = problemDoc.data();

        // Pre-populate the form fields that will be in the sheet.
        // The holds are already on the canvas from the 'onchange' event.
        problemName.value = problemData.name || '';
        problemDesc.value = problemData.description || '';
        problemGrade.value = problemData.grade || '';

        // Set the state to indicate we are editing, then enter drawing mode.
        isEditingExistingProblem = true;
        startPlacementMode(false); // 'false' means don't clear holds/form

    } catch (e) {
        alert(`❌ Error preparing to edit: ${e.message}`);
        console.error(e);
    }
  };

  deleteProblemBtn.onclick = async () => {
    const problemId = problemSelect.value;
    if (!boardId || !problemId) return;

    // Double-check ownership client-side before showing prompt
    const isOwner = currentUser && currentBoardData && currentUser.uid === currentBoardData.ownerUid;
    if (!isOwner) {
      return alert('Only the board owner can delete problems.');
    }

    const problemName = problemSelect.options[problemSelect.selectedIndex].text;
    if (confirm(`Are you sure you want to delete "${problemName}"?`)) {
      try {
        await deleteProblem(boardId, problemId);
        alert('✅ Problem deleted.');

        // Clear the canvas and description immediately
        holds = [];
        redraw();
        problemDescription.textContent = '';
        problemDescription.classList.add('hidden');

        // Reload the problem list to reflect the deletion
        await loadProblems(boardId);
      } catch (e) {
        alert(`❌ Could not delete problem: ${e.message}`);
        console.error(e);
      }
    }
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
    // Change button text based on whether we're creating or updating
    saveProblemBtn.textContent = isEditingExistingProblem ? 'Update' : 'Save';
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

    if (!canEditCurrentBoard()) {
      alert('⚠️ You do not have permission to save changes to this problem.');
      saveProblemBtn.disabled = false;
      return;
    }

    try {
      const problemData = {
        name: nm,
        description: problemDesc.value.trim(),
        holds, // This holds the holds from either a new drawing session or loaded from an existing problem
        grade: problemGrade.value
      };

      // If guest, pass code for validation in security rules
      if (window.GUEST_LEVEL === 'edit' && window.GUEST_CODE) {
        problemData.guestCode = window.GUEST_CODE;
      }

      if (isEditingExistingProblem) {
        const problemId = problemSelect.value;
        if (!problemId) {
            alert('Error: Could not find problem to update.');
            return;
        }
        await updateProblem(boardId, problemId, problemData);
        alert('✅ Problem updated!');
      } else {
        if (currentUser && !currentUser.isAnonymous) {
          problemData.ownerUid = currentUser.uid;
        }
        await addProblem(boardId, problemData);
        alert('✅ Problem saved!');
      }
      
      problemSheet.classList.remove('visible');
      await loadProblems(boardId); // Refresh the list
      
      // Reset state
      isEditingExistingProblem = false;
      problemSelect.value = ''; // Clear selection
      holds = [];
      redraw();
      problemDescription.classList.add('hidden');
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
    deleteProblemBtn.classList.add('hidden');
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
    const canEdit = canEditCurrentBoard();
    const isOwner = currentUser && currentBoardData && currentUser.uid === currentBoardData.ownerUid;
    newProblemBtn.classList.toggle('hidden', !canEdit);
    editProblemBtn.classList.toggle('hidden', !(canEdit && !!problemSelect.value));
    deleteProblemBtn.classList.toggle('hidden', !(isOwner && !!problemSelect.value));
    drawControls.classList.add('hidden');
    finishDrawBtn.classList.add('hidden');
    cancelDrawBtn.classList.add('hidden');
    canvas.style.pointerEvents='none';
  }

  // Debounced resize handler to keep the canvas and image in sync.
  let resizeTimer;
  window.onresize = () => {
    clearTimeout(resizeTimer);
    // The timeout prevents the function from running too often during a resize.
    resizeTimer = setTimeout(syncCanvasAndRedraw, 100);
  };
});