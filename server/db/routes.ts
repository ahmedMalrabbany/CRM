import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Store, DbError, type Driver, type WriteOp } from './store.ts';
import { FileDriver } from './fileDriver.ts';
import { SheetsDriver } from './sheetsDriver.ts';

function extractSheetId(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

function normalizePrivateKey(raw?: string): string {
  if (!raw) return '';
  let k = raw.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\n/g, '\n').trim();
}

function isValidPrivateKey(raw?: string): boolean {
  const normalized = normalizePrivateKey(raw);
  if (!normalized || !normalized.includes('BEGIN')) return false;
  try {
    crypto.createPrivateKey(normalized);
    return true;
  } catch {
    return false;
  }
}

function tryReadServiceAccountFile(filePath: string): { email?: string; key?: string } | null {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (
      parsed &&
      parsed.type === 'service_account' &&
      parsed.client_email &&
      parsed.private_key &&
      isValidPrivateKey(String(parsed.private_key))
    ) {
      return {
        email: String(parsed.client_email).trim(),
        key: normalizePrivateKey(String(parsed.private_key)),
      };
    }
  } catch {
    // ignore unreadable or non-JSON files
  }
  return null;
}

function resolveServiceAccountCredentials(dataDir: string): { email?: string; key?: string } {
  const envEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const envKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  let email: string | undefined = envEmail && isValidPrivateKey(envKey) ? envEmail : undefined;
  let key: string | undefined = envEmail && isValidPrivateKey(envKey) ? envKey : undefined;

  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if ((!email || !key) && rawJson) {
    if (rawJson.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawJson);
        const parsedKey = normalizePrivateKey(parsed.private_key);
        if (parsed.client_email && isValidPrivateKey(parsedKey)) {
          email = String(parsed.client_email).trim();
          key = parsedKey;
        }
      } catch {
        console.warn('[db] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON; checking other credential sources.');
      }
    } else {
      const candidates = [path.resolve(rawJson), path.resolve(dataDir, '..', rawJson)];
      for (const candidate of candidates) {
        const fromEnvPath = tryReadServiceAccountFile(candidate);
        if (fromEnvPath) {
          email = fromEnvPath.email;
          key = fromEnvPath.key;
          break;
        }
      }
    }
  }

  if ((!email || !key) && process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    const fromAppCreds = tryReadServiceAccountFile(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS.trim()));
    if (fromAppCreds) {
      email = fromAppCreds.email;
      key = fromAppCreds.key;
    }
  }

  if (!email || !key) {
    const rootDir = path.resolve(dataDir, '..');
    try {
      const entries = fs.readdirSync(rootDir);
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        const found = tryReadServiceAccountFile(path.join(rootDir, entry));
        if (found) {
          console.log(`[db] Loaded Google service-account credentials from ${entry}`);
          email = found.email;
          key = found.key;
          break;
        }
      }
    } catch {
      // ignore directory scan errors
    }
  }

  return { email, key };
}

export function createDriverFromEnv(dataDir: string): Driver {
  const sheetId = extractSheetId(process.env.GOOGLE_SHEET_ID);
  if (sheetId) {
    const { email, key } = resolveServiceAccountCredentials(dataDir);
    if (email && key) {
      return new SheetsDriver({ spreadsheetId: sheetId, clientEmail: email, privateKey: key });
    }
    console.warn('[db] GOOGLE_SHEET_ID is set but service-account credentials are missing -> falling back to local file storage (data/db.json).');
  } else {
    console.warn('[db] GOOGLE_SHEET_ID not set -> using local file storage (data/db.json). NOT for production.');
  }
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
