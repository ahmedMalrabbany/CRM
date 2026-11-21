/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle2, Clock, User as UserIcon, X, CheckCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

export const IncomingNotificationModal: React.FC = () => {
  const { currentUser, isVerifiedInScreen } = useAuth();
  const { notifications, pendingMandatoryNotices, markAsRead, markAllAsRead } = useNotifications();
  const { language, isRtl } = useThemeLanguage();

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const seenPopupIdsRef = useRef<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  // Reset per user session
  useEffect(() => {
    setDismissedIds(new Set());
    seenPopupIdsRef.current.clear();
    setActiveId(null);
  }, [currentUser?.id]);

  // Filter unread non-mandatory notifications that have not been dismissed in this modal
  const candidateNotifications = notifications.filter(
    (n) =>
      n.type !== 'admin_notice' &&
      !n.isRead &&
      !dismissedIds.has(n.id)
  );

  // Automatically pop up newly arriving / unread notifications when no mandatory modal is blocking
  useEffect(() => {
    if (!currentUser || !isVerifiedInScreen) return;
    if (pendingMandatoryNotices.length > 0) return;

    if (activeId) {
      const stillPending = candidateNotifications.some((n) => n.id === activeId);
      if (stillPending) return;
    }

    const next = candidateNotifications.find((n) => !seenPopupIdsRef.current.has(n.id));
    if (next) {
      seenPopupIdsRef.current.add(next.id);
      setActiveId(next.id);
    } else if (candidateNotifications.length === 0) {
      setActiveId(null);
    }
  }, [
    currentUser,
    isVerifiedInScreen,
    pendingMandatoryNotices.length,
    candidateNotifications,
    activeId,
  ]);

  if (!currentUser || !isVerifiedInScreen || pendingMandatoryNotices.length > 0 || !activeId) {
    return null;
  }

  const activeNotification = candidateNotifications.find((n) => n.id === activeId);
  if (!activeNotification) return null;

  const remainingCount = candidateNotifications.length;
  const isOverdue = activeNotification.type === 'overdue_alert';

  const handleReadAndClose = async () => {
    const id = activeNotification.id;
    setDismissedIds((prev) => new Set(prev).add(id));
    setActiveId(null);
    await markAsRead(id);
  };

  const handleCloseAll = async () => {
    const ids = candidateNotifications.map((n) => n.id);
    setDismissedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setActiveId(null);
    await markAllAsRead();
  };

  const formattedDate = activeNotification.createdAt
    ? new Date(activeNotification.createdAt).toLocaleString(
        language === 'ar' ? 'ar-EG' : 'en-US',
        {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }
      )
    : '';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[78] flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
    >
      <div
        className={`bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border-2 ${
          isOverdue
            ? 'border-rose-600 dark:border-rose-500'
            : 'border-[#004B87] dark:border-[#00A651]'
        } w-full max-w-md overflow-hidden animate-scale-in text-start my-auto`}
      >
        {/* Header */}
        <div
          className={`${
            isOverdue ? 'bg-rose-800' : 'bg-[#00264D]'
          } px-4 sm:px-5 py-3.5 text-white flex items-center justify-between gap-2 border-b border-white/15`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl text-white shrink-0 ${
                isOverdue ? 'bg-rose-600 animate-pulse' : 'bg-[#00A651]'
              }`}
            >
              {isOverdue ? <AlertTriangle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-xs sm:text-sm text-white truncate">
                {language === 'ar' ? 'تنبيه بورود إشعار جديد' : 'New Incoming Notification'}
              </h2>
              <p className="text-[11px] text-sky-200 truncate">
                {remainingCount > 1
                  ? language === 'ar'
                    ? `لديك ${remainingCount} إشعارات غير مقروءة`
                    : `${remainingCount} unread notifications`
                  : language === 'ar'
                  ? 'يرجى قراءة الإشعار ثم إغلاقه'
                  : 'Please read and close this notification'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReadAndClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
            aria-label={language === 'ar' ? 'إغلاق الإشعار' : 'Close notification'}
            title={language === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#071629] px-3 py-2 rounded-xl border border-slate-200 dark:border-[#00386B]">
            <div className="flex items-center gap-1.5 font-bold text-[#004B87] dark:text-sky-300">
              <UserIcon className="w-3.5 h-3.5 text-[#00A651]" />
              <span>
                {activeNotification.senderName ||
                  (language === 'ar' ? 'منظومة CRM 16395' : 'CRM System 16395')}
              </span>
            </div>
            {formattedDate && (
              <div className="flex items-center gap-1 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                <span>{formattedDate}</span>
              </div>
            )}
          </div>

          {activeNotification.caseId && activeNotification.caseId !== 'ADMIN-NOTICE' && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EBF4FC] dark:bg-[#002B54] border border-[#004B87]/25 text-[#004B87] dark:text-sky-300 font-mono font-bold text-[11px]">
              <span>
                {language === 'ar' ? 'رقم الحالة:' : 'Case ID:'} {activeNotification.caseId}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white leading-snug">
              {activeNotification.title}
            </h3>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto">
              {activeNotification.message}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] flex flex-wrap items-center justify-end gap-2">
          {remainingCount > 1 && (
            <button
              type="button"
              onClick={handleCloseAll}
              className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-[#002B54] hover:bg-slate-300 dark:hover:bg-[#003E75] text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'قراءة وإغلاق الكل' : 'Mark All Read & Close'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleReadAndClose}
            className="px-5 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{language === 'ar' ? 'تمت القراءة وإغلاق' : 'Mark Read & Close'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
