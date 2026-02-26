/* EmojiPick Party Mode (Multi-phone)
 * Host: enter name -> Create room
 * Guest: open invite link/QR -> enter name -> Join
 *
 * Wires UI by id OR data-action and injects Lobby UI if missing.
 * Requires Firebase compat + window.db (firebase.firestore()) set in HTML.
 */

(function () {
  'use strict';

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const findBtnByText = (re) => {
    const els = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
    return els.find((el) => re.test(((el.textContent || el.value || '') + '').trim()));
  };
  const upperRoom = (s) => (s || '').trim().toUpperCase();
  const cleanName = (s) => (s || '').trim();
  const now = () => Date.now();

  function getDb() {
    if (window.db) return window.db;
    if (window.firebase && typeof window.firebase.firestore === 'function') return window.firebase.firestore();
    return null;
  }

  function setMsg(msg) {
    const el = $('msg') || qs('[data-role="msg"]') || qs('.msg');
    if (el) el.textContent = msg || '';
  }

  function getParam(k) {
    try { return new URLSearchParams(location.search).get(k); }
    catch { return null; }
  }

  function setParam(k, v) {
    try {
      const u = new URL(location.href);
      if (v === null || v === undefined || v === '') u.searchParams.delete(k);
      else u.searchParams.set(k, String(v));
      history.replaceState({}, '', u.toString());
    } catch {}
  }


// ---------- Auto-fill from main EmojiPick (latest ticket/picks) ----------
const LAST_TICKET_KEY = 'emojipick_last_ticket_text';
const LAST_TICKET_TS  = 'emojipick_last_ticket_ts';

function getLastTicketText() {
  // Primary key we will write from the main generator page (ticket.js/app.v11.js)
  let t = (localGet(LAST_TICKET_KEY) || '').trim();
  if (t) return t;

  // Backward/compat guesses (in case older versions used different keys)
  const candidates = ['lastTicketText','last_ticket_text','emojipick_last_picks_text','ticket_text'];
  for (const k of candidates) {
    try {
      const v = (localGet(k) || '').trim();
      if (v) return v;
    } catch {}
  }
  return '';
}

async function autoSendLastTicketToRoom(roomCode, hostName) {
  const meta = getLastTicketMeta();
  const text = meta.text;
  if (!text) return false;
  if (!(meta.ts && meta.ageMs >= 0 && meta.ageMs <= LAST_TICKET_MAX_AGE_MS)) return false;

  const db = getDb();
  if (!db) return false;

  try {
    // Do not overwrite if roomMessage already exists
    const snap = await db.collection('rooms').doc(roomCode).get();
    const data = snap.exists ? (snap.data() || {}) : {};
    if (data.roomMessage && data.roomMessage.text) return false;

    await db.collection('rooms').doc(roomCode).set({
      roomMessage: {
        text,
        by: hostName || 'host',
        at: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue && window.firebase.firestore.FieldValue.serverTimestamp)
          ? window.firebase.firestore.FieldValue.serverTimestamp()
          : Date.now()
      }
    }, { merge: true });

    setMsg('Auto-posted your latest picks to the room.');
    return true;
  } catch (e) {
    console.warn('[PartyMode] autoSendLastTicketToRoom failed', e);
    return false;
  }
}

  function localGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function localSet(key, val) { try { localStorage.setItem(key, val); } catch {} }

  function getInputs() {
    const room =
      $('roomCode') ||
      qs('input[name="roomCode"]') ||
      qs('[data-role="roomCode"]') ||
      qs('input[placeholder*="Room"]');

    const name =
      $('name') ||
      qs('input[name="name"]') ||
      qs('[data-role="name"]') ||
      qs('input[placeholder*="name" i]');

    return { room, name };
  }

  function getButtons() {
    // Be resilient to HTML changes (ids, attributes, or plain text buttons)
    const btnCreate =
      $('btnCreateRoom') ||
      qs('#btnCreateRoom') ||
      qs('[data-action="createRoom"]') ||
      qs('[data-role="create"]') ||
      findBtnByText(/create\s*room/i);

    const btnJoin =
      $('btnJoin') ||
      qs('#btnJoin') ||
      qs('[data-action="joinRoom"]') ||
      qs('[data-role="join"]') ||
      findBtnByText(/^join$/i);

    return { btnCreate, btnJoin };
  }

  function genRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,1,0
    let out = '';
    for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  // ---------- Lobby UI ----------
  function ensureLobbyBox() {
    let box = $('lobbyBox') || qs('#lobbyBox');
    if (box) return box;

    const anchor = qs('.card') || qs('main') || document.body;

    box = document.createElement('div');
    box.id = 'lobbyBox';
    box.style.marginTop = '18px';
    box.innerHTML = `
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:18px;background:#fff;max-width:980px;margin:0 auto;">
        <div style="font-size:28px;font-weight:800;margin-bottom:8px;">Lobby</div>

        <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
          <div style="flex:1;min-width:360px;">
            <div style="font-size:16px;margin-bottom:6px;"><b>Room:</b> <span id="lobbyRoomCode"></span></div>

            <div style="font-size:14px;color:#374151;margin:10px 0 6px;"><b>Invite link:</b></div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <input id="inviteLink" type="text" readonly style="flex:1;min-width:260px;padding:10px;border:1px solid #d1d5db;border-radius:10px;" />
              <button id="btnCopyInvite" type="button" style="padding:10px 14px;border-radius:10px;border:1px solid #d1d5db;background:#fff;cursor:pointer;">Copy</button>
              <button id="btnShareInvite" type="button" style="padding:10px 14px;border-radius:10px;border:1px solid #d1d5db;background:#fff;cursor:pointer;">Share</button>
            </div>
            <div style="font-size:12px;color:#6b7280;margin-top:6px;">
              Tip: Use <b>Share</b> for SMS/WhatsApp, or <b>Copy</b> to paste anywhere.
            </div>

            <div style="margin-top:12px;">
              <button id="btnToggleQR" type="button" style="padding:10px 14px;border-radius:10px;border:1px solid #d1d5db;background:#fff;cursor:pointer;">QR code</button>
            </div>
          </div>

          <div style="min-width:220px;display:none;" id="qrWrap">
            <div style="font-size:14px;color:#374151;margin-bottom:6px;"><b>Scan to open invite link</b></div>
            <img id="qrImg" alt="QR code" style="width:200px;height:200px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;" />
          </div>
        </div>

        <div style="margin-top:18px;">
          <div style="font-size:14px;color:#374151;margin-bottom:8px;"><b>Players</b></div>
          <ul id="playersList" style="margin:0;padding-left:18px;line-height:1.7;"></ul>
          <div id="lobbyStatus" style="margin-top:8px;font-size:12px;color:#6b7280;"></div>
        </div>
      </div>
    `;
    if (anchor && anchor !== document.body) {
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
    } else {
      document.body.appendChild(box);
    }
    return box;
  }

  function qrUrlFor(text) {
    const data = encodeURIComponent(text);
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${data}`;
  }

  async function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length); // iOS
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    return await fallbackCopy(text);
  }

  async function doShare(url) {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'EmojiPick Party Mode', text: 'Join my EmojiPick room!', url });
        return true;
      }
    } catch {}
    return false;
  }

  
// ---------- Room Message / Picks (Next action) ----------
function isHostRole() {
  return getParam('host') === '1';
}

function getRoomCodeFromUI() {
  const { room } = getInputs();
  return upperRoom(room?.value) || upperRoom(getParam('room')) || '';
}

function setRoomMsgUI(data) {
  const box = document.getElementById('roomMsgBox');
  const textEl = document.getElementById('roomMsgText');
  const metaEl = document.getElementById('roomMsgMeta');
  if (!box || !textEl || !metaEl) return;

  const msg = data && data.roomMessage ? data.roomMessage : null;
  if (!msg || !msg.text) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  textEl.textContent = String(msg.text || '');
  const by = msg.by ? String(msg.by) : '';
  const at = msg.at && msg.at.toMillis ? new Date(msg.at.toMillis()) : (msg.at ? new Date(msg.at) : null);
  metaEl.textContent = (by ? `by ${by}` : '') + (at ? ` · ${at.toLocaleString()}` : '');
}

function wireRoomMessage(roomCode) {
  const btnSend = document.getElementById('btnSendToRoom');
  const btnClear = document.getElementById('btnClearRoomMsg');
  const inp = document.getElementById('inpRoomMessage');

  // Only host should send (guests can still view)
  if (btnSend) btnSend.style.display = isHostRole() ? '' : 'none';
  if (btnClear) btnClear.style.display = isHostRole() ? '' : 'none';
  if (inp) inp.disabled = !isHostRole();

  if (btnClear && !btnClear.__wired) {
    btnClear.__wired = true;
    btnClear.addEventListener('click', async (e) => {
      e.preventDefault();
      if (inp) inp.value = '';
      try {
        if (isHostRole()) {
          const db = getDb();
          const code = roomCode || getRoomCodeFromUI();
          if (db && code) {
            await db.collection('rooms').doc(code).set({ roomMessage: null }, { merge: true });
            setMsg('Cleared host posted picks.');
          }
        }
      } catch (err) {
        console.warn('[PartyMode] clear room message failed', err);
      }
    });
  }

  if (btnSend && !btnSend.__wired) {
    btnSend.__wired = true;
    btnSend.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const db = getDb();
      if (!db) return alert('Firebase not ready.');
      const code = roomCode || getRoomCodeFromUI();
      if (!code) return alert('No room code.');
      const name = (getInputs().name?.value || localGet('party_name') || '').trim();

      const text = (inp?.value || '').trim();
      if (!text) return alert('Paste picks / message first.');

      try {
        await db.collection('rooms').doc(code).set({
          roomMessage: {
            text,
            by: name || 'host',
            at: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue && window.firebase.firestore.FieldValue.serverTimestamp)
              ? window.firebase.firestore.FieldValue.serverTimestamp()
              : Date.now()
          }
        }, { merge: true });

        setMsg('Sent to room.');
      } catch (err) {
        console.error('[PartyMode] sendToRoom failed', err);
        alert('Failed to send to room. See console.');
      }
    });
  }
}

function wireLobbyButtons() {
    const btnCopy = $('btnCopyInvite');
    const btnShare = $('btnShareInvite');
    const btnQR = $('btnToggleQR');
    const invite = $('inviteLink');
    const qrWrap = $('qrWrap');

    // Copy invite link
    if (btnCopy && invite && !btnCopy.__wired) {
      btnCopy.__wired = true;
      btnCopy.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const txt = (invite.value || '').trim();
        if (!txt) {
          setMsg('No invite link yet.');
          return;
        }

        const ok = await copyText(txt);
        try { invite.focus(); invite.select(); } catch {}

        if (ok) {
          setMsg('Copied invite link!');
          const prev = btnCopy.textContent;
          btnCopy.textContent = 'Copied!';
          setTimeout(() => { btnCopy.textContent = prev || 'Copy'; }, 1200);
        } else {
          setMsg('Copy failed — please tap & hold the link to copy.');
        }
      });
    }

    // Share invite link (fallback to copy)
    if (btnShare && invite && !btnShare.__wired) {
      btnShare.__wired = true;
      btnShare.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const url = (invite.value || '').trim();
        if (!url) {
          setMsg('No invite link yet.');
          return;
        }

        const ok = await doShare(url);
        if (!ok) {
          const copied = await copyText(url);
          setMsg(copied ? 'Sharing not available — copied instead.' : 'Sharing not available — copy manually.');
        } else {
          setMsg('Invite shared.');
        }
      });
    }

    // Toggle QR
    if (btnQR && qrWrap && !btnQR.__wired) {
      btnQR.__wired = true;
      btnQR.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const show = qrWrap.style.display === 'none' || !qrWrap.style.display;
        qrWrap.style.display = show ? 'block' : 'none';
      });
    }
  }

  function renderPlayers(playersObj, hostName) {
    const ul = $('playersList');
    if (!ul) return;
    ul.innerHTML = '';

    const names = Object.keys(playersObj || {}).sort((a, b) => a.localeCompare(b));
    names.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = (hostName && name === hostName) ? `${name} (host)` : name;
      ul.appendChild(li);
    });

    const status = $('lobbyStatus');
    if (status) status.textContent = `Status: lobby · Players: ${names.length}`;
  }

  function showLobby(roomCode, hostName) {
    ensureLobbyBox();
    wireLobbyButtons();
    try { wireRoomMessage(roomCode); } catch {}
    try { wireGuestActions(roomCode, hostName); } catch {}
    try { applyRoleSectionsUI(roomCode); } catch {}
    try { setTimeout(() => { maybeAutoSubmitOnReturn(roomCode); }, 250); } catch {}
    try { maybeAutoSubmitOnReturn(roomCode); } catch {}
    try { wireLegacyCopyButtons(); } catch {}

    const roomEl = $('lobbyRoomCode');
    if (roomEl) roomEl.textContent = roomCode;

    const invite = $('inviteLink');
    const inviteUrl = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode)}`;
    if (invite) invite.value = inviteUrl;

    const qr = $('qrImg');
    if (qr) qr.src = qrUrlFor(inviteUrl);

    const qrWrap = $('qrWrap');
    if (qrWrap) qrWrap.style.display = 'none'; // show only when user taps QR button

    // live players list
    const db = getDb();
    if (!db) return;

    if (window.__unsubRoom) { try { window.__unsubRoom(); } catch {} }
    window.__unsubRoom = db.collection('rooms').doc(roomCode).onSnapshot((snap) => {
      if (!snap.exists) return;
      const data = snap.data() || {};
      renderPlayers(data.players || {}, data.hostName || hostName || '');
      try { setRoomMsgUI(data); } catch {}
    }, (err) => console.error('[PartyMode] onSnapshot error', err));
  }

  // ---------- core actions ----------
  async function createRoom() {
    const { room, name } = getInputs();
    const hostName = cleanName(name?.value);

    if (!hostName) {
      alert('Please enter your name first.');
      name?.focus?.();
      return;
    }

    const db = getDb();
    if (!db) {
      alert('Firebase not ready yet. Please refresh the page.');
      return;
    }

    localSet('party_name', hostName);

    // Try a few codes in case of collision
    let roomCode = '';
    for (let i = 0; i < 5; i++) {
      const code = genRoomCode();
      const ref = db.collection('rooms').doc(code);
      const existing = await ref.get();
      if (!existing.exists) { roomCode = code; break; }
    }
    if (!roomCode) {
      alert('Could not create a room (code collision). Try again.');
      return;
    }

    const roomRef = db.collection('rooms').doc(roomCode);
    await roomRef.set({
      createdAt: now(),
      hostName,
      status: 'lobby',
      picks: {},
      players: { [hostName]: { joinedAt: now() } }
    }, { merge: true });

    if (room) room.value = roomCode;
    setParam('room', roomCode);
    setParam('host', '1');

    setMsg(`Room created: ${roomCode}`);
    showLobby(roomCode, hostName);
    try { clearPendingPartySubmit(); } catch {}
    try { autoSendLastTicketToRoom(roomCode, hostName); } catch {}
  }

  async function joinRoom() {
    const { room, name } = getInputs();
    const roomCode = upperRoom(room?.value) || upperRoom(getParam('room'));
    const playerName = cleanName(name?.value);

    if (!roomCode) {
      alert('Please enter a room code first.');
      room?.focus?.();
      return;
    }
    if (!playerName) {
      alert('Please enter your name first.');
      name?.focus?.();
      return;
    }

    const db = getDb();
    if (!db) {
      alert('Firebase not ready yet. Please refresh the page.');
      return;
    }

    localSet('party_name', playerName);

    const roomRef = db.collection('rooms').doc(roomCode);
    const snap = await roomRef.get();
    if (!snap.exists) {
      alert(`Room not found: ${roomCode}`);
      return;
    }

    // Add player (merge keeps existing players)
    await roomRef.set({
      players: { [playerName]: { joinedAt: now() } }
    }, { merge: true });

    if (room) room.value = roomCode;
    setParam('room', roomCode);
    setParam('host', ''); // guest

    setMsg(`Joined room ${roomCode} as ${playerName}`);
    showLobby(roomCode, snap.data()?.hostName || '');
  }

  // ---------- boot ----------
  

const PENDING_PARTY_SUBMIT_ROOM = 'emojipick_party_pending_room';
const PENDING_PARTY_SUBMIT_NAME = 'emojipick_party_pending_name';
const PENDING_PARTY_SUBMIT_AT   = 'emojipick_party_pending_at';

function markPendingPartySubmit(roomCode, playerName){
  try {
    localSet(PENDING_PARTY_SUBMIT_ROOM, upperRoom(roomCode||''));
    localSet(PENDING_PARTY_SUBMIT_NAME, String(playerName||''));
    localSet(PENDING_PARTY_SUBMIT_AT, String(Date.now()));
  } catch {}
}
function getPendingPartySubmit(){
  try {
    return {
      room: upperRoom(localGet(PENDING_PARTY_SUBMIT_ROOM) || ''),
      name: String(localGet(PENDING_PARTY_SUBMIT_NAME) || ''),
      at: Number(localGet(PENDING_PARTY_SUBMIT_AT) || 0) || 0
    };
  } catch { return { room:'', name:'', at:0 }; }
}
function clearPendingPartySubmit(){
  try {
    localStorage.removeItem(PENDING_PARTY_SUBMIT_ROOM);
    localStorage.removeItem(PENDING_PARTY_SUBMIT_NAME);
    localStorage.removeItem(PENDING_PARTY_SUBMIT_AT);
  } catch {}
}

// ---------- Guest flow (Option B): jump to main generator then return ----------
const PARTY_ROOM_KEY = 'emojipick_party_room';

function goToMainGenerator(roomCode) {
  const code = upperRoom(roomCode || getParam('room') || '');
  if (!code) return alert('No room code.');
  try { localSet(PARTY_ROOM_KEY, code); } catch {}
  try { markPendingPartySubmit(code, (getInputs().name?.value || localGet('party_name') || '').trim()); } catch {}
  const fallback = `./index.html?room=${encodeURIComponent(code)}&return=party`;
  // keep same origin; using relative path is safest on GitHub Pages
  window.location.href = fallback;
}

async function submitMyPicks(roomCode, playerName) {
  const code = upperRoom(roomCode || getParam('room') || '');
  if (!code) return alert('No room code.');
  const name = (playerName || '').trim() || (getInputs().name?.value || localGet('party_name') || '').trim();
  if (!name) return alert('Enter your name first.');

  const text = getLastTicketText();
  if (!text) return alert('No latest picks found. Tap "Pick emojis & generate" first.');

  const db = getDb();
  if (!db) return alert('Firebase not ready.');
  try {
    await db.collection('rooms').doc(code).collection('submissions').doc(name).set({
      text,
      by: name,
      at: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue && window.firebase.firestore.FieldValue.serverTimestamp)
        ? window.firebase.firestore.FieldValue.serverTimestamp()
        : Date.now()
    }, { merge: true });
    setMsg('Submitted your picks to the room.');
  } catch (e) {
    console.error('[PartyMode] submitMyPicks failed', e);
    console.error('[PartyMode] submit error details', e); alert('Submit failed. See console.');
  }
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

function renderSubmissions(list) {
  const ul = document.getElementById('submissionsList');
  if (!ul) return;
  ul.innerHTML = '';
  const items = (list || []).slice().sort((a,b)=> (a.atMs||0) - (b.atMs||0));
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = 'No submissions yet.';
    ul.appendChild(li);
    return;
  }
  for (const it of items) {
    const li = document.createElement('li');
    const who = it.by || it.id || 'player';
    li.innerHTML = `<b>${escapeHtml(who)}</b>: ${escapeHtml(it.text || '')}`;
    ul.appendChild(li);
  }
}

