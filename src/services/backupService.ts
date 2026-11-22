/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  writeBatch,
} from '../lib/sheetsDb';
import { db, handleDatabaseError, OperationType } from '../config/sheetsConfig';
import {
  DatabaseBackup,
  User,
  BackupScheduleConfig,
} from '../types';
import { logAuditEvent } from './auditService';
import { extractMaxCaseSequence } from '../utils/analyticsUtils';

const BACKUPS_COLLECTION = 'backups';
const SETTINGS_COLLECTION = 'settings';
const BACKUP_SCHEDULE_DOC_ID = 'backupSchedule';

export const DEFAULT_BACKUP_SCHEDULE: BackupScheduleConfig = {
  enabled: true,
  frequency: 'daily',
  timeOfDay: '02:00',
  dayOfWeek: 5, // Friday
  dayOfMonth: 1,
  intervalHours: 24,
  autoDownloadJson: false,
  maxRetentionCount: 30,
};

let isAutoBackupExecuting = false;

/**
 * Computes the next scheduled ISO timestamp strictly after `fromDate`.
 */
export function computeNextScheduledRun(
  config: Pick<BackupScheduleConfig, 'frequency' | 'timeOfDay' | 'dayOfWeek' | 'dayOfMonth' | 'intervalHours'>,
  fromDate: Date = new Date()
): string {
  const [rawHours, rawMinutes] = (config.timeOfDay || '02:00').split(':');
  const hours = Math.min(23, Math.max(0, Number(rawHours) || 0));
  const minutes = Math.min(59, Math.max(0, Number(rawMinutes) || 0));

  if (config.frequency === 'interval_hours') {
    const intervalHrs = Math.min(168, Math.max(1, Number(config.intervalHours) || 6));
    const next = new Date(fromDate.getTime() + intervalHrs * 60 * 60 * 1000);
    return next.toISOString();
  }

  if (config.frequency === 'weekly') {
    const targetDay = Math.min(6, Math.max(0, Number(config.dayOfWeek ?? 5)));
    const candidate = new Date(fromDate.getTime());
    const diff = (targetDay - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diff);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate.getTime() <= fromDate.getTime()) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate.toISOString();
  }

  if (config.frequency === 'monthly') {
    const targetDayOfMonth = Math.min(28, Math.max(1, Number(config.dayOfMonth ?? 1)));
    const candidate = new Date(
      fromDate.getFullYear(),
      fromDate.getMonth(),
      targetDayOfMonth,
      hours,
      minutes,
      0,
      0
    );
    if (candidate.getTime() <= fromDate.getTime()) {
      candidate.setMonth(candidate.getMonth() + 1);
      candidate.setDate(targetDayOfMonth);
      candidate.setHours(hours, minutes, 0, 0);
    }
    return candidate.toISOString();
  }

  // Default: daily
  const candidate = new Date(fromDate.getTime());
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate.getTime() <= fromDate.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.toISOString();
}

