/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SystemSettingsConfig {
  hotline: string;
  sessionTimeoutMinutes: number;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsConfig = {
  hotline: '16395',
  sessionTimeoutMinutes: 30,
};

export const MIN_SESSION_TIMEOUT_MINUTES = 5;
export const MAX_SESSION_TIMEOUT_MINUTES = 120;

export function normalizeSystemSettings(
  input: Partial<SystemSettingsConfig> | null | undefined
): SystemSettingsConfig {
  const rawHotline = typeof input?.hotline === 'string' ? input.hotline.trim() : '';
  const hotline = rawHotline || DEFAULT_SYSTEM_SETTINGS.hotline;

  const rawTimeout = Number(input?.sessionTimeoutMinutes);
  const sessionTimeoutMinutes = Number.isFinite(rawTimeout)
    ? Math.min(
        MAX_SESSION_TIMEOUT_MINUTES,
        Math.max(MIN_SESSION_TIMEOUT_MINUTES, Math.round(rawTimeout))
      )
    : DEFAULT_SYSTEM_SETTINGS.sessionTimeoutMinutes;

  return {
    hotline,
    sessionTimeoutMinutes,
    ...(input?.updatedAt ? { updatedAt: input.updatedAt } : {}),
    ...(input?.updatedBy ? { updatedBy: input.updatedBy } : {}),
  };
}

export function validateSystemSettingsInput(
  hotlineInput: string,
  timeoutInput: string | number
): { valid: boolean; error?: string; normalized?: SystemSettingsConfig } {
  const cleanHotline = (hotlineInput || '').trim();
  if (!cleanHotline || cleanHotline.length < 3 || cleanHotline.length > 20) {
    return {
      valid: false,
      error: 'يرجى إدخال رقم خط ساخن صحيح (من 3 إلى 20 حرفاً أو رقماً).',
    };
  }

  const parsedTimeout = Number(timeoutInput);
  if (
    !Number.isFinite(parsedTimeout) ||
    parsedTimeout < MIN_SESSION_TIMEOUT_MINUTES ||
    parsedTimeout > MAX_SESSION_TIMEOUT_MINUTES
  ) {
    return {
      valid: false,
      error: `مهلة تسجيل الخروج التلقائي يجب أن تكون بين ${MIN_SESSION_TIMEOUT_MINUTES} و ${MAX_SESSION_TIMEOUT_MINUTES} دقيقة.`,
    };
  }

  return {
    valid: true,
    normalized: normalizeSystemSettings({
      hotline: cleanHotline,
      sessionTimeoutMinutes: parsedTimeout,
    }),
  };
}
