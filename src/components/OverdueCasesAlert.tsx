/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from 'lucide-react';
import { Case, User } from '../types';
import {
  getCaseIdleHours,
  formatOverdueDurationArabic,
} from '../services/caseService';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import { playAlertSound } from '../utils/soundAlerts';

interface OverdueCasesAlertProps {
  overdueCases: Case[];
  currentUser: User;
  nowMs: number;
  onOpenCase: (caseItem: Case) => void;
  onNavigateToOpenCases?: () => void;
}

export const OverdueCasesAlert: React.FC<OverdueCasesAlertProps> = ({
  overdueCases,
  currentUser,
  nowMs,
  onOpenCase,
  onNavigateToOpenCases,
}) => {
  const { language, isRtl } = useThemeLanguage();
  const [isExpanded, setIsExpanded] = useState(true);
  const lastAlertCountRef = useRef<number>(0);

  useEffect(() => {
    if (overdueCases.length > lastAlertCountRef.current) {
      playAlertSound('overdue');
    }
    lastAlertCountRef.current = overdueCases.length;
  }, [overdueCases.length]);

  if (overdueCases.length === 0) return null;

  const roleLabel =
    currentUser.role === 'agent'
      ? language === 'ar'
        ? 'وكيل اتصال'
        : 'Call Agent'
      : currentUser.role === 'super_admin'
      ? language === 'ar'
        ? 'مدير النظام'
        : 'System Admin'
      : language === 'ar'
      ? 'الإدارة والدعم التقني'
      : 'Management & Tech Support';

  const visibleCases = overdueCases.slice(0, 5);
  const remainingCount = overdueCases.length - visibleCases.length;

  return (
    <section
      role="alert"
      aria-live="assertive"
      dir={isRtl ? 'rtl' : 'ltr'}
      className="sticky top-0 z-25 mb-4 rounded-2xl border-2 border-rose-600 dark:border-rose-500 bg-rose-50 dark:bg-[#2A0E18] shadow-xl overflow-hidden animate-fade-up text-start"
    >
      {/* Solid Crimson High-Visibility Alert Bar */}
      <div className="bg-rose-700 dark:bg-rose-800 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-amber-400/20 border-2 border-amber-300 shrink-0 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white leading-snug">
              {language === 'ar'
                ? `تنبيه هام (+72 ساعة دون إجراء): لديك (${overdueCases.length}) حالة متوقفة في حسابك!`
                : `Urgent Action Alert (+72h): ${overdueCases.length} case(s) idle in your account!`}
            </h2>
            <p className="text-xs text-rose-100 font-semibold mt-0.5">
              {language === 'ar'
                ? `تنبيه للمستخدم (${currentUser.fullName} · ${roleLabel}): تجاوزت هذه الحالات 72 ساعة في حسابك دون اتخاذ أي إجراء.`
                : `Notice for ${currentUser.fullName} (${roleLabel}): These cases remained in your account over 72 hours with no action.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onNavigateToOpenCases && (
            <button
              type="button"
              onClick={onNavigateToOpenCases}
              className="px-3 py-1.5 rounded-xl bg-white text-rose-800 hover:bg-rose-100 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'الحالات المفتوحة' : 'Open Cases'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-xl bg-rose-800 dark:bg-rose-900 hover:bg-rose-900 text-white border border-white/25 text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            aria-expanded={isExpanded}
          >
            <span>
              {isExpanded
                ? language === 'ar'
                  ? 'طي القائمة'
                  : 'Minimize'
                : language === 'ar'
                ? 'عرض الحالات'
                : 'Show Cases'}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Overdue Cases Quick Action List */}
      {isExpanded && (
        <div className="p-3.5 space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {visibleCases.map((c) => {
              const idleHours = getCaseIdleHours(c, nowMs);
              const durationText = formatOverdueDurationArabic(idleHours);
              return (
                <div
                  key={c.id}
                  onClick={() => onOpenCase(c)}
                  className="bg-white dark:bg-[#0B1D35] border border-rose-200 dark:border-rose-800 hover:border-rose-600 dark:hover:border-rose-400 rounded-xl p-3 cursor-pointer transition-all flex flex-col justify-between gap-2 shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-black text-xs text-[#004B87] dark:text-sky-300 tabular-nums">
                        {c.caseId}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-400 tabular-nums whitespace-nowrap">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {language === 'ar'
                            ? `متوقفة منذ ${durationText}`
                            : `Idle ${Math.floor(idleHours)}h`}
                        </span>
                      </span>
                    </div>

                    <div className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">
                      {c.title}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 truncate">
                      <span className="truncate font-semibold">
                        {c.taxpayerName || (language === 'ar' ? 'ممول غير مسجل' : 'Unregistered')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="whitespace-nowrap">{c.status}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-rose-100 dark:border-rose-900/60 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {language === 'ar' ? 'آخر إجراء: ' : 'Last action: '}
                      {new Date(c.updatedAt || c.createdAt).toLocaleDateString(
                        language === 'ar' ? 'ar-EG' : 'en-US'
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCase(c);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'اتخاذ إجراء' : 'Take Action'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {remainingCount > 0 && (
            <div className="flex items-center justify-between pt-1 text-xs font-bold text-rose-800 dark:text-rose-300">
              <span>
                {language === 'ar'
                  ? `يوجد ${remainingCount} حالة متأخرة أخرى في حسابك.`
                  : `${remainingCount} more overdue case(s) in your account.`}
              </span>
              {onNavigateToOpenCases && (
                <button
                  type="button"
                  onClick={onNavigateToOpenCases}
                  className="underline hover:text-rose-950 dark:hover:text-white transition-colors"
                >
                  {language === 'ar' ? 'عرض جميع الحالات المفتوحة' : 'View All Open Cases'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
