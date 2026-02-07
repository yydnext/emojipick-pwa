// partymode.v1.js
// Assumption: you have Firebase initialized somewhere accessible.
// BEST practice: create a dedicated firebase module that exports { db, auth }.
// For now, we expect one of the following to exist:
//  - window.EMOJIPICK_DB (recommended)
//  - window.db
// If neither exists, we show a clear error.


/* ------------------ Utilities ------------------ */

const $ = (id) => document.getElementById(id);

function setYear() { $("year").textContent = new Date().getFullYear(); }

function showView(name) {
  const views = ["viewEntry","viewLobby","viewPick","viewResult"];
  for (const v of views) $(v).hidden = (v !== name);
}

function randCode(len = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function getParam(name) {
  const url = new URL(location.href);
  return (url.searchParams.get(name) || "").trim();
}

function inviteLink(code) {
  const url = new URL(location.href);
  url.searchParams.set("room", code);
  return url.toString();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied!");
  } catch {
    prompt("Copy this:", text);
  }
}

function normalizeName(s) {
  return (s || "").trim().slice(0, 20);
}

/* ------------------ Fortune (v1: table-based) ------------------ */

const FORTUNES = [
  "Small steps today lead to big wins tomorrow.",
  "Your luck grows when you share it.",
  "A good surprise is closer than you think.",
  "Be kind to yourself—your timing is perfect.",
  "Your next choice opens a better path."
];

function pickFortune(seedStr) {
  // simple deterministic hash
  let h = 0;
  for (let i=0;i<seedStr.length;i++) h = (h*31 + seedStr.charCodeAt(i)) >>> 0;
  return FORTUNES[h % FORTUNES.length];
}

/* ------------------ Emoji pool (simple v1) ------------------ */

const EMOJIS = ["✨","🍀","🌈","🔥","💎","🧲","🎯","🦄","🌟","🍯","🧧","💰","🐉","🐯","🦊","🐼","🌿","🌸","🌊","🌙"];

function renderEmojiGrid(selected, onToggle) {
  const grid = $("emojiGridParty");
  grid.innerHTML = "";
  for (const e of EMOJIS) {
    const btn = document.createElement("button");
    btn.className = "emojiBtn"; // uses existing css if any
    btn.type = "button";
    btn.textContent = e;
    btn.setAttribute("aria-pressed", selected.has(e) ? "true" : "false");
    if (selected.has(e)) btn.classList.add("picked");
    btn.addEventListener("click", () => onToggle(e));
    grid.appendChild(btn);
  }
}

/* ------------------ Firebase Bootstrap ------------------ */

function getDbAuth() {
  const db = window.db;
  if (!db) throw new Error("Firebase not ready: window.db is missing. Check partymode.html init order.");
  return { db, auth: null };
}

/* ------------------ Party State ------------------ */
/**
 * This file uses "modular-like" helper functions (doc/collection/query/etc.)
 * but the page loads Firebase **compat** SDKs. The helpers below adapt calls
 * to the compat Firestore instance exposed as window.db in partymode.html.
 */
function serverTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

function _isDbLike(x) { return x && typeof x.collection === "function"; }
function collection(root, ...segments) {
  if (!_isDbLike(root)) throw new Error("collection(): invalid root");
  let ref = root;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i % 2 === 0) ref = ref.collection(seg);
    else ref = ref.doc(seg);
  }
  return ref;
}
function doc(root, ...segments) {
  if (!_isDbLike(root)) throw new Error("doc(): invalid root");
  let ref = root;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i % 2 === 0) ref = ref.collection(seg);
    else ref = ref.doc(seg);
  }
  return ref;
}
async function addDoc(colRef, data) {
  return await colRef.add(data);
}
async function setDoc(docRef, data, options) {
  return await docRef.set(data, options);
}
async function updateDoc(docRef, data) {
  return await docRef.update(data);
}
async function getDoc(docRef) {
  return await docRef.get();
}
async function getDocs(q) {
  return await q.get();
}
function onSnapshot(ref, cb) {
  return ref.onSnapshot(cb);
}
function where(field, op, value) {
  return { t: "where", field, op, value };
}
function orderBy(field, direction = "asc") {
  return { t: "orderBy", field, direction };
}
function limit(n) {
  return { t: "limit", n };
}
function query(base, ...ops) {
  let q = base;
  for (const op of ops) {
    if (!op) continue;
    if (op.t === "where") q = q.where(op.field, op.op, op.value);
    else if (op.t === "orderBy") q = q.orderBy(op.field, op.direction);
    else if (op.t === "limit") q = q.limit(op.n);
  }
  return q;
}

