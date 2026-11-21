/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Inbox,
  UserCheck,
  Search,
  CheckCircle,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { Case, User } from '../types';
import { claimCase } from '../services/caseService';
import { StatusBadge, PriorityIndicator } from '../components/SkeletonLoader';

interface IncomingCasesPageProps {
  cases: Case[];
  currentUser: User;
  allUsers: User[];
  onOpenCase: (caseItem: Case) => void;
}

export const IncomingCasesPage: React.FC<IncomingCasesPageProps> = ({
  cases,
  currentUser,
  onOpenCase,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [targetRoleFilter, setTargetRoleFilter] = useState<
    'all' | 'management' | 'technical_support'
  >('all');
  const [claimLoadingId, setClaimLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter only incoming cases
  const incomingCases = useMemo(() => {
    return cases.filter((c) => {
      const isIncoming =
        c.status === 'محولة للإدارة' ||
        c.status === 'محولة للدعم الفني' ||
        c.status === 'محولة للدعم التقني';
      if (!isIncoming) return false;

      if (targetRoleFilter === 'management' && c.status !== 'محولة للإدارة') return false;
      if (
        targetRoleFilter === 'technical_support' &&
        c.status !== 'محولة للدعم الفني' &&
        c.status !== 'محولة للدعم التقني'
      )
        return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return (
          c.caseId.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.taxRegistrationNumber.includes(q) ||
          c.taxpayerName?.toLowerCase().includes(q) ||
          c.createdByName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [cases, targetRoleFilter, searchTerm]);

  const handleClaim = async (e: React.MouseEvent, c: Case) => {
    e.stopPropagation();
    setErrorMessage(null);
    setSuccessMessage(null);
    setClaimLoadingId(c.id);

    try {
      await claimCase(c.id, currentUser);
      setSuccessMessage(`تم سحب الحالة ${c.caseId} بنجاح وبدء معالجتها`);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل سحب الحالة');
    } finally {
      setClaimLoadingId(null);
    }
  };

  return (
    <div className="space-y-4 text-start animate-fade-up">
      {/* Header */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#004B87] dark:text-[#00E676] font-bold text-xs mb-1">
            <Inbox className="w-4 h-4" />
            <span>قائمة الحالات المحولة للإدارة والدعم التقني</span>
          </div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
            الحالات الواردة للبت والمعالجة التخصصية
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            حالات قام وكلاء الاتصال بتحويلها للحصول على إفادة فنية متخصصة
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="bg-slate-100 dark:bg-[#071629] p-1 rounded-xl flex flex-wrap text-xs font-bold border border-slate-200 dark:border-[#00386B]">
            <button
              onClick={() => setTargetRoleFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                targetRoleFilter === 'all'
                  ? 'bg-[#004B87] text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
              }`}
            >
              الكل (
              {
                cases.filter(
                  (c) =>
                    c.status === 'محولة للإدارة' ||
                    c.status === 'محولة للدعم الفني' ||
                    c.status === 'محولة للدعم التقني'
                ).length
              }
              )
            </button>
            <button
              onClick={() => setTargetRoleFilter('management')}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                targetRoleFilter === 'management'
                  ? 'bg-[#004B87] text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
              }`}
            >
              محولة للإدارة ({cases.filter((c) => c.status === 'محولة للإدارة').length})
            </button>
            <button
              onClick={() => setTargetRoleFilter('technical_support')}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                targetRoleFilter === 'technical_support'
                  ? 'bg-[#00A651] text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:text-[#00A651] dark:hover:text-white'
              }`}
            >
              محولة للدعم الفني (
              {
                cases.filter(
                  (c) => c.status === 'محولة للدعم الفني' || c.status === 'محولة للدعم التقني'
                ).length
              }
              )
            </button>
          </div>

          <div className="relative flex-1 sm:flex-none">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالحالة أو الممول..."
              className="p-2 text-xs bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl pl-7 w-full sm:w-48 focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
          </div>
        </div>
      </div>

      {/* Feedback Alerts */}
      {errorMessage && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2 animate-scale-in">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2 animate-scale-in">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Cases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {incomingCases.map((c) => {
          const isAssigned = !!c.assignedTo;
          const isAssignedToMe = c.assignedTo === currentUser.id;

          return (
            <div
              key={c.id}
              onClick={() => onOpenCase(c)}
              className="group bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas hover:shadow-saas-lg hover:-translate-y-1 hover:border-[#004B87] dark:hover:border-[#00A651] transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div>
                {/* Top Status & ID */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-[#004B87] dark:text-sky-300 tabular-nums">
                      {c.caseId}
                    </span>
                    <PriorityIndicator priority={c.priority} />
                  </div>
                  <StatusBadge status={c.status} />
                </div>

                {/* Title */}
                <h3 className="font-bold text-slate-900 dark:text-white text-xs line-clamp-2 leading-relaxed mb-3 group-hover:text-[#004B87] dark:group-hover:text-[#00E676] transition-colors">
                  {c.title}
                </h3>

                {/* Taxpayer info (clean unboxed text rows) */}
                <div className="bg-slate-50 dark:bg-[#071629] p-3 rounded-xl border border-slate-200 dark:border-[#00386B] text-[11px] space-y-1.5 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">الممول:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1">
                      {c.taxpayerName || 'غير مسجل'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">رقم التسجيل:</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                      {c.taxRegistrationNumber || 'بدون رقم ضريبي'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">الضريبة والخدمة:</span>
                    <span className="font-semibold text-[#00A651] dark:text-[#00E676] truncate max-w-[140px]">
                      {c.serviceType}
                    </span>
                  </div>
                </div>

                {/* Agent notes preview */}
                {c.agentNotes && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200 dark:border-amber-700/40 line-clamp-2 mb-3">
                    <span className="font-bold text-amber-700 dark:text-amber-300">
                      ملاحظات الوكيل:{' '}
                    </span>
                    {c.agentNotes}
                  </div>
                )}
              </div>

              {/* Footer: Claim or View */}
              <div className="pt-3 border-t border-slate-100 dark:border-[#00386B]/70 flex items-center justify-between">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {c.createdByName} · {new Date(c.createdAt).toLocaleDateString('ar-EG')}
                </div>

                <div className="flex items-center gap-1.5">
                  {!isAssigned ? (
                    <button
                      type="button"
                      onClick={(e) => handleClaim(e, c)}
                      disabled={claimLoadingId === c.id}
                      className="px-3 py-1.5 bg-[#00A651] hover:bg-[#008742] text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95"
                    >
                      {claimLoadingId === c.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                      <span>سحب الحالة</span>
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                      {isAssignedToMe ? 'قيد متابعتك' : `مسندة لـ ${c.assignedToName}`}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCase(c);
                    }}
                    className="p-1.5 rounded-xl bg-slate-100 dark:bg-[#071629] text-slate-600 dark:text-slate-300 hover:bg-[#004B87] hover:text-white transition-colors"
                    title="معاينة التفاصيل"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {incomingCases.length === 0 && (
          <div className="col-span-full p-12 bg-white/95 dark:bg-[#0B1D35]/95 rounded-2xl border border-slate-200 dark:border-[#00386B] text-center text-slate-400 text-xs">
            لا توجد حالات واردة في هذه القائمة حالياً
          </div>
        )}
      </div>
    </div>
  );
};
