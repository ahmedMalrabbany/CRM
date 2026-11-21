/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BellRing, CheckCircle2, ShieldAlert, Clock, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import { playAlertSound } from '../utils/soundAlerts';

export const MandatoryNotificationModal: React.FC = () => {
  const { currentUser, isVerifiedInScreen } = useAuth();
  const { pendingMandatoryNotices, acknowledgeNotification } = useNotifications();
  const { isRtl } = useThemeLanguage();

  const [hasAttested, setHasAttested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeNotice = pendingMandatoryNotices[0];

  useEffect(() => {
    setHasAttested(false);
    setIsSubmitting(false);
    setErrorMsg(null);
    if (currentUser && isVerifiedInScreen && activeNotice?.id) {
      playAlertSound('mandatory');
    }
  }, [activeNotice?.id, currentUser, isVerifiedInScreen]);

  if (!currentUser || !isVerifiedInScreen || !activeNotice) return null;

  const handleConfirm = async () => {
    if (!hasAttested || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await acknowledgeNotification(activeNotice.id, currentUser.fullName);
    } catch {
      setErrorMsg('حدث خطأ أثناء تسجيل موافقتك، يرجى المحاولة مرة أخرى.');
      setIsSubmitting(false);
    }
  };

  const formattedDate = activeNotice.createdAt
    ? new Date(activeNotice.createdAt).toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-80 flex items-center justify-center bg-[#001429]/85 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border-2 border-[#00A651] w-full max-w-lg overflow-hidden animate-scale-in text-start my-auto">
        {/* Header */}
        <div className="bg-[#001F3F] px-5 py-4 text-white flex items-center justify-between border-b border-[#004B87]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#00A651] text-white shadow-sm animate-pulse">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm text-white">إشعار وتعميم إداري هام</h2>
              <p className="text-[11px] text-sky-200 mt-0.5">
                يرجى قراءة الإشعار والإقرار بالاطلاع والموافقة للمتابعة
              </p>
            </div>
          </div>
          {pendingMandatoryNotices.length > 1 && (
            <span className="px-2.5 py-1 rounded-lg bg-[#004B87] text-[#00E676] font-bold text-[11px] border border-[#00A651]/40 tabular-nums shrink-0">
              1 من {pendingMandatoryNotices.length}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#071629] px-3 py-2 rounded-xl border border-slate-200 dark:border-[#00386B]">
            <div className="flex items-center gap-1.5 font-bold text-[#004B87] dark:text-sky-300">
              <UserIcon className="w-3.5 h-3.5 text-[#00A651]" />
              <span>المرسل: {activeNotice.senderName || 'الإدارة المختصة'}</span>
            </div>
            {formattedDate && (
              <div className="flex items-center gap-1 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                <span>{formattedDate}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-black text-base text-[#00264D] dark:text-white leading-snug">
              {activeNotice.title}
            </h3>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
              {activeNotice.message}
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Mandatory Reading Attestation Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/70 dark:bg-[#003324]/50 border border-emerald-200 dark:border-[#00A651]/50 cursor-pointer select-none hover:bg-emerald-50 dark:hover:bg-[#003324]/80 transition-colors">
            <input
              type="checkbox"
              checked={hasAttested}
              onChange={(e) => setHasAttested(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#00A651] shrink-0 cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
              أقر بأنني قد قرأت هذا الإشعار بالكامل وفهمت ما ورد به من تعليمات، وأوافق على الالتزام بما جاء فيه.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            يتم توثيق قراءتك وموافقتك تلقائياً في سجل الإشعارات
          </span>
          <button
            type="button"
            disabled={!hasAttested || isSubmitting}
            onClick={handleConfirm}
            className="px-6 py-2.5 bg-[#00A651] hover:bg-[#008742] text-white font-black text-xs rounded-xl shadow-md flex items-center gap-2 transition-all disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'جارٍ التأكيد...' : 'أوافق'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
