/**
 * Google Sheets persistence driver (service-account auth, plain REST).
 * One tab per collection. Row 1 = headers (A1 = "_id"). Each doc = one row.
 * Deleted rows are blanked and reused, so row numbers never shift.
 */
import { JWT } from 'google-auth-library';
import type { Driver, PersistChange } from './store.ts';
import type { DocData } from './core.ts';
import { decodeRow, encodeFields } from './codec.ts';

interface TabState {
  sheetId: number;
  headers: string[];
  rowOf: Map<string, number>;
  free: number[];
  nextRow: number;
  rowCount: number;
  colCount: number;
}

export interface SheetsOptions {
  spreadsheetId: string;
  clientEmail?: string;
  privateKey?: string;
  fetchImpl?: typeof fetch;
  getToken?: () => Promise<string>;
  baseUrl?: string;
}

const q = (title: string) => `'${title.replace(/'/g, "''")}'`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SheetsDriver implements Driver {
  name = 'google-sheets';
  private tabs = new Map<string, TabState>();
  private needsResync = false;
  private fetchImpl: typeof fetch;
  private base: string;
  private jwt?: JWT;

  constructor(private opts: SheetsOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.base = opts.baseUrl ?? 'https://sheets.googleapis.com/v4/spreadsheets';
    if (!opts.getToken) {
      this.jwt = new JWT({
        email: opts.clientEmail,
        key: (opts.privateKey || '').replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
  }

  private async token(): Promise<string> {
    if (this.opts.getToken) return this.opts.getToken();
    const t = await this.jwt!.getAccessToken();
    if (!t.token) throw new Error('Could not obtain Google access token');
    return t.token;
  }

  private async api(method: 'GET' | 'POST', url: string, body?: unknown): Promise<any> {
    let lastErr: any;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (res.ok) return await res.json();
        const text = await res.text();
        const err: any = new Error(`Sheets API ${res.status}: ${text.slice(0, 300)}`);
        err.status = res.status;
        if (res.status !== 429 && res.status < 500) throw err; // not retryable
        lastErr = err;
        const ra = Number(res.headers.get('retry-after'));
        await sleep(ra > 0 ? ra * 1000 : 1000 * 2 ** attempt);
      } catch (e: any) {
        if (e?.status && e.status !== 429 && e.status < 500) throw e;
        lastErr = e;
        await sleep(1000 * 2 ** attempt);
      }
    }
    throw lastErr;
  }

  /* ------------------------------------------------------------ load */

  async load(): Promise<Map<string, Map<string, DocData>>> {
    const out = new Map<string, Map<string, DocData>>();
    this.tabs.clear();
    const id = this.opts.spreadsheetId;
    const meta = await this.api(
      'GET',
      `${this.base}/${id}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`
    );
    const sheets: any[] = (meta.sheets || []).map((s: any) => s.properties).filter((p: any) => !p.title.startsWith('_'));
    if (sheets.length === 0) return out;

    const ranges = sheets.map((p) => `ranges=${encodeURIComponent(q(p.title))}`).join('&');
    const vr = await this.api(
      'GET',
      `${this.base}/${id}/values:batchGet?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&${ranges}`
    );

    sheets.forEach((p, i) => {
      const values: any[][] = vr.valueRanges?.[i]?.values || [];
      const headers = (values[0] || []).map((h) => String(h ?? ''));
      if (headers[0] !== '_id') return; // not one of ours
      const st: TabState = {
        sheetId: p.sheetId,
        headers,
        rowOf: new Map(),
        free: [],
        nextRow: values.length + 1,
        rowCount: p.gridProperties?.rowCount ?? 1000,
        colCount: p.gridProperties?.columnCount ?? 26,
      };
      const rows = new Map<string, DocData>();
      for (let r = 1; r < values.length; r++) {
        const row = values[r] || [];
        const rid = row[0];
        if (rid === undefined || rid === null || rid === '') { st.free.push(r + 1); continue; }
        const relId = String(rid);
        st.rowOf.set(relId, r + 1);
        rows.set(relId, decodeRow(headers, row));
      }
      this.tabs.set(p.title, st);
      out.set(p.title, rows);
    });
    this.needsResync = false;
    return out;
  }

  /* ------------------------------------------------------------ persist */

  async persist(changes: PersistChange[]): Promise<void> {
    if (this.needsResync) await this.load();
    try {
      await this.persistInner(changes);
    } catch (e) {
      this.needsResync = true; // driver bookkeeping may be ahead of the sheet; rebuild next time
      throw e;
    }
  }

  private async persistInner(changes: PersistChange[]) {
    const id = this.opts.spreadsheetId;
    const byTab = new Map<string, PersistChange[]>();
    for (const c of changes) {
      if (!byTab.has(c.tab)) byTab.set(c.tab, []);
      byTab.get(c.tab)!.push(c);
    }

    // 1) create missing tabs
    const missing = [...byTab.keys()].filter((t) => !this.tabs.has(t) && byTab.get(t)!.some((c) => c.data !== null));
    if (missing.length) {
      const res = await this.api('POST', `${this.base}/${id}:batchUpdate`, {
        requests: missing.map((title) => ({
          addSheet: { properties: { title, gridProperties: { rowCount: 1000, columnCount: 26 } } },
        })),
      });
      missing.forEach((title, i) => {
        const p = res.replies[i].addSheet.properties;
        this.tabs.set(title, {
          sheetId: p.sheetId, headers: ['_id'], rowOf: new Map(), free: [], nextRow: 2, rowCount: 1000, colCount: 26,
        });
      });
    }

    // 2) compute header growth + row placement
    const writes: Array<{ range: string; values: any[][] }> = [];
    const resizes: any[] = [];
    for (const [tab, list] of byTab) {
      const st = this.tabs.get(tab);
      if (!st) continue; // only deletes for a tab that doesn't exist
      const headersBefore = st.headers.length;
      const encoded = new Map<string, Record<string, any>>();
      const hset = new Set(st.headers);
      for (const c of list) {
        if (c.data === null) continue;
        const cells = encodeFields(c.data);
        encoded.set(c.relId, cells);
        for (const k of Object.keys(cells)) if (!hset.has(k)) { hset.add(k); st.headers.push(k); }
      }
      if (st.headers.length !== headersBefore) writes.push({ range: `${q(tab)}!A1`, values: [st.headers] });

      st.free.sort((a, b) => a - b);
      for (const c of list) {
        if (c.data === null) {
          const row = st.rowOf.get(c.relId);
          if (!row) continue;
          st.rowOf.delete(c.relId);
          st.free.push(row);
          writes.push({ range: `${q(tab)}!A${row}`, values: [st.headers.map(() => '')] });
        } else {
          let row = st.rowOf.get(c.relId);
          if (!row) {
            row = st.free.length ? st.free.shift()! : st.nextRow++;
            st.rowOf.set(c.relId, row);
          }
          const cells = encoded.get(c.relId)!;
          writes.push({
            range: `${q(tab)}!A${row}`,
            values: [st.headers.map((h) => (h === '_id' ? c.relId : cells[h] ?? ''))],
          });
        }
      }

      const needRows = st.nextRow + 200;
      const needCols = st.headers.length + 2;
      if (needRows > st.rowCount || needCols > st.colCount) {
        st.rowCount = Math.max(st.rowCount, needRows + 500);
        st.colCount = Math.max(st.colCount, needCols + 4);
        resizes.push({
          updateSheetProperties: {
            properties: { sheetId: st.sheetId, gridProperties: { rowCount: st.rowCount, columnCount: st.colCount } },
            fields: 'gridProperties.rowCount,gridProperties.columnCount',
          },
        });
      }
    }

    // 3) grow grids first, then write values (chunked)
    if (resizes.length) await this.api('POST', `${this.base}/${id}:batchUpdate`, { requests: resizes });
    for (let i = 0; i < writes.length; i += 400) {
      await this.api('POST', `${this.base}/${id}/values:batchUpdate`, {
        valueInputOption: 'RAW',
        data: writes.slice(i, i + 400),
      });
    }
  }
}
