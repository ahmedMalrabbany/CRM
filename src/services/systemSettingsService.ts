/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, setDoc, onSnapshot } from '../lib/sheetsDb';
import { db, handleDatabaseError, OperationType } from '../config/sheetsConfig';
import { User } from '../types';
import { logAuditEvent } from './auditService';
import {
  SystemSettingsConfig,
  DEFAULT_SYSTEM_SETTINGS,
  normalizeSystemSettings,
} from '../utils/systemSettingsUtils';

export type { SystemSettingsConfig };
export { DEFAULT_SYSTEM_SETTINGS, normalizeSystemSettings, validateSystemSettingsInput } from '../utils/systemSettingsUtils';

const SETTINGS_COLLECTION = 'settings';
const SYSTEM_SETTINGS_DOC_ID = 'system';
const LOCAL_CACHE_KEY = 'eta_crm_system_settings';

function readLocalCache(): SystemSettingsConfig {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return DEFAULT_SYSTEM_SETTINGS;
    return normalizeSystemSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

function writeLocalCache(config: SystemSettingsConfig): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

export async function fetchSystemSettings(): Promise<SystemSettingsConfig> {
  try {
    const ref = doc(db, SETTINGS_COLLECTION, SYSTEM_SETTINGS_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const initial: SystemSettingsConfig = {
        ...readLocalCache(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'النظام الافتراضي',
      };
      await setDoc(ref, initial);
      writeLocalCache(initial);
      return initial;
    }

    const normalized = normalizeSystemSettings(snap.data() as Partial<SystemSettingsConfig>);
    writeLocalCache(normalized);
    return normalized;
  } catch (err) {
    console.warn('Fallback to cached system settings:', err);
    return readLocalCache();
  }
}

export function subscribeToSystemSettings(
  callback: (config: SystemSettingsConfig) => void
): () => void {
  callback(readLocalCache());

  const onLocalEvent = (ev: Event) => {
    const custom = ev as CustomEvent<SystemSettingsConfig>;
    if (custom.detail) {
      callback(normalizeSystemSettings(custom.detail));
    }
  };
  window.addEventListener('eta:system-settings-updated', onLocalEvent);

  const ref = doc(db, SETTINGS_COLLECTION, SYSTEM_SETTINGS_DOC_ID);
  const unsubDb = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const normalized = normalizeSystemSettings(snap.data() as Partial<SystemSettingsConfig>);
      writeLocalCache(normalized);
      callback(normalized);
    },
    (error) => {
      console.warn('System settings subscription error:', error);
    }
  );

  return () => {
    window.removeEventListener('eta:system-settings-updated', onLocalEvent);
    unsubDb();
  };
}

export async function saveSystemSettings(
  input: Pick<SystemSettingsConfig, 'hotline' | 'sessionTimeoutMinutes'>,
  actingUser?: User | null
): Promise<SystemSettingsConfig> {
  try {
    const ref = doc(db, SETTINGS_COLLECTION, SYSTEM_SETTINGS_DOC_ID);
    const normalized = normalizeSystemSettings({
      ...input,
      updatedAt: new Date().toISOString(),
      updatedBy: actingUser?.fullName || 'مدير النظام',
    });

    await setDoc(ref, normalized);
    writeLocalCache(normalized);
    window.dispatchEvent(new CustomEvent('eta:system-settings-updated', { detail: normalized }));

    if (actingUser) {
      await logAuditEvent({
        userId: actingUser.id,
        username: actingUser.username,
        fullName: actingUser.fullName,
        role: actingUser.role,
        action: 'تحديث إعدادات النظام العامة',
        recordId: SYSTEM_SETTINGS_DOC_ID,
        details: `تم تحديث الخط الساخن إلى (${normalized.hotline}) ومهلة الجلسة إلى (${normalized.sessionTimeoutMinutes}) دقيقة`,
      });
    }

    return normalized;
  } catch (error) {
    handleDatabaseError(error, OperationType.WRITE, `${SETTINGS_COLLECTION}/${SYSTEM_SETTINGS_DOC_ID}`);
  }
}
