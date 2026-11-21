/**
 * Self-test: fake Google Sheets REST API + real Store + real Express router + client shim.
 * Run:  npm run test:db
 */
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Store } from '../server/db/store.ts';
import { SheetsDriver } from '../server/db/sheetsDriver.ts';
import { createDbRouter } from '../server/db/routes.ts';
import { encodeFields, decodeRow } from '../server/db/codec.ts';

/* ---------------- fake Sheets API ---------------- */
type Tab = { sheetId: number; title: string; rows: any[][]; rowCount: number; colCount: number };
function makeFakeSheets() {
  const tabs: Tab[] = [];
  let nextId = 1;
  const calls: string[] = [];
  const colIdx = (a1: string) => 0; // we always write from column A
  const parseRange = (r: string) => {
    const m = /^'((?:[^']|'')+)'!A(\d+)$/.exec(r)!;
    return { title: m[1].replace(/''/g, "'"), row: Number(m[2]) };
  };
  const impl: typeof fetch = async (url: any, init: any) => {
    const u = new URL(String(url));
    const body = init?.body ? JSON.parse(init.body) : undefined;
    const json = (o: any) => new Response(JSON.stringify(o), { status: 200 });
    if (u.pathname.endsWith('/values:batchGet')) {
      calls.push('batchGet');
      const ranges = u.searchParams.getAll('ranges').map((r) => r.slice(1, -1).replace(/''/g, "'"));
      return json({ valueRanges: ranges.map((t) => ({ values: trim(tabs.find((x) => x.title === t)!.rows) })) });
    }
    if (u.pathname.endsWith('/values:batchUpdate')) {
      calls.push('values:batchUpdate');
      for (const d of body.data) {
        const { title, row } = parseRange(d.range);
        const tab = tabs.find((t) => t.title === title)!;
        assert.ok(row <= tab.rowCount, `row ${row} beyond grid ${tab.rowCount}`);
        assert.ok(d.values[0].length <= tab.colCount, `cols ${d.values[0].length} beyond grid ${tab.colCount}`);
        while (tab.rows.length < row) tab.rows.push([]);
        tab.rows[row - 1] = d.values[0].map((v: any) => v); // RAW: store as given
      }
      return json({});
    }
    if (u.pathname.endsWith(':batchUpdate')) {
      calls.push('batchUpdate');
      const replies = body.requests.map((r: any) => {
        if (r.addSheet) {
          const p = r.addSheet.properties;
          const t: Tab = { sheetId: nextId++, title: p.title, rows: [], rowCount: p.gridProperties.rowCount, colCount: p.gridProperties.columnCount };
          tabs.push(t);
          return { addSheet: { properties: { sheetId: t.sheetId, title: t.title } } };
        }
        if (r.updateSheetProperties) {
          const p = r.updateSheetProperties.properties;
          const t = tabs.find((x) => x.sheetId === p.sheetId)!;
          t.rowCount = p.gridProperties.rowCount; t.colCount = p.gridProperties.columnCount;
          return {};
        }
        return {};
      });
      return json({ replies });
    }
    calls.push('meta');
    return json({ sheets: tabs.map((t) => ({ properties: { sheetId: t.sheetId, title: t.title, gridProperties: { rowCount: t.rowCount, columnCount: t.colCount } } })) });
  };
  // Sheets trims trailing empty cells in reads
  const trim = (rows: any[][]) => rows.map((r) => { const c = [...r]; while (c.length && (c[c.length - 1] === '' || c[c.length - 1] == null)) c.pop(); return c; });
  return { impl, tabs, calls };
}

const mk = (fake: ReturnType<typeof makeFakeSheets>) =>
  new Store(new SheetsDriver({ spreadsheetId: 'S', fetchImpl: fake.impl, getToken: async () => 't', baseUrl: 'https://x/v4/spreadsheets' }), 20);

let passed = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); passed++; console.log('  ✓', name); };

/* ---------------- tests ---------------- */
await t('codec round-trips tricky values', () => {
  const data = { a: '', b: 'x', c: '0123', d: 0, e: false, f: null, g: { n: [1, { z: 'é' }] }, h: '§weird', i: 'y'.repeat(100_000), j: 12345678901234 };
  const cells = encodeFields(data);
  assert.ok(Object.keys(cells).some((k) => k.startsWith('i§')), 'long string chunked');
  const headers = ['_id', ...Object.keys(cells)];
  const row = headers.map((h) => (h === '_id' ? 'id' : cells[h]));
  assert.deepEqual(decodeRow(headers, row), data);
});

