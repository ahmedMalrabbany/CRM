/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  addDoc,
  writeBatch
} from '../lib/sheetsDb';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import {
  Case,
  CaseStatus,
  TimelineEvent,
  User,
  NotificationItem,
  CaseAttachment,
  CaseAttachmentStage,
} from '../types';
import { logAuditEvent } from './auditService';
import {
  deleteUploadedAttachmentFile,
  getAttachmentStageLabel,
  MAX_ATTACHMENTS_PER_CASE,
} from './attachmentService';

const CASES_COLLECTION = 'cases';
const COUNTER_DOC_PATH = 'counters/cases';
const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Recursively removes any key with `undefined` value so Firestore never throws
 * "Unsupported field value: undefined".
 */
export function cleanFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data.map((item) => cleanFirestoreData(item)) as any;
  }
  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        if (value && typeof value === 'object' && !(value instanceof Date)) {
          cleaned[key] = cleanFirestoreData(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned as T;
  }
  return data;
}

/**
 * Global atomic counter for unique sequential Case IDs (e.g. CRM-000001)
 */
export async function generateNextCaseId(): Promise<string> {
  const counterRef = doc(db, 'counters', 'cases');
  try {
    const nextNumber = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      let current = 0;
      if (counterSnap.exists()) {
        current = counterSnap.data().currentValue || 0;
      }
      const next = current + 1;
      transaction.set(counterRef, {
        currentValue: next,
        lastUpdated: new Date().toISOString(),
      });
      return next;
    });

    return `CRM-${String(nextNumber).padStart(6, '0')}`;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, COUNTER_DOC_PATH);
  }
}

/**
 * Append immutable event to Case Timeline
 */
