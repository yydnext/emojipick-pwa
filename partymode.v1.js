/* EmojiPick Party Mode (Firestore) - stable UI + realtime lobby
 * Host: enter name -> Create room (auto-joins host)
 * Guest: open invite link (room prefilled) -> enter name -> Join
 * Both: Lobby shows realtime players list
 *
 * Requires partymode.html includes firebase-app-compat.js + firebase-firestore-compat.js
 * and sets: window.db = firebase.firestore();
 */
(function () {
  'use strict';

  function log() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[PartyMode]');
      console.log.apply(console, args);
    } catch (_) {}
  }
  function $(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function safeText(el, text) { if (el) el.textContent = text; }

  function setMsg(msg) {
    var el = $('msg') || qs('[data-role="msg"]') || qs('.msg');
    if (el) el.textContent = msg || '';
    if (msg) log(msg);
  }

  function getDb() {
    if (window.db && typeof window.db.collection === 'function') return window.db;
    if (window.firebase && window.firebase.firestore) return window.firebase.firestore();
    return null;
  }

  function upperRoom(s) {
    return (s || '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function now() { return Date.now(); }

  function genRoomCode(len) {
    len = len || 4;
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1
    var out = '';
    for (var i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function pickInput(opts) {
    opts = opts || {};
    var ids = opts.ids || [];
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (el && el.tagName === 'INPUT') return el;
    }
    if (opts.placeholderToken) {
      var token = opts.placeholderToken.toLowerCase();
      var inputs = qsa('input');
      for (var j = 0; j < inputs.length; j++) {
        var ph = (inputs[j].getAttribute('placeholder') || '').toLowerCase();
        if (ph.indexOf(token) >= 0) return inputs[j];
      }
    }
    return null;
  }

  var inpRoom = null, inpName = null, btnCreate = null, btnJoin = null;
  var lobbyBox = null, unsubRoom = null;

  function getInputs() {
    inpRoom = pickInput({ ids: ['room', 'roomCode', 'inputRoom', 'inputRoomCode'], placeholderToken: 'room code' })
          || pickInput({ placeholderToken: 'room' })
          || qs('input[placeholder*="Room"]') || qs('input[placeholder*="room"]');

    inpName = pickInput({ ids: ['name', 'hostName', 'playerName', 'inputName', 'inputHostName', 'inputPlayerName'], placeholderToken: 'your name' })
          || pickInput({ placeholderToken: 'name' })
          || qs('input[placeholder*="Your name"]') || qs('input[placeholder*="name"]');

    btnCreate = $('btnCreateRoom') || qs('button#btnCreateRoom, button[data-action="createRoom"], button[data-role="create-room"]');
    btnJoin   = $('btnJoin')       || qs('button#btnJoin, button[data-action="joinRoom"], button[data-role="join-room"]');
  }

  function ensureLobbyBox() {
    if (lobbyBox) return lobbyBox;
    lobbyBox = $('lobbyBox') || qs('#lobbyBox') || qs('[data-role="lobbyBox"]');
    if (!lobbyBox) {
      lobbyBox = document.createElement('div');
      lobbyBox.id = 'lobbyBox';
      lobbyBox.style.marginTop = '24px';
      lobbyBox.style.border = '1px solid #eee';
      lobbyBox.style.borderRadius = '16px';
      lobbyBox.style.padding = '18px';
      lobbyBox.style.maxWidth = '900px';
      lobbyBox.style.background = '#fff';

      var anchor = qs('.card, .panel, .container') || document.body;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(lobbyBox, anchor.nextSibling);
      else document.body.appendChild(lobbyBox);
    }
    return lobbyBox;
  }

  function setLobbyVisible(show) {
    var box = ensureLobbyBox();
    box.style.display = show ? '' : 'none';
  }

  function fallbackCopy(text) {
    var tmp = document.createElement('textarea');
    tmp.value = text;
    tmp.style.position = 'fixed';
    tmp.style.left = '-9999px';
    document.body.appendChild(tmp);
    tmp.select();
    try { document.execCommand('copy'); setMsg('Invite link copied.'); }
    catch (_) { setMsg('Copy failed. Please copy manually.'); }
    document.body.removeChild(tmp);
  }

  function renderLobbySkeleton(roomCode, inviteUrl) {
    var box = ensureLobbyBox();

    box.innerHTML = ''
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">'
      + '  <div style="min-width:260px;flex:1;">'
      + '    <div style="font-size:22px;font-weight:700;margin-bottom:6px;">Lobby</div>'
      + '    <div style="margin:6px 0 2px 0;"><b>Room:</b> <span id="lobbyRoomCode"></span></div>'
      + '    <div style="margin:10px 0 6px 0;"><b>Invite link:</b></div>'
      + '    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      + '      <input id="inviteLink" style="flex:1;min-width:260px;padding:10px 12px;border:1px solid #ddd;border-radius:10px;" readonly />'
      + '      <button id="btnCopyInvite" style="padding:10px 12px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer;">Copy</button>'
      + '      <button id="btnShareInvite" style="padding:10px 12px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer;">Share</button>'
      + '    </div>'
      + '    <div style="color:#666;font-size:12px;margin-top:6px;">Tip: Tap “Share” to send via SMS/WhatsApp, or “Copy” to paste anywhere.</div>'
      + '  </div>'
      + '  <div style="min-width:220px;">'
      + '    <div style="font-weight:600;margin-bottom:6px;">Scan to open invite link</div>'
      + '    <img id="qrImg" alt="QR" style="width:200px;height:200px;border:1px solid #eee;border-radius:12px;" />'
      + '  </div>'
      + '</div>'
      + '<div style="margin-top:16px;">'
      + '  <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Players</div>'
      + '  <ul id="playersList" style="margin:0;padding-left:18px;"></ul>'
      + '  <div id="lobbyStatus" style="margin-top:10px;color:#666;font-size:12px;"></div>'
      + '</div>';

    safeText($('lobbyRoomCode'), roomCode);

    var inviteInput = $('inviteLink');
    if (inviteInput) inviteInput.value = inviteUrl;

    var qr = $('qrImg');
    if (qr) qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(inviteUrl);

    var btnCopy = $('btnCopyInvite');
    if (btnCopy) btnCopy.onclick = function () {
      var text = inviteUrl;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { setMsg('Invite link copied.'); })
            .catch(function () { fallbackCopy(text); });
        } else {
          fallbackCopy(text);
        }
      } catch (_) { fallbackCopy(text); }
    };

    var btnShare = $('btnShareInvite');
    if (btnShare) btnShare.onclick = function () {
      try {
        if (navigator.share) {
          navigator.share({ title: 'EmojiPick Party Mode', text: 'Join my room: ' + roomCode, url: inviteUrl })
            .catch(function () {});
        } else {
          setMsg('Share not supported here. Use Copy instead.');
        }
      } catch (e) { log(e); }
    };
  }

  function updatePlayersList(playersObj, hostName) {
    var ul = $('playersList');
    if (!ul) return;
    ul.innerHTML = '';

    var names = Object.keys(playersObj || {});
    names.sort(function (a, b) { return a.localeCompare(b); });

    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var li = document.createElement('li');
      li.textContent = name + (hostName && name === hostName ? ' (host)' : '');
      ul.appendChild(li);
    }

    var status = $('lobbyStatus');
    if (status) status.textContent = 'Status: ' + ((window.__roomStatus || 'lobby')) + ' · Players: ' + names.length;
  }

  function inviteUrlFor(roomCode) {
    var base = location.origin + location.pathname;
    return base + '?room=' + encodeURIComponent(roomCode);
  }

  function setUrlParams(params) {
    try {
      var u = new URL(location.href);
      Object.keys(params || {}).forEach(function (k) {
        if (params[k] === null || params[k] === undefined || params[k] === '') u.searchParams.delete(k);
        else u.searchParams.set(k, params[k]);
      });
      history.replaceState({}, '', u.toString());
    } catch (_) {}
  }

  function listenRoom(roomCode) {
    var db = getDb();
    if (!db) return;

    if (unsubRoom) { try { unsubRoom(); } catch (_) {} unsubRoom = null; }

    var roomRef = db.collection('rooms').doc(roomCode);
    unsubRoom = roomRef.onSnapshot(function (snap) {
      if (!snap || !snap.exists) { setMsg('Room not found (yet).'); return; }
      var data = snap.data() || {};
      window.__roomStatus = data.status || 'lobby';
      updatePlayersList(data.players || {}, data.hostName || '');
    }, function (err) { log('onSnapshot error', err); });
  }

  function showLobby(roomCode) {
    var url = inviteUrlFor(roomCode);
    renderLobbySkeleton(roomCode, url);
    setLobbyVisible(true);
    listenRoom(roomCode);
  }

  async function createRoom() {
    try {
      getInputs();
      var db = getDb();
      if (!db) { setMsg('Firebase db not ready.'); return; }

      var hostName = (inpName && inpName.value ? inpName.value : '').trim();
      if (!hostName) { alert('Please enter your name first.'); if (inpName) inpName.focus(); return; }

      var roomCode = '';
      for (var i = 0; i < 6; i++) {
        var candidate = genRoomCode(4);
        // eslint-disable-next-line no-await-in-loop
        var exists = await db.collection('rooms').doc(candidate).get();
        if (!exists.exists) { roomCode = candidate; break; }
      }
      if (!roomCode) { setMsg('Could not generate room code.'); return; }

      var roomRef = db.collection('rooms').doc(roomCode);
      var payload = { createdAt: now(), hostName: hostName, status: 'lobby', picks: {}, players: {} };
      payload.players[hostName] = { joinedAt: now() };

      await roomRef.set(payload, { merge: false });

      if (inpRoom) inpRoom.value = roomCode;
      if (inpName) inpName.value = hostName;

      setUrlParams({ room: roomCode, host: '1' });

      showLobby(roomCode);
      setMsg('Room created: ' + roomCode);
      log('createRoom success', roomCode);
    } catch (e) {
      log('createRoom error', e);
      setMsg('Failed to create room. See console.');
    }
  }

  async function joinRoom() {
    try {
      getInputs();
      var db = getDb();
      if (!db) { setMsg('Firebase db not ready.'); return; }

      var roomCode = upperRoom(inpRoom && inpRoom.value);
      var name = (inpName && inpName.value ? inpName.value : '').trim();

      if (!roomCode) { alert('Please enter a room code.'); if (inpRoom) inpRoom.focus(); return; }
      if (!name) { alert('Please enter your name first.'); if (inpName) inpName.focus(); return; }

      var roomRef = db.collection('rooms').doc(roomCode);
      var snap = await roomRef.get();
      if (!snap.exists) { setMsg('Room not found: ' + roomCode); return; }

      var joinPayload = { players: {} };
      joinPayload.players[name] = { joinedAt: now() };
      await roomRef.set(joinPayload, { merge: true });

      setUrlParams({ room: roomCode });

      showLobby(roomCode);
      setMsg('Joined room ' + roomCode + ' as ' + name);
      log('joinRoom success', roomCode, name);
    } catch (e) {
      log('joinRoom error', e);
      setMsg('Failed to join room. See console.');
    }
  }

  function bindUI() {
    getInputs();

    if (btnCreate) btnCreate.addEventListener('click', function (e) { e.preventDefault(); createRoom(); });
    if (btnJoin) btnJoin.addEventListener('click', function (e) { e.preventDefault(); joinRoom(); });

    try {
      var sp = new URLSearchParams(location.search);
      var roomFromUrl = sp.get('room');
      var nameFromUrl = sp.get('name');

      if (roomFromUrl && inpRoom) inpRoom.value = upperRoom(roomFromUrl);
      if (nameFromUrl && inpName) inpName.value = (nameFromUrl || '').trim();

      // Always show lobby preview when room is present (helps user confirm they opened the right room).
      if (roomFromUrl) showLobby(upperRoom(roomFromUrl));
    } catch (_) {}

    window.createRoom = createRoom;
    window.joinRoom = joinRoom;

    log('UI ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUI);
  else bindUI();
})();