function watchSubmissions(roomCode) {
  const db = getDb();
  if (!db) return;

  if (window.__unsubSubs) { try { window.__unsubSubs(); } catch {} }
  window.__unsubSubs = db.collection('rooms').doc(roomCode).collection('submissions').onSnapshot((qs) => {
    const list = [];
    qs.forEach((doc) => {
      const d = doc.data() || {};
      const atMs = d.at && d.at.toMillis ? d.at.toMillis() : (typeof d.at === 'number' ? d.at : 0);
      list.push({ id: doc.id, ...d, atMs });
    });
    renderSubmissions(list);
  }, (err)=>{ console.error('[PartyMode] submissions snapshot error', err); setMsg('Submissions read failed (check Firestore rules).'); });
}

function wireGuestActions(roomCode, hostName) {
  const btnGo = document.getElementById('btnGoGenerate');
  const btnSubmit = document.getElementById('btnSubmitMyPicks');

  const isHost = isHostRole();
  if (btnGo) btnGo.style.display = isHost ? 'none' : '';
  if (btnSubmit) btnSubmit.style.display = isHost ? 'none' : '';

  if (btnGo && !btnGo.__wired) {
    btnGo.__wired = true;
    btnGo.addEventListener('click', (e)=>{ e.preventDefault(); goToMainGenerator(roomCode); });
  }
  if (btnSubmit && !btnSubmit.__wired) {
    btnSubmit.__wired = true;
    btnSubmit.addEventListener('click', (e)=>{ 
      e.preventDefault(); 
      const name = (getInputs().name?.value || localGet('party_name') || '').trim();
      if (btnSubmit.disabled) { alert('First tap "Pick emojis & generate", then return here.'); return; }
      submitMyPicks(roomCode, name);
    });
  }

  try { watchSubmissions(roomCode); } catch {}
}


