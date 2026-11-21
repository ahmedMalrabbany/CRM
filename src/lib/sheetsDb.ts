/**
 * Drop-in replacement for the subset of `firebase/firestore` used by this app.
 * Talks to the app server (/api/db/*), which keeps data in memory and syncs it
 * to Google Sheets in the background.  Realtime updates use Server-Sent Events.
 */

/* ------------------------------------------------------------------ types */

export interface Firestore { readonly __sheetsDb: true }
export const db: Firestore = { __sheetsDb: true };

export interface DocumentReference { readonly type: 'doc'; readonly path: string; readonly id: string }
export interface CollectionReference { readonly type: 'collection'; readonly path: string; readonly id: string }
type Constraint =
  | { type: 'where'; field: string; op: string; value: any }
  | { type: 'orderBy'; field: string; dir: 'asc' | 'desc' }
  | { type: 'limit'; n: number };
export interface Query { readonly type: 'query'; readonly path: string; readonly constraints: Constraint[] }
export type QueryConstraint = Constraint;
export type Unsubscribe = () => void;

export interface DocumentSnapshot<T = any> {
  id: string;
  ref: DocumentReference;
  exists(): boolean;
  data(): T | undefined;
}
export interface QueryDocumentSnapshot<T = any> extends DocumentSnapshot<T> { data(): T }
export interface QuerySnapshot<T = any> {
  docs: QueryDocumentSnapshot<T>[];
  size: number;
  empty: boolean;
  forEach(cb: (d: QueryDocumentSnapshot<T>) => void): void;
}

/* ------------------------------------------------------------------ refs */

const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function autoId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => AUTO_ID_CHARS[b % AUTO_ID_CHARS.length]).join('');
}

function joinSegments(segs: string[]): string[] {
  return segs.flatMap((s) => String(s).split('/')).filter(Boolean);
}

export function collection(_db: Firestore, path: string, ...rest: string[]): CollectionReference {
  const segs = joinSegments([path, ...rest]);
  if (segs.length % 2 !== 1) throw new Error(`Invalid collection path: ${segs.join('/')}`);
  return { type: 'collection', path: segs.join('/'), id: segs[segs.length - 1] };
}

export function doc(parent: Firestore | CollectionReference, path?: string, ...rest: string[]): DocumentReference {
  let segs: string[];
  if ((parent as any).type === 'collection') {
    segs = joinSegments([(parent as CollectionReference).path, ...(path ? [path, ...rest] : [autoId()])]);
  } else {
    segs = joinSegments([path ?? '', ...rest]);
  }
  if (segs.length === 0 || segs.length % 2 !== 0) throw new Error(`Invalid document path: ${segs.join('/')}`);
  return { type: 'doc', path: segs.join('/'), id: segs[segs.length - 1] };
}

export function query(ref: CollectionReference | Query, ...constraints: Constraint[]): Query {
  const base = ref.type === 'query' ? ref.constraints : [];
  return { type: 'query', path: ref.path, constraints: [...base, ...constraints] };
}
export const where = (field: string, op: string, value: any): Constraint => ({ type: 'where', field, op, value });
export const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc'): Constraint => ({ type: 'orderBy', field, dir });
export const limit = (n: number): Constraint => ({ type: 'limit', n });

/* -------------------------------------------------------------- sentinels */

export const serverTimestamp = () => ({ __fv: 'serverTimestamp' });
export const arrayUnion = (...elements: any[]) => ({ __fv: 'arrayUnion', elements });
export const arrayRemove = (...elements: any[]) => ({ __fv: 'arrayRemove', elements });
export const increment = (n: number) => ({ __fv: 'increment', n });
export const deleteField = () => ({ __fv: 'deleteField' });

/* ------------------------------------------------------------------- RPC */

const API = '/api/db';

