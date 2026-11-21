/**
 * In-memory document store with optimistic versions, atomic commits,
 * write-behind persistence (Google Sheets / local file) and change events.
 */
import { EventEmitter } from 'events';
import {
  DocData, DocRec, Constraint, applyMerge, applySet, applyUpdate, clone,
  collectionInfo, docPathInfo, runQuery,
} from './core.ts';

export interface PersistChange {
  tab: string;
  relId: string;
  data: DocData | null; // null => delete
}

export interface Driver {
  name: string;
  load(): Promise<Map<string, Map<string, DocData>>>;
  persist(changes: PersistChange[]): Promise<void>;
}

export type WriteOp =
  | { op: 'set'; path: string; data: DocData; merge?: boolean }
  | { op: 'update'; path: string; data: DocData }
  | { op: 'delete'; path: string };

export class DbError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

// Presence heartbeats must not hit Sheets or wake every client.
const PRESENCE_KEYS = new Set(['isOnline', 'lastActiveAt', 'lastLoginAt']);
const PRESENCE_NOTIFY_MS = 15_000;

export class Store extends EventEmitter {
  private tabs = new Map<string, Map<string, DocRec>>();
  private dirty = new Map<string, PersistChange>();
  private flushing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private presenceTimer: NodeJS.Timeout | null = null;
  private failures = 0;
  lastFlushError: string | null = null;
  lastFlushAt: string | null = null;

  constructor(private driver: Driver, private flushIntervalMs = 3000) {
    super();
    this.setMaxListeners(0);
  }

  get driverName() { return this.driver.name; }
  get pendingWrites() { return this.dirty.size; }

  async init() {
    const loaded = await this.driver.load();
    this.tabs.clear();
    for (const [tab, rows] of loaded) {
      const m = new Map<string, DocRec>();
      for (const [relId, data] of rows) {
        // reconstruct full path from tab + relId
        const tabParts = tab.split('.');
        const ids = relId.split('/');
        const path = tabParts.map((t, i) => (ids[i] !== undefined ? `${t}/${ids[i]}` : t)).join('/');
        m.set(relId, { path, data, v: 1 });
      }
      this.tabs.set(tab, m);
    }
  }

  stats() {
    const out: Record<string, number> = {};
    for (const [t, m] of this.tabs) out[t] = m.size;
    return out;
  }

  /* ---------- reads ---------- */

  getDoc(path: string): DocRec | null {
    const { tab, relId } = docPathInfo(path);
    const rec = this.tabs.get(tab)?.get(relId);
    return rec ? clone(rec) : null;
  }

  query(colPath: string, constraints: Constraint[]) {
    const { tab, parentKey } = collectionInfo(colPath);
    const rows = this.tabs.get(tab);
    const docs: Array<{ id: string; rec: DocRec }> = [];
    if (rows) {
      for (const [relId, rec] of rows) {
        if (parentKey) {
          if (!relId.startsWith(parentKey)) continue;
          const rest = relId.slice(parentKey.length);
          if (rest.includes('/')) continue;
          docs.push({ id: rest, rec });
        } else if (!relId.includes('/')) {
          docs.push({ id: relId, rec });
        }
      }
    }
    return runQuery(docs, constraints).map((d) => ({ id: d.id, path: d.rec.path, data: clone(d.rec.data), v: d.rec.v }));
  }

  /* ---------- writes ---------- */

