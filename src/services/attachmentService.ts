/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CaseAttachment, CaseAttachmentStage, ChatAttachment, User } from '../types';

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_CASE = 25;

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
];

export const ATTACHMENT_ACCEPT_ATTR =
  '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,image/*';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);

export function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx === -1) return '';
  return fileName.slice(idx).toLowerCase();
}

export function validateAttachmentFile(file: File): string | null {
  if (!file) return 'الملف غير صالح.';
  if (file.size === 0) return `الملف "${file.name}" فارغ ولا يمكن إرفاقه.`;
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `حجم الملف "${file.name}" يتجاوز الحد الأقصى المسموح به (10 ميجابايت).`;
  }
  const ext = getFileExtension(file.name);
  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime) && !ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    return `صيغة الملف "${file.name}" غير مدعومة. الصيغ المدعومة: PDF، الصور، Word، Excel، CSV، أو TXT.`;
  }
  return null;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error(`تعذر قراءة الملف "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export async function uploadCaseAttachment(
  file: File,
  stage: CaseAttachmentStage,
  actingUser: User
): Promise<CaseAttachment> {
  const validationError = validateAttachmentFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const dataBase64 = await readFileAsBase64(file);

  const response = await fetch('/api/attachments/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataBase64,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `فشل رفع الملف "${file.name}".`);
  }

  return {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fileName: payload.fileName || file.name,
    storedName: payload.storedName,
    mimeType: payload.mimeType || file.type || 'application/octet-stream',
    sizeBytes: payload.sizeBytes ?? file.size,
    url: payload.url,
    stage,
    uploadedById: actingUser.id,
    uploadedByName: actingUser.fullName,
    uploadedByRole: actingUser.role,
    uploadedAt: new Date().toISOString(),
  };
}

export async function uploadChatAttachment(file: File): Promise<ChatAttachment> {
  const validationError = validateAttachmentFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const dataBase64 = await readFileAsBase64(file);

  const response = await fetch('/api/attachments/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataBase64,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `فشل رفع الملف "${file.name}".`);
  }

  return {
    id: `chat_att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fileName: payload.fileName || file.name,
    storedName: payload.storedName,
    mimeType: payload.mimeType || file.type || 'application/octet-stream',
    sizeBytes: payload.sizeBytes ?? file.size,
    url: payload.url,
  };
}

export async function deleteUploadedAttachmentFile(storedName: string): Promise<void> {
  if (!storedName) return;
  try {
    await fetch(`/api/attachments/file/${encodeURIComponent(storedName)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Best-effort attachment file cleanup failed:', err);
  }
}

export function formatFileSizeArabic(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 بايت';
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
}

export function getAttachmentStageLabel(stage: CaseAttachmentStage): string {
  switch (stage) {
    case 'create':
      return 'عند إنشاء الحالة';
    case 'agent_reply':
      return 'رد وكيل الاتصال';
    case 'management_reply':
      return 'رد الإدارة والدعم التقني';
    default:
      return 'مرفق بالحالة';
  }
}

export function isPreviewableImage(mimeType: string, fileName: string): boolean {
  const mime = (mimeType || '').toLowerCase();
  const ext = getFileExtension(fileName);
  return mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
}

export function isPreviewablePdf(mimeType: string, fileName: string): boolean {
  const mime = (mimeType || '').toLowerCase();
  const ext = getFileExtension(fileName);
  return mime === 'application/pdf' || ext === '.pdf';
}

export function getAttachmentDownloadUrl(att: Pick<CaseAttachment, 'url' | 'fileName'>): string {
  const sep = att.url.includes('?') ? '&' : '?';
  return `${att.url}${sep}download=1&name=${encodeURIComponent(att.fileName)}`;
}

export function getAttachmentInlineUrl(att: Pick<CaseAttachment, 'url' | 'fileName'>): string {
  const sep = att.url.includes('?') ? '&' : '?';
  return `${att.url}${sep}name=${encodeURIComponent(att.fileName)}`;
}
