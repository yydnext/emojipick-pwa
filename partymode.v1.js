// partymode.v1.js (universal)
// Works with firebase-app-compat.js + firebase-firestore-compat.js loaded in partymode.html

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function setYear() {
    const el = $('year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function showView(name) {
    const views = ['viewEntry', 'viewLobby', 'viewPick', 'viewResult'];
    for (const v of views) {
      const el = $(v);
      if (el) el.hidden = (v !== name);
    }
  }

  function randCode(len = 4) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function log(...args) {
    console.log('[PartyMode]', ...args);
  }

  function ensureMsgArea() {
    // try to reuse existing "micro" div in viewEntry, otherwise create one
    const entry = $('viewEntry') || document.body;
    let micro = entry.querySelector('.micro');
    if (!micro) {
      micro = document.createElement('div');
      micro.className = 'micro';
      micro.style.marginTop = '10px';
      entry.appendChild(micro);
    }
    return micro;
  }

  const msgEl = ensureMsgArea();

  function setMsg(text, isError = true) {
    if (!msgEl) return;
    msgEl.innerHTML = text ? `<span style="color:${isError ? 'crimson' : 'inherit'}">${escapeHtml(text)}</span>` : '';
  }

  function getDb() {
    // Prefer explicitly exposed db
    if (window.EMOJIPICK_DB) return window.EMOJIPICK_DB;
    if (window.db) return window.db;

    // If only firebase compat exists, try to create firestore
    if (window.firebase && window.firebase.firestore) {
      try {
        return window.firebase.firestore();
      } catch (e) {
        console.error('[PartyMode] firebase.firestore() failed:', e);
      }
    }
    return null;
  }

  function pickById(ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  async function createRoom() {
    log('createRoom() clicked');

    try {
      const db = getDb();
      if (!db) {
        setMsg('Firebase db not ready. Check window.db / window.EMOJIPICK_DB.');
        console.error('[PartyMode] db not found. window.db:', window.db, 'window.EMOJIPICK_DB:', window.EMOJIPICK_DB);
        return;
      }

      // Pick the most reliable "name" input:
      // 1) any input that already has a non-empty value (often the one the user actually typed in)
      // 2) common ids
      // 3) placeholder match (contains "name")
      const allInputs = Array.from(document.querySelectorAll('input'));
      const typedInput = allInputs.find(i => (i.value || '').trim().length > 0);

      const nameInput =
        typedInput ||
        pickById(['inpName','yourName','joinName','playerName','inpUserName','inpYourName','name','userName','username']) ||
        allInputs.find(i => ((i.placeholder || '').toLowerCase().includes('name')));

      const hostName = (nameInput && nameInput.value ? nameInput.value.trim() : '');
      log('createRoom() using name input:', { id: nameInput && nameInput.id, placeholder: nameInput && nameInput.placeholder, value: hostName });

      if (!hostName) {
        setMsg('Please enter your name first.');
        if (nameInput) nameInput.focus();
        return;
      }

      setMsg(''); // clear error

      const roomCode = randCode(4);
      const now = Date.now();

      log('createRoom() writing room doc', roomCode);
      await db.collection('rooms').doc(roomCode).set({
        createdAt: now,
        hostName,
        status: 'lobby',
        picks: {},
      });

      log('createRoom() success, room created', roomCode);

      // reflect on UI if there is a lobby view (optional)
      const lobby = $('viewLobby');
      if (lobby) {
        lobby.innerHTML = `
          <div class="h2">Room Created</div>
          <div class="muted" style="margin-top:6px;">Share this code:</div>
          <div style="font-size:28px; font-weight:900; letter-spacing:2px; margin-top:6px;">${escapeHtml(roomCode)}</div>
          <div class="divider"></div>
          <div class="muted">Tip: Open on another phone:</div>
          <div style="margin-top:6px;"><code>partymode.html?room=${escapeHtml(roomCode)}</code></div>
        `;
      }

      alert(`Room created: ${roomCode}`);
      showView('viewLobby');

    } catch (err) {
      console.error('[PartyMode] createRoom error:', err);
      setMsg(String(err && err.message ? err.message : err));
      alert('Create room failed: ' + (err && err.message ? err.message : err));
    }
  }

  async function joinRoom() {
    log('joinRoom() clicked');

    try {
      const db = getDb();
      if (!db) {
        setMsg('Firebase db not ready. Check window.db / window.EMOJIPICK_DB.');
        console.error('[PartyMode] db not found. window.db:', window.db, 'window.EMOJIPICK_DB:', window.EMOJIPICK_DB);
        return;
      }

      const roomInput = pickById(['inpRoom', 'roomCode', 'inpCode', 'joinCode']) || document.querySelector('input[placeholder*="Room code"], input[placeholder*="room code"]');
      const nameInput =
        Array.from(document.querySelectorAll('input')).find(i => (i.value || '').trim().length > 0) ||
        pickById(['inpName','yourName','joinName','playerName','inpUserName','inpYourName','name','userName','username']) ||
        document.querySelector('input[placeholder*="Your name"], input[placeholder*="your name"], input[placeholder*="name"]');

      const roomCode = (roomInput && roomInput.value ? roomInput.value.trim().toUpperCase() : '');
      const userName = (nameInput && nameInput.value ? nameInput.value.trim() : '');

      if (!userName) {
        setMsg('Please enter your name first.');
        if (nameInput) nameInput.focus();
        return;
      }
      if (!roomCode) {
        setMsg('Please enter a room code.');
        if (roomInput) roomInput.focus();
        return;
      }

      setMsg('');

      const snap = await db.collection('rooms').doc(roomCode).get();
      if (!snap.exists) {
        setMsg('Room not found. Check the code.');
        return;
      }

      alert(`Joined room: ${roomCode} as ${userName}`);
      showView('viewLobby');

    } catch (err) {
      console.error('[PartyMode] joinRoom error:', err);
      setMsg(String(err && err.message ? err.message : err));
      alert('Join room failed: ' + (err && err.message ? err.message : err));
    }
  }

  function bindUI() {
    setYear();
    setMsg('');

    const btnCreate = $('btnCreateRoom') || document.querySelector('button#btnCreateRoom, button[data-action="createRoom"]');
    const btnJoin = $('btnJoin') || document.querySelector('button#btnJoin, button[data-action="joinRoom"]');

    if (btnCreate) btnCreate.addEventListener('click', createRoom);
    if (btnJoin) btnJoin.addEventListener('click', joinRoom);

    log('UI ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUI);
  } else {
    bindUI();
  }
})();
