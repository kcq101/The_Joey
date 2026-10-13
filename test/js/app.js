/* hole photo data (base64) */
const HOLE_PHOTO_5 = "";
const HOLE_PHOTO_1 = "";
const HOLE_PHOTO_2 = "";
const HOLE_PHOTO_3 = "";
const HOLE_PHOTO_4 = "";
const HOLE_PHOTO_6 = "";
const HOLE_PHOTO_7 = "";
const HOLE_PHOTO_8 = "";
const HOLE_PHOTO_9 = "";
const HOLE_PHOTO_10 = "";
const HOLE_PHOTO_11 = "";
const HOLE_PHOTO_12 = "";
const HOLE_PHOTO_13 = "";
const HOLE_PHOTO_14 = "";
const HOLE_PHOTO_15 = "";
const HOLE_PHOTO_16 = "";
const HOLE_PHOTO_17 = "";
const HOLE_PHOTO_18 = "";


/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */
let myName = null;
let myRole = null;      // 'player' | 'guest' | null
let myTeamId = null;    // team id if myRole==='player'
let isAdminSession = false; // never persisted -- must be re-entered each app load
let currentTab = 'scorecard';
let tabSlideDir = null;
let scorecardMode = 'score'; // 'score' | 'manage'
let scoreboardSelectedTeam = null;
let scoreboardGroupFilter = 'all';
let currentHoleIndex = 0;
let sessionReticles = {};      // { holeNumber: [{x,y}, ...] } -- session-only, ephemeral, never persisted
let calibrationMode = null;    // { holeNumber, step: 'tee'|'green' } while an admin is calibrating a hole
let reticleDrag = null;        // { holeNumber, index, moved } during an active long-press/drag
let reticleDeleteTimeout = null; // auto-fade timer for the floating × delete button
let holeSlideDir = null;

let teams = [];             // [{id, label, groupId, players:[name,...]}]
let groups = [];            // [{id, label, teeTime}]
let scores = {};            // { teamId: {1:4, 2:5, ...} }  -- scramble: one score per team per hole
let holesConfig = null;     // [{number,par,yards,shape,bunker,water,contestType,description}]
let contests = {};          // { holeNumber: {winner, distance} }
let extraContests = [];     // [{id, name, location, winner, distance}] -- contests not tied to a hole (e.g. Practice Green)
let contestsLocked = false; // when true, only admin can set contest winners; players can while unlocked
let feedPosts = [];         // [{id,name,text,img,time,likes,likedByMe}]
let tributePosts = [];
let memorialBio = "";
let memorialPhoto = null;
let champions = [];         // [{year,name}]
let scoresLocked = false;   // true once champions are declared; admin can unlock
let TOURNAMENT_YEAR = 2026;     // set from the app-config doc at startup (falls back to 2026 before the year migration)
let heroYearText = `TOURNAMENT · ${TOURNAMENT_YEAR}`;
// Event details shown under the Tournament pill on the Joe tab (admin-editable)
let memorialTitle = 'Remembering Joe';   // heading above the memorial story (admin-editable)
let heroText = {
  tagline: 'A tradition among friends, played in his honor',
  sub: "The annual Joe McCormick Memorial — friends, family, and whoever else Joe would've dragged onto the course. Track scores, chase the trophies, and keep the stories coming."
};
let eventInfo = {venue:'Downingtown Country Club', date:'Friday, October 9', note:'Dinner to follow at the clubhouse'};
let autoPostSettings = {birdiesOn:true, bogeysOn:true}; // admin toggles for auto-generated feed posts
let botIconUrl = null;      // admin-uploaded avatar image used on all system-generated feed posts
let trophyIconUrl = null;   // admin-uploaded silver trophy image used on the champion-declaration post

/* ---------------------------------------------------------
   PER-HOLE STORAGE
   Each hole (par, description, calibration, photo, everything)
   lives under its own key (hole-config:<number>) instead of one
   shared 18-hole blob. Firestore hard-caps every document at
   1 MiB -- 18 holes' worth of embedded photos blows past that
   easily, and the whole write silently fails. Splitting per-hole
   keeps each document comfortably under that limit on its own.
--------------------------------------------------------- */
async function loadAllHoles(){
  const byNumber = {};
  // one-time migration: pull in the old single-blob format if present
  try{
    const legacy = await window.storage.get('holes-config', true);
    if(legacy && legacy.value){
      const parsed = JSON.parse(legacy.value);
      (parsed||[]).forEach(h=>{ byNumber[h.number] = h; });
    }
  }catch(e){}

  try{
    const listed = await window.storage.listWithValues('hole-config:', true);
    const items = (listed && listed.items) ? listed.items : [];
    items.forEach(({value})=>{
      try{
        if(value){
          const h = JSON.parse(value);
          byNumber[h.number] = h;
        }
      }catch(e){}
    });
  }catch(e){}

  const result = Object.values(byNumber);
  return result.length ? result.sort((a,b)=>a.number-b.number) : defaultHoles();
}

async function saveHole(h){
  await save('hole-config:' + h.number, JSON.stringify(h), true);
}

/* ---------------------------------------------------------
   DEFAULT HOLES (organizer can edit each one)
--------------------------------------------------------- */
function defaultHoles(){
  const d = [
    {number:1,par:4,yards:361,handicap:11,shape:'straight',contestType:null,photo:HOLE_PHOTO_1,
      description:'A friendly handshake of an opener. Straightaway, generous fairway — settle the nerves before the course starts asking real questions.'},
    {number:2,par:4,yards:334,handicap:5,shape:'straight',contestType:null,photo:HOLE_PHOTO_2,
      description:'Bends toward the clubhouse with bunkers guarding the green. Good drive here sets up a short-iron look at birdie.'},
    {number:3,par:3,yards:140,handicap:17,shape:'straight',contestType:'ctp',photo:HOLE_PHOTO_3,
      description:'All carry, no bailout. Joe used to say this was the hole that told you who\'d been practicing and who\'d been making excuses.'},
    {number:4,par:4,yards:289,handicap:15,shape:'straight',contestType:null,photo:HOLE_PHOTO_4,
      description:'Short par 4 that tempts you to be aggressive off the tee — the greenside bunkers punish anyone who gets greedy.'},
    {number:5,par:4,yards:307,handicap:9,shape:'straight',contestType:null,photo:HOLE_PHOTO_5,
      description:'A short, scenic par 4 running along the tree line with the water visible off the tee. Bunkers guard the front and left of the green — favor the right side of the fairway for the cleanest angle in.'},
    {number:6,par:4,yards:328,handicap:1,shape:'straight',contestType:null,photo:HOLE_PHOTO_6,
      description:'The number-one handicap hole for a reason. Water short of the green means committing fully to the yardage, no hedging.'},
    {number:7,par:4,yards:350,handicap:3,shape:'straight',contestType:null,photo:HOLE_PHOTO_7,
      description:'A demanding tee shot into a well-bunkered green complex. Center of the green is always the smart play here.'},
    {number:8,par:5,yards:456,handicap:7,shape:'straight',contestType:'longdrive',photo:HOLE_PHOTO_8,
      description:'The longest hole on the course, and somehow the one with the most stories attached to it. Grip it and rip it.'},
    {number:9,par:4,yards:331,handicap:13,shape:'dogleg-left',contestType:null,photo:HOLE_PHOTO_9,
      description:'Closes the front nine with bunkers pinching the landing area. Keep it in play and take your two putts.'},
    {number:10,par:4,yards:303,handicap:14,shape:'straight',contestType:null,photo:HOLE_PHOTO_10,
      description:'A clean, honest start to the back nine. No tricks — just hit the fairway and take your medicine.'},
    {number:11,par:5,yards:410,handicap:2,shape:'straight',contestType:'longdrive',photo:HOLE_PHOTO_11,
      description:'Big, demanding par 5 — the number-two handicap hole. Three good shots get you home in position to make birdie.'},
    {number:12,par:3,yards:139,handicap:16,shape:'straight',contestType:'ctp',photo:HOLE_PHOTO_12,
      description:'All water, all carry. Joe went in the drink here more than once and still called it his favorite hole on the course.'},
    {number:13,par:4,yards:418,handicap:6,shape:'straight',contestType:null,photo:HOLE_PHOTO_13,
      description:'A tough, well-bunkered two-shotter. Accuracy over distance today.'},
    {number:14,par:4,yards:351,handicap:10,shape:'dogleg-right',contestType:null,photo:HOLE_PHOTO_14,
      description:'Water lurks right of the green. A gentle dogleg where solid, unspectacular golf gets rewarded.'},
    {number:15,par:3,yards:114,handicap:18,shape:'straight',contestType:'ctp',photo:HOLE_PHOTO_15,
      description:'The shortest hole on the card, right along the water. Don\'t let the yardage fool you into getting careless.'},
    {number:16,par:5,yards:495,handicap:4,shape:'dogleg-right',contestType:'longdrive',photo:HOLE_PHOTO_16,
      description:'A big, sweeping par 5 with water in play. The last real chance to pad the scorecard before things get tight.'},
    {number:17,par:3,yards:144,handicap:12,shape:'straight',contestType:'ctp',photo:HOLE_PHOTO_17,
      description:'A demanding par 3 to a well-guarded green. Trust the number and commit to the swing.'},
    {number:18,par:5,yards:501,handicap:8,shape:'straight',contestType:'longdrive',photo:HOLE_PHOTO_18,
      description:'Home hole. Finish the way Joe would\'ve — going for it.'},
  ];
  return d;
}

/* ---------------------------------------------------------
   STORAGE HELPERS
--------------------------------------------------------- */
/* Teams + groups are read together, with a retry. A failed READ is
   tracked separately (teamsLoadFailed) so the app never mistakes
   "couldn't reach the database" for "no teams have been set up". */
let teamsLoadFailed = false;
async function loadTeamsAndGroups(tries=2){
  for(let i=0;i<tries;i++){
    try{
      const [tm, g] = await Promise.all([
        window.storage.get('teams', true),
        window.storage.get('groups', true),
      ]);
      teams = tm ? JSON.parse(tm.value) : [];
      groups = g ? JSON.parse(g.value) : [];
      teamsLoadFailed = false;
      return true;
    }catch(e){
      console.error('teams load failed (attempt '+(i+1)+')', e);
      if(i < tries-1) await new Promise(r=>setTimeout(r, 900));
    }
  }
  teamsLoadFailed = true;
  return false;
}
// Quietly keep trying after a failed load; repaint once it comes back.
let teamsRetryInFlight = false;
async function retryTeamsLoad(tries=1){
  if(!teamsLoadFailed) return true;
  if(teamsRetryInFlight) return false;
  teamsRetryInFlight = true;
  try{
    const ok = await loadTeamsAndGroups(tries);
    if(ok){
      try{ scores = await loadAllScores(false); }catch(e){}
      render();
      if(typeof paintGateTeams === 'function') paintGateTeams();
    }
    return ok;
  }finally{ teamsRetryInFlight = false; }
}
function teamsLoadErrorHtml(){
  return `<div class="empty" style="padding:14px 4px 20px;">Couldn't load the teams. Check your connection.<br><button class="btn secondary small" data-retry-teams type="button" style="margin-top:10px;">Tap to retry</button></div>`;
}
window.addEventListener('online', ()=>retryTeamsLoad(2));
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') retryTeamsLoad(1); });
setInterval(()=>{ if(teamsLoadFailed && document.visibilityState==='visible') retryTeamsLoad(1); }, 15000);
document.addEventListener('click', async (e)=>{
  const b = e.target.closest && e.target.closest('[data-retry-teams]');
  if(!b) return;
  b.disabled = true; b.textContent = 'Loading…';
  const ok = await retryTeamsLoad(2);
  if(!ok){ b.disabled = false; b.textContent = 'Tap to retry'; showToast('Still can\'t reach the database'); }
});

/* Everything that belongs to the year being viewed. Called at startup
   and again whenever the year switcher changes years. */
async function loadYearData(includeLegacy){
  await loadTeamsAndGroups(2);

  scores = await loadAllScores(includeLegacy);

  try{
    const c = await window.storage.get('contests', true);
    contests = c ? JSON.parse(c.value) : {};
  }catch(e){ contests = {}; }

  try{
    const ec = await window.storage.get('extra-contests', true);
    extraContests = (ec && ec.value) ? JSON.parse(ec.value) : null;
  }catch(e){ extraContests = null; }
  if(!extraContests){
    // first time ever loading, or storage isn't available yet (e.g. unpublished
    // preview) -- seed the default Practice Green contest either way so it's
    // never just missing. Past years are read-only, so only seed in memory there.
    extraContests = [{id:'golden-boy', name:'The Golden Boy', location:'Practice Green', winner:'', distance:'', finalized:false}];
    if(!viewingPastYear()){ try{ await save('extra-contests', JSON.stringify(extraContests), true); }catch(e){} }
  }

  try{
    const sl = await window.storage.get('scores-locked', true);
    scoresLocked = sl ? sl.value === 'true' : false;
  }catch(e){ scoresLocked = false; }
  try{
    const cl = await window.storage.get('contests-locked', true);
    contestsLocked = cl ? cl.value === 'true' : false;
  }catch(e){ contestsLocked = false; }

  try{
    const y = await window.storage.get('hero-year', true);
    heroYearText = y ? y.value : `TOURNAMENT · ${TOURNAMENT_YEAR}`;
  }catch(e){}
  try{
    const ei = await window.storage.get('event-info', true);
    // in year mode each year has its own details; don't carry another year's over
    const base = window.storage.yearMode() ? {venue:'', date:'', note:''} : eventInfo;
    eventInfo = (ei && ei.value) ? {...base, ...JSON.parse(ei.value)} : base;
  }catch(e){}
}

async function loadAll(){
  await loadYearData(true);
  holesConfig = await loadAllHoles();

  try{
    const aps = await window.storage.get('auto-post-settings', true);
    autoPostSettings = aps && aps.value ? JSON.parse(aps.value) : {birdiesOn:true, bogeysOn:true};
  }catch(e){ autoPostSettings = {birdiesOn:true, bogeysOn:true}; }

  try{
    const bi = await window.storage.get('bot-icon-url', true);
    botIconUrl = bi ? bi.value : null;
  }catch(e){ botIconUrl = null; }

  try{
    const ti = await window.storage.get('trophy-icon-url', true);
    trophyIconUrl = ti ? ti.value : null;
  }catch(e){ trophyIconUrl = null; }

  lastPostSync = Date.now();
  feedPosts = await loadAllPosts('feed-post:', 'feed-posts');
  tributePosts = await loadAllPosts('tribute-post:', 'tribute-posts');

  try{
    const b = await window.storage.get('memorial-bio', true);
    memorialBio = b ? b.value : defaultBio();
  }catch(e){ memorialBio = defaultBio(); }

  try{
    const p = await window.storage.get('memorial-photo', true);
    memorialPhoto = p ? p.value : null;
  }catch(e){ memorialPhoto = null; }

  try{
    const ch = await window.storage.get('champions', true);
    champions = ch ? JSON.parse(ch.value) : [];
  }catch(e){ champions = []; }

  try{
    const mt = await window.storage.get('memorial-title', true);
    if(mt && mt.value) memorialTitle = mt.value;
  }catch(e){}
  try{
    const ht = await window.storage.get('hero-text', true);
    if(ht && ht.value) heroText = {...heroText, ...JSON.parse(ht.value)};
  }catch(e){}

  try{
    const n = await window.storage.get('my-name', false);
    myName = n ? n.value : null;
  }catch(e){ myName = null; }
  try{
    const r = await window.storage.get('my-role', false);
    myRole = r ? r.value : null;
  }catch(e){ myRole = null; }
  try{
    const t = await window.storage.get('my-team-id', false);
    myTeamId = t ? t.value : null;
  }catch(e){ myTeamId = null; }
  // admin never persists -- always starts locked on a fresh load
  isAdminSession = false;
}

/* ---------------------------------------------------------
   PER-TEAM SCORE STORAGE
   Each team's scores live under their own key (team-score:<id>)
   instead of one shared blob, so two scorekeepers on different
   teams never overwrite each other's saves.
--------------------------------------------------------- */
function scoreKey(tid){ return 'team-score:'+tid; }

async function loadAllScores(includeLegacy){
  const out = {};
  // one-time migration: pull in the old single-blob format if present.
  // Boot only -- no point paying for this read on every refresh.
  if(includeLegacy){
    try{
      const legacy = await window.storage.get('team-scores', true);
      if(legacy && legacy.value){
        Object.assign(out, JSON.parse(legacy.value));
      }
    }catch(e){}
  }
  // per-team docs take precedence over the legacy blob
  try{
    Object.assign(out, await window.storage.scoreList());
  }catch(e){}
  applyPendingScores(out);
  return out;
}

// Whole-scorecard write -- only used by backup restore.
async function saveTeamScore(tid){
  try{
    await window.storage.scoreReplaceAll(tid, scores[tid] || {});
    flagSaveIssue(false);
  }catch(e){
    console.error('save failed', tid, e);
    flagSaveIssue(true);
  }
}

/* ---------------------------------------------------------
   PENDING SCORE QUEUE
   Score taps update the screen instantly and save in the background.
   Anything not yet confirmed by the server is kept in localStorage,
   so a dead zone on the course -- or even closing the app -- never
   loses a score. It retries on reconnect and shows a small badge
   until everything has landed.
--------------------------------------------------------- */
const PENDING_KEY = 'joey-pending-scores';
let pendingScores = {};      // {"tid|hole": val or 0}
let failedScores = {};       // same keys, for ones that errored
try{ pendingScores = JSON.parse(devStore.getItem(PENDING_KEY) || '{}') || {}; }catch(e){ pendingScores = {}; }
function persistPending(){
  try{ devStore.setItem(PENDING_KEY, JSON.stringify(pendingScores)); }catch(e){}
  updateSyncBadge();
}
function applyPendingScores(target){
  Object.entries(pendingScores).forEach(([k,v])=>{
    const [tid, hole] = k.split('|');
    if(!target[tid]) target[tid] = {};
    if(v) target[tid][hole] = v; else delete target[tid][hole];
  });
}
function saveHoleScore(tid, hole){
  if(viewingPastYear()){ showToast(viewingUpcomingYear() ? `${TOURNAMENT_YEAR} hasn't started yet. Scores open once it's the current year.` : `${TOURNAMENT_YEAR} is a previous year. Scores are view-only.`); return; }
  if(scoresLocked){ showToast('Scores are final — ask an admin to unlock'); return; }
  const key = tid + '|' + hole;
  const val = (scores[tid] && scores[tid][hole]) || 0;
  pendingScores[key] = val;
  delete failedScores[key];
  persistPending();
  window.storage.scoreSetHole(tid, hole, val).then(()=>{
    if(pendingScores[key] === val){ delete pendingScores[key]; persistPending(); }
  }).catch(err=>{
    console.error('hole save failed', key, err);
    failedScores[key] = true;
    updateSyncBadge();
  });
}
function retryPendingScores(){
  Object.keys(pendingScores).forEach(k=>{
    const [tid, hole] = k.split('|');
    saveHoleScore(tid, hole);
  });
}
function updateSyncBadge(){
  const el = document.getElementById('syncBadge');
  if(!el) return;
  const n = Object.keys(pendingScores).length;
  const failed = Object.keys(failedScores).length;
  if(!n){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.classList.toggle('err', failed > 0);
  el.textContent = failed
    ? `⚠ ${n} score${n>1?'s':''} not saved — tap to retry`
    : `⏳ Syncing ${n} score${n>1?'s':''}…`;
}
window.addEventListener('online', retryPendingScores);
setInterval(()=>{ if(Object.keys(pendingScores).length) retryPendingScores(); }, 30000);

async function deleteTeamScore(tid){
  try{ await window.storage.delete(scoreKey(tid), true); }catch(e){}
}

/* ---------------------------------------------------------
   PER-POST STORAGE (Feed + Tribute Wall)
   Each post lives under its own key (feed-post:<id> or
   tribute-post:<id>) instead of one shared array, so two people
   posting, liking, or replying at the same moment never
   overwrite each other's save with a stale copy of the list.
--------------------------------------------------------- */
async function loadAllPosts(prefix, legacyKey){
  const byId = {};
  // one-time migration: pull in the old single-blob format if present
  try{
    const legacy = await window.storage.get(legacyKey, true);
    if(legacy && legacy.value){
      const parsed = JSON.parse(legacy.value);
      (parsed||[]).forEach(p=>{ byId[p.id] = p; });
    }
  }catch(e){}

  try{
    const docs = await window.storage.listRaw(prefix);
    docs.forEach(({key, data})=>{
      const id = key.slice(prefix.length);
      const post = postFromDoc(data, byId[id]);
      if(post) byId[id] = post; else delete byId[id];
      // One-time upgrade of older posts to the field-level format
      if(post && post._schema !== 2) migratePost(post, prefix);
    });
  }catch(e){}

  return Object.values(byId).sort((a,b)=>a.time-b.time);
}

/* ---------------------------------------------------------
   POST FORMAT
   The post body lives in `value` (as before). Comments and likes are
   separate map fields -- comments.<commentId>, likedBy.<deviceId> -- so
   likes, replies, edits and deletes each touch only their own entry and
   can't overwrite anyone else's with a stale copy of the post.
--------------------------------------------------------- */
const DEVICE_ID = (()=>{
  try{
    let id = devStore.getItem('joey-device-id');
    if(!id){ id = uid(); devStore.setItem('joey-device-id', id); }
    return id;
  }catch(e){ return uid(); }
})();
// Returns a post object in the shape the renderer expects, or null if deleted.
function postFromDoc(data, base){
  if(!data || data.deleted) return null;
  let post = base ? {...base} : null;
  if(typeof data.value === 'string'){
    try{ post = {...JSON.parse(data.value)}; }catch(e){}
  }
  if(!post) return null;
  const legacyComments = Array.isArray(post.comments) ? post.comments : [];
  const mapComments = data.comments ? Object.entries(data.comments).map(([id,c])=>({...c, id})) : [];
  if(data.schema === 2){
    post.comments = mapComments;
    post.legacyLikes = data.legacyLikes || 0;
  } else {
    // not upgraded yet: show old comments plus any new-format ones
    const seen = new Set(mapComments.map(c=>c.id));
    post.comments = legacyComments.filter(c=>!seen.has(c.id)).concat(mapComments);
    post.legacyLikes = post.likes || 0;
  }
  post.comments.sort((a,b)=>(a.time||0)-(b.time||0));
  post.likedBy = data.likedBy || {};
  post._schema = data.schema === 2 ? 2 : 1;
  refreshLikeFields(post);
  return post;
}
function refreshLikeFields(post){
  post.likedBy = post.likedBy || {};
  post.likes = (post.legacyLikes || 0) + Object.keys(post.likedBy).length;
  post.likedByMe = !!post.likedBy[DEVICE_ID];
}
function postBody(post){
  const {comments, likes, likedByMe, likedBy, legacyLikes, _schema, ...body} = post;
  return JSON.stringify(body);
}
function commentsMap(post){
  const m = {};
  (post.comments||[]).forEach(c=>{ const {id, ...rest} = c; m[id] = rest; });
  return m;
}
function migratePost(post, prefix){
  window.storage.mergeDoc(prefix + post.id, {
    schema: 2, comments: commentsMap(post), legacyLikes: post.legacyLikes || 0
  }).then(()=>{ post._schema = 2; }).catch(e=>console.error('post migrate failed', post.id, e));
}
// New posts, text edits, and restores. `full` also writes comments/likes (restore only).
async function savePost(post, prefix, full){
  const fields = {value: postBody(post), schema: 2};
  if(full || post._schema !== 2){
    fields.comments = commentsMap(post);
    fields.legacyLikes = post.legacyLikes || 0;
    if(full){ fields.likedBy = post.likedBy || {}; refreshLikeFields(post); }
  }
  try{
    await window.storage.mergeDoc(prefix + post.id, fields);
    post._schema = 2;
    flagSaveIssue(false);
  }catch(e){
    console.error('post save failed', post.id, e);
    flagSaveIssue(true);
  }
}
async function saveComment(post, prefix, comment){
  const {id, ...rest} = comment;
  try{ await window.storage.mergeDoc(prefix + post.id, {comments: {[id]: rest}}); flagSaveIssue(false); }
  catch(e){ console.error('comment save failed', e); flagSaveIssue(true); }
}
async function removeComment(post, prefix, commentId){
  try{ await window.storage.mergeDoc(prefix + post.id, {comments: {[commentId]: window.storage.del()}}); flagSaveIssue(false); }
  catch(e){ console.error('comment delete failed', e); flagSaveIssue(true); }
}
async function saveLike(post, prefix){
  try{
    await window.storage.mergeDoc(prefix + post.id,
      {likedBy: {[DEVICE_ID]: post.likedByMe ? true : window.storage.del()}});
  }catch(e){ console.error('like save failed', e); }
}
// Soft delete, so other phones' "what changed" refresh can see it's gone.
async function deletePost(id, prefix){
  try{ await window.storage.mergeDoc(prefix + id, {deleted: true}); }catch(e){}
}

/* ---------------------------------------------------------
   WHO'S USING THE APP (admin)
   Each phone keeps ONE record, overwritten on every check-in, so
   only the most recent visit is stored -- no history. Check-ins
   happen on open, on returning to the app, and whenever the
   name/role/team changes, at most once per 10 minutes otherwise.
   The admin list ignores anything older than the "tracking since"
   baseline, which resets on "Clear list" and on Start fresh.
--------------------------------------------------------- */
const PRESENCE_LOCAL_KEY = 'joey-presence-last';
function presenceSignature(){
  return [myName||'', myRole||'', myTeamId||'', isAdminSession?'admin':''].join('|');
}
function pingPresence(){
  if(!window.__storageReady || !window.storage || !window.storage.presencePing) return;
  if(!myRole && !myName && !isAdminSession) return;   // not signed in yet
  const sig = presenceSignature();
  let last = {};
  try{ last = JSON.parse(devStore.getItem(PRESENCE_LOCAL_KEY) || '{}') || {}; }catch(e){}
  if(last.sig === sig && Date.now() - (last.t||0) < 10*60*1000) return;
  const ua = navigator.userAgent || '';
  const device = (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) ? 'iPhone'
    : /Android/.test(ua) ? 'Android' : 'Computer';
  const standalone = !!(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);
  const now = Date.now();
  window.storage.presencePing(DEVICE_ID, {
    name: myName || '', role: myRole || '', teamId: myTeamId || '',
    admin: !!isAdminSession, device, standalone, lastSeen: now
  }).then(()=>{
    try{ devStore.setItem(PRESENCE_LOCAL_KEY, JSON.stringify({sig, t: now})); }catch(e){}
  }).catch(e=>console.error('presence ping failed', e));
}
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible') pingPresence();
});

function normName(n){ return (n||'').toLowerCase().replace(/[^a-z]/g,''); }
function lastName(n){ const parts=(n||'').trim().split(/\s+/); return normName(parts[parts.length-1]); }

