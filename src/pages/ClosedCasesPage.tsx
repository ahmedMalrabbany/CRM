/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ArchiveX, UserCheck, FolderCheck, Search, Eye, RotateCcw, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Case, User } from '../types';
import { isCaseOwnedByUser, reopenCase } from '../services/caseService';
import { StatusBadge, PriorityIndicator } from '../components/SkeletonLoader';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface ClosedCasesPageProps {
  cases: Case[];
  currentUser: User;
  onOpenCase: (caseItem: Case) => void;
}

export const ClosedCasesPage: React.FC<ClosedCasesPageProps> = ({
  cases,
  currentUser,
  onOpenCase,
}) => {
  const { language, isRtl } = useThemeLanguage();
  const [activeTab, setActiveTab] = useState<'mine' | 'all'>('mine');
  const [searchTerm, setSearchTerm] = useState('');
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [reopenFeedback, setReopenFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const canReopenAny =
    currentUser.role === 'management' ||
    currentUser.role === 'technical_support' ||
    currentUser.role === 'super_admin';

  const handleQuickReopen = async (e: React.MouseEvent, c: Case) => {
    e.stopPropagation();
    if (!canReopenAny && !isCaseOwnedByUser(c, currentUser)) return;
    setReopenFeedback(null);
    setReopeningId(c.id);
    try {
      await reopenCase(
        c.id,
        language === 'ar'
          ? 'إعادة فتح لمتابعة المستجدات بواسطة الإدارة/الدعم التقني'
          : 'Reopened for follow-up',
        currentUser
      );
      setReopenFeedback({
        type: 'success',
        message:
          language === 'ar'
            ? `تمت إعادة فتح الحالة ${c.caseId} بنجاح.`
            : `Case ${c.caseId} reopened successfully.`,
      });
    } catch (err: any) {
      setReopenFeedback({
        type: 'error',
        message:
          err?.message ||
          (language === 'ar' ? 'تعذر إعادة فتح الحالة.' : 'Failed to reopen case.'),
      });
    } finally {
      setReopeningId(null);
    }
  };

  const allClosedCases = useMemo(
    () => cases.filter((c) => c.status === 'مغلقة'),
    [cases]
  );

  const myClosedCases = useMemo(
    () => allClosedCases.filter((c) => isCaseOwnedByUser(c, currentUser)),
    [allClosedCases, currentUser]
  );

  const activeList = useMemo(() => {
    let list = activeTab === 'mine' ? myClosedCases : allClosedCases;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.caseId.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.taxRegistrationNumber.includes(q) ||
          c.taxpayerName?.toLowerCase().includes(q) ||
          c.callerName?.toLowerCase().includes(q) ||
          c.closeReason?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeTab, myClosedCases, allClosedCases, searchTerm]);

  return (
    <div className="space-y-4 text-start animate-fade-up" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#004B87] dark:text-[#00E676] font-bold text-xs mb-1">
            <ArchiveX className="w-4 h-4" />
            <span>{language === 'ar' ? 'أرشيف الحالات المنجزة والمغلقة' : 'Resolved & Closed Archive'}</span>
          </div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
            {language === 'ar' ? 'الحالات المغلقة' : 'Closed Cases'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            {language === 'ar'
              ? 'عرض جميع الحالات التي تم حلها وإغلاقها مع سبب الإغلاق واسم الموظف المسؤول'
              : 'Browse resolved and closed tickets along with closing reason and responsible staff'}
          </p>
        </div>

        {/* Tab switcher + Search */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="bg-slate-100 dark:bg-[#071629] p-1 rounded-xl flex text-xs font-bold border border-slate-200 dark:border-[#00386B]">
            <button
              type="button"
              onClick={() => setActiveTab('mine')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'mine'
                  ? 'bg-[#004B87] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>
                {language === 'ar' ? `المغلقة بحسابي (${myClosedCases.length})` : `My Closed (${myClosedCases.length})`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-[#00A651] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#00A651] dark:hover:text-white'
              }`}
            >
              <FolderCheck className="w-3.5 h-3.5" />
              <span>
                {language === 'ar' ? `كل الحالات المغلقة (${allClosedCases.length})` : `All Closed (${allClosedCases.length})`}
              </span>
            </button>
          </div>

          <div className="relative flex-1 sm:flex-none">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={language === 'ar' ? 'بحث في الحالات المغلقة...' : 'Search closed cases...'}
              className="p-2 text-xs bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-800 dark:text-white rounded-xl pl-7 w-full sm:w-48 focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
          </div>
        </div>
      </div>

      {reopenFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 animate-scale-in ${
            reopenFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {reopenFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>{reopenFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setReopenFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Closed Cases Table */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full text-start text-xs min-w-[820px]">
            <thead className="bg-[#00264D] text-white border-b border-[#004B87] text-[11px]">
              <tr>
                <th className="p-3.5">{language === 'ar' ? 'رقم الحالة' : 'Case ID'}</th>
                <th className="p-3.5">{language === 'ar' ? 'تاريخ الإغلاق' : 'Closed At'}</th>
                <th className="p-3.5">{language === 'ar' ? 'الضريبة والخدمة' : 'Tax & Service'}</th>
                <th className="p-3.5">{language === 'ar' ? 'الممول' : 'Taxpayer'}</th>
                <th className="p-3.5">{language === 'ar' ? 'عنوان الحالة' : 'Title'}</th>
                <th className="p-3.5">{language === 'ar' ? 'سبب الإغلاق' : 'Close Reason'}</th>
                <th className="p-3.5">{language === 'ar' ? 'أُغلقت بواسطة' : 'Closed By'}</th>
                <th className="p-3.5">{language === 'ar' ? 'الأولوية' : 'Priority'}</th>
                <th className="p-3.5">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="p-3.5 text-center">{language === 'ar' ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]/70">
              {activeList.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onOpenCase(c)}
                  className="group hover:bg-[#EBF4FC] dark:hover:bg-[#002B54] cursor-pointer transition-all duration-150"
                >
                  <td className="p-3.5 font-mono font-bold text-[#004B87] dark:text-sky-300 whitespace-nowrap tabular-nums">
                    {c.caseId}
                  </td>
                  <td className="p-3.5 font-mono text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap tabular-nums">
                    {new Date(c.closedAt || c.updatedAt || c.createdAt).toLocaleDateString(
                      language === 'ar' ? 'ar-EG' : 'en-US'
                    )}
                  </td>
                  <td className="p-3.5">
                    <div className="font-bold text-slate-900 dark:text-white">{c.taxType}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                      {c.callType} · {c.serviceType}
                    </div>
                  </td>
                  <td className="p-3.5">
                    <div className="font-bold text-slate-900 dark:text-white line-clamp-1">
                      {c.taxpayerName || '—'}
                    </div>
                    <div className="font-mono text-slate-500 dark:text-slate-400 text-[10px] tabular-nums">
                      {c.taxRegistrationNumber || (language === 'ar' ? 'بدون رقم ضريبي' : 'No Tax ID')}
                    </div>
                  </td>
                  <td className="p-3.5 max-w-[200px]">
                    <div className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:text-[#004B87] dark:group-hover:text-[#00E676] transition-colors">
                      {c.title}
                    </div>
                  </td>
                  <td className="p-3.5 max-w-[200px]">
                    <div className="text-slate-600 dark:text-slate-300 line-clamp-1 text-[11px]">
                      {c.closeReason || '—'}
                    </div>
                  </td>
                  <td className="p-3.5 whitespace-nowrap text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                    {c.closedByName || c.assignedToName || '—'}
                  </td>
                  <td className="p-3.5 whitespace-nowrap">
                    <PriorityIndicator priority={c.priority} />
                  </td>
                  <td className="p-3.5 whitespace-nowrap">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="p-3.5 text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {(canReopenAny || isCaseOwnedByUser(c, currentUser)) && (
                        <button
                          type="button"
                          disabled={reopeningId === c.id}
                          onClick={(e) => handleQuickReopen(e, c)}
                          className="px-2.5 py-1 bg-[#E6F7EF] dark:bg-[#003324] hover:bg-[#00A651] text-[#008742] dark:text-[#00E676] hover:text-white rounded-lg font-bold transition-all inline-flex items-center gap-1 disabled:opacity-50"
                          title={
                            language === 'ar'
                              ? 'إعادة فتح الحالة والرد عليها'
                              : 'Reopen Case'
                          }
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'إعادة فتح' : 'Reopen'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCase(c);
                        }}
                        className="px-3 py-1 bg-slate-100 dark:bg-[#071629] group-hover:bg-[#004B87] group-hover:text-white rounded-lg font-bold text-slate-700 dark:text-slate-200 transition-all inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'معاينة' : 'View'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {activeList.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400 text-xs">
                    {language === 'ar'
                      ? 'لا توجد حالات مغلقة في هذا القسم حالياً'
                      : 'No closed cases found in this section'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
