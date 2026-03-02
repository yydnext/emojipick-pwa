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
function localGet(k){ try{return localStorage.getItem(k);}catch{return null;} }
function localSet(k,v){ try{localStorage.setItem(k,String(v));}catch{} }
function getDb(){ if(window.db) return window.db; try{return window.firebase.firestore();}catch{return null;} }
function serverTs(){ try{return window.firebase.firestore.FieldValue.serverTimestamp();}catch{return Date.now();} }
function setMsg(m){ if($('msg')) $('msg').textContent = m||''; }
function isHost(){ return qs('host')==='1'; }
function roomCode(){ return upper($('roomCode')?.value || qs('room')); }
function playerName(){ return clean($('name')?.value || localGet('party_name')); }
function fmtTime(ts){ try{ const d = ts&&ts.toMillis?new Date(ts.toMillis()):new Date(ts); return d.toLocaleString(); }catch{return '';} }
function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function randCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let o=''; for(let i=0;i<4;i++) o+=c[Math.floor(Math.random()*c.length)]; return o; }

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
  if($('hostPanel')) $('hostPanel').classList.toggle('hidden', !isHost());
  if($('guestPanel')) $('guestPanel').classList.toggle('hidden', isHost());
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
  resetRoomUIState();
  const db=getDb(); if(!db) return alert('Firebase not ready.');
  const name=playerName(); if(!name) return alert('Enter your name first.');
  localSet('party_name', name);
  let code='';
  for(let i=0;i<6;i++){ const c=randCode(); const s=await db.collection('rooms').doc(c).get(); if(!s.exists){ code=c; break; } }
  if(!code) return alert('Could not create room.');
  await db.collection('rooms').doc(code).set({ status:'lobby', hostName:name, createdAt: serverTs() }, {merge:true});
  await db.collection('rooms').doc(code).collection('players').doc(name).set({ name, joinedAt: serverTs() }, {merge:true});
  $('roomCode').value=code; setQs('room', code); setQs('host','1');
  setMsg(`Room created: ${code}`);
  showLobby(code); attachWatchers(code, name);
  const lt=latestTicket();
  //if(lt.text && lt.ts && lt.ageMs<=TS_FRESH_MS){
   // try { await setHostMessage(lt.text, name); setMsg('Room created. Auto-posted your latest picks.'); } catch {}
  //}
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
    localStorage.removeItem('emojiPick_last_ticket_text'); // legacy fallback
    localStorage.removeItem('last_ticket_text');           // legacy fallback
    localStorage.removeItem('emojipick_last_submit_fp');
    localStorage.removeItem('emojipick_party_pending_room');
    localStorage.removeItem('emojipick_party_pending_name');
    localStorage.removeItem('emojipick_party_pending_at');
  } catch {}
 
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
  const txt = clean(localStorage.getItem('emojipick_last_ticket_text') || '');
  if (!txt) return alert('No generated numbers found yet. Use Home → generate first.');

  try {
    await db.collection('rooms').doc(code).set({
      winningNumbersText: txt,
      winningNumbersAt: serverTs(),
      // 상태 전환은 선택 사항 (원하시면 유지)
      status: 'collecting'
    }, { merge: true });

    // host 전용 캐시(선택, but 권장)
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

function renderWinningNumbers(roomData){
  const w = roomData && roomData.winningNumbers;
  const hostInput = $('inpWinningNumbers');
  const hostMeta  = $('winningMeta');
  const guestCard = $('guestWinningCard');
  const guestText = $('guestWinningText');
  const guestMeta = $('guestWinningMeta');

  if (!w || !w.text) {
    if (hostMeta) hostMeta.textContent = 'Not set yet.';
    if (guestCard) guestCard.classList.add('hidden');
    if (guestText) guestText.textContent = '';
    if (guestMeta) guestMeta.textContent = '';
    return;
  }

  // Host 영역 표시 (기존 영역 유지)
  if (hostInput && !hostInput.value) hostInput.value = w.text;
  if (hostMeta) hostMeta.textContent = `Saved: ${w.text}`;

  // Guest 영역 표시 (신규 카드)
  if (guestCard) guestCard.classList.remove('hidden');
  if (guestText) guestText.textContent = w.text;
  if (guestMeta) guestMeta.textContent = `Official numbers (${w.source || 'host'})`;
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
  const code=roomCode(), name=playerName();
  if(!code) return alert('Join a room first.');
  if(!name) return alert('Enter your name first.');
  localSet('party_name', name);
  localSet('emojipick_party_pending_room', code);
  localSet('emojipick_party_pending_name', name);
  localSet('emojipick_party_pending_at', Date.now());
  location.href = `./index.html?room=${encodeURIComponent(code)}&return=party`;
}

async function submitMyPicks(auto=false){
  if(isHost()) return false;
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
      by:name, text:lt.text, submittedAt:serverTs(), source:'guest_generate'
    }, {merge:true});
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
  $('btnCreateRoom')?.addEventListener('click', e=>{e.preventDefault(); createRoom();});
  $('btnJoin')?.addEventListener('click', e=>{e.preventDefault(); joinRoom();});
  $('btnCopy')?.addEventListener('click', e=>{e.preventDefault(); copyInvite();});
  $('btnShareInvite')?.addEventListener('click', e=>{e.preventDefault(); shareInvite();});
  $('btnToggleQR')?.addEventListener('click', e=>{e.preventDefault(); $('qrWrap')?.classList.toggle('hidden');});
  $('btnSendHostMessage')?.addEventListener('click', async e=>{ e.preventDefault(); const t=clean($('inpHostMessage')?.value); if(!t) return alert('Enter a message first.'); try{ await setHostMessage(t); setMsg('Sent to room.'); }catch(err){ console.error(err); alert('Send failed.'); } });
  $('btnClearHostMessage')?.addEventListener('click', e=>{e.preventDefault(); clearHostMessage();});
  $('btnSetWinningNumbers')?.addEventListener('click', e=>{e.preventDefault(); generateWinningNumbers();});
  $('btnStartCollecting')?.addEventListener('click', e=>{e.preventDefault(); startCollecting();});
  $('btnGoGenerate')?.addEventListener('click', e=>{e.preventDefault(); goGenerate();});
  $('btnSubmitMyPicks')?.addEventListener('click', e=>{e.preventDefault(); submitMyPicks(false);});

  $('btnProPack')?.addEventListener('click', async e=>{ e.preventDefault(); await logPro('click',''); openPro(); });
  $('btnProClose')?.addEventListener('click', e=>{e.preventDefault(); closePro();});
  $('btnProNoThanks')?.addEventListener('click', e=>{e.preventDefault(); closePro();});
  $('btnProNotify')?.addEventListener('click', async e=>{ e.preventDefault(); await logPro('submit', $('inpProEmail')?.value||''); $('proThanks').classList.remove('hidden'); setTimeout(closePro, 900); });

  window.addEventListener('focus', ()=>{ refreshGuestLatestPanel(); refreshGuestSubmitEnabled(); setTimeout(()=>{ refreshGuestLatestPanel(); refreshGuestSubmitEnabled(); }, 220); });
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ refreshGuestLatestPanel(); refreshGuestSubmitEnabled(); }});
}

async function boot(){
  wire();
  if($('roomCode') && qs('room')) $('roomCode').value = upper(qs('room'));
  // Name auto-restore disabled to avoid stale host/guest input prefill
  roleUI();
  refreshGuestLatestPanel();
  refreshGuestSubmitEnabled();
  refreshGuestButtonsVisual();
  await autoResumeIfNeeded();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
