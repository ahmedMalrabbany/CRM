/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bell,
  LogOut,
  Plus,
  Clock,
  CheckCheck,
  Shield,
  Headphones,
  Briefcase,
  Wrench,
  Search,
  Menu,
  Sun,
  Moon,
  Globe,
  Send,
  Volume2,
  VolumeX,
  X,
  Trash2,
  CheckSquare,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications, sortNotificationsNewestFirst } from '../context/NotificationContext';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import { CrmLogo } from './EtaLogo';
import { PWAInstallButton } from './PWAInstallPrompt';
import { deleteSelectedNotifications } from '../services/caseService';
import {
  isSoundAlertsEnabled,
  setSoundAlertsEnabled,
  playAlertSound,
} from '../utils/soundAlerts';

interface NavbarProps {
  onOpenNewCase: () => void;
  onOpenSmartSearch?: () => void;
  onOpenSendNotification?: () => void;
  onOpenSheetsSync?: () => void;
  unreadIncomingCount?: number;
  onToggleMobileMenu?: () => void;
  onRequestLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenNewCase,
  onOpenSmartSearch,
  onOpenSendNotification,
  onOpenSheetsSync,
  onToggleMobileMenu,
  onRequestLogout,
}) => {
  const { currentUser, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { isDark, language, isRtl, toggleTheme, toggleLanguage, t } = useThemeLanguage();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isSoundAlertsEnabled());
  const desktopNotifRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [isSelectNotifMode, setIsSelectNotifMode] = useState(false);
  const [selectedNotifIds, setSelectedNotifIds] = useState<string[]>([]);
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  const [isDeletingNotifs, setIsDeletingNotifs] = useState(false);

  const sortedNotifications = useMemo(
    () => sortNotificationsNewestFirst(notifications),
    [notifications]
  );

  // Prune selected IDs that no longer exist in notifications
  useEffect(() => {
    const validIds = new Set(sortedNotifications.map((n) => n.id));
    setSelectedNotifIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [sortedNotifications]);

  useEffect(() => {
    if (!isNotifOpen) {
      setIsSelectNotifMode(false);
      setSelectedNotifIds([]);
      setConfirmDeleteSelected(false);
    }
  }, [isNotifOpen]);

  const toggleNotifSelection = (id: string) => {
    setConfirmDeleteSelected(false);
    setSelectedNotifIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllNotifs = () => {
    setConfirmDeleteSelected(false);
    if (selectedNotifIds.length === sortedNotifications.length) {
      setSelectedNotifIds([]);
    } else {
      setSelectedNotifIds(sortedNotifications.map((n) => n.id));
    }
  };

  const handleDeleteSelectedInBell = async () => {
    if (!currentUser || !isSuperAdmin || selectedNotifIds.length === 0 || isDeletingNotifs) return;
    setIsDeletingNotifs(true);
    try {
      await deleteSelectedNotifications(selectedNotifIds, currentUser, 'من قائمة الإشعارات');
      setSelectedNotifIds([]);
      setConfirmDeleteSelected(false);
      setIsSelectNotifMode(false);
    } catch (err) {
      console.error('Failed to delete selected notifications:', err);
    } finally {
      setIsDeletingNotifs(false);
    }
  };

  const formatNotificationDateTime = (isoDate: string) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    if (!isNotifOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsNotifOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (desktopNotifRef.current && !desktopNotifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotifOpen]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundAlertsEnabled(next);
    setSoundEnabled(next);
    if (next) {
      playAlertSound('notification');
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [language]);

  const getRoleLabel = () => {
    if (!currentUser) return '';
    switch (currentUser.role) {
      case 'super_admin':
        return t('roleSuperAdmin');
      case 'agent':
        return t('roleCallAgent');
      case 'management':
        return t('roleDeptManager');
      case 'technical_support':
        return t('roleTechSupport');
    }
  };

  return (
    <header className="bg-[#00264D] dark:bg-[#001833] border-b border-[#003E75] text-white sticky top-0 z-40 shadow-saas">
      {/* ========================================================================= */}
      {/* DESKTOP VIEW (lg:flex) - Clean 3-Zone Top Bar                             */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex px-4 xl:px-5 py-2.5 items-center justify-between gap-3">
        {/* Zone 1: Brand Emblem & Wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <CrmLogo
            size={36}
            showText={true}
            lightMode={true}
            title={t('appTitle')}
            subtitle={t('appSub')}
          />
        </div>

        {/* Zone 2: Interactive Smart Search Bar & Live Clock */}
        <div className="flex items-center gap-2 text-xs min-w-0 flex-1 justify-center">
          {onOpenSmartSearch && (
            <button
              onClick={onOpenSmartSearch}
              className="group flex items-center justify-between gap-2 bg-[#003366] hover:bg-[#004080] text-slate-200 hover:text-white px-2.5 py-2 rounded-xl border border-[#004B87] hover:border-[#00A651] transition-all duration-200 w-full max-w-[185px] xl:max-w-[220px] min-w-[130px] whitespace-nowrap active:scale-[0.99]"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <Search className="w-3.5 h-3.5 text-[#00E676] shrink-0 group-hover:scale-110 transition-transform" />
                <span className="truncate">{t('smartSearchPlaceholder')}</span>
              </span>
              <span className="text-[10px] font-mono text-white bg-[#004B87] px-1.5 py-0.5 rounded border border-[#0062B0] shrink-0">
                AI
              </span>
            </button>
          )}

          <div className="hidden 2xl:flex items-center gap-1.5 text-slate-200 bg-[#003366] border border-[#004B87] px-2.5 py-2 rounded-xl font-mono tabular-nums whitespace-nowrap shrink-0">
            <Clock className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
            <span>{currentTime}</span>
          </div>
        </div>

        {/* Zone 3: Actions, Notifications, User Profile */}
        <div className="flex items-center gap-1.5 xl:gap-2 shrink-0">
          <PWAInstallButton variant="navbar" />

          {/* Sound Alerts Toggle */}
          <button
            type="button"
            onClick={handleToggleSound}
            className={`p-2 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${
              soundEnabled
                ? 'bg-[#003366] hover:bg-[#004080] text-[#00E676] border-[#004B87]'
                : 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border-rose-700'
            }`}
            title={
              soundEnabled
                ? language === 'ar'
                  ? 'التنبيهات الصوتية مفعلة (اضغط للكتم)'
                  : 'Sound Alerts On (Click to Mute)'
                : language === 'ar'
                ? 'التنبيهات الصوتية مكتومة (اضغط للتشغيل)'
                : 'Sound Alerts Muted (Click to Enable)'
            }
            aria-label="Toggle Sound Alerts"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-[#003366] hover:bg-[#004080] text-amber-300 hover:text-amber-200 border border-[#004B87] transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
            title={isDark ? t('themeLight') : t('themeDark')}
            aria-label={isDark ? t('themeLight') : t('themeDark')}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-300" />
            ) : (
              <Moon className="w-4 h-4 text-sky-200" />
            )}
          </button>

          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="px-2 py-2 rounded-xl bg-[#003366] hover:bg-[#004080] text-slate-100 hover:text-white border border-[#004B87] transition-all duration-200 hover:-translate-y-0.5 active:scale-95 text-xs font-bold flex items-center gap-1 whitespace-nowrap"
            title={language === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
            aria-label="Change Language"
          >
            <Globe className="w-3.5 h-3.5 text-[#00E676]" />
            <span className="font-mono text-[11px] font-black">
              {language === 'ar' ? 'EN' : 'عربي'}
            </span>
          </button>

          {/* Primary Action: New Case Button (Solid ETA Emerald Green) */}
          <button
            onClick={onOpenNewCase}
            className="px-3 py-2 bg-[#00A651] hover:bg-[#008742] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 shadow-md hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{t('newCase')}</span>
          </button>

          {/* Admin / Management / Tech Support: Google Sheets Details Sync */}
          {(currentUser?.role === 'super_admin' ||
            currentUser?.role === 'management' ||
            currentUser?.role === 'technical_support') &&
            onOpenSheetsSync && (
              <button
                type="button"
                onClick={onOpenSheetsSync}
                className="px-2.5 py-2 bg-[#003366] hover:bg-[#004080] text-[#00E676] hover:text-white border border-[#004B87] hover:border-[#00A651] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
                title={
                  language === 'ar'
                    ? 'مزامنة ورقة Details في Google Sheets'
                    : 'Sync Google Sheets (Details Tab)'
                }
                aria-label="Google Sheets Details Sync"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
                <span className="hidden 2xl:inline">Google </span>
                <span>Sheets</span>
              </button>
            )}

          {/* Admin / Management / Tech Support: Direct Send Notification Button */}
          {(currentUser?.role === 'super_admin' ||
            currentUser?.role === 'management' ||
            currentUser?.role === 'technical_support') &&
            onOpenSendNotification && (
              <button
                type="button"
                onClick={onOpenSendNotification}
                className="px-2.5 py-2 bg-[#004B87] hover:bg-[#00386B] text-white border border-[#0062B0] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
                title={
                  language === 'ar'
                    ? 'إرسال ومتابعة الإشعارات الموجهة للموظفين'
                    : 'Send & Track Staff Notices'
                }
              >
                <Send className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
                <span>{language === 'ar' ? 'إرسال إشعار' : 'Send Notice'}</span>
              </button>
            )}

          {/* Notifications Dropdown */}
          <div ref={desktopNotifRef} className="relative">
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative p-2 rounded-xl bg-[#003366] hover:bg-[#004080] text-slate-100 hover:text-white transition-all duration-200 border border-[#004B87] hover:-translate-y-0.5 active:scale-95"
              title={t('notifications')}
              aria-label={t('notifications')}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-mono font-bold tabular-nums flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div
                className={`absolute ${
                  isRtl ? 'left-0' : 'right-0'
                } mt-2.5 w-[400px] max-w-[calc(100vw-2rem)] max-h-[72vh] flex flex-col bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border-2 border-[#004B87]/30 dark:border-[#004B87] text-slate-800 dark:text-slate-100 overflow-hidden z-50 animate-scale-in`}
              >
                <div className="p-3.5 bg-[#00264D] text-white flex items-center justify-between gap-2 border-b border-[#004B87] shrink-0">
                  <div className="font-bold text-xs flex items-center gap-2 min-w-0">
                    <Bell className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
                    <span className="truncate">
                      {t('notifications')} ({sortedNotifications.length})
                    </span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-mono tabular-nums shrink-0">
                        {unreadCount} {language === 'ar' ? 'جديد' : 'new'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isSuperAdmin && sortedNotifications.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSelectNotifMode((prev) => !prev);
                          setSelectedNotifIds([]);
                          setConfirmDeleteSelected(false);
                        }}
                        className={`text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 font-bold transition-colors cursor-pointer ${
                          isSelectNotifMode
                            ? 'bg-rose-600 text-white'
                            : 'bg-white/10 hover:bg-white/20 text-sky-100'
                        }`}
                        title={language === 'ar' ? 'تحديد إشعارات للحذف' : 'Select notifications to delete'}
                      >
                        <CheckSquare className="w-3 h-3" />
                        <span>{isSelectNotifMode ? (language === 'ar' ? 'إلغاء' : 'Cancel') : (language === 'ar' ? 'تحديد' : 'Select')}</span>
                      </button>
                    )}
                    {(currentUser?.role === 'super_admin' ||
                      currentUser?.role === 'management' ||
                      currentUser?.role === 'technical_support') &&
                      onOpenSendNotification && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsNotifOpen(false);
                            onOpenSendNotification();
                          }}
                          className="text-[10px] bg-[#00A651] hover:bg-[#008742] text-white px-2 py-1 rounded-lg flex items-center gap-1 font-bold transition-colors cursor-pointer"
                        >
                          <Send className="w-2.5 h-2.5" />
                          <span>{language === 'ar' ? 'إرسال' : 'Send'}</span>
                        </button>
                      )}
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllAsRead()}
                        className="text-[10px] text-[#00E676] hover:text-white flex items-center gap-1 font-bold transition-colors cursor-pointer"
                      >
                        <CheckCheck className="w-3 h-3" /> {t('markAllRead')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsNotifOpen(false)}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                      aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isSuperAdmin && isSelectNotifMode && sortedNotifications.length > 0 && (
                  <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
                    <button
                      type="button"
                      onClick={handleToggleSelectAllNotifs}
                      className="font-bold text-[#004B87] dark:text-sky-300 hover:underline cursor-pointer"
                    >
                      {selectedNotifIds.length === sortedNotifications.length
                        ? language === 'ar'
                          ? 'إلغاء تحديد الكل'
                          : 'Deselect All'
                        : language === 'ar'
                        ? `تحديد الكل (${sortedNotifications.length})`
                        : `Select All (${sortedNotifications.length})`}
                    </button>

                    {selectedNotifIds.length > 0 &&
                      (confirmDeleteSelected ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isDeletingNotifs}
                            onClick={handleDeleteSelectedInBell}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black disabled:opacity-50 cursor-pointer"
                          >
                            {isDeletingNotifs
                              ? language === 'ar'
                                ? 'جارٍ الحذف...'
                                : 'Deleting...'
                              : language === 'ar'
                              ? `تأكيد حذف (${selectedNotifIds.length})`
                              : `Confirm Delete (${selectedNotifIds.length})`}
                          </button>
                          <button
                            type="button"
                            disabled={isDeletingNotifs}
                            onClick={() => setConfirmDeleteSelected(false)}
                            className="px-2 py-1 rounded-lg bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#00386B] text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                          >
                            {language === 'ar' ? 'إلغاء' : 'Cancel'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSelected(true)}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>
                            {language === 'ar'
                              ? `حذف المحدد (${selectedNotifIds.length})`
                              : `Delete Selected (${selectedNotifIds.length})`}
                          </span>
                        </button>
                      ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#00386B] text-xs">
                  {sortedNotifications.map((n) => {
                    const isChecked = selectedNotifIds.includes(n.id);
                    return (
                      <div
                        key={n.id}
                        onClick={() =>
                          isSelectNotifMode ? toggleNotifSelection(n.id) : markAsRead(n.id)
                        }
                        className={`p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#003366]/60 transition-colors flex items-start gap-2.5 ${
                          isSelectNotifMode && isChecked
                            ? 'bg-rose-50/80 dark:bg-rose-950/35'
                            : n.type === 'overdue_alert' && !n.isRead
                            ? 'bg-rose-50 dark:bg-rose-950/40 font-bold'
                            : !n.isRead
                            ? 'bg-[#004B87]/5 dark:bg-[#004B87]/35 font-bold'
                            : ''
                        }`}
                      >
                        {isSuperAdmin && isSelectNotifMode && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleNotifSelection(n.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 w-4 h-4 accent-rose-600 shrink-0 cursor-pointer"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {!n.isRead && (
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    n.type === 'overdue_alert' ? 'bg-rose-600' : 'bg-[#00A651]'
                                  }`}
                                />
                              )}
                              <span
                                className={`font-bold ${
                                  n.type === 'overdue_alert'
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : 'text-[#004B87] dark:text-sky-300'
                                }`}
                              >
                                {n.title}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0 whitespace-nowrap">
                              {formatNotificationDateTime(n.createdAt)}
                            </span>
                          </div>
                          <div className="text-slate-700 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-wrap break-words">
                            {n.message}
                          </div>
                          {(n.senderName || (n.caseId && n.caseId !== 'ADMIN-NOTICE')) && (
                            <div className="flex flex-wrap items-center justify-between gap-1.5 mt-1.5">
                              {n.senderName && (
                                <span className="text-[11px] text-[#00A651] dark:text-[#00E676] font-bold">
                                  {language === 'ar'
                                    ? `مرسل من: ${n.senderName}`
                                    : `From: ${n.senderName}`}
                                </span>
                              )}
                              {n.caseId && n.caseId !== 'ADMIN-NOTICE' && (
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#002B54] text-[#004B87] dark:text-sky-300">
                                  {n.caseId}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {sortedNotifications.length === 0 && (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      {t('noNotifications')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Summary */}
          {currentUser && (
            <div className="flex items-center gap-2.5 bg-[#003366] border border-[#004B87] px-3 py-1.5 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-[#00A651] text-white flex items-center justify-center font-bold text-xs shrink-0">
                {(currentUser.fullName || currentUser.username || 'م').charAt(0)}
              </div>
              <div className="text-start">
                <div className="font-bold text-xs text-white leading-tight line-clamp-1">
                  {currentUser.fullName || currentUser.username}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-300 mt-0.5">
                  <span className="font-mono tabular-nums text-[#00E676]">
                    {currentUser.crmUser}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{getRoleLabel()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Logout button */}
          <button
            onClick={() => (onRequestLogout ? onRequestLogout() : logout())}
            className="p-2 rounded-xl bg-[#003366] hover:bg-rose-700 text-slate-200 hover:text-white border border-[#004B87] hover:border-rose-600 transition-all duration-200 active:scale-95"
            title={t('logout')}
            aria-label={t('logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE & TABLET VIEW (lg:hidden) - Clean Responsive Single-Row Header     */}
      {/* ========================================================================= */}
      <div className="lg:hidden flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#003366] hover:bg-[#004080] text-slate-100 hover:text-white transition-all border border-[#004B87] active:scale-95 shrink-0"
              aria-label={t('mainMenu')}
              title={t('mainMenu')}
            >
              <Menu className="w-5 h-5 text-[#00E676]" />
            </button>
          )}
          <div className="shrink-0 sm:hidden">
            <CrmLogo
              size={34}
              showText={false}
              lightMode={true}
              title={t('appTitle')}
              subtitle={t('appSub')}
            />
          </div>
          <div className="hidden sm:block min-w-0 truncate">
            <CrmLogo
              size={34}
              showText={true}
              lightMode={true}
              title={t('appTitle')}
              subtitle={t('appSub')}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden sm:block">
            <PWAInstallButton variant="navbar" />
          </div>

          {onOpenSmartSearch && (
            <button
              onClick={onOpenSmartSearch}
              className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#003366] hover:bg-[#004080] text-[#00E676] border border-[#004B87] transition-all active:scale-95"
              title={t('smartSearchPlaceholder')}
              aria-label={t('smartSearchPlaceholder')}
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {(currentUser?.role === 'super_admin' ||
            currentUser?.role === 'management' ||
            currentUser?.role === 'technical_support') &&
            onOpenSheetsSync && (
              <button
                type="button"
                onClick={onOpenSheetsSync}
                className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#003366] hover:bg-[#004080] text-[#00E676] border border-[#004B87] transition-all active:scale-95"
                title={
                  language === 'ar'
                    ? 'مزامنة ورقة Details في Google Sheets'
                    : 'Sync Google Sheets (Details Tab)'
                }
                aria-label="Google Sheets Details Sync"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            )}

          {(currentUser?.role === 'super_admin' ||
            currentUser?.role === 'management' ||
            currentUser?.role === 'technical_support') &&
            onOpenSendNotification && (
              <button
                type="button"
                onClick={onOpenSendNotification}
                className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#004B87] hover:bg-[#00386B] text-[#00E676] border border-[#0062B0] transition-all active:scale-95"
                title={language === 'ar' ? 'إرسال إشعار للموظفين' : 'Send Staff Notice'}
                aria-label={language === 'ar' ? 'إرسال إشعار للموظفين' : 'Send Staff Notice'}
              >
                <Send className="w-4 h-4" />
              </button>
            )}

          {/* Tablet & Mobile Notifications trigger */}
          <div className="relative">
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#003366] hover:bg-[#004080] text-slate-100 border border-[#004B87] transition-all active:scale-95"
              title={t('notifications')}
              aria-label={t('notifications')}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-mono font-bold tabular-nums flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px]"
                  onClick={() => setIsNotifOpen(false)}
                />
                <div className="fixed inset-x-3 top-16 sm:inset-x-auto sm:top-auto sm:absolute sm:end-0 sm:mt-2 sm:w-80 max-h-[75dvh] flex flex-col bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border-2 border-[#004B87] dark:border-[#00A651] text-slate-800 dark:text-slate-100 overflow-hidden z-50 animate-scale-in">
                  <div className="p-3.5 bg-[#00264D] text-white flex items-center justify-between gap-2 border-b border-[#004B87] shrink-0">
                    <span className="font-bold text-xs flex items-center gap-1.5 min-w-0">
                      <Bell className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
                      <span className="truncate">
                        {t('notifications')} ({sortedNotifications.length})
                      </span>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-mono tabular-nums shrink-0">
                          {unreadCount}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isSuperAdmin && sortedNotifications.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsSelectNotifMode((prev) => !prev);
                            setSelectedNotifIds([]);
                            setConfirmDeleteSelected(false);
                          }}
                          className={`text-[10px] px-2 py-1 rounded-md flex items-center gap-1 font-bold ${
                            isSelectNotifMode
                              ? 'bg-rose-600 text-white'
                              : 'bg-white/15 text-sky-100'
                          }`}
                        >
                          <CheckSquare className="w-3 h-3" />
                          <span>{isSelectNotifMode ? (language === 'ar' ? 'إلغاء' : 'Cancel') : (language === 'ar' ? 'تحديد' : 'Select')}</span>
                        </button>
                      )}
                      {(currentUser?.role === 'super_admin' ||
                        currentUser?.role === 'management' ||
                        currentUser?.role === 'technical_support') &&
                        onOpenSendNotification && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsNotifOpen(false);
                              onOpenSendNotification();
                            }}
                            className="text-[10px] bg-[#00A651] text-white px-2 py-1 rounded-md font-bold"
                          >
                            {language === 'ar' ? 'إرسال' : 'Send'}
                          </button>
                        )}
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllAsRead()}
                          className="text-[10px] text-[#00E676] hover:text-white flex items-center gap-1 font-bold"
                        >
                          <CheckCheck className="w-3 h-3" /> {t('markAllRead')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsNotifOpen(false)}
                        className="p-1 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors"
                        aria-label={language === 'ar' ? 'إغلاق الإشعارات' : 'Close notifications'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isSuperAdmin && isSelectNotifMode && sortedNotifications.length > 0 && (
                    <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
                      <button
                        type="button"
                        onClick={handleToggleSelectAllNotifs}
                        className="font-bold text-[#004B87] dark:text-sky-300"
                      >
                        {selectedNotifIds.length === sortedNotifications.length
                          ? language === 'ar'
                            ? 'إلغاء تحديد الكل'
                            : 'Deselect All'
                          : language === 'ar'
                          ? `تحديد الكل (${sortedNotifications.length})`
                          : `Select All (${sortedNotifications.length})`}
                      </button>

                      {selectedNotifIds.length > 0 &&
                        (confirmDeleteSelected ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isDeletingNotifs}
                              onClick={handleDeleteSelectedInBell}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-black disabled:opacity-50"
                            >
                              {isDeletingNotifs
                                ? language === 'ar'
                                  ? 'جارٍ الحذف...'
                                  : 'Deleting...'
                                : language === 'ar'
                                ? `تأكيد (${selectedNotifIds.length})`
                                : `Confirm (${selectedNotifIds.length})`}
                            </button>
                            <button
                              type="button"
                              disabled={isDeletingNotifs}
                              onClick={() => setConfirmDeleteSelected(false)}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-[#0B1D35] border border-slate-300 text-slate-700 dark:text-slate-200 font-bold"
                            >
                              {language === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSelected(true)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-black flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>
                              {language === 'ar'
                                ? `حذف المحدد (${selectedNotifIds.length})`
                                : `Delete (${selectedNotifIds.length})`}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#00386B] text-xs">
                    {sortedNotifications.map((n) => {
                      const isChecked = selectedNotifIds.includes(n.id);
                      return (
                        <div
                          key={n.id}
                          onClick={() =>
                            isSelectNotifMode ? toggleNotifSelection(n.id) : markAsRead(n.id)
                          }
                          className={`p-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#003366]/60 flex items-start gap-2.5 ${
                            isSelectNotifMode && isChecked
                              ? 'bg-rose-50/80 dark:bg-rose-950/35'
                              : n.type === 'overdue_alert' && !n.isRead
                              ? 'bg-rose-50 dark:bg-rose-950/40 font-bold'
                              : !n.isRead
                              ? 'bg-[#004B87]/5 dark:bg-[#004B87]/35 font-bold'
                              : ''
                          }`}
                        >
                          {isSuperAdmin && isSelectNotifMode && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleNotifSelection(n.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 w-4 h-4 accent-rose-600 shrink-0 cursor-pointer"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {!n.isRead && (
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      n.type === 'overdue_alert' ? 'bg-rose-600' : 'bg-[#00A651]'
                                    }`}
                                  />
                                )}
                                <div
                                  className={`font-bold text-xs ${
                                    n.type === 'overdue_alert'
                                      ? 'text-rose-700 dark:text-rose-400'
                                      : 'text-[#004B87] dark:text-sky-300'
                                  }`}
                                >
                                  {n.title}
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0 whitespace-nowrap">
                                {formatNotificationDateTime(n.createdAt)}
                              </span>
                            </div>
                            <div className="text-slate-700 dark:text-slate-200 text-xs mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
                              {n.message}
                            </div>
                            {(n.senderName || (n.caseId && n.caseId !== 'ADMIN-NOTICE')) && (
                              <div className="flex flex-wrap items-center justify-between gap-1.5 mt-1.5">
                                {n.senderName && (
                                  <span className="text-[11px] text-[#00A651] dark:text-[#00E676] font-bold">
                                    {language === 'ar'
                                      ? `مرسل من: ${n.senderName}`
                                      : `From: ${n.senderName}`}
                                  </span>
                                )}
                                {n.caseId && n.caseId !== 'ADMIN-NOTICE' && (
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#002B54] text-[#004B87] dark:text-sky-300">
                                    {n.caseId}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {sortedNotifications.length === 0 && (
                      <div className="p-6 text-center text-slate-400 text-xs">
                        {t('noNotifications')}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={toggleLanguage}
            className="hidden sm:flex px-2.5 min-h-[40px] items-center justify-center rounded-xl bg-[#003366] text-slate-100 border border-[#004B87] text-[11px] font-mono font-black active:scale-95"
            title="Change Language"
          >
            {language === 'ar' ? 'EN' : 'عربي'}
          </button>

          <button
            type="button"
            onClick={handleToggleSound}
            className={`hidden sm:flex p-2 min-w-[40px] min-h-[40px] items-center justify-center rounded-xl border active:scale-95 ${
              soundEnabled
                ? 'bg-[#003366] text-[#00E676] border-[#004B87]'
                : 'bg-rose-950/60 text-rose-300 border-rose-700'
            }`}
            title={soundEnabled ? 'التنبيهات الصوتية مفعلة' : 'التنبيهات الصوتية مكتومة'}
            aria-label="Toggle Sound Alerts"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleTheme}
            className="hidden sm:flex p-2 min-w-[40px] min-h-[40px] items-center justify-center rounded-xl bg-[#003366] text-amber-300 border border-[#004B87] active:scale-95"
            title={isDark ? t('themeLight') : t('themeDark')}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={onOpenNewCase}
            className="px-3 min-h-[40px] bg-[#00A651] hover:bg-[#008742] text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-md active:scale-95 whitespace-nowrap"
            title={t('newCase')}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline text-[11px]">{t('newCase')}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
