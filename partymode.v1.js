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
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
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

  function wireLobbyButtons() {
    const btnCopy = $('btnCopyInvite');
    const btnShare = $('btnShareInvite');
    const btnQR = $('btnToggleQR');
    const invite = $('inviteLink');
    const qrWrap = $('qrWrap');

    if (btnCopy && invite && !btnCopy.__wired) {
      btnCopy.__wired = true;
      btnCopy.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const invite = $id('inviteLinkInput');
      const txt = (invite && invite.value ? invite.value.trim() : '').trim();
      if (!txt) {
        setMsg('No invite link yet.');
        return;
      }

      const ok = await copyText(txt);
      if (invite) { invite.focus(); invite.select(); }

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

    if (btnShare && invite && !btnShare.__wired) {
      btnShare.__wired = true;
      btnShare.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
        const url = invite.value || '';
        const ok = await doShare(url);
        if (!ok) {
          const copied = await copyText(url);
          setMsg(copied ? 'Sharing not available — copied instead.' : 'Sharing not available — copy manually.');
        } else {
          setMsg('Invite shared.');
        }
      });
    }

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
  function boot() {
    const { room, name } = getInputs();
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

    // If already host and room exists, show lobby immediately on refresh
    if (roomFromUrl) {
      if (isHostFromUrl() && savedName) {
        showLobby(roomFromUrl, savedName);
      }
    }
  }

  function isHostFromUrl() { return getParam('host') === '1'; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
function fallbackCopyTextToClipboard(text) {
  // iOS/Safari 포함 폭넓게 먹는 폴백
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);

  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length); // iOS 대응

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

async function copyTextSmart(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Nothing to copy (empty/invalid text).");
  }

  // 1) 표준 Clipboard API
  // - 보안 컨텍스트 + 사용자 클릭 이벤트 내부에서 호출되어야 안정적
  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, via: "clipboard.writeText" };
    } catch (err) {
      // Safari/PWA/권한 이슈 시 폴백으로 진행
      // console에 남겨서 원인 추적 가능하게 함
      console.warn("clipboard.writeText failed:", err);
    }
  }

  // 2) 폴백
  const ok = fallbackCopyTextToClipboard(text);
  if (ok) return { ok: true, via: "execCommand(copy)" };

  return { ok: false, via: "none" };
}

// ✅ Copy 버튼에 “직접” 연결 (중요: 클릭 핸들러 안에서 복사 실행)
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#copyBtn"); // Copy 버튼에 id="copyBtn"가 있어야 함
  if (!btn) return;

  try {
    // 여기에서 "복사할 문자열"을 정확히 가져오세요.
    // 아래 3줄 중 프로젝트에 맞는 걸 하나로 고정하면 됩니다.

    // (예시 A) 화면에 있는 초대링크 input
    const linkEl = document.getElementById("inviteLink");
    const textToCopy = linkEl ? linkEl.value : "";

    // (예시 B) 데이터 속성에서 가져오기 (버튼에 data-copy="..." 넣는 방식)
    // const textToCopy = btn.getAttribute("data-copy") || "";

    // (예시 C) 코드에서 생성한 inviteUrl 변수가 있다면 그걸 사용
    // const textToCopy = window.inviteUrl || inviteUrl || "";

    console.log("COPY payload =", textToCopy); // ★ 빈 값인지 바로 확인됨

    const res = await copyTextSmart(textToCopy);

    if (res.ok) {
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 900);
    } else {
      alert("Copy failed. Please long-press to copy manually.");
    }
  } catch (err) {
    console.error(err);
    alert("Copy error: " + (err?.message || err));
  }
});
