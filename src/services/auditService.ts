/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, addDoc, getDocs, query, orderBy, limit, onSnapshot } from '../lib/sheetsDb';
import { db, handleDatabaseError, OperationType } from '../config/sheetsConfig';
import { AuditLogItem, UserRole } from '../types';

const AUDIT_COLLECTION = 'auditLogs';

export async function logAuditEvent(params: {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  action: string;
  recordId?: string;
  details?: string;
}): Promise<void> {
  try {
    const device = `${navigator.userAgent.slice(0, 100)} (${navigator.language})`;
    const logItem: AuditLogItem = {
      userId: params.userId,
      username: params.username,
      fullName: params.fullName,
      role: params.role,
      action: params.action,
      recordId: params.recordId || '',
      device,
      details: params.details || '',
      createdAt: new Date().toISOString(),
    };
    await addDoc(collection(db, AUDIT_COLLECTION), logItem);
  } catch (error) {
    // Non-blocking log, but report to console
    console.error('Audit log failed:', error);
  }
}

export function subscribeToAuditLogs(
  callback: (logs: AuditLogItem[]) => void,
  maxItems = 100
): () => void {
  const q = query(
    collection(db, AUDIT_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(maxItems)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const logs: AuditLogItem[] = [];
      snapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...(doc.data() as AuditLogItem) });
      });
      callback(logs);
    },
    (error) => {
      handleDatabaseError(error, OperationType.LIST, AUDIT_COLLECTION);
    }
  );
}

export async function fetchAuditLogs(maxItems = 200): Promise<AuditLogItem[]> {
  try {
    const q = query(
      collection(db, AUDIT_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(maxItems)
    );
    const snap = await getDocs(q);
    const logs: AuditLogItem[] = [];
    snap.forEach((doc) => {
      logs.push({ id: doc.id, ...(doc.data() as AuditLogItem) });
    });
    return logs;
  } catch (error) {
    handleDatabaseError(error, OperationType.LIST, AUDIT_COLLECTION);
  }
}