export function triggerBackupFileDownload(backup: DatabaseBackup): void {
  try {
    const blob = new Blob([backup.dataSnapshot], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = backup.backupName.replace(/[\\/:*?"<>|]/g, '-');
    a.download = `${safeName}_${backup.createdAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('Auto download skipped:', err);
  }
}

export async function fetchBackupSchedule(): Promise<BackupScheduleConfig> {
  try {
    const ref = doc(db, SETTINGS_COLLECTION, BACKUP_SCHEDULE_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const nextScheduledAt = computeNextScheduledRun(DEFAULT_BACKUP_SCHEDULE, new Date());
      const initial: BackupScheduleConfig = {
        ...DEFAULT_BACKUP_SCHEDULE,
        nextScheduledAt,
        updatedAt: new Date().toISOString(),
        updatedBy: 'النظام الافتراضي',
      };
      await setDoc(ref, initial);
      return initial;
    }

    const data = snap.data() as BackupScheduleConfig;
    return {
      ...DEFAULT_BACKUP_SCHEDULE,
      ...data,
    };
  } catch (error) {
    handleDatabaseError(error, OperationType.GET, `${SETTINGS_COLLECTION}/${BACKUP_SCHEDULE_DOC_ID}`);
  }
}

export function subscribeToBackupSchedule(
  callback: (config: BackupScheduleConfig) => void
): () => void {
  const ref = doc(db, SETTINGS_COLLECTION, BACKUP_SCHEDULE_DOC_ID);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        callback({
          ...DEFAULT_BACKUP_SCHEDULE,
          nextScheduledAt: computeNextScheduledRun(DEFAULT_BACKUP_SCHEDULE, new Date()),
        });
        return;
      }
      callback({
        ...DEFAULT_BACKUP_SCHEDULE,
        ...(snap.data() as BackupScheduleConfig),
      });
    },
    (error) => {
      console.warn('Backup schedule subscription error:', error);
    }
  );
}

export async function saveBackupSchedule(
  config: BackupScheduleConfig,
  actingUser: User
): Promise<BackupScheduleConfig> {
  try {
    const ref = doc(db, SETTINGS_COLLECTION, BACKUP_SCHEDULE_DOC_ID);
    const now = new Date();
    const normalized: BackupScheduleConfig = {
      enabled: Boolean(config.enabled),
      frequency: config.frequency || 'daily',
      timeOfDay: config.timeOfDay || '02:00',
      dayOfWeek: config.dayOfWeek ?? 5,
      dayOfMonth: Math.min(28, Math.max(1, Number(config.dayOfMonth ?? 1))),
      intervalHours: Math.min(168, Math.max(1, Number(config.intervalHours ?? 24))),
      autoDownloadJson: Boolean(config.autoDownloadJson),
      maxRetentionCount: Math.min(100, Math.max(5, Number(config.maxRetentionCount ?? 30))),
      lastRunAt: config.lastRunAt,
      lastRunKey: config.lastRunKey,
      lastBackupId: config.lastBackupId,
      lastBackupName: config.lastBackupName,
      nextScheduledAt: config.enabled
        ? computeNextScheduledRun(config, now)
        : undefined,
      updatedAt: now.toISOString(),
      updatedBy: actingUser.fullName,
    };

    // Strip undefined values before saving
    const cleanPayload = Object.fromEntries(
      Object.entries(normalized).filter(([, v]) => v !== undefined)
    );

    await setDoc(ref, cleanPayload);

    const freqDesc =
      normalized.frequency === 'daily'
        ? `يومياً الساعة ${normalized.timeOfDay}`
        : normalized.frequency === 'weekly'
        ? `أسبوعياً الساعة ${normalized.timeOfDay}`
        : normalized.frequency === 'monthly'
        ? `شهرياً يوم ${normalized.dayOfMonth} الساعة ${normalized.timeOfDay}`
        : `كل ${normalized.intervalHours} ساعة`;

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'تحديث جدول النسخ الاحتياطي التلقائي (Backup)',
      recordId: BACKUP_SCHEDULE_DOC_ID,
      details: normalized.enabled
        ? `تم تفعيل الجدولة التلقائية: ${freqDesc}`
        : 'تم إيقاف الجدولة التلقائية للنسخ الاحتياطي مؤقتاً',
    });

    return normalized;
  } catch (error) {
    handleDatabaseError(error, OperationType.WRITE, `${SETTINGS_COLLECTION}/${BACKUP_SCHEDULE_DOC_ID}`);
  }
}

async function pruneOldAutoBackups(maxRetentionCount: number): Promise<void> {
  try {
    const q = query(
      collection(db, BACKUPS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const snap = await getDocs(q);
    const autoDocs: { id: string }[] = [];
    snap.forEach((d) => {
      const data = d.data() as DatabaseBackup;
      if (data.triggerType === 'automatic') {
        autoDocs.push({ id: d.id });
      }
    });

    if (autoDocs.length > maxRetentionCount) {
      const toDelete = autoDocs.slice(maxRetentionCount);
      for (const item of toDelete) {
        await deleteDoc(doc(db, BACKUPS_COLLECTION, item.id));
      }
    }
  } catch (err) {
    console.warn('Auto backup retention prune skipped:', err);
  }
}

export async function createDatabaseBackup(
  backupName: string,
  actingUser: User,
  options?: { triggerType?: 'manual' | 'automatic'; maxRetentionCount?: number }
): Promise<DatabaseBackup> {
  try {
    const triggerType = options?.triggerType || 'manual';

    // 1. Collect all users, cases, taxpayers, callers
    const [usersSnap, casesSnap, taxpayersSnap, callersSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'cases')),
      getDocs(collection(db, 'taxpayers')),
      getDocs(collection(db, 'callers')),
    ]);

    const usersData: any[] = [];
    usersSnap.forEach((d) => usersData.push({ id: d.id, ...d.data() }));

    const casesData: any[] = [];
    casesSnap.forEach((d) => casesData.push({ id: d.id, ...d.data() }));

    const taxpayersData: any[] = [];
    taxpayersSnap.forEach((d) => taxpayersData.push({ id: d.id, ...d.data() }));

    const callersData: any[] = [];
    callersSnap.forEach((d) => callersData.push({ id: d.id, ...d.data() }));

    const payload = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      triggerType,
      users: usersData,
      cases: casesData,
      taxpayers: taxpayersData,
      callers: callersData,
    };

    const snapshotString = JSON.stringify(payload);
    const backupDocRef = doc(collection(db, BACKUPS_COLLECTION));

    const backupRecord: DatabaseBackup = {
      id: backupDocRef.id,
      backupName:
        backupName.trim() ||
        `${triggerType === 'automatic' ? 'نسخة تلقائية' : 'نسخة احتياطية'} - ${new Date().toLocaleDateString('ar-EG')}`,
      createdAt: new Date().toISOString(),
      createdBy: actingUser.fullName,
      triggerType,
      recordsCount: usersData.length + casesData.length + taxpayersData.length + callersData.length,
      casesCount: casesData.length,
      usersCount: usersData.length,
      taxpayersCount: taxpayersData.length,
      dataSnapshot: snapshotString,
    };

    await setDoc(backupDocRef, backupRecord);

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action:
        triggerType === 'automatic'
          ? 'إنشاء نسخة احتياطية تلقائية (Backup)'
          : 'إنشاء نسخة احتياطية (Backup)',
      recordId: backupDocRef.id,
      details: `تم حفظ ${backupRecord.recordsCount} سجل (${backupRecord.casesCount} حالة، ${backupRecord.usersCount} مستخدم)`,
    });

    if (triggerType === 'automatic' && options?.maxRetentionCount) {
      await pruneOldAutoBackups(options.maxRetentionCount);
    }

    return backupRecord;
  } catch (error) {
    handleDatabaseError(error, OperationType.WRITE, BACKUPS_COLLECTION);
  }
}

/**
 * Checks if a scheduled backup is due and executes it atomically (once per schedule slot across all tabs/clients).
 */
export async function checkAndRunScheduledBackup(
  actingUser: User
): Promise<DatabaseBackup | null> {
  if (isAutoBackupExecuting) return null;
  isAutoBackupExecuting = true;

  try {
    const scheduleRef = doc(db, SETTINGS_COLLECTION, BACKUP_SCHEDULE_DOC_ID);
    const now = new Date();

    const txResult = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(scheduleRef);
      if (!snap.exists()) {
        const nextScheduledAt = computeNextScheduledRun(DEFAULT_BACKUP_SCHEDULE, now);
        transaction.set(scheduleRef, {
          ...DEFAULT_BACKUP_SCHEDULE,
          nextScheduledAt,
          updatedAt: now.toISOString(),
          updatedBy: 'النظام الافتراضي',
        });
        return { shouldRun: false as const };
      }

      const data = {
        ...DEFAULT_BACKUP_SCHEDULE,
        ...(snap.data() as BackupScheduleConfig),
      };

      if (!data.enabled) {
        return { shouldRun: false as const };
      }

      const dueIso = data.nextScheduledAt || computeNextScheduledRun(data, now);
      const dueTime = new Date(dueIso).getTime();

      if (Number.isNaN(dueTime) || now.getTime() < dueTime) {
        if (!data.nextScheduledAt) {
          transaction.update(scheduleRef, { nextScheduledAt: dueIso });
        }
        return { shouldRun: false as const };
      }

      // Prevent duplicate execution for the exact same scheduled slot
      if (data.lastRunKey === dueIso) {
        const nextFuture = computeNextScheduledRun(data, now);
        transaction.update(scheduleRef, { nextScheduledAt: nextFuture });
        return { shouldRun: false as const };
      }

      const nextFuture = computeNextScheduledRun(data, now);
      transaction.update(scheduleRef, {
        lastRunKey: dueIso,
        lastRunAt: now.toISOString(),
        nextScheduledAt: nextFuture,
      });

      return {
        shouldRun: true as const,
        config: data,
      };
    });

    if (!txResult.shouldRun) {
      return null;
    }

    const schedulerActor: User = {
      ...actingUser,
      fullName: `النظام الآلي (جدولة ${txResult.config.updatedBy || 'الأمن'})`,
    };

    const timeFormatted = now.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const dateFormatted = now.toLocaleDateString('ar-EG');
    const autoName = `نسخة تلقائية مجدولة (${timeFormatted}) - ${dateFormatted}`;

    const createdBackup = await createDatabaseBackup(autoName, schedulerActor, {
      triggerType: 'automatic',
      maxRetentionCount: txResult.config.maxRetentionCount || 30,
    });

    await setDoc(
      scheduleRef,
      {
        lastBackupId: createdBackup.id,
        lastBackupName: createdBackup.backupName,
        lastRunAt: createdBackup.createdAt,
      },
      { merge: true }
    );

    if (txResult.config.autoDownloadJson && actingUser.role === 'super_admin') {
      triggerBackupFileDownload(createdBackup);
    }

    return createdBackup;
  } catch (err) {
    console.warn('Scheduled backup check skipped:', err);
    return null;
  } finally {
    isAutoBackupExecuting = false;
  }
}

export async function fetchBackups(): Promise<DatabaseBackup[]> {
  try {
    const q = query(
      collection(db, BACKUPS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    const list: DatabaseBackup[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...(d.data() as Omit<DatabaseBackup, 'id'>) });
    });
    return list;
  } catch (error) {
    handleDatabaseError(error, OperationType.LIST, BACKUPS_COLLECTION);
  }
}

export function subscribeToBackups(
  callback: (backups: DatabaseBackup[]) => void
): () => void {
  const q = query(
    collection(db, BACKUPS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DatabaseBackup[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<DatabaseBackup, 'id'>) });
      });
      callback(list);
    },
    (error) => {
      console.warn('Backups subscription error:', error);
    }
  );
}

async function writeRecordsChunked(
  collectionName: string,
  records: any[],
  chunkSize = 400
): Promise<number> {
  let count = 0;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const item of chunk) {
      if (!item || !item.id) continue;
      const itemRef = doc(db, collectionName, item.id);
      const { id, ...data } = item;
      batch.set(itemRef, data);
      count++;
    }
    await batch.commit();
  }
  return count;
}

export async function restoreDatabaseBackup(
  backupId: string,
  actingUser: User
): Promise<{ restoredRecords: number }> {
  try {
    const docRef = doc(db, BACKUPS_COLLECTION, backupId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('ملف النسخة الاحتياطية غير موجود');

    const backup = snap.data() as DatabaseBackup;
    const payload = JSON.parse(backup.dataSnapshot);

    let restoredCount = 0;

    if (payload.taxpayers && Array.isArray(payload.taxpayers)) {
      restoredCount += await writeRecordsChunked('taxpayers', payload.taxpayers);
    }

    if (payload.callers && Array.isArray(payload.callers)) {
      restoredCount += await writeRecordsChunked('callers', payload.callers);
    }

    if (payload.cases && Array.isArray(payload.cases)) {
      restoredCount += await writeRecordsChunked('cases', payload.cases);

      // Synchronize cases atomic sequence counter so future cases never collide
      const maxSeq = extractMaxCaseSequence(payload.cases);
      if (maxSeq > 0) {
        const counterRef = doc(db, 'counters', 'cases');
        const counterSnap = await getDoc(counterRef);
        const existingSeq = counterSnap.exists()
          ? Number(counterSnap.data()?.currentValue) || 0
          : 0;
        if (maxSeq > existingSeq) {
          await setDoc(counterRef, {
            currentValue: maxSeq,
            lastUpdated: new Date().toISOString(),
          });
        }
      }
    }

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'استعادة نسخة احتياطية (Restore)',
      recordId: backupId,
      details: `تمت استعادة البيانات بنجاح من النسخة: ${backup.backupName} بإجمالي ${restoredCount} سجل`,
    });

    return { restoredRecords: restoredCount };
  } catch (error) {
    handleDatabaseError(error, OperationType.WRITE, 'restore');
  }
}
