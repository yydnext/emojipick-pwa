/* =========================================================
   EmojiPick - Party Mode (Compat Firestore version)
   - Requires: partymode.html loads firebase-app-compat + firestore-compat
   - And runs: firebase.initializeApp(firebaseConfig); window.db = firebase.firestore();
   ========================================================= */

(() => {
  "use strict";

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const show = (id) => { const el = $(id); if (el) el.classList.remove("hidden"); };
  const hide = (id) => { const el = $(id); if (el) el.classList.add("hidden"); };
  const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
  const setHTML = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

  // ---------- Safety: Firebase/Firestore presence ----------
  function getDbOrThrow() {
    const db = window.db;
    if (!db) {
      console.error("[PartyMode] window.db is missing. Check partymode.html Firebase init order.");
      throw new Error("Firebase not ready: window.db is missing.");
    }
    return db;
  }

  // ---------- Footer year ----------
  try {
    const y = $("year");
    if (y) y.textContent = String(new Date().getFullYear());
  } catch (_) {}

  // ---------- State ----------
  const EMOJIS = [
    "✨","🍀","🌈","🔥","💎","🧲","🎯","🦄","🌟","💰",
    "🐉","🐯","🦊","🐼","🌿","🌸","🌊","🌙","☀️","⭐",
    "🎁","🎉","🏆","🚀","🧠","⚡","🪙","🧿","🧩","🕊️",
    "🍯","🍎","🍇","🍓","🥑","🌮","🍣","☕","🧋","🎵"
  ];
  const MAX_PICK = 6;

  let db = null;

  let roomId = null;
  let roomCode = null;
  let playerId = null;
  let playerName = null;
  let isHost = false;

  let unsubRoom = null;
  let unsubPlayers = null;

  let picked = []; // emojis
  let game = "pb"; // pb | mm  (default)

  // ---------- IDs from HTML ----------
  // viewEntry, viewLobby, viewPick, viewResult
  // btnCreateRoom, btnJoinRoom, btnLeave, btnStart, btnSubmit, btnReveal
  // inRoomCode, inPlayerName, outRoomCode, outHostHint, playersList
  // emojiGrid, pickedRow, resultBox

  // ---------- Utilities ----------
  function genRoomCode() {
    // 4 chars, no confusing ones
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function genId(prefix = "p") {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(2)}`;
  }

  function persistPlayerId() {
    // per-device stable id
    const key = "party_player_id";
    const saved = localStorage.getItem(key);
    if (saved) return saved;
    const id = genId("player");
    localStorage.setItem(key, id);
    return id;
  }

  function serverTimestamp() {
    // compat FieldValue
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function hashToRange(str, min, max) {
    // stable number from emoji string
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const span = (max - min + 1);
    const n = (Math.abs(h) % span) + min;
    return n;
  }

  function uniqueSorted(arr) {
    return Array.from(new Set(arr)).sort((a, b) => a - b);
  }

  function randomUniqueNumbers(count, min, max) {
    const s = new Set();
    while (s.size < count) {
      s.add(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return Array.from(s).sort((a, b) => a - b);
  }

  function mapEmojisToNumbers(emojis, gameType) {
    // For party fun: deterministic map emoji -> numbers
    // first 5 => white balls, last 1 => special ball
    const whites = emojis.slice(0, 5).map(e => {
      if (gameType === "mm") return hashToRange(e, 1, 70);
      return hashToRange(e, 1, 69); // pb
    });
    const specialEmoji = emojis[5] || "✨";
    const special = (gameType === "mm")
      ? hashToRange(specialEmoji, 1, 25)
      : hashToRange(specialEmoji, 1, 26);
    return { whites: uniqueSorted(whites).slice(0, 5), special };
  }

  function scoreEntry(playerNums, winningNums) {
    const wSet = new Set(winningNums.whites);
    let matchWhite = 0;
    for (const n of playerNums.whites) if (wSet.has(n)) matchWhite++;
    const matchSpecial = (playerNums.special === winningNums.special);
    const score = matchWhite * 10 + (matchSpecial ? 5 : 0);
    return { matchWhite, matchSpecial, score };
  }

  function switchView(name) {
    hide("viewEntry"); hide("viewLobby"); hide("viewPick"); hide("viewResult");
    show(name);
  }

  function cleanupSubs() {
    if (typeof unsubRoom === "function") unsubRoom();
    if (typeof unsubPlayers === "function") unsubPlayers();
    unsubRoom = null;
    unsubPlayers = null;
  }

  // ---------- Render ----------
  function renderPlayers(players) {
    if (!$("playersList")) return;
    if (!players.length) {
      setHTML("playersList", `<div class="muted">No players yet.</div>`);
      return;
    }

    const rows = players.map(p => {
      const hostBadge = p.isHost ? " <span class='badge'>HOST</span>" : "";
      const readyBadge = p.submitted ? " <span class='badge ok'>READY</span>" : "";
      return `<div class="playerRow">
        <span>${escapeHtml(p.name || "Player")}${hostBadge}${readyBadge}</span>
      </div>`;
    }).join("");

    setHTML("playersList", rows);
  }

  function renderEmojiGrid() {
    const grid = $("emojiGrid");
    if (!grid) return;

    grid.innerHTML = "";
    for (const e of EMOJIS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emojiBtn";
      btn.textContent = e;

      btn.addEventListener("click", () => onPickEmoji(e));
      grid.appendChild(btn);
    }
    renderPickedRow();
  }

  function renderPickedRow() {
    const row = $("pickedRow");
    if (!row) return;

    const chips = picked.map((e, idx) =>
      `<span class="chip" title="remove" data-idx="${idx}">${e}</span>`
    ).join("");

    row.innerHTML = chips || `<span class="muted">Pick ${MAX_PICK} emojis…</span>`;

    row.querySelectorAll(".chip").forEach(ch => {
      ch.addEventListener("click", () => {
        const idx = Number(ch.getAttribute("data-idx"));
        picked.splice(idx, 1);
        renderPickedRow();
      });
    });

    const btnSubmit = $("btnSubmit");
    if (btnSubmit) btnSubmit.disabled = (picked.length !== MAX_PICK);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  // ---------- Firestore refs ----------
  function roomsRef() { return db.collection("rooms"); }
  function roomRef(id) { return roomsRef().doc(id); }
  function playersRef(rid) { return roomRef(rid).collection("players"); }
  function playerRef(rid, pid) { return playersRef(rid).doc(pid); }

  // ---------- Entry actions ----------
  async function createRoom() {
    try {
      db = getDbOrThrow();
      playerId = persistPlayerId();
      playerName = ($("inPlayerName")?.value || "").trim() || "Host";

      roomCode = genRoomCode();
      roomId = genId("room");
      isHost = true;
      game = "pb"; // default; you can make a selector later

      await roomRef(roomId).set({
        roomCode,
        game,
        status: "lobby", // lobby -> picking -> revealed
        createdAt: serverTimestamp(),
        hostPlayerId: playerId
      });

      await playerRef(roomId, playerId).set({
        name: playerName,
        isHost: true,
        joinedAt: serverTimestamp(),
        submitted: false,
        picked: []
      });

      enterRoomUI();
      subscribeRoom();
      subscribePlayers();

    } catch (e) {
      alert(e.message || String(e));
      console.error(e);
    }
  }

  async function joinRoom() {
    try {
      db = getDbOrThrow();
      playerId = persistPlayerId();

      const code = ($("inRoomCode")?.value || "").trim().toUpperCase();
      playerName = ($("inPlayerName")?.value || "").trim() || "Player";
      if (!code) return alert("Enter room code.");

      // find room by code (simple scan - OK for small demo)
      const snap = await roomsRef().where("roomCode", "==", code).limit(1).get();
      if (snap.empty) return alert("Room not found.");

      const doc = snap.docs[0];
      roomId = doc.id;
      roomCode = code;

      const room = doc.data();
      isHost = (room.hostPlayerId === playerId);

      // upsert player
      await playerRef(roomId, playerId).set({
        name: playerName,
        isHost,
        joinedAt: serverTimestamp(),
        submitted: false,
        picked: []
      }, { merge: true });

      enterRoomUI();
      subscribeRoom();
      subscribePlayers();

    } catch (e) {
      alert(e.message || String(e));
      console.error(e);
    }
  }

  function enterRoomUI() {
    setText("outRoomCode", roomCode || "");
    setText("outHostHint", isHost ? "You are HOST" : "You joined as PLAYER");
    switchView("viewLobby");

    // helpful: show sharable URL
    try {
      const url = new URL(location.href);
      url.searchParams.set("room", roomCode);
      // if you want, you can show this somewhere in the lobby later
      console.log("[Invite]", url.toString());
    } catch (_) {}
  }

  async function leaveRoom() {
    cleanupSubs();
    roomId = null;
    roomCode = null;
    isHost = false;
    picked = [];
    switchView("viewEntry");
  }

  // ---------- Lobby actions ----------
  async function startPicking() {
    if (!isHost) return alert("Only host can start.");
    try {
      await roomRef(roomId).set({ status: "picking" }, { merge: true });
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  // ---------- Pick actions ----------
  function onPickEmoji(e) {
    if (picked.includes(e)) return; // no duplicates in UI pick
    if (picked.length >= MAX_PICK) return;
    picked.push(e);
    renderPickedRow();
  }

  async function submitPick() {
    if (picked.length !== MAX_PICK) return alert(`Pick exactly ${MAX_PICK} emojis.`);
    try {
      await playerRef(roomId, playerId).set({
        picked: picked.slice(),
        submitted: true,
        submittedAt: serverTimestamp()
      }, { merge: true });

      alert("Submitted!");
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  // ---------- Reveal / Result ----------
  async function reveal() {
    if (!isHost) return alert("Only host can reveal.");
    try {
      // generate winning numbers (party random)
      const winning =
        (game === "mm")
          ? { whites: randomUniqueNumbers(5, 1, 70), special: Math.floor(Math.random() * 25) + 1 }
          : { whites: randomUniqueNumbers(5, 1, 69), special: Math.floor(Math.random() * 26) + 1 };

      await roomRef(roomId).set({
        status: "revealed",
        winningNumbers: winning,
        revealedAt: serverTimestamp()
      }, { merge: true });

    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function renderResults(players, winning) {
    // players: [{id,name,picked,submitted,isHost}]
    const entries = [];
    for (const p of players) {
      if (!p.submitted || !Array.isArray(p.picked) || p.picked.length < MAX_PICK) continue;
      const nums = mapEmojisToNumbers(p.picked, game);
      const s = scoreEntry(nums, winning);
      entries.push({
        name: p.name || "Player",
        isHost: !!p.isHost,
        picked: p.picked,
        nums,
        ...s
      });
    }

    entries.sort((a, b) => b.score - a.score);

    const winLabel = (game === "mm") ? "Mega" : "Power";
    const winHtml = `
      <div class="resultWin">
        <div><b>Winning (${winLabel})</b></div>
        <div>Whites: <b>${winning.whites.join(", ")}</b></div>
        <div>Special: <b>${winning.special}</b></div>
      </div>
      <hr/>
    `;

    const listHtml = entries.length
      ? entries.map((e, idx) => `
          <div class="resultRow">
            <div><b>#${idx + 1}</b> ${escapeHtml(e.name)}${e.isHost ? " <span class='badge'>HOST</span>" : ""}</div>
            <div class="muted">Pick: ${e.picked.join(" ")}</div>
            <div class="muted">Nums: ${e.nums.whites.join(", ")} + ${e.nums.special}</div>
            <div><b>Match</b>: ${e.matchWhite} white${e.matchSpecial ? " + special" : ""} / <b>Score</b>: ${e.score}</div>
          </div>
        `).join("")
      : `<div class="muted">No submitted picks yet.</div>`;

    setHTML("resultBox", winHtml + listHtml);
  }

  // ---------- Subscriptions ----------
  function subscribeRoom() {
    cleanupSubs();

    unsubRoom = roomRef(roomId).onSnapshot((snap) => {
      if (!snap.exists) return;
      const r = snap.data() || {};
      game = r.game || "pb";

      const status = r.status || "lobby";
      if (status === "lobby") {
        switchView("viewLobby");
      } else if (status === "picking") {
        switchView("viewPick");
        renderEmojiGrid();
      } else if (status === "revealed") {
        switchView("viewResult");
        // results require players list -> handled in subscribePlayers
      }

    }, (err) => console.error("[RoomSub]", err));
  }

  function subscribePlayers() {
    unsubPlayers = playersRef(roomId).onSnapshot((snap) => {
      const players = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      renderPlayers(players);

      // Enable host buttons depending on status and readiness
      const btnStart = $("btnStart");
      const btnReveal = $("btnReveal");
      if (btnStart) btnStart.disabled = !isHost;
      if (btnReveal) btnReveal.disabled = !isHost;

      // If room revealed, render results
      roomRef(roomId).get().then((rSnap) => {
        const r = rSnap.data() || {};
        const status = r.status || "lobby";
        if (status === "revealed" && r.winningNumbers) {
          renderResults(players, r.winningNumbers);
        }

        // Optional: auto-enable reveal only if all submitted (host)
        if (isHost && status === "picking") {
          const anyPlayers = players.length > 0;
          const allSubmitted = anyPlayers && players.every(p => p.submitted);
          if (btnReveal) btnReveal.disabled = !allSubmitted;
        }
      }).catch(() => {});
    }, (err) => console.error("[PlayersSub]", err));
  }

  // ---------- Wire buttons ----------
  function wireUI() {
    $("btnCreateRoom")?.addEventListener("click", createRoom);
    $("btnJoinRoom")?.addEventListener("click", joinRoom);
    $("btnLeave")?.addEventListener("click", leaveRoom);

    $("btnStart")?.addEventListener("click", startPicking);
    $("btnSubmit")?.addEventListener("click", submitPick);
    $("btnReveal")?.addEventListener("click", reveal);
  }

  // ---------- Auto-fill room from URL ----------
  function hydrateFromUrl() {
    try {
      const u = new URL(location.href);
      const code = (u.searchParams.get("room") || "").trim().toUpperCase();
      if (code && $("inRoomCode")) $("inRoomCode").value = code;
    } catch (_) {}
  }

  // ---------- Init ----------
  function init() {
    wireUI();
    hydrateFromUrl();
    switchView("viewEntry");

    // Small sanity log
    try {
      db = getDbOrThrow();
      console.log("[PartyMode] Firebase OK. window.db =", db);
    } catch (e) {
      console.warn("[PartyMode] Firebase not ready yet.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