async function openPresenceSheet(){
  if(!isAdminSession) return;
  closePresenceSheet();
  const wrap = document.createElement('div');
  wrap.className = 'get-app-sheet'; wrap.id = 'presenceSheet';
  wrap.innerHTML = `<div class="get-app-panel presence-panel" role="dialog" aria-label="Who's using the app">
    <h3>Who's using the app</h3><p class="get-app-sub">Loading…</p></div>`;
  wrap.addEventListener('click', (e)=>{ if(e.target===wrap) closePresenceSheet(); });
  document.body.appendChild(wrap);
  try{
    const [baseDoc, rows] = await Promise.all([
      window.storage.get('presence-since', true).catch(()=>null),
      window.storage.presenceList(),
    ]);
    const since = baseDoc ? parseInt(baseDoc.value,10) || 0 : 0;
    renderPresenceSheet(rows.filter(r=>(r.lastSeen||0) > since), since);
  }catch(e){
    console.error('presence load failed', e);
    wrap.querySelector('.get-app-sub').textContent = "Couldn't load the list — check your connection and try again.";
  }
}
function closePresenceSheet(){ const el=document.getElementById('presenceSheet'); if(el) el.remove(); }
function renderPresenceSheet(rows, since){
  const wrap = document.getElementById('presenceSheet'); if(!wrap) return;
  // group a person's devices (e.g. iPhone browser + home-screen app) by name
  const people = {};
  rows.forEach(r=>{
    const key = normName(r.name) || ('unnamed-'+r.deviceId);
    const p = people[key] || (people[key] = {name: r.name || 'Unnamed guest', devices: [], lastSeen: 0, latest: r});
    p.devices.push(r);
    if((r.lastSeen||0) > p.lastSeen){ p.lastSeen = r.lastSeen; p.latest = r; }
  });
  const list = Object.values(people).sort((a,b)=>b.lastSeen - a.lastSeen);
  const roleLabel = (r)=>{
    const t = teams.find(t=>t.id===r.teamId);
    if(r.role==='player') return 'Player' + (t ? ` · Team ${escapeHtml(t.label)}` : '');
    return r.role==='guest' ? 'Guest' : '—';
  };
  const devLabel = (p)=>{
    const kinds = p.devices.map(d=>(d.device==='iPhone'?'📱 iPhone':d.device==='Android'?'📱 Android':'💻 Computer')+(d.standalone?' (app)':''));
    return [...new Set(kinds)].join(', ');
  };
  const rowsHtml = list.length ? list.map(p=>`
    <div class="presence-row">
      <div class="presence-main">
        <div class="presence-name">${escapeHtml(p.name)}${p.latest.admin?' <span class="presence-tag">Admin</span>':''}</div>
        <div class="presence-meta">${roleLabel(p.latest)} · ${devLabel(p)}</div>
      </div>
      <div class="presence-time" title="${new Date(p.lastSeen).toLocaleString()}">${timeAgo(p.lastSeen)}</div>
    </div>`).join('') : `<div class="empty" style="padding:10px 0;">No one yet since tracking started.</div>`;

  // Players on a team who haven't opened the app: match by name, or by
  // last name among check-ins from that team.
  const seenNames = new Set(rows.map(r=>normName(r.name)));
  const notSeen = [];
  teams.forEach(t=>(t.players||[]).forEach(pl=>{
    if(seenNames.has(normName(pl))) return;
    const byTeam = rows.some(r=>r.role==='player' && r.teamId===t.id && lastName(r.name)===lastName(pl));
    if(!byTeam) notSeen.push(`${pl} <span class="presence-meta">(Team ${escapeHtml(t.label)})</span>`);
  }));
  const players = rows.filter(r=>r.role==='player').length, guests = rows.filter(r=>r.role==='guest').length;
  wrap.querySelector('.presence-panel').innerHTML = `
    <h3>Who's using the app</h3>
    <p class="get-app-sub">${list.length} ${list.length===1?'person':'people'} · ${players} player device${players===1?'':'s'}, ${guests} guest device${guests===1?'':'s'}<br>
      Tracking since ${since ? new Date(since).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}) : 'this update went live'}</p>
    <div class="presence-list">${rowsHtml}</div>
    ${notSeen.length ? `<div class="presence-notseen"><b>Not seen yet (${notSeen.length})</b><div>${notSeen.join('<br>')}</div></div>` : (teams.length ? `<div class="presence-notseen"><b>✓ Every rostered player has checked in</b></div>` : '')}
    <div class="presence-actions">
      <button class="btn secondary small" id="presenceRefresh">↻ Refresh</button>
      <button class="btn secondary small" id="presenceClear">Clear list</button>
      <button class="btn small" id="presenceClose">Done</button>
    </div>`;
  document.getElementById('presenceRefresh').onclick = openPresenceSheet;
  document.getElementById('presenceClose').onclick = closePresenceSheet;
  document.getElementById('presenceClear').onclick = async ()=>{
    if(!confirm("Clear the list? Only check-ins from now on will show. Phones reappear the next time they're opened.")) return;
    await save('presence-since', String(Date.now()), true);
    openPresenceSheet();
  };
}

/* ---------------------------------------------------------
   START FRESH (admin) -- clear pilot/test data before the event
--------------------------------------------------------- */
async function startFresh(){
  if(!isAdminSession) return;
  if(!confirm(`Start fresh for The Joey ${TOURNAMENT_YEAR}?\n\nClears: all scores, feed posts, contest winners, and any ${TOURNAMENT_YEAR} champion.\nKeeps: teams, groups, holes, Tribute Wall, Joe's page, past champions.\n\nA backup will download first.`)) return;
  try{ exportBackup(); }catch(e){
    if(!confirm("The backup didn't download. Continue anyway?")) return;
  }
  showToast('Clearing…');
  try{
    const [scoreDocs, postDocs] = await Promise.all([
      window.storage.listRaw('team-score:'),
      window.storage.listRaw('feed-post:'),
    ]);
    // clear this phone's unsent score queue so it can't replay old scores
    pendingScores = {}; failedScores = {}; persistPending();
    scores = {};
    feedPosts = [];
    contests = {};
    extraContests = (extraContests||[]).map(ec=>({...ec, winner:'', distance:'', finalized:false}));
    champions = champions.filter(c=>Number(c.year) !== TOURNAMENT_YEAR);
    scoresLocked = false;
    await Promise.all([
      ...scoreDocs.map(d=>window.storage.delete(d.key, true).catch(()=>{})),
      // soft-delete so other phones' feed refresh sees the posts are gone
      ...postDocs.map(d=>window.storage.mergeDoc(d.key, {deleted:true}).catch(()=>{})),
      // old single-blob formats, so nothing gets re-imported on load
      window.storage.delete('team-scores', true).catch(()=>{}),
      window.storage.delete('feed-posts', true).catch(()=>{}),
      save('contests', JSON.stringify(contests), true),
      save('extra-contests', JSON.stringify(extraContests), true),
      save('champions', JSON.stringify(champions), true),
      save('scores-locked', 'false', true),
      save('presence-since', String(Date.now()), true),
    ]);
    render();
    showToast('All set — fresh start');
  }catch(e){
    console.error('start fresh failed', e);
    alert('Something went wrong partway through. Your backup has everything — check your connection and try again.');
  }
}

/* ---------------------------------------------------------
   FEED REFRESH -- on opening Feed/Joe, or waking the phone there.
   Only fetches docs changed since the last check. The 5-minute
   overlap covers phones whose clocks are slightly off.
--------------------------------------------------------- */
let lastPostSync = Date.now();
let postSyncInFlight = false;
async function refreshPosts(){
  if(postSyncInFlight) return;
  postSyncInFlight = true;
  const startedAt = Date.now();
  try{
    const changed = await window.storage.changedSince(lastPostSync - 5*60*1000);
    let touched = false;
    changed.forEach(({key, data})=>{
      const prefix = key.startsWith('feed-post:') ? 'feed-post:' : key.startsWith('tribute-post:') ? 'tribute-post:' : null;
      if(!prefix) return;
      const id = key.slice(prefix.length);
      const list = prefix === 'feed-post:' ? feedPosts : tributePosts;
      const idx = list.findIndex(p=>p.id===id);
      const post = postFromDoc(data, idx>=0 ? list[idx] : null);
      if(post){ if(idx>=0) list[idx] = post; else list.push(post); }
      else if(idx>=0){ list.splice(idx, 1); }
      touched = true;
    });
    feedPosts.sort((a,b)=>a.time-b.time);
    tributePosts.sort((a,b)=>a.time-b.time);
    lastPostSync = startedAt;
    if(touched) feedRender();
  }catch(e){
    console.error('post refresh failed', e);
  }finally{
    postSyncInFlight = false;
  }
}
// Re-render the feed with fresh posts, but never under someone typing.
function feedRender(){
  if(!['feed','joe'].includes(currentTab)) return;
  const a = document.activeElement;
  if(a && (a.tagName==='INPUT' || a.tagName==='TEXTAREA')){
    a.addEventListener('blur', ()=>setTimeout(feedRender, 50), {once:true});
    return;
  }
  const y = window.scrollY;
  render();
  requestAnimationFrame(()=>window.scrollTo(0, y));
}

function defaultBio(){
  return "Joe McCormick loved three things without reservation: his people, a good story told twice as long as it needed to be, and golf played just seriously enough to matter. This tournament started as a way to get everyone back together, and it's stayed that way — equal parts competition and reunion.\n\nEdit this page to add your own memories, photos, and the story behind the trophy.";
}

async function save(key, value, shared=true){
  // Never write teams/groups on top of a list we failed to read --
  // that would replace the real pairings with a partial one.
  if(shared && (key==='teams' || key==='groups') && teamsLoadFailed){
    showToast("Teams haven't loaded yet. Reconnect and try again.");
    return false;
  }
  try{
    const res = await window.storage.set(key, value, shared);
    if(!res){
      flagSaveIssue(true);
      return false;
    }
    flagSaveIssue(false);
    return true;
  }catch(e){
    console.error('save failed', key, e);
    flagSaveIssue(true);
    return false;
  }
}
function flagSaveIssue(failed){
  const el = document.getElementById('saveIndicator');
  if(!el) return;
  if(failed){
    el.textContent = "Last change may not have saved — download a backup and check your connection.";
    el.classList.add('err');
  } else {
    el.textContent = "All changes saved.";
    el.classList.remove('err');
  }
}

function showToast(msg, ms=1600){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>t.classList.remove('show'), ms);
}

/* ---------------------------------------------------------
   IDENTITY GATE
   Player (picks their team) / Guest (name only) / Admin (password,
   session-only -- never persisted, must be re-entered each app load).
--------------------------------------------------------- */
const ADMIN_PASSWORD = 'joey';

function checkNameGate(){
  if(myName && myRole){
    showWelcomeBackToast();
    return;
  }
  document.getElementById('nameGate').style.display = 'flex';
  gateShowStep('gateStep1');
}

function showWelcomeBackToast(){
  const toast = document.getElementById('welcomeBackToast');
  if(!toast) return;
  toast.textContent = `Welcome back, ${myName}`;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  setTimeout(()=>{
    toast.style.transition = 'opacity 400ms ease';
    toast.style.opacity = '0';
    setTimeout(()=>{ toast.style.display='none'; toast.style.transition=''; }, 420);
  }, 3000);
}

function gateShowStep(id){
  ['gateStep1','gateStep2Team','gateStep2Name','gateStepAdmin'].forEach(s=>{
    document.getElementById(s).style.display = (s===id) ? (s==='gateStep2Team' ? 'flex' : 'block') : 'none';
  });
  // the team list gets more of the screen
  document.getElementById('nameGate').classList.toggle('gate-team-mode', id==='gateStep2Team');
}

let feedPosting = false, tributePosting = false;  // post upload in progress
let paintGateTeams = null;   // set in wireIdentityGate
let gatePendingRole = null; // 'player' | 'guest' | 'admin-name' while mid-flow

function wireIdentityGate(){
  const playerBtn = document.getElementById('gatePlayerBtn');
  const guestBtn = document.getElementById('gateGuestBtn');
  const adminLink = document.getElementById('gateAdminLink');
  paintGateTeams = ()=>{
    const list = document.getElementById('gateTeamList');
    if(!list) return;
    list.innerHTML = teams.map(t=>`
      <button class="gate-team-btn" data-gate-team="${t.id}" type="button">
        <span class="gate-team-badge">${escapeHtml(t.label)}</span>
        <span class="gate-team-names">${(t.players||[]).length ? (t.players||[]).map(n=>`<span>${escapeHtml(n)}</span>`).join('') : '<span>No players listed</span>'}</span>
      </button>`).join('') || (teamsLoadFailed
        ? `<p style="font-size:13px;color:var(--ink-soft);">Couldn't load the teams. Check your connection.</p><button class="btn secondary small" id="gateTeamRetry" type="button">Tap to retry</button>`
        : `<p style="font-size:13px;color:var(--ink-soft);">No teams have been set up yet.</p>`);
    const retry = document.getElementById('gateTeamRetry');
    if(retry) retry.onclick = async ()=>{
      list.innerHTML = `<p style="font-size:13px;color:var(--ink-soft);">Loading teams…</p>`;
      await loadTeamsAndGroups(2);
      paintGateTeams();
      if(!teamsLoadFailed) render();
    };
    // show the "more below" hint only when the list actually overflows
    const hint = document.getElementById('gateTeamScrollHint');
    const wrap = list.parentElement, thumb = document.getElementById('gateTeamRailThumb');
    const updHint = ()=>{
      const over = list.scrollHeight - list.clientHeight > 4;
      wrap.classList.toggle('overflows', over);
      if(hint) hint.classList.toggle('show', over && list.scrollHeight - list.clientHeight - list.scrollTop > 4);
      if(over && thumb){
        const h = Math.max(24, list.clientHeight * list.clientHeight / list.scrollHeight);
        const maxTop = list.clientHeight - h;
        thumb.style.height = h + 'px';
        thumb.style.top = (maxTop * list.scrollTop / (list.scrollHeight - list.clientHeight)) + 'px';
      }
    };
    window.addEventListener('resize', updHint);
    list.onscroll = updHint;
    requestAnimationFrame(()=>requestAnimationFrame(updHint));
    list.querySelectorAll('[data-gate-team]').forEach(btn=>{
      btn.onclick = ()=>{
        myTeamId = btn.dataset.gateTeam;
        gatePendingRole = 'player';
        document.getElementById('gateNameSubtext').textContent = "This is how you'll show up in posts, comments, and on the scorecard.";
        gateShowStep('gateStep2Name');
        document.getElementById('nameGateInput').focus();
      };
    });
  };
  if(playerBtn) playerBtn.onclick = async ()=>{
    gateShowStep('gateStep2Team');
    if(!teams.length){
      // empty list: ask the database again before saying there are none
      const list = document.getElementById('gateTeamList');
      list.innerHTML = `<p style="font-size:13px;color:var(--ink-soft);">Loading teams…</p>`;
      const ok = await loadTeamsAndGroups(2);
      if(ok && teams.length) render();
    }
    paintGateTeams();
  };
  if(guestBtn) guestBtn.onclick = ()=>{
    myTeamId = null;
    gatePendingRole = 'guest';
    document.getElementById('gateNameSubtext').textContent = "This is how you'll show up in posts and comments. You'll be able to view scores but not enter them.";
    gateShowStep('gateStep2Name');
    document.getElementById('nameGateInput').focus();
  };
  if(adminLink) adminLink.onclick = (e)=>{
    e.preventDefault();
    document.getElementById('gateAdminPassInput').value = '';
    document.getElementById('gateAdminError').style.display = 'none';
    gateShowStep('gateStepAdmin');
  };
  const backFromTeam = document.getElementById('gateBackFromTeam');
  if(backFromTeam) backFromTeam.onclick = ()=>gateShowStep('gateStep1');
  const backFromName = document.getElementById('gateBackFromName');
  if(backFromName) backFromName.onclick = ()=>gateShowStep(gatePendingRole==='player' ? 'gateStep2Team' : 'gateStep1');
  const backFromAdmin = document.getElementById('gateBackFromAdmin');
  if(backFromAdmin) backFromAdmin.onclick = ()=>gateShowStep('gateStep1');

  const nameContinueBtn = document.getElementById('gateNameContinueBtn');
  if(nameContinueBtn) nameContinueBtn.onclick = setMyName;

  const adminSubmitBtn = document.getElementById('gateAdminSubmitBtn');
  if(adminSubmitBtn) adminSubmitBtn.onclick = ()=>{
    const pass = document.getElementById('gateAdminPassInput').value.trim().toLowerCase();
    if(pass !== ADMIN_PASSWORD){
      document.getElementById('gateAdminError').style.display = 'block';
      return;
    }
    isAdminSession = true;
    updateAdminUI();
    if(myName && myRole){
      // already have an identity on this device -- just unlock admin editing, no need to re-enter name
      document.getElementById('nameGate').style.display = 'none';
      showToast('Admin unlocked for this session');
      render();
    } else {
      myTeamId = null;
      gatePendingRole = 'admin-name';
      document.getElementById('gateNameSubtext').textContent = "This is how you'll show up in posts and comments.";
      gateShowStep('gateStep2Name');
      document.getElementById('nameGateInput').focus();
    }
  };
}

async function setMyName(){
  const v = document.getElementById('nameGateInput').value.trim();
  if(!v) return;
  myName = v;
  myRole = (gatePendingRole==='player') ? 'player' : 'guest'; // admin unlock still saves as guest identity
  await save('my-name', v, false);
  await save('my-role', myRole, false);
  if(myRole==='player' && myTeamId){
    await save('my-team-id', myTeamId, false);
  }
  document.getElementById('nameGate').style.display = 'none';
  updateAdminUI();
  render();
}

function resetIdentity(){
  myName = null; myRole = null; myTeamId = null; isAdminSession = false;
  document.getElementById('nameGate').style.display = 'flex';
  gateShowStep('gateStep1');
  updateAdminUI();
}

function updateAdminUI(){
  try{ pingPresence(); }catch(e){}
  // Backup & Restore lives outside the normal render() cycle, so it needs
  // its own show/hide toggle whenever admin status changes
  const backupBtn = document.getElementById('backupToggle');
  if(backupBtn) backupBtn.style.display = isAdminSession ? '' : 'none';

  // Guests don't get a Scorecard tab at all -- they land on Leaderboard instead
  const scorecardTabBtn = document.querySelector('.tabbar [data-tab="scorecard"]');
  if(scorecardTabBtn) scorecardTabBtn.style.display = (myRole==='guest' && !isAdminSession) ? 'none' : '';
}

/* ---------------------------------------------------------
   SCORE HELPERS
--------------------------------------------------------- */
// Groups can start on any hole (e.g. #1 or #3). Play order wraps around:
// a #3 start plays 3..18, then 1, 2.
function teamStartHole(team){
  const g = team && groups.find(g=>g.id===team.groupId);
  const n = g ? parseInt(g.startHole,10) : NaN;
  return holesConfig.some(h=>h.number===n) ? n : holesConfig[0].number;
}
function playOrder(team){
  const i = holesConfig.findIndex(h=>h.number===teamStartHole(team));
  return i > 0 ? holesConfig.slice(i).concat(holesConfig.slice(0,i)) : holesConfig.slice();
}
function teamTotals(teamId){
  const s = scores[teamId] || {};
  let strokes = 0, par = 0, thru = 0;
  holesConfig.forEach(h=>{
    const val = s[h.number];
    if(val){ strokes += val; par += h.par; thru++; }
  });
  return {strokes, par, thru, diff: strokes-par};
}
function nextTeamLabel(){
  const used = new Set(teams.map(t=>t.label));
  for(let i=0;i<26;i++){
    const letter = String.fromCharCode(65+i);
    if(!used.has(letter)) return letter;
  }
  return 'Team ' + (teams.length+1);
}
function groupName(groupId){
  const g = groups.find(g=>g.id===groupId);
  return g ? g.label : null;
}
function teamsInGroup(groupId){
  return teams.filter(t=>t.groupId===groupId);
}
function unassignedTeams(){
  return teams.filter(t=>!t.groupId || !groups.find(g=>g.id===t.groupId));
}
function scoreClass(score, par){
  if(!score) return '';
  const d = score - par;
  if(d <= -2) return 'eagle';
  if(d === -1) return 'birdie';
  if(d === 1) return 'bogey';
  if(d >= 2) return 'dbogey';
  return '';
}
// Proper golf terminology for the Quick Score Entry labels.
// Snowman (score of 8) always wins regardless of par, since that's a
// literal-strokes nickname, not a relative-to-par one.
function quickScoreLabel(score, par){
  if(score===8) return 'Snowman';
  if(score===1) return 'Hole in One';
  const d = score - par;
  if(d <= -3) return 'Albatross';
  if(d === -2) return 'Eagle';
  if(d === -1) return 'Birdie';
  if(d === 0) return 'Par';
  if(d === 1) return 'Bogey';
  return `+${d}`;
}
function fmtDiff(d, thru){
  if(thru===0) return '—';
  if(d===0) return 'E';
  return d>0 ? '+'+d : String(d);
}
function initials(name){
  return name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
}
// "John Smith" -> "J. Smith". Single-word names pass through unchanged.
function initialLastName(fullName){
  const parts = (fullName||'').trim().split(/\s+/);
  if(parts.length < 2) return fullName || '';
  return parts[0][0].toUpperCase() + '. ' + parts.slice(1).join(' ');
}
// Used in auto-generated feed posts instead of "Team G" -- e.g. "J. Smith & M. Jones"
function formatTeamName(team){
  const players = (team && team.players) || [];
  if(!players.length) return team ? `Team ${team.label}` : 'A team';
  return players.map(initialLastName).join(' & ');
}

/* ---------------------------------------------------------
   AUTO FEED POSTS — leaderboard standings + score tiers
--------------------------------------------------------- */
// Sorted standings for teams that have started (thru>0), best score-to-par first.
function computeStandings(){
  return teams
    .map(t=>({team:t, tot:teamTotals(t.id)}))
    .filter(r=>r.tot.thru>0)
    .sort((a,b)=>a.tot.diff-b.tot.diff);
}
// 1-based rank (ties share a rank) for a team within a standings snapshot, or null if not yet started.
function teamRankInfo(teamId, standings){
  const row = standings.find(r=>r.team.id===teamId);
  if(!row) return null;
  const diff = row.tot.diff;
  const rank = standings.filter(r=>r.tot.diff < diff).length + 1;
  const tiedCount = standings.filter(r=>r.tot.diff === diff).length;
  return {rank, tied: tiedCount > 1};
}
// Word form used in auto-post copy (quickScoreLabel is for the score-entry UI and
// doesn't distinguish double/triple bogey, which the feed copy needs).
function scoreWordLabel(val, par){
  if(val===8) return 'snowman';
  if(val===1) return 'hole-in-one';
  const d = val - par;
  if(d<=-3) return 'albatross';
  if(d===-2) return 'eagle';
  if(d===-1) return 'birdie';
  if(d===0) return 'par';
  if(d===1) return 'bogey';
  if(d===2) return 'double bogey';
  if(d===3) return 'triple bogey';
  return `${d}-over`;
}
// Classifies a just-saved score into a postable tier. Eagle/ace and triple-bogey-or-worse
// are always-on; birdie and bogey/double bogey are admin-toggleable via autoPostSettings.
function scoreEventHeadline(val, par){
  const d = val - par;
  const label = scoreWordLabel(val, par);
  if(val===1 || d<=-2) return {tier:'good', label};
  if(d===-1) return autoPostSettings.birdiesOn ? {tier:'good', label} : null;
  if(val===8 || d>=3) return {tier:'bad', label};
  if(d===1 || d===2) return autoPostSettings.bogeysOn ? {tier:'bad', label} : null;
  return null; // par -- no score-quality post
}
// Compares a team's leaderboard rank before/after a score save and returns a short
// consequence clause to append to the post, or null if nothing notable happened.
function leaderboardConsequence(teamId, standingsBefore, standingsAfter){
  const before = teamRankInfo(teamId, standingsBefore);
  const after = teamRankInfo(teamId, standingsAfter);
  if(!after) return null;
  if(after.rank===1 && (!before || before.rank!==1)){
    return after.tied ? "now tied for the lead!" : "take the lead!";
  }
  if(before && before.rank===1 && after.rank!==1){
    return "fall out of the lead.";
  }
  if(before && (before.rank - after.rank) >= 3){
    return `climb to ${ordinal(after.rank)}!`;
  }
  if(before && (after.rank - before.rank) >= 3){
    return `slide to ${ordinal(after.rank)}.`;
  }
  return null;
}
function ordinal(n){
  const s = ['th','st','nd','rd'], v = n%100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
// Central hook: call right after a team's hole score is committed (saved + not undone).
// standingsBefore must be captured BEFORE the score mutation was applied.
async function maybePostScoreEvent(teamId, holeNumber, val, standingsBefore){
  const h = holesConfig.find(hh=>hh.number===holeNumber);
  if(!h || !val) return;
  const team = teams.find(t=>t.id===teamId);
  const teamName = formatTeamName(team);
  const headline = scoreEventHeadline(val, h.par);
  const standingsAfter = computeStandings();
  const consequence = leaderboardConsequence(teamId, standingsBefore, standingsAfter);
  if(!headline && !consequence) return;

  const article = /^[aeiou]/i.test(headline ? headline.label : '') ? 'an' : 'a';
  let text;
  if(headline && consequence){
    text = (headline.tier==='good')
      ? `${cap(headline.label)} on Hole ${holeNumber}! ${teamName} ${consequence}`
      : `${teamName} take ${article} ${headline.label} on Hole ${holeNumber} and ${consequence.replace(/!$/,'.')}`;
  } else if(headline){
    text = (headline.tier==='good')
      ? `${teamName} card ${article} ${headline.label} on Hole ${holeNumber}!`
      : `${teamName} take ${article} ${headline.label} on Hole ${holeNumber}.`;
  } else {
    text = `${teamName} ${consequence}`;
  }
  await addSystemPost(text);
}
// Leader/winner flavor copy for side contests. Matches by contest name so it works
// whether the contest is a built-in default or one an admin added manually in prod.
function contestFlavorLine(contestLabel, kind, name, extra){
  const n = (contestLabel||'').toLowerCase();
  extra = extra || {};
  if(n.includes('baffler')){
    return kind==='leader'
      ? `Prepare to be baffled by ${name}, the current leader of The Baffler!`
      : `The votes are in — ${name} has officially baffled the field to win The Baffler at The ${TOURNAMENT_YEAR} Joey!`;
  }
  if(n.includes('golden boy')){
    return kind==='leader'
      ? `${name} strikes gold on the practice green — the new leader of The Golden Boy putting contest!`
      : `${name} is golden! Crowned champion of The Golden Boy putting contest at The ${TOURNAMENT_YEAR} Joey!`;
  }
  if(n.includes('closest to the pin')){
    return kind==='leader'
      ? `${name} is now closest to the pin on Hole ${extra.holeNumber}${extra.distance ? ` at ${extra.distance}` : ''}.`
      : `${name} wins Closest to the Pin at The ${TOURNAMENT_YEAR} Joey!`;
  }
  if(n.includes('longest drive')){
    return kind==='leader'
      ? `${name} now has the longest drive on Hole ${extra.holeNumber}${extra.distance ? ` at ${extra.distance}` : ''}.`
      : `${name} wins Longest Drive at The ${TOURNAMENT_YEAR} Joey!`;
  }
  return kind==='leader'
    ? `${name} is now the leader of ${contestLabel}!`
    : `${name} wins ${contestLabel} at The ${TOURNAMENT_YEAR} Joey!`;
}
// Creates a bot-authored feed post, visually distinct from human posts.
async function addSystemPost(text, opts){
  opts = opts || {};
  const post = {id:uid(), name:'The Joey', text, img:opts.img||null, video:null, tags:[], time:Date.now(), likes:0, likedByMe:false, comments:[], system:true};
  feedPosts.push(post);
  await savePost(post, 'feed-post:');
  if(currentTab==='feed') render();
}
// Splits a team's player names across two lines: 2 names -> one per
// line, 3 names -> two on the first line, one on the second.
// Flag-with-magnifying-glass icon used on every "preview this hole" button.
// Uses currentColor so it automatically matches whatever button it's in.
const HOLE_PREVIEW_ICON_SVG = `<svg viewBox="0 0 32 32" width="1em" height="1em" style="display:block;">
  <line x1="7" y1="29" x2="7" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M7 3 L16 6.5 L7 10 Z" fill="currentColor"/>
  <circle cx="21" cy="21" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/>
  <line x1="25.6" y1="25.6" x2="29.5" y2="29.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

function playerNameLines(players){
  const list = players || [];
  if(list.length <= 3) return list.map(n=>`<div>${escapeHtml(n)}</div>`).join('') || '<div></div>';
  const firstCount = Math.ceil(list.length/2);
  const row1 = list.slice(0, firstCount).join(' · ');
  const row2 = list.slice(firstCount).join(' · ');
  return `<div>${escapeHtml(row1)}</div><div>${escapeHtml(row2)}</div>`;
}
function timeAgo(ts){
  const diff = Math.floor((Date.now()-ts)/1000);
  if(diff<60) return 'just now';
  if(diff<3600) return Math.floor(diff/60)+'m ago';
  if(diff<86400) return Math.floor(diff/3600)+'h ago';
  return Math.floor(diff/86400)+'d ago';
}

/* ---------------------------------------------------------
   HOLE SVG
--------------------------------------------------------- */
function holeSvg(h){
  const W=320,H=260;
  let fairwayPath, teeX=160, teeY=235, pinX=160, pinY=35;
  if(h.shape==='dogleg-left'){
    pinX=95; fairwayPath = `M120,240 C60,180 70,120 60,60 C55,35 75,20 100,25 L200,25 C210,60 190,110 190,160 C190,200 170,225 120,240 Z`;
  } else if(h.shape==='dogleg-right'){
    pinX=225; fairwayPath = `M200,240 C260,180 250,120 260,60 C265,35 245,20 220,25 L120,25 C110,60 130,110 130,160 C130,200 150,225 200,240 Z`;
  } else {
    fairwayPath = `M115,240 C100,180 105,100 118,30 L202,30 C215,100 220,180 205,240 Z`;
  }
  const bunker = h.bunker ? `<ellipse cx="${pinX>160?pinX-55:pinX+55}" cy="${pinY+35}" rx="20" ry="12" fill="var(--sand)" opacity="0.9"/>` : '';
  const water = h.water ? `<path d="M${h.shape==='dogleg-left'?'190,150 Q230,140 250,170 Q260,200 230,210 Q195,205 190,180 Z':'130,150 Q90,140 70,170 Q60,200 90,210 Q125,205 130,180 Z'}" fill="var(--water)" opacity="0.85"/>` : '';
  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="220" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="var(--water-light)"/>
    <rect width="${W}" height="${H}" fill="#E4EDE0"/>
    <path d="${fairwayPath}" fill="#8FB781" stroke="#6E9862" stroke-width="2"/>
    ${water}
    ${bunker}
    <rect x="${teeX-14}" y="${teeY-8}" width="28" height="16" rx="3" fill="var(--fairway)"/>
    <circle cx="${pinX}" cy="${pinY+18}" r="9" fill="#fff" stroke="var(--fairway)" stroke-width="2"/>
    <line x1="${pinX}" y1="${pinY+10}" x2="${pinX}" y2="${pinY-22}" stroke="var(--ink)" stroke-width="2"/>
    <path d="M${pinX},${pinY-22} L${pinX},${pinY-10} L${pinX+14},${pinY-16} Z" fill="var(--flag)"/>
  </svg>`;
}

