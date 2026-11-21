/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles, ShieldCheck, ArrowDownToLine } from 'lucide-react';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import {
  AppUpdateState,
  applyAppUpdateAndReload,
  startAppUpdateMonitor,
  subscribeToAppUpdates,
} from '../services/appUpdateService';
import { playAlertSound } from '../utils/soundAlerts';

export const MandatoryUpdateModal: React.FC = () => {
  const { language, isRtl } = useThemeLanguage();
  const [updateState, setUpdateState] = useState<AppUpdateState>({
    updateAvailable: false,
    reason: null,
    latestBuildId: null,
    detectedAt: null,
  });
  const [isReloading, setIsReloading] = useState(false);
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    startAppUpdateMonitor();
    const unsubscribe = subscribeToAppUpdates((nextState) => {
      setUpdateState(nextState);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (updateState.updateAvailable && !soundPlayedRef.current) {
      soundPlayedRef.current = true;
      playAlertSound('mandatory');
    }
  }, [updateState.updateAvailable]);

  if (!updateState.updateAvailable) return null;

  const handleReload = async () => {
    if (isReloading) return;
    setIsReloading(true);
    await applyAppUpdateAndReload();
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mandatory-update-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#001429]/85 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border-2 border-[#00A651] w-full max-w-md overflow-hidden animate-scale-in text-start my-auto">
        {/* Header */}
        <div className="bg-[#00264D] px-5 py-4 text-white flex items-center gap-3 border-b border-[#004B87]">
          <div className="p-2.5 rounded-xl bg-[#00A651] text-white shadow-md shrink-0">
            <ArrowDownToLine className="w-5 h-5 animate-bounce" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
              <span className="text-[11px] font-bold text-[#00E676]">
                {language === 'ar' ? 'إشعار تحديث إجباري' : 'Mandatory System Update'}
              </span>
            </div>
            <h2 id="mandatory-update-title" className="font-black text-sm sm:text-base text-white mt-0.5">
              {language === 'ar'
                ? 'يتوفر تحديث جديد وإعادة نشر للمنظومة'
                : 'New System Update Published'}
            </h2>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] space-y-2">
            <p className="text-xs sm:text-sm font-bold text-[#00264D] dark:text-white leading-relaxed">
              {language === 'ar'
                ? 'تم إجراء تعديلات وتحديثات جديدة على البرنامج وإعادة نشره لضمان عمل كافة المزايا والتعديلات بشكل سليم.'
                : 'New modifications and updates have been deployed to the system to ensure all latest features and improvements work properly.'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {language === 'ar'
                ? 'يرجى الضغط على زر إعادة التحميل أدناه لتحديث النسخة الحالية وإظهار التعديلات الجديدة فوراً في حسابك.'
                : 'Please click the reload button below to update your session and apply all new changes immediately.'}
            </p>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/80 dark:bg-[#003324]/50 border border-emerald-200 dark:border-[#00A651]/50 text-xs text-slate-800 dark:text-slate-100">
            <ShieldCheck className="w-4 h-4 text-[#00A651] shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">
              {language === 'ar'
                ? 'ستظل جلسة تسجيل دخولك وجميع البيانات والحالات المحفوظة مؤمّنة دون الحاجة لتسجيل الدخول مجدداً.'
                : 'Your active login session and all saved cases and records remain preserved.'}
            </span>
          </div>

          {updateState.latestBuildId && (
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between px-1">
              <span>{language === 'ar' ? 'رمز الإصدار الجديد:' : 'New Build ID:'}</span>
              <span dir="ltr" className="font-bold text-[#004B87] dark:text-sky-300">
                {updateState.latestBuildId}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] flex items-center justify-end">
          <button
            type="button"
            disabled={isReloading}
            onClick={handleReload}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-65 disabled:cursor-wait cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
            <span>
              {isReloading
                ? language === 'ar'
                  ? 'جارٍ إعادة التحميل وتطبيق التحديث...'
                  : 'Reloading & Applying Update...'
                : language === 'ar'
                ? 'إعادة تحميل للتحديث وإظهار التعديلات'
                : 'Reload to Update & Show Changes'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
