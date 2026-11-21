/**
 * Shared helpers: path -> (tab, relId), field sentinels, query evaluation.
 */

export type Json = any;
export type DocData = Record<string, Json>;

export interface DocRec {
  path: string; // full doc path e.g. cases/ABC/timeline/XYZ
  data: DocData;
  v: number; // per-doc version for optimistic transactions
}

export interface PathInfo {
  tab: string; // sheet tab name  (cases.timeline)
  relId: string; // row key        (ABC/XYZ)
  id: string; // last segment
  parentKey: string; // 'ABC/'  prefix of relId for sub-collections, '' for top-level
}

export function splitPath(p: string): string[] {
  return p.split('/').filter(Boolean);
}

export function docPathInfo(docPath: string): PathInfo {
  const segs = splitPath(docPath);
  if (segs.length < 2 || segs.length % 2 !== 0) throw new Error(`Invalid document path: ${docPath}`);
  const tab = segs.filter((_, i) => i % 2 === 0).join('.');
  const ids = segs.filter((_, i) => i % 2 === 1);
  return { tab, relId: ids.join('/'), id: ids[ids.length - 1], parentKey: ids.length > 1 ? ids.slice(0, -1).join('/') + '/' : '' };
}

export function collectionInfo(colPath: string): { tab: string; parentKey: string } {
  const segs = splitPath(colPath);
  if (segs.length < 1 || segs.length % 2 !== 1) throw new Error(`Invalid collection path: ${colPath}`);
  const tab = segs.filter((_, i) => i % 2 === 0).join('.');
  const ids = segs.filter((_, i) => i % 2 === 1);
  return { tab, parentKey: ids.length ? ids.join('/') + '/' : '' };
}

export function tabFromPath(p: string): string {
  const segs = splitPath(p);
  return segs.filter((_, i) => i % 2 === 0).join('.');
}

/* ---------------- deep helpers ---------------- */

export function deepEqual(a: Json, b: Json): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function clone<T>(x: T): T {
  return x === undefined ? x : JSON.parse(JSON.stringify(x));
}

function getByPath(obj: any, field: string): any {
  if (field in obj) return obj[field];
  let cur = obj;
  for (const part of field.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function setByPath(obj: any, field: string, value: any) {
  const parts = field.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object' || Array.isArray(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deleteByPath(obj: any, field: string) {
  const parts = field.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur?.[parts[i]];
    if (cur == null || typeof cur !== 'object') return;
  }
  delete cur[parts[parts.length - 1]];
}

/* ---------------- sentinels (serverTimestamp, arrayUnion, ...) ---------------- */

const isSentinel = (v: any) => v && typeof v === 'object' && typeof v.__fv === 'string';

function resolveValue(existing: any, v: any, nowIso: string): any {
  if (isSentinel(v)) {
    switch (v.__fv) {
      case 'serverTimestamp':
        return nowIso;
      case 'increment':
        return (typeof existing === 'number' ? existing : 0) + Number(v.n || 0);
      case 'arrayUnion': {
        const arr: any[] = Array.isArray(existing) ? [...existing] : [];
        for (const el of v.elements || []) if (!arr.some((x) => deepEqual(x, el))) arr.push(el);
        return arr;
      }
      case 'arrayRemove': {
        const arr: any[] = Array.isArray(existing) ? existing : [];
        return arr.filter((x) => !(v.elements || []).some((el: any) => deepEqual(x, el)));
      }
      case 'deleteField':
        return undefined;
    }
  }
  if (Array.isArray(v)) return v.map((x) => resolveValue(undefined, x, nowIso));
  if (v && typeof v === 'object') {
    const out: any = {};
    for (const [k, val] of Object.entries(v)) {
      const r = resolveValue(existing?.[k], val, nowIso);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  return v;
}

/** setDoc without merge */
export function applySet(data: DocData, nowIso: string): DocData {
  return resolveValue(undefined, data, nowIso) as DocData;
}

/** setDoc with {merge:true} : deep-merge plain objects */
export function applyMerge(existing: DocData | undefined, data: DocData, nowIso: string): DocData {
  const base = clone(existing || {});
  const merge = (target: any, src: any) => {
    for (const [k, v] of Object.entries(src)) {
      if (isSentinel(v)) {
        const r = resolveValue(target[k], v, nowIso);
        if (r === undefined) delete target[k];
        else target[k] = r;
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {};
        merge(target[k], v);
      } else if (v !== undefined) {
        target[k] = resolveValue(target[k], v, nowIso);
      }
    }
  };
  merge(base, data);
  return base;
}

/** updateDoc : top-level keys, dotted keys allowed */
export function applyUpdate(existing: DocData, data: DocData, nowIso: string): DocData {
  const out = clone(existing);
  for (const [k, v] of Object.entries(data)) {
    const cur = getByPath(out, k);
    const r = resolveValue(cur, v, nowIso);
    if (r === undefined) deleteByPath(out, k);
    else setByPath(out, k, r);
  }
  return out;
}

/* ---------------- query evaluation ---------------- */

export type Constraint =
  | { type: 'where'; field: string; op: string; value: Json }
  | { type: 'orderBy'; field: string; dir: 'asc' | 'desc' }
  | { type: 'limit'; n: number };

function cmp(a: any, b: any): number {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const sa = typeof a === 'object' ? JSON.stringify(a) : String(a);
  const sb = typeof b === 'object' ? JSON.stringify(b) : String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function matches(data: DocData, c: Extract<Constraint, { type: 'where' }>): boolean {
  const v = getByPath(data, c.field);
  const t = c.value;
  switch (c.op) {
    case '==':
      return v !== undefined && deepEqual(v, t);
    case '!=':
      return v !== undefined && !deepEqual(v, t);
    case '<':
      return v !== undefined && cmp(v, t) < 0;
    case '<=':
      return v !== undefined && cmp(v, t) <= 0;
    case '>':
      return v !== undefined && cmp(v, t) > 0;
    case '>=':
      return v !== undefined && cmp(v, t) >= 0;
    case 'in':
      return Array.isArray(t) && t.some((x) => deepEqual(x, v));
    case 'not-in':
      return v !== undefined && Array.isArray(t) && !t.some((x) => deepEqual(x, v));
    case 'array-contains':
      return Array.isArray(v) && v.some((x) => deepEqual(x, t));
    case 'array-contains-any':
      return Array.isArray(v) && Array.isArray(t) && v.some((x) => t.some((y) => deepEqual(x, y)));
    default:
      throw new Error(`Unsupported where operator: ${c.op}`);
  }
}

export function runQuery(
  docs: Array<{ id: string; rec: DocRec }>,
  constraints: Constraint[]
): Array<{ id: string; rec: DocRec }> {
  let out = docs;
  const wheres = constraints.filter((c): c is Extract<Constraint, { type: 'where' }> => c.type === 'where');
  const orders = constraints.filter((c): c is Extract<Constraint, { type: 'orderBy' }> => c.type === 'orderBy');
  const lim = constraints.find((c): c is Extract<Constraint, { type: 'limit' }> => c.type === 'limit');

  for (const w of wheres) out = out.filter((d) => matches(d.rec.data, w));
  // Firestore excludes docs that lack an orderBy field
  for (const o of orders) out = out.filter((d) => getByPath(d.rec.data, o.field) !== undefined);

  const sorted = [...out].sort((a, b) => {
    for (const o of orders) {
      const r = cmp(getByPath(a.rec.data, o.field), getByPath(b.rec.data, o.field));
      if (r !== 0) return o.dir === 'desc' ? -r : r;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return lim ? sorted.slice(0, Math.max(0, lim.n)) : sorted;
}
