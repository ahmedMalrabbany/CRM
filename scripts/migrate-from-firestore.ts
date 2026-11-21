/**
 * One-off: copy existing Firestore data into the new store (which writes it to Google Sheets).
 *   1) npm i --no-save firebase
 *   2) start the new server (npm run dev)         <- with GOOGLE_SHEET_ID configured
 *   3) npx tsx scripts/migrate-from-firestore.ts http://localhost:3000
 * Uses ~1 Firestore read per document, so run it after your daily quota has reset.
 */
import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const target = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const cfg = JSON.parse(fs.readFileSync(new URL('../legacy-firebase/firebase-applet-config.json', import.meta.url), 'utf8'));
const fdb = getFirestore(initializeApp(cfg), cfg.firestoreDatabaseId);

const norm = (v: any): any => {
  if (v && typeof v === 'object') {
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    if (Array.isArray(v)) return v.map(norm);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]));
  }
  return v;
};

async function push(writes: any[]) {
  for (let i = 0; i < writes.length; i += 200) {
    const r = await fetch(`${target}/api/db/rpc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'commit', writes: writes.slice(i, i + 200) }),
    });
    if (!r.ok) throw new Error(`commit failed: ${r.status} ${await r.text()}`);
  }
}

const top = ['users', 'cases', 'taxpayers', 'callers', 'notifications', 'counters', 'settings', 'teamChatMessages', 'auditLogs'];
for (const name of top) {
  const snap = await getDocs(collection(fdb, name));
  const writes = snap.docs.map((d) => ({ op: 'set', path: `${name}/${d.id}`, data: norm(d.data()) }));
  await push(writes);
  console.log(`${name}: ${writes.length}`);
  if (name === 'cases') {
    let n = 0;
    for (const c of snap.docs) {
      const t = await getDocs(collection(fdb, 'cases', c.id, 'timeline'));
      const w = t.docs.map((d) => ({ op: 'set', path: `cases/${c.id}/timeline/${d.id}`, data: norm(d.data()) }));
      await push(w); n += w.length;
    }
    console.log(`cases/timeline: ${n}`);
  }
}
console.log('done');
process.exit(0);
