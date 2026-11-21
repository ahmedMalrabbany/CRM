/** Local JSON-file driver: used when Google Sheets is not configured (dev / fallback). */
import fs from 'fs';
import path from 'path';
import type { Driver, PersistChange } from './store.ts';
import type { DocData } from './core.ts';

export class FileDriver implements Driver {
  name = 'local-file';
  private state: Record<string, Record<string, DocData>> = {};
  constructor(private file: string) {}

  async load() {
    const out = new Map<string, Map<string, DocData>>();
    try {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.state = {};
    }
    for (const [tab, rows] of Object.entries(this.state)) out.set(tab, new Map(Object.entries(rows)));
    return out;
  }

  async persist(changes: PersistChange[]) {
    for (const c of changes) {
      this.state[c.tab] ??= {};
      if (c.data === null) delete this.state[c.tab][c.relId];
      else this.state[c.tab][c.relId] = c.data;
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.file);
  }
}
