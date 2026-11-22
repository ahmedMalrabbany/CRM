/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  onSnapshot,
  writeBatch,
  arrayUnion,
} from '../lib/sheetsDb';
import { db, handleDatabaseError, OperationType } from '../config/sheetsConfig';
import { ChatAttachment, TeamChatControl, TeamChatMessage, User } from '../types';
import { normalizeUserRole } from './userService';
import { logAuditEvent } from './auditService';
import { deleteUploadedAttachmentFile } from './attachmentService';

const TEAM_CHAT_COLLECTION = 'teamChatMessages';
const CHAT_CONTROL_DOC_PATH = 'settings/chatControl';

export function isTeamChatPaused(
  ctrl?: TeamChatControl | null,
  nowMs = Date.now()
): boolean {
  if (!ctrl || !ctrl.isPaused) return false;
  if (!ctrl.pausedUntil) return true;
  const untilMs = new Date(ctrl.pausedUntil).getTime();
  if (Number.isNaN(untilMs)) return true;
  return untilMs > nowMs;
}

export function formatChatPauseRemaining(
  ctrl?: TeamChatControl | null,
  nowMs = Date.now()
): string {
  if (!ctrl || !ctrl.isPaused) return '';
  if (!ctrl.pausedUntil) return 'حتى إعادة التفعيل يدوياً من مدير النظام';
  const untilMs = new Date(ctrl.pausedUntil).getTime();
  if (Number.isNaN(untilMs) || untilMs <= nowMs) return 'ينتهي الآن';
  const totalMins = Math.max(1, Math.ceil((untilMs - nowMs) / 60_000));
  const timeStr = new Date(untilMs).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (totalMins >= 60) {
    const hrs = Math.floor(totalMins / 60);
    const remMins = totalMins % 60;
    return `متبقي ${hrs} ساعة${remMins > 0 ? ` و${remMins} دقيقة` : ''} (يفتح ${timeStr})`;
  }
  return `متبقي ${totalMins} دقيقة (يفتح ${timeStr})`;
}

export function subscribeToTeamChatControl(
  callback: (ctrl: TeamChatControl | null) => void
): () => void {
  const ref = doc(db, 'settings', 'chatControl');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
      } else {
        callback(snap.data() as TeamChatControl);
      }
    },
    (error) => {
      console.warn('Chat control subscription note:', error);
    }
  );
}

export async function pauseTeamChat(params: {
  durationMinutes: number | null;
  reason?: string;
  actingUser: User;
}): Promise<void> {
  if (params.actingUser.role !== 'super_admin') {
    throw new Error('صلاحية إيقاف الشات متاحة لمدير النظام فقط.');
  }

  const now = new Date();
  const pausedUntil =
    params.durationMinutes && params.durationMinutes > 0
      ? new Date(now.getTime() + params.durationMinutes * 60_000).toISOString()
      : null;

  const payload: TeamChatControl = {
    isPaused: true,
    pausedUntil,
    pauseReason: params.reason?.trim() || 'تم إيقاف الشات مؤقتاً من قِبل مدير النظام',
    pausedBy: params.actingUser.username,
    pausedByName: params.actingUser.fullName,
    pausedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    await setDoc(doc(db, 'settings', 'chatControl'), payload);
    await logAuditEvent({
      userId: params.actingUser.id,
      username: params.actingUser.username,
      fullName: params.actingUser.fullName,
      role: params.actingUser.role,
      action: 'إيقاف شات المحادثة مؤقتاً',
      recordId: CHAT_CONTROL_DOC_PATH,
      details: params.durationMinutes
        ? `تم إيقاف الشات لمدة ${params.durationMinutes} دقيقة — السبب: ${payload.pauseReason}`
        : `تم إيقاف الشات إيقافاً مفتوحاً حتى إعادة التفعيل — السبب: ${payload.pauseReason}`,
    });
  } catch (error) {
    handleDatabaseError(error, OperationType.WRITE, CHAT_CONTROL_DOC_PATH);
  }
}

export async function resumeTeamChat(actingUser: User): Promise<void> {
  if (actingUser.role !== 'super_admin') {
    throw new Error('صلاحية إعادة تشغيل الشات متاحة لمدير النظام فقط.');
  }

  const nowIso = new Date().toISOString();
  const payload: TeamChatControl = {
    isPaused: false,
    pausedUntil: null,
    pauseReason: '',
    pausedBy: actingUser.username,
    pausedByName: actingUser.fullName,
    updatedAt: nowIso,
  };

  try {
    await setDoc(doc(db, 'settings', 'chatControl'), payload);
    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'إعادة تشغيل شات المحادثة',
      recordId: CHAT_CONTROL_DOC_PATH,
      details: 'تم رفع الإيقاف وإعادة تفعيل شات التواصل السريع للجميع',
    });
  } catch (error) {
    handleDatabaseError(error, OperationType.WRITE, CHAT_CONTROL_DOC_PATH);
  }
}

