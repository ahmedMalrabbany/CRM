/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Phone } from 'lucide-react';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface FooterProps {
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({ className = '' }) => {
  const { t, isRtl } = useThemeLanguage();

  return (
    <footer
      className={`w-full mt-auto pt-6 pb-2 text-center text-xs select-none print:pt-4 print:pb-0 ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-slate-300 dark:border-slate-800 rounded-2xl p-3.5 shadow-saas flex flex-col lg:flex-row items-center justify-between gap-3 text-slate-700 dark:text-slate-200">
        <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2">
          <span className="font-bold text-[#002447] dark:text-sky-200 whitespace-nowrap">
            {t('appTitle')}
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>
          <span className="text-[11px] text-[#00A651] dark:text-[#16b962] font-semibold">
            {t('appSub')}
          </span>
        </div>

        <div
          dir="ltr"
          className="flex flex-col items-center lg:items-end justify-center gap-1 bg-[#004B87]/5 dark:bg-[#002447]/60 text-[#002447] dark:text-sky-200 px-4 py-2.5 rounded-xl border border-[#004B87]/25 dark:border-[#00386b] shadow-2xs text-[11px] sm:text-xs leading-snug text-center lg:text-right"
        >
          <div className="font-extrabold text-[#00264D] dark:text-sky-100">
            © 2026 Integrated Call Center – Egyptian Tax Authority. All Intellectual Property Rights Reserved.
          </div>
          <div className="flex flex-wrap items-center justify-center lg:justify-end gap-x-3 gap-y-0.5 font-bold text-slate-800 dark:text-slate-200">
            <span className="inline-flex items-center gap-1">
              <Phone className="w-3 h-3 text-[#00A651] shrink-0" />
              <span>Designed &amp; Developed by: Ahmed Mahfouz</span>
              <strong className="font-mono text-[#004B87] dark:text-[#00E676]">01026408888</strong>
            </span>
            <span className="hidden sm:inline text-slate-400 dark:text-slate-500">|</span>
            <span>
              Prepared by Nermin ElSweifi{' '}
              <strong className="font-mono text-[#004B87] dark:text-[#00E676]">01015313180</strong>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