/* ---------------------------------------------------------
   RENDER: ROUTER
--------------------------------------------------------- */
function render(){
  try{ if(window.storage && window.storage.yearMode) paintYearChrome(); }catch(e){}
  // Rebuilding the DOM on every render would otherwise reset the Front/Back
  // Nine tables' horizontal scroll (including the auto-scroll-to-current-hole
  // on tab entry) back to the start. Preserve it across every render, not
  // just specific handlers.
  const __pcardScrollPositions = Array.from(document.querySelectorAll('.pcard-scroll')).map(el=>el.scrollLeft);
  const __drafts = {};
  ['feedText','tributeText'].forEach(id=>{ const el=document.getElementById(id); if(el) __drafts[id]=el.value; });
  renderInner();
  Object.entries(__drafts).forEach(([id,v])=>{ const el=document.getElementById(id); if(el && v) el.value=v; });
  if(pendingFeedFile && pendingFeedPreviewHtml){ const w=document.getElementById('feedImgPreviewWrap'); if(w && !w.innerHTML) w.innerHTML=pendingFeedPreviewHtml; }
  if(pendingTributeFile && pendingTributePreviewHtml){ const w=document.getElementById('tributeImgPreviewWrap'); if(w && !w.innerHTML) w.innerHTML=pendingTributePreviewHtml; }
  if(__pcardScrollPositions.length){
    requestAnimationFrame(()=>{
      document.querySelectorAll('.pcard-scroll').forEach((el,i)=>{
        if(__pcardScrollPositions[i] !== undefined) el.scrollLeft = __pcardScrollPositions[i];
      });
    });
  }
}
function renderHeroText(){
  const t = document.getElementById('heroTagline'), sub = document.getElementById('heroSub'), btn = document.getElementById('editHeroTextBtn');
  if(t){ t.textContent = heroText.tagline; t.style.display = heroText.tagline ? '' : 'none'; }
  if(sub){ sub.textContent = heroText.sub; sub.style.display = heroText.sub ? '' : 'none'; }
  if(btn) btn.style.display = isAdminSession ? '' : 'none';
}
document.addEventListener('click', async (e)=>{
  if(!e.target.closest('#editHeroTextBtn') || !isAdminSession) return;
  const tagline = prompt('Gold italic line (leave blank to hide):', heroText.tagline||''); if(tagline===null) return;
  const sub = prompt('Description (leave blank to hide):', heroText.sub||''); if(sub===null) return;
  heroText = {tagline: tagline.trim(), sub: sub.trim()};
  await save('hero-text', JSON.stringify(heroText), true);
  renderHeroText();
  showToast('Banner text saved');
});
// Event date shown on three lines: weekday, "October 9", year. The weekday
// is spelled out (typed "Fri" becomes "Friday"; if none was typed it's worked
// out from the date). The year always comes from the tournament year unless
// one was typed into the date.
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function eventDateHtml(raw){
  let d = String(raw||'').trim();
  const typedYear = (d.match(/\b(19|20)\d{2}\b/) || [])[0];
  const year = typedYear || TOURNAMENT_YEAR;
  const wd = d.match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i);
  d = d.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '')
       .replace(/,?\s*\b(19|20)\d{2}\b/, '').trim();
  let weekday = wd ? WEEKDAYS.find(w=>w.slice(0,3).toLowerCase() === wd[1].toLowerCase()) : null;
  if(!weekday){
    const t = new Date(`${d}, ${year}`);
    if(!isNaN(t)) weekday = WEEKDAYS[t.getDay()];
  }
  return (weekday ? `${weekday}<br>` : '') + `${escapeHtml(d)}<br>${year}`;
}
function renderEventInfo(){
  renderHeroText();
  const el = document.getElementById('heroEvent'); if(!el) return;
  const ICON = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg>',
    dine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7a2 2 0 0 1-2 2M8 3v6"/><path d="M17 21V3c-2 1.5-3 4-3 7s1 4 3 4"/></svg>'
  };
  const facts = [
    eventInfo.venue && ['pin', eventInfo.venue],
    eventInfo.date  && ['cal', eventInfo.date],
    eventInfo.note  && ['dine', eventInfo.note],
  ].filter(Boolean);
  el.innerHTML = (facts.length ? `<div class="hero-facts">${facts.map(([k,t])=>`<div class="hero-fact${k==='cal' ? ' hero-fact-date' : ''}"><span class="hero-fact-ico">${ICON[k]}</span><span>${k==='cal' ? eventDateHtml(t) : escapeHtml(t).replace(/ (\S+)$/, '&nbsp;$1')}</span></div>`).join('')}</div>` : '')
    + (canAdminEditYear() ? `<button class="tiny-btn" id="editEventInfoBtn" type="button">Edit event details</button>` : '');
  const yr = document.getElementById('heroWordmarkYear'); if(yr) yr.textContent = ' · ' + TOURNAMENT_YEAR;
}
document.addEventListener('click', async (e)=>{
  if(!e.target.closest('#editEventInfoBtn') || !isAdminSession) return;
  const venue = prompt('Course / location (leave blank to hide):', eventInfo.venue||''); if(venue===null) return;
  const date  = prompt('Date (leave blank to hide):', eventInfo.date||''); if(date===null) return;
  const note  = prompt('Note, e.g. dinner plans (leave blank to hide):', eventInfo.note||''); if(note===null) return;
  eventInfo = {venue: venue.trim(), date: date.trim(), note: note.trim()};
  await save('event-info', JSON.stringify(eventInfo), true);
  renderEventInfo();
  showToast('Event details saved');
});
function renderInner(){
  if(currentTab==='scorecard' && myRole==='guest' && !isAdminSession){
    currentTab = 'leaderboard';
  }
  document.getElementById('heroYear').textContent = heroYearText;
  renderEventInfo();
  document.getElementById('heroSection').style.display = (currentTab==='joe') ? '' : 'none';
  document.getElementById('memorialRibbon').style.display = (currentTab==='scorecard' || currentTab==='holes' || currentTab==='joe') ? 'none' : '';
  document.body.classList.toggle('show-get-app', currentTab==='leaderboard' || currentTab==='scorecard');
  document.getElementById('scorecardHeader').style.display = (currentTab==='scorecard') ? '' : 'none';
  const m = document.getElementById('main');
  let content = '';
  if(currentTab==='leaderboard') content = renderLeaderboard();
  if(currentTab==='scorecard') content = renderScorecard();
  if(currentTab==='holes') content = renderHoles();
  if(currentTab==='feed') content = renderFeed();
  if(currentTab==='joe') content = renderJoe();
  const slideClass = tabSlideDir ? ('tab-slide-'+tabSlideDir) : '';
  tabSlideDir = null;
  m.innerHTML = `<div class="tab-content ${slideClass}">${content}</div>`;
  attachHandlers();
}

/* ---------------------------------------------------------
   LEADERBOARD
--------------------------------------------------------- */
// "8:30", "8:30 AM", "1:10pm" -> minutes after midnight (no am/pm: 1-6 o'clock = afternoon)
function teeMinutes(str){
  const m = String(str||'').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?/i);
  if(!m) return Infinity;
  let h = parseInt(m[1],10) % 12, min = parseInt(m[2]||'0',10);
  const ap = (m[3]||'').toLowerCase();
  if(ap.startsWith('p') || (!ap && h>=1 && h<=6)) h += 12;
  return h*60 + min;
}
function teamGroup(t){ return groups.find(g=>g.id===t.groupId) || null; }
function renderLeaderboard(){
  const rows = teams.map(t=>({t, tot:teamTotals(t.id)}))
    .sort((a,b)=>{
      if(a.tot.thru===0 && b.tot.thru===0){
        const d = teeMinutes((teamGroup(a.t)||{}).teeTime) - teeMinutes((teamGroup(b.t)||{}).teeTime);
        return (d && isFinite(d)) ? d : a.t.label.localeCompare(b.t.label);
      }
      if(a.tot.thru===0) return 1;
      if(b.tot.thru===0) return -1;
      return a.tot.diff - b.tot.diff;
    });
  const medals = [`<span class="lb-trophy" title="1st place">${TROPHY_CUP_SVG}</span>`,'🥈','🥉'];
  const started = rows.filter(r=>r.tot.thru>0);
  let rowsHtml = rows.map((r,i)=>{
    const cls = r.tot.thru===0 ? 'even' : (r.tot.diff<0?'under':'even');
    // Tied teams share a position ("T2"), Masters-style
    const rank = started.filter(x=>x.tot.diff < r.tot.diff).length + 1;
    const tied = started.filter(x=>x.tot.diff === r.tot.diff).length > 1;
    const medal = (r.tot.thru>0 && rank<=3 && !tied) ? medals[rank-1] : '';
    const posLabel = r.tot.thru===0 ? (i+1) : (tied ? 'T'+rank : rank);
    const thruLabel = r.tot.thru===0 ? '—' : (r.tot.thru>=holesConfig.length ? 'F' : r.tot.thru);
    const expanded = !!expandedLbRows[r.t.id];
    const row = `<div class="lb-row lb-row-tap" data-toggle-lb-row="${r.t.id}" role="button" aria-expanded="${expanded}">
      <div class="lb-pos">${medal || posLabel}</div>
      <div class="lb-name" style="min-width:0;padding-left:6px;">
        ${playerNameLines(r.t.players)}
      </div>
      ${(()=>{
        const g = teamGroup(r.t);
        if(r.tot.thru===0 && g && g.teeTime){
          const sh = parseInt(g.startHole,10) || 1;
          return `<div class="lb-teetime"><div class="lb-teetime-time">${escapeHtml(g.teeTime)}</div><div class="lb-teetime-sub">Tee · #${sh}</div></div>`;
        }
        return `<div class="lb-thru"><div class="score-box">${thruLabel}</div></div>
      <div class="lb-score"><div class="score-box ${cls}">${fmtDiff(r.tot.diff, r.tot.thru)}</div></div>`;
      })()}
      <span class="lb-expand-toggle" aria-hidden="true">${expanded ? '−' : '+'}</span>
    </div>`;
    return row + (expanded ? renderLbExpandedRow(r.t) : '');
  }).join('');
  let boardHtml;
  if(rows.length===0){
    boardHtml = `<div class="sign-frame">
      <div class="board">
        <div class="sign-post left"><div class="sign-cap"></div></div>
        <div class="sign-post right"><div class="sign-cap"></div></div>
        <div class="sign-beam"><div class="sign-beam-gold-strip"></div></div>
        <div class="sign-pole"></div>
        <div class="sign-ground-shadow"></div>
        <div class="board-title">The Joey${hasMultipleYears() ? '' : `<span class="board-title-year">${TOURNAMENT_YEAR}</span>`}</div>${hasMultipleYears() ? `<div class="board-year-row">${yearSwitchChip()}</div>` : ''}
        ${teamsLoadFailed ? teamsLoadErrorHtml() : `<div class="empty" style="padding:14px 4px 20px;">No teams yet — set up team pairings from the Scorecard tab to get things rolling.</div>`}
      </div>
    </div>`;
  } else {
    boardHtml = `<div class="sign-frame">
      <div class="board">
        <div class="sign-post left"><div class="sign-cap"></div></div>
        <div class="sign-post right"><div class="sign-cap"></div></div>
        <div class="sign-beam"><div class="sign-beam-gold-strip"></div></div>
        <div class="sign-pole"></div>
        <div class="sign-ground-shadow"></div>
        <div class="board-title">The Joey${hasMultipleYears() ? '' : `<span class="board-title-year">${TOURNAMENT_YEAR}</span>`}</div>${hasMultipleYears() ? `<div class="board-year-row">${yearSwitchChip()}</div>` : ''}
        <div class="board-head">
          <span class="bh-pos"></span>
          <span class="bh-team">Team</span>
          <span class="bh-thru">Thru</span>
          <span class="bh-score">Total</span>
          <span class="bh-expand"></span>
        </div>
        ${rowsHtml}
      </div>
    </div>`;
  }
  const contestHtml = renderContestSummary();
  return `
    ${lockBannerHtml()}
    <div class="lb-scene">${boardHtml}</div>
    ${contestHtml}
  `;
}

function renderLbExpandedRow(t){
  const s = scores[t.id] || {};
  const cells = holesConfig.map(h=>{
    const val = s[h.number] || '';
    const cls = scoreClass(s[h.number], h.par);
    return `<div style="flex:0 0 auto;width:32px;text-align:center;">
      <div style="font-size:9.5px;font-weight:700;color:var(--ink-soft);margin-bottom:3px;">${h.number}</div>
      <div class="score-input-readonly ${cls}" style="width:28px;height:28px;margin:0 auto;font-size:11.5px;">${val}</div>
    </div>`;
  }).join('');
  return `<div class="lb-expand-strip">
    <div class="lb-expand-scroll" style="display:flex;gap:5px;padding:10px 8px;overflow-x:auto;-webkit-overflow-scrolling:touch;">
      ${cells}
    </div>
  </div>`;
}
const GOLDEN_PUTTER_ICON_SVG = `<svg viewBox="0 0 100 100" width="1em" height="1em" style="display:block;">
  <path d="M56 6 L60 6 L46 78 L42 78 Z" fill="#D4A017"/>
  <rect x="24" y="76" width="34" height="9" rx="2" fill="#D4A017"/>
  <line x1="58" y1="6" x2="54.5" y2="24" stroke="#D4A017" stroke-width="9" stroke-linecap="round"/>
</svg>`;

// Silver two-handled cup (matches the real trophy) for 1st place on the leaderboard
const TROPHY_CUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 84" width="100%" height="100%" role="img" aria-label="Champion's trophy">
  <defs>
    <linearGradient id="cupSv" x1="0" x2="1">
      <stop offset="0" stop-color="#6e737a"/><stop offset=".25" stop-color="#e6e9ec"/>
      <stop offset=".42" stop-color="#ffffff"/><stop offset=".68" stop-color="#b3b8be"/><stop offset="1" stop-color="#5d6268"/>
    </linearGradient>
    <linearGradient id="cupSvD" x1="0" x2="1">
      <stop offset="0" stop-color="#565b61"/><stop offset=".5" stop-color="#d0d4d8"/><stop offset="1" stop-color="#4f545a"/>
    </linearGradient>
    <linearGradient id="cupBase" x1="0" x2="1">
      <stop offset="0" stop-color="#0d0f10"/><stop offset=".45" stop-color="#3a3f44"/><stop offset="1" stop-color="#0d0f10"/>
    </linearGradient>
  </defs>
  <!-- scroll handles -->
  <g fill="none" stroke="url(#cupSvD)" stroke-width="2.6" stroke-linecap="round">
    <path d="M14.5 13 C8 11 5 13 6 20 C7 26 11 30 17 33"/>
    <path d="M45.5 13 C52 11 55 13 54 20 C53 26 49 30 43 33"/>
  </g>
  <g fill="none" stroke="#6b7076" stroke-width="1.4">
    <circle cx="7.5" cy="9.5" r="2.2"/><circle cx="52.5" cy="9.5" r="2.2"/>
    <circle cx="16" cy="35.5" r="1.8"/><circle cx="44" cy="35.5" r="1.8"/>
  </g>
  <path d="M7 12 L6.5 16 M53 12 L53.5 16" stroke="#6b7076" stroke-width="1.6" stroke-linecap="round"/>
  <!-- tulip bowl -->
  <path d="M13 8 C13 24 19 36 27 42 H33 C41 36 47 24 47 8 Z" fill="url(#cupSv)" stroke="#565b61" stroke-width="1.1"/>
  <ellipse cx="30" cy="8" rx="17" ry="2.6" fill="#9ea3a9" stroke="#565b61" stroke-width="1"/>
  <ellipse cx="30" cy="8.3" rx="14.5" ry="1.6" fill="#6f747a"/>
  <!-- knotted stem -->
  <path d="M27 42 H33 L32 45 H28 Z" fill="url(#cupSvD)"/>
  <ellipse cx="30" cy="47.5" rx="4.6" ry="3.2" fill="url(#cupSv)" stroke="#565b61" stroke-width=".9"/>
  <path d="M28.2 50.5 H31.8 L32.5 54 C33 56 36 57.5 38.5 58.5 H21.5 C24 57.5 27 56 27.5 54 Z" fill="url(#cupSv)" stroke="#565b61" stroke-width=".9"/>
  <!-- black base with plate -->
  <path d="M19 59 H41 L42 72 C44 73 46 74 46 76.5 H14 C14 74 16 73 18 72 Z" fill="url(#cupBase)"/>
  <ellipse cx="30" cy="59" rx="11" ry="1.6" fill="#2a2e32"/>
  <rect x="24" y="63" width="12" height="8" rx=".6" fill="url(#cupSvD)" stroke="#1a1d20" stroke-width=".6"/>
</svg>`;

function contestRowIcon(name){
  const n = (name||'').toLowerCase();
  if(n.includes('baffler')) return '🐍';
  if(n.includes('longest drive')) return '💪';
  if(n.includes('golden boy')) return `<span style="display:inline-block;width:16px;">${GOLDEN_PUTTER_ICON_SVG}</span>`;
  return null; // fall back to caller's default
}

function renderContestSummary(){
  const canSetWinners = !viewingPastYear() && (isAdminSession || (myRole==='player' && !contestsLocked));

  function winnerCell(winner, finalized, actionAttr, declareAttr, reopenAttr){
    if(finalized){
      return `<span class="contest-winner-pill winner-final">🏆 ${escapeHtml(winner)}</span>`
        + (isAdminSession && !viewingPastYear() ? `<button class="tiny-btn" ${reopenAttr}>Reopen</button>` : '');
    }
    if(winner){
      const pill = canSetWinners
        ? `<button class="contest-winner-pill" ${actionAttr}>${escapeHtml(winner)}</button>`
        : `<span class="contest-winner-pill static">${escapeHtml(winner)}</span>`;
      const declareBtn = isAdminSession
        ? `<button class="btn small gold" ${declareAttr} style="padding:5px 10px;font-size:11px;">Declare Winner</button>`
        : '';
      return pill + declareBtn;
    }
    return canSetWinners
      ? `<button class="btn small gold" ${actionAttr} style="padding:5px 16px;font-size:12px;">Assign</button>`
      : '';
  }

  const holeContests = holesConfig
    .filter(h=>h.contestName || h.contestType)
    .map(h=>{
      const c = contests[h.number];
      const label = h.contestName || (h.contestType==='ctp' ? 'Closest to the Pin' : 'Longest Drive');
      return `<div class="contest-row">
        <div class="contest-row-icon">${contestRowIcon(label) || '🚩'}</div>
        <div class="contest-row-info">
          <div class="contest-row-name">${escapeHtml(label)}</div>
          <div class="contest-row-sub">Hole ${h.number}</div>
        </div>
        <span style="display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:6px;flex-shrink:0;max-width:150px;">
          ${winnerCell(c && c.winner, c && c.finalized, `data-set-contest="${h.number}"`, `data-declare-contest="${h.number}"`, `data-reopen-contest="${h.number}"`)}
        </span>
      </div>`;
    }).join('');

  const extraHtml = extraContests.map(ec=>{
    const adminMenu = isAdminSession ? `
      <span style="position:relative;">
        <button class="tiny-btn" data-toggle-extra-menu="${ec.id}" style="font-size:11px;">⋯</button>
        <div class="extra-contest-menu" id="extraMenu-${ec.id}" style="display:none;position:absolute;right:0;top:22px;z-index:20;background:var(--card-bg,#fff);border:1px solid var(--line,#ddd);border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.15);min-width:150px;overflow:hidden;">
          <button data-edit-extra-contest="${ec.id}" style="display:block;width:100%;text-align:left;padding:9px 12px;font-size:13px;background:none;border:none;">✏️ Edit name</button>
          <button data-remove-extra-contest="${ec.id}" style="display:block;width:100%;text-align:left;padding:9px 12px;font-size:13px;color:var(--flag,#c0392b);background:none;border:none;border-top:1px solid var(--line,#eee);">🗑 Delete</button>
        </div>
      </span>` : '';
    return `<div class="contest-row" style="position:relative;">
      <div class="contest-row-icon">${contestRowIcon(ec.name) || '📍'}</div>
      <div class="contest-row-info">
        <div class="contest-row-name">${escapeHtml(ec.name)}</div>
        ${ec.location ? `<div class="contest-row-sub">${escapeHtml(ec.location)}</div>` : ''}
      </div>
      <span style="display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:6px;flex-shrink:0;max-width:150px;">
        ${winnerCell(ec.winner, ec.finalized, `data-set-extra-contest="${ec.id}"`, `data-declare-extra-contest="${ec.id}"`, `data-reopen-extra-contest="${ec.id}"`)}
        ${adminMenu}
      </span>
    </div>`;
  }).join('');

  const lockToggleHtml = canAdminEditYear() ? `
    <button class="tiny-btn" id="toggleContestLockBtn" style="margin-top:10px;display:block;">
      ${contestsLocked ? '🔒 Winners locked — tap to allow player edits' : '🔓 Players can set winners — tap to lock'}
    </button>` : '';

  return `<div class="card" style="padding:0;overflow:hidden;">
    <div class="contest-card-header">Side Contests</div>
    <div style="padding:14px 16px 16px;">
    <div>
    ${holeContests}
    ${extraHtml}
    </div>
    ${canAdminEditYear() ? `<button class="tiny-btn" id="addExtraContestBtn" style="margin-top:10px;">+ Add side contest</button>` : ''}
    ${lockToggleHtml}
    </div>
  </div>`;
}

/* ---------------------------------------------------------
   SCORECARD
--------------------------------------------------------- */
function lockBannerHtml(){
  if(viewingPastYear()) return '';   // the Viewing Previous Year banner says it
  return '';   // the navy banner above the page shows locked / previous-year status
}
function renderScorecard(){
  if(!isAdminSession){
    // players/guests get a locked-down, single-purpose scorecard --
    // no team switching, no group filter, no access to team setup
    if(viewingPastYear()){
      // your saved team belongs to the current year, not this one
      return lockBannerHtml() + `<div class="card"><div class="empty">${viewingUpcomingYear()
        ? `The ${TOURNAMENT_YEAR} tournament hasn't started yet. Scorecards open once it's the current year.`
        : `Every team's ${TOURNAMENT_YEAR} card is on the Leaderboard. Tap a team there to see it hole by hole.`}</div></div>`;
    }
    return lockBannerHtml() + renderScoreEntry();
  }
  if(viewingPastYear() && !viewingUpcomingYear()) return lockBannerHtml() + renderScoreEntry();
  const content = scorecardMode==='manage' ? renderTeamManager() : renderScoreEntry();
  const modeSwitch = `
    <div class="card">
      <div class="section-desc" style="margin-bottom:8px;">Switch to team &amp; group setup:</div>
      <div class="mode-switch">
        <button data-mode="score" class="${scorecardMode==='score'?'active':''}">Score Entry</button>
        <button data-mode="manage" class="${scorecardMode==='manage'?'active':''}">Teams &amp; Groups</button>
      </div>
    </div>`;
  return lockBannerHtml() + content + modeSwitch;
}

