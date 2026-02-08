// partymode.v1.js (universal, compat-first)
// - Works with firebase-app-compat.js + firebase-firestore-compat.js
// - Tolerates different element IDs by searching common IDs + placeholders
// - Gives clear UI feedback on errors (permission denied / offline / missing db)

(() => {
  'use strict';

  const log = (...a) => console.log('[PartyMode]', ...a);
  const warn = (...a) => console.warn('[PartyMode]', ...a);
  const err  = (...a) => console.error('[PartyMode]', ...a);

  const $id = (id) => document.getElementById(id);

  function pickById(ids) {
    for (const id of ids) {
      const el = $id(id);
      if (el) return el;
    }
    return null;
  }

  function pickInputByPlaceholder(substring) {
    const inputs = Array.from(document.querySelectorAll('input'));
    const low = substring.toLowerCase();
    for (const el of inputs) {
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      if (ph.includes(low)) return el;
    }
    return null;
  }

  function ensureMsgArea() {
    // Prefer explicit ids; else create one under entry panel
    let el = pickById(['msgEntry', 'msg', 'entryMsg', 'statusMsg', 'errorMsg']);
    if (el) return el;

    const entry = pickById(['viewEntry', 'entry', 'panelEntry']) || document.body;
    const micro = entry.querySelector('.micro') || entry;
    el = document.createElement('div');
    el.id = 'msgEntry';
    el.style.marginTop = '10px';
    el.style.color = '#b00020';
    micro.appendChild(el);
    return el;
  }

  const msgEl = ensureMsgArea();

  function setMsg(message, isError = true) {
    if (!msgEl) return;
    msgEl.textContent = message || '';
    msgEl.style.color = isError ? '#b00020' : '#006400';
  }

  function showView(name) {
    const ids = ['viewEntry', 'viewLobby', 'viewPick', 'viewResult'];
    for (const id of ids) {
      const el = $id(id);
      if (el) el.hidden = (id !== name);
    }
  }

  function randCode(len = 4) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function getDb() {
    // Priority: window.db (set by your existing app), then window.EMOJIPICK_DB, then firebase.firestore()
    const w = window;
    if (w.EMOJIPICK_DB) return w.EMOJIPICK_DB;
    if (w.db) return w.db;
    if (w.firebase && typeof w.firebase.firestore === 'function') {
      try {
        const db = w.firebase.firestore();
        w.db = db;
        return db;
      } catch (e) {
        err('firebase.firestore() failed', e);
      }
    }
    return null;
  }

  function isOfflineLike(e) {
    const m = String((e && e.message) || e || '').toLowerCase();
    return m.includes('offline') || m.includes('failed to get document because the client is offline') || m.includes('could not reach cloud firestore backend');
  }

  function isPermissionDenied(e) {
    const code = e && (e.code || (e.name === 'FirebaseError' && e.code));
    if (code === 'permission-denied') return true;
    const m = String((e && e.message) || e || '').toLowerCase();
    return m.includes('permission-denied') || m.includes('permission denied');
  }

  async function createRoom() {
    log('createRoom() clicked');
    setMsg('');

    const db = getDb();
    if (!db || typeof db.collection !== 'function') {
      setMsg('Firebase Firestore(db)가 준비되지 않았습니다. partymode.html에서 firebase.initializeApp(...) 후 window.db = firebase.firestore() 가 되었는지 확인하세요.');
      return;
    }

    const nameInput = pickById(['inpName', 'yourName', 'joinName', 'playerName', 'inpUserName', 'inpYourName']) || pickInputByPlaceholder('your name');
    const hostName = (nameInput && nameInput.value ? nameInput.value.trim() : '');

    if (!hostName) {
      setMsg('Please enter your name first.');
      if (nameInput) nameInput.focus();
      return;
    }

    const roomCode = randCode(4);

    try {
      // Deterministic doc id = roomCode (easier to join)
      await db.collection('rooms').doc(roomCode).set({
        code: roomCode,
        hostName,
        createdAt: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue)
          ? window.firebase.firestore.FieldValue.serverTimestamp()
          : new Date(),
        status: 'lobby',
        members: 1
      }, { merge: true });

      setMsg(`Room created: ${roomCode}`, false);

      // Best-effort UI update
      const codeInput = pickById(['inpCode', 'inpRoomCode', 'roomCode', 'joinCode', 'inpRoom', 'inpRoomId']) || pickInputByPlaceholder('room code');
      if (codeInput) codeInput.value = roomCode;

      // If lobby view exists and has placeholders, fill them
      const lblRoom = pickById(['lblRoomCode', 'txtRoomCode', 'roomCodeText', 'roomCodeLabel']);
      if (lblRoom) lblRoom.textContent = roomCode;

      showView('viewLobby');
      alert(`Room created!\n\nRoom code: ${roomCode}\n\nShare link:\n${location.origin}${location.pathname}?room=${roomCode}`);
    } catch (e) {
      err('createRoom failed', e);

      if (isPermissionDenied(e)) {
        setMsg('Firestore 권한( rules ) 때문에 방을 만들 수 없습니다. Firestore Rules에서 rooms 컬렉션 write를 임시로 허용하거나(테스트용), 인증(예: 익명 로그인)을 맞춰야 합니다.');
        return;
      }
      if (isOfflineLike(e)) {
        setMsg('Firestore에 연결하지 못했습니다(offline처럼 동작). 브라우저에서 googleapis/gstatic 차단(확장프로그램/보안SW) 여부와 네트워크를 확인하세요.');
        return;
      }
      setMsg(`Create room failed: ${e && e.message ? e.message : e}`);
    }
  }

  async function joinRoom() {
    log('joinRoom() clicked');
    setMsg('');

    const db = getDb();
    if (!db || typeof db.collection !== 'function') {
      setMsg('Firebase Firestore(db)가 준비되지 않았습니다. partymode.html에서 firebase.initializeApp(...) 후 window.db = firebase.firestore() 가 되었는지 확인하세요.');
      return;
    }

    const codeInput = pickById(['inpCode', 'inpRoomCode', 'roomCode', 'joinCode', 'inpRoom', 'inpRoomId']) || pickInputByPlaceholder('room code');
    const nameInput = pickById(['inpName', 'yourName', 'joinName', 'playerName', 'inpUserName', 'inpYourName']) || pickInputByPlaceholder('your name');

    const roomCode = (codeInput && codeInput.value ? codeInput.value.trim().toUpperCase() : '');
    const yourName = (nameInput && nameInput.value ? nameInput.value.trim() : '');

    if (!yourName) {
      setMsg('Please enter your name first.');
      if (nameInput) nameInput.focus();
      return;
    }
    if (!roomCode) {
      setMsg('Please enter a room code.');
      if (codeInput) codeInput.focus();
      return;
    }

    try {
      const snap = await db.collection('rooms').doc(roomCode).get();
      if (!snap.exists) {
        setMsg('Room not found. Check the room code.');
        return;
      }

      // optional: add member
      await db.collection('rooms').doc(roomCode).collection('players').doc(yourName).set({
        name: yourName,
        joinedAt: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue)
          ? window.firebase.firestore.FieldValue.serverTimestamp()
          : new Date()
      }, { merge: true });

      setMsg(`Joined room: ${roomCode}`, false);
      showView('viewLobby');
    } catch (e) {
      err('joinRoom failed', e);

      if (isPermissionDenied(e)) {
        setMsg('Firestore 권한( rules ) 때문에 방에 들어갈 수 없습니다. Firestore Rules에서 rooms/players read/write를 임시로 허용하거나 인증을 맞춰야 합니다.');
        return;
      }
      if (isOfflineLike(e)) {
        setMsg('Firestore에 연결하지 못했습니다(offline처럼 동작). 브라우저에서 googleapis/gstatic 차단(확장프로그램/보안SW) 여부와 네트워크를 확인하세요.');
        return;
      }
      setMsg(`Join room failed: ${e && e.message ? e.message : e}`);
    }
  }

  function bindUI() {
    const btnCreate = pickById(['btnCreateRoom', 'btnCreate', 'createRoomBtn']);
    const btnJoin   = pickById(['btnJoin', 'btnJoinRoom', 'joinBtn']);

    if (btnCreate) btnCreate.addEventListener('click', createRoom);
    else warn('Create button not found');

    if (btnJoin) btnJoin.addEventListener('click', joinRoom);
    else warn('Join button not found');

    // year footer if present
    const y = $id('year');
    if (y) y.textContent = String(new Date().getFullYear());

    log('UI ready');
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUI);
  } else {
    bindUI();
  }

  // expose for manual testing
  window.__PartyMode__ = { createRoom, joinRoom, getDb };
})();
