// APP_VERSION: emojipick-white-v8 (2026-01-16)
/*
  EmojiPick (PWA)
  - Solo mode: pick emojis → deterministic numbers (seeded by date + emojis)
  - Challenge mode: challenger shares link with their emoji indices (h=...)
                   friend generates their numbers and we compare.

  NOTE: This is an entertainment-only demo. It does not sell lottery tickets.
*/

(() => {
  'use strict';

  const BUILD = 'v8 • 2026-01-16';

  // Local storage
  const LS_KEY = 'emojipick_picks_v1';
  const FREE_HISTORY_LIMIT = 50; // generous free cap; Plus can be unlimited later

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const GAMES = {
    pb: {
      id: 'pb',
      name: 'Powerball',
      rule: 'Pick 5 numbers (1–69) + 1 Powerball (1–26)',
      mainCount: 5,
      mainMax: 69,
      bonusCount: 1,
      bonusMax: 26,
      bonusLabel: 'PB',
      partnerDeepLink: 'yd://play?game=powerball'
    },
    mm: {
      id: 'mm',
      name: 'Mega Millions',
      rule: 'Pick 5 numbers (1–70) + 1 Mega Ball (1–25)',
      mainCount: 5,
      mainMax: 70,
      bonusCount: 1,
      bonusMax: 25,
      bonusLabel: 'MB',
      partnerDeepLink: 'yd://play?game=megamillions'
    },
    tx: {
      id: 'tx',
      name: 'TX Instant (Demo)',
      rule: 'Demo rules (confirm later): Pick 5 numbers + 1 bonus',
      mainCount: 5,
      mainMax: 50,
      bonusCount: 1,
      bonusMax: 10,
      bonusLabel: 'B',
      partnerDeepLink: 'yd://play?game=texas'
    }
  };

  // 96 emojis + simple tags for filters/fortunes.
  const EMOJIS = [
    { e: '🍀', t: ['lucky','nature'] }, { e: '✨', t: ['lucky','fun'] }, { e: '🌟', t: ['lucky','nature'] }, { e: '🌈', t: ['lucky','nature'] },
    { e: '🔥', t: ['fun'] }, { e: '💎', t: ['money','lucky'] }, { e: '🧲', t: ['fun'] }, { e: '🎯', t: ['fun','lucky'] },
    { e: '🧧', t: ['money','lucky'] }, { e: '💰', t: ['money'] }, { e: '💵', t: ['money'] }, { e: '🏦', t: ['money'] },
    { e: '🪙', t: ['money'] }, { e: '🤑', t: ['money','fun'] }, { e: '🎁', t: ['lucky','fun'] }, { e: '🎉', t: ['fun'] },
    { e: '🎊', t: ['fun'] }, { e: '🥳', t: ['fun'] }, { e: '🧠', t: ['fun'] }, { e: '🧿', t: ['lucky'] },
    { e: '🪄', t: ['lucky','fun'] }, { e: '🔮', t: ['lucky','fun'] }, { e: '🪬', t: ['lucky'] }, { e: '🧸', t: ['fun'] },
    { e: '🐉', t: ['animals','lucky'] }, { e: '🦄', t: ['animals','lucky'] }, { e: '🐲', t: ['animals','lucky'] }, { e: '🐼', t: ['animals'] },
    { e: '🦊', t: ['animals'] }, { e: '🐯', t: ['animals'] }, { e: '🦁', t: ['animals'] }, { e: '🐸', t: ['animals','fun'] },
    { e: '🐙', t: ['animals','fun'] }, { e: '🦋', t: ['animals','nature'] }, { e: '🐝', t: ['animals','nature'] }, { e: '🐢', t: ['animals'] },
    { e: '🦅', t: ['animals'] }, { e: '🐬', t: ['animals'] }, { e: '🐳', t: ['animals'] }, { e: '🐋', t: ['animals'] },
    { e: '🌊', t: ['nature'] }, { e: '🌙', t: ['nature','lucky'] }, { e: '☀️', t: ['nature'] }, { e: '⚡', t: ['nature','fun'] },
    { e: '🌪️', t: ['nature'] }, { e: '❄️', t: ['nature'] }, { e: '🌸', t: ['nature','lucky'] }, { e: '🌺', t: ['nature'] },
    { e: '🌻', t: ['nature'] }, { e: '🌵', t: ['nature'] }, { e: '🌲', t: ['nature'] }, { e: '🍁', t: ['nature'] },
    { e: '🍄', t: ['nature','fun'] }, { e: '🌍', t: ['nature'] }, { e: '🪐', t: ['nature','fun'] }, { e: '🌋', t: ['nature'] },
    { e: '🧩', t: ['fun'] }, { e: '🎲', t: ['fun','lucky'] }, { e: '🃏', t: ['fun','lucky'] }, { e: '🧊', t: ['fun'] },
    { e: '🕹️', t: ['fun'] }, { e: '🎮', t: ['fun'] }, { e: '🎰', t: ['fun','money'] }, { e: '🎵', t: ['fun'] },
    { e: '🎧', t: ['fun'] }, { e: '🎬', t: ['fun'] }, { e: '📣', t: ['fun'] }, { e: '📌', t: ['fun'] },
    { e: '🧭', t: ['fun','lucky'] }, { e: '🚀', t: ['fun'] }, { e: '🛸', t: ['fun'] }, { e: '🏆', t: ['lucky','fun'] },
    { e: '🥇', t: ['lucky','fun'] }, { e: '🧨', t: ['fun'] }, { e: '⚓', t: ['fun'] }, { e: '🪁', t: ['fun'] },
    { e: '❤️', t: ['lucky'] }, { e: '💛', t: ['lucky'] }, { e: '💙', t: ['lucky'] }, { e: '💚', t: ['lucky'] },
    { e: '🖤', t: ['fun'] }, { e: '🤍', t: ['lucky'] }, { e: '💫', t: ['lucky','fun'] }, { e: '⭐', t: ['lucky','nature'] },
    { e: '🕯️', t: ['lucky'] }, { e: '🧯', t: ['fun'] }, { e: '📈', t: ['money'] }, { e: '🧾', t: ['money'] },
    { e: '🪪', t: ['fun'] }, { e: '🧷', t: ['fun'] }, { e: '🪩', t: ['fun'] }, { e: '🫶', t: ['lucky'] }
  ];

  const FORTUNES = {
    lucky: [
      'Quiet confidence. Keep it simple and share the vibe.',
      'Today feels “clean.” Don’t overthink it — just play for fun.',
      'Your combo is bold. If you share it, someone will copy it 😄'
    ],
    money: [
      'Money energy, but stay chill — this is entertainment only.',
      'Wallet vibes detected. Your best move is consistency, not chaos.',
      'A small win beats a big regret. Keep it light.'
    ],
    animals: [
      'Animal instincts: go with the first choice you liked.',
      'Your emojis say: playful, fast, social. Perfect for a challenge.',
      'This combo is weird in a good way. Share it.'
    ],
    nature: [
      'Nature mode: steady and calm. Great for today’s seed.',
      'Your picks feel balanced. That’s a shareable card.',
      'Fresh air vibes. Invite one friend and compare.'
    ],
    fun: [
      'Pure fun mode. The only rule: don’t take it too seriously.',
      'This combo is meme-ready. Screenshot it and send it.',
      'Chaos but cute. That usually spreads fastest.'
    ]
  };

  // ---------- State
  let currentGame = 'pb';
  let selected = []; // emoji indices
  let currentFilter = 'all';
  let lastResult = null; // { gameId, idxs, dateSeed, nums, mode }

  // URL params
  const params = new URLSearchParams(location.search);
  const hostParam = params.get('h');
  const soloParam = params.get('i');
  const gameParam = params.get('g');
  const nameParam = params.get('n');

  // ---------- Helpers
  const todayKey = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };

  function clampGameId(id) {
    return (id && GAMES[id]) ? id : 'pb';
  }

  function parseIndexList(s) {
    if (!s) return [];
    return s.split(',').map(x => parseInt(x, 10)).filter(n => Number.isFinite(n) && n >= 0 && n < EMOJIS.length);
  }

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
  }

  function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickUnique(rng, count, max) {
    const set = new Set();
    while (set.size < count) {
      const n = Math.floor(rng() * max) + 1;
      set.add(n);
    }
    return Array.from(set);
  }

  function computeNumbers(gameId, emojiIdxList, dateSeed, salt = '') {
    const g = GAMES[gameId];
    const idxs = uniq(emojiIdxList).slice(0, g.mainCount + g.bonusCount);
    const seedStr = `${gameId}|${dateSeed}|${idxs.join('-')}|${salt}`;
    const s = cyrb128(seedStr)[0];
    const rng = mulberry32(s);

    const main = pickUnique(rng, g.mainCount, g.mainMax).sort((a,b)=>a-b);
    const bonus = pickUnique(rng, g.bonusCount, g.bonusMax);
    return { main, bonus, seedStr };
  }

  function fortuneFor(idxs) {
    const tags = new Map([['lucky',0],['money',0],['animals',0],['nature',0],['fun',0]]);
    for (const i of idxs) {
      const item = EMOJIS[i];
      if (!item) continue;
      item.t.forEach(t => tags.set(t, (tags.get(t)||0) + 1));
    }
    let top = 'fun';
    let topV = -1;
    tags.forEach((v,k) => {
      if (v > topV) { topV = v; top = k; }
    });
    const arr = FORTUNES[top] || FORTUNES.fun;
    // stable-ish choice based on sum
    const sum = idxs.reduce((a,b)=>a+b,0);
    return arr[sum % arr.length];
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list;
    } catch {
      return [];
    }
  }

  function saveHistory(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }

  function makePickRecord(src) {
    // Keep it compact + stable.
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      savedAt: new Date().toISOString(),
      gameId: src.gameId,
      dateSeed: src.dateSeed,
      idxs: [...src.idxs],
      nums: {
        main: [...src.nums.main],
        bonus: [...src.nums.bonus]
      }
    };
  }

  function formatPickLine(p) {
    const g = GAMES[p.gameId] || GAMES.pb;
    const main = (p.nums?.main || []).join(' ');
    const bonus = (p.nums?.bonus || []).map(n => `${g.bonusLabel} ${n}`).join(' ');
    return `${g.name} • ${p.dateSeed}: ${main}${bonus ? `  +  ${bonus}` : ''}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function setActiveTab(gameId) {
    currentGame = clampGameId(gameId);
    $$('#tab-pb, #tab-mm, #tab-tx').forEach(btn => {
      const is = btn.dataset.game === currentGame;
      btn.classList.toggle('active', is);
      btn.setAttribute('aria-selected', is ? 'true' : 'false');
    });

    const g = GAMES[currentGame];
    $('#gameTitle').textContent = g.name;
    $('#gameRule').textContent = g.rule;

    const need = g.mainCount + g.bonusCount;
    $('#needCount').textContent = String(need);
    $('#pickHint').textContent = `Choose ${need} emojis for this game.`;

    // If current selection is too big, trim.
    selected = selected.slice(0, need);
    updatePickedUI();
    renderEmojiGrid();

    // Partner link is intentionally "coming soon" for now.
    const partner = $('#btnPartner');
    if (partner) partner.href = '#';
  }

  function updatePickedUI() {
    const need = GAMES[currentGame].mainCount + GAMES[currentGame].bonusCount;
    $('#pickedCount').textContent = String(selected.length);
    $('#btnGenerate').disabled = selected.length !== need;
  }

  function passesFilter(item) {
    if (currentFilter === 'all') return true;
    return item.t.includes(currentFilter);
  }

  function renderEmojiGrid() {
    const grid = $('#emojiGrid');
    grid.innerHTML = '';

    EMOJIS.forEach((item, idx) => {
      if (!passesFilter(item)) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emojiBtn';
      btn.textContent = item.e;
      btn.setAttribute('aria-label', `Emoji ${item.e}`);
      btn.dataset.idx = String(idx);

      if (selected.includes(idx)) btn.classList.add('selected');

      btn.addEventListener('click', () => {
        const need = GAMES[currentGame].mainCount + GAMES[currentGame].bonusCount;
        const already = selected.includes(idx);
        if (already) {
          selected = selected.filter(x => x !== idx);
        } else {
          if (selected.length >= need) {
            // swap behavior: drop the earliest, add the new
            selected = selected.slice(1);
          }
          selected = [...selected, idx];
        }
        updatePickedUI();
        renderEmojiGrid();
      });

      grid.appendChild(btn);
    });
  }

  function showPick() {
    $('#panelPick').hidden = false;
    $('#panelResult').hidden = true;
  }

  function showResult() {
    $('#panelPick').hidden = true;
    $('#panelResult').hidden = false;
  }

  function buildNumbersBadges(gameId, nums) {
    const g = GAMES[gameId];
    const wrap = document.createElement('div');
    wrap.className = 'numbers';

    nums.main.forEach(n => {
      const span = document.createElement('div');
      span.className = 'num';
      span.textContent = String(n);
      wrap.appendChild(span);
    });

    nums.bonus.forEach(n => {
      const span = document.createElement('div');
      span.className = 'num bonus';
      span.textContent = `${g.bonusLabel} ${n}`;
      wrap.appendChild(span);
    });

    return wrap;
  }

  function renderResult(gameId, idxs, dateSeed, nums, mode) {
    const g = GAMES[gameId];

    $('#resultGame').textContent = g.name;
    $('#resultDate').textContent = dateSeed;
    $('#resultBadge').textContent = mode === 'challenge' ? 'Challenge' : 'Today';

    const emojiLine = $('#resultEmojis');
    emojiLine.innerHTML = '';
    idxs.forEach(i => {
      const span = document.createElement('span');
      span.className = 'emojiPill';
      span.textContent = EMOJIS[i]?.e || '❓';
      emojiLine.appendChild(span);
    });

    const numbersNode = buildNumbersBadges(gameId, nums);
    const numbersWrap = $('#resultNumbers');
    numbersWrap.innerHTML = '';
    numbersWrap.appendChild(numbersNode);

    $('#resultFortune').textContent = fortuneFor(idxs);

    // keep for “what next?” actions
    lastResult = { gameId, idxs: [...idxs], dateSeed, nums, mode };
    const more = $('#morePicks');
    if (more) { more.hidden = true; more.innerHTML = ''; }
  }

  function compareNumbers(a, b) {
    const mainA = new Set(a.main);
    const mainB = new Set(b.main);
    let mainOverlap = 0;
    mainA.forEach(n => { if (mainB.has(n)) mainOverlap++; });

    const bonusA = new Set(a.bonus);
    const bonusB = new Set(b.bonus);
    let bonusOverlap = 0;
    bonusA.forEach(n => { if (bonusB.has(n)) bonusOverlap++; });

    return { mainOverlap, bonusOverlap };
  }

  function setModeBanner() {
    if (!hostParam) {
      $('#modeBanner').hidden = true;
      return;
    }
    const hostName = nameParam ? decodeURIComponent(nameParam) : 'A friend';
    $('#modeBanner').hidden = false;
    $('#modeText').textContent = `${hostName} shared their card. Pick your emojis and compare results.`;
  }

  function openModal(title, bodyHtml) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modal').hidden = false;
  }

  function closeModal() {
    $('#modal').hidden = true;
  }

  function openUpgradeModal(reasonText = '') {
    const reason = reasonText ? `<p class="micro" style="margin-top:6px;">${escapeHtml(reasonText)}</p>` : '';
    openModal('Upgrade (coming soon)', `
      <p><b>Plus is coming soon.</b> For now, EmojiPick is free to play.</p>
      ${reason}
      <div class="divider"></div>
      <p style="margin:0 0 6px 0;"><b>Planned Plus features:</b></p>
      <ul style="margin:0 0 0 18px; padding:0;">
        <li>Unlimited pick history & export</li>
        <li>Room seasons & leaderboards</li>
        <li>Historical match insights (Top 50 + filters)</li>
        <li>More reminder templates</li>
      </ul>
      <p class="micro" style="margin-top:10px;">Entertainment only. We don't sell tickets or improve odds.</p>
    `);
  }

  function openPartnerModal() {
    openModal('Partner app (coming soon)', `
      <p>This button will open a partner app later (deep link).</p>
      <p class="micro">For now, use <b>Copy as ticket</b> and buy/check in your preferred way.</p>
    `);
  }

  function openHistoryModal() {
    const hist = loadHistory();
    const items = hist
      .slice()
      .reverse()
      .map((p) => {
        const line = escapeHtml(formatPickLine(p));
        return `
          <div class="pickRow" style="align-items:flex-start;">
            <div style="flex:1;">
              <div class="pickLabel">Saved</div>
              <div class="pickLine">${line}</div>
            </div>
            <button class="ghost" type="button" data-action="copy" data-id="${p.id}">Copy</button>
            <button class="ghost" type="button" data-action="compare" data-id="${p.id}">Compare</button>
            <button class="ghost" type="button" data-action="delete" data-id="${p.id}">Delete</button>
          </div>
        `;
      })
      .join('');

    openModal('My Picks', `
      <p class="micro" style="margin-top:0;">Stored only on this device (localStorage). Not synced.</p>
      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="secondary" type="button" data-action="clearAll">Clear all</button>
        <button class="secondary" type="button" data-action="exportText">Export (text)</button>
      </div>
      <div class="morePicks" style="margin-top:10px;">
        ${items || '<div class="micro">No saved picks yet. Generate a result and tap <b>Save</b>.</div>'}
      </div>
    `);
  }

  function openCompareModal(prefPickId = '') {
    const hist = loadHistory();
    const current = lastResult ? makePickRecord(lastResult) : null;

    const options = [
      current ? `<option value="__current__">Current result (${escapeHtml(formatTicketLine(lastResult.gameId, lastResult.dateSeed, lastResult.nums))})</option>` : '',
      ...hist
        .slice()
        .reverse()
        .map(p => `<option value="${p.id}">${escapeHtml(formatPickLine(p))}</option>`)
    ].filter(Boolean).join('');

    openModal('Compare with winning numbers', `
      <p class="micro" style="margin-top:0;">Enter official winning numbers and see how many match. Entertainment only.</p>
      <div style="margin-top:10px; display:grid; gap:10px;">
        <label class="micro"><b>Pick to compare</b><br>
          <select id="cmpPick" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--line);" >
            ${options || '<option value="">(No picks yet)</option>'}
          </select>
        </label>
        <label class="micro"><b>Winning main numbers</b> (space/comma separated)<br>
          <input id="winMain" inputmode="numeric" placeholder="e.g., 5 12 23 44 61" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--line);" />
        </label>
        <label class="micro"><b>Winning bonus</b> (one number)<br>
          <input id="winBonus" inputmode="numeric" placeholder="e.g., 18" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--line);" />
        </label>
        <div class="row" style="flex-wrap:wrap; gap:10px;">
          <button id="btnDoCompare" class="primary" type="button">Compare</button>
          <button id="btnFillFromCurrent" class="secondary" type="button">Use my numbers as winning (test)</button>
        </div>
        <div id="cmpOut" class="compare" style="display:none;"></div>
      </div>
    `);

    // Preselect
    const sel = document.getElementById('cmpPick');
    if (sel && prefPickId) sel.value = prefPickId;
  }

  function openReminderModal() {
    if (!lastResult) {
      openModal('Check reminder', `<p>Generate your numbers first, then set a reminder.</p>`);
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const defaultDate = `${yyyy}-${mm}-${dd}`;
    const defaultTime = '09:00';

    openModal('Check reminder', `
      <p class="micro" style="margin-top:0;">This creates a calendar file (.ics). You choose the time.</p>
      <div style="margin-top:10px; display:grid; gap:10px;">
        <label class="micro"><b>Date</b><br>
          <input id="remDate" type="date" value="${defaultDate}" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--line);" />
        </label>
        <label class="micro"><b>Time</b><br>
          <input id="remTime" type="time" value="${defaultTime}" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--line);" />
        </label>
        <label class="micro"><b>Title</b><br>
          <input id="remTitle" value="Check my EmojiPick numbers" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--line);" />
        </label>
        <button id="btnDownloadIcs" class="primary" type="button">Download .ics</button>
        <p class="micro">Entertainment only. We don't sell tickets or improve odds.</p>
      </div>
    `);
  }

function setupModalClose() {
  const modalEl = $('#modal');
  if (!modalEl) return;

  // Close when clicking the X, "Close", "OK", or the dimmed backdrop.
  modalEl.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('[data-close="1"]')) {
      e.preventDefault();
      closeModal();
    }
  });

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.hasAttribute('hidden')) {
      e.preventDefault();
      closeModal();
    }
  });
}


  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch {
        document.body.removeChild(ta);
        return false;
      }
    }
  }

  async function shareUrl(url, title, text) {
    if (navigator.share) {
      try {
        const payload = { title, url };
        if (text) payload.text = text;
        await navigator.share(payload);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  function buildShareText(kind) {
    // Keep it short and friendly for SMS/Kakao/etc.
    const game = (document.getElementById('resultGame')?.textContent || '').trim();
    const emojis = (document.getElementById('resultEmojis')?.textContent || '').trim();
    const nums = (document.getElementById('resultNumbers')?.textContent || '').trim().replace(/\s+/g, ' ');

    if (kind === 'challenge') {
      return `EmojiPick see if we match! ${game ? `(${game})` : ''} Entertainment only.`.trim();
    }
    const left = [emojis, game && nums ? `${game}: ${nums}` : nums].filter(Boolean).join('  ');
    return `${left}  (Entertainment only)`;
  }

  function formatTicketLine(gameId, dateSeed, nums) {
    const g = GAMES[gameId];
    const main = nums.main.join(' ');
    const bonus = nums.bonus.map(n => `${g.bonusLabel} ${n}`).join(' ');
    return `${g.name} • ${dateSeed}: ${main}${bonus ? `  +  ${bonus}` : ''}  (Entertainment only)`;
  }

  function renderMorePicksList() {
    const wrap = $('#morePicks');
    if (!wrap || !lastResult) return;

    const { gameId, idxs, dateSeed } = lastResult;
    wrap.innerHTML = '';
    wrap.hidden = false;

    for (let k = 1; k <= 3; k++) {
      const nums = computeNumbers(gameId, idxs, dateSeed, `alt${k}`);
      const row = document.createElement('div');
      row.className = 'pickRow';

      const label = document.createElement('div');
      label.className = 'pickLabel';
      label.textContent = `Pick #${k}`;

      const line = document.createElement('div');
      line.className = 'pickLine';
      line.textContent = formatTicketLine(gameId, dateSeed, nums);

      const btn = document.createElement('button');
      btn.className = 'ghost';
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async () => {
        const ok = await copyText(formatTicketLine(gameId, dateSeed, nums));
        btn.textContent = ok ? 'Copied ✓' : 'Copy';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      });

      row.appendChild(label);
      row.appendChild(line);
      row.appendChild(btn);
      wrap.appendChild(row);
    }
  }

  function currentBaseUrl() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    return u.toString();
  }

  function makeSoloLink(gameId, idxs) {
    const u = new URL(currentBaseUrl());
    u.searchParams.set('g', gameId);
    u.searchParams.set('i', idxs.join(','));
    return u.toString();
  }

  function makeChallengeLink(gameId, hostIdxs) {
    const u = new URL(currentBaseUrl());
    u.searchParams.set('g', gameId);
    u.searchParams.set('h', hostIdxs.join(','));
    u.searchParams.set('n', encodeURIComponent('Your friend'));
    return u.toString();
  }

  function findPickById(id) {
    const hist = loadHistory();
    return hist.find(p => p.id === id) || null;
  }

  function parseNums(str) {
    if (!str) return [];
    return String(str)
      .replaceAll(/[^0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(s => parseInt(s, 10))
      .filter(n => Number.isFinite(n));
  }

  function downloadTextFile(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildIcs({ title, yyyy, mm, dd, hh, min }) {
    const dt = `${yyyy}${mm}${dd}T${hh}${min}00`;
    const uid = `emojipick-${Date.now()}@local`;
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EmojiPick//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dt}`,
      `DTSTART:${dt}`,
      `SUMMARY:${title.replaceAll(/\r?\n/g, ' ')}`,
      'DESCRIPTION:Entertainment only. EmojiPick does not sell tickets.',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }

  // ---------- Wire UI
  function init() {
    setupModalClose();

    // Ensure we control caching behavior and can bust old SWs.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    $('#year').textContent = String(new Date().getFullYear());
    $('#todayPill').textContent = todayKey();
    const buildEl = document.getElementById('build');
    if (buildEl) buildEl.textContent = `(${BUILD})`;

    // tabs
    $('#tab-pb').addEventListener('click', () => setActiveTab('pb'));
    $('#tab-mm').addEventListener('click', () => setActiveTab('mm'));
    $('#tab-tx').addEventListener('click', () => setActiveTab('tx'));

    // filters
    $$('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        currentFilter = f;
        $$('.chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.filter === f ? 'true' : 'false'));
        renderEmojiGrid();
      });
    });

    // buttons
    $('#btnReset').addEventListener('click', () => {
      selected = [];
      updatePickedUI();
      renderEmojiGrid();
    });

    $('#btnGenerate').addEventListener('click', () => {
      const g = GAMES[currentGame];
      const need = g.mainCount + g.bonusCount;
      const idxs = uniq(selected).slice(0, need);
      const dateSeed = todayKey();

      const myNums = computeNumbers(currentGame, idxs, dateSeed);
      renderResult(currentGame, idxs, dateSeed, myNums, hostParam ? 'challenge' : 'solo');

      // If in challenge mode (came with host emojis), compute host and compare.
      if (hostParam) {
        const hostIdxs = parseIndexList(hostParam);
        const hostNums = computeNumbers(currentGame, hostIdxs, dateSeed);
        const c = compareNumbers(hostNums, myNums);
        $('#comparePanel').hidden = false;
        const g2 = GAMES[currentGame];
        $('#compareText').innerHTML = `Shared card overlap: <b>${c.mainOverlap}</b> main number(s) and <b>${c.bonusOverlap}</b> bonus match(es) (${g2.bonusLabel}).`;
        $('#resultSubtitle').textContent = 'You joined a challenge. Your numbers are generated with today’s seed.';
      } else {
        $('#comparePanel').hidden = true;
        $('#resultSubtitle').textContent = 'Based on your emojis + today’s seed.';
      }

      showResult();
    });

    $('#btnBack').addEventListener('click', () => {
      showPick();
    });

    // Top actions
    const myBtn = document.getElementById('btnMyPicks');
    if (myBtn) myBtn.addEventListener('click', () => openHistoryModal());

    const cmpBtn = document.getElementById('btnCompare');
    if (cmpBtn) cmpBtn.addEventListener('click', () => openCompareModal());

    const upBtn = document.getElementById('btnUpgrade');
    if (upBtn) upBtn.addEventListener('click', () => openUpgradeModal());

    const partnerBtn = document.getElementById('btnPartner');
    if (partnerBtn) {
      partnerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openPartnerModal();
      });
    }

    // Save pick
    const saveBtn = document.getElementById('btnSavePick');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (!lastResult) {
          openModal('Save', `<p>Generate your numbers first, then tap <b>Save</b>.</p>`);
          return;
        }
        const hist = loadHistory();
        if (hist.length >= FREE_HISTORY_LIMIT) {
          openUpgradeModal(`Free history limit reached (${FREE_HISTORY_LIMIT}).`);
          return;
        }
        hist.push(makePickRecord(lastResult));
        saveHistory(hist);
        saveBtn.textContent = 'Saved ✓';
        setTimeout(() => (saveBtn.textContent = 'Save'), 1200);
      });
    }

    // Check reminder
    const calBtn = document.getElementById('btnCalendar');
    if (calBtn) calBtn.addEventListener('click', () => openReminderModal());

    // Modal action delegation (works for history/compare/reminder)
    const modalBody = document.getElementById('modalBody');
    if (modalBody) {
      modalBody.addEventListener('click', async (e) => {
        const t = e.target;
        if (!t) return;

        // History actions
        const act = t.getAttribute && t.getAttribute('data-action');
        if (act) {
          e.preventDefault();
          const id = t.getAttribute('data-id') || '';
          if (act === 'clearAll') {
            saveHistory([]);
            openHistoryModal();
            return;
          }
          if (act === 'exportText') {
            const hist = loadHistory();
            const text = hist.map(formatPickLine).join('\n');
            downloadTextFile('emojipick_picks.txt', text || '');
            return;
          }
          if (act === 'delete') {
            const hist = loadHistory().filter(p => p.id !== id);
            saveHistory(hist);
            openHistoryModal();
            return;
          }
          if (act === 'copy') {
            const p = findPickById(id);
            if (p) await copyText(`${formatPickLine(p)}  (Entertainment only)`);
            return;
          }
          if (act === 'compare') {
            openCompareModal(id);
            return;
          }
        }

        // Compare actions
        if (t.id === 'btnFillFromCurrent') {
          e.preventDefault();
          if (!lastResult) return;
          const wm = document.getElementById('winMain');
          const wb = document.getElementById('winBonus');
          if (wm) wm.value = lastResult.nums.main.join(' ');
          if (wb) wb.value = String(lastResult.nums.bonus[0] ?? '');
          return;
        }
        if (t.id === 'btnDoCompare') {
          e.preventDefault();
          const pickSel = document.getElementById('cmpPick');
          const out = document.getElementById('cmpOut');
          if (!pickSel || !out) return;

          const pickId = pickSel.value;
          let pick = null;
          if (pickId === '__current__') {
            if (!lastResult) return;
            pick = makePickRecord(lastResult);
          } else {
            pick = findPickById(pickId);
          }
          if (!pick) {
            out.style.display = 'block';
            out.innerHTML = `<div class="compareTitle">Missing pick</div><div class="compareText">Save a pick first, or generate a result.</div>`;
            return;
          }

          const g = GAMES[pick.gameId] || GAMES.pb;
          const wm = parseNums(document.getElementById('winMain')?.value || '');
          const wb = parseNums(document.getElementById('winBonus')?.value || '');
          const main = wm.slice(0, g.mainCount);
          const bonus = wb.slice(0, g.bonusCount);

          // Validation
          const badMainCount = main.length !== g.mainCount;
          const badBonusCount = bonus.length !== g.bonusCount;
          const badRange = main.some(n => n < 1 || n > g.mainMax) || bonus.some(n => n < 1 || n > g.bonusMax);

          if (badMainCount || badBonusCount || badRange) {
            out.style.display = 'block';
            out.innerHTML = `<div class="compareTitle">Check inputs</div><div class="compareText">${g.name} expects <b>${g.mainCount}</b> main number(s) (1–${g.mainMax}) and <b>${g.bonusCount}</b> bonus (1–${g.bonusMax}).</div>`;
            return;
          }

          const winning = { main, bonus };
          const c = compareNumbers(winning, pick.nums);
          const matchMain = main.filter(n => (new Set(pick.nums.main)).has(n)).sort((a,b)=>a-b);
          const matchBonus = bonus.filter(n => (new Set(pick.nums.bonus)).has(n));

          out.style.display = 'block';
          out.innerHTML = `
            <div class="compareTitle">Result</div>
            <div class="compareText">
              <div><b>${escapeHtml(formatPickLine(pick))}</b></div>
              <div style="margin-top:6px;">Matches: <b>${c.mainOverlap}</b> main, <b>${c.bonusOverlap}</b> bonus (${g.bonusLabel}).</div>
              <div class="micro" style="margin-top:6px;">Main matched: ${matchMain.length ? matchMain.join(' ') : '—'} / Bonus: ${matchBonus.length ? matchBonus.join(' ') : '—'}</div>
            </div>
          `;
          return;
        }

        // Reminder actions
        if (t.id === 'btnDownloadIcs') {
          e.preventDefault();
          const date = document.getElementById('remDate')?.value || '';
          const time = document.getElementById('remTime')?.value || '';
          const title = document.getElementById('remTitle')?.value || 'Check my EmojiPick numbers';
          if (!date || !time) return;
          const [yyyy, mm, dd] = date.split('-');
          const [hh, min] = time.split(':');
          const ics = buildIcs({ title, yyyy, mm, dd, hh, min });
          downloadTextFile('emojipick-reminder.ics', ics, 'text/calendar');
          return;
        }
      });
    }

    // “What next?” actions
    const btnTicket = document.getElementById('btnCopyTicket');
    if (btnTicket) {
      btnTicket.addEventListener('click', async () => {
        if (!lastResult) return;
        const text = formatTicketLine(lastResult.gameId, lastResult.dateSeed, lastResult.nums);
        const ok = await copyText(text);
        btnTicket.textContent = ok ? 'Copied ✓' : 'Copy as ticket';
        setTimeout(() => (btnTicket.textContent = 'Copy as ticket'), 1200);
      });
    }

    const btnMore = document.getElementById('btnMorePicks');
    if (btnMore) {
      btnMore.addEventListener('click', () => {
        renderMorePicksList();
      });
    }

    const btnExplain = document.getElementById('btnExplain');
    if (btnExplain) {
      btnExplain.addEventListener('click', () => {
        if (!lastResult) return;
        const { gameId, idxs, dateSeed, nums } = lastResult;
        const emojiText = idxs.map(i => `${EMOJIS[i]?.e || '❓'}(#${i})`).join(' ');
        openModal('Why these numbers?', `
          <p><b>Deterministic:</b> the same emojis on the same date always create the same numbers.</p>
          <p><b>Date seed:</b> ${dateSeed}</p>
          <p><b>Your emojis:</b> ${emojiText}</p>
          <p><b>Internal seed string:</b><br><span class="mono">${nums.seedStr}</span></p>
          <p class="micro">Entertainment only. No prediction claims.</p>
        `);
      });
    }

    $('#btnCopy').addEventListener('click', async () => {
      const g = GAMES[currentGame];
      const need = g.mainCount + g.bonusCount;
      const idxs = uniq(selected).slice(0, need);
      const url = makeSoloLink(currentGame, idxs);
      const ok = await copyText(url);
      $('#btnCopy').textContent = ok ? 'Copied ✓' : 'Copy failed';
      setTimeout(() => $('#btnCopy').textContent = 'Copy link', 1200);
    });

    $('#btnShare').addEventListener('click', async () => {
      const g = GAMES[currentGame];
      const need = g.mainCount + g.bonusCount;
      const idxs = uniq(selected).slice(0, need);
      const url = makeSoloLink(currentGame, idxs);
      const ok = await shareUrl(url, 'EmojiPick — my lucky numbers', buildShareText('solo'));
      if (!ok) {
        const copied = await copyText(url);
        $('#btnShare').textContent = copied ? 'Copied ✓' : 'Share';
        setTimeout(() => $('#btnShare').textContent = 'Share', 1200);
      }
    });

    $('#btnChallenge').addEventListener('click', async () => {
      const g = GAMES[currentGame];
      const need = g.mainCount + g.bonusCount;
      const idxs = uniq(selected).slice(0, need);
      const url = makeChallengeLink(currentGame, idxs);
      const ok = await shareUrl(url, 'EmojiPick — challenge', buildShareText('challenge'));
      if (!ok) {
        const copied = await copyText(url);
        $('#btnChallenge').textContent = copied ? 'Invite link copied ✓' : 'Challenge a friend';
        setTimeout(() => $('#btnChallenge').textContent = 'Challenge a friend', 1500);
      }
    });

    // modal
    $('#btnInfo').addEventListener('click', () => {
      openModal('About EmojiPick', `
        <p><b>EmojiPick</b> is a small shareable game that turns your emoji picks into a set of numbers.</p>
        <p><b>Important:</b> Entertainment only. No prediction claims. No ticket sales. Always play responsibly.</p>
        <p><b>Challenge mode:</b> Share your card; a friend generates their card; we compare overlaps.</p>
      `);
    });

    // Privacy/Terms are real pages now.
    // If these are rendered as buttons in the future, show them in a modal instead.
    const privEl = document.getElementById('btnPrivacy');
    if (privEl && privEl.tagName === 'BUTTON') {
      privEl.addEventListener('click', () => {
        openModal('Privacy (simple)', `
          <p>EmojiPick runs entirely in your browser. It does not require login.</p>
          <p>Links you share contain only emoji index choices (e.g., “1,5,20”).</p>
          <p>No personal data is collected in this demo.</p>
        `);
      });
    }

    const termsEl = document.getElementById('btnTerms');
    if (termsEl && termsEl.tagName === 'BUTTON') {
      termsEl.addEventListener('click', () => {
        openModal('Terms (simple)', `
          <p>EmojiPick is provided “as is” for entertainment purposes only.</p>
          <p>Do not use this app as a basis for financial decisions.</p>
          <p>EmojiPick is not affiliated with any official lottery operator.</p>
        `);
      });
    }

    $('#modal').addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.close === '1') closeModal();
    });

    // initial state from URL
    setActiveTab(clampGameId(gameParam));
    setModeBanner();

    // If URL has i= (solo link), auto-select and show result.
    const autoIdxs = soloParam ? parseIndexList(soloParam) : [];
    if (autoIdxs.length) {
      selected = uniq(autoIdxs).slice(0, GAMES[currentGame].mainCount + GAMES[currentGame].bonusCount);
      updatePickedUI();
      renderEmojiGrid();

      const dateSeed = todayKey();
      const myNums = computeNumbers(currentGame, selected, dateSeed);
      renderResult(currentGame, selected, dateSeed, myNums, hostParam ? 'challenge' : 'solo');
      showResult();
    } else {
      updatePickedUI();
      renderEmojiGrid();
      showPick();
    }

    // If URL has host challenge, show banner.
    if (hostParam) {
      $('#comparePanel').hidden = true;
    }
  }

  // Run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
