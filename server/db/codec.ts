/**
 * Cell codec: one document field <-> one spreadsheet cell (type-safe round trip).
 *  - numbers / booleans are stored natively
 *  - plain strings are stored as-is
 *  - "", null, objects, arrays and strings starting with § are stored as  §:<json>
 *  - texts longer than a cell are split over extra columns  field§2, field§3 ...
 */
import type { DocData } from './core.ts';

export const CELL_CHUNK = 45_000;
export const MAX_CHUNKS = 40;

export type Cell = string | number | boolean;

export function encodeFields(data: DocData): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  for (const [key, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (key.includes('§') || key === '_id') throw new Error(`Unsupported field name: ${key}`);
    if (typeof v === 'number' && Number.isFinite(v)) { out[key] = v; continue; }
    if (typeof v === 'boolean') { out[key] = v; continue; }

    let text: string;
    if (typeof v === 'string' && v.length > 0 && !v.startsWith('§')) text = v;
    else if (typeof v === 'string') text = '§:' + JSON.stringify(v);
    else text = '§:' + JSON.stringify(v === undefined || (typeof v === 'number') ? null : v);

    if (text.length <= CELL_CHUNK) { out[key] = text; continue; }

    const n = Math.ceil(text.length / CELL_CHUNK);
    if (n > MAX_CHUNKS) throw new Error(`Field "${key}" is too large for Google Sheets (${text.length} chars)`);
    out[key] = `§c${n}:` + text.slice(0, CELL_CHUNK);
    for (let i = 2; i <= n; i++) out[`${key}§${i}`] = text.slice((i - 1) * CELL_CHUNK, i * CELL_CHUNK);
  }
  return out;
}

export function decodeRow(headers: string[], row: any[]): DocData {
  const idx = new Map<string, number>();
  headers.forEach((h, i) => idx.set(h, i));
  const data: DocData = {};
  for (let i = 1; i < headers.length; i++) {
    const h = headers[i];
    if (!h || /§\d+$/.test(h)) continue;
    let cell = row[i];
    if (cell === undefined || cell === null || cell === '') continue;
    if (typeof cell === 'string') {
      const m = /^§c(\d+):/.exec(cell);
      if (m) {
        let text = cell.slice(m[0].length);
        for (let c = 2; c <= Number(m[1]); c++) {
          const ci = idx.get(`${h}§${c}`);
          text += ci !== undefined && row[ci] != null ? String(row[ci]) : '';
        }
        cell = text;
      }
      if (typeof cell === 'string' && cell.startsWith('§:')) {
        try { cell = JSON.parse(cell.slice(2)); } catch { /* keep raw */ }
      }
    }
    data[h] = cell;
  }
  return data;
}