function renderScoreEntry(){
  if(teams.length===0 && teamsLoadFailed){
    return `<div class="card">${teamsLoadErrorHtml()}</div>`;
  }
  if(teams.length===0){
    return `<div class="card"><div class="empty">No teams set up yet. Switch to "Teams &amp; Groups" above to pair up your players.</div></div>`;
  }
  if(!isAdminSession && myRole!=='player'){
    return `<div class="card"><div class="empty">Score entry is for players on a team. Check the Leaderboard tab for live scores from everyone.</div></div>`;
  }
  if(!isAdminSession && myRole==='player' && myTeamId){
    scoreboardSelectedTeam = myTeamId;
  } else if(!scoreboardSelectedTeam || !teams.find(t=>t.id===scoreboardSelectedTeam)){
    scoreboardSelectedTeam = teams[0].id;
  }
  const groupChips = ['<button class="group-chip '+(scoreboardGroupFilter==='all'?'active':'')+'" data-group-filter="all">All groups</button>']
    .concat(groups.map(g=>`<button class="group-chip ${scoreboardGroupFilter===g.id?'active':''}" data-group-filter="${g.id}">${escapeHtml(g.label)}</button>`)).join('');

  const visibleTeams = scoreboardGroupFilter==='all' ? teams : teams.filter(t=>t.groupId===scoreboardGroupFilter);
  const teamChips = visibleTeams.map(t=>`
    <button class="team-chip ${t.id===scoreboardSelectedTeam?'active':''}" data-select-team="${t.id}">
      <span class="team-badge">${escapeHtml(t.label)}</span>
      <span class="team-chip-name">${escapeHtml((t.players||[]).join(' / '))}</span>
    </button>`).join('');

  const team = teams.find(t=>t.id===scoreboardSelectedTeam);
  const canEditTeam = !scoresLocked && !viewingPastYear() && (isAdminSession || (myRole==='player' && myTeamId===team?.id));
  const isYourTeamView = myRole==='player' && team && myTeamId===team.id;
  let gridHtml = '';
  if(team){
    const s = scores[team.id] || {};
    const order = playOrder(team);
    let currentHole = order.find(h=>!s[h.number]) || order[order.length-1];
    if(quickUndoState && quickUndoState.teamId === team.id){
      const heldHole = holesConfig.find(h=>h.number===quickUndoState.hole);
      if(heldHole) currentHole = heldHole;
    }
    window.__scorecardCurrentHole = currentHole.number;
    const nineGrid = (start,end,label,outLabel)=>{
      const holesSlice = holesConfig.slice(start,end);
      const hlCls = (h)=> h.number===currentHole.number ? ' current-hole-col' : '';
      const headCells = holesSlice.map(h=>`<th class="${h.number===currentHole.number?'current-hole-col':''}">${h.number}${(h.contestName||h.contestType)?'<span class="contest-asterisk">*</span>':''}</th>`).join('');
      const yardCells = holesSlice.map(h=>`<td class="${hlCls(h)}">${h.yards}</td>`).join('');
      const hcpCells = holesSlice.map(h=>`<td class="${hlCls(h)}">${h.handicap!==undefined?h.handicap:'—'}</td>`).join('');
      const parCells = holesSlice.map(h=>`<td class="${hlCls(h)}">${h.par}</td>`).join('');
      const reviewCells = holesSlice.map(h=>`<td class="${hlCls(h)}"><button class="hole-preview-btn" data-review-hole="${h.number}" title="Preview hole ${h.number}"><span class="hpb-icon">${HOLE_PREVIEW_ICON_SVG}</span></button></td>`).join('');
      const scoreCells = holesSlice.map(h=>{
        const val = s[h.number] || '';
        const cls = scoreClass(s[h.number], h.par);
        const hl = hlCls(h);
        if(canEditTeam){
          return `<td class="${hl}"><div class="score-input-wrap" style="width:40px;height:40px;margin:0 auto;">
            <input class="score-input ${cls}" style="font-size:16px;" type="number" min="1" max="15" inputmode="numeric"
              value="${val}" data-hole="${h.number}" data-team="${team.id}"></div></td>`;
        }
        return `<td class="${hl}"><div class="score-input-wrap" style="width:40px;height:40px;margin:0 auto;"><div class="score-input-readonly ${cls}" style="font-size:16px;">${val}</div></div></td>`;
      }).join('');
      const yardSum = holesSlice.reduce((a,h)=>a+h.yards,0);
      const parSum = holesSlice.reduce((a,h)=>a+h.par,0);
      let scoreSum = 0, scoreCount = 0;
      holesSlice.forEach(h=>{ if(s[h.number]){ scoreSum += s[h.number]; scoreCount++; } });
      const scoreSumDisplay = scoreCount>0 ? scoreSum : '—';

      return `<div class="pcard-wrap">
        <div class="pcard-nine-label">${label}</div>
        <div class="pcard-scroll" data-nine="${label==='Front Nine'?'front':'back'}">
        <table class="pcard-table">
          <colgroup>
            <col class="pcard-label-col">
            ${holesSlice.map(()=>'<col class="pcard-hole-col">').join('')}
            <col class="pcard-out-col">
          </colgroup>
          <thead>
            <tr class="pcard-hole">
              <th class="pcard-label">Hole</th>
              ${headCells}
              <th>${outLabel}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="pcard-yards">
              <td class="pcard-label">YDS</td>
              ${yardCells}
              <td class="pcard-sum">${yardSum}</td>
            </tr>
            <tr class="pcard-par">
              <td class="pcard-label">Par</td>
              ${parCells}
              <td class="pcard-sum">${parSum}</td>
            </tr>
            <tr class="pcard-score">
              <td class="pcard-label"><span class="pcard-team-badge">${escapeHtml(team.label)}</span></td>
              ${scoreCells}
              <td class="pcard-sum">${scoreSumDisplay}</td>
            </tr>
            <tr class="pcard-hcp">
              <td class="pcard-label">Hcp</td>
              ${hcpCells}
              <td></td>
            </tr>
            <tr class="pcard-review">
              <td class="pcard-label" style="font-size:10px;">Hole Preview</td>
              ${reviewCells}
              <td></td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>`;
    };
    const t = teamTotals(team.id);
    gridHtml = `
      ${nineGrid(0,9,'Front Nine','Out')}
      ${nineGrid(9,18,'Back Nine','In')}
      <div class="score-legend">
        <span><i class="legend-swatch circle" style="color:var(--flag);"></i>Birdie</span>
        <span><i class="legend-swatch circle" style="color:var(--flag);box-shadow:0 0 0 2px #fff inset,0 0 0 3px var(--flag) inset;"></i>Eagle</span>
        <span><i class="legend-swatch" style="color:var(--water);"></i>Bogey</span>
        <span><i class="legend-swatch" style="color:var(--water);box-shadow:0 0 0 2px #fff inset,0 0 0 3px var(--water) inset;"></i>Double+</span>
        <span><span style="color:var(--gold);font-weight:800;">*</span> Side Contest hole</span>
      </div>
      <div class="row-between" style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px;">
        <span style="font-size:13px;color:var(--ink-soft);">Thru ${t.thru} · ${t.strokes || 0} strokes</span>
        <span class="mono" style="font-weight:700;font-size:16px;color:${t.diff<0?'var(--flag)':'var(--ink)'};">${fmtDiff(t.diff,t.thru)}</span>
      </div>
    `;
  } else {
    gridHtml = `<div class="card"><div class="empty">Select a team below to enter scores.</div></div>`;
  }

  let teamSummaryHtml = '', currentHoleSummaryHtml = '', quickEntryHtml = '';
  if(isYourTeamView){
    const t = teamTotals(team.id);
    teamSummaryHtml = `
      <div class="your-team-card">
        <div class="your-team-badge-wrap">
          <div class="your-team-badge-label">Team</div>
          <div class="your-team-badge">${escapeHtml(team.label)}</div>
        </div>
        <div class="your-team-info">
          ${playerNameLines(team.players)}
        </div>
        <div class="your-team-stats">
          <div class="your-team-score" style="color:${t.diff<0?'var(--gold-light)':'#fff'};">${fmtDiff(t.diff,t.thru)}</div>
          <div class="your-team-thru">Thru ${t.thru}</div>
        </div>
      </div>`;

    const s = scores[team.id] || {};
    const order = playOrder(team);
    let currentHole = order.find(h=>!s[h.number]) || order[order.length-1];
    if(quickUndoState && quickUndoState.teamId === team.id){
      const heldHole = holesConfig.find(h=>h.number===quickUndoState.hole);
      if(heldHole) currentHole = heldHole;
    }
    const currentHoleContestLabel = currentHole.contestName || (currentHole.contestType==='ctp' ? 'Closest to the Pin' : currentHole.contestType==='longdrive' ? 'Longest Drive' : null);
    currentHoleSummaryHtml = `
      <div class="current-hole-card">
        <div class="current-hole-card-top">
          <div>
            <div class="current-hole-title">Current Hole: #${currentHole.number}</div>
            <div class="current-hole-par-row">Par ${currentHole.par}</div>
            <div class="current-hole-meta">${currentHole.yards} yds · Hcp ${currentHole.handicap!==undefined?currentHole.handicap:'—'}</div>
          </div>
          <button class="hole-preview-cta" data-review-hole="${currentHole.number}">
            <span class="hole-preview-cta-icon">${HOLE_PREVIEW_ICON_SVG}</span>
            <span>Preview</span>
          </button>
        </div>
        ${currentHoleContestLabel ? `<div class="current-hole-contest">
          <span class="current-hole-contest-icon">${contestRowIcon(currentHoleContestLabel) || '🏆'}</span>
          <span>${escapeHtml(currentHoleContestLabel)}</span>
        </div>` : ''}
      </div>`;

    const existingVal = s[currentHole.number];
    if(!pendingQuickEntry || pendingQuickEntry.hole !== currentHole.number){
      pendingQuickEntry = {hole: currentHole.number, val: existingVal || null};
    }
    const minBtn = currentHole.par===3 ? Math.max(1, currentHole.par - 3) : 2;
    const maxBtn = currentHole.par===3 ? currentHole.par + 3 : 8;
    const isUndoActive = !!(quickUndoState && quickUndoState.hole===currentHole.number && quickUndoState.teamId===team.id);
    const quickBtns = [];
    for(let v=minBtn; v<=maxBtn; v++){
      const isSelected = pendingQuickEntry.val === v;
      const isPar = v === currentHole.par;
      const label = quickScoreLabel(v, currentHole.par);
      quickBtns.push(`<div class="quick-score-col" data-quick-score="${v}" data-quick-hole="${currentHole.number}" data-quick-team="${team.id}">
        <div class="quick-score-btn ${isSelected?'selected':''} ${isPar?'is-par':''}">
          <span class="quick-score-num">${v}</span>
        </div>
        <div class="quick-score-label ${(label==='Snowman'||label==='Albatross')?'is-compact':''}">${label}</div>
      </div>`);
    }
    const confirmVal = isUndoActive ? existingVal : null;
    const confirmLabel = confirmVal ? quickScoreLabel(confirmVal, currentHole.par) : '';
    if(canEditTeam) quickEntryHtml = `
      <div class="card" style="padding:8px 12px;margin-bottom:10px;background:#CED6C2;">
        <div class="section-title" style="font-size:19.125px;font-weight:700;margin-bottom:1px;">Quick Score Entry</div>
        <div class="section-desc" style="margin-bottom:0;color:var(--ink);"><strong>Hole #${currentHole.number}</strong> · Tap your score or input below</div>
        <div class="quick-score-row" style="margin-top:6px;">
          ${quickBtns.join('')}
        </div>
        ${isUndoActive ? `<button class="quick-score-confirm" data-quick-save-hole="${currentHole.number}" data-quick-save-team="${team.id}">
          <span class="quick-score-confirm-check">✓</span>
          <span class="quick-score-confirm-text">${confirmLabel} (${confirmVal}) selected for Hole #${currentHole.number}</span>
          <span class="quick-score-confirm-clear">✕ Clear</span>
        </button>` : ''}
      </div>`;
  }

  return `
    ${teamSummaryHtml}
    ${currentHoleSummaryHtml}
    ${quickEntryHtml}
    ${(team && !canEditTeam && !scoresLocked) ? `<div class="card section-desc" style="background:var(--parchment);padding:8px 10px;margin-bottom:10px;font-size:12.5px;">👁 Viewing Team ${escapeHtml(team.label)} — ${myRole==='player' ? "you can only edit your own team's scores." : 'read-only.'}</div>` : ''}
    ${gridHtml}
    ${isAdminSession ? `
    <div class="card" style="margin-top:14px;padding-top:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;">Switch team</div>
      ${groups.length>0 ? `<div class="group-filter">${groupChips}</div>` : ''}
      <div class="player-select">${teamChips}</div>
    </div>` : ''}
  `;
}

function renderTeamManager(){
  const groupBlocks = groups.map(g=>{
    const gt = teamsInGroup(g.id);
    const teamRows = gt.map(t=>`
      <div class="team-row">
        <span class="team-badge">${escapeHtml(t.label)}</span>
        <div class="team-row-info">
          <div class="team-row-players">${escapeHtml((t.players||[]).join(' · '))}</div>
        </div>
        <div class="team-row-actions">
          <button class="tiny-btn" data-edit-team="${t.id}">Edit</button>
          <button class="tiny-btn" data-remove-team="${t.id}">Remove</button>
        </div>
      </div>`).join('') || `<div class="empty" style="padding:8px 0;">No teams in this group yet.</div>`;
    return `<div class="group-block">
      <div class="group-block-head">
        <div>
          <div class="group-block-title">${escapeHtml(g.label)}</div>
          <div class="group-block-time">${g.teeTime ? escapeHtml(g.teeTime) + ' · ' : ''}Starts on #${parseInt(g.startHole,10)||1}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="tiny-btn" data-edit-group="${g.id}">Edit</button>
          <button class="tiny-btn" data-remove-group="${g.id}">Remove</button>
        </div>
      </div>
      ${teamRows}
      <button class="btn secondary small" style="margin-top:10px;" data-add-team-to="${g.id}">+ Add team</button>
    </div>`;
  }).join('');

  const un = unassignedTeams();
  const unassignedHtml = un.length ? `
    <div class="group-block" style="border-style:dashed;">
      <div class="group-block-head"><div class="group-block-title">Unassigned teams</div></div>
      ${un.map(t=>`
        <div class="team-row">
          <span class="team-badge">${escapeHtml(t.label)}</span>
          <div class="team-row-info">
            <div class="team-row-players">${escapeHtml((t.players||[]).join(' · '))}</div>
          </div>
          <div class="team-row-actions">
            <button class="tiny-btn" data-edit-team="${t.id}">Edit</button>
            <button class="tiny-btn" data-remove-team="${t.id}">Remove</button>
          </div>
        </div>`).join('')}
    </div>` : '';

  return `
    <div class="card">
      <div class="section-title" style="font-size:16px;">Groups &amp; Tee Times</div>
      <div class="section-desc">Each group plays together at one tee time and can hold multiple teams.</div>
      ${groupBlocks}
      ${unassignedHtml}
      <button class="btn block" id="addGroupBtn" style="margin-top:4px;">+ Add group</button>
      <button class="btn secondary block" id="addUnassignedTeamBtn" style="margin-top:8px;">+ Add team (no group yet)</button>
    </div>
  `;
}

/* ---------------------------------------------------------
   HOLES
--------------------------------------------------------- */
function renderHoles(idxOverride){
  const isPreview = idxOverride!=null;
  const idx = isPreview ? idxOverride : currentHoleIndex;
  const slideClass = (!isPreview && holeSlideDir) ? (holeSlideDir==='left'?'slide-left':'slide-right') : '';
  if(!isPreview) holeSlideDir = null;
  const h = holesConfig[idx];
  const contest = contests[h.number] || {};
  const contestLabel = h.contestName || (h.contestType==='ctp' ? 'Closest to the Pin' : h.contestType==='longdrive' ? 'Longest Drive' : null);
  let contestHtml = '';
  if(contestLabel){
    const canSet = !viewingPastYear() && (isAdminSession || (myRole==='player' && !contestsLocked));
    let actionHtml;
    if(contest.finalized){
      actionHtml = (isAdminSession && !viewingPastYear()) ? `<button class="tiny-btn" data-reopen-contest="${h.number}">Reopen</button>` : '';
    } else if(contest.winner){
      actionHtml = `<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">
        ${canSet ? `<button class="btn small gold" data-set-contest="${h.number}">Update</button>` : ''}
        ${isAdminSession ? `<button class="tiny-btn" data-declare-contest="${h.number}">Declare Winner</button>` : ''}
      </div>`;
    } else {
      actionHtml = canSet ? `<button class="btn small gold" data-set-contest="${h.number}">Set</button>` : '';
    }
    contestHtml = `<div class="contest-badge">
      <div class="icon">${contestRowIcon(contestLabel) || '🏆'}</div>
      <div style="flex:1;">
        <div class="label">${escapeHtml(contestLabel)}</div>
        <div class="winner">${contest.winner ? (contest.finalized?'🏆 ':'') + escapeHtml(contest.winner) + (contest.distance?` · ${escapeHtml(contest.distance)}`:'') : 'No winner set yet'}</div>
      </div>
      ${actionHtml}
    </div>`;
  }

  const dots = holesConfig.map((hh,i)=>{
    const hasContest = hh.contestName || hh.contestType;
    return `<div class="hole-dot ${i===idx?'current':(hasContest?'contest':'')}" data-goto-hole="${i}"></div>`;
  }).join('');

  const reticleOverlayHtml = renderReticleOverlay(h);
  const calibratingThisHole = calibrationMode && calibrationMode.holeNumber === h.number;
  let calibHint = '';
  let calibButtons = '';
  if(calibratingThisHole){
    if(calibrationMode.step === 'tee'){
      calibHint = `<div class="hazard-hint" style="font-weight:700;color:var(--fairway);">📍 Step 1 of 3 — Tap the TEE on the photo</div>`;
    } else if(calibrationMode.step === 'green'){
      calibHint = `<div class="hazard-hint" style="font-weight:700;color:var(--fairway);">🚩 Step 2 of 3 — Tap the GREEN on the photo</div>`;
    } else {
      calibHint = `<div class="hazard-hint" style="font-weight:700;color:var(--fairway);">🎯 Step 3 of 3 — Set the default markers (max 5): Tap to add a target · Hold and drag to move · Tap × to remove</div>`;
      calibButtons = `<div style="display:flex;gap:8px;justify-content:center;margin:-6px 0 12px;">
        <button class="btn small gold" id="calibDoneBtn">Save defaults</button>
        <button class="tiny-btn" id="calibCancelBtn">Cancel</button>
      </div>`;
    }
  } else {
    calibHint = h.calib
      ? `<div class="hazard-hint">Tap to add a target · Hold and drag to move · Tap × to remove</div>`
      : (isAdminSession ? `<div class="hazard-hint">Calibrate this hole to enable live yardage markers</div>` : '');
  }

  return `
    <div class="card ${slideClass}" id="holeCard">
      <div class="hole-nav">
        <button class="hole-nav-btn" id="prevHole">‹</button>
        <div style="text-align:center;">
          <div class="hole-title-big display">Hole ${h.number}</div>
        </div>
        <button class="hole-nav-btn" id="nextHole">›</button>
      </div>
      <div class="hole-meta" style="justify-content:center;">
        <div style="text-align:center;">Par<b>${h.par}</b></div>
        <div style="text-align:center;">Yards<b>${h.yards}</b></div>
        <div style="text-align:center;">Handicap<b>${h.handicap!==undefined?h.handicap:'—'}</b></div>
        ${contestLabel ? `<div style="text-align:center;">Contest<b style="font-size:18px;">${contestRowIcon(contestLabel) || '🏆'}</b></div>` : ''}
      </div>
      <div class="hole-svg-wrap hole-photo-frame" id="holePhotoFrame" data-hole-frame="${h.number}">
        ${h.photo ? `<img src="${h.photo}" style="width:100%;display:block;pointer-events:none;border-radius:10px;">` : holeSvg(h)}
        <div id="reticleOverlayWrap">${reticleOverlayHtml}</div>
      </div>
      ${calibHint}
      ${calibButtons}
      ${isAdminSession && !calibratingThisHole ? `<button class="tiny-btn" id="calibrateHoleBtn">${h.calib ? 'Re-calibrate hole' : '📍 Calibrate hole'}</button>` : ''}
      ${isAdminSession ? (!h.photo ? `<label class="tiny-btn" style="cursor:pointer;">Add a photo for this hole<input type="file" accept="image/*" class="hole-photo-input" data-hole-photo="${h.number}" style="display:none;"></label>` : `<label class="tiny-btn" style="cursor:pointer;">Replace photo<input type="file" accept="image/*" class="hole-photo-input" data-hole-photo="${h.number}" style="display:none;"></label>`) : ''}
      ${contestHtml}
      <div class="hole-desc" id="holeDescText" data-editable="desc">${escapeHtml(h.description)}</div>
      ${isAdminSession ? `<button class="tiny-btn" id="editHoleBtn">Edit hole details</button>` : ''}
      <div class="hole-dots">${dots}</div>
    </div>
  `;
}

/* ---------------------------------------------------------
   FEED
--------------------------------------------------------- */
const FEED_TAGS = ['LongDrive','ClosestToPin','WaterHazard','Birdie','GreatShot','Scenic','TeamPhoto','Trouble'];
let pendingFeedTags = [];
let feedFilterTag = 'all';
let expandedComments = {}; // { postId: true } -- which posts have their reply thread open
let expandedLbRows = {};   // { teamId: true } -- which leaderboard rows show the hole-by-hole strip
let editingPostId = null;   // post currently being edited (text only), or null
let editingCommentId = null; // comment currently being edited, or null
let pendingQuickEntry = null; // {hole, val} -- Quick Score Entry selection not yet saved
let quickUndoState = null;    // {hole, teamId, previousVal, timeoutId} -- 4s Undo grace period after a quick-tap save

function renderFeed(){
  const adminAutoPostPanel = isAdminSession ? `
    <div class="card" style="padding:12px 14px;">
      <div style="font-size:10.5px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">⛳ Auto Posts (Admin)</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <button class="tiny-btn" id="toggleBirdiePostsBtn">🐦 Birdie posts: ${autoPostSettings.birdiesOn ? 'ON' : 'OFF'}</button>
        <button class="tiny-btn" id="toggleBogeyPostsBtn">😬 Bogey posts: ${autoPostSettings.bogeysOn ? 'ON' : 'OFF'}</button>
      </div>
      <label class="field-label">Bot avatar image</label>
      <div style="display:flex;align-items:center;gap:10px;">
        ${botIconUrl ? `<img src="${botIconUrl}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);">` : ''}
        <button class="btn small secondary" id="setBotIconBtn">${botIconUrl ? 'Change' : 'Upload'} icon</button>
        <input type="file" accept="image/*" id="botIconInput" style="display:none;">
      </div>
    </div>` : '';
  const composer = `
    <div class="card">
      <div class="section-title" style="font-size:16px;">Share something</div>
      <div class="composer" style="margin-top:8px;">
        <textarea id="feedText" placeholder="How's the round going?"></textarea>
        <div class="composer-row">
          <button type="button" class="file-btn" id="feedMediaBtn">📷 Add Photo/Video</button>
          <input type="file" accept="image/*" capture="environment" id="feedPhotoCaptureInput" style="display:none;">
          <input type="file" accept="video/*" capture="environment" id="feedVideoCaptureInput" style="display:none;">
          <input type="file" accept="image/*,video/*" id="feedUploadInput" style="display:none;">
          <button class="btn post-btn" id="feedPostBtn" ${feedPosting?'disabled':''}>${feedPosting?'Posting…':'Post <span aria-hidden="true">›</span>'}</button>
        </div>
        <div id="feedImgPreviewWrap"></div>
      </div>
    </div>`;

  const usedTags = [...new Set(feedPosts.flatMap(p=>p.tags||[]))];
  let filterHtml = '';
  if(usedTags.length){
    const filterChips = ['all', ...usedTags].map(t=>{
      const label = t==='all' ? 'All posts' : '#'+t;
      return `<button class="tag-chip filter ${feedFilterTag===t?'active':''}" data-filter-tag="${t}">${label}</button>`;
    }).join('');
    filterHtml = `<div class="card" style="padding:10px 12px;">
      <div style="font-size:10.5px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">🎬 Highlight Reel</div>
      <div class="tag-row" style="margin:0;">${filterChips}</div>
    </div>`;
  }

  const visiblePosts = withAutoPostFilter(feedFilterTag==='all' ? feedPosts : feedPosts.filter(p=>(p.tags||[]).includes(feedFilterTag)));
  const posts = visiblePosts.length===0
    ? `<div class="card"><div class="empty">${feedFilterTag!=='all' ? `No posts tagged #${feedFilterTag} yet.` : !showAutoPosts && feedPosts.length ? 'Nothing posted by people yet. Be the first to share a shot of the day.' : 'No posts yet. Be the first to share a shot of the day.'}</div></div>`
    : `<div class="card">${visiblePosts.slice().reverse().map(renderPost).join('')}</div>`;
  // Current year's feed sits under its own collapsible header, styled like
  // the past-year sections below it
  const feedYear = (window.storage.currentYear && window.storage.currentYear()) || TOURNAMENT_YEAR;
  const shownCount = withAutoPostFilter(feedPosts).length;
  const countLabel = shownCount ? `<span class="past-feed-count"> · ${shownCount} post${shownCount===1?'':'s'}</span>` : '';
  const currentHead = `<div class="card past-feed current-feed ${currentFeedOpen ? 'open' : ''}">
    <button class="past-feed-head" data-current-feed type="button">
      <span>${feedYear} Tournament Feed${countLabel}</span><span class="feed-toggle-circle" aria-hidden="true">${currentFeedOpen ? '−' : '+'}</span>
    </button></div>`;
  const autoToggle = `<div class="feed-auto-toggle" role="group" aria-label="Which posts to show">
    <button type="button" data-auto-posts="show" class="${showAutoPosts ? 'active' : ''}" aria-pressed="${showAutoPosts}">See All Posts</button>
    <button type="button" data-auto-posts="hide" class="${showAutoPosts ? '' : 'active'}" aria-pressed="${!showAutoPosts}">Hide Auto Posts</button>
  </div>`;
  return adminAutoPostPanel + autoToggle + currentHead + (currentFeedOpen ? composer + filterHtml + posts : '') + renderPastFeeds();
}
function renderPost(post){
  const heartIcon = post.likedByMe
    ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1.8" style="vertical-align:-3px;"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg>`
    : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" style="vertical-align:-3px;"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg>`;
  const tagsHtml = (post.tags&&post.tags.length) ? `<div class="post-tags">${post.tags.map(t=>`<span class="post-tag">#${escapeHtml(t)}</span>`).join('')}</div>` : '';
  const comments = post.comments || [];
  const expanded = !!expandedComments[post.id];
  const canManagePost = isAdminSession || post.name === myName;
  const isEditingPost = editingPostId === post.id;

  const commentRows = comments.map(c=>{
    const canManageComment = isAdminSession || c.name === myName;
    if(editingCommentId === c.id){
      return `<div class="comment-row">
        <div class="comment-edit-box">
          <input type="text" class="comment-edit-input" value="${escapeHtml(c.text)}" maxlength="300">
          <button class="comment-send" data-save-comment="${c.id}" data-comment-post="${post.id}">Save</button>
          <button class="comment-send" data-cancel-comment-edit="1">Cancel</button>
        </div>
      </div>`;
    }
    return `<div class="comment-row">
      <span class="comment-name">${escapeHtml(c.name)}</span>
      <span class="comment-text">${escapeHtml(c.text)}</span>
      ${canManageComment ? `<span class="comment-manage">
        <button class="comment-manage-btn" data-edit-comment-btn="${c.id}">Edit</button>
        <button class="comment-manage-btn danger" data-delete-comment="${c.id}" data-comment-post="${post.id}">Delete</button>
      </span>` : ''}
    </div>`;
  }).join('');

  const commentsSection = expanded ? `
    <div class="comments-section">
      ${commentRows || `<div class="comments-empty">No replies yet.</div>`}
      <div class="comment-compose">
        <input type="text" class="comment-input" data-comment-post="${post.id}" placeholder="Write a reply..." maxlength="300">
        <button class="comment-send" data-comment-send="${post.id}">Send</button>
      </div>
    </div>` : '';

  const textBlock = isEditingPost
    ? `<div class="post-edit-box">
        <textarea class="post-edit-input" maxlength="500">${escapeHtml(post.text||'')}</textarea>
        <div class="post-edit-actions">
          <button class="tiny-btn" data-save-post="${post.id}">Save</button>
          <button class="tiny-btn" data-cancel-post-edit="1">Cancel</button>
        </div>
      </div>`
    : (post.text ? `<div class="post-text">${escapeHtml(post.text)}</div>` : '');

  const manageHtml = (canManagePost && !isEditingPost) ? `
    <button class="post-manage-btn" data-edit-post-btn="${post.id}">Edit</button>
    <button class="post-manage-btn danger" data-delete-post="${post.id}">Delete</button>` : '';

  const avatarHtml = post.system
    ? (botIconUrl
        ? `<div class="avatar avatar-bot"><img src="${botIconUrl}" alt="The Joey" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>`
        : `<div class="avatar avatar-bot">⛳</div>`)
    : `<div class="avatar">${initials(post.name)}</div>`;
  const nameHtml = post.system
    ? `<div class="post-name post-name-bot">${escapeHtml(post.name)} <span class="bot-tag">AUTO</span></div>`
    : `<div class="post-name">${escapeHtml(post.name)}</div>`;

  return `
    <div class="post ${post.system?'post-system':''}">
      <div class="post-head">
        ${avatarHtml}
        <div>
          ${nameHtml}
          <div class="post-time">${timeAgo(post.time)}</div>
        </div>
      </div>
      ${textBlock}
      ${post.video ? `<video class="post-img" src="${post.video}" controls playsinline></video>` : (post.img ? `<img class="post-img" src="${post.img}" data-lightbox="${post.img}">` : '')}
      ${tagsHtml}
      <div class="post-actions">
        <button class="post-like ${post.likedByMe?'liked':''}" data-like="${post.id}">${heartIcon} ${post.likes||0}</button>
        <button class="post-comment-toggle" data-toggle-comments="${post.id}">💬 ${comments.length || ''} ${comments.length===1?'Reply':'Replies'}</button>
        ${manageHtml}
      </div>
      ${commentsSection}
    </div>`;
}

