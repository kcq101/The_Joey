/* ---------------------------------------------------------
   FIREBASE-BACKED STORAGE SHIM
   Drop-in replacement for the window.storage API this app was
   originally built against (get/set/delete/list, shared vs
   personal). Every other line of app code below is unchanged --
   it just talks to window.storage the same way it always did.
   "shared" data lives in Firestore; "personal" (per-device) data
   lives in localStorage, same scope it always had.
--------------------------------------------------------- */
(async function initFirebaseStorage(){
  try{
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js");
    const {
      initializeFirestore, doc, getDoc, setDoc, deleteDoc,
      collection, query, where, getDocs, documentId,
      deleteField, onSnapshot
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
    // default streaming transport. Long-polling sidesteps whatever's
    // broken there. The documented tradeoff is "some performance
    // degradation" for long-lived realtime listeners -- we don't use
    // those (plain get/set only), so it costs us essentially nothing here.
    const db = initializeFirestore(fbApp, {
      experimentalForceLongPolling: true,
      useFetchStreams: false
    });
    const COLLECTION = 'data';

    window.storage = {
      async get(key, shared){
        if(!shared){
          const v = localStorage.getItem('personal:' + key);
          return v === null ? null : {key, value: v, shared:false};
        }
        const snap = await getDoc(doc(db, COLLECTION, key));
        if(!snap.exists()) return null;
        return {key, value: snap.data().value, shared:true};
      },
      async set(key, value, shared){
        if(!shared){
          localStorage.setItem('personal:' + key, value);
          return {key, value, shared:false};
        }
        await setDoc(doc(db, COLLECTION, key), {value, updatedAt: Date.now()});
        return {key, value, shared:true};
      },
      async delete(key, shared){
        if(!shared){
          localStorage.removeItem('personal:' + key);
          return {key, deleted:true, shared:false};
        }
        await deleteDoc(doc(db, COLLECTION, key));
        return {key, deleted:true, shared:true};
      },
      async list(prefix, shared){
        if(!shared){
          const keys = [];
          for(let i=0;i<localStorage.length;i++){
            const k = localStorage.key(i);
            if(k && k.startsWith('personal:'+prefix)) keys.push(k.slice('personal:'.length));
          }
          return {keys, prefix, shared:false};
        }
        const q = query(
          collection(db, COLLECTION),
          where(documentId(), '>=', prefix),
          where(documentId(), '<', prefix + '\uf8ff')
        );
        const snap = await getDocs(q);
        const keys = snap.docs.map(d => d.id);
        return {keys, prefix, shared:true};
      },
      // Same prefix match as list(), but returns each document's value in
      // the same round trip -- avoids a separate get() per key afterward.
      async listWithValues(prefix, shared){
        if(!shared){
          const items = [];
          for(let i=0;i<localStorage.length;i++){
            const k = localStorage.key(i);
            if(k && k.startsWith('personal:'+prefix)){
              items.push({key: k.slice('personal:'.length), value: localStorage.getItem(k)});
            }
          }
          return {items, prefix, shared:false};
        }
        const q = query(
          collection(db, COLLECTION),
          where(documentId(), '>=', prefix),
          where(documentId(), '<', prefix + '\uf8ff')
        );
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({key: d.id, value: d.data().value}));
        return {items, prefix, shared:true};
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
    const scoreQuery = ()=>query(
      collection(db, COLLECTION),
      where(documentId(), '>=', 'team-score:'),
      where(documentId(), '<', 'team-score:' + '\uf8ff')
    );
    window.storage.scoreSetHole = async (tid, hole, val)=>{
      await setDoc(doc(db, COLLECTION, 'team-score:'+tid),
        {holes: {[String(hole)]: val ? val : deleteField()}, updatedAt: Date.now()},
        {merge:true});
    };
    window.storage.scoreReplaceAll = async (tid, holesObj)=>{
      await setDoc(doc(db, COLLECTION, 'team-score:'+tid),
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
        if(typeof d.data().value === 'string'){
          setDoc(doc(db, COLLECTION, d.id), {holes, updatedAt: Date.now()})
            .catch(e=>console.error('score migrate failed', tid, e));
        }
      });
      return out;
    };
    // Live listener: Firestore only bills for docs that CHANGE after the
    // first snapshot, instead of re-reading every team every 20 seconds.
    window.storage.scoreWatch = (cb)=>onSnapshot(scoreQuery(), snap=>{
      const out = {};
      snap.docs.forEach(d=>{ out[d.id.slice('team-score:'.length)] = scoreDocToHoles(d.data()); });
      cb(out);
    }, err=>console.error('score listener error', err));

    // --- Posts: raw docs, field-level merges, and "what changed" fetches ---
    const prefixQuery = (prefix)=>query(
      collection(db, COLLECTION),
      where(documentId(), '>=', prefix),
      where(documentId(), '<', prefix + '\uf8ff')
    );
    window.storage.listRaw = async (prefix)=>{
      const snap = await getDocs(prefixQuery(prefix));
      return snap.docs.map(d=>({key: d.id, data: d.data()}));
    };
    // Merge only the given fields into a doc (nested maps merge too), so
    // a like or a comment never rewrites the rest of the post.
    window.storage.mergeDoc = async (key, fields)=>{
      await setDoc(doc(db, COLLECTION, key), {...fields, updatedAt: Date.now()}, {merge:true});
    };
    window.storage.del = ()=>deleteField();
    // Every doc carries updatedAt (set on each write), so this returns only
    // what changed since the last check -- usually a handful of reads.
    window.storage.changedSince = async (ts)=>{
      const snap = await getDocs(query(collection(db, COLLECTION), where('updatedAt', '>', ts)));
      return snap.docs.map(d=>({key: d.id, data: d.data()}));
    };

    window.storage.presencePing = async (deviceId, fields)=>{
      await setDoc(doc(db, COLLECTION, 'presence:'+deviceId), fields);
    };
    window.storage.presenceList = async ()=>{
      const snap = await getDocs(prefixQuery('presence:'));
      return snap.docs.map(d=>({deviceId: d.id.slice('presence:'.length), ...d.data()}));
    };

    window.__storageReady = true;
    document.dispatchEvent(new Event('storage-ready'));
  }catch(err){
    console.error('Firebase init failed', err);
    window.__storageInitFailed = true;
    document.dispatchEvent(new Event('storage-ready')); // let init() proceed to its own error handling
  }
})();
