/* Party Mode v1 - stable (host/join) + smoother UX */
(() => {
  const log  = (...a) => console.log('[PartyMode]', ...a);
  const warn = (...a) => console.warn('[PartyMode]', ...a);

  const $id = (id) => document.getElementById(id);

  function setYear() {
    const y = $id('year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  function setMsg(txt) {
    const msg =
      $id('msg') ||
      document.querySelector('#msg,[data-role="msg"],.msg,.message');
    if (msg) msg.textContent = txt || '';
  }

  function pickById(ids) {
    for (const id of ids) {
      const el = $id(id);
      if (el) return el;
    }
    return null;
  }

  // pick the most reliable input:
  // 1) non-empty value (what user actually typed)
  // 2) common ids
  // 3) placeholder contains token
  function pickInput({ ids = [], placeholderToken = '' }) {
    const inputs = Array.from(document.querySelectorAll('input'));

    // 1) already typed
    for (const el of inputs) {
      if (el && typeof el.value === 'string' && el.value.trim().length > 0) {
        if (!placeholderToken) return el;
        const ph = (el.getAttribute('placeholder') || '').toLowerCase();
        if (ph.includes(placeholderToken.toLowerCase())) return el;
      }
    }

    // 2) ids
    const byId = pickById(ids);
    if (byId) return byId;

    // 3) placeholder
    if (placeholderToken) {
      const token = placeholderToken.toLowerCase();
      for (const el of inputs) {
        const ph = (el.getAttribute('placeholder') || '').toLowerCase();
        if (ph.includes(token)) return el;
      }
    }

    return null;
  }

  function getDb() {
    if (window.db) return window.db;
    if (window.EMOJIPICK_DB) return window.EMOJIPICK_DB;
    try {
      if (window.firebase?.firestore) return window.firebase.firestore();
    } catch (e) {}
    return null;
  }

  function makeRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
  }

  function buildFullRoomLink(room) {
    // always point to /partymode.html?room=XXXX on same origin/path base
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    // keep current pathname (already partymode.html on github pages)
    url.searchParams.set('room', room);
    return url.toString();
  }

  function ensurePanel() {
    // try to reuse an existing container if any
    let panel =
      $id('partyPanel') ||
      document.querySelector('[data-role="partyPanel"], .partyPanel');

    if (!panel) {
      // create a simple panel under the main card if possible, otherwise body
      const anchor =
        document.querySelector('.card, .container, main, body') || document.body;

      panel = document.createElement('div');
      panel.id = 'partyPanel';
      panel.style.marginTop = '12px';
      panel.style.padding = '10px';
      panel.style.border = '1px solid rgba(0,0,0,0.1)';
      panel.style.borderRadius = '10px';
      panel.style.fontSize = '14px';
      panel.style.display = 'none';
      anchor.appendChild(panel);
    }
    return panel;
  }

  function renderHostOrGuestUI({ room, isHost, name }) {
    const panel = ensurePanel();
    const fullLink = buildFullRoomLink(room);

    panel.style.display = '';
    panel.innerHTML = `
      <div style="font-weight:700; margin-bottom:6px;">
        ${isHost ? 'Host Lobby' : 'Lobby'}
      </div>
      <div style="margin-bottom:8px;">
        Room: <span style="font-weight:800; font-size:18px; letter-spacing:1px;">${room}</span>
      </div>
      <div style="margin-bottom:10px;">
        Invite link:
        <div style="word-break:break-all; opacity:0.9; margin-top:4px;">${fullLink}</div>
        <button id="btnCopyInvite" style="margin-top:8px; padding:6px 10px; border-radius:8px; border:1px solid rgba(0,0,0,0.2); background:#fff; cursor:pointer;">
          Copy invite link
        </button>
      </div>
      <div style="margin-top:10px; font-weight:600;">Players</div>
      <div id="playersList" style="margin-top:6px; line-height:1.6; opacity:0.95;">(loading...)</div>
      <div style="margin-top:10px; opacity:0.7; font-size:12px;">
        ${isHost ? 'Host: create room is enough. Do NOT press Join.' : 'Guest: enter your name and press Join once.'}
      </div>
    `;

    const btnCopy = $id('btnCopyInvite');
    if (btnCopy) {
      btnCopy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(fullLink);
          alert('Invite link copied!');
        } catch (e) {
          // fallback
          prompt('Copy this link:', fullLink);
        }
      };
    }

    // also try to fill old "Room Created" view if it exists
    const roomCodeEl =
      $id('roomCodeDisplay') ||
      $id('roomCode') ||
      document.querySelector('[data-role="roomCode"], .roomCode, #roomCodeText');
    if (roomCodeEl) roomCodeEl.textContent = room;

    const tipEl =
      $id('roomLink') ||
      document.querySelector('[data-role="roomLink"], .roomLink');
    if (tipEl) tipEl.textContent = fullLink;

    const viewCreated = $id('viewRoomCreated') || document.querySelector('#viewRoomCreated,.viewRoomCreated');
    const viewMain    = $id('viewMain') || document.querySelector('#viewMain,.viewMain');
    if (viewCreated && viewMain) {
      viewCreated.style.display = '';
      viewMain.style.display = 'none';
    }
  }

  function disableCreateButton(btnCreate, reasonText) {
    if (!btnCreate) return;
    btnCreate.disabled = true;
    btnCreate.style.opacity = '0.5';
    btnCreate.style.cursor = 'not-allowed';
    if (reasonText) btnCreate.title = reasonText;
  }

  function startRoomWatcher(room, isHost) {
    const db = getDb();
    if (!db) return;

    try {
      const ref = db.collection('rooms').doc(room);
      // realtime updates
      ref.onSnapshot((snap) => {
        if (!snap.exists) {
          const el = $id('playersList');
          if (el) el.textContent = '(room not found)';
          return;
        }
        const data = snap.data() || {};
        const players = data.players || {};
        const names = Object.keys(players);

        const el = $id('playersList');
        if (el) {
          if (!names.length) {
            el.textContent = '(no players yet)';
          } else {
            // host first if present
            names.sort((a, b) => {
              const ra = (players[a]?.role === 'host') ? 0 : 1;
              const rb = (players[b]?.role === 'host') ? 0 : 1;
              if (ra !== rb) return ra - rb;
              return a.localeCompare(b);
            });
            el.innerHTML = names.map((n) => {
              const role = players[n]?.role === 'host' ? ' (host)' : '';
              return `<div>• ${n}${role}</div>`;
            }).join('');
          }
        }

        if (isHost) {
          // host-friendly message
          setMsg('Host lobby ready. Share the invite link. Players will appear here.');
        }
      });
    } catch (e) {
      warn('startRoomWatcher failed:', e);
    }
  }

  async function createRoom() {
    log('createRoom() clicked');

    const db = getDb();
    if (!db) {
      setMsg('Firebase db not ready. Check window.db / window.EMOJIPICK_DB.');
      console.error('[PartyMode] db not found. window.db:', window.db, 'window.EMOJIPICK_DB:', window.EMOJIPICK_DB);
      return;
    }

    const inpName = pickInput({
      ids: ['name', 'playerName', 'hostName', 'inputName', 'yourName'],
      placeholderToken: 'your name'
    });

    if (inpName) inpName.blur();

    const hostName = (inpName?.value || '').trim();
    if (!hostName) {
      setMsg('Please enter your name first.');
      return;
    }

    // persist name so it doesn't "disappear"
    try { localStorage.setItem('party_name', hostName); } catch {}

    const room = makeRoomCode();
    setMsg('Creating room...');

    try {
      log('createRoom() writing room doc', room);

      await db.collection('rooms').doc(room).set({
        createdAt: Date.now(),
        hostName,
        status: 'lobby',
        picks: {},
        players: {
          [hostName]: { joinedAt: Date.now(), role: 'host' }
        }
      });

      log('createRoom() success, room created', room);

      // Make URL reflect the room so refresh/opening works consistently
      const url = new URL(location.href);
      url.search = '';
      url.hash = '';
      url.searchParams.set('room', room);
      url.searchParams.set('host', '1');
      history.replaceState({}, '', url.toString());

      // Put room code into input as well (nice for copy / visibility)
      const inpRoom = pickInput({
        ids: ['room', 'roomCode', 'inputRoom', 'inputRoomCode'],
        placeholderToken: 'room code'
      });
      if (inpRoom) inpRoom.value = room;

      // show lobby panel with invite link + players
      renderHostOrGuestUI({ room, isHost: true, name: hostName });
      startRoomWatcher(room, true);

      alert(`Room created: ${room}`);

    } catch (e) {
      console.error(e);
      setMsg('Failed to create room. See console.');
    }
  }

  async function joinRoom() {
    log('joinRoom() clicked');

    const db = getDb();
    if (!db) {
      setMsg('Firebase db not ready.');
      return;
    }

    const inpRoom = pickInput({
      ids: ['room', 'roomCode', 'inputRoom', 'inputRoomCode'],
      placeholderToken: 'room code'
    });
    const inpName = pickInput({
      ids: ['name', 'playerName', 'guestName', 'inputName', 'yourName'],
      placeholderToken: 'your name'
    });

    if (inpName) inpName.blur();

    const room = (inpRoom?.value || '').trim().toUpperCase();
    const name = (inpName?.value || '').trim();

    if (!room) { setMsg('Please enter room code.'); return; }
    if (!name) { setMsg('Please enter your name first.'); return; }

    try { localStorage.setItem('party_name', name); } catch {}

    setMsg('Joining room...');

    try {
      const ref = db.collection('rooms').doc(room);
      const snap = await ref.get();

      if (!snap.exists) {
        setMsg('Room not found. Check the code.');
        return;
      }

      await ref.set({
        players: { [name]: { joinedAt: Date.now(), role: 'guest' } }
      }, { merge: true });

      // Make URL keep room so reload works
      const url = new URL(location.href);
      url.search = '';
      url.hash = '';
      url.searchParams.set('room', room);
      history.replaceState({}, '', url.toString());

      renderHostOrGuestUI({ room, isHost: false, name });
      startRoomWatcher(room, false);

      setMsg(`Joined room ${room} as ${name}.`);
      alert(`Joined room ${room} as ${name}`);

    } catch (e) {
      console.error(e);
      setMsg('Failed to join room. See console.');
    }
  }

  function bindUI() {
    setYear();
    setMsg('');

    const btnCreate =
      pickById(['btnCreateRoom', 'btnCreate', 'createRoomBtn']) ||
      document.querySelector('button#btnCreateRoom, button[data-action="createRoom"]');
    const btnJoin =
      pickById(['btnJoin', 'btnJoinRoom', 'joinBtn']) ||
      document.querySelector('button#btnJoin, button[data-action="joinRoom"]');

    if (btnCreate) btnCreate.addEventListener('click', createRoom);
    else warn('Create button not found');

    if (btnJoin) btnJoin.addEventListener('click', joinRoom);
    else warn('Join button not found');

    // restore last name so it doesn't vanish
    const savedName = (() => { try { return localStorage.getItem('party_name') || ''; } catch { return ''; } })();
    if (savedName) {
      const inpName = pickInput({
        ids: ['name', 'playerName', 'hostName', 'guestName', 'inputName', 'yourName'],
        placeholderToken: 'your name'
      });
      if (inpName && !inpName.value) inpName.value = savedName;
    }

    const params = new URLSearchParams(location.search);
    const roomFromUrl = (params.get('room') || '').trim().toUpperCase();
    const hostFlag = params.get('host') === '1';

    if (roomFromUrl) {
      const inpRoom = pickInput({
        ids: ['room', 'roomCode', 'inputRoom', 'inputRoomCode'],
        placeholderToken: 'room code'
      });
      if (inpRoom) inpRoom.value = roomFromUrl;

      // Opening with ?room=XXXX should feel like "guest invited"
      disableCreateButton(btnCreate, 'Open without ?room= to create a new room');

      if (hostFlag) {
        // Host view on reload
        renderHostOrGuestUI({ room: roomFromUrl, isHost: true, name: savedName || '' });
        startRoomWatcher(roomFromUrl, true);
        setMsg('Host lobby ready. Share the invite link. Players will appear here.');
      } else {
        setMsg('Enter your name, then press Join.');
      }
    } else {
      // normal entry page (host can create)
      setMsg('Host: enter your name then press Create room.');
    }

    log('UI ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUI);
  } else {
    bindUI();
  }

  // expose for testing
  window.__PartyMode__ = { createRoom, joinRoom, getDb };
  window.createRoom = createRoom;
  window.joinRoom = joinRoom;
})();
