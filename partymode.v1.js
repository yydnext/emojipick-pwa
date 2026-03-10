(function(){
'use strict';
const $ = (id)=>document.getElementById(id);
const upper = (s)=>String(s||'').trim().toUpperCase();
const clean = (s)=>String(s||'').trim();
const TS_FRESH_MS = 10*60*1000;
let unsubRoom=null, unsubPlayers=null, unsubSubs=null;
let watchRoomToken = 0;

function qs(k){ try { return new URLSearchParams(location.search).get(k)||''; } catch { return ''; } }
function setQs(k,v){ try { const u=new URL(location.href); if(v)u.searchParams.set(k,String(v)); else u.searchParams.delete(k); history.replaceState({},'',u.toString()); } catch{} }
function localGet(k){
  try{
    if (k === 'party_name') return sessionStorage.getItem(k);
    return localStorage.getItem(k);
  }catch{return null;}
}

function localSet(k,v){
  try{
    if (k === 'party_name') sessionStorage.setItem(k, String(v));
    else localStorage.setItem(k, String(v));
  }catch{}
}
  async function ensureAnonAuth(){
  try {
    if (!window.firebase || !firebase.auth) return null;
    const cur = firebase.auth().currentUser;
    if (cur) return cur;
    const cred = await firebase.auth().signInAnonymously();
    return (cred && cred.user) ? cred.user : firebase.auth().currentUser;
  } catch (e) {
    console.error('[Auth] Anonymous sign-in failed', e);
    return null;
  }
}
function getDb(){ if(window.db) return window.db; try{return window.firebase.firestore();}catch{return null;} }
function serverTs(){ try{return window.firebase.firestore.FieldValue.serverTimestamp();}catch{return Date.now();} }
function setMsg(m){ if($('msg')) $('msg').textContent = m||''; }
function isHost(){ return qs('host')==='1'; }
function roomCode(){ return upper($('roomCode')?.value || qs('room')); }
function playerName(){ return clean($('name')?.value || localGet('party_name')); }
function fmtTime(ts){ try{ const d = ts&&ts.toMillis?new Date(ts.toMillis()):new Date(ts); return d.toLocaleString(); }catch{return '';} }
function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function randCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let o=''; for(let i=0;i<4;i++) o+=c[Math.floor(Math.random()*c.length)]; return o; }
function hostLatestPick(){
  return {
    text: localStorage.getItem('party_host_last_ticket_text') || '',
    ts: Number(localStorage.getItem('party_host_last_ticket_ts') || 0)
  };
}    
  
function safeUid(){
  try { return (firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : ''; }
  catch(e){ return ''; }
}

async function logEvent(action, extra){
  try{
    const db = getDb(); if(!db) return;
    const payload = Object.assign({
      action: String(action || ''),
      createdAt: serverTs(),
      page: 'partymode',
      role: isHost() ? 'host' : 'guest',
      room: roomCode() || '',
      ref: location.href,
      ua: navigator.userAgent,
      uid: safeUid()
    }, (extra || {}));
    await db.collection('metrics_events').add(payload);
  } catch(e){
    // 로깅 실패는 앱 기능에 영향 주면 안 되므로 조용히 무시
  }
}
  
 function parseNumsFromTicketText(txt){
  // 예: "Powerball • 2026-02-28: 15 26 52 54 62 + PB 3 (Entertainment only)"
  const s = String(txt || '');
  const m = s.match(/:\s*([0-9\s]+)\s*\+\s*PB\s*([0-9]+)/i);
  if (!m) return null;
  const main = (m[1] || '').trim().split(/\s+/).filter(Boolean).map(n => Number(n));
  const pb = Number(m[2]);
  if (!main.length || !Number.isFinite(pb)) return null;
  return { main, pb, raw: `${main.join(' ')} + PB ${pb}` };
}

function makeRandomWinningNumbersPB(){
  // Powerball 스타일(데모용): 1~69 중 5개 + PB 1~26
  const pickUnique = (count, min, max) => {
    const set = new Set();
    while (set.size < count) {
      set.add(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return [...set].sort((a,b)=>a-b);
  };
  const main = pickUnique(5, 1, 69);
  const pb = Math.floor(Math.random() * 26) + 1;
  return { main, pb, raw: `${main.join(' ')} + PB ${pb}` };
} 

function latestTicket(){
  let text = clean(localGet('emojipick_last_ticket_text'));
  if(!text) text = clean(localGet('emojiPick_last_ticket_text') || localGet('last_ticket_text'));
  const ts = Number(localGet('emojipick_last_ticket_ts')||0)||0;
  return { text, ts, ageMs: ts ? Date.now()-ts : Infinity };
}

function setStatusPill(status){
  if(!$('roomStatusPill')) return;
  $('roomStatusPill').textContent = 'Status: ' + (status||'lobby');
}


function resetRoomUIState(){
  try{ detachWatchers(); }catch{}
  try{
    if($('playersList')) $('playersList').innerHTML = '';
    if($('submissionsList')) $('submissionsList').innerHTML = '';
    if($('hostPostedCard')) $('hostPostedCard').classList.add('hidden');
    if($('hostMsgText')) $('hostMsgText').textContent = '';
    if($('hostMsgMeta')) $('hostMsgMeta').textContent = '';
    if($('lobbyCard')) $('lobbyCard').classList.add('hidden');
    if($('submissionsCard')) $('submissionsCard').classList.add('hidden');
  }catch{}
  try{
    localStorage.removeItem('emojipick_last_submit_fp');
    localStorage.removeItem('emojipick_party_pending_room');
    localStorage.removeItem('emojipick_party_pending_name');
    localStorage.removeItem('emojipick_party_pending_at');
  }catch{}
}
function roleUI(){
  const host = isHost();

  if ($('hostPanel')) $('hostPanel').classList.toggle('hidden', !host);
  if ($('guestPanel')) $('guestPanel').classList.toggle('hidden', host);

  // host 전용 latest 카드(버튼 포함)는 host일 때 보이게
  if ($('hostLatestCard')) $('hostLatestCard').classList.toggle('hidden', !host);

  refreshGuestButtonsVisual();
}

function showLobby(code){
  $('lobbyCard')?.classList.remove('hidden');
  $('submissionsCard')?.classList.remove('hidden');
  $('lobbyRoomCode').textContent = code;
  const invite = `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;
  $('inviteLink').value = invite;
  $('qrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(invite)}`;
  roleUI();
  refreshGuestLatestPanel();
  refreshGuestSubmitEnabled();
  syncGuestButtonsUI();
  syncGuestButtonsUI();
}


function syncGuestButtonsUI(){
  const gen = $('btnGoGenerate');
  const sub = $('btnSubmitMyPicks');
  if(gen){
    gen.disabled = false;
    gen.classList.remove('secondary');
    gen.classList.add('primary');
    gen.style.opacity = '1';
    gen.style.filter = 'none';
  }
  if(sub){
    if(sub.disabled){
      sub.style.opacity = '.45';
      sub.style.filter = 'grayscale(40%)';
      sub.classList.remove('primary');
      sub.classList.add('secondary');
    } else {
      sub.style.opacity = '1';
      sub.style.filter = 'none';
      sub.classList.remove('secondary');
      sub.classList.add('primary');
    }
  }
}
function refreshGuestLatestPanel(){
  if(!$('guestLatestPicksText')) return;
  const lt = latestTicket();
  if(lt.text){
    $('guestLatestPicksText').textContent = lt.text;
    $('guestLatestMeta').textContent = lt.ts ? `Generated: ${new Date(lt.ts).toLocaleString()} (${Math.round(lt.ageMs/1000)}s ago)` : 'No timestamp found. Please generate again from Party Mode.';
  } else {
    $('guestLatestPicksText').textContent = 'No latest picks found on this device yet.';
    $('guestLatestMeta').textContent = 'Tap “Pick emojis & generate” first.';
  }
}

function refreshHostLatestPanel(){
  const card = $('hostLatestCard');
  const txtEl = $('hostLatestText');
  const metaEl = $('hostLatestMeta');
  const btnSubmit = $('btnHostSubmitPicks');

  if (!card || !txtEl || !metaEl) return;

  if (!isHost()) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');

  const lt = latestTicket ? latestTicket() : { text:'', ts:null };
  const text = (lt && lt.text) ? lt.text : '';

  txtEl.textContent = text || 'No recent generated picks yet.';
  if (lt && lt.ts) {
    try {
      metaEl.textContent = `Generated: ${new Date(lt.ts).toLocaleString()}`;
    } catch {
      metaEl.textContent = '';
    }
  } else {
    metaEl.textContent = '';
  }

  // 버튼 상태
  if (btnSubmit) {
    const hasText = !!text;
    btnSubmit.disabled = !hasText;
    btnSubmit.classList.toggle('disabled', !hasText);
  }
}
 
function refreshGuestButtonsVisual(){
  const btnGen = $('btnGoGenerate');
  const btnSubmit = $('btnSubmitMyPicks');
  if (btnGen){
    btnGen.disabled = false;
    btnGen.style.opacity = '1';
    btnGen.style.filter = 'none';
    btnGen.style.cursor = 'pointer';
  }
  if (btnSubmit){
    if (btnSubmit.disabled){
      btnSubmit.style.opacity = '.45';
      btnSubmit.style.filter = 'grayscale(35%)';
    } else {
      btnSubmit.style.opacity = '1';
      btnSubmit.style.filter = 'none';
    }
  }
}
function refreshGuestSubmitEnabled(){
  const btn = $('btnSubmitMyPicks'); if(!btn) return;
  if(isHost()){ btn.disabled=true; return; }
  const lt = latestTicket();
  const hasTs = !!lt.ts && lt.ageMs >=0 && lt.ageMs <= TS_FRESH_MS;
  const pendingOk = pendingMatches();
  const ok = !!roomCode() && !!playerName() && !!lt.text && (pendingOk ? hasTs : false);
  btn.disabled = !ok;
  btn.title = ok ? '' : 'Join room + generate your picks first.';
  syncGuestButtonsUI();
  refreshGuestButtonsVisual();
}

async function ensureRoom(code, hostNameMaybe){
  const db = getDb(); if(!db) throw new Error('Firebase not ready');
  const ref = db.collection('rooms').doc(code);
  const s = await ref.get();
  if(!s.exists){
    await ref.set({ status:'lobby', hostName: hostNameMaybe||'', createdAt: serverTs() }, {merge:true});
  }
  return ref;
}

function detachWatchers(){
  try{unsubRoom&&unsubRoom();}catch{} try{unsubPlayers&&unsubPlayers();}catch{} try{unsubSubs&&unsubSubs();}catch{}
  unsubRoom=unsubPlayers=unsubSubs=null;
}

function renderHostPosted(msg){
  const card = $('hostPostedCard');
  if(!card) return;
  if(!msg || !msg.text){
    card.classList.add('hidden');
    $('hostMsgText').textContent=''; $('hostMsgMeta').textContent='';
    return;
  }
  card.classList.remove('hidden');
  $('hostMsgText').textContent = String(msg.text||'');
  $('hostMsgMeta').textContent = `${msg.by ? `by ${msg.by}`:''}${msg.at ? ` · ${fmtTime(msg.at)}`:''}`;
}

function renderWinning(text, at){
  if($('inpWinningNumbers') && isHost() && text && !$('inpWinningNumbers').value) $('inpWinningNumbers').value = text;
  if($('winningMeta')) $('winningMeta').textContent = text ? `Saved: ${text}${at ? ` · ${fmtTime(at)}`:''}` : 'Not set yet.';
}

function attachWatchers(code, hostFallback){
  detachWatchers();
  const token = ++watchRoomToken;
  const db = getDb(); if(!db) return;
  const roomRef = db.collection('rooms').doc(code);

  unsubRoom = roomRef.onSnapshot((snap)=>{ if (token !== watchRoomToken) return;
    if(!snap.exists) return;
    const d = snap.data()||{};
     renderWinningNumbers(d);                                     
                                    
    setStatusPill(d.status||'lobby');
    renderHostPosted(d.roomMessage||null);
    renderWinning(d.winningNumbersText||'', d.winningNumbersAt||null);
    if(isHost()) $('btnStartCollecting')?.classList.toggle('hidden', (d.status||'lobby') !== 'lobby');
    if($('btnStartCollecting')) $('btnStartCollecting').textContent = 'Start round';
  }, (e)=>console.error('[PartyMode] room watch', e));

  unsubPlayers = roomRef.collection('players').onSnapshot((qs)=>{ if (token !== watchRoomToken) return;
    const arr=[]; qs.forEach(doc=>arr.push(doc.id)); arr.sort((a,b)=>a.localeCompare(b));
    const ul=$('playersList'); ul.innerHTML='';
    if(!arr.length){ const li=document.createElement('li'); li.textContent='No players yet.'; ul.appendChild(li); return; }
    arr.forEach(n=>{ const li=document.createElement('li'); li.textContent = (hostFallback && n===hostFallback)? `${n} (host)` : n; ul.appendChild(li); });
  }, (e)=>console.error('[PartyMode] players watch', e));

  unsubSubs = roomRef.collection('submissions').onSnapshot((qs)=>{ if (token !== watchRoomToken) return;
    const items=[]; qs.forEach(doc=>{ const d=doc.data()||{}; items.push({id:doc.id,...d, t: d.submittedAt?.toMillis?d.submittedAt.toMillis():(d.submittedAt||0)}); });
    items.sort((a,b)=>(a.t||0)-(b.t||0));
    const ul=$('submissionsList'); ul.innerHTML='';
    if(!items.length){ const li=document.createElement('li'); li.textContent='No submissions yet.'; ul.appendChild(li); return; }
    items.forEach(it=>{ const li=document.createElement('li'); li.innerHTML = `<b>${esc(it.by||it.id)}</b>: ${esc(it.text||'')}`; ul.appendChild(li); });
  }, (e)=>{ console.error('[PartyMode] submissions watch', e); setMsg('Submissions read failed. Check Firestore rules for rooms/{room}/submissions.'); });
}

async function createRoom(){
  await ensureAnonAuth();
  resetRoomUIState();
  const db=getDb(); if(!db) return alert('Firebase not ready.');
  const name=playerName(); if(!name) return alert('Enter your name first.');
  localSet('party_name', name);
  let code='';
  for(let i=0;i<6;i++){ const c=randCode(); const s=await db.collection('rooms').doc(c).get(); if(!s.exists){ code=c; break; } }
  if(!code) return alert('Could not create room.');
  const me = firebase.auth && firebase.auth().currentUser ? firebase.auth().currentUser : null;
  await db.collection('rooms').doc(code).set({
  status: 'lobby',
  hostName: name,
  hostUid: me && me.uid ? me.uid : '',
  createdAt: serverTs()
  }, { merge: true });
  await db.collection('rooms').doc(code).collection('players').doc(name).set({
  name,
  uid: me && me.uid ? me.uid : '',
  joinedAt: serverTs()
  }, { merge: true });
  $('roomCode').value=code; setQs('room', code); setQs('host','1');
  setMsg(`Room created: ${code}`);
  logEvent('create_room');
  showLobby(code); attachWatchers(code, name);
  // const lt=latestTicket();
  // if(lt.text && lt.ts && lt.ageMs<=TS_FRESH_MS){
   // try { await setHostMessage(lt.text, name); setMsg('Room created. Auto-posted your latest picks.'); } catch {}
  // }
  // Host 개인 최신픽은 hostLatestCard에서만 보이고,
  // host message 영역으로 자동 전송하지 않음
  setMsg(`Room created: ${code}`);
 }

async function joinRoom(){
  resetRoomUIState();
  const db=getDb(); if(!db) return alert('Firebase not ready.');
  const code=roomCode(); const name=playerName();
  if(!code) return alert('Enter room code first.');
  if(!name) return alert('Enter your name first.');
  // Same-browser guest test cleanup (same PC/browser retest)
  try {
  localStorage.removeItem('emojipick_last_ticket_text');
  localStorage.removeItem('emojipick_last_ticket_ts');
  localStorage.removeItem('emojiPick_last_ticket_text');
  localStorage.removeItem('last_ticket_text');

 localStorage.removeItem('emojipick_party_last_role');
 localStorage.removeItem('emojipick_party_last_room');
 localStorage.removeItem('emojipick_party_last_ticket_text');
 localStorage.removeItem('emojipick_party_last_ticket_ts'); 
} catch {}
refreshGuestLatestPanel();
refreshGuestSubmitEnabled();
 
  localSet('party_name', name);
 
  // Same-browser guest rejoin cleanup (remove previous player doc if this tab used another guest name/room)
  try{
    const prevRoom = localStorage.getItem('party_last_join_room') || '';
    const prevName = localStorage.getItem('party_last_join_name') || '';
    if(prevRoom && prevName && window.db){
      const samePersonDifferentName = (prevRoom === code && prevName !== name);
      const samePersonOtherRoom = (prevRoom !== code);
      if(samePersonDifferentName || samePersonOtherRoom){
        window.db.collection('rooms').doc(prevRoom)
          .collection('players').doc(prevName)
          .delete()
          .catch(()=>{});
      }
    }
  } catch {}

  const ref=db.collection('rooms').doc(code);
  const snap=await ref.get(); if(!snap.exists) return alert(`Room not found: ${code}`);
  await ref.collection('players').doc(name).set({ name, joinedAt: serverTs() }, {merge:true});
  $('roomCode').value=code; setQs('room', code); setQs('host','');
  setMsg(`Joined room ${code} as ${name}`);
  showLobby(code); attachWatchers(code, snap.data()?.hostName || '');
  setTimeout(()=>{ refreshGuestLatestPanel(); refreshGuestSubmitEnabled(); }, 250);

  // Remember this guest join for next cleanup
  try{
    localStorage.setItem('party_last_join_room', code);
    localStorage.setItem('party_last_join_name', name);
  } catch {}
}

async function autoResumeIfNeeded(){
  const code = upper(qs('room')); const name = playerName();
  if(!code || !name) return false;
  if($('lobbyCard') && !$('lobbyCard').classList.contains('hidden')) return false;
  const db=getDb(); if(!db) return false;
  try{
    const ref = await ensureRoom(code, '');
    await ref.collection('players').doc(name).set({ name, joinedAt: serverTs() }, {merge:true});
    if($('roomCode')) $('roomCode').value = code;
    if($('name') && !$('name').value) $('name').value = name;
    showLobby(code);
    const s = await ref.get();
    attachWatchers(code, s.data()?.hostName || '');
    setMsg('Returned to Party Mode.');
    setTimeout(()=>{ refreshGuestLatestPanel(); refreshGuestSubmitEnabled(); syncGuestButtonsUI(); }, 180);
    setTimeout(()=>{ refreshGuestLatestPanel(); refreshGuestSubmitEnabled(); }, 300);
    return true;
  }catch(e){ console.warn('[PartyMode] autoResumeIfNeeded', e); return false; }
}

async function setHostMessage(text, by){
  const db=getDb(); if(!db) throw new Error('Firebase not ready');
  const code=roomCode(); if(!code) throw new Error('No room');
  await db.collection('rooms').doc(code).set({ roomMessage:{ text, by: by||playerName()||'host', at: serverTs() } }, {merge:true});
  renderHostPosted({ text, by: by||playerName()||'host', at: Date.now() });
}

async function setRoomWinningNumbers(payload){
  const db = getDb(); if (!db) throw new Error('Firebase not ready');
  const code = roomCode();
  if (!code) throw new Error('No room code');

  const data = {
    text: payload.text,                 // "1 2 3 4 5 + PB 6"
    source: payload.source || 'host-generate', // host-generate | host-ticket
    by: playerName() || 'host',
    updatedAt: serverTs()
  };

  await db.collection('rooms').doc(code).set({
    winningNumbers: data
  }, { merge: true });
}
  
async function clearHostMessage(){
  const db=getDb(); if(!db) return alert('Firebase not ready.');
  const code=roomCode(); if(!code) return;
  await db.collection('rooms').doc(code).set({ roomMessage:null }, {merge:true});
  if($('inpHostMessage')) $('inpHostMessage').value='';
  renderHostPosted(null); setMsg('Cleared host posted picks.');
}

async function generateWinningNumbers(){
  const db = getDb();
  if (!db) return alert('Firebase not ready.');

  const code = roomCode();
  if (!code) return alert('Create or join a room first.');
  if (!isHost()) return alert('Only host can generate winning numbers.');

  // host가 메인(이모지픽)에서 생성한 "최신 번호"를 읽되,
  // submissions용 로직과 충돌하지 않도록 winning 저장은 room 필드에만 함
  const hostLt = getPartyLatestForRole('host', code);

  const manualWinningText = clean(
  $('winningNumbersText')?.value ||
  $('inpWinningNumbers')?.value ||
  ''
);

const txt = clean((hostLt && hostLt.text) || manualWinningText || '');

if (!txt) {
  return alert('Enter winning numbers in the box, or generate host picks first.');
}

  try {
    await db.collection('rooms').doc(code).set({
      winningNumbersText: txt,
      winningNumbersAt: serverTs(),
      // 상태 전환은 선택 사항 (원하시면 유지)
      status: 'collecting'
    }, { merge: true });

    // host 전용 캐시 (선택, but 권장)
    try {
      localStorage.setItem('party_host_winning_text', txt);
      localStorage.setItem('party_host_winning_ts', String(Date.now()));
    } catch {}

    setMsg('Winning numbers saved.');
    renderWinningNumbers({ winningNumbersText: txt });
  } catch (e) {
    console.error('[PartyMode] generateWinningNumbers', e);
    alert('Failed to save winning numbers.');
  }
}

function getPartyLatestForRole(role, room){
  try {
    const r = String(role || '').toLowerCase();
    const rm = String(room || '').toUpperCase();

    // Host는 host 전용 latest 키를 우선 사용 (같은 브라우저/기기에서 확실)
    if (r === 'host') {
      const text = localStorage.getItem('party_host_last_ticket_text') || '';
      const ts = Number(localStorage.getItem('party_host_last_ticket_ts') || 0);
      return { text, ts, room: rm, role: 'host' };
    }

    // Guest(또는 일반): party bridge latest 사용
    const lastRole = (localStorage.getItem('emojipick_party_last_role') || '').toLowerCase();
    const lastRoom = (localStorage.getItem('emojipick_party_last_room') || '').toUpperCase();
    const text = localStorage.getItem('emojipick_party_last_ticket_text') || '';
    const ts = Number(localStorage.getItem('emojipick_party_last_ticket_ts') || 0);

    if (lastRole !== r) return { text: '', ts: 0, room: lastRoom, role: lastRole };
    if (rm && lastRoom && rm !== lastRoom) return { text: '', ts: 0, room: lastRoom, role: lastRole };

    return { text, ts, room: lastRoom, role: lastRole };
  } catch {
    return { text: '', ts: 0, room: '', role: '' };
  }
}
                    
function renderWinningNumbers(roomData){
  const txt = (roomData && roomData.winningNumbersText) || '';
  const at  = (roomData && roomData.winningNumbersAt) || null;
  const src = (roomData && roomData.winningNumbersSource) || 'host';

  const hostInput = $('inpWinningNumbers');
  const hostMeta  = $('winningMeta');

  const guestCard = $('guestWinningCard');
  const guestText = $('guestWinningText');
  const guestMeta = $('guestWinningMeta');

  if (!txt) {
    if (hostMeta) hostMeta.textContent = 'Not set yet.';
    if (guestCard) guestCard.classList.add('hidden');
    if (guestText) guestText.textContent = '';
    if (guestMeta) guestMeta.textContent = '';
    return;
  }

  // Host 영역 표시
  if (hostInput && !hostInput.value) hostInput.value = txt;
  if (hostMeta) hostMeta.textContent = `Saved: ${txt}`;

  // Guest 영역 표시
  if (guestCard) guestCard.classList.remove('hidden');
  if (guestText) guestText.textContent = txt;
  if (guestMeta) guestMeta.textContent = `Official numbers (${src})`;
}
  
async function startCollecting(){
  const db=getDb(); if(!db) return alert('Firebase not ready.');
  const code=roomCode(); if(!code) return;
  await db.collection('rooms').doc(code).set({ status:'collecting' }, {merge:true});
  setMsg('Status changed to collecting.');
}

function pendingMatches(){
  return upper(localGet('emojipick_party_pending_room')) === roomCode() &&
         clean(localGet('emojipick_party_pending_name')) === playerName();
}
function fp(code,name,text){ return `${upper(code)}|${clean(name)}|${String(text||'')}`; }

function goGenerate(){
  const code = roomCode();
  const name = playerName();

  if (!code) return alert('Join a room first.');
  if (!name) return alert('Enter your name first.');

  localSet('party_name', name);
  localSet('emojipick_party_pending_room', code);
  localSet('emojipick_party_pending_name', name);
  localSet('emojipick_party_pending_at', Date.now());

  const hostFlag = isHost() ? '&host=1' : '';
  location.href = `./index.html?room=${encodeURIComponent(code)}&return=party${hostFlag}`;
}

async function submitMyPicks(auto=false){
  // if(isHost()) return false;
  const db=getDb(); if(!db){ if(!auto) alert('Firebase not ready.'); return false; }
  const code=roomCode(), name=playerName(); if(!code||!name){ if(!auto) alert('Join room first.'); return false; }
  const lt=latestTicket();
  const freshEnough = (!!lt.ts && lt.ageMs<=TS_FRESH_MS);
  if(!lt.text || !freshEnough){ if(!auto) alert('No recent picks found. Generate first.'); return false; }
  if(!pendingMatches()){ if(!auto) alert('Please tap “Pick emojis & generate” from this room and return.'); return false; }

  const lastFp = localGet('emojipick_last_submit_fp');
  const currFp = fp(code,name,lt.text);

  if(!lastFp && !pendingMatches()){ if(!auto) alert('Please use “Pick emojis & generate” and return here first.'); return false; }
  if(auto && lastFp===currFp) return false;

  try{
    await db.collection('rooms').doc(code).collection('submissions').doc(name).set({
    by: name,
    text: lt.text,
    submittedAt: serverTs(),
    source: isHost() ? 'host_generate' : 'guest_generate'
    }, { merge: true });
    localSet('emojipick_last_submit_fp', currFp);
    try{ localStorage.removeItem('emojipick_party_pending_room'); localStorage.removeItem('emojipick_party_pending_name'); localStorage.removeItem('emojipick_party_pending_at'); }catch{}
    setMsg('Submitted your picks.');
    refreshGuestLatestPanel(); refreshGuestSubmitEnabled();
    return true;
  }catch(e){
    console.error('[PartyMode] submit', e);
    if(!auto) alert('Submit failed. Check Firestore rules for submissions.');
    return false;
  }
}
async function tryAutoSubmit(){ return false; }

async function copyInvite(){
  const txt=clean($('inviteLink')?.value); if(!txt) return;
  try{
    if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(txt);
    else{ const ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.top='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    setInviteMsg('Copied invite link.');
  }catch{ alert('Copy failed.'); }
}
async function shareInvite(){
  const url=clean($('inviteLink')?.value); if(!url) return;
  try{ if(navigator.share) await navigator.share({title:'EmojiPick Party Mode', text:'Join my room', url}); else await copyInvite(); setInviteMsg('Invite shared.');}catch{}
}
  
function setInviteMsg(t){
  const el = $('inviteMsg');
  if (!el) return setMsg(t); // fallback
  el.textContent = t || '';
  if (t) {
    clearTimeout(window.__inviteMsgTimer);
    window.__inviteMsgTimer = setTimeout(()=>{ if(el.textContent===t) el.textContent=''; }, 1800);
  }
}
  
function openPro(){ $('proModal').classList.remove('hidden'); $('proModal').style.display='grid'; $('proThanks').classList.add('hidden'); }
function closePro(){ $('proModal').classList.add('hidden'); $('proModal').style.display='none'; }

async function logPro(action,email){
  const db=getDb(); if(!db) return;
  try{
    await db.collection('pro_interest').add({
      createdAt: serverTs(), page:'partymode', action, email: clean(email||''), room: roomCode(),
      role: isHost()?'host':'guest', ua:navigator.userAgent||'', ref:document.referrer||''
    });
  }catch(e){ console.warn('[PartyMode] pro log', e); }
}

function wire(){
  $('btnCreateRoom')?.addEventListener('click', e=>{ e.preventDefault(); createRoom(); });
  $('btnJoin')?.addEventListener('click', e=>{ e.preventDefault(); joinRoom(); });
  $('btnCopy')?.addEventListener('click', e=>{ e.preventDefault(); copyInvite(); });
  $('btnShareInvite')?.addEventListener('click', e=>{ e.preventDefault(); shareInvite(); });
  $('btnToggleQR')?.addEventListener('click', e=>{ e.preventDefault(); $('qrWrap')?.classList.toggle('hidden'); });

  $('btnSendHostMessage')?.addEventListener('click', async e=>{
    e.preventDefault();
    const t = clean($('inpHostMessage')?.value);
    if (!t) return alert('Enter a message first.');
    try {
      await setHostMessage(t);
      setMsg('Sent to room.');
    } catch (err) {
      console.error(err);
      alert('Failed to send message.');
    }
  });

  $('btnClearHostMessage')?.addEventListener('click', e=>{
    e.preventDefault();
    clearHostMessage();
  });

  $('btnSetWinningNumbers')?.addEventListener('click', e=>{
    e.preventDefault();
    generateWinningNumbers();
  });

  $('btnStartCollecting')?.addEventListener('click', e=>{
    e.preventDefault();
    startCollecting();
  });

  $('btnGoGenerate')?.addEventListener('click', e=>{
    e.preventDefault();
    goGenerate();
  });

  $('btnSubmitMyPicks')?.addEventListener('click', e=>{
    e.preventDefault();
    submitMyPicks(false);
  });

  $('btnProPack')?.addEventListener('click', async e=>{
    e.preventDefault();
    await logPro('click', '');
    openPro();
  });

  $('btnProClose')?.addEventListener('click', e=>{
    e.preventDefault();
    closePro();
  });

  $('btnProNoThanks')?.addEventListener('click', e=>{
    e.preventDefault();
    closePro();
  });

  $('btnProNotify')?.addEventListener('click', async e=>{
    e.preventDefault();
    await logPro('submit', $('inpProEmail')?.value || '');
    $('proThanks')?.classList.remove('hidden');
    setTimeout(closePro, 900);
  });

  // 새로 추가한 호스트 번호 생성 버튼
  $('btnHostPickGenerate')?.addEventListener('click', e=>{
    e.preventDefault();

    try {
      localStorage.setItem('emojipick_party_pending_room', roomCode() || '');
      localStorage.setItem('emojipick_party_pending_name', playerName() || '');
      localStorage.setItem('emojipick_party_pending_at', String(Date.now()));
    } catch {}

   const code = roomCode();
location.href = `./index.html?return=party&room=${encodeURIComponent(code || '')}&host=1`;
  });

  $('btnHostSubmitPicks')?.addEventListener('click', e=>{
    e.preventDefault();
    submitMyPicks(false); // host도 허용
  });

  window.addEventListener('focus', ()=>{
    refreshGuestLatestPanel();
    refreshGuestSubmitEnabled();
    refreshHostLatestPanel();
    setTimeout(()=>{
      refreshGuestLatestPanel();
      refreshGuestSubmitEnabled();
      refreshHostLatestPanel();
    }, 220);
  });

  document.addEventListener('visibilitychange', ()=>{
    if (!document.hidden) {
      refreshGuestLatestPanel();
      refreshGuestSubmitEnabled();
      refreshHostLatestPanel();
    }
  });
}

async function boot(){
  wire();
  if ($('roomCode') && qs('room')) $('roomCode').value = upper(qs('room'));
  // invite 링크로 들어온 경우, 이전 기기 사용자명(특히 host 이름) 자동복원 방지
  if (qs('room') && $('playerName')) {
    $('playerName').value = '';
   } 

  // Name auto-restore disabled to avoid stale host/guest input prefill
  roleUI();

  refreshGuestLatestPanel();
  refreshGuestSubmitEnabled();
  refreshGuestButtonsVisual();
  refreshHostLatestPanel(); // 호스트 픽 표시
  autoResumeIfNeeded();     // 파싱 안정 우선 (await 제거)
}

function refreshHostLatestPanel(){
  const room = roomCode();
  const card = $('hostLatestCard');
  const txtEl = $('hostLatestText');
  const metaEl = $('hostLatestMeta');

  if (!card || !txtEl || !metaEl) return;

  const lt = getPartyLatestForRole('host', room);
  if (!lt || !lt.text) {
  // host는 버튼이 카드 안에 있으므로 카드 자체는 보여줘야 함
  if (isHost()) {
    card.classList.remove('hidden');
  } else {
    card.classList.add('hidden');
  }
  txtEl.textContent = '';
  metaEl.textContent = '';
  return;
}

  card.classList.remove('hidden');
  txtEl.textContent = lt.text;

  let meta = '';
  const tsn = Number(lt.ts || 0);
  if (tsn) {
    try {
      meta = `Generated: ${new Date(tsn).toLocaleString()}`;
    } catch (e) {}
  }
  metaEl.textContent = meta;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
})();