/* ---------------------------------------------------------
   JOE / MEMORIAL
--------------------------------------------------------- */
function renderJoe(){
  const photoHtml = memorialPhoto
    ? `<img class="memorial-photo" src="${memorialPhoto}" data-lightbox="${memorialPhoto}">`
    : isAdminSession
      ? `<label class="memorial-photo" style="display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;cursor:pointer;">
          Add a photo of Joe
          <input type="file" accept="image/*" id="memPhotoInput" style="display:none;">
         </label>`
      : `<div class="memorial-photo" style="display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;">Remembering Joe</div>`;

  const champRows = champions.length
    ? champions.map((c,i)=>({c,i})).sort((a,b)=>b.c.year-a.c.year).map(({c,i})=>`<div class="champ-row"><span class="champ-year">${escapeHtml(c.year)}</span><span class="champ-name">${escapeHtml(c.name)}</span>${isAdminSession ? `<span class="champ-actions"><button class="tiny-btn" type="button" data-edit-champ="${i}">Edit</button><button class="tiny-btn champ-del" type="button" data-del-champ="${i}">Delete</button></span>` : ''}</div>`).join('')
    : `<div class="empty" style="padding:10px 0;">No champions recorded yet.</div>`;

  const tributeHtml = tributePosts.length===0
    ? `<div class="empty">No tributes yet — share a memory below.</div>`
    : tributePosts.slice().reverse().map(renderPost).join('');

  // first paragraph of the story is the serif lead; the rest reads quieter below a gold rule
  const bioParas = String(memorialBio||'').split(/\n+/).map(t=>t.trim()).filter(Boolean);
  const bioHtml = bioParas.map((t,i)=>`<p class="${i===0?'bio-lead':'bio-more'}">${escapeHtml(t)}</p>`).join('');
  const LAUREL = '<svg class="joe-laurel" viewBox="0 0 80 80" aria-hidden="true"><path d="M14 72 C30 52 46 34 70 10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><g fill="currentColor"><ellipse cx="26" cy="54" rx="9" ry="3.6" transform="rotate(-70 26 54)"/><ellipse cx="34" cy="60" rx="9" ry="3.6" transform="rotate(-5 34 60)"/><ellipse cx="36" cy="40" rx="9" ry="3.6" transform="rotate(-70 36 40)"/><ellipse cx="45" cy="46" rx="9" ry="3.6" transform="rotate(-5 45 46)"/><ellipse cx="47" cy="27" rx="9" ry="3.6" transform="rotate(-70 47 27)"/><ellipse cx="56" cy="33" rx="9" ry="3.6" transform="rotate(-5 56 33)"/><ellipse cx="60" cy="16" rx="8" ry="3.2" transform="rotate(-60 60 16)"/></g></svg>';

  return `
    <div class="joe-sheet">
    <section class="joe-section">
      ${photoHtml}
      ${(isAdminSession && memorialPhoto) ? `<button class="tiny-btn" id="changeMemPhoto">Change photo</button>` : ''}
      <div class="joe-title" id="memorialTitleText">${escapeHtml(memorialTitle)}</div>
      <div class="memorial-bio" id="bioText">${bioHtml}</div>
      ${isAdminSession ? `<button class="tiny-btn" id="editBioBtn" style="margin-top:8px;">Edit this page</button>` : ''}
    </section>

    <section class="joe-section">
      ${LAUREL}
      <div class="joe-sec-head">
        <span class="joe-sec-ico joe-sec-cup">${TROPHY_CUP_SVG}</span>
        <div><div class="joe-sec-title">Champions</div><div class="joe-sec-sub">The names on the trophy, year by year.</div></div>
      </div>
      <div class="champ-list">${champRows}</div>
      ${isAdminSession ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center;">
        <button class="btn secondary small" id="addChampBtn">+ Add champion</button>
        ${viewingPastYear() ? '' : `<button class="btn gold small" id="declareChampionBtn">🏆 Declare This Year's Champions</button>`}
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
        ${trophyIconUrl ? `<img src="${trophyIconUrl}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;border:1px solid var(--line);">` : ''}
        <button class="tiny-btn" id="setTrophyIconBtn">${trophyIconUrl ? 'Change' : 'Upload'} trophy image</button>
        <input type="file" accept="image/*" id="trophyIconInput" style="display:none;">
      </div>` : ''}
    </section>

    <section class="joe-section">
      <div class="joe-sec-head">
        <div><div class="joe-sec-title">Tribute Wall</div></div>
      </div>
      <div class="composer">
        <textarea id="tributeText" placeholder="Share a Story, Picture or just say Hello..."></textarea>
        <div class="composer-row">
          <button type="button" class="file-btn" id="tributeMediaBtn">📷 Add Photo/Video</button>
          <input type="file" accept="image/*" capture="environment" id="tributePhotoCaptureInput" style="display:none;">
          <input type="file" accept="video/*" capture="environment" id="tributeVideoCaptureInput" style="display:none;">
          <input type="file" accept="image/*,video/*" id="tributeUploadInput" style="display:none;">
          <button class="btn post-btn" id="tributePostBtn" ${tributePosting?'disabled':''}>${tributePosting?'Posting…':'Post <span aria-hidden="true">›</span>'}</button>
        </div>
        <div id="tributeImgPreviewWrap"></div>
      </div>
      <div style="margin-top:12px;">${tributeHtml}</div>
    </section>
    </div>
  `;
}

