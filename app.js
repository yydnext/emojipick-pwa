/*
  EmojiPick (PWA)
  - Solo mode: pick emojis → deterministic numbers (seeded by date + emojis)
  - Challenge mode: challenger shares link with their emoji indices (h=...)
                   friend generates their numbers and we compare.

  NOTE: This is an entertainment-only demo. It does not sell lottery tickets.
*/

(() => {
  'use strict';

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

  function computeNumbers(gameId, emojiIdxList, dateSeed) {
    const g = GAMES[gameId];
    const idxs = uniq(emojiIdxList).slice(0, g.mainCount + g.bonusCount);
    const seedStr = `${gameId}|${dateSeed}|${idxs.join('-')}`;
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

    // partner link
    const partner = $('#btnPartner');
    partner.href = g.partnerDeepLink;
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

  async function shareUrl(url, title) {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return true;
      } catch {
        return false;
      }
    }
    return false;
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

  // ---------- Wire UI
  function init() {
    $('#year').textContent = String(new Date().getFullYear());
    $('#todayPill').textContent = todayKey();

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
      const ok = await shareUrl(url, 'EmojiPick — my lucky numbers');
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
      const ok = await shareUrl(url, 'EmojiPick — challenge');
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

    $('#btnPrivacy').addEventListener('click', () => {
      openModal('Privacy (simple)', `
        <p>EmojiPick runs entirely in your browser. It does not require login.</p>
        <p>Links you share contain only emoji index choices (e.g., “1,5,20”).</p>
        <p>No personal data is collected in this demo.</p>
      `);
    });

    $('#btnTerms').addEventListener('click', () => {
      openModal('Terms (simple)', `
        <p>EmojiPick is provided “as is” for entertainment purposes only.</p>
        <p>Do not use this app as a basis for financial decisions.</p>
        <p>EmojiPick is not affiliated with any official lottery operator.</p>
      `);
    });

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