export async function addTimelineEvent(caseDocId: string, event: Omit<TimelineEvent, 'createdAt'>): Promise<void> {
  try {
    const timelineRef = collection(db, CASES_COLLECTION, caseDocId, 'timeline');
    const newEvent: TimelineEvent = {
      ...event,
      createdAt: new Date().toISOString(),
    };
    await addDoc(timelineRef, cleanFirestoreData(newEvent));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${CASES_COLLECTION}/${caseDocId}/timeline`);
  }
}

/**
 * Checks whether a case currently resides inside the given user's account.
 */
export function isCaseOwnedByUser(caseItem: Pick<Case, 'assignedTo' | 'status' | 'createdById' | 'createdByCrmUser'>, user: Pick<User, 'id' | 'username' | 'crmUser'>): boolean {
  if (!caseItem || !user) return false;
  const assigned = (caseItem.assignedTo || '').trim();
  if (assigned) {
    return (
      assigned === user.id ||
      assigned === user.username ||
      assigned === user.crmUser
    );
  }
  const isPooledToQueue =
    caseItem.status === 'محولة للإدارة' ||
    caseItem.status === 'محولة للدعم الفني' ||
    caseItem.status === 'محولة للدعم التقني';
  if (isPooledToQueue) return false;

  return (
    caseItem.createdById === user.id ||
    caseItem.createdByCrmUser === user.crmUser
  );
}

/**
 * Determines whether a user is allowed to claim a case into their own account:
 * - Closed / deleted / already-owned cases cannot be claimed.
 * - Call agents can claim unassigned/pooled cases AND cases currently in Management / Tech Support / Admin queues or accounts (to reply & close).
 * - Management / Tech Support / Admin can claim unassigned/pooled cases (transferred to Management / Tech Support or unassigned).
 */
export function canUserClaimCase(
  caseItem: Pick<
    Case,
    'assignedTo' | 'assignedToRole' | 'status' | 'createdById' | 'createdByCrmUser' | 'isDeleted'
  >,
  user: Pick<User, 'id' | 'username' | 'crmUser' | 'role'>
): boolean {
  if (!caseItem || !user) return false;
  if (caseItem.isDeleted || caseItem.status === 'مغلقة') return false;
  if (isCaseOwnedByUser(caseItem, user)) return false;

  const assigned = (caseItem.assignedTo || '').trim();
  const isPooledQueue =
    !assigned ||
    caseItem.status === 'محولة للإدارة' ||
    caseItem.status === 'محولة للدعم الفني' ||
    caseItem.status === 'محولة للدعم التقني';

  if (user.role === 'agent') {
    const inManagementOrSupportAccount =
      caseItem.assignedToRole === 'management' ||
      caseItem.assignedToRole === 'technical_support' ||
      caseItem.assignedToRole === 'super_admin';
    return isPooledQueue || inManagementOrSupportAccount;
  }

  return isPooledQueue;
}

export const OVERDUE_ACTION_HOURS = 72;
export const OVERDUE_ACTION_MS = OVERDUE_ACTION_HOURS * 60 * 60 * 1000;

export function getCaseLastActionDateMs(caseItem: Pick<Case, 'updatedAt' | 'createdAt'>): number {
  const raw = caseItem?.updatedAt || caseItem?.createdAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function getCaseIdleHours(
  caseItem: Pick<Case, 'updatedAt' | 'createdAt'>,
  nowMs = Date.now()
): number {
  const lastMs = getCaseLastActionDateMs(caseItem);
  if (!lastMs) return 0;
  return Math.max(0, (nowMs - lastMs) / (1000 * 60 * 60));
}

export function isCaseOverdue72Hours(
  caseItem: Pick<Case, 'status' | 'isDeleted' | 'updatedAt' | 'createdAt'>,
  nowMs = Date.now()
): boolean {
  if (!caseItem || caseItem.isDeleted || caseItem.status === 'مغلقة') return false;
  const lastMs = getCaseLastActionDateMs(caseItem);
  if (!lastMs) return false;
  return nowMs - lastMs > OVERDUE_ACTION_MS;
}

export function getOverdueCasesForUser(
  cases: Case[],
  user: Pick<User, 'id' | 'username' | 'crmUser'>,
  nowMs = Date.now()
): Case[] {
  if (!user) return [];
  return cases
    .filter((c) => isCaseOwnedByUser(c, user) && isCaseOverdue72Hours(c, nowMs))
    .sort((a, b) => getCaseLastActionDateMs(a) - getCaseLastActionDateMs(b));
}

export function formatOverdueDurationArabic(hours: number): string {
  const totalHours = Math.max(0, Math.floor(hours));
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  if (days > 0 && remHours > 0) {
    return `${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومان' : 'أيام'} و${remHours} ساعة`;
  }
  if (days > 0) {
    return `${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومان' : 'أيام'}`;
  }
  return `${totalHours} ساعة`;
}

const syncedOverdueNotificationKeys = new Set<string>();

/**
 * Ensures a persistent Firestore notification exists for each case staying in a user's
 * account for more than 72 hours without action (deduplicated per case updatedAt cycle).
 */
export async function syncOverdueNotificationsForUser(
  overdueCases: Case[],
  user: User,
  nowMs = Date.now()
): Promise<void> {
  if (!user || overdueCases.length === 0) return;
  const safeUsername = (user.username || user.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const roleLabel =
    user.role === 'agent'
      ? 'وكيل اتصال'
      : user.role === 'super_admin'
      ? 'مدير النظام'
      : 'الإدارة والدعم التقني';

  for (const c of overdueCases.slice(0, 20)) {
    const lastActionMs = getCaseLastActionDateMs(c);
    const notifDocId = `overdue_${safeUsername}_${c.caseId}_${lastActionMs}`.slice(0, 96);
    if (syncedOverdueNotificationKeys.has(notifDocId)) continue;
    syncedOverdueNotificationKeys.add(notifDocId);

    try {
      const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notifDocId);
      const existing = await getDoc(notifRef);
      if (existing.exists()) continue;

      const idleHours = getCaseIdleHours(c, nowMs);
      const durationText = formatOverdueDurationArabic(idleHours);
      const title = `تنبيه تأخر (+72 ساعة): ${c.caseId}`.slice(0, 100);
      const message = `الحالة "${(c.title || c.caseId).slice(0, 80)}" متوقفة في حسابك (${roleLabel}) منذ ${durationText} دون اتخاذ أي إجراء. يرجى المتابعة أو التحويل أو الإغلاق.`.slice(
        0,
        490
      );

      const notifPayload: Omit<NotificationItem, 'id'> = {
        recipientUsername: user.username,
        recipientRole: user.role,
        caseId: c.caseId,
        title,
        message,
        isRead: false,
        type: 'overdue_alert',
        senderName: 'تنبيه المتابعة التلقائي',
        createdAt: new Date().toISOString(),
      };

      await setDoc(notifRef, cleanFirestoreData(notifPayload));
    } catch (error) {
      syncedOverdueNotificationKeys.delete(notifDocId);
      console.warn('Overdue notification sync note:', error);
    }
  }
}

/**
 * Dispatch real-time notification
 */
export async function sendNotification(params: {
  recipientUsername: string;
  recipientRole?: User['role'];
  caseId: string;
  title: string;
  message: string;
  type: NotificationItem['type'];
  senderName?: string;
}): Promise<void> {
  try {
    const notifRef = doc(collection(db, NOTIFICATIONS_COLLECTION));
    const notif: Omit<NotificationItem, 'id'> = {
      ...params,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    await setDoc(notifRef, cleanFirestoreData(notif));
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

/**
 * Send targeted staff notifications to selected staff (available to Super Admin, Management, & Tech Support)
 */
export async function sendTargetedAdminNotifications(params: {
  recipients: User[];
  title: string;
  message: string;
  sender: User;
}): Promise<number> {
  if (
    params.sender.role !== 'super_admin' &&
    params.sender.role !== 'management' &&
    params.sender.role !== 'technical_support'
  ) {
    throw new Error('صلاحية إرسال الإشعارات الموجهة متاحة لمدير النظام والإدارة والدعم التقني فقط.');
  }
  const title = params.title.trim();
  const message = params.message.trim();
  if (!title || !message) {
    throw new Error('يرجى كتابة عنوان الإشعار ونص الرسالة.');
  }

  // Deduplicate recipients by username
  const uniqueRecipientsMap = new Map<string, User>();
  for (const r of params.recipients) {
    if (r && r.status === 'active' && r.username) {
      uniqueRecipientsMap.set(r.username, r);
    }
  }
  const uniqueRecipients = Array.from(uniqueRecipientsMap.values());
  if (uniqueRecipients.length === 0) {
    throw new Error('يرجى اختيار مستلم واحد على الأقل لإرسال الإشعار.');
  }

  try {
    const now = new Date().toISOString();
    const batchId = `NOTICE_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Commit in chunks of 400 to respect Firestore 500 writes/batch limit
    for (let i = 0; i < uniqueRecipients.length; i += 400) {
      const batch = writeBatch(db);
      const slice = uniqueRecipients.slice(i, i + 400);
      for (const target of slice) {
        const notifRef = doc(collection(db, NOTIFICATIONS_COLLECTION));
        const notif: Omit<NotificationItem, 'id'> = {
          recipientUsername: target.username,
          recipientName: target.fullName,
          recipientRole: target.role,
          caseId: 'ADMIN-NOTICE',
          title,
          message,
          isRead: false,
          type: 'admin_notice',
          senderName: params.sender.fullName,
          senderUsername: params.sender.username,
          senderRole: params.sender.role,
          batchId,
          requiresAcknowledgment: true,
          acknowledged: false,
          createdAt: now,
        };
        batch.set(notifRef, cleanFirestoreData(notif));
      }
      await batch.commit();
    }

    await logAuditEvent({
      userId: params.sender.id,
      username: params.sender.username,
      fullName: params.sender.fullName,
      role: params.sender.role,
      action: 'إرسال إشعار إداري موجه',
      recordId: batchId,
      details: `العنوان: ${title} | عدد المستلمين: ${uniqueRecipients.length}`,
    });

    return uniqueRecipients.length;
  } catch (error) {
    if (error instanceof Error && error.message.includes('يرجى')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, NOTIFICATIONS_COLLECTION);
  }
}

/**
 * Real-time subscription to Sent Staff Notifications Log (sorted in JS to avoid composite index issues)
 */
export function subscribeToSentAdminNotifications(
  callback: (items: NotificationItem[]) => void
): () => void {
  const q = query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where('type', '==', 'admin_notice')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: NotificationItem[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) });
      });
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(list);
    },
    (error) => {
      console.warn('Sent admin notifications subscription note:', error);
    }
  );
}

/**
 * Reset/clear sent notifications and notifications inside user accounts (Super Admin only)
 * Enables starting fresh before sending a new batch of notifications.
 */
export async function resetNotificationsForFreshSend(
  actingUser: User,
  scope: 'all' | 'admin_notices' = 'all'
): Promise<number> {
  if (!actingUser || actingUser.role !== 'super_admin') {
    throw new Error('صلاحية تصفير الإشعارات متاحة لمدير النظام (الأدمن) فقط.');
  }

  try {
    const targetQuery =
      scope === 'admin_notices'
        ? query(collection(db, NOTIFICATIONS_COLLECTION), where('type', '==', 'admin_notice'))
        : collection(db, NOTIFICATIONS_COLLECTION);

    const snapshot = await getDocs(targetQuery);
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      const slice = docs.slice(i, i + 400);
      slice.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'تصفير الإشعارات',
      recordId: scope === 'all' ? 'ALL_NOTIFICATIONS' : 'ADMIN_NOTICES',
      details:
        scope === 'all'
          ? `تم تصفير وحذف كافة الإشعارات المرسلة والموجودة بالحسابات (${docs.length} إشعار) لبدء إرسال جديد`
          : `تم تصفير وحذف سجل الإشعارات الإدارية المرسلة (${docs.length} إشعار) من السجل والحسابات`,
    });

    return docs.length;
  } catch (error) {
    if (error instanceof Error && error.message.includes('مدير النظام')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, NOTIFICATIONS_COLLECTION);
  }
}

/**
 * Delete a specific sent notification batch from both the sent log and all recipient accounts (Super Admin only)
 */
export async function deleteSentNotificationBatch(
  notificationIds: string[],
  batchTitle: string,
  actingUser: User
): Promise<number> {
  if (!actingUser || actingUser.role !== 'super_admin') {
    throw new Error('صلاحية حذف الإشعارات متاحة لمدير النظام (الأدمن) فقط.');
  }

  const uniqueIds = Array.from(new Set(notificationIds.filter(Boolean)));
  if (uniqueIds.length === 0) return 0;

  try {
    for (let i = 0; i < uniqueIds.length; i += 400) {
      const batch = writeBatch(db);
      const slice = uniqueIds.slice(i, i + 400);
      slice.forEach((id) => batch.delete(doc(db, NOTIFICATIONS_COLLECTION, id)));
      await batch.commit();
    }

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'حذف إشعار مرسل',
      recordId: uniqueIds[0],
      details: `تم حذف الإشعار "${batchTitle}" من السجل وحسابات المستلمين (${uniqueIds.length} سجل)`,
    });

    return uniqueIds.length;
  } catch (error) {
    if (error instanceof Error && error.message.includes('مدير النظام')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, NOTIFICATIONS_COLLECTION);
  }
}

/**
 * Real-time subscription to all system notifications sorted newest-to-oldest (Super Admin management)
 */
export function subscribeToAllNotificationsForAdmin(
  callback: (items: NotificationItem[]) => void
): () => void {
  return onSnapshot(
    collection(db, NOTIFICATIONS_COLLECTION),
    (snapshot) => {
      const list: NotificationItem[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) });
      });
      list.sort((a, b) => {
        const aMs = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
        const bMs = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
        if (bMs !== aMs) return bMs - aMs;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      callback(list);
    },
    (error) => {
      console.warn('All notifications subscription note:', error);
    }
  );
}

/**
 * Delete specific selected notification documents by ID (Super Admin only)
 */
export async function deleteSelectedNotifications(
  notificationIds: string[],
  actingUser: User,
  contextLabel = 'تحديد متعدد'
): Promise<number> {
  if (!actingUser || actingUser.role !== 'super_admin') {
    throw new Error('صلاحية حذف الإشعارات المحددة متاحة لمدير النظام (الأدمن) فقط.');
  }

  const uniqueIds = Array.from(new Set(notificationIds.filter(Boolean)));
  if (uniqueIds.length === 0) return 0;

  try {
    for (let i = 0; i < uniqueIds.length; i += 400) {
      const batch = writeBatch(db);
      const slice = uniqueIds.slice(i, i + 400);
      slice.forEach((id) => batch.delete(doc(db, NOTIFICATIONS_COLLECTION, id)));
      await batch.commit();
    }

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'حذف إشعارات محددة',
      recordId: uniqueIds[0],
      details: `تم حذف (${uniqueIds.length}) إشعار محدد (${contextLabel})`,
    });

    return uniqueIds.length;
  } catch (error) {
    if (error instanceof Error && error.message.includes('مدير النظام')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, NOTIFICATIONS_COLLECTION);
  }
}

/**
 * Create a new Case
 */
export async function createCase(
  caseData: Omit<
    Case,
    | 'id'
    | 'caseId'
    | 'createdAt'
    | 'updatedAt'
    | 'isDeleted'
    | 'createdById'
    | 'createdByName'
    | 'createdByCrmUser'
    | 'createdByRole'
  >,
  user: User
): Promise<Case> {
  try {
    const caseId = await generateNextCaseId();
    const caseDocRef = doc(collection(db, CASES_COLLECTION));
    const now = new Date().toISOString();

    const fullCase: Case = {
      id: caseDocRef.id,
      caseId,
      ...caseData,
      assignedTo: caseData.assignedTo ?? user.id,
      assignedToName: caseData.assignedToName ?? user.fullName,
      assignedToRole: caseData.assignedToRole ?? user.role,
      createdById: user.id,
      createdByName: user.fullName,
      createdByCrmUser: user.crmUser,
      createdByRole: user.role,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    await setDoc(caseDocRef, cleanFirestoreData(fullCase));

    // Add first timeline record
    const attachmentsCount = Array.isArray(caseData.attachments) ? caseData.attachments.length : 0;
    await addTimelineEvent(caseDocRef.id, {
      caseId,
      action: 'إنشاء الحالة',
      newStatus: fullCase.status,
      notes: `تم فتح الحالة بواسطة ${user.fullName} (${user.crmUser}) - ${caseData.title}${
        attachmentsCount > 0 ? ` | مع إرفاق (${attachmentsCount}) مستند` : ''
      }`,
      userId: user.id,
      userName: user.fullName,
      userCrmUser: user.crmUser,
      userRole: user.role,
    });

    // Audit log
    await logAuditEvent({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      action: 'إنشاء حالة جديدة',
      recordId: caseId,
      details: `عنوان: ${caseData.title} | ممول: ${caseData.taxRegistrationNumber}${
        attachmentsCount > 0 ? ` | مستندات مرفقة: ${attachmentsCount}` : ''
      }`,
    });

    return fullCase;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, CASES_COLLECTION);
  }
}

/**
 * Attach uploaded documents to an existing Case (owner only, non-closed)
 */
export async function addAttachmentsToCase(
  caseDocId: string,
  newAttachments: CaseAttachment[],
  actingUser: User,
  stage: CaseAttachmentStage
): Promise<CaseAttachment[]> {
  if (!newAttachments || newAttachments.length === 0) return [];
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);

  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const caseData = caseSnap.data() as Case;

    if (!isCaseOwnedByUser(caseData, actingUser)) {
      throw new Error('إرفاق المستندات متاح فقط لمن تكون الحالة مسندة في حسابه حالياً.');
    }
    if (caseData.status === 'مغلقة') {
      throw new Error('لا يمكن إرفاق مستندات لحالة مغلقة.');
    }

    const existingAttachments = Array.isArray(caseData.attachments) ? caseData.attachments : [];
    const mergedAttachments = [...existingAttachments, ...newAttachments];
    if (mergedAttachments.length > MAX_ATTACHMENTS_PER_CASE) {
      throw new Error(`الحد الأقصى للمستندات المرفقة في الحالة الواحدة هو ${MAX_ATTACHMENTS_PER_CASE} مستنداً.`);
    }

    const now = new Date().toISOString();
    await updateDoc(
      caseRef,
      cleanFirestoreData({
        attachments: mergedAttachments,
        updatedById: actingUser.id,
        updatedByName: actingUser.fullName,
        updatedAt: now,
      })
    );

    const stageLabel = getAttachmentStageLabel(stage);
    const fileNames = newAttachments.map((a) => a.fileName).join('، ');

    await addTimelineEvent(caseDocId, {
      caseId: caseData.caseId,
      action: `إرفاق مستندات (${stageLabel})`,
      notes: `تم إرفاق (${newAttachments.length}) مستند بواسطة ${actingUser.fullName}: ${fileNames}`,
      userId: actingUser.id,
      userName: actingUser.fullName,
      userCrmUser: actingUser.crmUser,
      userRole: actingUser.role,
    });

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'إرفاق مستندات بحالة',
      recordId: caseData.caseId,
      details: `${stageLabel} (${newAttachments.length}): ${fileNames}`,
    });

    return mergedAttachments;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('الحالة') ||
        error.message.includes('حسابه') ||
        error.message.includes('الحد الأقصى'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Remove an attached document from an existing Case (owner only, non-closed)
 */
export async function removeAttachmentFromCase(
  caseDocId: string,
  attachmentId: string,
  actingUser: User
): Promise<CaseAttachment[]> {
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);

  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const caseData = caseSnap.data() as Case;

    if (!isCaseOwnedByUser(caseData, actingUser)) {
      throw new Error('حذف المستندات متاح فقط لمن تكون الحالة مسندة في حسابه حالياً.');
    }
    if (caseData.status === 'مغلقة') {
      throw new Error('لا يمكن حذف مستندات من حالة مغلقة.');
    }

    const existingAttachments = Array.isArray(caseData.attachments) ? caseData.attachments : [];
    const target = existingAttachments.find((a) => a.id === attachmentId);
    if (!target) {
      return existingAttachments;
    }

    const remaining = existingAttachments.filter((a) => a.id !== attachmentId);
    const now = new Date().toISOString();

    await updateDoc(
      caseRef,
      cleanFirestoreData({
        attachments: remaining,
        updatedById: actingUser.id,
        updatedByName: actingUser.fullName,
        updatedAt: now,
      })
    );

    if (target.storedName) {
      await deleteUploadedAttachmentFile(target.storedName);
    }

    await addTimelineEvent(caseDocId, {
      caseId: caseData.caseId,
      action: 'حذف مستند مرفق',
      notes: `تم حذف المستند "${target.fileName}" بواسطة ${actingUser.fullName}`,
      userId: actingUser.id,
      userName: actingUser.fullName,
      userCrmUser: actingUser.crmUser,
      userRole: actingUser.role,
    });

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'حذف مستند مرفق',
      recordId: caseData.caseId,
      details: `تم حذف: ${target.fileName}`,
    });

    return remaining;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('الحالة') || error.message.includes('حسابه'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Transfer case to Management or Tech Support
 */
export async function transferCase(
  caseDocId: string,
  targetRole: 'management' | 'technical_support',
  notes: string,
  user: User
): Promise<void> {
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const existingCase = caseSnap.data() as Case;
    if (!isCaseOwnedByUser(existingCase, user)) {
      throw new Error('تحويل الحالة متاح فقط لمن تكون الحالة مسندة في حسابه حالياً.');
    }

    const newStatus: CaseStatus = targetRole === 'management' ? 'محولة للإدارة' : 'محولة للدعم الفني';
    const now = new Date().toISOString();

    await updateDoc(caseRef, cleanFirestoreData({
      status: newStatus,
      assignedTo: '',
      assignedToName: '',
      assignedToRole: targetRole,
      updatedById: user.id,
      updatedByName: user.fullName,
      updatedAt: now,
    }));

    const targetLabel = 'الإدارة والدعم التقني';

    await addTimelineEvent(caseDocId, {
      caseId: existingCase.caseId,
      action: `تحويل الحالة إلى ${targetLabel}`,
      previousStatus: existingCase.status,
      newStatus,
      notes: notes || `تم التحويل من قبل ${user.fullName}`,
      userId: user.id,
      userName: user.fullName,
      userCrmUser: user.crmUser,
      userRole: user.role,
    });

    await logAuditEvent({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      action: 'تحويل حالة',
      recordId: existingCase.caseId,
      details: `تحويل إلى ${targetLabel}${notes ? ` مع ملاحظات: ${notes}` : ''}`,
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('الحالة') || error.message.includes('حسابه'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Claim case atomically to prevent race condition (Section 30 & 48)
 */
export async function claimCase(caseDocId: string, user: User): Promise<void> {
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    let previousStatus: CaseStatus = 'قيد المعالجة';
    let previousOwnerName = '';

    await runTransaction(db, async (transaction) => {
      const caseSnap = await transaction.get(caseRef);
      if (!caseSnap.exists()) {
        throw new Error('الحالة غير موجودة');
      }

      const caseData = caseSnap.data() as Case;
      previousStatus = caseData.status;
      previousOwnerName = caseData.assignedToName || '';

      if (isCaseOwnedByUser(caseData, user)) {
        throw new Error('هذه الحالة مسندة في حسابك بالفعل.');
      }
      if (!canUserClaimCase(caseData, user)) {
        throw new Error(
          `تم إسناد هذه الحالة بالفعل إلى مستخدم آخر (${caseData.assignedToName || 'زميل آخر'}).`
        );
      }

      const now = new Date().toISOString();
      transaction.update(caseRef, {
        assignedTo: user.id,
        assignedToName: user.fullName,
        assignedToRole: user.role,
        status: 'قيد المعالجة',
        updatedById: user.id,
        updatedByName: user.fullName,
        updatedAt: now,
      });
    });

    // After transaction succeeds, record timeline
    const snap = await getDoc(caseRef);
    const updatedCase = snap.data() as Case;

    await addTimelineEvent(caseDocId, {
      caseId: updatedCase.caseId,
      action: 'سحب الحالة للمتابعة (Claim)',
      previousStatus,
      newStatus: 'قيد المعالجة',
      notes: previousOwnerName
        ? `قام ${user.fullName} (${user.crmUser}) بسحب الحالة من حساب (${previousOwnerName}) للرد عليها وغلقها`
        : `قام ${user.fullName} (${user.crmUser}) بسحب الحالة للمتابعة الفورية`,
      userId: user.id,
      userName: user.fullName,
      userCrmUser: user.crmUser,
      userRole: user.role,
    });

    await logAuditEvent({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      action: 'سحب حالة (Claim)',
      recordId: updatedCase.caseId,
      details: previousOwnerName
        ? `تم سحب الحالة من حساب ${previousOwnerName}`
        : 'تم سحب الحالة بنجاح',
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('تم إسناد هذه الحالة بالفعل') ||
        error.message.includes('الحالة غير موجودة') ||
        error.message.includes('مسندة في حسابك'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Bulk claim multiple eligible cases at once
 */
export async function claimMultipleCases(
  caseDocIds: string[],
  user: User
): Promise<{ claimedCount: number; skippedCount: number }> {
  if (
    user.role !== 'management' &&
    user.role !== 'technical_support' &&
    user.role !== 'super_admin'
  ) {
    throw new Error('تحديد وسحب الحالات المتعددة متاح فقط لحسابات الإدارة والدعم التقني والأدمن.');
  }

  const uniqueIds = Array.from(new Set(caseDocIds.filter(Boolean)));
  let claimedCount = 0;
  let skippedCount = 0;

  for (const id of uniqueIds) {
    try {
      await claimCase(id, user);
      claimedCount += 1;
    } catch {
      skippedCount += 1;
    }
  }

  return { claimedCount, skippedCount };
}

/**
 * Assign case to another team member
 */
export async function assignCase(
  caseDocId: string,
  targetUser: User,
  notes: string,
  actingUser: User
): Promise<void> {
  if (targetUser.role === 'super_admin') {
    throw new Error('لا يمكن إسناد الحالات إلى حساب مدير النظام (الأدمن).');
  }
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const caseData = caseSnap.data() as Case;
    if (!isCaseOwnedByUser(caseData, actingUser)) {
      throw new Error('إسناد الحالة متاح فقط لمن تكون الحالة مسندة في حسابه حالياً.');
    }

    const now = new Date().toISOString();
    await updateDoc(caseRef, cleanFirestoreData({
      assignedTo: targetUser.id,
      assignedToName: targetUser.fullName,
      assignedToRole: targetUser.role,
      assignedBy: actingUser.id,
      assignedByName: actingUser.fullName,
      status: 'قيد المعالجة',
      updatedById: actingUser.id,
      updatedByName: actingUser.fullName,
      updatedAt: now,
    }));

    await addTimelineEvent(caseDocId, {
      caseId: caseData.caseId,
      action: `إسناد الحالة إلى ${targetUser.fullName}`,
      previousStatus: caseData.status,
      newStatus: 'قيد المعالجة',
      notes: `تم الإسناد بواسطة ${actingUser.fullName}. ملاحظات: ${notes || 'لا يوجد'}`,
      userId: actingUser.id,
      userName: actingUser.fullName,
      userCrmUser: actingUser.crmUser,
      userRole: actingUser.role,
    });

    // Send notification to target user
    await sendNotification({
      recipientUsername: targetUser.username,
      recipientRole: targetUser.role,
      caseId: caseData.caseId,
      title: 'إسناد حالة جديدة إليك',
      message: `قام ${actingUser.fullName} بإسناد الحالة رقم ${caseData.caseId} إليك للمتابعة`,
      type: 'assign',
    });

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'إسناد حالة',
      recordId: caseData.caseId,
      details: `تم الإسناد إلى ${targetUser.fullName} (${targetUser.crmUser})`,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('الحالة') ||
        error.message.includes('حسابه') ||
        error.message.includes('مدير النظام'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Save Agent reply / notes
 */
export async function updateAgentResponse(
  caseDocId: string,
  params: {
    agentNotes?: string;
    agentReply?: string;
    agentEmployeeName: string;
    silentAutoSave?: boolean;
  },
  user: User
): Promise<void> {
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const caseData = caseSnap.data() as Case;
    if (!isCaseOwnedByUser(caseData, user)) {
      throw new Error('تعديل بيانات الحالة متاح فقط لمن تكون الحالة مسندة في حسابه حالياً.');
    }

    const now = new Date().toISOString();
    await updateDoc(caseRef, cleanFirestoreData({
      agentNotes: params.agentNotes ?? caseData.agentNotes ?? '',
      agentReply: params.agentReply ?? caseData.agentReply ?? '',
      agentEmployeeName: params.agentEmployeeName,
      updatedById: user.id,
      updatedByName: user.fullName,
      updatedAt: now,
    }));

    if (!params.silentAutoSave) {
      await addTimelineEvent(caseDocId, {
        caseId: caseData.caseId,
        action: 'تحديث رد وملاحظات وكيل الاتصال',
        notes: `تم تسجيل الرد بواسطة الموظف: ${params.agentEmployeeName}`,
        userId: user.id,
        userName: user.fullName,
        userCrmUser: user.crmUser,
        userRole: user.role,
      });
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('الحالة') || error.message.includes('حسابه'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Save Management or Technical Support reply
 */
export async function updateManagementResponse(
  caseDocId: string,
  params: {
    managementReply: string;
    managementEmployeeName: string;
    silentAutoSave?: boolean;
  },
  user: User
): Promise<void> {
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const caseData = caseSnap.data() as Case;
    if (!isCaseOwnedByUser(caseData, user)) {
      throw new Error('تعديل بيانات الحالة متاح فقط لمن تكون الحالة مسندة في حسابه حالياً.');
    }

    const now = new Date().toISOString();
    await updateDoc(caseRef, cleanFirestoreData({
      managementReply: params.managementReply,
      managementEmployeeName: params.managementEmployeeName,
      updatedById: user.id,
      updatedByName: user.fullName,
      updatedAt: now,
    }));

    if (!params.silentAutoSave) {
      await addTimelineEvent(caseDocId, {
        caseId: caseData.caseId,
        action: 'إضافة رد الإدارة / الدعم التقني',
        notes: `الموظف المسؤول: ${params.managementEmployeeName}. نص الرد: ${params.managementReply.slice(0, 80)}...`,
        userId: user.id,
        userName: user.fullName,
        userCrmUser: user.crmUser,
        userRole: user.role,
      });
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('الحالة') || error.message.includes('حسابه'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Bulk save unified Management / Technical Support reply across multiple owned open cases
 * and optionally return them to their original creating call agents.
 */
export async function bulkReplyToManagementCases(
  caseDocIds: string[],
  params: {
    managementReply: string;
    managementEmployeeName: string;
    returnToAgent?: boolean;
  },
  user: User
): Promise<{ updatedCount: number; skippedCount: number }> {
  if (user.role !== 'management' && user.role !== 'technical_support') {
    throw new Error('الرد الموحد على الحالات المتعددة متاح فقط لحسابات الإدارة والدعم التقني.');
  }

  const replyText = (params.managementReply || '').trim();
  const employeeName = (params.managementEmployeeName || '').trim();

  if (!replyText) {
    throw new Error('برجاء كتابة نص الرد الموحد قبل الإرسال.');
  }
  if (!employeeName) {
    throw new Error('برجاء تحديد اسم موظف الإدارة / الدعم التقني المسؤول.');
  }

  const uniqueIds = Array.from(new Set(caseDocIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new Error('برجاء تحديد حالة واحدة على الأقل للرد عليها.');
  }

  let updatedCount = 0;
  let skippedCount = 0;
  const repliedCaseNumbers: string[] = [];

  for (const caseDocId of uniqueIds) {
    const caseRef = doc(db, CASES_COLLECTION, caseDocId);
    try {
      const caseSnap = await getDoc(caseRef);
      if (!caseSnap.exists()) {
        skippedCount += 1;
        continue;
      }

      const caseData = caseSnap.data() as Case;
      if (caseData.isDeleted || caseData.status === 'مغلقة' || !isCaseOwnedByUser(caseData, user)) {
        skippedCount += 1;
        continue;
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, any> = {
        managementReply: replyText,
        managementEmployeeName: employeeName,
        updatedById: user.id,
        updatedByName: user.fullName,
        updatedAt: now,
      };

      if (params.returnToAgent && caseData.createdById) {
        updatePayload.status = 'محولة لوكيل الاتصال';
        updatePayload.assignedTo = caseData.createdById;
        updatePayload.assignedToName = caseData.createdByName;
        updatePayload.assignedToRole = caseData.createdByRole;
      }

      await updateDoc(caseRef, cleanFirestoreData(updatePayload));

      const previewSnippet = `${replyText.slice(0, 100)}${replyText.length > 100 ? '...' : ''}`;
      if (params.returnToAgent && caseData.createdById) {
        await addTimelineEvent(caseDocId, {
          caseId: caseData.caseId,
          action: 'رد جماعي من الإدارة / الدعم التقني وإعادة للوكيل المنشئ',
          previousStatus: caseData.status,
          newStatus: 'محولة لوكيل الاتصال',
          notes: `الموظف المسؤول: ${employeeName} | تمت الإعادة إلى ${caseData.createdByName}. نص الرد: ${previewSnippet}`,
          userId: user.id,
          userName: user.fullName,
          userCrmUser: user.crmUser,
          userRole: user.role,
        });

        if (caseData.createdByCrmUser && caseData.createdByCrmUser !== user.crmUser) {
          await sendNotification({
            recipientUsername: caseData.createdByCrmUser,
            recipientRole: caseData.createdByRole,
            caseId: caseData.caseId,
            title: 'تم الرد على الحالة وإعادتها إليك',
            message: `تمت إضافة رد الإدارة على الحالة رقم ${caseData.caseId} وإعادتها إليك للمتابعة مع الممول`,
            type: 'response',
          });
        }
      } else {
        await addTimelineEvent(caseDocId, {
          caseId: caseData.caseId,
          action: 'إضافة رد الإدارة / الدعم التقني (رد جماعي)',
          notes: `الموظف المسؤول: ${employeeName}. نص الرد: ${previewSnippet}`,
          userId: user.id,
          userName: user.fullName,
          userCrmUser: user.crmUser,
          userRole: user.role,
        });
      }

      updatedCount += 1;
      repliedCaseNumbers.push(caseData.caseId);
    } catch {
      skippedCount += 1;
    }
  }

  if (updatedCount > 0) {
    await logAuditEvent({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      action: params.returnToAgent
        ? 'رد جماعي من الإدارة / الدعم التقني وإعادة للوكلاء'
        : 'رد جماعي من الإدارة / الدعم التقني',
      recordId:
        repliedCaseNumbers.slice(0, 8).join(', ') +
        (repliedCaseNumbers.length > 8 ? ` (+${repliedCaseNumbers.length - 8})` : ''),
      details: `تم الرد على (${updatedCount}) حالة برد موحد بواسطة ${employeeName}${
        skippedCount > 0 ? ` | تم تخطي (${skippedCount}) حالة` : ''
      }`,
    });
  }

  return { updatedCount, skippedCount };
}

/**
 * Return case to original creating agent (Section 32)
 */
export async function returnCaseToAgent(
  caseDocId: string,
  notes: string,
  user: User
): Promise<void> {
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const caseData = caseSnap.data() as Case;
    if (!isCaseOwnedByUser(caseData, user)) {
      throw new Error('إعادة الحالة متاح فقط لمن تكون الحالة مسندة في حسابه حالياً.');
    }

    const now = new Date().toISOString();
    await updateDoc(caseRef, cleanFirestoreData({
      status: 'محولة لوكيل الاتصال',
      assignedTo: caseData.createdById,
      assignedToName: caseData.createdByName,
      assignedToRole: caseData.createdByRole,
      updatedById: user.id,
      updatedByName: user.fullName,
      updatedAt: now,
    }));

    await addTimelineEvent(caseDocId, {
      caseId: caseData.caseId,
      action: 'إعادة الحالة إلى وكيل الاتصال المنشئ',
      previousStatus: caseData.status,
      newStatus: 'محولة لوكيل الاتصال',
      notes: `تمت الإعادة بواسطة ${user.fullName} إلى ${caseData.createdByName}. ملاحظات: ${notes || 'يرجى مراجعة رد الإدارة والرد على الممول'}`,
      userId: user.id,
      userName: user.fullName,
      userCrmUser: user.crmUser,
      userRole: user.role,
    });

    await sendNotification({
      recipientUsername: caseData.createdByCrmUser,
      recipientRole: caseData.createdByRole,
      caseId: caseData.caseId,
      title: 'تم الرد على الحالة وإعادتها إليك',
      message: `تمت إضافة رد الإدارة على الحالة رقم ${caseData.caseId} وإعادتها إليك للمتابعة مع الممول`,
      type: 'response',
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('الحالة') || error.message.includes('حسابه'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Close case (Close reason is strictly required!)
 */
export async function closeCase(
  caseDocId: string,
  closeReason: string,
  employeeName: string,
  user: User,
  agentReplyOverride?: string
): Promise<void> {
  if (!closeReason || closeReason.trim().length === 0) {
    throw new Error('برجاء إدخال سبب غلق الحالة (إجباري لإتمام الإغلاق)');
  }
  if (!employeeName || employeeName.trim().length === 0) {
    throw new Error('برجاء تحديد اسم الموظف المسؤول قبل إغلاق الحالة.');
  }

  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const caseData = caseSnap.data() as Case;
    if (!isCaseOwnedByUser(caseData, user)) {
      throw new Error('غلق الحالة متاح فقط لمن تكون الحالة مسندة في حسابه حالياً.');
    }

    const effectiveAgentReply = (
      agentReplyOverride !== undefined ? agentReplyOverride : caseData.agentReply || ''
    ).trim();

    if (!effectiveAgentReply) {
      throw new Error('يجب كتابة رد وكيل الاتصال على الحالة أولاً (إجباري قبل إغلاق الحالة).');
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      status: 'مغلقة',
      closeReason: closeReason.trim(),
      closedAt: now,
      closedBy: user.id,
      closedByName: employeeName.trim(),
      updatedById: user.id,
      updatedByName: user.fullName,
      updatedAt: now,
    };

    if (effectiveAgentReply !== (caseData.agentReply || '').trim()) {
      updateData.agentReply = effectiveAgentReply;
      updateData.agentEmployeeName = caseData.agentEmployeeName || user.fullName;
    }

    await updateDoc(caseRef, cleanFirestoreData(updateData));

    await addTimelineEvent(caseDocId, {
      caseId: caseData.caseId,
      action: 'إغلاق الحالة نهائياً',
      previousStatus: caseData.status,
      newStatus: 'مغلقة',
      notes: `تم الإغلاق بواسطة: ${employeeName}. سبب الإغلاق: ${closeReason.trim()}`,
      userId: user.id,
      userName: user.fullName,
      userCrmUser: user.crmUser,
      userRole: user.role,
    });

    await logAuditEvent({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      action: 'إغلاق حالة',
      recordId: caseData.caseId,
      details: `الموظف: ${employeeName} | السبب: ${closeReason}`,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('الحالة') ||
        error.message.includes('حسابه') ||
        error.message.includes('رد وكيل الاتصال'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Reopen closed case
 * - Allowed for the case owner OR any management / technical_support / super_admin account.
 */
export async function reopenCase(caseDocId: string, reason: string, user: User): Promise<void> {
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const caseData = caseSnap.data() as Case;
    const isOwner = isCaseOwnedByUser(caseData, user);
    const isMgmtOrSupportOrAdmin =
      user.role === 'management' ||
      user.role === 'technical_support' ||
      user.role === 'super_admin';

    if (!isOwner && !isMgmtOrSupportOrAdmin) {
      throw new Error('إعادة فتح الحالة متاح لصاحب الحساب أو لحسابات الإدارة والدعم التقني فقط.');
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status: 'قيد المعالجة',
      closeReason: '',
      closedAt: null,
      closedBy: null,
      closedByName: null,
      updatedById: user.id,
      updatedByName: user.fullName,
      updatedAt: now,
    };

    // If Management/Tech Support/Admin reopens a case outside their account, route it into their active account so they can act on it immediately
    if (!isOwner) {
      updatePayload.assignedTo = user.id;
      updatePayload.assignedToName = user.fullName;
      updatePayload.assignedToRole = user.role;
    }

    await updateDoc(caseRef, cleanFirestoreData(updatePayload));

    await addTimelineEvent(caseDocId, {
      caseId: caseData.caseId,
      action: 'إعادة فتح الحالة',
      previousStatus: 'مغلقة',
      newStatus: 'قيد المعالجة',
      notes: `أعيد فتح الحالة بواسطة ${user.fullName}${!isOwner ? ' (من صلاحيات الإدارة/الدعم التقني خارج الحساب)' : ''}. السبب: ${reason || 'متابعة إضافية مطلوب إنجازها'}`,
      userId: user.id,
      userName: user.fullName,
      userCrmUser: user.crmUser,
      userRole: user.role,
    });

    await logAuditEvent({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      action: 'إعادة فتح حالة',
      recordId: caseData.caseId,
      details: reason,
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('الحالة') || error.message.includes('حسابه') || error.message.includes('الحساب'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Soft delete or Hard delete (Super Admin ONLY)
 */
export async function deleteCase(caseDocId: string, hardDelete: boolean, user: User): Promise<void> {
  if (!user || user.role !== 'super_admin') {
    throw new Error('صلاحية حذف الحالات متاحة لمدير النظام (الأدمن) فقط.');
  }

  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) return;
    const caseData = caseSnap.data() as Case;

    if (hardDelete) {
      await deleteDoc(caseRef);
      await logAuditEvent({
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        action: 'حذف نهائي لحالة (Hard Delete)',
        recordId: caseData.caseId,
        details: 'تم الحذف الفيزيائي بواسطة مدير النظام',
      });
    } else {
      await updateDoc(caseRef, cleanFirestoreData({
        isDeleted: true,
        updatedById: user.id,
        updatedByName: user.fullName,
        updatedAt: new Date().toISOString(),
      }));
      await addTimelineEvent(caseDocId, {
        caseId: caseData.caseId,
        action: 'أرشفة / حذف مؤقت للحالة',
        notes: `تمت الأرشفة بواسطة ${user.fullName}`,
        userId: user.id,
        userName: user.fullName,
        userCrmUser: user.crmUser,
        userRole: user.role,
      });
      await logAuditEvent({
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        action: 'أرشفة حالة (Soft Delete)',
        recordId: caseData.caseId,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

/**
 * Subscribe to all active cases
 */
export function subscribeToCases(callback: (cases: Case[]) => void): () => void {
  const q = query(
    collection(db, CASES_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(300)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const cases: Case[] = [];
      snapshot.forEach((d) => {
        const c = { id: d.id, ...(d.data() as Omit<Case, 'id'>) };
        if (!c.isDeleted) {
          cases.push(c);
        }
      });
      callback(cases);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, CASES_COLLECTION);
    }
  );
}

/**
 * Subscribe to Timeline for a single case
 */
export function subscribeToCaseTimeline(
  caseDocId: string,
  callback: (events: TimelineEvent[]) => void
): () => void {
  const q = query(
    collection(db, CASES_COLLECTION, caseDocId, 'timeline'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const events: TimelineEvent[] = [];
      snapshot.forEach((d) => {
        events.push({ id: d.id, ...(d.data() as TimelineEvent) });
      });
      callback(events);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `${CASES_COLLECTION}/${caseDocId}/timeline`);
    }
  );
}

/**
 * Check for potential duplicate cases (Section 57)
 */
export async function findPotentialDuplicates(taxNumber: string, title: string): Promise<Case[]> {
  try {
    const q = query(
      collection(db, CASES_COLLECTION),
      where('taxRegistrationNumber', '==', taxNumber.trim()),
      limit(5)
    );
    const snap = await getDocs(q);
    const duplicates: Case[] = [];
    snap.forEach((d) => {
      const c = { id: d.id, ...(d.data() as Omit<Case, 'id'>) };
      if (!c.isDeleted && c.status !== 'مغلقة') {
        duplicates.push(c);
      }
    });
    return duplicates;
  } catch (error) {
    console.warn('Duplicate check warning:', error);
    return [];
  }
}

/**
 * Update case status directly from Kanban Pipeline Board (Drag & Drop or Quick Move)
 */
export async function updateCaseStatusPipeline(
  caseDocId: string,
  newStatus: CaseStatus,
  user: User,
  notes?: string
): Promise<void> {
  const caseRef = doc(db, CASES_COLLECTION, caseDocId);
  try {
    const caseSnap = await getDoc(caseRef);
    if (!caseSnap.exists()) throw new Error('الحالة غير موجودة');
    const existingCase = caseSnap.data() as Case;
    if (existingCase.status === newStatus) return;
    if (!isCaseOwnedByUser(existingCase, user)) {
      throw new Error('تعديل أو غلق أو إعادة فتح الحالة متاح فقط لصاحب الحساب المسندة إليه الحالة.');
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status: newStatus,
      updatedById: user.id,
      updatedByName: user.fullName,
      updatedAt: now,
    };

    if (newStatus === 'قيد المعالجة' && !existingCase.assignedTo) {
      updatePayload.assignedTo = user.id;
      updatePayload.assignedToName = user.fullName;
      updatePayload.assignedToRole = user.role;
    } else if (newStatus === 'محولة للإدارة') {
      updatePayload.assignedTo = '';
      updatePayload.assignedToName = '';
      updatePayload.assignedToRole = 'management';
    } else if (newStatus === 'محولة للدعم الفني') {
      updatePayload.assignedTo = '';
      updatePayload.assignedToName = '';
      updatePayload.assignedToRole = 'technical_support';
    } else if (newStatus === 'محولة لوكيل الاتصال') {
      updatePayload.assignedTo = existingCase.createdById;
      updatePayload.assignedToName = existingCase.createdByName;
      updatePayload.assignedToRole = existingCase.createdByRole;
    }

    await updateDoc(caseRef, cleanFirestoreData(updatePayload));

    await addTimelineEvent(caseDocId, {
      caseId: existingCase.caseId,
      action: `تحديث مسار الحالة (Kanban Pipeline)`,
      previousStatus: existingCase.status,
      newStatus,
      notes: notes || `تم نقل الحالة من "${existingCase.status}" إلى "${newStatus}" بواسطة ${user.fullName}`,
      userId: user.id,
      userName: user.fullName,
      userCrmUser: user.crmUser,
      userRole: user.role,
    });

    await logAuditEvent({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      action: 'نقل حالة في لوحة المسار (Kanban)',
      recordId: existingCase.caseId,
      details: `من ${existingCase.status} إلى ${newStatus}`,
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('الحالة') || error.message.includes('حسابه'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CASES_COLLECTION}/${caseDocId}`);
  }
}