/* ---------------------------------------------------------
   IMAGE HANDLING (resize to keep storage small)
--------------------------------------------------------- */
function resizeImage(file, maxW=900, quality=0.72){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const scale = Math.min(1, maxW/img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width*scale;
        canvas.height = img.height*scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------
   UTIL
--------------------------------------------------------- */
/* ---------------------------------------------------------
   HOLE RETICLES
   Straight-line "as the crow flies" distances from a single
   tee/green calibration point per hole. Default marker layout
   is shared (part of hole setup); anything a player drags,
   adds, or removes during play is personal and never saved --
   it resets to the shared default the moment they leave the
   hole or refresh.
--------------------------------------------------------- */
function fracDist(x1,y1,x2,y2){
  return Math.sqrt(Math.pow(x2-x1,2) + Math.pow(y2-y1,2));
}

function yardsForSegment(h, x1,y1,x2,y2){
  if(!h.calib) return 0;
  const total = fracDist(h.calib.teeX,h.calib.teeY,h.calib.greenX,h.calib.greenY);
  if(total===0) return 0;
  const yardsPerFrac = h.yards / total;
  return Math.round(fracDist(x1,y1,x2,y2) * yardsPerFrac);
}

function generateDefaultReticles(h){
  // Used only as a starting-point SEED when an admin begins placing default
  // markers during calibration -- not the final answer. The admin drags,
  // adds, and removes from here to set the real default distances/angles.
  if(!h.calib) return [];
  if(h.par !== 4 && h.par !== 5) return [];
  const yards = h.yards;
  const GREEN_BUFFER = 12; // never seed a default marker this close to the green -- that's what the flag is for
  const MIN_GAP = 15;      // never seed two markers closer together than this
  const maxD = Math.max(0, yards - GREEN_BUFFER);
  const distances = [];

  const d1 = Math.min(220, maxD);
  if(d1 > MIN_GAP) distances.push(d1);

  if(distances.length){
    const d2 = Math.min(d1 + 175, maxD);
    if(d2 - d1 > MIN_GAP) distances.push(d2);

    if(h.par===5 && distances.length===2){
      const d3 = Math.min(d2 + 175, maxD);
      if(d3 - d2 > MIN_GAP) distances.push(d3);
    }
  }

  return distances.map(d=>{
    const t = Math.max(0, Math.min(1, d / yards));
    return {
      x: h.calib.teeX + t * (h.calib.greenX - h.calib.teeX),
      y: h.calib.teeY + t * (h.calib.greenY - h.calib.teeY)
    };
  });
}

// Returns the array that taps/drags/double-taps should read and write to:
// the admin's in-progress default-layout during calibration, or the
// player's own ephemeral session markers during normal play.
function activeReticleArray(h){
  if(calibrationMode && calibrationMode.holeNumber===h.number && calibrationMode.step==='reticles'){
    return calibrationMode.reticles;
  }
  if(!sessionReticles[h.number]){
    sessionReticles[h.number] = (h.reticles || []).map(r=>({x:r.x,y:r.y}));
  }
  return sessionReticles[h.number];
}

const TEE_ICON_SVG = `
  <svg viewBox="0 0 28 28" width="26" height="26">
    <line x1="14" y1="18" x2="14" y2="26" stroke="#B08D57" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="14" cy="11" r="8.5" fill="#fff" stroke="#1B2E22" stroke-width="1.4"/>
    <circle cx="11" cy="8" r="0.9" fill="#c9c9c9"/>
    <circle cx="16" cy="9" r="0.9" fill="#c9c9c9"/>
    <circle cx="13" cy="13" r="0.9" fill="#c9c9c9"/>
    <circle cx="17" cy="13" r="0.9" fill="#c9c9c9"/>
  </svg>`;

const GREEN_ICON_SVG = `
  <svg viewBox="0 0 28 28" width="27.6" height="27.6">
    <line x1="6" y1="28" x2="6" y2="4" stroke="#3A3A3A" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M6 4 L22.1 8.6 L6 13.2 Z" fill="#FFD166" stroke="#B08D2E" stroke-width="0.8"/>
  </svg>`;

const CROSSHAIR_SIZE = 43;
const CROSSHAIR_SVG = `
  <svg viewBox="0 0 100 100" width="${CROSSHAIR_SIZE}" height="${CROSSHAIR_SIZE}">
    <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width="3"/>
    <line x1="50" y1="8" x2="50" y2="32" stroke="#fff" stroke-width="3" stroke-linecap="square"/>
    <line x1="50" y1="68" x2="50" y2="92" stroke="#fff" stroke-width="3" stroke-linecap="square"/>
    <line x1="8" y1="50" x2="32" y2="50" stroke="#fff" stroke-width="3" stroke-linecap="square"/>
    <line x1="68" y1="50" x2="92" y2="50" stroke="#fff" stroke-width="3" stroke-linecap="square"/>
    <line x1="50" y1="41" x2="50" y2="59" stroke="#fff" stroke-width="3" stroke-linecap="square"/>
    <line x1="41" y1="50" x2="59" y2="50" stroke="#fff" stroke-width="3" stroke-linecap="square"/>
  </svg>`;

function renderReticleOverlay(h){
  if(!h.calib) return '';
  const rets = activeReticleArray(h);
  const ordered = rets.map((r,i)=>({x:r.x, y:r.y, origIndex:i}))
    .sort((a,b)=> fracDist(h.calib.teeX,h.calib.teeY,a.x,a.y) - fracDist(h.calib.teeX,h.calib.teeY,b.x,b.y));

  const points = [{x:h.calib.teeX,y:h.calib.teeY}, ...ordered, {x:h.calib.greenX,y:h.calib.greenY}];

  let lines = '', labels = '';
  for(let i=0;i<points.length-1;i++){
    const p1=points[i], p2=points[i+1];
    lines += `<line x1="${p1.x*100}" y1="${p1.y*100}" x2="${p2.x*100}" y2="${p2.y*100}" stroke="white" stroke-width="0.32" opacity="0.9"/>`;
    const labelX=(p1.x + (p2.x-p1.x)*0.67)*100, labelY=(p1.y + (p2.y-p1.y)*0.67)*100;
    const yds = yardsForSegment(h,p1.x,p1.y,p2.x,p2.y);
    labels += `<div class="reticle-label" style="left:${labelX}%;top:${labelY}%;">${yds}y</div>`;
  }

  const teeMarker = `<div class="reticle-icon reticle-icon-tee" style="left:${h.calib.teeX*100}%;top:${h.calib.teeY*100}%;">${TEE_ICON_SVG}</div>`;
  const greenMarker = `<div class="reticle-icon reticle-icon-green" style="left:${h.calib.greenX*100}%;top:${h.calib.greenY*100}%;">${GREEN_ICON_SVG}</div>`;

  const markers = ordered.map(r=>`<button class="reticle-marker" data-reticle-index="${r.origIndex}" style="left:${r.x*100}%;top:${r.y*100}%;">${CROSSHAIR_SVG}</button>`).join('');

  return `<svg class="reticle-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>
    <div class="reticle-labels">${labels}</div>
    ${teeMarker}
    ${greenMarker}
    ${markers}`;
}

function redrawReticleOverlay(h){
  const wrap = document.getElementById('reticleOverlayWrap');
  if(!wrap) return;
  wrap.innerHTML = renderReticleOverlay(h);
  wireReticleMarkers(h);
}

function wireReticleMarkers(h){
  document.querySelectorAll('.reticle-marker').forEach(el=>{
    el.addEventListener('pointerdown', (e)=>{
      e.stopPropagation();
      clearReticleDeleteAffordance();
      const arr = activeReticleArray(h);
      const index = parseInt(el.dataset.reticleIndex,10);
      const holePhotoFrame = document.getElementById('holePhotoFrame');

      const timer = setTimeout(()=>{
        reticleDrag = {holeNumber: h.number, index, moved:false};
        if(navigator.vibrate) navigator.vibrate(8);
      }, 450);

      const onMove = (ev)=>{
        if(!reticleDrag || reticleDrag.index !== index || !holePhotoFrame) return;
        reticleDrag.moved = true;
        const rect = holePhotoFrame.getBoundingClientRect();
        const fx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const fy = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
        arr[index] = {x:fx, y:fy};
        redrawReticleOverlay(h);
      };
      const onUp = ()=>{
        clearTimeout(timer);
        const wasLongPress = !!reticleDrag;
        reticleDrag = null;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if(wasLongPress){
          showReticleDeleteAffordance(h, index);
        }
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}

function showReticleDeleteAffordance(h, index){
  clearReticleDeleteAffordance();
  const arr = activeReticleArray(h);
  const pos = arr[index];
  const wrap = document.getElementById('reticleOverlayWrap');
  if(!pos || !wrap) return;

  const btn = document.createElement('button');
  btn.className = 'reticle-delete-x';
  btn.textContent = '×';
  btn.style.left = (pos.x*100) + '%';
  btn.style.top = (pos.y*100) + '%';
  btn.onclick = (e)=>{
    e.stopPropagation();
    arr.splice(index,1);
    clearReticleDeleteAffordance();
    playTick();
    redrawReticleOverlay(h);
  };
  wrap.appendChild(btn);

  reticleDeleteTimeout = setTimeout(()=>{
    btn.style.transition = 'opacity 400ms ease';
    btn.style.opacity = '0';
    setTimeout(()=>{ if(btn.parentNode) btn.parentNode.removeChild(btn); }, 420);
  }, 3000);
}

function clearReticleDeleteAffordance(){
  if(reticleDeleteTimeout){ clearTimeout(reticleDeleteTimeout); reticleDeleteTimeout = null; }
  document.querySelectorAll('.reticle-delete-x').forEach(b=>b.remove());
}

/* ---------------------------------------------------------
   SCORE UPDATE CONFIRMATION
   Tapping into a score box that already has a value asks
   before allowing edits, to guard against accidental overwrites.
   Empty boxes are untouched by this -- first entry never prompts.
--------------------------------------------------------- */
function showScoreUpdateConfirm(el){
  clearScoreUpdateConfirm();
  el.classList.add('score-input-pending');
  const rect = el.getBoundingClientRect();
  const bubble = document.createElement('div');
  bubble.id = 'scoreConfirmBubble';
  bubble.className = 'score-confirm-bubble';
  bubble.innerHTML = `
    <div class="score-confirm-text">Update score?</div>
    <div class="score-confirm-actions">
      <button class="score-confirm-yes">Yes</button>
      <button class="score-confirm-cancel">Cancel</button>
    </div>`;
  document.body.appendChild(bubble);

  const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  let left = rect.left + rect.width/2 - bw/2;
  left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
  let top = rect.top - bh - 10;
  let below = false;
  if(top < 8){ top = rect.bottom + 10; below = true; }
  bubble.style.left = (left + scrollX) + 'px';
  bubble.style.top = (top + scrollY) + 'px';
  bubble.classList.add(below ? 'arrow-below' : 'arrow-above');
  const arrowLeft = Math.max(10, Math.min(rect.left + rect.width/2 - left, bw - 10));
  bubble.style.setProperty('--arrow-left', arrowLeft + 'px');

  bubble.querySelector('.score-confirm-yes').onclick = (e)=>{
    e.stopPropagation();
    clearScoreUpdateConfirm();
    el.focus();
    el.select();
  };
  bubble.querySelector('.score-confirm-cancel').onclick = (e)=>{
    e.stopPropagation();
    clearScoreUpdateConfirm();
  };
  setTimeout(()=>{
    document.addEventListener('pointerdown', dismissScoreConfirmOutside);
  }, 0);
}

function dismissScoreConfirmOutside(e){
  const bubble = document.getElementById('scoreConfirmBubble');
  if(bubble && !bubble.contains(e.target)) clearScoreUpdateConfirm();
}

function clearScoreUpdateConfirm(){
  const bubble = document.getElementById('scoreConfirmBubble');
  if(bubble) bubble.remove();
  document.removeEventListener('pointerdown', dismissScoreConfirmOutside);
  document.querySelectorAll('.score-input-pending').forEach(e=>e.classList.remove('score-input-pending'));
}

/* ---------------------------------------------------------
   MEDIA SOURCE CHOOSER
   "Add photo/video" opens a small menu -- Camera (opens the
   device camera directly) or Upload (the normal file/gallery
   picker) -- rather than jumping straight to one or the other.
--------------------------------------------------------- */
function showMediaSourceMenu(anchorBtn, photoInput, videoInput, uploadInput){
  clearMediaSourceMenu();
  const rect = anchorBtn.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = 'mediaSourceMenu';
  menu.className = 'score-confirm-bubble media-source-menu';
  menu.style.position = 'fixed';   // coords below are viewport-based
  menu.innerHTML = `
    <button class="media-source-option" id="mediaSourceTakePhoto">📸 Take Photo</button>
    <button class="media-source-option" id="mediaSourceRecordVideo">🎥 Record Video</button>
    <button class="media-source-option" id="mediaSourceUpload">🖼 Upload</button>`;
  document.body.appendChild(menu);

  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = rect.left + rect.width/2 - mw/2;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  let top = rect.top - mh - 10;
  let below = false;
  if(top < 8){ top = rect.bottom + 10; below = true; }
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.classList.add(below ? 'arrow-below' : 'arrow-above');
  const arrowLeft = Math.max(10, Math.min(rect.left + rect.width/2 - left, mw - 10));
  menu.style.setProperty('--arrow-left', arrowLeft + 'px');

  document.getElementById('mediaSourceTakePhoto').onclick = (e)=>{
    e.stopPropagation();
    clearMediaSourceMenu();
    if(photoInput){ markCameraOpen(); photoInput.click(); }
  };
  document.getElementById('mediaSourceRecordVideo').onclick = (e)=>{
    e.stopPropagation();
    clearMediaSourceMenu();
    if(videoInput){ markCameraOpen(); videoInput.click(); };
  };
  document.getElementById('mediaSourceUpload').onclick = (e)=>{
    e.stopPropagation();
    clearMediaSourceMenu();
    if(uploadInput) uploadInput.click();
  };
  setTimeout(()=>{
    document.addEventListener('pointerdown', dismissMediaSourceMenuOutside);
  }, 0);
}

function dismissMediaSourceMenuOutside(e){
  const menu = document.getElementById('mediaSourceMenu');
  if(menu && !menu.contains(e.target)) clearMediaSourceMenu();
}

function clearMediaSourceMenu(){
  const menu = document.getElementById('mediaSourceMenu');
  if(menu) menu.remove();
  document.removeEventListener('pointerdown', dismissMediaSourceMenuOutside);
}

function goToHole(newIndex, direction, skipAnim){
  // if an admin is mid-way through placing default markers and swipes away
  // without tapping "Save defaults", auto-commit what they've placed so far
  // instead of silently discarding it and reverting to the formula seed
  if(calibrationMode && calibrationMode.step === 'reticles'){
    const beingCalibrated = holesConfig.find(hh=>hh.number===calibrationMode.holeNumber);
    if(beingCalibrated){
      beingCalibrated.reticles = calibrationMode.reticles.map(r=>({x:r.x,y:r.y}));
      saveHole(beingCalibrated);
    }
    calibrationMode = null;
  }
  // any dragged/added/removed reticles are a "check and forget" tool --
  // they reset to the shared default the moment you leave the hole
  const leavingHole = holesConfig[currentHoleIndex];
  if(leavingHole) delete sessionReticles[leavingHole.number];
  clearReticleDeleteAffordance();
  currentHoleIndex = ((newIndex % 18) + 18) % 18;
  holeSlideDir = skipAnim ? null : direction;
  playTick();
  render();
}

function playTick(){
  try{ if(navigator.vibrate) navigator.vibrate(4); }catch(e){}
  try{
    const ctx = window.__audioCtx || (window.__audioCtx = new (window.AudioContext||window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.08);
  }catch(e){}
}

function fireConfetti(){
  try{ if(navigator.vibrate) navigator.vibrate([15,40,15]); }catch(e){}
  const colors = ['#FFD166','#FFE29A','#12261E','#3C6B54','#F5F3EC'];
  for(let i=0;i<30;i++){
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = (Math.random()*100) + 'vw';
    el.style.background = colors[Math.floor(Math.random()*colors.length)];
    el.style.animationDelay = (Math.random()*0.25) + 's';
    el.style.animationDuration = (0.9 + Math.random()*0.6) + 's';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 1900);
  }
  showToast('🦅 Eagle! Great shot.');
}

function fireBirdieCelebration(){
  try{ if(navigator.vibrate) navigator.vibrate(15); }catch(e){}
  const colors = ['#C0392B','#FFD166','#FFE29A'];
  for(let i=0;i<16;i++){
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = (Math.random()*100) + 'vw';
    el.style.background = colors[Math.floor(Math.random()*colors.length)];
    el.style.animationDelay = (Math.random()*0.2) + 's';
    el.style.animationDuration = (0.7 + Math.random()*0.4) + 's';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 1500);
  }
  showToast('🐦 Birdie!');
}

function fireSnowmanAnimation(){
  try{ if(navigator.vibrate) navigator.vibrate(15); }catch(e){}
  const flakes = ['❄️','❅','❆'];
  for(let i=0;i<22;i++){
    const el = document.createElement('div');
    el.className = 'snow-piece';
    el.textContent = flakes[Math.floor(Math.random()*flakes.length)];
    el.style.left = (Math.random()*100) + 'vw';
    el.style.fontSize = (12 + Math.random()*14) + 'px';
    el.style.setProperty('--drift', ((Math.random()*60)-30) + 'px');
    el.style.animationDelay = (Math.random()*0.4) + 's';
    el.style.animationDuration = (2 + Math.random()*1.2) + 's';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 3800);
  }
  showToast('⛄ Snowman!');
}

function escapeHtml(str){
  if(str===undefined || str===null) return '';
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

/* ---------------------------------------------------------
   HANDLERS
--------------------------------------------------------- */
let pendingFeedFile = null;
let pendingFeedIsVideo = false;
let pendingTributeFile = null;
let pendingFeedPreviewHtml = '', pendingTributePreviewHtml = '';
let pendingTributeIsVideo = false;

/* ---------------------------------------------------------
   UNSENT MEDIA DRAFTS
   A photo taken from inside the app is NOT saved to the phone's
   gallery, so if the upload fails or the app resets, it's gone.
   Keep a copy on this device (IndexedDB) from the moment it's
   attached until the post succeeds; restore it on next open.
--------------------------------------------------------- */
const MEDIA_DRAFT_MAX_AGE = 3*24*60*60*1000;   // drop drafts older than 3 days
const MEDIA_DRAFT_MAX_VIDEO = 60*1024*1024;    // skip storing huge videos
function draftDb(){
  return new Promise((res, rej)=>{
    const r = indexedDB.open('joey-drafts', 1);
    r.onupgradeneeded = ()=> r.result.createObjectStore('media');
    r.onsuccess = ()=> res(r.result);
    r.onerror = ()=> rej(r.error);
  });
}
async function saveMediaDraft(kind, file, isVideo){
  try{
    if(isVideo && file.size > MEDIA_DRAFT_MAX_VIDEO) return;
    const db = await draftDb();
    await new Promise((res, rej)=>{
      const tx = db.transaction('media', 'readwrite');
      tx.objectStore('media').put({blob:file, type:file.type, name:file.name||'', isVideo, savedAt:Date.now()}, kind);
      tx.oncomplete = res; tx.onerror = ()=> rej(tx.error);
    });
  }catch(e){ console.warn('draft save failed', e); }
}
async function loadMediaDraft(kind){
  try{
    const db = await draftDb();
    return await new Promise(res=>{
      const r = db.transaction('media').objectStore('media').get(kind);
      r.onsuccess = ()=> res(r.result || null);
      r.onerror = ()=> res(null);
    });
  }catch(e){ return null; }
}
async function clearMediaDraft(kind){
  try{
    const db = await draftDb();
    await new Promise(res=>{
      const tx = db.transaction('media', 'readwrite');
      tx.objectStore('media').delete(kind);
      tx.oncomplete = res; tx.onerror = res;
    });
  }catch(e){}
}

// Camera hand-off: remember when the in-app camera was opened, so we
// don't auto-reload for an update the moment it hands back, and so we
// can explain it if the phone closed the app while the camera was up.
const CAMERA_FLAG_KEY = 'joey-camera-open';
let cameraOpenedAt = 0;
function markCameraOpen(){
  cameraOpenedAt = Date.now();
  try{ devStore.setItem(CAMERA_FLAG_KEY, String(cameraOpenedAt)); }catch(e){}
}
function clearCameraFlag(){
  try{ devStore.removeItem(CAMERA_FLAG_KEY); }catch(e){}
}
function cameraRecentlyOpened(){ return Date.now() - cameraOpenedAt < 2*60*1000; }
document.addEventListener('visibilitychange', ()=>{
  // back from the camera and the app survived: drop the flag shortly after
  if(document.visibilityState === 'visible' && cameraOpenedAt) setTimeout(clearCameraFlag, 4000);
});

// Attach a photo/video to the Feed or Tribute composer (also used to
// restore a saved draft). Builds the small preview and saves the draft.
async function attachPendingMedia(f, kind, restored){
  if(!f) return;
  clearCameraFlag();
  const isVideo = (f.type || '').startsWith('video/');
  const previewWrapId = kind==='feed' ? 'feedImgPreviewWrap' : 'tributeImgPreviewWrap';
  if(kind==='feed'){ pendingFeedFile = f; pendingFeedIsVideo = isVideo; }
  else { pendingTributeFile = f; pendingTributeIsVideo = isVideo; }
  if(!restored) saveMediaDraft(kind, f, isVideo);
  const removeBtn = `<button class="tiny-btn" type="button" data-remove-media="${kind}">✕ Remove ${isVideo?'video':'photo'}</button>`;
  let html;
  if(isVideo){
    if(!restored && f.size > 60*1024*1024) showToast("That's a big video — upload may take a while on course wifi");
    html = `<video src="${URL.createObjectURL(f)}" controls playsinline style="width:100%;border-radius:8px;margin-top:6px;"></video>`;
  } else {
    html = `<img src="${await resizeImage(f, 500, 0.6)}" style="width:100%;border-radius:8px;margin-top:6px;">`;
  }
  html += removeBtn;
  if(kind==='feed') pendingFeedPreviewHtml = html; else pendingTributePreviewHtml = html;
  const w = document.getElementById(previewWrapId); if(w) w.innerHTML = html;
}
document.addEventListener('click', (e)=>{
  const b = e.target.closest && e.target.closest('[data-remove-media]');
  if(!b) return;
  const kind = b.dataset.removeMedia;
  if(kind==='feed'){ pendingFeedFile = null; pendingFeedIsVideo = false; pendingFeedPreviewHtml = ''; }
  else { pendingTributeFile = null; pendingTributeIsVideo = false; pendingTributePreviewHtml = ''; }
  const w = document.getElementById(kind==='feed' ? 'feedImgPreviewWrap' : 'tributeImgPreviewWrap');
  if(w) w.innerHTML = '';
  clearMediaDraft(kind);
});
async function restoreMediaDrafts(){
  let restored = [];
  for(const kind of ['feed','tribute']){
    const d = await loadMediaDraft(kind);
    if(!d || !d.blob) continue;
    if(Date.now() - (d.savedAt||0) > MEDIA_DRAFT_MAX_AGE){ clearMediaDraft(kind); continue; }
    if(kind==='feed' ? pendingFeedFile : pendingTributeFile) continue;
    const f = (d.blob instanceof File) ? d.blob : new File([d.blob], d.name || (d.isVideo?'video':'photo'), {type: d.type || d.blob.type});
    await attachPendingMedia(f, kind, true);
    restored.push((d.isVideo ? 'video' : 'photo') + (kind==='feed' ? ' on the Feed' : ' on the Tribute Wall'));
  }
  let cameraTs = 0;
  try{ cameraTs = parseInt(devStore.getItem(CAMERA_FLAG_KEY) || '0', 10); }catch(e){}
  clearCameraFlag();
  if(restored.length){
    render();
    showToast('Unsent ' + restored.join(' and ') + ' restored. Tap Post to send it.', 6000);
  } else if(cameraTs && Date.now() - cameraTs < 10*60*1000){
    showToast("Your phone closed the app while the camera was open, so that photo didn't come through. Tip: take it with your camera app, then use Add Photo/Video → Upload.", 9000);
  }
}

/* ---------------------------------------------------------
   PHOTO HOSTING (Cloudinary)
   window.storage caps out at 20MB total, which a season of
   20 people posting photos would blow through fast. So photos
   go to Cloudinary instead; we only store the returned URL
   (a short string) in window.storage.
--------------------------------------------------------- */
const CLOUDINARY_CLOUD_NAME = 'kp3eoza3';
const CLOUDINARY_UPLOAD_PRESET = 'TheJoey';

// Give up on a stuck upload (weak course signal) instead of hanging forever.
async function fetchWithTimeout(url, opts, ms){
  const ctl = new AbortController();
  const timer = setTimeout(()=>ctl.abort(), ms);
  try{ return await fetch(url, {...opts, signal: ctl.signal}); }
  finally{ clearTimeout(timer); }
}
async function uploadPhoto(file, maxW=1280, quality=0.8){
  const dataUrl = await resizeImage(file, maxW, quality);
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  // client-generated unique id so same-named phone photos (IMG_1234.jpg) never collide
  form.append('public_id', 'joey-' + uid() + '-' + Date.now());
  const res = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form
  }, 45000);
  if(!res.ok) throw new Error('Cloudinary upload failed: '+res.status);
  const data = await res.json();
  return data.secure_url;
}

async function uploadVideo(file){
  // no client-side compression for video -- uploaded as-is
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('public_id', 'joey-' + uid() + '-' + Date.now());
  const res = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
    method: 'POST',
    body: form
  }, 180000);
  if(!res.ok) throw new Error('Cloudinary video upload failed: '+res.status);
  const data = await res.json();
  return data.secure_url;
}

function attachHandlers(){
  // scorecard mode switch
  document.querySelectorAll('[data-mode]').forEach(el=>{
    el.onclick = ()=>{ scorecardMode = el.dataset.mode; render(); };
  });

  // score entry: group filter + team select
  document.querySelectorAll('[data-group-filter]').forEach(el=>{
    el.onclick = ()=>{ scoreboardGroupFilter = el.dataset.groupFilter; render(); };
  });
  document.querySelectorAll('[data-select-team]').forEach(el=>{
    el.onclick = ()=>{ scoreboardSelectedTeam = el.dataset.selectTeam; render(); };
  });
  document.querySelectorAll('.score-input').forEach(el=>{
    el.addEventListener('pointerdown', (e)=>{
      if(el.value && el.value.trim() !== ''){
        e.preventDefault();
        showScoreUpdateConfirm(el);
      }
    });
    el.onchange = async ()=>{
      const hole = el.dataset.hole, tid = el.dataset.team;
      const val = parseInt(el.value,10);
      const holeNum = parseInt(hole,10);
      if(val && val>0){
        const s = scores[tid] || {};
        const order = playOrder(teams.find(t=>t.id===tid));
        const idx = order.findIndex(h=>h.number===holeNum);
        const missingEarlier = order.slice(0, idx).some(h => !s[h.number]);
        if(missingEarlier){
          showToast('Please input preceding hole score(s)');
          el.value = (scores[tid] && scores[tid][hole]) ? scores[tid][hole] : '';
          return;
        }
      }
      const standingsBefore = computeStandings();
      if(!scores[tid]) scores[tid] = {};
      if(val && val>0) scores[tid][hole] = val; else delete scores[tid][hole];
      saveHoleScore(tid, hole);
      playTick();
      const h = holesConfig.find(h=>h.number===parseInt(hole,10));
      if(h && val){
        const cls = scoreClass(val, h.par);
        if(cls==='eagle') fireConfetti();
        else if(cls==='birdie') fireBirdieCelebration();
        else if(val===h.par) showToast('Nice Par!');
        if(val===8) fireSnowmanAnimation();
        await maybePostScoreEvent(tid, holeNum, val, standingsBefore);
      }
      // preserve horizontal scroll position of the Front/Back Nine tables --
      // re-rendering after a score entry shouldn't jump the view back to hole 1
      const scrollPositions = Array.from(document.querySelectorAll('.pcard-scroll')).map(el=>el.scrollLeft);
      render();
      requestAnimationFrame(()=>{
        document.querySelectorAll('.pcard-scroll').forEach((el,i)=>{
          if(scrollPositions[i] !== undefined) el.scrollLeft = scrollPositions[i];
        });
      });
    };
  });
  document.querySelectorAll('[data-quick-score]').forEach(el=>{
    el.onclick = async ()=>{
      const val = parseInt(el.dataset.quickScore,10);
      const hole = el.dataset.quickHole, tid = el.dataset.quickTeam;
      const holeNum = parseInt(hole,10);
      const h = holesConfig.find(hh=>hh.number===holeNum);

      const currentVal = scores[tid] && scores[tid][hole];
      if(currentVal === val){
        // Re-tapping the already-selected score deselects it -- same result as pressing Clear.
        if(quickUndoState && quickUndoState.hole===holeNum && quickUndoState.teamId===tid){
          clearTimeout(quickUndoState.timeoutId);
          if(quickUndoState.previousVal){
            scores[tid][hole] = quickUndoState.previousVal;
          } else {
            delete scores[tid][hole];
          }
          quickUndoState = null;
        } else {
          delete scores[tid][hole];
        }
        saveHoleScore(tid, hole);
        pendingQuickEntry = null;
        showToast('Cleared');
        render();
        return;
      }

      let previousVal, standingsBefore;
      if(quickUndoState && quickUndoState.hole===holeNum && quickUndoState.teamId===tid){
        // already mid-undo-window for this hole -- keep the ORIGINAL prior value
        // and pre-tap standings, not whatever was just overwritten a moment ago
        previousVal = quickUndoState.previousVal;
        standingsBefore = quickUndoState.standingsBefore;
        clearTimeout(quickUndoState.timeoutId);
      } else {
        previousVal = (scores[tid] && scores[tid][hole]) || null;
        standingsBefore = computeStandings();
      }

      if(!scores[tid]) scores[tid] = {};
      scores[tid][hole] = val;
      saveHoleScore(tid, hole);
      playTick();
      if(h){
        const cls = scoreClass(val, h.par);
        if(cls==='eagle') fireConfetti();
        else if(cls==='birdie') fireBirdieCelebration();
        else if(val===h.par) showToast('Nice Par!');
        if(val===8) fireSnowmanAnimation();
      }

      // The auto feed post waits out the 4s undo grace period so an accidental
      // tap that gets corrected never generates a post.
      const timeoutId = setTimeout(async ()=>{
        quickUndoState = null;
        await maybePostScoreEvent(tid, holeNum, val, standingsBefore);
        render(); // the grace period is over -- advance to the next hole
      }, 4000);
      quickUndoState = {hole: holeNum, teamId: tid, previousVal, standingsBefore, timeoutId};
      pendingQuickEntry = {hole: holeNum, val};
      render();
    };
  });
  document.querySelectorAll('[data-quick-save-hole]').forEach(el=>{
    el.onclick = async ()=>{
      const hole = parseInt(el.dataset.quickSaveHole,10), tid = el.dataset.quickSaveTeam;
      if(!quickUndoState || quickUndoState.hole !== hole || quickUndoState.teamId !== tid){
        showToast('Tap a score first');
        return;
      }
      clearTimeout(quickUndoState.timeoutId);
      if(quickUndoState.previousVal){
        scores[tid][hole] = quickUndoState.previousVal;
      } else {
        delete scores[tid][hole];
      }
      saveHoleScore(tid, hole);
      quickUndoState = null;
      pendingQuickEntry = null;
      showToast('Undone');
      render();
    };
  });
  document.querySelectorAll('[data-review-hole]').forEach(el=>{
    el.onclick = ()=>{
      const holeNum = parseInt(el.dataset.reviewHole,10);
      const idx = holesConfig.findIndex(h=>h.number===holeNum);
      if(idx<0) return;
      currentHoleIndex = idx;
      switchTab('holes');
    };
  });

  // team & group management
  const askPlayers = (existing)=>{
    const raw = prompt("Player names, separated by commas (2-3 players):", existing ? existing.join(', ') : '');
    if(raw===null) return null;
    const names = raw.split(',').map(s=>s.trim()).filter(Boolean);
    if(names.length<2 || names.length>3){ alert('Please enter 2 or 3 player names.'); return undefined; }
    return names;
  };

  document.getElementById('addGroupBtn') && (document.getElementById('addGroupBtn').onclick = async ()=>{
    const label = prompt("Group name:", `Group ${groups.length+1}`);
    if(!label || !label.trim()) return;
    const teeTime = prompt("Tee time (optional):", '') || '';
    const startHole = parseInt(prompt("Starting hole:", '1'),10) || 1;
    groups.push({id: uid(), label: label.trim(), teeTime: teeTime.trim(), startHole});
    await save('groups', JSON.stringify(groups), true);
    render();
    showToast('Group added');
  });

  document.querySelectorAll('[data-edit-group]').forEach(el=>{
    el.onclick = async ()=>{
      const g = groups.find(g=>g.id===el.dataset.editGroup);
      if(!g) return;
      const label = prompt("Group name:", g.label);
      if(label===null || !label.trim()) return;
      const teeTime = prompt("Tee time:", g.teeTime||'');
      if(teeTime===null) return;
      const startIn = prompt("Starting hole:", String(g.startHole||1));
      if(startIn===null) return;
      g.label = label.trim(); g.teeTime = teeTime.trim();
      g.startHole = parseInt(startIn,10) || 1;
      await save('groups', JSON.stringify(groups), true);
      render();
    };
  });
  document.querySelectorAll('[data-remove-group]').forEach(el=>{
    el.onclick = async ()=>{
      if(!confirm('Remove this group? Its teams will become unassigned.')) return;
      const gid = el.dataset.removeGroup;
      groups = groups.filter(g=>g.id!==gid);
      teams.forEach(t=>{ if(t.groupId===gid) t.groupId = null; });
      await save('groups', JSON.stringify(groups), true);
      await save('teams', JSON.stringify(teams), true);
      render();
      showToast('Group removed');
    };
  });

  document.querySelectorAll('[data-add-team-to]').forEach(el=>{
    el.onclick = async ()=>{
      const players = askPlayers();
      if(!players || players===undefined) return;
      const t = {id: uid(), label: nextTeamLabel(), groupId: el.dataset.addTeamTo, players};
      teams.push(t);
      scoreboardSelectedTeam = t.id;
      await save('teams', JSON.stringify(teams), true);
      render();
      showToast(`Team ${t.label} added`);
    };
  });
  const addUnassignedTeamBtn = document.getElementById('addUnassignedTeamBtn');
  if(addUnassignedTeamBtn) addUnassignedTeamBtn.onclick = async ()=>{
    const players = askPlayers();
    if(!players || players===undefined) return;
    const t = {id: uid(), label: nextTeamLabel(), groupId: null, players};
    teams.push(t);
    scoreboardSelectedTeam = t.id;
    await save('teams', JSON.stringify(teams), true);
    render();
    showToast(`Team ${t.label} added`);
  };
  document.querySelectorAll('[data-edit-team]').forEach(el=>{
    el.onclick = async ()=>{
      const t = teams.find(t=>t.id===el.dataset.editTeam);
      if(!t) return;
      const players = askPlayers(t.players);
      if(players===null || players===undefined) return;
      t.players = players;
      await save('teams', JSON.stringify(teams), true);
      render();
      showToast('Team updated');
    };
  });
  document.querySelectorAll('[data-remove-team]').forEach(el=>{
    el.onclick = async ()=>{
      if(!confirm('Remove this team? Its scores will be deleted.')) return;
      const tid = el.dataset.removeTeam;
      teams = teams.filter(t=>t.id!==tid);
      delete scores[tid];
      if(scoreboardSelectedTeam===tid) scoreboardSelectedTeam = null;
      await save('teams', JSON.stringify(teams), true);
      await deleteTeamScore(tid);
      render();
      showToast('Team removed');
    };
  });

  // holes tab
  const prevHole = document.getElementById('prevHole');
  const nextHole = document.getElementById('nextHole');
  if(prevHole) prevHole.onclick = ()=>{ goToHole(currentHoleIndex-1, 'right'); };
  if(nextHole) nextHole.onclick = ()=>{ goToHole(currentHoleIndex+1, 'left'); };
  document.querySelectorAll('[data-goto-hole]').forEach(el=>{
    el.onclick = ()=>{ goToHole(parseInt(el.dataset.gotoHole,10), null); };
  });
  // hole calibration + reticle interaction
  const holePhotoFrame = document.getElementById('holePhotoFrame');
  if(holePhotoFrame){
    holePhotoFrame.addEventListener('click', async (e)=>{
      if(e.target.closest('.reticle-marker')) return; // handled separately below
      const h = holesConfig.find(hh=>hh.number===parseInt(holePhotoFrame.dataset.holeFrame,10));
      if(!h) return;
      const rect = holePhotoFrame.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      if(calibrationMode && calibrationMode.holeNumber === h.number){
        if(calibrationMode.step === 'tee'){
          h.calib = {teeX: fx, teeY: fy, greenX: fx, greenY: fy};
          calibrationMode.step = 'green';
          render();
        } else if(calibrationMode.step === 'green'){
          h.calib.greenX = fx;
          h.calib.greenY = fy;
          // seed with the formula as a starting point -- admin freely
          // adds/drags/removes from here to set the real defaults
          calibrationMode.reticles = generateDefaultReticles(h);
          calibrationMode.step = 'reticles';
          render();
        } else if(calibrationMode.step === 'reticles'){
          if(calibrationMode.reticles.length >= 5) return;
          calibrationMode.reticles.push({x:fx, y:fy});
          playTick();
          redrawReticleOverlay(h);
        }
        return;
      }

      if(!h.calib) return; // no adding markers until calibrated
      const arr = activeReticleArray(h);
      if(arr.length >= 5) return;
      arr.push({x:fx, y:fy});
      playTick();
      redrawReticleOverlay(h);
    });
  }

  const calibrateHoleBtn = document.getElementById('calibrateHoleBtn');
  if(calibrateHoleBtn) calibrateHoleBtn.onclick = ()=>{
    const h = holesConfig[currentHoleIndex];
    calibrationMode = {holeNumber: h.number, step: 'tee', reticles: []};
    render();
  };

  const calibDoneBtn = document.getElementById('calibDoneBtn');
  if(calibDoneBtn) calibDoneBtn.onclick = async ()=>{
    const h = holesConfig[currentHoleIndex];
    h.reticles = calibrationMode.reticles.map(r=>({x:r.x,y:r.y}));
    calibrationMode = null;
    delete sessionReticles[h.number]; // pick up the fresh default next time it's viewed
    await saveHole(h);
    showToast('Default markers saved');
    render();
  };

  const calibCancelBtn = document.getElementById('calibCancelBtn');
  if(calibCancelBtn) calibCancelBtn.onclick = ()=>{
    calibrationMode = null;
    render();
  };

  if(holePhotoFrame){
    const hForMarkers = holesConfig.find(hh=>hh.number===parseInt(holePhotoFrame.dataset.holeFrame,10));
    if(hForMarkers) wireReticleMarkers(hForMarkers);
  }
  document.querySelectorAll('[data-set-contest]').forEach(el=>{
    el.onclick = async ()=>{
      const holeNum = el.dataset.setContest;
      const existing = contests[holeNum] || {};
      const winner = prompt("Current Leader:", existing.winner || '');
      if(winner===null || !winner.trim()) return;
      const distance = prompt("Distance (optional, e.g. 4' 2\" or 285 yds):", existing.distance || '') || '';
      const changed = winner.trim() !== (existing.winner||'');
      contests[holeNum] = {winner: winner.trim(), distance: distance.trim(), finalized: false};
      await save('contests', JSON.stringify(contests), true);
      render();
      showToast('Contest updated');
      if(changed){
        const h = holesConfig.find(hh=>hh.number===parseInt(holeNum,10));
        const label = h ? (h.contestName || (h.contestType==='ctp' ? 'Closest to the Pin' : 'Longest Drive')) : 'the contest';
        await addSystemPost(contestFlavorLine(label, 'leader', winner.trim(), {holeNumber: holeNum, distance: distance.trim()}));
      }
    };
  });
  document.querySelectorAll('[data-declare-contest]').forEach(el=>{
    el.onclick = async ()=>{
      const holeNum = el.dataset.declareContest;
      const c = contests[holeNum];
      if(!c || !c.winner) return;
      if(!confirm(`Declare ${c.winner} the winner? This posts to the feed.`)) return;
      c.finalized = true;
      await save('contests', JSON.stringify(contests), true);
      render();
      const h = holesConfig.find(hh=>hh.number===parseInt(holeNum,10));
      const label = h ? (h.contestName || (h.contestType==='ctp' ? 'Closest to the Pin' : 'Longest Drive')) : 'the contest';
      await addSystemPost(contestFlavorLine(label, 'winner', c.winner, {holeNumber: holeNum, distance: c.distance}));
      showToast('Winner declared');
    };
  });
  document.querySelectorAll('[data-reopen-contest]').forEach(el=>{
    el.onclick = async ()=>{
      const holeNum = el.dataset.reopenContest;
      const c = contests[holeNum];
      if(!c) return;
      c.finalized = false;
      await save('contests', JSON.stringify(contests), true);
      render();
      showToast('Contest reopened');
    };
  });
  document.querySelectorAll('[data-toggle-extra-menu]').forEach(el=>{
    el.onclick = (e)=>{
      e.stopPropagation();
      const id = el.dataset.toggleExtraMenu;
      document.querySelectorAll('.extra-contest-menu').forEach(m=>{
        m.style.display = (m.id === `extraMenu-${id}` && m.style.display==='none') ? 'block' : 'none';
      });
    };
  });
  document.querySelectorAll('.extra-contest-menu').forEach(m=>{
    m.onclick = (e)=>e.stopPropagation();
  });
  document.addEventListener('click', ()=>{
    document.querySelectorAll('.extra-contest-menu').forEach(m=>m.style.display='none');
  }, {once:true});
  document.querySelectorAll('[data-set-extra-contest]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.dataset.setExtraContest;
      const ec = extraContests.find(x=>x.id===id);
      if(!ec) return;
      const winner = prompt("Current Leader:", ec.winner||'');
      if(winner===null || !winner.trim()) return;
      const distance = prompt("Distance or score (optional):", ec.distance||'') || '';
      const changed = winner.trim() !== (ec.winner||'');
      ec.winner = winner.trim();
      ec.distance = distance.trim();
      ec.finalized = false;
      await save('extra-contests', JSON.stringify(extraContests), true);
      render();
      showToast('Contest updated');
      if(changed){
        await addSystemPost(contestFlavorLine(ec.name, 'leader', ec.winner, {distance: ec.distance}));
      }
    };
  });
  document.querySelectorAll('[data-declare-extra-contest]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.dataset.declareExtraContest;
      const ec = extraContests.find(x=>x.id===id);
      if(!ec || !ec.winner) return;
      if(!confirm(`Declare ${ec.winner} the winner? This posts to the feed.`)) return;
      ec.finalized = true;
      await save('extra-contests', JSON.stringify(extraContests), true);
      render();
      await addSystemPost(contestFlavorLine(ec.name, 'winner', ec.winner, {distance: ec.distance}));
      showToast('Winner declared');
    };
  });
  document.querySelectorAll('[data-reopen-extra-contest]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.dataset.reopenExtraContest;
      const ec = extraContests.find(x=>x.id===id);
      if(!ec) return;
      ec.finalized = false;
      await save('extra-contests', JSON.stringify(extraContests), true);
      render();
      showToast('Contest reopened');
    };
  });
  document.querySelectorAll('[data-edit-extra-contest]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.dataset.editExtraContest;
      const ec = extraContests.find(x=>x.id===id);
      if(!ec) return;
      const name = prompt("Contest name:", ec.name||'');
      if(name===null || !name.trim()) return;
      const location = prompt("Where is it held? (optional):", ec.location||'') || '';
      ec.name = name.trim();
      ec.location = location.trim();
      await save('extra-contests', JSON.stringify(extraContests), true);
      render();
      showToast('Contest updated');
    };
  });
  document.querySelectorAll('[data-remove-extra-contest]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.dataset.removeExtraContest;
      const ec = extraContests.find(x=>x.id===id);
      if(!ec) return;
      if(!confirm(`Remove "${ec.name}"? This can't be undone.`)) return;
      extraContests = extraContests.filter(x=>x.id!==id);
      await save('extra-contests', JSON.stringify(extraContests), true);
      render();
      showToast('Contest removed');
    };
  });
  const addExtraContestBtn = document.getElementById('addExtraContestBtn');
  if(addExtraContestBtn) addExtraContestBtn.onclick = async ()=>{
    const name = prompt("Contest name (e.g. 'The Golden Boy'):");
    if(name===null || !name.trim()) return;
    const location = prompt("Where is it held? (optional, e.g. 'Practice Green'):") || '';
    extraContests.push({id: uid(), name: name.trim(), location: location.trim(), winner:'', distance:'', finalized:false});
    await save('extra-contests', JSON.stringify(extraContests), true);
    render();
    showToast('Contest added');
  };
  const toggleContestLockBtn = document.getElementById('toggleContestLockBtn');
  if(toggleContestLockBtn) toggleContestLockBtn.onclick = async ()=>{
    contestsLocked = !contestsLocked;
    await save('contests-locked', contestsLocked ? 'true' : 'false', true);
    render();
    showToast(contestsLocked ? 'Winners locked to admin only' : 'Players can now set winners');
  };
  const editHoleBtn = document.getElementById('editHoleBtn');
  if(editHoleBtn) editHoleBtn.onclick = async ()=>{
    const h = holesConfig[currentHoleIndex];
    const par = prompt("Par:", h.par); if(par===null) return;
    const yards = prompt("Yards:", h.yards); if(yards===null) return;
    const handicap = prompt("Handicap (1-18):", h.handicap!==undefined?h.handicap:''); if(handicap===null) return;
    const desc = prompt("Hole description:", h.description); if(desc===null) return;
    const existingContestName = h.contestName || (h.contestType==='ctp' ? 'Closest to the Pin' : h.contestType==='longdrive' ? 'Longest Drive' : '');
    const contestInput = prompt("Side contest name on this hole (leave blank for none):", existingContestName);
    if(contestInput===null) return;
    h.par = parseInt(par,10)||h.par;
    h.yards = parseInt(yards,10)||h.yards;
    h.handicap = parseInt(handicap,10) || h.handicap;
    h.description = desc;
    h.contestName = contestInput.trim() || null;
    h.contestType = null;
    await saveHole(h);
    render();
    showToast('Hole updated');
  };
  document.querySelectorAll('.hole-photo-input').forEach(el=>{
    el.onchange = async (e)=>{
      const f = e.target.files[0]; if(!f) return;
      const holeNum = parseInt(el.dataset.holePhoto,10);
      showToast('Uploading photo…');
      try{
        const url = await uploadPhoto(f, 1280, 0.8);
        const h = holesConfig.find(h=>h.number===holeNum);
        if(h){
          h.photo = url;
          await saveHole(h);
          render();
          showToast('Photo added');
        }
      }catch(err){
        console.error(err);
        showToast("Couldn't upload photo — check connection and try again");
      }
    };
  });

  // feed
  document.querySelectorAll('[data-toggle-tag]').forEach(el=>{
    el.onclick = ()=>{
      const t = el.dataset.toggleTag;
      pendingFeedTags = pendingFeedTags.includes(t) ? pendingFeedTags.filter(x=>x!==t) : [...pendingFeedTags, t];
      render();
    };
  });
  document.querySelectorAll('[data-filter-tag]').forEach(el=>{
    el.onclick = ()=>{ feedFilterTag = el.dataset.filterTag; render(); };
  });
  const handleMediaFileSelected = (f, kind)=> attachPendingMedia(f, kind, false);

  function wireMediaButton(btnId, photoInputId, videoInputId, uploadInputId, kind){
    const btn = document.getElementById(btnId);
    const photoInput = document.getElementById(photoInputId);
    const videoInput = document.getElementById(videoInputId);
    const uploadInput = document.getElementById(uploadInputId);
    if(photoInput) photoInput.onchange = (e)=>{ handleMediaFileSelected(e.target.files[0], kind); e.target.value=''; };
    if(videoInput) videoInput.onchange = (e)=>{ handleMediaFileSelected(e.target.files[0], kind); e.target.value=''; };
    if(uploadInput) uploadInput.onchange = (e)=>{ handleMediaFileSelected(e.target.files[0], kind); e.target.value=''; };
    if(btn) btn.onclick = ()=>showMediaSourceMenu(btn, photoInput, videoInput, uploadInput);
  }
  const toggleBirdiePostsBtn = document.getElementById('toggleBirdiePostsBtn');
  if(toggleBirdiePostsBtn) toggleBirdiePostsBtn.onclick = async ()=>{
    autoPostSettings.birdiesOn = !autoPostSettings.birdiesOn;
    await save('auto-post-settings', JSON.stringify(autoPostSettings), true);
    render();
    showToast(autoPostSettings.birdiesOn ? 'Birdie posts on' : 'Birdie posts off');
  };
  const toggleBogeyPostsBtn = document.getElementById('toggleBogeyPostsBtn');
  if(toggleBogeyPostsBtn) toggleBogeyPostsBtn.onclick = async ()=>{
    autoPostSettings.bogeysOn = !autoPostSettings.bogeysOn;
    await save('auto-post-settings', JSON.stringify(autoPostSettings), true);
    render();
    showToast(autoPostSettings.bogeysOn ? 'Bogey posts on' : 'Bogey posts off');
  };
  const setBotIconBtn = document.getElementById('setBotIconBtn');
  const botIconInput = document.getElementById('botIconInput');
  if(setBotIconBtn && botIconInput) setBotIconBtn.onclick = ()=> botIconInput.click();
  if(botIconInput) botIconInput.onchange = async (e)=>{
    const f = e.target.files[0];
    e.target.value = '';
    if(!f) return;
    showToast('Uploading icon…');
    try{
      const url = await uploadPhoto(f, 200, 0.85);
      botIconUrl = url;
      await save('bot-icon-url', url, true);
      render();
      showToast('Bot icon updated');
    }catch(err){
      console.error(err);
      showToast("Couldn't upload icon — try again");
    }
  };
  const setTrophyIconBtn = document.getElementById('setTrophyIconBtn');
  const trophyIconInput = document.getElementById('trophyIconInput');
  if(setTrophyIconBtn && trophyIconInput) setTrophyIconBtn.onclick = ()=> trophyIconInput.click();
  if(trophyIconInput) trophyIconInput.onchange = async (e)=>{
    const f = e.target.files[0];
    e.target.value = '';
    if(!f) return;
    showToast('Uploading trophy image…');
    try{
      const url = await uploadPhoto(f, 400, 0.85);
      trophyIconUrl = url;
      await save('trophy-icon-url', url, true);
      render();
      showToast('Trophy image updated');
    }catch(err){
      console.error(err);
      showToast("Couldn't upload image — try again");
    }
  };
  wireMediaButton('feedMediaBtn', 'feedPhotoCaptureInput', 'feedVideoCaptureInput', 'feedUploadInput', 'feed');
  wireMediaButton('tributeMediaBtn', 'tributePhotoCaptureInput', 'tributeVideoCaptureInput', 'tributeUploadInput', 'tribute');

  const feedPostBtn = document.getElementById('feedPostBtn');
  if(feedPostBtn) feedPostBtn.onclick = async ()=>{
    // one post at a time: a second tap while a photo is still uploading
    // (slow on course signal) used to create a duplicate post
    if(feedPosting) return;
    const text = document.getElementById('feedText').value.trim();
    if(!text && !pendingFeedFile){ showToast('Write something or add a photo/video'); return; }
    if(!myName){ document.getElementById('nameGate').style.display='flex'; return; }
    feedPosting = true;
    const setBtn = (busy)=>{ const b = document.getElementById('feedPostBtn'); if(b){ b.disabled = busy; if(busy) b.textContent = 'Posting…'; else b.innerHTML = 'Post <span aria-hidden="true">›</span>'; } };
    setBtn(true);
    try{
    let imgUrl = null, videoUrl = null;
    if(pendingFeedFile){
      showToast(pendingFeedIsVideo ? 'Uploading video…' : 'Uploading photo…');
      try{
        if(pendingFeedIsVideo){
          videoUrl = await uploadVideo(pendingFeedFile);
        } else {
          imgUrl = await uploadPhoto(pendingFeedFile, 1280, 0.8);
        }
      }catch(err){
        console.error(err);
        showToast(`Couldn't upload — weak signal? Your ${pendingFeedIsVideo?'video':'photo'} is still attached. Tap Post to try again.`, 6000);
        return;
      }
    }
    const newPost = {id:uid(), name:myName, text, img:imgUrl, video:videoUrl, tags:[...pendingFeedTags], time:Date.now(), likes:0, likedByMe:false, comments:[]};
    feedPosts.push(newPost);
    pendingFeedFile = null;
    pendingFeedPreviewHtml = '';
    pendingFeedIsVideo = false;
    pendingFeedTags = [];
    document.getElementById('feedImgPreviewWrap').innerHTML = '';
    document.getElementById('feedText').value = '';
    await savePost(newPost, 'feed-post:');
    clearMediaDraft('feed');
    }finally{ feedPosting = false; setBtn(false); }
    render();
  };

  // tribute
  const tributePostBtn = document.getElementById('tributePostBtn');
  if(tributePostBtn) tributePostBtn.onclick = async ()=>{
    // one post at a time: a second tap while a photo is still uploading
    // (slow on course signal) used to create a duplicate post
    if(tributePosting) return;
    const text = document.getElementById('tributeText').value.trim();
    if(!text && !pendingTributeFile){ showToast('Write something or add a photo/video'); return; }
    if(!myName){ document.getElementById('nameGate').style.display='flex'; return; }
    tributePosting = true;
    const setBtn = (busy)=>{ const b = document.getElementById('tributePostBtn'); if(b){ b.disabled = busy; if(busy) b.textContent = 'Posting…'; else b.innerHTML = 'Post <span aria-hidden="true">›</span>'; } };
    setBtn(true);
    try{
    let imgUrl = null, videoUrl = null;
    if(pendingTributeFile){
      showToast(pendingTributeIsVideo ? 'Uploading video…' : 'Uploading photo…');
      try{
        if(pendingTributeIsVideo){
          videoUrl = await uploadVideo(pendingTributeFile);
        } else {
          imgUrl = await uploadPhoto(pendingTributeFile, 1280, 0.8);
        }
      }catch(err){
        console.error(err);
        showToast(`Couldn't upload — weak signal? Your ${pendingTributeIsVideo?'video':'photo'} is still attached. Tap Post to try again.`, 6000);
        return;
      }
    }
    const newTribute = {id:uid(), name:myName, text, img:imgUrl, video:videoUrl, time:Date.now(), likes:0, likedByMe:false, comments:[]};
    tributePosts.push(newTribute);
    pendingTributeFile = null;
    pendingTributeIsVideo = false;
    pendingTributePreviewHtml = '';
    document.getElementById('tributeImgPreviewWrap').innerHTML = '';
    document.getElementById('tributeText').value = '';
    await savePost(newTribute, 'tribute-post:');
    clearMediaDraft('tribute');
    }finally{ tributePosting = false; setBtn(false); }
    render();
  };

  document.querySelectorAll('[data-like]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.dataset.like;
      const loc = locatePost(id);
      if(!loc) return;
      const post = loc.post;
      post.likedBy = post.likedBy || {};
      if(post.likedBy[DEVICE_ID]) delete post.likedBy[DEVICE_ID]; else post.likedBy[DEVICE_ID] = true;
      refreshLikeFields(post);
      render();
      await saveLike(post, loc.prefix);
    };
  });

  document.querySelectorAll('[data-toggle-comments]').forEach(el=>{
    el.onclick = ()=>{
      const id = el.dataset.toggleComments;
      expandedComments[id] = !expandedComments[id];
      render();
    };
  });

  document.querySelectorAll('[data-toggle-lb-row]').forEach(el=>{
    el.onclick = ()=>{
      const id = el.dataset.toggleLbRow;
      expandedLbRows[id] = !expandedLbRows[id];
      render();
    };
  });

  async function submitComment(postId){
    const input = document.querySelector(`.comment-input[data-comment-post="${postId}"]`);
    if(!input) return;
    const text = input.value.trim();
    if(!text) return;
    if(!myName){ document.getElementById('nameGate').style.display='flex'; return; }
    const loc = locatePost(postId);
    if(!loc) return;
    const post = loc.post;
    if(!post.comments) post.comments = [];
    const newComment = {id:uid(), name:myName, text, time:Date.now()};
    post.comments.push(newComment);
    await saveComment(post, loc.prefix, newComment);
    expandedComments[postId] = true; // keep the thread open after replying
    render();
  }

  document.querySelectorAll('[data-comment-send]').forEach(el=>{
    el.onclick = ()=>submitComment(el.dataset.commentSend);
  });
  document.querySelectorAll('.comment-input').forEach(el=>{
    el.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){
        e.preventDefault();
        submitComment(el.dataset.commentPost);
      }
    });
  });

  // post edit / delete (own posts, or any post if admin)
  document.querySelectorAll('[data-edit-post-btn]').forEach(el=>{
    el.onclick = ()=>{ editingPostId = el.dataset.editPostBtn; render(); };
  });
  document.querySelectorAll('[data-cancel-post-edit]').forEach(el=>{
    el.onclick = ()=>{ editingPostId = null; render(); };
  });
  document.querySelectorAll('[data-save-post]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.dataset.savePost;
      const box = el.closest('.post-edit-box');
      const input = box ? box.querySelector('.post-edit-input') : null;
      if(!input) return;
      const loc = locatePost(id);
      if(!loc) return;
      const post = loc.post;
      post.text = input.value.trim();
      await savePost(post, loc.prefix);
      editingPostId = null;
      render();
    };
  });
  document.querySelectorAll('[data-delete-post]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.dataset.deletePost;
      if(!confirm('Delete this post? This can\'t be undone.')) return;
      const loc = locatePost(id);
      if(!loc) return;
      if(loc.list === 'feed') feedPosts = feedPosts.filter(p=>p.id!==id);
      else if(loc.list === 'tribute') tributePosts = tributePosts.filter(p=>p.id!==id);
      else pastFeeds[loc.year].posts = pastFeeds[loc.year].posts.filter(p=>p.id!==id);
      await deletePost(id, loc.prefix);
      render();
    };
  });

  // comment edit / delete (own replies, or any reply if admin)
  document.querySelectorAll('[data-edit-comment-btn]').forEach(el=>{
    el.onclick = ()=>{ editingCommentId = el.dataset.editCommentBtn; render(); };
  });
  document.querySelectorAll('[data-cancel-comment-edit]').forEach(el=>{
    el.onclick = ()=>{ editingCommentId = null; render(); };
  });
  document.querySelectorAll('[data-save-comment]').forEach(el=>{
    el.onclick = async ()=>{
      const commentId = el.dataset.saveComment;
      const postId = el.dataset.commentPost;
      const box = el.closest('.comment-edit-box');
      const input = box ? box.querySelector('.comment-edit-input') : null;
      if(!input) return;
      const text = input.value.trim();
      if(!text) return;
      const loc = locatePost(postId);
      if(!loc) return;
      const post = loc.post;
      const comment = (post.comments||[]).find(c=>c.id===commentId);
      if(!comment) return;
      comment.text = text;
      await saveComment(post, loc.prefix, comment);
      editingCommentId = null;
      render();
    };
  });
  document.querySelectorAll('[data-delete-comment]').forEach(el=>{
    el.onclick = async ()=>{
      const commentId = el.dataset.deleteComment;
      const postId = el.dataset.commentPost;
      if(!confirm('Delete this reply?')) return;
      const loc = locatePost(postId);
      if(!loc) return;
      const post = loc.post;
      post.comments = (post.comments||[]).filter(c=>c.id!==commentId);
      await removeComment(post, loc.prefix, commentId);
      render();
    };
  });

  // memorial
  const memPhotoInput = document.getElementById('memPhotoInput');
  if(memPhotoInput) memPhotoInput.onchange = async (e)=>{
    const f = e.target.files[0]; if(!f) return;
    showToast('Uploading photo…');
    try{
      memorialPhoto = await uploadPhoto(f, 1000, 0.85);
      await save('memorial-photo', memorialPhoto, true);
      render();
      showToast('Photo added');
    }catch(err){
      console.error(err);
      showToast("Couldn't upload photo — check connection and try again");
    }
  };
  const changeMemPhoto = document.getElementById('changeMemPhoto');
  if(changeMemPhoto) changeMemPhoto.onclick = ()=>{
    memorialPhoto = null; render();
  };
  const editBioBtn = document.getElementById('editBioBtn');
  if(editBioBtn) editBioBtn.onclick = async ()=>{
    const bio = document.getElementById('bioText');
    const title = document.getElementById('memorialTitleText');
    if(bio.getAttribute('contenteditable')==='true'){
      memorialBio = bio.innerText.split(/\n+/).map(t=>t.trim()).filter(Boolean).join('\n');
      memorialTitle = (title && title.innerText.trim()) || 'Remembering Joe';
      bio.setAttribute('contenteditable','false');
      if(title){ title.setAttribute('contenteditable','false'); title.classList.remove('editing'); }
      bio.classList.remove('editing');
      editBioBtn.textContent = 'Edit this page';
      await Promise.all([
        save('memorial-bio', memorialBio, true),
        save('memorial-title', memorialTitle, true),
      ]);
      render();
      showToast('Saved');
    } else {
      if(title){ title.setAttribute('contenteditable','true'); title.classList.add('editing'); }
      bio.setAttribute('contenteditable','true');
      bio.classList.add('editing');
      (title || bio).focus();
      editBioBtn.textContent = 'Save changes';
    }
  };
  const addChampBtn = document.getElementById('addChampBtn');
  if(addChampBtn) addChampBtn.onclick = async ()=>{
    const year = prompt("Year:", new Date().getFullYear());
    if(!year) return;
    const name = prompt("Champion's name:");
    if(!name) return;
    champions.push({year, name});
    await save('champions', JSON.stringify(champions), true);
    render();
    showToast('Champion added');
  };
  document.querySelectorAll('[data-edit-champ]').forEach(btn=>{
    btn.onclick = async ()=>{
      const c = champions[Number(btn.dataset.editChamp)];
      if(!c) return;
      const year = prompt('Year:', c.year);
      if(year===null || !String(year).trim()) return;
      const name = prompt("Champion's name:", c.name);
      if(name===null || !name.trim()) return;
      c.year = String(year).trim(); c.name = name.trim();
      await save('champions', JSON.stringify(champions), true);
      render();
      showToast('Champion updated');
    };
  });
  document.querySelectorAll('[data-del-champ]').forEach(btn=>{
    btn.onclick = async ()=>{
      const idx = Number(btn.dataset.delChamp);
      const c = champions[idx];
      if(!c) return;
      if(!confirm(`Delete "${c.year} \u2013 ${c.name}" from the Champions list?`)) return;
      champions.splice(idx, 1);
      await save('champions', JSON.stringify(champions), true);
      render();
      showToast('Champion deleted');
    };
  });
  const declareChampionBtn = document.getElementById('declareChampionBtn');
  if(declareChampionBtn) declareChampionBtn.onclick = async ()=>{
    if(!teams.length){ showToast('No teams to choose from'); return; }
    const list = teams.map(t=>`${t.label}: ${formatTeamName(t)}`).join('\n');
    const pick = prompt(`Which team won?\n\n${list}\n\nEnter the team letter/label:`);
    if(pick===null || !pick.trim()) return;
    const team = teams.find(t=>t.label.toLowerCase()===pick.trim().toLowerCase());
    if(!team){ showToast('No team matches that label'); return; }
    const teamName = formatTeamName(team);
    const year = TOURNAMENT_YEAR;
    if(!confirm(`Declare "${teamName}" as The Joey ${year} Champions? This posts to the feed and locks all scores.`)) return;
    champions.push({year, name: teamName});
    await save('champions', JSON.stringify(champions), true);
    scoresLocked = true;
    await save('scores-locked', 'true', true);
    render();
    await addSystemPost(`Congratulations to ${teamName} — The Joey ${year} Champions!`, {img: trophyIconUrl});
    showToast('Champions declared!');
  };
}

