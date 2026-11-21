/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Storage backend: Google Sheets (via the app server). Firebase is no longer used.
 * File name kept so existing imports (`../config/firebase`) keep working.
 */

import { db } from '../lib/sheetsDb';

export { db };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error('DB Error: ', JSON.stringify({ error: message, operationType, path }));
  throw new Error(
    JSON.stringify({ error: message, operationType, path, authInfo: {} })
  );
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const r = await fetch('/api/db/status');
    return r.ok;
  } catch {
    return false;
  }
}
