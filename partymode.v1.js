// partymode.v1.js (compat + resilient IDs + clearer errors)
// Requires in partymode.html BEFORE this file:
//   <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js"></script>
// Optional (only if you want anonymous auth instead of open rules):
//   <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js"></script>
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function pickEl(ids) {
    for (const id of ids) {
      const el = $(id);
      if (el) return el;
    }
    return null;
  }

  const EL = {
    btnCreate: () => pickEl(['btnCreateRoom', 'createRoomBtn', 'btnHostCreate']),
    btnJoin:   () => pickEl(['btnJoin', 'joinBtn', 'btnJoinRoom']),
    inpName:   () => pickEl(['inpName', 'playerName', 'name', 'yourName']),
    inpCode:   () => pickEl(['inpRoomCode', 'roomCode', 'code', 'inpCode']),
    entryErr:  () => pickEl(['entryError', 'errEntry', 'entryMsg']),
    // optional labels:
    lblRoom:   () => pickEl(['lblRoomCode', 'roomCodeLabel', 'txtRoomCode', 'roomCodeText']),
  };

  const state = {
    roomCode: '',
    playerName: '',
    isHost: false,
    unsubRoom: null,
    unsubPlayers: null,
  };

  function setEntryError(msg) {
    const el = EL.entryErr();
    if (el) {
      el.textContent = msg || '';
      el.style.color = msg ? '#b00020' : '';
    }
  }

  function showView(name) {
    const views = ['viewEntry','viewLobby','viewPick','viewResult'];
    for (const v of views) {
      const el = $(v);
      if (el) el.hidden = (v !== name);
    }
  }

  function setRoomCodeLabels(code) {
    const el = EL.lblRoom();
    if (el) el.textContent = code;
  }

  function randCode(len = 4) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function ensureFirestore() {
    // Prefer window.db (if your main app exposes it), else build from firebase global.
    if (window.db) return window.db;
    if (!window.firebase || !window.firebase.firestore) {
      throw new Error('Firebase Firestore is not loaded. Check partymode.html script tags (firebase-app-compat + firebase-firestore-compat).');
    }
    // If app not initialized, try to use existing default app; otherwise user must init.
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      throw new Error('Firebase app is not initialized. You must call firebase.initializeApp(firebaseConfig) in partymode.html before loading partymode.v1.js.');
    }
    return window.firebase.firestore();
  }

  async function ensureAnonymousAuthIfAvailable() {
    // This is OPTIONAL. If firebase-auth-compat isn't loaded, we just skip.
    try {
      if (!window.firebase || !window.firebase.auth) return;
      const auth = window.firebase.auth();
      if (auth.currentUser) return;
      await auth.signInAnonymously();
      console.log('[PartyMode] signed in anonymously');
    } catch (e) {
      console.warn('[PartyMode] anonymous auth skipped/failed:', e);
    }
  }

  async function subscribeRoom(code) {
    const db = ensureFirestore();
    cleanupListeners();

    const roomRef = db.collection('rooms').doc(code);
    state.unsubRoom = roomRef.onSnapshot((snap) => {
      if (!snap.exists) return;
      // If you have lobby UI elements, update here.
      // console.log('[PartyMode] room snapshot', snap.data());
    }, (err) => {
      console.error('[PartyMode] room listener error:', err);
      setEntryError(humanFirebaseError(err));
    });

    state.unsubPlayers = roomRef.collection('players').onSnapshot((qs) => {
      // If you have a player list UI, render here.
      // console.log('[PartyMode] players', qs.docs.map(d => d.id));
    }, (err) => {
      console.error('[PartyMode] players listener error:', err);
      setEntryError(humanFirebaseError(err));
    });
  }

  function cleanupListeners() {
    if (state.unsubRoom) { state.unsubRoom(); state.unsubRoom = null; }
    if (state.unsubPlayers) { state.unsubPlayers(); state.unsubPlayers = null; }
  }

  function humanFirebaseError(err) {
    const msg = err?.message || String(err);
    if (String(err?.code || '').includes('permission-denied') || msg.includes('permission')) {
      return 'Firestore permission denied. Fix Firestore Rules (test mode) OR enable Auth (anonymous) before using Party Mode.';
    }
    if (msg.toLowerCase().includes('offline') || msg.toLowerCase().includes('unavailable')) {
      return 'Firestore appears offline/unreachable. Check network, adblockers, and that Firestore is enabled for this project.';
    }
    return msg;
  }

  async function createRoom() {
    setEntryError('');
    console.log('[PartyMode] createRoom() clicked');

    const nameEl = EL.inpName();
    if (!nameEl) {
      setEntryError('Name input not found. Check partymode.html input id (expected inpName).');
      console.error('[PartyMode] inpName element missing');
      return;
    }
    const name = (nameEl.value || '').trim();
    if (!name) {
      setEntryError('Please enter your name first.');
      nameEl.focus();
      return;
    }

    await ensureAnonymousAuthIfAvailable();

    const db = ensureFirestore();

    // Generate room code, try a few times if collision
    let code = null;
    for (let i = 0; i < 10; i++) {
      const c = randCode(4);
      const ref = db.collection('rooms').doc(c);
      const snap = await ref.get();
      if (!snap.exists) { code = c; break; }
    }
    if (!code) {
      const m = 'Could not generate a unique room code. Try again.';
      setEntryError(m);
      throw new Error(m);
    }

    state.roomCode = code;
    state.playerName = name;
    state.isHost = true;
    setRoomCodeLabels(code);

    const roomRef = db.collection('rooms').doc(code);
    const now = window.firebase?.firestore?.FieldValue?.serverTimestamp
      ? window.firebase.firestore.FieldValue.serverTimestamp()
      : new Date();

    try {
      await roomRef.set({
        createdAt: now,
        host: name,
        status: 'lobby',
        game: 'pb',
      }, { merge: true });

      await roomRef.collection('players').doc(name).set({
        name,
        isHost: true,
        joinedAt: now,
        submitted: false,
      }, { merge: true });

      console.log('[PartyMode] room created:', code);
      // optional: reflect in URL for sharing
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('room', code);
        window.history.replaceState({}, '', url.toString());
      } catch {}
      showView('viewLobby');
      await subscribeRoom(code);

      // If no lobby UI exists, at least show the code:
      alert('Room created! Code: ' + code + '\nShare: partymode.html?room=' + code);

    } catch (err) {
      console.error('[PartyMode] createRoom error:', err);
      const m = humanFirebaseError(err);
      setEntryError(m);
      alert('Create room failed: ' + m);
    }
  }

  async function joinRoom() {
    setEntryError('');
    console.log('[PartyMode] joinRoom() clicked');

    const codeEl = EL.inpCode();
    const nameEl = EL.inpName();
    if (!codeEl) { setEntryError('Room code input not found (expected inpRoomCode).'); return; }
    if (!nameEl) { setEntryError('Name input not found (expected inpName).'); return; }

    const code = (codeEl.value || '').trim().toUpperCase();
    const name = (nameEl.value || '').trim();
    if (!code) { setEntryError('Please enter a room code.'); codeEl.focus(); return; }
    if (!name) { setEntryError('Please enter your name.'); nameEl.focus(); return; }

    await ensureAnonymousAuthIfAvailable();

    const db = ensureFirestore();
    const roomRef = db.collection('rooms').doc(code);

    try {
      const snap = await roomRef.get();
      if (!snap.exists) { setEntryError('Room not found. Check the code and try again.'); return; }

      state.roomCode = code;
      state.playerName = name;
      state.isHost = false;
      setRoomCodeLabels(code);

      const now = window.firebase?.firestore?.FieldValue?.serverTimestamp
        ? window.firebase.firestore.FieldValue.serverTimestamp()
        : new Date();

      await roomRef.collection('players').doc(name).set({
        name,
        isHost: false,
        joinedAt: now,
        submitted: false,
      }, { merge: true });

      console.log('[PartyMode] joined room:', code);
      showView('viewLobby');
      await subscribeRoom(code);

    } catch (err) {
      console.error('[PartyMode] joinRoom error:', err);
      const m = humanFirebaseError(err);
      setEntryError(m);
      alert('Join room failed: ' + m);
    }
  }

  function bindUI() {
    const bCreate = EL.btnCreate();
    const bJoin = EL.btnJoin();

    if (bCreate) bCreate.addEventListener('click', () => createRoom());
    else console.warn('[PartyMode] btnCreateRoom not found');

    if (bJoin) bJoin.addEventListener('click', () => joinRoom());
    else console.warn('[PartyMode] btnJoin not found');

    // If URL has ?room=XXXX, prefill + auto focus
    try {
      const url = new URL(window.location.href);
      const code = (url.searchParams.get('room') || '').trim().toUpperCase();
      if (code && EL.inpCode()) EL.inpCode().value = code;
    } catch {}
  }

  function boot() {
    console.log('[PartyMode] script loaded at', new Date().toISOString());

    // sanity logs
    try {
      if (window.firebase?.apps?.length) {
        console.log('[PartyMode] firebase projectId =', window.firebase.app().options.projectId);
      } else {
        console.warn('[PartyMode] firebase app not initialized yet');
      }
      if (window.db) console.log('[PartyMode] window.db exists');
    } catch (e) {
      console.warn('[PartyMode] firebase probe failed', e);
    }

    bindUI();
    showView('viewEntry');
    console.log('[PartyMode] UI ready ✅');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
