/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Google Sheets CRM Database configuration and error utilities.
 */

import { db } from '../lib/sheetsDb';
import {
  TARGET_SPREADSHEET_ID,
  TARGET_DETAILS_TAB,
  TARGET_SPREADSHEET_URL,
} from '../utils/sheetsDetailsMapper';

export {
  db,
  TARGET_SPREADSHEET_ID,
  TARGET_DETAILS_TAB,
  TARGET_SPREADSHEET_URL,
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleDatabaseError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Sheets DB Error:', JSON.stringify({ error: message, operationType, path }));
  throw new Error(
    JSON.stringify({ error: message, operationType, path })
  );
}

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const r = await fetch('/api/db/status');
    return r.ok;
  } catch {
    return false;
  }
}