// ---------- UI state / freshness (v4) ----------
const LAST_TICKET_MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes for auto-post safety

function getLastTicketMeta() {
  const text = (getLastTicketText() || '').trim();
  const tsRaw = localGet('emojipick_last_ticket_ts') || localGet('lastTicketTs') || '';
  const ts = Number(tsRaw) || 0;
  return { text, ts, ageMs: ts ? (Date.now() - ts) : Number.POSITIVE_INFINITY };
}

function hasFreshLastTicket() {
  const m = getLastTicketMeta();
  return !!m.text && !!m.ts && m.ageMs >= 0 && m.ageMs <= LAST_TICKET_MAX_AGE_MS;
}

function setGuestSubmitEnabled(roomCode) {
  const btn = document.getElementById('btnSubmitMyPicks');
  if (!btn) return;
  const code = upperRoom(roomCode || getParam('room') || '');
  const p = getPendingPartySubmit();
  const meta = getLastTicketMeta();
  const currentName = (getInputs().name?.value || localGet('party_name') || '').trim();
  const enabled = !!code &&
    p.room === code &&
    !!p.name &&
    !!currentName &&
    p.name === currentName &&
    !!meta.text &&
    !!meta.ts &&
    meta.ageMs >= 0 &&
    meta.ageMs <= LAST_TICKET_MAX_AGE_MS &&
    meta.ts >= (p.at || 0);
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '' : '.55';
  btn.title = enabled ? '' : 'Tap "Pick emojis & generate", then return here.';
}