let db, auth;
let roomCode = "";
let roomId = "";
let playerId = "";
let isHost = false;

let unsubRoom = null;
let unsubPlayers = null;

function cleanupListeners() {
  if (unsubRoom) { unsubRoom(); unsubRoom = null; }
  if (unsubPlayers) { unsubPlayers(); unsubPlayers = null; }
}

/* ------------------ Firestore Paths ------------------ */

function roomRefById(id) { return doc(db, "rooms", id); }
function playersCol(roomId) { return collection(db, "rooms", roomId, "players"); }

/* ------------------ Core Actions ------------------ */

function _getOrCreateUid() {
  const key = "__pm_uid__";
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = (crypto?.randomUUID?.() || ("uid-" + Math.random().toString(36).slice(2))) ;
    localStorage.setItem(key, uid);
  }
  return uid;
}

async function ensureAnonAuth() {
  // We intentionally avoid Firebase Auth to keep the demo simple.
  // Firestore rules in "test mode" allow access without authentication.
  return { uid: _getOrCreateUid() };
}

async function createRoom() {
  console.log("[PartyMode] createRoom() clicked");

  // 1) basic DOM sanity
  const btn = document.getElementById("btnCreateRoom");
  if (btn) btn.disabled = true;

  try {
    // 2) Ask name first so user sees immediate response
    const hostName = (prompt("Your name (host)?", "") || "").trim();
    if (!hostName) {
      alert("Please enter your name.");
      return;
    }

    // 3) Ensure Firestore is ready
    const { db } = getDbAuth(); // auth is optional in this build
    console.log("[PartyMode] Firestore OK. window.db =", db);

    // 4) Create room document
    const roomDoc = await addDoc(collection(db, "rooms"), {
      createdAt: serverTimestamp(),
      status: "open",
      hostName,
    });

    const roomId = roomDoc.id;
    const roomCode = makeRoomCode(roomId);

    // Save host player
    const playerId = makePlayerId();
    await setDoc(doc(db, "rooms", roomId, "players", playerId), {
      name: hostName,
      isHost: true,
      joinedAt: serverTimestamp(),
    });

    // Save room code so joiners can resolve it
    await setDoc(doc(db, "roomCodes", roomCode), {
      roomId,
      createdAt: serverTimestamp(),
    });

    // UI: show code + link
    roomCodeEl.textContent = roomCode;
    roomLinkEl.value = makeRoomLink(roomCode);
    hostPanel.style.display = "block";
    joinPanel.style.display = "none";

    // Keep state
    isHost = true;
    window.__PARTY_ROOM__ = { roomId, roomCode, playerId, isHost };

    console.log("[PartyMode] Room created:", { roomId, roomCode, playerId });
  } catch (err) {
    console.error("[PartyMode] createRoom failed:", err);
    // Show friendly message
    const msg = (err && err.message) ? err.message : String(err);
    alert(
      "Create room failed.

" +
      msg +
      "

If you see 'Missing or insufficient permissions', check Firestore rules (test mode) or enable Auth."
    );
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function findRoomByCode(code) {
  // rooms 컬렉션에서 roomCode == code 검색 (간단하게 전체 scan은 비추)
  // v1에서는 인덱스 쿼리를 쓰는 게 맞지만, CDN 모듈만으로는 where import 필요
  // 여기선 where를 포함해서 정석으로 갑니다:
  const roomsQ = query(collection(db, "rooms"), where("roomCode", "==", code));
  const snap = await getDocs(roomsQ);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, data: d.data() };
}

async function joinRoom() {
  const code = $("inpRoomCode").value.trim().toUpperCase();
  const name = normalizeName($("inpName").value);
  if (!code || code.length < 4) { alert("Enter a valid room code."); return; }
  if (!name) { alert("Enter your name."); return; }

  const user = await ensureAnonAuth();

  const found = await findRoomByCode(code);
  if (!found) { alert("Room not found."); return; }

  roomId = found.id;
  roomCode = code;
  isHost = false;

  const pRef = await addDoc(playersCol(roomId), {
    uid: user.uid,
    name,
    isHost: false,
    joinedAt: serverTimestamp(),
    pickedEmojis: [],
    submittedAt: null,
    matches: 0,
    score: 0
  });
  playerId = pRef.id;

  enterLobbyUI();
  attachRoomListeners();
}

async function setGame(game) {
  if (!isHost) return;
  await updateDoc(roomRefById(roomId), {
    game,
    updatedAt: serverTimestamp()
  });
}

async function startGame() {
  if (!isHost) return;
  await updateDoc(roomRefById(roomId), {
    status: "playing",
    updatedAt: serverTimestamp()
  });
}

async function submitPick(pickedArr) {
  // store on player doc
  const pDoc = doc(db, "rooms", roomId, "players", playerId);
  await updateDoc(pDoc, {
    pickedEmojis: pickedArr,
    submittedAt: serverTimestamp()
  });
}

function computeNumbers(seedStr, game) {
  // v1: deterministic pseudo-random
  let h = 0;
  for (let i=0;i<seedStr.length;i++) h = (h*33 + seedStr.charCodeAt(i)) >>> 0;

  function nextInt(max) {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h % max;
  }

  if (game === "pb") {
    // 5 numbers 1-69 + PB 1-26
    const set = new Set();
    while (set.size < 5) set.add(1 + nextInt(69));
    const main = Array.from(set).sort((a,b)=>a-b);
    const pb = 1 + nextInt(26);
    return [...main, pb];
  } else {
    // mm: 5 numbers 1-70 + MB 1-25
    const set = new Set();
    while (set.size < 5) set.add(1 + nextInt(70));
    const main = Array.from(set).sort((a,b)=>a-b);
    const mb = 1 + nextInt(25);
    return [...main, mb];
  }
}

async function revealResults(currentRoom) {
  if (!isHost) return;

  const seedStr = currentRoom.seed || `${roomCode}-${new Date().toISOString().slice(0,10)}`;
  const game = currentRoom.game || "pb";
  const numbers = computeNumbers(seedStr, game);

  // Save into room doc
  await updateDoc(roomRefById(roomId), {
    status: "revealed",
    resultNumbers: numbers,
    revealAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // After reveal: score players (simple: count intersection between player's derived numbers and room result)
  // For v1, player's "score" is based on their emojis -> personal numbers generation with same seed + their emojis.
  await scoreAllPlayers(currentRoom, numbers);
}

function numbersFromEmojis(seedStr, emojis, game) {
  const base = `${seedStr}|${(emojis||[]).join("")}|${game}`;
  return computeNumbers(base, game);
}

async function scoreAllPlayers(currentRoom, roomNumbers) {
  const game = currentRoom.game || "pb";
  const seedStr = currentRoom.seed || "";
  const pSnap = await getDocs(playersCol(roomId));

  const updates = [];
  pSnap.forEach((p) => {
    const data = p.data();
    const myNums = numbersFromEmojis(seedStr, data.pickedEmojis || [], game);

    // match count (first 5 with first 5, and bonus ball match separately)
    const mainRoom = roomNumbers.slice(0,5);
    const bonusRoom = roomNumbers[5];

    const mainMine = myNums.slice(0,5);
    const bonusMine = myNums[5];

    const mainMatches = mainMine.filter(n => mainRoom.includes(n)).length;
    const bonusMatch = (bonusMine === bonusRoom) ? 1 : 0;
    const matches = mainMatches + bonusMatch;

    // simple score weighting
    const score = mainMatches * 10 + bonusMatch * 15;

    updates.push(updateDoc(doc(db, "rooms", roomId, "players", p.id), {
      matches,
      score
    }));
  });

  await Promise.all(updates);
}

/* ------------------ Listeners & UI updates ------------------ */

function enterLobbyUI() {
  $("lblRoomCode").textContent = roomCode;
  $("lblRoomCode2").textContent = roomCode;
  showView("viewLobby");

  $("btnStart").hidden = !isHost;
  $("selGame").disabled = !isHost;
}

function enterPickUI() {
  showView("viewPick");
}

function enterResultUI() {
  showView("viewResult");
}

function renderPlayers(list) {
  // list: array of {id, ...}
  const wrap = $("playerList");
  wrap.innerHTML = "";
  list.forEach((p) => {
    const row = document.createElement("div");
    row.className = "row between";
    row.style.padding = "8px 10px";
    row.style.border = "1px solid #e6e8f0";
    row.style.borderRadius = "12px";
    row.style.marginBottom = "8px";

    const left = document.createElement("div");
    left.innerHTML = `<b>${p.name}</b> ${p.isHost ? '<span class="badge">Host</span>' : ""}`;

    const right = document.createElement("div");
    const submitted = p.submittedAt ? "✅" : "—";
    right.innerHTML = `<span class="muted">submitted</span> ${submitted}`;

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });
}

function renderRanking(list) {
  const wrap = $("rankingList");
  wrap.innerHTML = "";
  const sorted = [...list].sort((a,b) => (b.score||0) - (a.score||0));

  sorted.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "row between";
    row.style.padding = "8px 10px";
    row.style.border = "1px solid #e6e8f0";
    row.style.borderRadius = "12px";
    row.style.marginBottom = "8px";

    row.innerHTML = `
      <div><b>#${idx+1}</b> ${p.name} ${p.isHost ? '<span class="badge">Host</span>' : ""}</div>
      <div class="muted">score ${p.score||0} / matches ${p.matches||0}</div>
    `;
    wrap.appendChild(row);
  });
}

function attachRoomListeners() {
  cleanupListeners();

  // Room listener
  unsubRoom = onSnapshot(roomRefById(roomId), (snap) => {
    if (!snap.exists) return;
    const room = snap.data();

    // keep room code labels
    $("lblRoomCode").textContent = room.roomCode || roomCode;
    $("lblRoomCode2").textContent = room.roomCode || roomCode;

    // sync game selection UI
    $("selGame").value = room.game || "pb";

    if (room.status === "lobby") {
      enterLobbyUI();
    } else if (room.status === "playing") {
      enterPickUI();
    } else if (room.status === "revealed") {
      enterResultUI();
      const nums = room.resultNumbers || [];
      $("partyNumbers").textContent = nums.length ? nums.join("  ") : "—";
      $("partyFortune").textContent = pickFortune(`${room.seed||""}|${room.roomCode||""}|${room.round||1}`);
    }
  });

  // Players listener
  const playersQ = query(playersCol(roomId), orderBy("joinedAt", "asc"));
  unsubPlayers = onSnapshot(playersQ, (snap) => {
    const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPlayers(players);

    // submitted stats
    const total = players.length;
    const submitted = players.filter(p => p.submittedAt).length;
    $("lblTotal").textContent = String(total);
    $("lblSubmitted").textContent = String(submitted);

    // host reveal button: show if host + at least 1 submitted (or all submitted - choose policy)
    if (isHost) {
      $("btnReveal").hidden = false;
      // stricter policy example:
      // $("btnReveal").disabled = (submitted === 0);
      $("btnReveal").disabled = (submitted < total); // reveal only when all submitted
    }

    // ranking (after revealed)
    // safe to render anytime (scores might be 0)
    renderRanking(players);
  });
}

/* ------------------ UI Wiring ------------------ */

function initUI() {
  setYear();

  $("btnCreateRoom").addEventListener("click", createRoom);
  $("btnJoinRoom").addEventListener("click", joinRoom);

  $("btnCopyInvite").addEventListener("click", () => copyText(inviteLink(roomCode)));
  $("btnCopyPartyLink").addEventListener("click", () => copyText(inviteLink(roomCode)));

  $("selGame").addEventListener("change", (e) => setGame(e.target.value));

  $("btnStart").addEventListener("click", startGame);

  // Pick UI
  const selected = new Set();

  function syncPickUI() {
    $("pickedCount").textContent = String(selected.size);
    $("btnSubmitParty").disabled = (selected.size !== 6);
    renderEmojiGrid(selected, (emoji) => {
      if (selected.has(emoji)) selected.delete(emoji);
      else {
        if (selected.size >= 6) return;
        selected.add(emoji);
      }
      syncPickUI();
    });
  }

  $("btnResetParty").addEventListener("click", () => {
    selected.clear();
    syncPickUI();
  });

  $("btnSubmitParty").addEventListener("click", async () => {
    const arr = Array.from(selected);
    await submitPick(arr);
    alert("Submitted!");
  });

  $("btnReveal").addEventListener("click", async () => {
    const snap = await getDoc(roomRefById(roomId));
    if (!snap.exists) return;
    await revealResults(snap.data());
  });

  // Result button placeholder
  $("btnCopyTicketParty").addEventListener("click", () => {
    alert("Copy-as-ticket will be implemented next (after Party v1 stabilizes).");
  });

  // Auto-fill room code from URL
  const roomFromUrl = getParam("room");
  if (roomFromUrl) {
    $("inpRoomCode").value = roomFromUrl.toUpperCase();
  }

  showView("viewEntry");
}

/* ------------------ Boot ------------------ */

(async function boot() {
  try {
    // Firebase must already be initialized (same config as your app)
    ({ db, auth } = getDbAuth());
    initUI();
  } catch (e) {
    console.error(e);
    alert("Firebase app not initialized on this page.\n\nFix: ensure partymode.html loads the same Firebase init as index.html (e.g., app.v11.js or firebase.ts module).");
  }
})();
