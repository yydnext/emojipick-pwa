/* Party Mode v1 - stable (host/join) */
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
        // if placeholderToken provided, prefer matching one
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
    // prefer explicitly exposed db
    if (window.db) return window.db;
    if (window.EMOJIPICK_DB) return window.EMOJIPICK_DB;
    // firebase v9 compat: window.firebase.firestore()
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

  async function createRoom() {
    log('createRoom() clicked');

    const db = getDb();
    if (!db) {
      setMsg('Firebase db not ready. Check window.db / window.EMOJIPICK_DB.');
      console.error('[PartyMode] db not found. window.db:', window.db, 'window.EMOJIPICK_DB:', window.EMOJIPICK_DB);
      return;
    }

    // name input
    const inpName = pickInput({
      ids: ['name', 'playerName', 'hostName', 'inputName', 'yourName'],
      placeholderToken: 'your name'
    });

    // IME(한글) 입력 지연 대비: blur 한번
    if (inpName) inpName.blur();

    const hostName = (inpName?.value || '').trim();
    if (!hostName) {
      setMsg('Please enter your name first.');
      return;
    }

    const room = makeRoomCode();
    setMsg('Creating room...');

    try {
      log('createRoom() writing room doc', room);
      await db.collection('rooms').doc(room).set({
        createdAt: Date.now(),
        hostName,
        status: 'lobby',
        picks: {}
      });
      log('createRoom() success, room created', room);

      // update UI if the page has "room created" area
      const roomCodeEl =
        $id('roomCodeDisplay') ||
        $id('roomCode') ||
        document.querySelector('[data-role="roomCode"], .roomCode, #roomCodeText');
      if (roomCodeEl) roomCodeEl.textContent = room;

      const tipEl =
        $id('roomLink') ||
        document.querySelector('[data-role="roomLink"], .roomLink');
      if (tipEl) tipEl.textContent = `partymode.html?room=${room}`;

      // if the page shows a "Room Created" view, try to show it
      const viewCreated = $id('viewRoomCreated') || document.querySelector('#viewRoomCreated,.viewRoomCreated');
      const viewMain    = $id('viewMain') || document.querySelector('#viewMain,.viewMain');
      if (viewCreated) viewCreated.style.display = '';
      if (viewMain) viewMain.style.display = 'none';

     alert(`Room created: ${roomCode}`);
    // location.href = `partymode.html?room=${roomCode}&host=1`;
    // return;

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

    setMsg('Joining room...');

    try {
      const ref = db.collection('rooms').doc(room);
      const snap = await ref.get();

      if (!snap.exists) {
        setMsg('Room not found. Check the code.');
        return;
      }

      // store join info (simple)
      await ref.set({
        players: { [name]: { joinedAt: Date.now() } }
      }, { merge: true });

      setMsg(`Joined room ${room} as ${name}.`);
      log('joinRoom() success', { room, name });

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

    // if opened with ?room=XXXX, prefill and disable create (avoid confusion)
    const roomFromUrl = new URLSearchParams(location.search).get('room');
    if (roomFromUrl) {
      const inpRoom = pickInput({
        ids: ['room', 'roomCode', 'inputRoom', 'inputRoomCode'],
        placeholderToken: 'room code'
      });
      if (inpRoom) inpRoom.value = roomFromUrl.toUpperCase();

      if (btnCreate) {
        btnCreate.disabled = true;
        btnCreate.style.opacity = '0.5';
        btnCreate.style.cursor = 'not-allowed';
      }
      setMsg('Enter your name, then press Join.');
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