function hideActionSectionsUntilLobby() {
  try {
    const hs = document.getElementById('hostActionSection');
    const gs = document.getElementById('guestActionSection');
    if (hs) hs.style.display = 'none';
    if (gs) gs.style.display = 'none';
  } catch {}
}

function applyRoleSectionsUI(roomCode) {
  const hostSec = document.getElementById('hostActionSection');
  const guestSec = document.getElementById('guestActionSection');
  const isHost = isHostRole();
  if (hostSec) hostSec.style.display = isHost ? '' : 'none';
  if (guestSec) guestSec.style.display = isHost ? 'none' : '';
  setGuestSubmitEnabled(roomCode);
}


// ---------- Auto-submit guest picks after returning from main generator ----------
function submitFingerprint(roomCode, playerName, text) {
  return `room=${upperRoom(roomCode||'')}|name=${String(playerName||'').trim()}|text=${String(text||'').trim()}`;
}

async function maybeAutoSubmitOnReturn(roomCode) {
  if (isHostRole()) return false;
  const code = upperRoom(roomCode || getParam('room') || '');
  const name = (getInputs().name?.value || localGet('party_name') || '').trim();
  const pending = getPendingPartySubmit();
  const meta = getLastTicketMeta();
  if (!code || !name || !meta.text) return false;
  if (!(pending.room === code && pending.name && pending.name === name)) return false;
  if (!(pending.at && meta.ts && meta.ts >= pending.at)) return false;
  if (!(meta.ageMs >= 0 && meta.ageMs <= LAST_TICKET_MAX_AGE_MS)) return false;

  const fp = submitFingerprint(code, name, meta.text);
  if (localGet('emojipick_last_submit_fp') === fp) return false;

  submitMyPicks(code, name);
  return true;
}