  /**
   * Atomic commit. `reads` (from client transactions) carry the doc versions the
   * client saw; if any differ we reject with a conflict and the client retries.
   */
  commit(writes: WriteOp[], reads: Array<{ path: string; v: number }> = []) {
    for (const r of reads) {
      const cur = this.getRec(r.path);
      if ((cur?.v ?? 0) !== r.v) throw new DbError('aborted', 'Transaction conflict', 409);
    }

    const nowIso = new Date().toISOString();
    const pending = new Map<string, DocData | null>();
    const readPending = (path: string): DocData | undefined => {
      if (pending.has(path)) return pending.get(path) ?? undefined;
      return this.getRec(path)?.data;
    };

    let allPresence = writes.length > 0;
    for (const w of writes) {
      const existing = readPending(w.path);
      if (w.op === 'set') {
        pending.set(w.path, w.merge ? applyMerge(existing, w.data, nowIso) : applySet(w.data, nowIso));
        allPresence = false;
      } else if (w.op === 'update') {
        if (!existing) throw new DbError('not-found', `No document to update: ${w.path}`, 404);
        const keys = Object.keys(w.data);
        const isPresenceShape =
          w.path.startsWith('users/') && w.path.split('/').length === 2 &&
          keys.length > 0 && keys.every((k) => PRESENCE_KEYS.has(k));
        const next = applyUpdate(existing, w.data, nowIso);
        // Only a real online<->offline flip is persisted; heartbeats stay in memory.
        if (!(isPresenceShape && next.isOnline === existing.isOnline)) allPresence = false;
        pending.set(w.path, next);
      } else {
        pending.set(w.path, null);
        allPresence = false;
      }
    }

    const touchedTabs = new Set<string>();
    for (const [path, data] of pending) {
      const { tab, relId } = docPathInfo(path);
      let rows = this.tabs.get(tab);
      if (!rows) this.tabs.set(tab, (rows = new Map()));
      touchedTabs.add(tab);
      if (data === null) {
        rows.delete(relId);
      } else {
        const prev = rows.get(relId);
        rows.set(relId, { path, data, v: (prev?.v ?? 0) + 1 });
      }
      if (!allPresence) this.markDirty({ tab, relId, data });
    }

    if (allPresence) this.notifyPresence(touchedTabs);
    else {
      for (const t of touchedTabs) this.emit('change', t);
      this.scheduleFlush();
    }
  }

  private getRec(path: string): DocRec | undefined {
    const { tab, relId } = docPathInfo(path);
    return this.tabs.get(tab)?.get(relId);
  }

  private notifyPresence(tabs: Set<string>) {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      for (const t of tabs) this.emit('change', t);
    }, PRESENCE_NOTIFY_MS);
  }

  /* ---------- write-behind persistence ---------- */

  private markDirty(c: PersistChange) {
    this.dirty.set(`${c.tab}\u0000${c.relId}`, c);
  }

  private scheduleFlush(delay = this.flushIntervalMs) {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.dirty.size === 0) return;
    this.flushing = true;
    const batch = this.dirty;
    this.dirty = new Map();
    try {
      await this.driver.persist([...batch.values()]);
      this.failures = 0;
      this.lastFlushError = null;
      this.lastFlushAt = new Date().toISOString();
    } catch (err: any) {
      this.failures++;
      this.lastFlushError = String(err?.message || err);
      console.error(`[db] flush failed (attempt ${this.failures}):`, this.lastFlushError);
      // put back anything that wasn't superseded meanwhile
      for (const [k, v] of batch) if (!this.dirty.has(k)) this.dirty.set(k, v);
    } finally {
      this.flushing = false;
      if (this.dirty.size > 0) {
        const backoff = this.failures ? Math.min(60_000, 2000 * 2 ** this.failures) : this.flushIntervalMs;
        this.scheduleFlush(backoff);
      }
    }
  }

  async flushAndWait(timeoutMs = 15_000) {
    const start = Date.now();
    while ((this.dirty.size > 0 || this.flushing) && Date.now() - start < timeoutMs) {
      if (!this.flushing) await this.flush();
      else await new Promise((r) => setTimeout(r, 100));
      if (this.failures > 2) break;
    }
  }

  /** Re-read everything from the driver (after manual edits in the sheet). */
  async reload() {
    if (this.dirty.size > 0 || this.flushing) throw new DbError('busy', 'Pending writes, try again in a few seconds', 409);
    await this.init();
    for (const t of this.tabs.keys()) this.emit('change', t);
  }
}