/* ---------------------------------------------------------
   BACKUP / RESTORE
--------------------------------------------------------- */
function currentStateSnapshot(){
  return {
    _type: 'joe-mccormick-memorial-backup',
    _version: 1,
    _savedAt: new Date().toISOString(),
    teams, groups, scores, holesConfig, contests, extraContests,
    feedPosts, tributePosts, memorialBio, memorialPhoto, champions, heroYearText,
    autoPostSettings, botIconUrl, trophyIconUrl, eventInfo, heroText, memorialTitle
  };
}
function exportBackup(){
  const data = JSON.stringify(currentStateSnapshot(), null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
  a.href = url;
  a.download = `the-joey-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Backup downloaded');
}
async function importBackup(file){
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    if(data._type !== 'joe-mccormick-memorial-backup'){
      alert("This doesn't look like a backup file from this app.");
      return;
    }
    if(!confirm('Restore this backup? It will replace everything currently on the page for everyone.')) return;
    teams = data.teams || [];
    groups = data.groups || [];
    scores = data.scores || {};
    holesConfig = data.holesConfig || defaultHoles();
    contests = data.contests || {};
    extraContests = data.extraContests || [];
    feedPosts = data.feedPosts || [];
    tributePosts = data.tributePosts || [];
    memorialBio = data.memorialBio || defaultBio();
    memorialPhoto = data.memorialPhoto || null;
    champions = data.champions || [];
    heroYearText = data.heroYearText || heroYearText;
    eventInfo = data.eventInfo || eventInfo;
    heroText = data.heroText || heroText;
    memorialTitle = data.memorialTitle || memorialTitle;
    autoPostSettings = data.autoPostSettings || {birdiesOn:true, bogeysOn:true};
    botIconUrl = data.botIconUrl || null;
    trophyIconUrl = data.trophyIconUrl || null;

    teamsLoadFailed = false; // a restore is a deliberate overwrite
    await Promise.all([
      save('teams', JSON.stringify(teams), true),
      save('groups', JSON.stringify(groups), true),
      ...Object.keys(scores).map(tid=>saveTeamScore(tid)),
      ...holesConfig.map(h=>saveHole(h)),
      save('contests', JSON.stringify(contests), true),
      save('extra-contests', JSON.stringify(extraContests), true),
      ...feedPosts.map(p=>savePost(p, 'feed-post:', true)),
      ...tributePosts.map(p=>savePost(p, 'tribute-post:', true)),
      save('memorial-bio', memorialBio, true),
      save('memorial-photo', memorialPhoto || '', true),
      save('champions', JSON.stringify(champions), true),
      save('hero-year', heroYearText, true),
      save('event-info', JSON.stringify(eventInfo), true),
      save('hero-text', JSON.stringify(heroText), true),
      save('memorial-title', memorialTitle, true),
      save('auto-post-settings', JSON.stringify(autoPostSettings), true),
      save('bot-icon-url', botIconUrl || '', true),
      save('trophy-icon-url', trophyIconUrl || '', true),
    ]);
    render();
    showToast('Backup restored');
  }catch(e){
    console.error(e);
    alert("Couldn't read that backup file. Make sure it's an unedited download from this app.");
  }
}

/* ---------------------------------------------------------
   TAB SWITCHING
--------------------------------------------------------- */
document.getElementById('tabbar').addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-tab]');
  if(!btn) return;
  switchTab(btn.dataset.tab);
});

const TAB_ORDER = ['scorecard','leaderboard','holes','feed','joe'];

function haptic(){
  if(navigator.vibrate){ navigator.vibrate(12); }
}

function switchTab(tab, skipAnim){
  if(tab === currentTab) return;
  if(currentTab === 'holes'){
    // if mid-calibration, auto-commit placed markers rather than losing them
    if(calibrationMode && calibrationMode.step === 'reticles'){
      const beingCalibrated = holesConfig.find(hh=>hh.number===calibrationMode.holeNumber);
      if(beingCalibrated){
        beingCalibrated.reticles = calibrationMode.reticles.map(r=>({x:r.x,y:r.y}));
        saveHole(beingCalibrated);
      }
      calibrationMode = null;
    }
    // leaving the Holes tab -- any live-dragged reticles reset to shared default
    sessionReticles = {};
  }
  if(currentTab === 'leaderboard'){
    expandedLbRows = {};
  }
  const oldIdx = TAB_ORDER.indexOf(currentTab);
  const newIdx = TAB_ORDER.indexOf(tab);
  tabSlideDir = skipAnim ? null : ((newIdx > oldIdx) ? 'left' : (newIdx < oldIdx ? 'right' : null));
  currentTab = tab;
  if(tab === 'feed' || tab === 'joe') refreshPosts();
  document.querySelectorAll('#tabbar button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  haptic();
  render();
  window.scrollTo(0,0);
  if(tab==='scorecard'){
    requestAnimationFrame(()=>{
      const holeNum = window.__scorecardCurrentHole;
      if(holeNum){
        const nine = holeNum<=9 ? 'front' : 'back';
        const localPos = holeNum<=9 ? holeNum : holeNum-9;
        if(localPos>=6){
          const el = document.querySelector(`.pcard-scroll[data-nine="${nine}"]`);
          if(el) el.scrollLeft = el.scrollWidth - el.clientWidth;
        }
      }
    });
  }
}

/* ---------------------------------------------------------
   INTERACTIVE DRAG-SWIPE TRANSITION
   Content follows the finger in real time (with edge resistance),
   previews the adjacent tab or hole underneath, and only commits
   to the switch once released past a threshold — otherwise it
   springs back to where it started. Excludes elements that
   scroll horizontally on their own (scorecard tables, chip rows).
   On the Holes tab, dragging over the hole image navigates
   between holes instead of switching tabs.
---------------------------------------------------------- */
(function(){
  const HSCROLL_SELECTOR = '.pcard-scroll, .group-filter, .player-select, .lb-expand-scroll';
  const HOLE_IMAGE_SELECTOR = '.hole-photo-frame';
  const COMMIT_PX = 90;
  const SETTLE_MS = 340;   // "slower" commit / spring-back duration
  const SETTLE_EASE = 'cubic-bezier(.22,.75,.35,1)';
  const HOLE_SETTLE_MS = 400;
  const HOLE_SETTLE_EASE = 'cubic-bezier(.33,.1,.2,1)'; // gentle ease-out, no overshoot

  const viewport = document.getElementById('swipeViewport');
  const track = document.getElementById('swipeTrack');
  const ghostPrev = document.getElementById('ghostPrev');
  const ghostNext = document.getElementById('ghostNext');

  let mode = null;       // 'tab' | 'hole' | null
  let dragging = false;
  let decided = false;   // has axis (horizontal vs vertical) been determined for this touch?
  let horizontal = false;
  let startX = 0, startY = 0, lastDx = 0;
  let canPrev = false, canNext = false;
  let width = 0;

  function isInsideHScroll(target){
    let el = target;
    while(el && el !== document.body){
      if(el.matches && el.matches(HSCROLL_SELECTOR) && el.scrollWidth > el.clientWidth + 1) return true;
      el = el.parentElement;
    }
    return false;
  }

  function tabPreviewHtml(tab){
    if(tab==='leaderboard') return renderLeaderboard();
    if(tab==='scorecard') return renderScorecard();
    if(tab==='holes') return renderHoles(currentHoleIndex);
    if(tab==='feed') return renderFeed();
    if(tab==='joe') return renderJoe();
    return '';
  }

  function beginDrag(target){
    width = viewport.clientWidth;
    mode = (currentTab==='holes' && target.closest && target.closest(HOLE_IMAGE_SELECTOR)) ? 'hole' : 'tab';

    if(mode==='hole'){
      canPrev = true; canNext = true; // holes wrap around
      ghostPrev.innerHTML = `<div class="tab-content">${renderHoles(((currentHoleIndex-1)%18+18)%18)}</div>`;
      ghostNext.innerHTML = `<div class="tab-content">${renderHoles((currentHoleIndex+1)%18)}</div>`;
    } else {
      const idx = TAB_ORDER.indexOf(currentTab);
      canPrev = idx > 0;
      canNext = idx < TAB_ORDER.length - 1;
      ghostPrev.innerHTML = canPrev ? `<div class="tab-content">${tabPreviewHtml(TAB_ORDER[idx-1])}</div>` : '';
      ghostNext.innerHTML = canNext ? `<div class="tab-content">${tabPreviewHtml(TAB_ORDER[idx+1])}</div>` : '';
    }
    track.style.transition = 'none';
  }

  function applyDrag(dx){
    // rubber-band resistance when dragging past an unavailable edge
    if(dx < 0 && !canNext) dx *= 0.3;
    if(dx > 0 && !canPrev) dx *= 0.3;
    lastDx = dx;
    track.style.transform = `translateX(${dx}px)`;
    ghostPrev.style.opacity = dx > 0 ? Math.min(0.55 + dx/width*0.45, 1) : 0.55;
    ghostNext.style.opacity = dx < 0 ? Math.min(0.55 + (-dx)/width*0.45, 1) : 0.55;
  }

  function settle(commit){
    const ms = mode==='hole' ? HOLE_SETTLE_MS : SETTLE_MS;
    const ease = mode==='hole' ? HOLE_SETTLE_EASE : SETTLE_EASE;
    track.style.transition = `transform ${ms}ms ${ease}`;
    if(commit === 'next'){
      track.style.transform = `translateX(${-width}px)`;
    } else if(commit === 'prev'){
      track.style.transform = `translateX(${width}px)`;
    } else {
      track.style.transform = 'translateX(0px)';
    }
    const onDone = ()=>{
      track.removeEventListener('transitionend', onDone);
      track.style.transition = 'none';
      track.style.transform = 'translateX(0px)';
      ghostPrev.innerHTML = ''; ghostNext.innerHTML = '';
      if(commit === 'next'){
        if(mode==='hole') goToHole(currentHoleIndex+1, null, true);
        else switchTab(TAB_ORDER[TAB_ORDER.indexOf(currentTab)+1], true);
      } else if(commit === 'prev'){
        if(mode==='hole') goToHole(currentHoleIndex-1, null, true);
        else switchTab(TAB_ORDER[TAB_ORDER.indexOf(currentTab)-1], true);
      }
      mode = null;
    };
    track.addEventListener('transitionend', onDone);
  }

  document.addEventListener('touchstart', (e)=>{
    if(e.touches.length !== 1) return;
    if(isInsideHScroll(e.target)){ dragging=false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = true;
    decided = false;
    horizontal = false;
  }, {passive:true});

  document.addEventListener('touchmove', (e)=>{
    if(!dragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if(!decided){
      if(Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      decided = true;
      horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if(horizontal) beginDrag(e.target);
    }
    if(!horizontal) return;
    applyDrag(dx);
  }, {passive:true});

  document.addEventListener('touchend', ()=>{
    if(!dragging) return;
    dragging = false;
    if(!horizontal || mode===null) return;
    if(lastDx <= -COMMIT_PX && canNext) settle('next');
    else if(lastDx >= COMMIT_PX && canPrev) settle('prev');
    else settle(null);
  }, {passive:true});
})();


/* ---------------------------------------------------------
   LIVE SYNC
   Scores are entered on many phones at once during the round.
   We poll for other people's updates on the score-focused tabs
   only (scorecard/leaderboard) so we never blow away someone's
   half-typed feed post or tribute by re-rendering under them.
--------------------------------------------------------- */
let syncInFlight = false;
async function refreshLiveData(silent, includeScores){
  if(syncInFlight) return;
  syncInFlight = true;
  try{
    const [tm, g, s, sl] = await Promise.all([
      window.storage.get('teams', true).catch(()=>null),
      window.storage.get('groups', true).catch(()=>null),
      (silent && !includeScores) ? Promise.resolve(null) : loadAllScores(false),
      window.storage.get('scores-locked', true).catch(()=>undefined),
    ]);
    if(sl !== undefined) scoresLocked = !!(sl && sl.value === 'true');
    if(tm) teams = JSON.parse(tm.value);
    if(g) groups = JSON.parse(g.value);
    if(s) scores = s;
    liveRender();
    if(!silent) showToast('Synced');
  }catch(e){
    console.error('sync failed', e);
  }finally{
    syncInFlight = false;
  }
}
// Scores arrive through the live listener (startScoreListener below).
// Teams/groups rarely change mid-round, so a slow poll is plenty.
setInterval(()=>{
  if(document.visibilityState !== 'visible') return;
  if(['scorecard','leaderboard'].includes(currentTab)) refreshLiveData(true);
}, 90000);

// Re-render for incoming data, but never under someone who is mid-typing.
let liveRenderDeferred = false;
function liveRender(){
  if(!['scorecard','leaderboard'].includes(currentTab)) return;
  const a = document.activeElement;
  if(a && (a.tagName==='INPUT' || a.tagName==='TEXTAREA')){
    if(!liveRenderDeferred){
      liveRenderDeferred = true;
      a.addEventListener('blur', ()=>{ liveRenderDeferred = false; setTimeout(liveRender, 50); }, {once:true});
    }
    return;
  }
  const scrollPositions = Array.from(document.querySelectorAll('.pcard-scroll, .lb-expand-scroll')).map(el=>el.scrollLeft);
  render();
  requestAnimationFrame(()=>{
    document.querySelectorAll('.pcard-scroll, .lb-expand-scroll').forEach((el,i)=>{
      if(scrollPositions[i] !== undefined) el.scrollLeft = scrollPositions[i];
    });
  });
}
function startScoreListener(){
  window.storage.scoreWatch(incoming=>{
    applyPendingScores(incoming);
    scores = incoming;
    liveRender();
  });
}
// re-sync immediately whenever the phone screen wakes back up
document.addEventListener('visibilitychange', ()=>{
  // Pull scores once on wake rather than waiting a few seconds for the
  // live listener to reconnect after the phone was locked.
  if(document.visibilityState === 'visible'){
    if(['feed','joe'].includes(currentTab)) refreshPosts();
    else refreshLiveData(true, true);
  }
});

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
/* ---------------------------------------------------------
   LIGHTBOX
   Tap-to-enlarge for any image marked with data-lightbox
   (feed posts, tribute wall posts, Joe's memorial photo).
--------------------------------------------------------- */
document.addEventListener('click', (e)=>{
  const target = e.target.closest('[data-lightbox]');
  if(target){
    document.getElementById('lightboxImg').src = target.dataset.lightbox;
    document.getElementById('lightbox').style.display = 'flex';
  }
});
document.getElementById('lightboxClose').onclick = ()=>{
  document.getElementById('lightbox').style.display = 'none';
};
document.getElementById('lightbox').addEventListener('click', (e)=>{
  if(e.target.id === 'lightbox'){ // tap the dark backdrop, not the image itself, to dismiss
    document.getElementById('lightbox').style.display = 'none';
  }
});

/* ---------------------------------------------------------
   APP UPDATES
   Asks GitHub Pages whether index.html has changed since this copy
   loaded (ETag / Last-Modified -- no version number to bump, no
   Firebase reads). Checks on open, on returning to the app, and every
   5 minutes while on screen.
   - Returning to the app with an update waiting: reloads quietly,
     unless the person has something half-typed or a score undo is
     pending -- then it shows the banner instead.
   - Update found mid-use: shows the banner; they tap when ready.
   Unsent scores are kept on the phone, so a reload never loses them.
--------------------------------------------------------- */
let appVersionTag = null;
let updateWaiting = false;
const AUTO_RELOAD_KEY = 'joey-last-auto-reload';
async function fetchVersionTag(){
  if(!/^https?:/.test(location.protocol)) return null;
  try{
    const res = await fetch(location.origin + location.pathname, {method:'HEAD', cache:'no-store'});
    if(!res.ok) return null;
    return res.headers.get('etag') || res.headers.get('last-modified');
  }catch(e){ return null; }
}
async function checkForUpdate(){
  const tag = await fetchVersionTag();
  if(!tag) return false;
  if(!appVersionTag){ appVersionTag = tag; return false; }
  if(tag !== appVersionTag){
    updateWaiting = true;
    showUpdateBanner();
  }
  return updateWaiting;
}
function safeToAutoReload(){
  // don't throw away anything half-typed
  const typed = Array.from(document.querySelectorAll('textarea, input[type="text"], input:not([type])'))
    .some(el => el.value && el.value.trim());
  if(typed) return false;
  if(pendingFeedFile || pendingTributeFile) return false;
  if(cameraRecentlyOpened()) return false;   // just back from the camera; file may not be attached yet
  if(typeof quickUndoState !== 'undefined' && quickUndoState) return false;
  // never auto-reload twice within 10 minutes (guards against a CDN
  // briefly serving mixed versions right after a push)
  try{
    const last = parseInt(sessionStorage.getItem(AUTO_RELOAD_KEY) || '0', 10);
    if(Date.now() - last < 10*60*1000) return false;
  }catch(e){}
  return true;
}
function reloadForUpdate(){
  try{ sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now())); }catch(e){}
  location.reload();
}
function showUpdateBanner(){
  let el = document.getElementById('updateBanner');
  if(!el){
    el = document.createElement('button');
    el.id = 'updateBanner'; el.className = 'update-banner'; el.type = 'button';
    el.textContent = '✨ Update available — tap to refresh';
    document.body.appendChild(el);
  }
  el.onclick = ()=>location.reload();
  el.style.display = 'block';
}
document.addEventListener('visibilitychange', async ()=>{
  if(document.visibilityState !== 'visible') return;
  if(await checkForUpdate() && safeToAutoReload()) reloadForUpdate();
});
setInterval(()=>{ if(document.visibilityState === 'visible') checkForUpdate(); }, 5*60*1000);
fetchVersionTag().then(tag=>{ if(tag && !appVersionTag) appVersionTag = tag; });

/* ---------------------------------------------------------
   GET APP -- Android/Chrome gets its native install prompt when the
   browser offers one; otherwise (iPhone, or Chrome not ready) a short
   step-by-step sheet for that phone.
--------------------------------------------------------- */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredInstallPrompt = e; });
window.addEventListener('appinstalled', ()=>{
  deferredInstallPrompt = null;
  document.body.classList.add('is-standalone');
  closeGetAppSheet();
  showToast('The Joey is on your home screen');
});
function closeGetAppSheet(){
  const el = document.getElementById('getAppSheet');
  if(el) el.remove();
}
function openGetAppSheet(){
  closeGetAppSheet();
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const iosSteps = `
    <li>Tap the <b>Share</b> button <span aria-hidden="true">⬆︎</span> (bottom of Safari, or top right in some browsers)</li>
    <li>Scroll down and tap <b>Add to Home Screen</b></li>
    <li>Tap <b>Add</b></li>`;
  const androidSteps = `
    <li>Tap Chrome's <b>⋮</b> menu (top right)</li>
    <li>Tap <b>Add to Home screen</b> or <b>Install app</b></li>
    <li>Tap <b>Install</b> or <b>Add</b></li>`;
  const steps = isIOS ? `<ol class="get-app-steps">${iosSteps}</ol>`
    : isAndroid ? `<ol class="get-app-steps">${androidSteps}</ol>`
    : `<p class="get-app-sub"><b>iPhone</b></p><ol class="get-app-steps">${iosSteps}</ol>
       <p class="get-app-sub"><b>Android</b></p><ol class="get-app-steps">${androidSteps}</ol>`;
  const wrap = document.createElement('div');
  wrap.className = 'get-app-sheet'; wrap.id = 'getAppSheet';
  wrap.innerHTML = `<div class="get-app-panel" role="dialog" aria-label="Add The Joey to your home screen">
    <h3>Add The Joey to your home screen</h3>
    <p class="get-app-sub">One tap from your home screen, full-screen like an app.</p>
    ${steps}
    ${isIOS ? `<p class="get-app-note">The first time you open it from the home screen, pick your name and team once more.</p>` : ''}
    <button class="btn block" id="getAppClose">Got it</button>
  </div>`;
  wrap.addEventListener('click', (e)=>{ if(e.target===wrap || e.target.id==='getAppClose') closeGetAppSheet(); });
  document.body.appendChild(wrap);
}
document.addEventListener('click', async (e)=>{
  if(!e.target.closest('.get-app-btn')) return;
  if(deferredInstallPrompt){
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;   // each prompt can only be used once
    try{
      promptEvent.prompt();
      await promptEvent.userChoice;
      return;
    }catch(err){ /* fall through to the instructions */ }
  }
  openGetAppSheet();
});

if(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone){
  document.body.classList.add('is-standalone');
}
/* ---------------------------------------------------------
   TOURNAMENT YEARS
   The current year comes from the app-config doc (see storage.js)
   and is what everyone sees on opening the app. Anyone can switch
   to look at a previous year for this session; that view is
   read-only for scores, teams and contests (feed likes and replies
   still work). Before the 2026 migration there is no config and the
   app behaves exactly like the old single-year app.
--------------------------------------------------------- */
function viewingPastYear(){
  return !!(window.storage && window.storage.viewingPast && window.storage.viewingPast());
}
// A year after the current one: the admin can set it up (teams, groups,
// event details, side contests), but nobody can enter scores yet.
function viewingUpcomingYear(){
  return viewingPastYear() && TOURNAMENT_YEAR > window.storage.currentYear();
}
function canAdminEditYear(){
  return isAdminSession && (!viewingPastYear() || viewingUpcomingYear());
}
function applyTournamentYear(){
  const y = window.storage.activeYear && window.storage.activeYear();
  if(y){
    TOURNAMENT_YEAR = y;
    heroYearText = `TOURNAMENT · ${y}`;   // a saved per-year hero-year overrides this in loadYearData()
  }
  const pill = document.getElementById('testModePill');
  if(pill) pill.style.display = window.storage.testMode ? '' : 'none';
  paintYearChrome();
}
// Header year label + "Viewing Previous Year" banner
function paintYearChrome(){
  const scYear = document.getElementById('scorecardYear');
  if(scYear) scYear.innerHTML = hasMultipleYears() ? yearSwitchChip() : '🚩 ' + TOURNAMENT_YEAR;
  const banner = document.getElementById('pastYearBanner');
  if(banner){
    // One navy banner, three states: previous year, upcoming year, or the
    // current year with final scores locked (scorecard + leaderboard only).
    const past = viewingPastYear();
    const locked = !past && scoresLocked && ['scorecard','leaderboard'].includes(currentTab);
    // the Joe tab shows the year in the event date instead of a banner
    // Joe shows the year in the event date; Feed always shows the current
    // year with past years below, so neither needs the banner
    banner.style.display = ((past && !['joe','feed'].includes(currentTab)) || locked) ? '' : 'none';
    const main = document.getElementById('pastYearMain');
    const sub = document.getElementById('pastYearSub');
    const back = document.getElementById('backToCurrentBtn');
    const unlock = document.getElementById('unlockScoresBtn');
    if(past){
      const upcoming = TOURNAMENT_YEAR > window.storage.currentYear();
      main.innerHTML = `Viewing ${upcoming ? 'Upcoming' : 'Previous'} Year: <b>${TOURNAMENT_YEAR}</b>`;
      sub.textContent = upcoming ? 'Upcoming Tournament (read-only)' : 'Final Results (read-only)';
      back.textContent = `Back to ${window.storage.currentYear()}`;
      back.style.display = ''; unlock.style.display = 'none';
    } else if(locked){
      main.textContent = `${TOURNAMENT_YEAR} Final Results`;
      sub.textContent = 'Scores Are Locked';
      back.style.display = 'none';
      unlock.style.display = isAdminSession ? '' : 'none';
    }
  }
  document.body.classList.toggle('viewing-past-year', viewingPastYear());
}
function hasMultipleYears(){
  return window.storage.yearMode && window.storage.yearMode() && window.storage.years().length > 1;
}
// Small tappable year chip used in headers when more than one year exists
function yearSwitchChip(){
  if(!hasMultipleYears()) return '';
  return `<button class="year-switch-chip" data-year-switch type="button" aria-label="Change tournament year">${TOURNAMENT_YEAR} ▾</button>`;
}
let yearSwitchInFlight = false;
async function switchYear(y){
  y = Number(y);
  if(yearSwitchInFlight || y === TOURNAMENT_YEAR) return;
  yearSwitchInFlight = true;
  showToast(`Loading ${y}…`);
  try{
    window.storage.setActiveYear(y);
    TOURNAMENT_YEAR = y;
    heroYearText = `TOURNAMENT · ${y}`;
    expandedLbRows = {};
    scorecardMode = 'score';
    await loadYearData(false);
    startScoreListener();   // re-points the live score listener at this year
    // a player's own scorecard belongs to the current year; send them to the
    // leaderboard when looking back
    if(viewingPastYear() && currentTab === 'scorecard' && !isAdminSession) switchTab('leaderboard', true);
    paintYearChrome();
    render();
    showToast(viewingPastYear() ? `Viewing ${y}` : `Back to ${y}`);
  }catch(e){
    console.error('year switch failed', e);
    showToast(`Couldn't load ${y}. Check your connection.`);
  }finally{
    yearSwitchInFlight = false;
  }
}
function openYearSheet(){
  const years = window.storage.years();
  const cur = window.storage.currentYear();
  let sheet = document.getElementById('yearSheet');
  if(!sheet){
    sheet = document.createElement('div');
    sheet.id = 'yearSheet';
    sheet.className = 'year-sheet-backdrop';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e)=>{ if(e.target === sheet) sheet.remove(); });
  }
  sheet.innerHTML = `<div class="year-sheet" role="dialog" aria-label="Choose a tournament year">
    <div class="year-sheet-title">Tournament year</div>
    ${years.map(y=>`<button class="year-sheet-row ${y===TOURNAMENT_YEAR?'active':''}" data-pick-year="${y}" type="button">
      <span>The Joey ${y}</span><span class="year-sheet-tag">${y===cur ? 'Current' : y > cur ? 'Upcoming' : 'Previous'}</span></button>`).join('')}
    <button class="tiny-btn" data-close-year-sheet type="button" style="margin-top:10px;">Close</button>
  </div>`;
  sheet.querySelectorAll('[data-pick-year]').forEach(b=>b.onclick = ()=>{ sheet.remove(); switchYear(b.dataset.pickYear); });
  sheet.querySelector('[data-close-year-sheet]').onclick = ()=>sheet.remove();
}
document.addEventListener('click', (e)=>{
  if(e.target.closest('[data-year-switch]')){ e.preventDefault(); e.stopPropagation(); openYearSheet(); }
  if(e.target.closest('#backToCurrentBtn')){ switchYear(window.storage.currentYear()); }
}, true);