async function maybeAutoResumePartyRoom() {
  try {
    const code = upperRoom(getParam('room') || '');
    if (!code) return false;

    const inputs = getInputs ? getInputs() : {};
    const roomInput = inputs.room;
    const nameInput = inputs.name;
    const savedName = (nameInput?.value || localGet('party_name') || '').trim();
    if (!savedName) return false;

    // If lobby is already visible, watchers should already be attached
    const inviteEl = document.getElementById('inviteLink');
    if (inviteEl) {
      const panel = inviteEl.closest('.card,.panel,section,div');
      if (panel && panel.hidden === false) return false;
    }

    if (roomInput) roomInput.value = code;
    if (nameInput && !nameInput.value) nameInput.value = savedName;

    const db = getDb();
    if (!db) return false;

    // Re-attach player presence and snapshot watchers by showing lobby again
    try {
      await db.collection('rooms').doc(code).collection('players').doc(savedName).set({
        name: savedName,
        joinedAt: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue && window.firebase.firestore.FieldValue.serverTimestamp)
          ? window.firebase.firestore.FieldValue.serverTimestamp()
          : Date.now()
      }, { merge: true });
    } catch {}

    showLobby(code, savedName);
    return true;
  } catch (e) {
    console.warn('[PartyMode] auto-resume failed', e);
    return false;
  }
}

