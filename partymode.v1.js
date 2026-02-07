// partymode.v1.js (compat-only, no module imports)
// Works with firebase-app-compat.js + firebase-firestore-compat.js already loaded in partymode.html

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
    const el = $("year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function showView(name) {
    const views = ["viewEntry", "viewLobby", "viewPick", "viewResult"];
    for (const v of views) {
      const el = $(v);
      if (el) el.hidden = (v !== name);
    }
    if (name === "viewPick") buildPickGrid();
  }

  function normalizeCode(s) {
    return (s || "")
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
  }

  function randCode(len = 4) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function randId(len = 12) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function setEntryError(msg) {
    const el = $("errEntry");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  // -------------------- State --------------------
  let db = null;
  let roomCode = "";
  let playerId = "";
  let isHost = false;

  let unsubRoom = null;
  let unsubPlayers = null;

  // -------------------- UI bindings --------------------
  function bindUI() {
    const btnCreate = $("btnCreateRoom");
    const btnJoin = $("btnJoinRoom");

    if (btnCreate) btnCreate.addEventListener("click", () => void createRoom());
    if (btnJoin) btnJoin.addEventListener("click", () => void joinRoom());

    const btnCopyInvite = $("btnCopyInvite");
    if (btnCopyInvite) btnCopyInvite.addEventListener("click", () => void copyInviteLink());

    const btnStart = $("btnStart");
    if (btnStart) btnStart.addEventListener("click", () => void startGame());

    const btnGoPick = $("btnGoPick");
    if (btnGoPick) btnGoPick.addEventListener("click", () => showView("viewPick"));

    const btnBackToLobby = $("btnBackToLobby");
    if (btnBackToLobby) btnBackToLobby.addEventListener("click", () => showView("viewLobby"));

    const btnSubmitPick = $("btnSubmitPick");
    if (btnSubmitPick) btnSubmitPick.addEventListener("click", () => void submitPick());

    const btnCopyPartyLink = $("btnCopyPartyLink");
    if (btnCopyPartyLink) btnCopyPartyLink.addEventListener("click", () => void copyInviteLink());

    const btnCopyTicketParty = $("btnCopyTicketParty");
    if (btnCopyTicketParty) btnCopyTicketParty.addEventListener("click", () => void copyTicketText());

    // If URL has ?room=XXXX, prefill entry
    const url = new URL(location.href);
    const code = normalizeCode(url.searchParams.get("room"));
    if (code && $("inpRoomCode")) $("inpRoomCode").value = code;
  }

  function setRoomLabels(code) {
    const a = $("lblRoomCode");
    const b = $("lblRoomCode2");
    const c = $("lblRoomCode3");
    if (a) a.textContent = code;
    if (b) b.textContent = code;
    if (c) c.textContent = code;

    const invite = $("inviteLink");
    if (invite) {
      invite.value = `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;
    }
  }

  function renderPlayers(docs) {
    const el = $("playerList");
    if (!el) return;
    const html = docs.length
      ? docs.map((p) => `<div class="pill">${escapeHtml(p.name || "Player")}${p.isHost ? " (Host)" : ""}</div>`).join("")
      : `<div class="micro">No players yet.</div>`;
    el.innerHTML = html;
  }

  function cleanupListeners() {
    try { if (unsubRoom) unsubRoom(); } catch {}
    try { if (unsubPlayers) unsubPlayers(); } catch {}
    unsubRoom = null;
    unsubPlayers = null;
  }

  function attachListeners() {
    cleanupListeners();
    if (!roomCode) return;

    const roomRef = db.collection("rooms").doc(roomCode);

    unsubRoom = roomRef.onSnapshot(
      (snap) => {
        const data = snap.data() || {};
        if ($("selGame") && data.game) $("selGame").value = data.game;

        // move views by status
        if (data.status === "picking") showView("viewPick");
        if (data.status === "result") showView("viewResult");

        // Optional: show "partyNumbers" if exists
        const pn = $("partyNumbers");
        if (pn && data.partyNumbers) {
          pn.textContent = Array.isArray(data.partyNumbers) ? data.partyNumbers.join(", ") : String(data.partyNumbers);
        }
        const pf = $("partyFortune");
        if (pf && data.partyFortune) pf.textContent = String(data.partyFortune);
      },
      (err) => console.error("[PartyMode] room snapshot error:", err)
    );

    unsubPlayers = roomRef
      .collection("players")
      .orderBy("joinedAt")
      .onSnapshot(
        (qs) => {
          const arr = [];
          qs.forEach((d) => arr.push(d.data() || {}));
          renderPlayers(arr);
        },
        (err) => console.error("[PartyMode] players snapshot error:", err)
      );
  }

  function enterLobby() {
    setRoomLabels(roomCode);

    const btnStart = $("btnStart");
    if (btnStart) {
      btnStart.disabled = !isHost;
      btnStart.title = isHost ? "" : "Only the host can start.";
    }

    showView("viewLobby");
    attachListeners();
  }

  // -------------------- Firestore actions --------------------
  async function createRoom() {
    try {
      setEntryError("");

      const name = ($("inpName")?.value || "").trim() || "Host";
      const game = $("selGame")?.value || "powerball";

      // Generate unique room code (doc id = roomCode)
      let code = "";
      for (let i = 0; i < 30; i++) {
        const candidate = randCode(4);
        const snap = await db.collection("rooms").doc(candidate).get();
        if (!snap.exists) { code = candidate; break; }
      }
      if (!code) throw new Error("Could not generate a unique room code. Try again.");

      roomCode = code;
      playerId = randId(14);
      isHost = true;

      const roomRef = db.collection("rooms").doc(roomCode);

      await roomRef.set({
        code: roomCode,
        game,
        status: "lobby",
        createdAt: Date.now(),
        hostPlayerId: playerId,
      });

      await roomRef.collection("players").doc(playerId).set({
        playerId,
        name,
        isHost: true,
        joinedAt: Date.now(),
      });

      console.log("[PartyMode] Room created:", roomCode);
      enterLobby();
    } catch (err) {
      console.error("[PartyMode] createRoom error:", err);
      setEntryError(err?.message || String(err));
    }
  }

  async function joinRoom() {
    try {
      setEntryError("");

      const code = normalizeCode($("inpRoomCode")?.value);
      if (!code) throw new Error("Enter a room code.");
      const name = ($("inpName")?.value || "").trim() || "Guest";

      const roomRef = db.collection("rooms").doc(code);
      const snap = await roomRef.get();
      if (!snap.exists) throw new Error("Room not found. Check the code.");

      const data = snap.data() || {};

      roomCode = code;
      playerId = randId(14);
      isHost = false;

      await roomRef.collection("players").doc(playerId).set({
        playerId,
        name,
        isHost: false,
        joinedAt: Date.now(),
      });

      console.log("[PartyMode] Joined room:", roomCode);
      enterLobby();

      // If already started, follow status
      if (data.status === "picking") showView("viewPick");
      if (data.status === "result") showView("viewResult");
    } catch (err) {
      console.error("[PartyMode] joinRoom error:", err);
      setEntryError(err?.message || String(err));
    }
  }

  async function startGame() {
    if (!isHost || !roomCode) return;
    try {
      const game = $("selGame")?.value || "powerball";
      await db.collection("rooms").doc(roomCode).update({
        game,
        status: "picking",
        startedAt: Date.now(),
      });
      console.log("[PartyMode] Game started:", roomCode, game);
    } catch (err) {
      console.error("[PartyMode] startGame error:", err);
      alert("Start failed: " + (err?.message || String(err)));
    }
  }

  // -------------------- Picking (simple) --------------------
  const pickState = { selected: new Set(), max: 6, maxNumber: 69 };

  function getGameSpec() {
    const game = $("selGame")?.value || "powerball";
    if (game === "mega") return { maxNumber: 70, maxPick: 6 };
    return { maxNumber: 69, maxPick: 6 };
  }

  function buildPickGrid() {
    const grid = $("pickGrid");
    if (!grid) return;

    const spec = getGameSpec();
    pickState.max = spec.maxPick;
    pickState.maxNumber = spec.maxNumber;
    pickState.selected.clear();

    grid.innerHTML = "";
    for (let i = 1; i <= spec.maxNumber; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "num";
      b.textContent = String(i);
      b.addEventListener("click", () => togglePick(i, b));
      grid.appendChild(b);
    }
    updatePickInstr();
  }

  function togglePick(n, btn) {
    if (pickState.selected.has(n)) {
      pickState.selected.delete(n);
      btn.classList.remove("on");
    } else {
      if (pickState.selected.size >= pickState.max) return;
      pickState.selected.add(n);
      btn.classList.add("on");
    }
    updatePickInstr();
  }

  function updatePickInstr() {
    const el = $("pickInstr");
    if (el) el.textContent = `Pick ${pickState.max} numbers (${pickState.selected.size}/${pickState.max}).`;
    const btn = $("btnSubmitPick");
    if (btn) btn.disabled = (pickState.selected.size !== pickState.max);
  }

  async function submitPick() {
    if (!roomCode || !playerId) return;
    if (pickState.selected.size !== pickState.max) return;

    try {
      const pick = Array.from(pickState.selected).sort((a, b) => a - b);
      await db.collection("rooms").doc(roomCode).collection("players").doc(playerId).update({
        pick,
        pickedAt: Date.now(),
      });
      alert("Pick submitted!");
      showView("viewLobby");
    } catch (err) {
      console.error("[PartyMode] submitPick error:", err);
      alert("Submit failed: " + (err?.message || String(err)));
    }
  }

  // -------------------- Clipboard helpers --------------------
  async function copyText(text, fallbackEl) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
      if (fallbackEl && fallbackEl.select) {
        fallbackEl.focus();
        fallbackEl.select();
        document.execCommand("copy");
        return true;
      }
      return false;
    }
  }

  async function copyInviteLink() {
    const linkEl = $("inviteLink");
    const link = linkEl?.value || `${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode || "")}`;
    const ok = await copyText(link, linkEl);
    if (ok) alert("Invite link copied!");
  }

  async function copyTicketText() {
    const text = $("ticketTextParty")?.textContent || "";
    if (!text) return;
    const ok = await copyText(text, null);
    if (ok) alert("Ticket text copied!");
  }

  // -------------------- Boot --------------------
  document.addEventListener("DOMContentLoaded", () => {
    setYear();

    db = window.db;
    if (!db) {
      console.error("[PartyMode] window.db is missing. Check Firebase init order in partymode.html.");
      setEntryError("Firebase not ready. Check initialization order.");
      return;
    }

    console.log("[PartyMode] Firebase OK. window.db =", db);
    bindUI();
    showView("viewEntry");
  });
})();