await t('store: CRUD, queries, orderBy excludes missing, limit, in, array-contains', () => {
  const fake = makeFakeSheets();
  const s = mk(fake);
  s.commit([
    { op: 'set', path: 'cases/a', data: { createdAt: '2026-01-03', status: 'open', tags: ['x'] } },
    { op: 'set', path: 'cases/b', data: { createdAt: '2026-01-02', status: 'closed', tags: ['y'] } },
    { op: 'set', path: 'cases/c', data: { createdAt: '2026-01-01', status: 'open' } },
    { op: 'set', path: 'cases/d', data: { status: 'open' } },
  ]);
  const ids = (cs: any[]) => s.query('cases', cs).map((d) => d.id);
  assert.deepEqual(ids([{ type: 'orderBy', field: 'createdAt', dir: 'desc' }]), ['a', 'b', 'c']); // d excluded
  assert.deepEqual(ids([{ type: 'orderBy', field: 'createdAt', dir: 'desc' }, { type: 'limit', n: 2 }]), ['a', 'b']);
  assert.deepEqual(ids([{ type: 'where', field: 'status', op: '==', value: 'open' }]).sort(), ['a', 'c', 'd']);
  assert.deepEqual(ids([{ type: 'where', field: 'status', op: 'in', value: ['closed'] }]), ['b']);
  assert.deepEqual(ids([{ type: 'where', field: 'tags', op: 'array-contains', value: 'x' }]), ['a']);
});

await t('store: subcollections are isolated per parent', () => {
  const s = mk(makeFakeSheets());
  s.commit([
    { op: 'set', path: 'cases/a/timeline/e1', data: { n: 1 } },
    { op: 'set', path: 'cases/b/timeline/e1', data: { n: 2 } },
    { op: 'set', path: 'cases/a', data: { x: 1 } },
  ]);
  assert.deepEqual(s.query('cases/a/timeline', []).map((d) => d.data.n), [1]);
  assert.deepEqual(s.query('cases/b/timeline', []).map((d) => d.data.n), [2]);
  assert.equal(s.query('cases', []).length, 1); // only the top-level doc 'a'
});

await t('store: update/merge/sentinels/not-found/atomic rollback', () => {
  const s = mk(makeFakeSheets());
  s.commit([{ op: 'set', path: 'm/1', data: { n: 1, arr: ['a'], o: { p: 1 } } }]);
  s.commit([{ op: 'update', path: 'm/1', data: { n: { __fv: 'increment', n: 4 }, arr: { __fv: 'arrayUnion', elements: ['a', 'b'] }, 'o.q': 2, ts: { __fv: 'serverTimestamp' } } }]);
  const d = s.getDoc('m/1')!.data;
  assert.equal(d.n, 5); assert.deepEqual(d.arr, ['a', 'b']); assert.deepEqual(d.o, { p: 1, q: 2 }); assert.match(d.ts, /^\d{4}-/);
  s.commit([{ op: 'set', path: 'm/1', data: { o: { r: 3 } }, merge: true }]);
  assert.deepEqual(s.getDoc('m/1')!.data.o, { p: 1, q: 2, r: 3 });
  assert.throws(() => s.commit([{ op: 'set', path: 'm/2', data: { z: 1 } }, { op: 'update', path: 'm/nope', data: { z: 1 } }]), /No document/);
  assert.equal(s.getDoc('m/2'), null, 'batch is all-or-nothing');
});

await t('store: optimistic conflict is detected', () => {
  const s = mk(makeFakeSheets());
  s.commit([{ op: 'set', path: 'counters/cases', data: { currentValue: 1 } }]);
  const v = s.getDoc('counters/cases')!.v;
  s.commit([{ op: 'update', path: 'counters/cases', data: { currentValue: 2 } }]); // someone else wins
  assert.throws(() => s.commit([{ op: 'update', path: 'counters/cases', data: { currentValue: 2 } }], [{ path: 'counters/cases', v }]), /conflict/i);
});