async function rpc(body: any): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${API}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('تعذر الاتصال بالخادم، تحقق من الإنترنت.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(json.error || `Request failed (${res.status})`);
    err.code = json.code;
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Drop undefined (Firestore would reject it; JSON would silently drop it anyway). */
function clean<T>(x: T): T {
  return x === undefined ? x : JSON.parse(JSON.stringify(x));
}

function mkSnap(path: string, id: string, data: any | null | undefined): DocumentSnapshot {
  const ref: DocumentReference = { type: 'doc', path, id };
  return { id, ref, exists: () => data != null, data: () => (data == null ? undefined : data) };
}

/* ----------------------------------------------------------------- reads */

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  const { doc: d } = await rpc({ op: 'get', path: ref.path });
  return mkSnap(ref.path, ref.id, d?.data);
}
export const getDocFromServer = getDoc;

function mkQuerySnap(docs: Array<{ id: string; path: string; data: any }>): QuerySnapshot {
  const snaps = docs.map((d) => mkSnap(d.path, d.id, d.data) as QueryDocumentSnapshot);
  return { docs: snaps, size: snaps.length, empty: snaps.length === 0, forEach: (cb) => snaps.forEach(cb) };
}

export async function getDocs(q: CollectionReference | Query): Promise<QuerySnapshot> {
  const constraints = q.type === 'query' ? q.constraints : [];
  const { docs } = await rpc({ op: 'query', path: q.path, cs: constraints });
  return mkQuerySnap(docs);
}

/* ---------------------------------------------------------------- writes */

type WriteOp =
  | { op: 'set'; path: string; data: any; merge?: boolean }
  | { op: 'update'; path: string; data: any }
  | { op: 'delete'; path: string };

const commitWrites = (writes: WriteOp[], reads: Array<{ path: string; v: number }> = []) =>
  rpc({ op: 'commit', writes, reads });

export async function setDoc(ref: DocumentReference, data: any, options?: { merge?: boolean }): Promise<void> {
  await commitWrites([{ op: 'set', path: ref.path, data: clean(data), merge: !!options?.merge }]);
}
export async function addDoc(col: CollectionReference, data: any): Promise<DocumentReference> {
  const ref = doc(col);
  await setDoc(ref, data);
  return ref;
}
export async function updateDoc(ref: DocumentReference, data: any): Promise<void> {
  await commitWrites([{ op: 'update', path: ref.path, data: clean(data) }]);
}
export async function deleteDoc(ref: DocumentReference): Promise<void> {
  await commitWrites([{ op: 'delete', path: ref.path }]);
}

export interface WriteBatch {
  set(ref: DocumentReference, data: any, options?: { merge?: boolean }): WriteBatch;
  update(ref: DocumentReference, data: any): WriteBatch;
  delete(ref: DocumentReference): WriteBatch;
  commit(): Promise<void>;
}
export function writeBatch(_db: Firestore): WriteBatch {
  const ops: WriteOp[] = [];
  const b: WriteBatch = {
    set(ref, data, options) { ops.push({ op: 'set', path: ref.path, data: clean(data), merge: !!options?.merge }); return b; },
    update(ref, data) { ops.push({ op: 'update', path: ref.path, data: clean(data) }); return b; },
    delete(ref) { ops.push({ op: 'delete', path: ref.path }); return b; },
    async commit() {
      if (ops.length === 0) return;
      await commitWrites(ops.splice(0, ops.length));
    },
  };
  return b;
}

/* ---------------------------------------------------------- transactions */

export interface Transaction {
  get(ref: DocumentReference): Promise<DocumentSnapshot>;
  set(ref: DocumentReference, data: any, options?: { merge?: boolean }): Transaction;
  update(ref: DocumentReference, data: any): Transaction;
  delete(ref: DocumentReference): Transaction;
}

