/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User } from '../types';
import { loginWithCredentials } from '../services/authService';
import { logAuditEvent } from '../services/auditService';
import { initializeUsersDatabase, updateUserPresence } from '../services/userService';
import {
  DEFAULT_SYSTEM_SETTINGS,
  fetchSystemSettings,
  subscribeToSystemSettings,
} from '../services/systemSettingsService';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isVerifiedInScreen: boolean;
  isLoading: boolean;
  sessionTimeoutMinutes: number;
  systemHotline: string;
  login: (
    username: string,
    password: string,
    activeSection?: 'agents' | 'management_tech' | 'admin'
  ) => Promise<{ success: boolean; errorMessage?: string }>;
  confirmIdentity: () => void;
  logout: (reason?: 'manual' | 'timeout') => Promise<void>;
  updateCurrentUserData: (updated: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'eta_crm_active_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isVerifiedInScreen, setIsVerifiedInScreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number>(
    DEFAULT_SYSTEM_SETTINGS.sessionTimeoutMinutes
  );
  const [systemHotline, setSystemHotline] = useState<string>(DEFAULT_SYSTEM_SETTINGS.hotline);
  const logoutRef = useRef<(reason?: 'manual' | 'timeout') => Promise<void>>(async () => {});

  useEffect(() => {
    const unsub = subscribeToSystemSettings((cfg) => {
      setSessionTimeoutMinutes(cfg.sessionTimeoutMinutes);
      setSystemHotline(cfg.hotline);
    });
    fetchSystemSettings().then((cfg) => {
      setSessionTimeoutMinutes(cfg.sessionTimeoutMinutes);
      setSystemHotline(cfg.hotline);
    });
    return () => unsub();
  }, []);

  // Initialize DB with CSV users on first boot
  useEffect(() => {
    async function init() {
      try {
        await initializeUsersDatabase();
      } catch (err) {
        console.warn('Initial seeding note:', err);
      } finally {
        // Restore saved session reliably (try localStorage first, then sessionStorage fallback)
        try {
          const saved =
            localStorage.getItem(AUTH_STORAGE_KEY) ||
            sessionStorage.getItem(AUTH_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.user && parsed.user.status !== 'disabled') {
              setCurrentUser(parsed.user);
              setIsVerifiedInScreen(parsed.isVerified !== false);
              // Keep both storages synchronized across reloads
              const serialized = JSON.stringify({
                user: parsed.user,
                isVerified: parsed.isVerified !== false,
                timestamp: parsed.timestamp || Date.now(),
              });
              localStorage.setItem(AUTH_STORAGE_KEY, serialized);
              sessionStorage.setItem(AUTH_STORAGE_KEY, serialized);
              updateUserPresence(parsed.user.id, true);
            }
          }
        } catch {
          // ignore corrupted local storage
        }
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const logout = useCallback(async (reason: 'manual' | 'timeout' = 'manual') => {
    if (currentUser) {
      await updateUserPresence(currentUser.id, false);
      await logAuditEvent({
        userId: currentUser.id,
        username: currentUser.username,
        fullName: currentUser.fullName,
        role: currentUser.role,
        action: 'تسجيل خروج',
        details:
          reason === 'timeout'
            ? 'تم إنهاء الجلسة تلقائياً لانتهاء مهلة عدم النشاط'
            : 'تم إنهاء الجلسة يدوياً بنجاح',
      });
    }
    setCurrentUser(null);
    setIsVerifiedInScreen(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }, [currentUser]);

  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  // Session activity tracker for auto-logout & online presence heartbeat
  useEffect(() => {
    if (!currentUser) return;

    let timer: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        logoutRef.current('timeout');
      }, sessionTimeoutMinutes * 60 * 1000);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(ev => window.addEventListener(ev, resetTimer));
    resetTimer();

    // Heartbeat every 45 seconds so Online/Offline status stays live
    updateUserPresence(currentUser.id, true);
    const heartbeat = setInterval(() => {
      updateUserPresence(currentUser.id, true);
    }, 45_000);

    const handlePageHide = () => {
      updateUserPresence(currentUser.id, false);
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      events.forEach(ev => window.removeEventListener(ev, resetTimer));
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [currentUser, sessionTimeoutMinutes]);

  const login = async (
    username: string,
    password: string,
    activeSection?: 'agents' | 'management_tech' | 'admin'
  ) => {
    setIsLoading(true);
    try {
      const result = await loginWithCredentials(username, password, activeSection);
      if (result.success && result.user) {
        setCurrentUser(result.user);
        setIsVerifiedInScreen(false); // Require identity verification confirmation
        const payload = JSON.stringify({
          user: result.user,
          isVerified: false,
          timestamp: Date.now(),
        });
        localStorage.setItem(AUTH_STORAGE_KEY, payload);
        sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
        updateUserPresence(result.user.id, true);
        return { success: true };
      } else {
        return { success: false, errorMessage: result.errorMessage };
      }
    } finally {
      setIsLoading(false);
    }
  };

  const confirmIdentity = () => {
    setIsVerifiedInScreen(true);
    if (currentUser) {
      const payload = JSON.stringify({
        user: currentUser,
        isVerified: true,
        timestamp: Date.now(),
      });
      localStorage.setItem(AUTH_STORAGE_KEY, payload);
      sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
    }
  };

  const updateCurrentUserData = (updated: Partial<User>) => {
    if (!currentUser) return;
    const merged = { ...currentUser, ...updated };
    setCurrentUser(merged);
    const payload = JSON.stringify({
      user: merged,
      isVerified: isVerifiedInScreen,
      timestamp: Date.now(),
    });
    localStorage.setItem(AUTH_STORAGE_KEY, payload);
    sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isVerifiedInScreen,
        isLoading,
        sessionTimeoutMinutes,
        systemHotline,
        login,
        confirmIdentity,
        logout,
        updateCurrentUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
