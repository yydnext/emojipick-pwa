// partymode.v1.js (compat-only)
// Requires:
//   https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js
//   https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js
//
// This file is SELF-CONTAINED:
// - If firebase is not initialized yet, it will initialize using global `firebaseConfig` (if present).
// - It will expose `window.db` (Firestore) for other scripts.
// - It logs key steps so you can verify clicks/Firestore writes in DevTools.
//
// Notes:
// - This file intentionally uses ONLY Firestore "compat" API (db.collection(...)).

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ---------- Small UI helpers ----------
  function ensureInlineErrorBox() {
    let el = $('errEntry');
    if (!el) {
      // Create a small error box under the buttons if it doesn't exist.
      const host = $('viewEntry') || document.body;
      el = document.createElement('div');
      el.id = 'errEntry';
      el.style.marginTop = '10px';
      el.style.fontSize = '12px';
      el.style.color = '#b00020';
      el.style.whiteSpace = 'pre-wrap';
      el.hidden = true;
      host.appendChild(el);
    }
    return el;
  }

  function setEntryError(msg) {
    const el = ensureInlineErrorBox();
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = String(msg);
  }

  function showView(name) {
    const views = ['viewEntry', 'viewLobby', 'viewPick', 'viewResult'];
    for (const v of views) {
      const el = $(v);
      if (el) el.hidden = (v !== name);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function randCode(len = 4) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  // ---------- Firebase bootstrap (compat) ----------
  function ensureFirestore() {
    if (!window.firebase || !window.firebase.firestore) {
      throw new Error(
        'Firebase compat scripts are not loaded. ' +
        'Make sure firebase-app-compat.js and firebase-firestore-compat.js are included before partymode.v1.js.'
      );
    }

    // Initialize app if needed (ONLY if firebaseConfig exists in global scope)
    try {
      const apps = window.firebase.apps || [];
      if (apps.length === 0) {
        // firebaseConfig might be defined in an inline <script> in the HTML
        // (global lexical env). Access via identifier.
        if (typeof firebaseConfig === 'undefined') {
          throw new Error('firebaseConfig is not defined in partymode.html.');
        }
        window.firebase.initializeApp(firebaseConfig);
      }
    } catch (e) {
      // If app already initialized, ignore duplicates
      const msg = String(e && (e.message || e));
      if (!/already exists|already been initialized|duplicate app/i.test(msg)) {
        throw e;
      }
    }

    // Ensure Firestore instance is available
    if (!window.db) window.db = window.firebase.firestore();
    return window.db;
  }

  // ---------- State ----------
  const state = {
    roomCode: null,
    playerName: null,
    isHost: false,
    unsubRoom: null,
    unsubPlayers: null,
    selected: new Set(), // emoji picks
    totalToPick: 6,      // default
  };

  // ---------- Rendering ----------
  function renderPlayers(players) {
    const box = $('playerList');
    if (!box) return;
    if (!players.length) {
      box.innerHTML = '<div class="micro">No players yet.</div>';
      return;
    }
    box.innerHTML = players
      .map((p) => `<div class="chip">${escapeHtml(p.name || p.id || 'Player')}</div>`)
      .join(' ');
  }

  function setRoomCodeLabels(code) {
    const a = $('lblRoomCode');
    const b = $('lblRoomCode2');
    if (a) a.textContent = code || '';
    if (b) b.textContent = code || '';
  }

  function buildPickGrid() {
    const grid = $('emojiGridParty');
    if (!grid) return;

    // A small, safe emoji pool (you can expand later)
    const EMOJIS = [
      '😀','😅','😍','😎','🤩','🤖','👻','💩','🔥','🌈','⭐','🍀',
      '🍕','🍔','🍣','🍰','🍩','🍎','🍉','🍇','⚽','🏀','🎾','🎲',
      '🎯','🎵','🎸','🚗','✈️','🚀','🏠','📱','💡','🧠','💰','🔑'
    ];

    grid.innerHTML = '';
    for (const e of EMOJIS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.style.fontSize = '22px';
      btn.style.padding = '10px';
      btn.textContent = e;
      btn.addEventListener('click', () => togglePick(e, btn));
      grid.appendChild(btn);
    }
    updatePickedCount();
  }

  function togglePick(emoji, btn) {
    if (state.selected.has(emoji)) {
      state.selected.delete(emoji);
      btn.style.outline = '';
    } else {
      if (state.selected.size >= state.totalToPick) return;
      state.selected.add(emoji);
      btn.style.outline = '2px solid rgba(124, 58, 237, 0.9)';
    }
    updatePickedCount();
  }

  function updatePickedCount() {
    const el = $('pickedCount');
    if (el) el.textContent = String(state.selected.size);
  }

  function resetPicks() {
    state.selected.clear();
    buildPickGrid();
  }

  // ---------- Firestore subscriptions ----------
  async function subscribeRoom(code) {
    const db = ensureFirestore();

    // Cleanup old listeners
    if (state.unsubRoom) { try { state.unsubRoom(); } catch {} state.unsubRoom = null; }
    if (state.unsubPlayers) { try { state.unsubPlayers(); } catch {} state.unsubPlayers = null; }

    const roomRef = db.collection('rooms').doc(code);

    state.unsubRoom = roomRef.onSnapshot((snap) => {
      if (!snap.exists) {
        console.warn('[PartyMode] room missing:', code);
        setEntryError('Room not found (it may have expired).');
        showView('viewEntry');
        return;
      }
      const data = snap.data() || {};
      // Drive views by status
      const status = data.status || 'lobby'; // lobby | picking | result
      if (status === 'lobby') showView('viewLobby');
      if (status === 'picking') {
        showView('viewPick');
        buildPickGrid();
      }
      if (status === 'result') showView('viewResult');

      // Host can change game selection
      const selGame = $('selGame');
      if (selGame && data.game) selGame.value = data.game;

      // Update result view placeholders if present
      const partyNumbers = $('partyNumbers');
      if (partyNumbers && data.resultText) partyNumbers.textContent = data.resultText;

      console.log('[PartyMode] room snapshot:', code, { status, game: data.game });
    }, (err) => {
      console.error('[PartyMode] room onSnapshot error:', err);
      alert('Room listener error: ' + (err?.message || err));
    });

    state.unsubPlayers = roomRef.collection('players').onSnapshot((qs) => {
      const players = [];
      qs.forEach((d) => players.push({ id: d.id, ...(d.data() || {}) }));
      renderPlayers(players);

      const submitted = players.filter(p => p.submitted).length;
      const total = players.length;
      const a = $('lblSubmitted'); if (a) a.textContent = String(submitted);
      const b = $('lblTotal'); if (b) b.textContent = String(total);

      console.log('[PartyMode] players snapshot:', players.length, 'submitted', submitted);
    }, (err) => {
      console.error('[PartyMode] players onSnapshot error:', err);
      alert('Players listener error: ' + (err?.message || err));
    });
  }

  // ---------- Actions ----------
  async function createRoom() {
    setEntryError('');
    console.log('[PartyMode] createRoom() clicked');

    const name = ($('inpName')?.value || '').trim();
    if (!name) {
      setEntryError('Please enter your name first.');
      $('inpName')?.focus();
      return;
    }

    const db = ensureFirestore();

    // Generate room code, try a few times if collision
    let code = null;
    for (let i = 0; i < 10; i++) {
      const c = randCode(4);
      const ref = db.collection('rooms').doc(c);
      const snap = await ref.get();
      if (!snap.exists) { code = c; break; }
    }
    if (!code) throw new Error('Could not generate a unique room code. Try again.');

    state.roomCode = code;
    state.playerName = name;
    state.isHost = true;
    setRoomCodeLabels(code);

    const roomRef = db.collection('rooms').doc(code);
    const now = window.firebase.firestore.FieldValue.serverTimestamp();

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
      showView('viewLobby');
      await subscribeRoom(code);

    } catch (err) {
      console.error('[PartyMode] createRoom error:', err);
      setEntryError(err?.message || String(err));
      alert('Create room failed: ' + (err?.message || err));
    }
  }

  async function joinRoom() {
    setEntryError('');
    console.log('[PartyMode] joinRoom() clicked');

    const code = ($('inpRoomCode')?.value || '').trim().toUpperCase();
    const name = ($('inpName')?.value || '').trim();
    if (!code) { setEntryError('Please enter a room code.'); $('inpRoomCode')?.focus(); return; }
    if (!name) { setEntryError('Please enter your name.'); $('inpName')?.focus(); return; }

    const db = ensureFirestore();
    const roomRef = db.collection('rooms').doc(code);

    try {
      const snap = await roomRef.get();
      if (!snap.exists) {
        setEntryError('Room not found. Check the code and try again.');
        return;
      }

      state.roomCode = code;
      state.playerName = name;
      state.isHost = false;
      setRoomCodeLabels(code);

      const now = window.firebase.firestore.FieldValue.serverTimestamp();
      await roomRef.collection('players').doc(name).set({
        name,
        isHost: false,
        joinedAt: now,
        submitted: false,
      }, { merge: true });

      console.log('[PartyMode] joined room:', code, 'as', name);
      showView('viewLobby');
      await subscribeRoom(code);

    } catch (err) {
      console.error('[PartyMode] joinRoom error:', err);
      setEntryError(err?.message || String(err));
      alert('Join room failed: ' + (err?.message || err));
    }
  }

  async function startGame() {
    console.log('[PartyMode] startGame() clicked');
    if (!state.roomCode) return;
    if (!state.isHost) { alert('Only the host can start the game.'); return; }

    const db = ensureFirestore();
    const roomRef = db.collection('rooms').doc(state.roomCode);
    const game = $('selGame')?.value || 'pb';

    try {
      await roomRef.set({ status: 'picking', game }, { merge: true });
      console.log('[PartyMode] game started:', game);
    } catch (err) {
      console.error('[PartyMode] startGame error:', err);
      alert('Start failed: ' + (err?.message || err));
    }
  }

  async function submitPick() {
    console.log('[PartyMode] submitPick() clicked');
    if (!state.roomCode) return;

    if (state.selected.size !== state.totalToPick) {
      alert(`Pick exactly ${state.totalToPick} emojis before submitting.`);
      return;
    }

    const db = ensureFirestore();
    const roomRef = db.collection('rooms').doc(state.roomCode);

    try {
      await roomRef.collection('players').doc(state.playerName).set({
        submitted: true,
        picks: Array.from(state.selected),
        submittedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      alert('Submitted!');
      console.log('[PartyMode] submitted picks:', Array.from(state.selected));
    } catch (err) {
      console.error('[PartyMode] submitPick error:', err);
      alert('Submit failed: ' + (err?.message || err));
    }
  }

  async function revealResult() {
    console.log('[PartyMode] revealResult() clicked');
    if (!state.isHost) { alert('Only the host can reveal results.'); return; }
    if (!state.roomCode) return;

    const db = ensureFirestore();
    const roomRef = db.collection('rooms').doc(state.roomCode);

    try {
      // Simple deterministic "result" for now: just show joined players count.
      // You can later compute based on submitted emojis.
      const ps = await roomRef.collection('players').get();
      const total = ps.size;

      await roomRef.set({
        status: 'result',
        resultText: `Players: ${total} (demo result)`,
        revealedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      console.log('[PartyMode] result revealed');
    } catch (err) {
      console.error('[PartyMode] revealResult error:', err);
      alert('Reveal failed: ' + (err?.message || err));
    }
  }

  function copyInvite() {
    if (!state.roomCode) return;
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(state.roomCode)}`;
    navigator.clipboard?.writeText(url).then(
      () => alert('Invite link copied.'),
      () => alert('Copy failed. You can manually copy: ' + url)
    );
  }

  function applyRoomFromURL() {
    const u = new URL(location.href);
    const code = (u.searchParams.get('room') || '').trim().toUpperCase();
    if (code && $('inpRoomCode')) $('inpRoomCode').value = code;
  }

  // ---------- Bind UI ----------
  function bindUI() {
    console.log('[PartyMode] bindUI()');

    const btnCreate = $('btnCreateRoom');
    const btnJoin = $('btnJoinRoom');

    if (!btnCreate || !btnJoin) {
      console.error('[PartyMode] Missing entry buttons. btnCreateRoom/btnJoinRoom not found.');
      alert('PartyMode UI mismatch: missing buttons. Check partymode.html IDs.');
      return;
    }

    btnCreate.addEventListener('click', (e) => { e.preventDefault(); createRoom(); });
    btnJoin.addEventListener('click', (e) => { e.preventDefault(); joinRoom(); });

    $('btnCopyInvite')?.addEventListener('click', (e) => { e.preventDefault(); copyInvite(); });
    $('btnStart')?.addEventListener('click', (e) => { e.preventDefault(); startGame(); });

    $('btnResetParty')?.addEventListener('click', (e) => { e.preventDefault(); resetPicks(); });
    $('btnSubmitParty')?.addEventListener('click', (e) => { e.preventDefault(); submitPick(); });

    $('btnReveal')?.addEventListener('click', (e) => { e.preventDefault(); revealResult(); });

    // Optional copy buttons in result view (if you later implement)
    $('btnCopyPartyLink')?.addEventListener('click', (e) => { e.preventDefault(); copyInvite(); });

    // Init defaults
    showView('viewEntry');
    applyRoomFromURL();

    console.log('[PartyMode] UI ready ✅');
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[PartyMode] script loaded at', new Date().toISOString());

    try {
      // Only to verify Firebase availability early
      const db = ensureFirestore();
      console.log('[PartyMode] Firebase OK. window.db =', db);
    } catch (err) {
      console.error('[PartyMode] Firebase bootstrap error:', err);
      setEntryError(err?.message || String(err));
      alert('Firebase is not ready: ' + (err?.message || err));
      // Still bind UI so clicks can show errors
    }

    bindUI();
  });

})();
