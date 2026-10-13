/* ---------------------------------------------------------
   DEVICE STORAGE (localStorage) -- test-copy aware
   The test copy runs on the same web address as the live app, so
   both would otherwise share one phone's saved name, role, and
   unsent-score queue. In test mode every device key gets a "test:"
   prefix, so test scores can never replay into the live app.
--------------------------------------------------------- */
window.JOEY_TEST_MODE = /\/test(\/|$)/.test(location.pathname)
  || new URLSearchParams(location.search).has('sandbox');
window.devStore = (function(){
  const P = window.JOEY_TEST_MODE ? 'test:' : '';
  const ls = ()=>window.localStorage;
  return {
    getItem: (k)=>ls().getItem(P + k),
    setItem: (k, v)=>ls().setItem(P + k, v),
    removeItem: (k)=>ls().removeItem(P + k),
    // every key this mode owns, with the mode prefix removed
    keys(){
      const out = [];
      for(let i=0;i<ls().length;i++){
        const k = ls().key(i);
        if(!k) continue;
        if(P){ if(k.startsWith(P)) out.push(k.slice(P.length)); }
        else if(!k.startsWith('test:')) out.push(k);
      }
      return out;
    }
  };
})();

/* ---------------------------------------------------------
   FIREBASE-BACKED STORAGE, YEAR-AWARE
   Same get/set/delete/list API the app has always used. What's new:
   - Year-scoped data (teams, scores, feed, contests, banner...) lives
     in years/<year>/data. Everything else (Tribute Wall, Joe's page,
     champions, course) stays in the shared "data" collection.
   - Which year is read is set by the app-config doc. Until the 2026
     migration has run there is no app-config, and everything reads
     the shared collection exactly as before ("legacy mode").
   - Test mode (the /test/ copy) uses test_data and test_years only.
     It can READ the live collection for the migration copy, but has
     no code path that writes to it.
   App code passes the same keys as always ("teams", "feed-post:abc");
   the routing below decides which collection each key belongs to.
--------------------------------------------------------- */
(async function initFirebaseStorage(){
  try{
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js");
    const {
      initializeFirestore, doc, getDoc, setDoc, deleteDoc,
      collection, query, where, getDocs, documentId,
      deleteField, onSnapshot, writeBatch
    } = await import("https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js");

    const firebaseConfig = {
      apiKey: "AIzaSyAPwHRjm4VV0IwPmO9Q9wzcZQUHnsSPfZ8",
      authDomain: "the-joey.firebaseapp.com",
      projectId: "the-joey",
      storageBucket: "the-joey.firebasestorage.app",
      messagingSenderId: "916603414186",
      appId: "1:916603414186:web:4b3bc3edc2ed8cdc9e52d3"
    };

    const fbApp = initializeApp(firebaseConfig);
    // Works around a currently-open Firebase SDK bug (firebase-js-sdk#9789)
    // where Safari 26.4+ (iPhone and Mac) takes ~10s per read using the
    // default streaming transport. Long-polling sidesteps it.
    const db = initializeFirestore(fbApp, {
      experimentalForceLongPolling: true,
      useFetchStreams: false
    });

    const TEST = window.JOEY_TEST_MODE;
    const LIVE_FLAT = 'data';                          // the original single collection (read-only from test mode)
    const GLOBAL = TEST ? 'test_data' : 'data';
    const YEARS  = TEST ? 'test_years' : 'years';
    const CONFIG_KEY = 'app-config';

    // ---- which keys belong to a tournament year ----
    const YEAR_KEYS = new Set([
      'teams', 'groups', 'contests', 'extra-contests',
      'scores-locked', 'contests-locked', 'event-info', 'hero-year',
      'roster',                     // this year's players: [{playerId, status}]
      'team-scores', 'feed-posts'   // old single-blob formats, still read once for migration
    ]);
    const YEAR_PREFIXES = ['team-score:', 'feed-post:', 'course-hole:'];   // course-hole: that year's own course
    const isYearKey = (key)=> YEAR_KEYS.has(key) || YEAR_PREFIXES.some(p=>key.startsWith(p));

    // ---- year config ----
    let config = null;      // {currentYear, years:{"2026":{status}}}
    let activeYear = null;  // the year being viewed (defaults to currentYear)
    try{
      const snap = await getDoc(doc(db, GLOBAL, CONFIG_KEY));
      if(snap.exists()) config = JSON.parse(snap.data().value);
    }catch(e){ console.error('app-config read failed', e); }
    if(config && config.currentYear) activeYear = Number(config.currentYear);
    const yearMode = ()=> !!(config && activeYear);

    const globalCol = ()=>collection(db, GLOBAL);
    const yearCol = (y)=>collection(db, YEARS, String(y), 'data');
    const currentYearNum = ()=> config ? Number(config.currentYear) : null;
    // A key may carry an explicit year tag, "2026|feed-post:abc", used for
    // past-year feed posts so likes/replies save back to the right year.
    const parseKey = (raw)=>{
      const m = /^(\d{4})\|(.*)$/.exec(raw);
      return m ? {year: Number(m[1]), key: m[2]} : {year: null, key: raw};
    };
    // Routing:
    //  - explicit year tag  -> that year
    //  - feed posts         -> the CURRENT year (the Feed tab always shows it;
    //                          past feeds are read with explicit tags)
    //  - other year data    -> the year being viewed
    //  - everything else    -> the shared collection
    const colFor = (raw)=>{
      const {year, key} = parseKey(raw);
      if(!yearMode() || !isYearKey(key)) return globalCol();
      if(year) return yearCol(year);
      if(key.startsWith('feed-post') ) return yearCol(currentYearNum());
      return yearCol(activeYear);
    };
    const docFor = (raw)=> doc(colFor(raw), parseKey(raw).key);
    const prefixQuery = (col, prefix)=>{
      const p = parseKey(prefix).key;
      return query(col, where(documentId(), '>=', p), where(documentId(), '<', p + ''));
    };
    // Past years are read-only for scores, teams, contests, and banner.
    // Feed posts (likes, replies) stay writable in every year.
    const viewingPast = ()=> yearMode() && activeYear !== currentYearNum();
    // An UPCOMING year (after the current one) can be set up ahead of time --
    // teams, groups, event details, side contests -- but never scored.
    // The app only shows those setup controls to the admin.
    const isScoreKey = (k)=> k.startsWith('team-score') || k === 'team-scores' || k === 'scores-locked';
    const yearStatus = (y)=> (config && config.years && config.years[y] && config.years[y].status) || null;
    const assertWritable = (raw)=>{
      const {year, key} = parseKey(raw);
      // A year marked Final is a record: only feed likes/replies/edits still save.
      const target = year || (key.startsWith('feed-post') ? currentYearNum() : activeYear);
      if(yearMode() && isYearKey(key) && !key.startsWith('feed-post') && yearStatus(target) === 'final'){
        throw new Error(`${target} is marked final`);
      }
      if(viewingPast() && isYearKey(key) && !key.startsWith('feed-post')){
        const upcoming = activeYear > currentYearNum();
        if(upcoming && !isScoreKey(key)) return;
        throw new Error(upcoming ? `${activeYear} hasn't started yet; scores are locked` : `${activeYear} is a previous year and is read-only`);
      }
    };

    window.storage = {
      async get(key, shared){
        if(!shared){
          const v = devStore.getItem('personal:' + key);
          return v === null ? null : {key, value: v, shared:false};
        }
        const snap = await getDoc(docFor(key));
        if(!snap.exists()) return null;
        return {key, value: snap.data().value, shared:true};
      },
      async set(key, value, shared){
        if(!shared){
          devStore.setItem('personal:' + key, value);
          return {key, value, shared:false};
        }
        assertWritable(key);
        await setDoc(docFor(key), {value, updatedAt: Date.now()});
        return {key, value, shared:true};
      },
      async delete(key, shared){
        if(!shared){
          devStore.removeItem('personal:' + key);
          return {key, deleted:true, shared:false};
        }
        assertWritable(key);
        await deleteDoc(docFor(key));
        return {key, deleted:true, shared:true};
      },
      async list(prefix, shared){
        if(!shared){
          const keys = devStore.keys().filter(k=>k.startsWith('personal:'+prefix)).map(k=>k.slice('personal:'.length));
          return {keys, prefix, shared:false};
        }
        const snap = await getDocs(prefixQuery(colFor(prefix), prefix));
        return {keys: snap.docs.map(d=>d.id), prefix, shared:true};
      },
      // Same prefix match as list(), but returns each document's value in
      // the same round trip -- avoids a separate get() per key afterward.
      async listWithValues(prefix, shared){
        if(!shared){
          const items = devStore.keys().filter(k=>k.startsWith('personal:'+prefix))
            .map(k=>({key: k.slice('personal:'.length), value: devStore.getItem(k)}));
          return {items, prefix, shared:false};
        }
        const snap = await getDocs(prefixQuery(colFor(prefix), prefix));
        return {items: snap.docs.map(d=>({key: d.id, value: d.data().value})), prefix, shared:true};
      }
    };

    // --- Team scores: one doc per team, one FIELD per hole ---
    // Writing a single hole merges just that field, so two phones on the
    // same team can never wipe out each other's holes with a stale copy.
    // Older docs stored the whole scorecard as a JSON string in `value`;
    // we read both and let per-hole fields win.
    const scoreDocToHoles = (data)=>{
      let out = {};
      if(data && typeof data.value === 'string'){
        try{ out = JSON.parse(data.value) || {}; }catch(e){}
      }
      if(data && data.holes){
        Object.entries(data.holes).forEach(([k,v])=>{ if(v) out[k]=v; });
      }
      return out;
    };
    const scoreQuery = ()=>prefixQuery(colFor('team-score:'), 'team-score:');
    window.storage.scoreSetHole = async (tid, hole, val)=>{
      assertWritable('team-score:'+tid);
      await setDoc(docFor('team-score:'+tid),
        {holes: {[String(hole)]: val ? val : deleteField()}, updatedAt: Date.now()},
        {merge:true});
    };
    window.storage.scoreReplaceAll = async (tid, holesObj)=>{
      assertWritable('team-score:'+tid);
      await setDoc(docFor('team-score:'+tid),
        {holes: holesObj || {}, updatedAt: Date.now()});
    };
    window.storage.scoreList = async ()=>{
      const snap = await getDocs(scoreQuery());
      const out = {};
      snap.docs.forEach(d=>{
        const tid = d.id.slice('team-score:'.length);
        const holes = scoreDocToHoles(d.data());
        out[tid] = holes;
        // One-time upgrade: convert an old whole-scorecard doc into
        // per-hole fields (drops `value`), so clearing a hole sticks.
        if(typeof d.data().value === 'string' && !viewingPast()){
          setDoc(docFor(d.id), {holes, updatedAt: Date.now()})
            .catch(e=>console.error('score migrate failed', tid, e));
        }
      });
      return out;
    };
    // Live listener: Firestore only bills for docs that CHANGE after the
    // first snapshot, instead of re-reading every team every 20 seconds.
    let stopScoreWatch = null;
    window.storage.scoreWatch = (cb)=>{
      if(stopScoreWatch) stopScoreWatch();
      stopScoreWatch = onSnapshot(scoreQuery(), snap=>{
        const out = {};
        snap.docs.forEach(d=>{ out[d.id.slice('team-score:'.length)] = scoreDocToHoles(d.data()); });
        cb(out);
      }, err=>console.error('score listener error', err));
      return stopScoreWatch;
    };

    // --- Posts: raw docs, field-level merges, and "what changed" fetches ---
    window.storage.listRaw = async (prefix)=>{
      const snap = await getDocs(prefixQuery(colFor(prefix), prefix));
      return snap.docs.map(d=>({key: d.id, data: d.data()}));
    };
    // Merge only the given fields into a doc (nested maps merge too), so
    // a like or a comment never rewrites the rest of the post.
    window.storage.mergeDoc = async (key, fields)=>{
      assertWritable(key);
      await setDoc(docFor(key), {...fields, updatedAt: Date.now()}, {merge:true});
    };
    window.storage.del = ()=>deleteField();
    // Every doc carries updatedAt (set on each write), so this returns only
    // what changed since the last check -- usually a handful of reads.
    // Used for the Feed and Tribute Wall, so in year mode it checks the
    // shared collection and the CURRENT year (where the live feed is).
    window.storage.changedSince = async (ts)=>{
      const cols = yearMode() ? [globalCol(), yearCol(currentYearNum())] : [globalCol()];
      const snaps = await Promise.all(cols.map(c=>getDocs(query(c, where('updatedAt', '>', ts)))));
      return snaps.flatMap(s=>s.docs.map(d=>({key: d.id, data: d.data()})));
    };

    window.storage.presencePing = async (deviceId, fields)=>{
      await setDoc(doc(globalCol(), 'presence:'+deviceId), fields);
    };
    window.storage.presenceList = async ()=>{
      const snap = await getDocs(prefixQuery(globalCol(), 'presence:'));
      return snap.docs.map(d=>({deviceId: d.id.slice('presence:'.length), ...d.data()}));
    };

    // ---- Year info for the app ----
    window.storage.testMode = TEST;
    window.storage.yearMode = yearMode;
    window.storage.config = ()=>config;
    window.storage.currentYear = currentYearNum;
    window.storage.activeYear = ()=>activeYear;
    window.storage.setActiveYear = (y)=>{ activeYear = Number(y); };
    window.storage.viewingPast = viewingPast;
    window.storage.years = ()=> Object.keys((config && config.years) || {}).map(Number).sort((a,b)=>b-a);
    window.storage.saveConfig = async (cfg)=>{
      await setDoc(doc(globalCol(), CONFIG_KEY), {value: JSON.stringify(cfg), updatedAt: Date.now()});
      config = cfg;
    };
    // Add a new tournament year (empty). Doesn't change the current year.
    window.storage.createYear = async (y)=>{
      y = Number(y);
      if(!config) throw new Error('Set up years first (copy 2026 into its own year).');
      if(config.years && config.years[y]) throw new Error(`${y} already exists.`);
      await window.storage.saveConfig({...config, years: {...config.years, [y]: {status:'setup'}}});
    };
    // Which year everyone sees when they open the app.
    window.storage.setCurrentYear = async (y)=>{
      y = Number(y);
      if(!config || !config.years || !config.years[y]) throw new Error(`${y} doesn't exist.`);
      await window.storage.saveConfig({...config, currentYear: y});
      activeYear = y;
    };
    // Read a year-scoped value from a specific year (used to gather past rosters).
    window.storage.getForYear = async (y, key)=>{
      const snap = await getDoc(doc(yearCol(y), key));
      return snap.exists() ? snap.data().value : null;
    };
    window.storage.yearStatus = yearStatus;
    window.storage.isFinal = (y)=> yearStatus(Number(y)) === 'final';
    // Mark a year Final (locked record) or reopen it.
    window.storage.setYearStatus = async (y, status)=>{
      y = Number(y);
      if(!config || !config.years || !config.years[y]) throw new Error(`${y} doesn't exist.`);
      await window.storage.saveConfig({...config, years: {...config.years, [y]: {...config.years[y], status}}});
    };
    // Write a whole course (18 holes) into a specific year.
    window.storage.saveCourseForYear = async (y, holes)=>{
      const batch = writeBatch(db);
      holes.forEach(h=>batch.set(doc(yearCol(y), 'course-hole:' + h.number), {value: JSON.stringify(h), updatedAt: Date.now()}));
      await batch.commit();
    };
    // Write the year-scoped event details for a specific year (used by Create Year).
    window.storage.setForYear = async (y, key, value)=>{
      await setDoc(doc(yearCol(y), key), {value, updatedAt: Date.now()});
    };

    /* ---- One-time migration: copy a year out of the original flat
       "data" collection into the year layout. Copies, never moves:
       the source is only read. Live mode: year-scoped docs go to
       years/<y>/data; shared docs are already in place. Test mode:
       year-scoped docs go to test_years/<y>/data and shared docs are
       copied into test_data, so the test copy has real content. ---- */
    window.storage.migrateFlatYear = async (year, onProgress)=>{
      year = Number(year);
      const existing = await getDocs(query(yearCol(year)));
      if(!existing.empty) throw new Error(`Year ${year} already has ${existing.size} documents -- not copying over them.`);
      const src = await getDocs(collection(db, LIVE_FLAT));
      const counts = {year:0, shared:0, skipped:0};
      const writes = [];
      src.docs.forEach(d=>{
        const key = d.id, data = d.data();
        if(key === CONFIG_KEY || key === 'presence-since' || key.startsWith('presence:')){ counts.skipped++; return; }
        if(key.startsWith('feed-post:') && data.deleted){ counts.skipped++; return; }  // cleared pilot posts
        if(isYearKey(key)){ writes.push([doc(yearCol(year), key), data]); counts.year++; }
        else if(TEST){ writes.push([doc(globalCol(), key), data]); counts.shared++; }
      });
      for(let i=0;i<writes.length;i+=400){
        const batch = writeBatch(db);
        writes.slice(i, i+400).forEach(([ref, data])=>batch.set(ref, data));
        await batch.commit();
        if(onProgress) onProgress(Math.min(i+400, writes.length), writes.length);
      }
      const cfg = {currentYear: year, years: {...((config && config.years) || {}), [year]: {status:'final'}}};
      await window.storage.saveConfig(cfg);
      activeYear = year;
      return counts;
    };

    // Test mode only: wipe all test data so the migration can be re-run.
    window.storage.resetTestData = async ()=>{
      if(!TEST) throw new Error('Only allowed in the test copy');
      const refs = [];
      (await getDocs(globalCol())).docs.forEach(d=>refs.push(d.ref));
      const yrs = Object.keys((config && config.years) || {});
      for(const y of yrs) (await getDocs(yearCol(y))).docs.forEach(d=>refs.push(d.ref));
      for(let i=0;i<refs.length;i+=400){
        const batch = writeBatch(db);
        refs.slice(i, i+400).forEach(r=>batch.delete(r));
        await batch.commit();
      }
      config = null; activeYear = null;
      return refs.length;
    };

    window.__storageReady = true;
    document.dispatchEvent(new Event('storage-ready'));
  }catch(err){
    console.error('Firebase init failed', err);
    window.__storageInitFailed = true;
    document.dispatchEvent(new Event('storage-ready')); // let init() proceed to its own error handling
  }
})();
