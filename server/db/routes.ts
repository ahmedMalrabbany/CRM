import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Store, DbError, type Driver, type WriteOp } from './store.ts';
import { FileDriver } from './fileDriver.ts';
import { SheetsDriver } from './sheetsDriver.ts';

export function createDriverFromEnv(dataDir: string): Driver {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId) {
    let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let key = process.env.GOOGLE_PRIVATE_KEY;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const j = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      email = j.client_email;
      key = j.private_key;
    }
    if (!email || !key) throw new Error('GOOGLE_SHEET_ID is set but service-account credentials are missing');
    return new SheetsDriver({ spreadsheetId: sheetId, clientEmail: email, privateKey: key });
  }
  console.warn('[db] GOOGLE_SHEET_ID not set -> using local file storage (data/db.json). NOT for production.');
  fs.mkdirSync(dataDir, { recursive: true });
  return new FileDriver(path.join(dataDir, 'db.json'));
}

export function createDbRouter(store: Store): Router {
  const r = Router();

  const fail = (res: Response, e: any) => {
    const status = e instanceof DbError ? e.status : 500;
    const code = e instanceof DbError ? e.code : 'internal';
    if (status === 500) console.error('[db] error:', e);
    res.status(status).json({ error: String(e?.message || e), code });
  };

  r.post('/rpc', (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      if (b.op === 'get') {
        return res.json({ doc: store.getDoc(String(b.path)) });
      }
      if (b.op === 'query') {
        return res.json({ docs: store.query(String(b.path), Array.isArray(b.cs) ? b.cs : []) });
      }
      if (b.op === 'commit') {
        const writes = (Array.isArray(b.writes) ? b.writes : []) as WriteOp[];
        if (writes.length > 5000) throw new DbError('invalid', 'Too many writes in one commit');
        store.commit(writes, Array.isArray(b.reads) ? b.reads : []);
        return res.json({ ok: true });
      }
      throw new DbError('invalid', 'Unknown op');
    } catch (e) {
      fail(res, e);
    }
  });

  // Server-Sent Events: tells clients which collection (tab) changed.
  r.get('/events', (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify({ hello: true })}\n\n`);
    const onChange = (tab: string) => res.write(`data: ${JSON.stringify({ t: tab })}\n\n`);
    store.on('change', onChange);
    const ka = setInterval(() => res.write(': ka\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ka);
      store.off('change', onChange);
    });
  });

  r.get('/status', (_req, res) => {
    res.json({
      driver: store.driverName,
      pendingWrites: store.pendingWrites,
      lastFlushAt: store.lastFlushAt,
      lastFlushError: store.lastFlushError,
      counts: store.stats(),
    });
  });

  // Re-read the sheet after manual edits. Protected by DB_ADMIN_TOKEN.
  r.post('/reload', async (req, res) => {
    const token = process.env.DB_ADMIN_TOKEN;
    if (!token || req.header('x-admin-token') !== token) return res.status(403).json({ error: 'forbidden' });
    try {
      await store.reload();
      res.json({ ok: true, counts: store.stats() });
    } catch (e) {
      fail(res, e);
    }
  });

  return r;
}