function boot() {
  try { hideActionSectionsUntilLobby(); } catch {}

try {
  window.addEventListener('focus', () => { const __rc = upperRoom(getParam('room') || getInputs().room?.value || ''); setGuestSubmitEnabled(__rc); maybeAutoSubmitOnReturn(__rc); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { const __rc = upperRoom(getParam('room') || getInputs().room?.value || ''); setGuestSubmitEnabled(__rc); maybeAutoSubmitOnReturn(__rc); }
  });
} catch {}

    const { name } = getInputs();
    const { btnCreate, btnJoin } = getButtons();

    // Prevent accidental page reloads caused by <form> submit
    if (!document.__partySubmitGuard) {
      document.__partySubmitGuard = true;
      document.addEventListener('submit', (ev) => {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      }, true);
    }

    // Prefill name from storage
    const savedName = localGet('party_name');
    if (name && savedName && !name.value) name.value = savedName;

    // Prefill room code from URL if present
    const { room } = getInputs();
    const roomFromUrl = upperRoom(getParam('room'));
    if (room && roomFromUrl && !room.value) room.value = roomFromUrl;

    const safeCreate = () => createRoom().catch((e) => {
      console.error('[PartyMode] createRoom error', e);
      alert('Failed to create room. See console for details.');
    });

    const safeJoin = () => joinRoom().catch((e) => {
      console.error('[PartyMode] joinRoom error', e);
      alert('Failed to join room. See console for details.');
    });

    // Direct wiring (if buttons found)
    if (btnCreate && !btnCreate.__wired) {
      btnCreate.__wired = true;
      btnCreate.addEventListener('click', (ev) => { ev?.preventDefault?.(); safeCreate(); });
    }

    if (btnJoin && !btnJoin.__wired) {
      btnJoin.__wired = true;
      btnJoin.addEventListener('click', (ev) => { ev?.preventDefault?.(); safeJoin(); });
    }


    // Delegated COPY wiring (capture phase) — survives stopImmediatePropagation in other handlers
    // Works for different templates: btnCopyInvite, btnCopyTicket, btnCopy
    if (!document.__partyDelegatedCopy) {
      document.__partyDelegatedCopy = true;
      document.addEventListener('click', async (ev) => {
        const t = ev.target && ev.target.closest ? ev.target.closest('#btnCopyInvite,#btnCopyTicket,#btnCopy') : null;
        if (!t) return;

        // Run early (capture), and stop others from interfering
        ev.preventDefault();
        ev.stopPropagation();

        const inviteEl = document.getElementById('inviteLink');
        const invite = (inviteEl?.value ?? inviteEl?.textContent ?? '').trim();

        console.log('[PartyMode] delegated copy', t.id, 'payload=', invite);

        if (!invite) {
          setMsg('No invite link yet.');
          return;
        }

        const ok = await copyText(invite);

        if (ok) {
          setMsg('Copied invite link!');
          const prev = t.textContent;
          t.textContent = 'Copied!';
          setTimeout(() => { t.textContent = prev || 'Copy'; }, 1200);
        } else {
          setMsg('Copy failed — please tap & hold the link to copy.');
        }
      }, true); // capture
    }

    // Delegated wiring (fallback when HTML ids/attrs differ or DOM is replaced)
    if (!document.__partyDelegatedClick) {
      document.__partyDelegatedClick = true;
      document.addEventListener('click', (ev) => {
        const el = ev.target && ev.target.closest
          ? ev.target.closest('button, input[type="button"], input[type="submit"]')
          : null;
        if (!el) return;

        const id = (el.id || '').trim();
        const action = (el.getAttribute('data-action') || el.dataset?.action || '').trim();
        const role = (el.getAttribute('data-role') || el.dataset?.role || '').trim();
        const txt = ((el.textContent || el.value || '') + '').trim().toLowerCase();

        const isJoin = id === 'btnJoin' || action === 'joinRoom' || role === 'join' || txt === 'join';
        const isCreate = id === 'btnCreateRoom' || action === 'createRoom' || role === 'create' || txt.includes('create room');

        if (isJoin) { ev.preventDefault(); safeJoin(); }
        if (isCreate) { ev.preventDefault(); safeCreate(); }
      }, true);
    }

    // Enter key on name triggers Join (nice UX on mobile/desktop)
    if (name && !name.__wiredEnter) {
      name.__wiredEnter = true;
      name.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); safeJoin(); }
      });
    }

    // If page opened with ?room=XXXX, show hint message
    if (roomFromUrl && !isHostFromUrl()) {
      setMsg(`Invited to room ${roomFromUrl}. Enter your name and press Join.`);
    }


    // --- EXTRA: wire legacy Copy buttons in existing HTML (btnCopyTicket / btnCopy)
    // These exist in some templates and were the root cause of "share works, copy doesn't".
    // We always copy the current inviteLink (filled by showLobby()).
    function wireLegacyCopyButtons() {
      const inviteEl = document.getElementById('inviteLink');
      const getInvite = () => (inviteEl?.value ?? inviteEl?.textContent ?? '').trim();

      const wire = (id, label) => {
        const b = document.getElementById(id);
        if (!b || b.__wiredCopyFix) return;
        b.__wiredCopyFix = true;
        try { b.type = 'button'; } catch {}
        b.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const url = getInvite();
          console.log('[PartyMode] legacy copy click', id, 'payload=', url);
          if (!url) {
            setMsg('No invite link yet.');
            return;
          }
          const ok = await copyText(url);
          if (ok) {
            setMsg('Copied invite link!');
            const prev = b.textContent;
            b.textContent = 'Copied!';
            setTimeout(() => { b.textContent = prev || label || 'Copy'; }, 1200);
          } else {
            setMsg('Copy failed — please tap & hold the link to copy.');
          }
        });
      };

      wire('btnCopyTicket', 'Copy as ticket');
      wire('btnCopy', 'Copy link');
    }

    // Call once now, and again after lobby is rendered (DOM can change)
    wireLegacyCopyButtons();
    // If already host and room exists, show lobby immediately on refresh
    if (roomFromUrl) {
      if (isHostFromUrl() && savedName) {
        showLobby(roomFromUrl, savedName);
      }
    }
      try { setTimeout(() => { maybeAutoResumePartyRoom(); }, 150); } catch {}
}

  function isHostFromUrl() { return getParam('host') === '1'; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