/**
 * Subscribe to ALL Team Chat messages chronologically without truncation
 */
export function subscribeToTeamChatMessages(
  callback: (messages: TeamChatMessage[]) => void
): () => void {
  const q = query(
    collection(db, TEAM_CHAT_COLLECTION),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: TeamChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Omit<TeamChatMessage, 'id'>;
        items.push({
          id: docSnap.id,
          ...data,
        });
      });
      callback(items);
    },
    (error) => {
      handleDatabaseError(error, OperationType.LIST, TEAM_CHAT_COLLECTION);
    }
  );
}

export async function sendTeamChatMessage(params: {
  sender: User;
  message: string;
  attachments?: ChatAttachment[];
  urgency?: 'normal' | 'urgent';
  caseId?: string;
  recipient?: User | null;
  targetUser?: User | null;
  replyTo?: {
    id: string;
    senderName: string;
    senderUsername: string;
    message: string;
  };
  mentions?: string[];
}): Promise<void> {
  const trimmed = params.message.trim();
  const hasAttachments = Array.isArray(params.attachments) && params.attachments.length > 0;
  if (!trimmed && !hasAttachments) {
    throw new Error('يرجى كتابة الرسالة أو إرفاق ملف قبل الإرسال.');
  }
  if (trimmed.length > 2000) {
    throw new Error('الرسالة طويلة جداً (الحد الأقصى 2000 حرف).');
  }

  // Enforce active chat pause for non-admin users
  if (params.sender.role !== 'super_admin') {
    try {
      const ctrlSnap = await getDoc(doc(db, 'settings', 'chatControl'));
      if (ctrlSnap.exists()) {
        const ctrl = ctrlSnap.data() as TeamChatControl;
        if (isTeamChatPaused(ctrl, Date.now())) {
          throw new Error(
            `تم إيقاف الشات مؤقتاً من قِبل مدير النظام (${formatChatPauseRemaining(ctrl)}).`
          );
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('تم إيقاف الشات')) {
        throw err;
      }
    }
  }

  try {
    const payload: Omit<TeamChatMessage, 'id'> = {
      senderId: params.sender.id,
      senderUsername: params.sender.username,
      senderName: params.sender.fullName,
      senderRole: normalizeUserRole(params.sender.role),
      message: trimmed,
      ...(hasAttachments ? { attachments: params.attachments!.slice(0, 10) } : {}),
      urgency: params.urgency || 'normal',
      ...(params.recipient
        ? {
            recipientId: params.recipient.id,
            recipientUsername: params.recipient.username,
            recipientName: params.recipient.fullName,
          }
        : {}),
      ...(params.targetUser
        ? {
            targetUsername: params.targetUser.username,
            targetName: params.targetUser.fullName,
          }
        : {}),
      ...(params.caseId?.trim() ? { caseId: params.caseId.trim().slice(0, 50) } : {}),
      ...(params.replyTo
        ? {
            replyToId: params.replyTo.id.slice(0, 128),
            replyToSenderName: params.replyTo.senderName.slice(0, 100),
            replyToSenderUsername: params.replyTo.senderUsername.slice(0, 50),
            replyToMessage: params.replyTo.message.slice(0, 300),
          }
        : {}),
      ...(params.mentions && params.mentions.length > 0
        ? { mentions: Array.from(new Set(params.mentions)).slice(0, 20) }
        : {}),
      readByUsernames: [params.sender.username],
      readByDetails: [
        {
          username: params.sender.username,
          fullName: params.sender.fullName,
          readAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    };

    await addDoc(collection(db, TEAM_CHAT_COLLECTION), payload);
  } catch (error) {
    handleDatabaseError(error, OperationType.CREATE, TEAM_CHAT_COLLECTION);
  }
}

export async function deleteTeamChatMessage(messageId: string): Promise<void> {
  if (!messageId) return;
  try {
    const msgRef = doc(db, TEAM_CHAT_COLLECTION, messageId);
    const snap = await getDoc(msgRef);
    const data = snap.exists() ? (snap.data() as TeamChatMessage) : null;
    await deleteDoc(msgRef);
    if (data?.attachments && data.attachments.length > 0) {
      await Promise.all(
        data.attachments.map((att) => deleteUploadedAttachmentFile(att.storedName))
      );
    }
  } catch (error) {
    handleDatabaseError(error, OperationType.DELETE, `${TEAM_CHAT_COLLECTION}/${messageId}`);
  }
}

export async function clearPublicTeamChatMessages(actingUser: User): Promise<number> {
  if (actingUser.role !== 'super_admin') {
    throw new Error('صلاحية تفريغ رسائل الشات متاحة لمدير النظام فقط.');
  }
  try {
    const snap = await getDocs(collection(db, TEAM_CHAT_COLLECTION));
    const targetDocs = snap.docs.filter((d) => !(d.data() as TeamChatMessage).recipientUsername);
    const refsToDelete = targetDocs.map((d) => d.ref);

    for (let i = 0; i < refsToDelete.length; i += 400) {
      const batch = writeBatch(db);
      refsToDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    for (const d of targetDocs) {
      const data = d.data() as TeamChatMessage;
      if (data.attachments && data.attachments.length > 0) {
        await Promise.all(data.attachments.map((a) => deleteUploadedAttachmentFile(a.storedName)));
      }
    }

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'تفريغ القناة العامة للشات',
      details: `تم حذف ${refsToDelete.length} رسالة من القناة العامة لشات التواصل`,
    });

    return refsToDelete.length;
  } catch (error) {
    handleDatabaseError(error, OperationType.DELETE, TEAM_CHAT_COLLECTION);
  }
}

export async function clearDmTeamChatMessages(
  userAUsername: string,
  userBUsername: string,
  actingUser: User
): Promise<number> {
  if (actingUser.role !== 'super_admin') {
    throw new Error('صلاحية تفريغ المحادثة متاحة لمدير النظام فقط.');
  }
  try {
    const snap = await getDocs(collection(db, TEAM_CHAT_COLLECTION));
    const targetDocs = snap.docs.filter((d) => {
      const m = d.data() as TeamChatMessage;
      if (!m.recipientUsername) return false;
      return (
        (m.senderUsername === userAUsername && m.recipientUsername === userBUsername) ||
        (m.senderUsername === userBUsername && m.recipientUsername === userAUsername)
      );
    });
    const refsToDelete = targetDocs.map((d) => d.ref);

    for (let i = 0; i < refsToDelete.length; i += 400) {
      const batch = writeBatch(db);
      refsToDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    for (const d of targetDocs) {
      const data = d.data() as TeamChatMessage;
      if (data.attachments && data.attachments.length > 0) {
        await Promise.all(data.attachments.map((a) => deleteUploadedAttachmentFile(a.storedName)));
      }
    }

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'تفريغ محادثة شات خاصة',
      details: `تم حذف ${refsToDelete.length} رسالة من المحادثة الخاصة بين (${userAUsername}) و(${userBUsername})`,
    });

    return refsToDelete.length;
  } catch (error) {
    handleDatabaseError(error, OperationType.DELETE, TEAM_CHAT_COLLECTION);
  }
}

export async function clearAllTeamChatMessages(actingUser: User): Promise<number> {
  if (actingUser.role !== 'super_admin') {
    throw new Error('صلاحية تفريغ الشات بالكامل متاحة لمدير النظام فقط.');
  }
  try {
    const snap = await getDocs(collection(db, TEAM_CHAT_COLLECTION));
    const refsToDelete = snap.docs.map((d) => d.ref);

    for (let i = 0; i < refsToDelete.length; i += 400) {
      const batch = writeBatch(db);
      refsToDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    for (const d of snap.docs) {
      const data = d.data() as TeamChatMessage;
      if (data.attachments && data.attachments.length > 0) {
        await Promise.all(data.attachments.map((a) => deleteUploadedAttachmentFile(a.storedName)));
      }
    }

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'تفريغ كافة رسائل الشات بالمنظومة',
      details: `تم حذف جميع رسائل الشات (${refsToDelete.length} رسالة) بالكامل`,
    });

    return refsToDelete.length;
  } catch (error) {
    handleDatabaseError(error, OperationType.DELETE, TEAM_CHAT_COLLECTION);
  }
}

export async function markTeamChatMessagesAsRead(
  messages: TeamChatMessage[],
  reader: User
): Promise<void> {
  const unread = messages.filter(
    (m) =>
      m.senderId !== reader.id &&
      m.senderUsername !== reader.username &&
      !(m.readByUsernames || []).includes(reader.username)
  );
  if (unread.length === 0) return;

  try {
    const now = new Date().toISOString();
    for (let i = 0; i < unread.length; i += 350) {
      const batch = writeBatch(db);
      const slice = unread.slice(i, i + 350);
      for (const msg of slice) {
        const ref = doc(db, TEAM_CHAT_COLLECTION, msg.id);
        batch.update(ref, {
          readByUsernames: arrayUnion(reader.username),
          readByDetails: arrayUnion({
            username: reader.username,
            fullName: reader.fullName,
            readAt: now,
          }),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn('Read receipt update skipped:', err);
  }
}
