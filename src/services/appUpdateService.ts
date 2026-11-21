/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { registerSW } from 'virtual:pwa-register';

export interface AppUpdateState {
  updateAvailable: boolean;
  reason: 'sw' | 'server_version' | null;
  latestBuildId: string | null;
  detectedAt: string | null;
}

type UpdateListener = (state: AppUpdateState) => void;

const VERSION_CHECK_INTERVAL_MS = 20_000;
const SW_CHECK_INTERVAL_MS = 30_000;

let initialized = false;
let initialServerBuildId: string | null = null;
let swUpdateRunner: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swNeedsRefresh = false;

let currentState: AppUpdateState = {
  updateAvailable: false,
  reason: null,
  latestBuildId: null,
  detectedAt: null,
};

const listeners = new Set<UpdateListener>();

function emitState(): void {
  const snapshot: AppUpdateState = { ...currentState };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Ignore individual subscriber errors
    }
  });
}

function triggerUpdate(reason: 'sw' | 'server_version', latestBuildId?: string | null): void {
  if (currentState.updateAvailable) {
    if (latestBuildId && !currentState.latestBuildId) {
      currentState = {
        ...currentState,
        latestBuildId,
      };
      emitState();
    }
    return;
  }

  currentState = {
    updateAvailable: true,
    reason,
    latestBuildId: latestBuildId || null,
    detectedAt: new Date().toISOString(),
  };
  emitState();
}

async function fetchVersionPayload(): Promise<{
  buildId?: string;
  builtAt?: string;
  mode?: string;
} | null> {
  const endpoints = [`/api/app-version?t=${Date.now()}`, `/version.json?t=${Date.now()}`];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) continue;
      return (await res.json()) as {
        buildId?: string;
        builtAt?: string;
        mode?: string;
      };
    } catch {
      // Try fallback endpoint
    }
  }

  return null;
}

async function checkServerVersion(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  try {
    const data = await fetchVersionPayload();
    if (!data) return;

    const serverBuildId = typeof data?.buildId === 'string' ? data.buildId.trim() : '';
    if (!serverBuildId) return;

    // In production, compare the bundle's embedded build ID against live server/static version
    if (
      import.meta.env.PROD &&
      (!data.mode || data.mode === 'production') &&
      typeof __APP_BUILD_ID__ === 'string' &&
      __APP_BUILD_ID__ &&
      serverBuildId !== __APP_BUILD_ID__
    ) {
      triggerUpdate('server_version', serverBuildId);
      return;
    }

    if (initialServerBuildId === null) {
      initialServerBuildId = serverBuildId;
      return;
    }

    if (serverBuildId !== initialServerBuildId) {
      triggerUpdate('server_version', serverBuildId);
    }
  } catch {
    // Transient network error; retry on next poll or focus event
  }
}

export function startAppUpdateMonitor(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  let activeRegistration: ServiceWorkerRegistration | undefined;

  try {
    swUpdateRunner = registerSW({
      immediate: true,
      onNeedRefresh() {
        swNeedsRefresh = true;
        triggerUpdate('sw');
      },
      onRegisteredSW(_swUrl, registration) {
        activeRegistration = registration;
        if (registration?.waiting) {
          swNeedsRefresh = true;
          triggerUpdate('sw');
        }
      },
      onRegisterError() {
        // Fallback polling via /api/app-version continues normally
      },
    });
  } catch {
    // Ignore SW registration failure in unsupported contexts
  }

  const checkServiceWorker = () => {
    if (!activeRegistration || !navigator.onLine) return;
    activeRegistration.update().catch(() => {
      // Ignore transient SW update errors
    });
  };

  // Initial check shortly after mount
  void checkServerVersion();

  const versionTimer = window.setInterval(() => {
    void checkServerVersion();
  }, VERSION_CHECK_INTERVAL_MS);

  const swTimer = window.setInterval(() => {
    checkServiceWorker();
  }, SW_CHECK_INTERVAL_MS);

  const handleResume = () => {
    if (document.visibilityState === 'hidden') return;
    void checkServerVersion();
    checkServiceWorker();
  };

  window.addEventListener('focus', handleResume);
  window.addEventListener('online', handleResume);
  document.addEventListener('visibilitychange', handleResume);

  // Keep references used cleanly without leaks during SPA lifetime
  void versionTimer;
  void swTimer;
}

export function subscribeToAppUpdates(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener({ ...currentState });
  return () => {
    listeners.delete(listener);
  };
}

export async function applyAppUpdateAndReload(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Bypass exit confirmation beforeunload prompt for intentional update reload
  window.__crmBypassBeforeUnload = true;

  // Activate waiting Service Worker if present
  if (swUpdateRunner && swNeedsRefresh) {
    try {
      await Promise.race([
        swUpdateRunner(true),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      // Continue to manual cache purge & reload fallback
    }
  }

  // Purge cached static assets so the next load fetches fresh HTML/JS/CSS
  if ('caches' in window) {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((key) => !key.includes('google-fonts'))
          .map((key) => caches.delete(key))
      );
    } catch {
      // Ignore cache deletion failures
    }
  }

  window.location.reload();
}