await t('sheets driver: write, restart, read back identical (incl. deletes, new columns, row reuse, grid growth)', async () => {
  const fake = makeFakeSheets();
  const s1 = mk(fake); await s1.init();
  const wide: any = {}; for (let i = 0; i < 40; i++) wide['f' + i] = i; // > 26 columns
  s1.commit([
    { op: 'set', path: 'users/u1', data: { name: 'أحمد', phone: '01012345678', active: true, perms: { a: 1 } } },
    { op: 'set', path: 'users/u2', data: { name: 'منى', phone: '', extra: null } },
    { op: 'set', path: 'cases/c1', data: wide },
    { op: 'set', path: 'cases/c1/timeline/t1', data: { text: 'hi' } },
  ]);
  await s1.flushAndWait();
  s1.commit([{ op: 'delete', path: 'users/u1' }]);
  await s1.flushAndWait();
  s1.commit([{ op: 'set', path: 'users/u3', data: { name: 'جديد', brandNewField: 'v' } }]); // should reuse u1's blank row
  for (let i = 0; i < 1200; i++) s1.commit([{ op: 'set', path: `cases/bulk${i}`, data: { i } }]); // forces grid growth
  await s1.flushAndWait();

  const usersTab = fake.tabs.find((x) => x.title === 'users')!;
  assert.equal(usersTab.rows[1][0], 'u3', 'deleted row reused for new doc');

  const s2 = mk(fake); await s2.init();
  assert.equal(s2.getDoc('users/u1'), null);
  assert.deepEqual(s2.getDoc('users/u2')!.data, { name: 'منى', phone: '', extra: null });
  assert.deepEqual(s2.getDoc('users/u3')!.data, { name: 'جديد', brandNewField: 'v' });
  assert.equal(s2.getDoc('cases/c1')!.data.f39, 39);
  assert.deepEqual(s2.getDoc('cases/c1/timeline/t1')!.data, { text: 'hi' });
  assert.equal(s2.query('cases', []).length, 1201);
});

await t('sheets driver: failed flush is retried and nothing is lost (incl. deletes)', async () => {
  const fake = makeFakeSheets();
  const s = mk(fake); await s.init();
  s.commit([{ op: 'set', path: 'a/1', data: { v: 1 } }, { op: 'set', path: 'a/2', data: { v: 2 } }]);
  await s.flushAndWait();
  // make the next values:batchUpdate fail once
  const orig = fake.impl; let failed = false;
  (globalThis as any).__f = orig;
  const failing: typeof fetch = async (u: any, i: any) => {
    if (!failed && String(u).endsWith('/values:batchUpdate')) { failed = true; return new Response('boom', { status: 400 }); }
    return orig(u, i);
  };
  const s2 = new Store(new SheetsDriver({ spreadsheetId: 'S', fetchImpl: failing, getToken: async () => 't', baseUrl: 'https://x/v4/spreadsheets' }), 20);
  await s2.init();
  s2.commit([{ op: 'delete', path: 'a/1' }, { op: 'set', path: 'a/3', data: { v: 3 } }]);
  await s2.flush();
  assert.ok(s2.lastFlushError, 'first flush failed');
  await new Promise((r) => setTimeout(r, 4500));
  await s2.flushAndWait();
  const s3 = mk(fake); await s3.init();
  assert.equal(s3.getDoc('a/1'), null);
  assert.equal(s3.getDoc('a/3')!.data.v, 3);
  assert.equal(s3.getDoc('a/2')!.data.v, 2);
});

await t('presence heartbeats do not write to the sheet', async () => {
  const fake = makeFakeSheets();
  const s = mk(fake); await s.init();
  s.commit([{ op: 'set', path: 'users/u', data: { name: 'x', isOnline: false } }]);
  await s.flushAndWait();
  const base = fake.calls.filter((c) => c === 'values:batchUpdate').length;
  s.commit([{ op: 'update', path: 'users/u', data: { isOnline: true, lastActiveAt: 't1' } }]); // login flip: persisted
  await s.flushAndWait();
  assert.equal(fake.calls.filter((c) => c === 'values:batchUpdate').length, base + 1);
  for (let i = 0; i < 20; i++) s.commit([{ op: 'update', path: 'users/u', data: { isOnline: true, lastActiveAt: 'hb' + i } }]);
  await s.flushAndWait();
  assert.equal(fake.calls.filter((c) => c === 'values:batchUpdate').length, base + 1, 'heartbeats stayed in memory');
  assert.equal(s.getDoc('users/u')!.data.lastActiveAt, 'hb19');
});

