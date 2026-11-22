/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GoogleWorkspaceUser {
  displayName: string | null;
  email: string | null;
  photoURL?: string | null;
}

const DEFAULT_TOKEN_TTL_SECONDS = 3600;
const EXPIRY_SAFETY_BUFFER_MS = 30_000;

export function computeTokenExpiryMs(
  expiresInSeconds?: number | string | null,
  nowMs: number = Date.now()
): number {
  const parsed = Number(expiresInSeconds);
  const ttlSec =
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOKEN_TTL_SECONDS;
  return nowMs + ttlSec * 1000;
}

export function isAccessTokenValid(
  token: string | null | undefined,
  expiresAtMs: number,
  nowMs: number = Date.now()
): boolean {
  if (!token || typeof token !== 'string' || !token.trim()) return false;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return false;
  return nowMs < expiresAtMs - EXPIRY_SAFETY_BUFFER_MS;
}

export function formatGoogleOAuthError(
  errorCode?: string | null,
  errorDescription?: string | null
): string {
  const code = String(errorCode || '').trim().toLowerCase();
  const desc = String(errorDescription || '').trim();

  switch (code) {
    case 'popup_closed':
      return 'تم إغلاق نافذة تسجيل الدخول بحساب Google قبل إتمام الربط.';
    case 'popup_failed_to_open':
      return 'تعذر فتح نافذة تسجيل الدخول بحساب Google. يرجى السماح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع والمحاولة مرة أخرى.';
    case 'access_denied':
      return 'تم رفض منح صلاحيات الوصول إلى Google Drive / Google Sheets. يرجى الموافقة على الصلاحيات للمتابعة.';
    case 'invalid_client':
    case 'unauthorized_client':
      return 'معرّف عميل Google OAuth غير مصرح له على هذا النطاق أو يحتاج لتحديث إعدادات OAuth.';
    case 'gsi_load_failed':
      return 'تعذر تحميل خدمة تسجيل الدخول من Google (accounts.google.com). يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.';
    default:
      if (desc) {
        return `تعذر تسجيل الدخول بحساب Google: ${desc}`;
      }
      if (code) {
        return `تعذر تسجيل الدخول بحساب Google (${code}).`;
      }
      return 'تعذر إتمام تسجيل الدخول بحساب Google. يرجى المحاولة مرة أخرى.';
  }
}

export function parseDriveAboutUser(payload: unknown): GoogleWorkspaceUser {
  const userObj =
    payload && typeof payload === 'object' && 'user' in payload
      ? (payload as { user?: Record<string, unknown> }).user
      : null;

  const displayName =
    userObj && typeof userObj.displayName === 'string' && userObj.displayName.trim()
      ? userObj.displayName.trim()
      : null;
  const email =
    userObj && typeof userObj.emailAddress === 'string' && userObj.emailAddress.trim()
      ? userObj.emailAddress.trim()
      : null;
  const photoURL =
    userObj && typeof userObj.photoLink === 'string' && userObj.photoLink.trim()
      ? userObj.photoLink.trim()
      : null;

  return {
    displayName: displayName || email || 'حساب Google متصل',
    email,
    photoURL,
  };
}
