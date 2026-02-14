(() => {
  // Party Mode (multi-phone) for EmojiPick
  // - Host clicks "Create room" after entering name
  // - App creates Firestore doc: rooms/{ROOM}
  // - Host and guests can open invite link: partymode.html?room=ROOM
  // - Guests enter (or auto-fill) name and click Join (or auto-join if name saved)
  // - Lobby updates live via onSnapshot (players list)
  //
  // NOTE: This file assumes Firestore is available as window.EMOJIPICK_DB or window.db (compat).
  // If you migrate to modular SDK later, update getDb() accordingly.

  const $id = (id) => document.getElementById(id);
  const log = (...args) => console.log('[PartyMode]', ...args);

  // ---------- Firebase / DB ----------
  function getDb() {
    // Prefer explicitly exported DB handle, fallback to window.db
    if (window.EMOJIPICK_DB) return window.EMOJIPICK_DB;
    if (window.db) return window.db;

    // Fallback: compat SDK global (firebase.firestore())
    try {
      if (window.firebase && typeof window.firebase.firestore === 'function') {
        return window.firebase.firestore();
      }
    } catch (e) {}

    return null;
  }

  function setYear() {
    const y = new Date().getFullYear();
    const el = document.querySelector('[data-role="year"]') || document.getElementById('year');
    if (el) el.textContent = String(y);
  }

  // ---------- Small helpers ----------
  function pickById(ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function setMsg(msg) {
    const el =
      $id('msg') ||
      $id('message') ||
      document.querySelector('[data-role="msg"]') ||
      document.querySelector('.msg');
    if (el) el.textContent = msg || '';
  }

  function normalizeName(raw) {
    const s = (raw || '').trim();
    // keep it simple, avoid empty and very long names
    if (!s) return '';
    return s.slice(0, 24);
  }

  function normalizeRoom(raw) {
    const s = (raw || '').trim().toUpperCase();
    return s.replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  function genRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1
    let out = '';
    for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function getUrlParams() {
    const p = new URLSearchParams(location.search);
    return {
      room: normalizeRoom(p.get('room') || ''),
      host: p.get('host') === '1' || p.get('host') === 'true',
    };
  }

  function buildInviteLink(room) {
    const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/partymode.html');
    return `${base}?room=${encodeURIComponent(room)}`;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  // ---------- UI: lobby panel (created dynamically if missing) ----------
  function ensureLobbyUI() {
    let box =
      $id('pmLobby') ||
      document.querySelector('[data-role="pm-lobby"]') ||
      document.querySelector('.pm-lobby');

    if (box) return box;

    box = document.createElement('div');
    box.id = 'pmLobby';
    box.className = 'pm-lobby';
    box.style.marginTop = '18px';
    box.style.padding = '14px';
    box.style.border = '1px solid #e5e7eb';
    box.style.borderRadius = '12px';
    box.style.background = '#fff';

    box.innerHTML = `
      <h3 style="margin:0 0 10px 0;">Lobby</h3>

      <div style="margin-bottom:10px;">
        <div><strong>Room:</strong> <span id="pmRoomLabel">—</span></div>
        <div style="margin-top:6px;"><strong>Invite link:</strong></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px;">
          <input id="pmInviteLink" type="text" readonly style="flex:1;min-width:260px;padding:8px;border:1px solid #d1d5db;border-radius:8px;">
          <button id="pmCopyLink" type="button" style="padding:8px 10px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer;">Copy invite link</button>
          <button id="pmShareLink" type="button" style="padding:8px 10px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer;">Share</button>
        </div>
        <div id="pmCopyHint" style="margin-top:6px;color:#6b7280;font-size:12px;"></div>
      </div>

      <div style="margin-bottom:8px;"><strong>Players</strong></div>
      <ul id="pmPlayers" style="margin:0;padding-left:18px;"></ul>

      <div id="pmStatus" style="margin-top:10px;color:#374151;font-size:13px;"></div>
    `;

    // append near footer or end of page
    const anchor =
      document.querySelector('[data-role="pm-anchor"]') ||
      document.querySelector('main') ||
      document.body;
    anchor.appendChild(box);

    return box;
  }

  function renderLobbyStatic({ room, isHost }) {
    const lobby = ensureLobbyUI();
    const roomLabel = $id('pmRoomLabel');
    const inviteInput = $id('pmInviteLink');
    const copyBtn = $id('pmCopyLink');
    const shareBtn = $id('pmShareLink');
    const statusEl = $id('pmStatus');
    const hintEl = $id('pmCopyHint');

    const link = buildInviteLink(room);
    if (roomLabel) roomLabel.textContent = room;
    if (inviteInput) inviteInput.value = link;

    if (hintEl) {
      hintEl.textContent = isHost
        ? 'Tip: Tap "Share" to send the invite link via SMS/WhatsApp, or "Copy" to paste anywhere.'
        : 'Tip: Keep this page open. The host will start the game when everyone is ready.';
    }

    if (copyBtn) {
      copyBtn.onclick = async () => {
        const ok = await copyToClipboard(link);
        alert(ok ? 'Invite link copied!' : 'Copy failed. Please select and copy manually.');
      };
    }

    if (shareBtn) {
      shareBtn.onclick = async () => {
        if (!navigator.share) {
          alert('Share is not supported on this browser. Use "Copy invite link" instead.');
          return;
        }
        try {
          await navigator.share({
            title: 'EmojiPick Party Mode',
            text: `Join my EmojiPick room: ${room}`,
            url: link,
          });
        } catch (e) {
          // user cancelled share -> ignore
        }
      };
    }

    if (statusEl) {
      statusEl.textContent = isHost
        ? 'Waiting for players to join…'
        : 'Joined. Waiting in lobby…';
    }

    lobby.style.display = '';
  }

  function renderPlayers(playersObj, hostName) {
    const ul = $id('pmPlayers');
    if (!ul) return;

    ul.innerHTML = '';
    const names = Object.keys(playersObj || {}).sort((a, b) => a.localeCompare(b));
    if (names.length === 0) {
      const li = document.createElement('li');
      li.textContent = '(no players yet)';
      ul.appendChild(li);
      return;
    }

    for (const name of names) {
      const li = document.createElement('li');
      li.textContent = name === hostName ? `${name} (host)` : name;
      ul.appendChild(li);
    }
  }

  // Track snapshot listener so we can avoid duplicates
  let currentRoomUnsub = null;

  function watchRoom(room) {
    const db = getDb();
    if (!db) return;

    // stop previous listener if any
    if (typeof currentRoomUnsub === 'function') {
      currentRoomUnsub();
      currentRoomUnsub = null;
    }

    const ref = db.collection('rooms').doc(room);
    currentRoomUnsub = ref.onSnapshot(
      (snap) => {
        if (!snap.exists) {
          setMsg(`Room ${room} does not exist (yet).`);
          renderPlayers({}, '');
          return;
        }
        const data = snap.data() || {};
        const hostName = data.hostName || '';
        renderPlayers(data.players || {}, hostName);

        const statusEl = $id('pmStatus');
        if (statusEl) {
          statusEl.textContent = `Status: ${data.status || 'lobby'} • Players: ${
            Object.keys(data.players || {}).length
          }`;
        }
      },
      (err) => {
        console.error(err);
        setMsg('Live update failed. See console.');
      }
    );
  }

  // ---------- Core actions ----------
  async function createRoom() {
    log('createRoom() clicked');

    const db = getDb();
    if (!db) {
      setMsg('Firebase db not ready. Check window.db / window.EMOJIPICK_DB.');
      console.error('[PartyMode] db not found. window.db:', window.db, 'window.EMOJIPICK_DB:', window.EMOJIPICK_DB);
      return;
    }

    const inputName = pickById(['inputName', 'name', 'playerName', 'hostName']) || document.querySelector('input[name="name"]');
    const inputRoomCode = pickById(['inputRoomCode', 'roomCode', 'code', 'room']) || document.querySelector('input[name="room"]');

    const hostName = normalizeName(inputName?.value);
    if (!hostName) {
      alert('Please enter your name first.');
      inputName?.focus();
      return;
    }

    // persist for convenience
    localStorage.setItem('pm_name', hostName);

    // create unique room code (retry if collision)
    let room = genRoomCode();
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await db.collection('rooms').doc(room).get().then(s => s.exists).catch(() => false);
      if (!exists) break;
      room = genRoomCode();
    }

    const now = Date.now();
    const ref = db.collection('rooms').doc(room);

    try {
      await ref.set({
        createdAt: now,
        hostName,
        status: 'lobby',
        picks: {},
        players: {
          [hostName]: { joinedAt: now },
        },
      });

      log('createRoom() success, room created', room);

      // Update UI immediately + move to canonical URL for the host
      if (inputRoomCode) inputRoomCode.value = room;

      // IMPORTANT: do not reference undefined variables (previous bug: roomCode)
      alert(`Room created: ${room}`);

      // Make host URL stable (so refresh keeps room)
      // host=1 lets us keep "Create room" hidden but still treat this tab as host
      location.href = `partymode.html?room=${encodeURIComponent(room)}&host=1`;
    } catch (e) {
      console.error(e);
      setMsg('Failed to create room. See console.');
      alert('Failed to create room. Please open console and send the error.');
    }
  }

  async function joinRoom(auto = false) {
    log('joinRoom() clicked');

    const db = getDb();
    if (!db) {
      setMsg('Firebase db not ready.');
      return;
    }

    const inputRoomCode = pickById(['inputRoomCode', 'roomCode', 'code', 'room']) || document.querySelector('input[name="room"]');
    const inputName = pickById(['inputName', 'name', 'playerName', 'guestName']) || document.querySelector('input[name="name"]');

    const room = normalizeRoom(inputRoomCode?.value);
    const name = normalizeName(inputName?.value);

    if (!room) {
      if (!auto) alert('Please enter the room code.');
      inputRoomCode?.focus();
      return;
    }
    if (!name) {
      if (!auto) alert('Please enter your name.');
      inputName?.focus();
      return;
    }

    localStorage.setItem('pm_name', name);

    const ref = db.collection('rooms').doc(room);

    try {
      const snap = await ref.get();
      if (!snap.exists) {
        alert(`Room not found: ${room}`);
        return;
      }

      const now = Date.now();
      await ref.set(
        {
          players: {
            [name]: { joinedAt: now },
          },
        },
        { merge: true }
      );

      alert(`Joined room ${room} as ${name}`);

      // Show lobby for guest (no host flag)
      renderLobbyStatic({ room, isHost: false });
      watchRoom(room);

      // Keep URL clean/canonical for guests too
      const url = new URL(location.href);
      url.searchParams.set('room', room);
      url.searchParams.delete('host');
      history.replaceState({}, '', url.toString());
    } catch (e) {
      console.error(e);
      setMsg('Failed to join. See console.');
      alert('Failed to join room. Please open console and send the error.');
    }
  }

  // ---------- Page init / binding ----------
  function bindUI() {
    setYear();
    setMsg('');

    const btnCreate =
      $id('btnCreateRoom') ||
      document.querySelector('button#btnCreateRoom, button[data-action="createRoom"]');
    const btnJoin =
      $id('btnJoin') ||
      document.querySelector('button#btnJoin, button[data-action="joinRoom"]');

    if (btnCreate) btnCreate.addEventListener('click', createRoom);
    if (btnJoin) btnJoin.addEventListener('click', () => joinRoom(false));

    // inputs
    const inputRoomCode = pickById(['inputRoomCode', 'roomCode', 'code', 'room']) || document.querySelector('input[name="room"]');
    const inputName = pickById(['inputName', 'name', 'playerName', 'guestName', 'hostName']) || document.querySelector('input[name="name"]');

    // preload name from localStorage
    const savedName = normalizeName(localStorage.getItem('pm_name') || '');
    if (inputName && savedName && !inputName.value) inputName.value = savedName;

    const { room, host } = getUrlParams();

    // If room is in URL, prefill room input and enter "Join" mode
    if (room && inputRoomCode) {
      inputRoomCode.value = room;
      inputRoomCode.readOnly = true;

      // In join mode, keep create button hidden to reduce confusion
      if (btnCreate && !host) btnCreate.style.display = 'none';

      // Show lobby immediately if host=1 (host returning / refreshed)
      if (host) {
        renderLobbyStatic({ room, isHost: true });
        watchRoom(room);
      } else {
        // Guest: show a small hint
        setMsg('Enter your name and press Join.');
        renderLobbyStatic({ room, isHost: false });
        watchRoom(room);

        // Auto-join if we have a saved name and user hasn't joined yet in this tab
        if (savedName) {
          // only auto-join once per load
          setTimeout(() => {
            // If user changed the input, respect it; if empty, keep saved
            if (inputName && !inputName.value) inputName.value = savedName;
            joinRoom(true);
          }, 500);
        }
      }
    } else {
      // No room in URL: default Host screen
      if (btnCreate) btnCreate.style.display = '';
      if (inputRoomCode) inputRoomCode.readOnly = false;
      setMsg('Host: enter your name, then click "Create room (Host)".');
    }

    // expose for debugging
    window.__PartyMode__ = { createRoom, joinRoom, getDb };
    log('UI ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUI);
  } else {
    bindUI();
  }
})();