/* ---- Past-year feeds: collapsed sections under the current feed ----
   Posts are read with a year-tagged prefix ("2026|feed-post:") so every
   existing like/reply/edit helper saves back to that year unchanged. */
let pastFeeds = {};   // { year: {open, loading, posts:[], failed} }
let currentFeedOpen = true;   // current year's feed section (session only)
// Show/hide auto posts (birdies, bogeys, contest updates). Starts on "All
// Posts" every time the app opens.
let showAutoPosts = true;
function withAutoPostFilter(list){ return showAutoPosts ? list : list.filter(p=>!p.system); }
document.addEventListener('click', (e)=>{
  const b = e.target.closest('[data-auto-posts]');
  if(!b) return;
  const show = b.dataset.autoPosts === 'show';
  if(show === showAutoPosts) return;
  showAutoPosts = show;
  render();
});
document.addEventListener('click', (e)=>{
  if(!e.target.closest('[data-current-feed]')) return;
  currentFeedOpen = !currentFeedOpen;
  render();
});
function pastFeedPrefix(y){ return `${y}|feed-post:`; }
async function loadPastFeed(y){
  const pf = pastFeeds[y] = pastFeeds[y] || {open:true, posts:[]};
  pf.loading = true; pf.failed = false;
  render();
  try{
    const prefix = pastFeedPrefix(y);
    const docs = await window.storage.listRaw(prefix);
    pf.posts = docs.map(({data})=>postFromDoc(data, null)).filter(Boolean).sort((a,b)=>a.time-b.time);
  }catch(e){
    console.error('past feed load failed', y, e);
    pf.failed = true;
  }finally{
    pf.loading = false;
    feedRender();
  }
}
function renderPastFeeds(){
  if(!(window.storage.yearMode && window.storage.yearMode())) return '';
  const cur = window.storage.currentYear();
  return window.storage.years().filter(y=>y !== cur).map(y=>{
    const pf = pastFeeds[y] || {};
    const shown = withAutoPostFilter(pf.posts || []);
    const count = shown.length ? ` · ${shown.length} post${shown.length===1?'':'s'}` : '';
    const body = !pf.open ? '' : pf.loading ? `<div class="empty">Loading ${y}…</div>`
      : pf.failed ? `<div class="empty">Couldn't load the ${y} feed. <button class="tiny-btn" data-past-feed="${y}" type="button">Try again</button></div>`
      : shown.length ? shown.slice().reverse().map(renderPost).join('')
      : `<div class="empty">${pf.posts.length ? `Only auto posts from ${y}.` : `No posts from ${y}.`}</div>`;
    return `<div class="card past-feed ${pf.open ? 'open' : ''}">
      <button class="past-feed-head" data-past-feed="${y}" type="button">
        <span>${y} Tournament Feed<span class="past-feed-count">${count}</span></span><span class="feed-toggle-circle" aria-hidden="true">${pf.open ? '−' : '+'}</span>
      </button>
      ${body}
    </div>`;
  }).join('');
}
document.addEventListener('click', (e)=>{
  const b = e.target.closest('[data-past-feed]');
  if(!b) return;
  const y = Number(b.dataset.pastFeed);
  const pf = pastFeeds[y];
  if(pf && pf.open && !pf.failed && !b.classList.contains('tiny-btn')){ pf.open = false; render(); return; }
  if(pf && pf.posts && pf.posts.length && !pf.failed){ pf.open = true; render(); return; }
  loadPastFeed(y);
});
// Find a post in the current feed, the Tribute Wall, or an open past feed,
// along with the storage prefix its saves should use.
function locatePost(id){
  let post = feedPosts.find(p=>p.id===id);
  if(post) return {post, prefix:'feed-post:', list:'feed'};
  post = tributePosts.find(p=>p.id===id);
  if(post) return {post, prefix:'tribute-post:', list:'tribute'};
  for(const [y, pf] of Object.entries(pastFeeds)){
    post = (pf.posts||[]).find(p=>p.id===id);
    if(post) return {post, prefix: pastFeedPrefix(y), list:'past', year:Number(y)};
  }
  return null;
}

/* ---- Admin: years panel ---- */
function paintYearsAdmin(){
  const st = window.storage;
  const status = document.getElementById('yearsStatus');
  if(!status) return;
  const cfg = st.config();
  const where = st.testMode ? 'Test copy: reading and writing test data only.' : 'Live data.';
  const yearMode = st.yearMode();
  if(yearMode){
    const yrs = Object.entries(cfg.years || {}).sort(([a],[b])=>b-a)
      .map(([y, v])=>`${y}${v && v.status==='final' ? ' (Final)' : ''}`).join(', ');
    status.textContent = `${where} Current year: ${cfg.currentYear}. Years: ${yrs}.`;
  } else {
    status.textContent = `${where} Not set up yet. Everything still reads the original single collection.`;
  }
  document.getElementById('migrateYearBtn').style.display = yearMode ? 'none' : '';
  document.getElementById('yearsManage').style.display = yearMode ? '' : 'none';
  if(yearMode){
    const sel = document.getElementById('currentYearSelect');
    sel.innerHTML = st.years().map(y=>`<option value="${y}" ${y===st.currentYear()?'selected':''}>${y}</option>`).join('');
  }
  document.getElementById('resetTestBtn').style.display = st.testMode ? '' : 'none';
  // Start Fresh wipes the current year's scores and feed; once years
  // exist, a new year replaces it, so it is hidden to protect the archive.
  document.getElementById('startFreshSection').style.display = yearMode ? 'none' : '';
}
function wireYearsAdmin(){
  paintYearsAdmin();
  const migrateBtn = document.getElementById('migrateYearBtn');
  migrateBtn.onclick = async ()=>{
    if(!isAdminSession) return;
    const msg = window.storage.testMode
      ? 'Copy the live 2026 data into the TEST year layout?\n\nThe live data is only read, never changed.'
      : 'Copy 2026 into its own year?\n\nThe original data is copied, not moved, and stays where it is. Download a backup first if you haven\'t.';
    if(!confirm(msg)) return;
    migrateBtn.disabled = true;
    migrateBtn.textContent = 'Copying…';
    try{
      const c = await window.storage.migrateFlatYear(2026, (done, total)=>{ migrateBtn.textContent = `Copying… ${done}/${total}`; });
      alert(`Done. Copied ${c.year} year documents` + (c.shared ? ` and ${c.shared} shared documents` : '') + `; skipped ${c.skipped}.\n\nThe app will reload.`);
      location.reload();
    }catch(e){
      console.error('migration failed', e);
      alert('The copy did not finish: ' + (e && e.message ? e.message : e) + '\n\nNothing in the original data was changed.');
      migrateBtn.disabled = false;
      migrateBtn.textContent = '📦 Copy 2026 into its own year';
    }
  };
  document.getElementById('createYearBtn').onclick = async ()=>{
    if(!isAdminSession) return;
    const years = window.storage.years();
    const next = (years[0] || TOURNAMENT_YEAR) + 1;
    const input = prompt('Which year are you setting up?', String(next));
    if(input === null) return;
    const y = parseInt(input, 10);
    if(!(y >= 2000 && y <= 2100)){ alert('Enter a 4-digit year, like ' + next + '.'); return; }
    if(years.includes(y)){ alert(`${y} already exists.`); return; }
    // event details for the new year; course carries over automatically
    const venue = prompt(`${y} course / location:`, eventInfo.venue || 'Downingtown Country Club'); if(venue === null) return;
    const date  = prompt(`${y} date (e.g. Friday, October 8):`, ''); if(date === null) return;
    const note  = prompt(`${y} note (e.g. dinner plans):`, eventInfo.note || ''); if(note === null) return;
    try{
      await window.storage.createYear(y);
      await window.storage.setForYear(y, 'event-info', JSON.stringify({venue: venue.trim(), date: date.trim(), note: note.trim()}));
      await window.storage.setForYear(y, 'hero-year', `TOURNAMENT · ${y}`);
      const makeCurrent = confirm(`${y} is set up.\n\nMake ${y} the current year now? Everyone will open the app to ${y}.\n\n(Cancel keeps ${window.storage.currentYear()} as current; you can switch later.)`);
      if(makeCurrent) await window.storage.setCurrentYear(y);
      alert(makeCurrent ? `${y} is now the current year. The app will reload.` : `${y} created. The app will reload.`);
      location.reload();
    }catch(e){
      alert('Could not create the year: ' + (e && e.message ? e.message : e));
    }
  };
  document.getElementById('setCurrentYearBtn').onclick = async ()=>{
    if(!isAdminSession) return;
    const y = Number(document.getElementById('currentYearSelect').value);
    if(y === window.storage.currentYear()){ showToast(`${y} is already the current year`); return; }
    if(!confirm(`Make ${y} the current year?\n\nEveryone will open the app to ${y}.`)) return;
    try{
      await window.storage.setCurrentYear(y);
      alert(`${y} is now the current year. The app will reload.`);
      location.reload();
    }catch(e){
      alert('Could not change the current year: ' + (e && e.message ? e.message : e));
    }
  };
  const resetBtn = document.getElementById('resetTestBtn');
  resetBtn.onclick = async ()=>{
    if(!isAdminSession || !window.storage.testMode) return;
    if(!confirm('Delete ALL test data so the copy can be run again?\n\nOnly affects the test copy. Live data is untouched.')) return;
    resetBtn.disabled = true;
    try{
      const n = await window.storage.resetTestData();
      ['my-name','my-role','my-team-id'].forEach(k=>devStore.removeItem('personal:'+k));
      alert(`Deleted ${n} test documents. The app will reload.`);
      location.reload();
    }catch(e){
      alert('Reset failed: ' + (e && e.message ? e.message : e));
      resetBtn.disabled = false;
    }
  };
}

(async function init(){
  if(!window.__storageReady){
    await new Promise(resolve=>{
      if(window.__storageReady) resolve();
      else document.addEventListener('storage-ready', resolve, {once:true});
    });
  }
  if(window.__storageInitFailed){
    document.body.innerHTML = '<div style="padding:40px 24px;text-align:center;font-family:sans-serif;color:#333;">Couldn\'t connect to the database. Check your internet connection and reload the page.</div>';
    return;
  }
  applyTournamentYear();
  await loadAll();
  wireIdentityGate();
  checkNameGate();
  updateAdminUI();
  render();
  restoreMediaDrafts();
  startScoreListener();
  retryPendingScores();
  updateSyncBadge();
  document.getElementById('syncBadge').onclick = retryPendingScores;
  paintYearChrome();
  const bootLoading = document.getElementById('bootLoading');
  if(bootLoading) bootLoading.remove();

  document.getElementById('backupToggle').onclick = ()=>{
    const p = document.getElementById('backupPanel');
    document.getElementById('identityPanel').style.display = 'none';
    p.style.display = p.style.display==='none' ? 'block' : 'none';
  };
  document.getElementById('downloadBackupBtn').onclick = exportBackup;
  document.getElementById('restoreBackupInput').onchange = (e)=>{
    const f = e.target.files[0];
    if(f) importBackup(f);
    e.target.value = '';
  };
  document.getElementById('syncNowBtn').onclick = ()=>refreshLiveData(false);
  document.getElementById('startFreshBtn').onclick = startFresh;
  wireYearsAdmin();
  document.getElementById('presenceBtn').onclick = openPresenceSheet;
  pingPresence();
  document.addEventListener('click', async (e)=>{
    if(!e.target.closest('#unlockScoresBtn') || !isAdminSession) return;
    if(!confirm('Unlock scores so they can be edited again?')) return;
    scoresLocked = false;
    await save('scores-locked', 'false', true);
    render();
    showToast('Scores unlocked');
  });

  document.getElementById('identityToggle').onclick = ()=>{
    const p = document.getElementById('identityPanel');
    document.getElementById('backupPanel').style.display = 'none';
    if(p.style.display==='none'){
      const roleLabel = isAdminSession ? 'Admin (this session)' : (myRole==='player' ? `Player, Team ${(teams.find(t=>t.id===myTeamId)||{}).label||'?'}` : myRole==='guest' ? 'Guest' : 'Not signed in');
      document.getElementById('identitySummary').textContent = myName ? `${myName} · ${roleLabel}` : 'Not signed in yet.';
      document.getElementById('identityAdminBtn').style.display = isAdminSession ? 'none' : 'block';
      p.style.display = 'block';
    } else {
      p.style.display = 'none';
    }
  };
  document.getElementById('identityResetBtn').onclick = ()=>{
    document.getElementById('identityPanel').style.display = 'none';
    resetIdentity();
  };
  document.getElementById('identityAdminBtn').onclick = ()=>{
    document.getElementById('identityPanel').style.display = 'none';
    document.getElementById('nameGate').style.display = 'flex';
    document.getElementById('gateAdminPassInput').value = '';
    document.getElementById('gateAdminError').style.display = 'none';
    gateShowStep('gateStepAdmin');
  };
})();