/** Optimistic transaction: reads record doc versions, commit fails (and retries) if any changed. */
export async function runTransaction<T>(
  _db: Firestore,
  fn: (tx: Transaction) => Promise<T>,
  maxAttempts = 6
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const reads = new Map<string, number>();
    const writes: WriteOp[] = [];
    const tx: Transaction = {
      async get(ref) {
        const { doc: d } = await rpc({ op: 'get', path: ref.path });
        reads.set(ref.path, d?.v ?? 0);
        return mkSnap(ref.path, ref.id, d?.data);
      },
      set(ref, data, options) { writes.push({ op: 'set', path: ref.path, data: clean(data), merge: !!options?.merge }); return tx; },
      update(ref, data) { writes.push({ op: 'update', path: ref.path, data: clean(data) }); return tx; },
      delete(ref) { writes.push({ op: 'delete', path: ref.path }); return tx; },
    };
    const result = await fn(tx);
    try {
      await commitWrites(writes, [...reads].map(([path, v]) => ({ path, v })));
      return result;
    } catch (e: any) {
      if (e?.status === 409 && e?.code === 'aborted' && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 40 * attempt + Math.random() * 60));
        continue;
      }
      throw e;
    }
  }
}

/* --------------------------------------------------------- realtime (SSE) */

function tabOf(path: string): string {
  return path.split('/').filter((_, i) => i % 2 === 0).join('.');
}

interface Listener { tab: string; refetch: () => void }
const listeners = new Set<Listener>();
let source: EventSource | null = null;

function ensureSource() {
  if (source || typeof EventSource === 'undefined') return;
  const es = new EventSource(`${API}/events`);
  source = es;
  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.hello) listeners.forEach((l) => l.refetch()); // (re)connected: resync everything
      else if (msg.t) listeners.forEach((l) => l.tab === msg.t && l.refetch());
    } catch { /* ignore */ }
  };
}

function closeSourceIfIdle() {
  if (listeners.size === 0 && source) {
    source.close();
    source = null;
  }
}

const MIN_REFETCH_GAP_MS = 700;

export function onSnapshot(
  target: DocumentReference,
  onNext: (snap: DocumentSnapshot) => void,
  onError?: (err: Error) => void
): Unsubscribe;
export function onSnapshot(
  target: CollectionReference | Query,
  onNext: (snap: QuerySnapshot) => void,
  onError?: (err: Error) => void
): Unsubscribe;
export function onSnapshot(
  target: DocumentReference | CollectionReference | Query,
  onNext: (snap: any) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let closed = false;
  let inFlight = false;
  let again = false;
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastHash = '';

  const run = async () => {
    if (closed) return;
    if (inFlight) { again = true; return; }
    inFlight = true;
    lastRun = Date.now();
    try {
      let snap: any;
      let hash: string;
      if (target.type === 'doc') {
        const { doc: d } = await rpc({ op: 'get', path: target.path });
        hash = d ? `${d.v}` : 'none';
        snap = () => mkSnap(target.path, target.id, d?.data);
      } else {
        const constraints = target.type === 'query' ? target.constraints : [];
        const { docs } = await rpc({ op: 'query', path: target.path, cs: constraints });
        hash = docs.map((d: any) => `${d.id}:${d.v}`).join('|');
        snap = () => mkQuerySnap(docs);
      }
      if (!closed && hash !== lastHash) {
        lastHash = hash;
        onNext(snap());
      }
    } catch (err: any) {
      if (!closed) {
        if (onError) onError(err);
        else console.warn('onSnapshot error:', err);
      }
    } finally {
      inFlight = false;
      if (again && !closed) { again = false; schedule(); }
    }
  };

  const schedule = () => {
    if (closed || timer) return;
    const wait = Math.max(0, MIN_REFETCH_GAP_MS - (Date.now() - lastRun));
    timer = setTimeout(() => { timer = null; void run(); }, wait);
  };

  const listener: Listener = { tab: tabOf(target.path), refetch: schedule };
  listeners.add(listener);
  ensureSource();
  void run();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    listeners.delete(listener);
    closeSourceIfIdle();
  };
}