await t('HTTP + client shim end-to-end: realtime listener, transaction contention, batch', async () => {
  const fake = makeFakeSheets();
  const store = mk(fake); await store.init();
  const app = express(); app.use(express.json()); app.use('/api/db', createDbRouter(store));
  const server = http.createServer(app).listen(0);
  const port = (server.address() as any).port;
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = (u: any, i: any) => realFetch(typeof u === 'string' && u.startsWith('/') ? `http://127.0.0.1:${port}${u}` : u, i);
  // minimal EventSource over fetch for node
  (globalThis as any).EventSource = class {
    onmessage: any; ctl = new AbortController();
    constructor(url: string) {
      realFetch(`http://127.0.0.1:${port}${url}`, { signal: this.ctl.signal }).then(async (r) => {
        const rd = r.body!.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value);
          let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const m = /^data: (.*)$/m.exec(chunk); if (m) this.onmessage?.({ data: m[1] }); } }
      }).catch(() => {});
    }
    close() { this.ctl.abort(); }
  };
  const fs = await import('../src/lib/sheetsDb.ts');
  const { db, doc, collection, setDoc, getDoc, getDocs, query, orderBy, limit, where, onSnapshot, runTransaction, writeBatch, updateDoc, deleteDoc, addDoc } = fs;

  // realtime listener
  const seen: number[] = [];
  const unsub = onSnapshot(query(collection(db, 'cases'), orderBy('createdAt', 'desc'), limit(300)), (snap) => seen.push(snap.size));
  await new Promise((r) => setTimeout(r, 300));
  await setDoc(doc(db, 'cases', 'x1'), { createdAt: '1' });
  await addDoc(collection(db, 'cases'), { createdAt: '2' });
  await new Promise((r) => setTimeout(r, 1800));
  assert.equal(seen[seen.length - 1], 2, `listener saw latest state, got ${seen}`);

  // transaction contention: 10 parallel counter increments must yield 10 distinct numbers
  const counter = doc(db, 'counters', 'cases');
  const got = await Promise.all(Array.from({ length: 10 }, () => runTransaction(db, async (tx) => {
    const s = await tx.get(counter); const cur = s.exists() ? (s.data() as any).currentValue : 0;
    tx.set(counter, { currentValue: cur + 1 }); return cur + 1;
  }, 30)));
  assert.deepEqual([...got].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // two agents claiming the same case: exactly one wins
  await setDoc(doc(db, 'cases', 'claim'), { assignedTo: null });
  const claim = (uid: string) => runTransaction(db, async (tx) => {
    const s = await tx.get(doc(db, 'cases', 'claim'));
    if ((s.data() as any).assignedTo) throw new Error('taken');
    tx.update(doc(db, 'cases', 'claim'), { assignedTo: uid });
  });
  const res = await Promise.allSettled([claim('u1'), claim('u2'), claim('u3')]);
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);

  // batch + queries
  const b = writeBatch(db);
  for (let i = 0; i < 5; i++) b.set(doc(db, 'notifications', 'n' + i), { recipientUsername: i % 2 ? 'a' : 'b', i });
  await b.commit();
  const snap = await getDocs(query(collection(db, 'notifications'), where('recipientUsername', 'in', ['a'])));
  assert.equal(snap.size, 2);
  await updateDoc(doc(db, 'notifications', 'n1'), { read: true });
  await deleteDoc(doc(db, 'notifications', 'n3'));
  assert.equal((await getDoc(doc(db, 'notifications', 'n3'))).exists(), false);
  await assert.rejects(updateDoc(doc(db, 'notifications', 'ghost'), { a: 1 }), /No document/);

  unsub();
  await store.flushAndWait();
  assert.ok(fake.tabs.find((x) => x.title === 'notifications'), 'tab created in sheet');
  server.closeAllConnections?.(); server.close();
});

console.log(`\n${passed} tests passed`);
process.exit(0);
