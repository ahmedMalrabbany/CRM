/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  UserCheck,
  FilePlus,
  Search,
  Eye,
  AlertTriangle,
  Clock,
  CheckSquare,
  MessageSquarePlus,
  X,
  Send,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Case, User } from '../types';
import {
  isCaseOwnedByUser,
  isCaseOverdue72Hours,
  getCaseIdleHours,
  formatOverdueDurationArabic,
  bulkReplyToManagementCases,
} from '../services/caseService';
import { StatusBadge, PriorityIndicator } from '../components/SkeletonLoader';
import { StyledTextarea } from '../components/StyledTextarea';

interface MyCasesPageProps {
  cases: Case[];
  currentUser: User;
  allUsers?: User[];
  onOpenCase: (caseItem: Case) => void;
  onOpenNewCase: () => void;
}

export const MyCasesPage: React.FC<MyCasesPageProps> = ({
  cases,
  currentUser,
  allUsers = [],
  onOpenCase,
}) => {
  const [activeTab, setActiveTab] = useState<'assigned' | 'created'>('assigned');
  const [searchTerm, setSearchTerm] = useState('');

  // Multi-select & unified bulk reply strictly for Management, Technical Support, and Super Admin
  const canBulkReply =
    currentUser.role === 'management' ||
    currentUser.role === 'technical_support' ||
    currentUser.role === 'super_admin';

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkEmployeeName, setBulkEmployeeName] = useState(currentUser.fullName);
  const [bulkReplyText, setBulkReplyText] = useState('');
  const [bulkReturnToAgent, setBulkReturnToAgent] = useState(false);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  // Open cases in user's account
  const openCases = useMemo(
    () => cases.filter((c) => c.status !== 'مغلقة'),
    [cases]
  );

  // Open cases assigned to / owned by current user
  const assignedToMe = useMemo(() => {
    return openCases.filter((c) => isCaseOwnedByUser(c, currentUser));
  }, [openCases, currentUser]);

  const overdueCount = useMemo(
    () => assignedToMe.filter((c) => isCaseOverdue72Hours(c)).length,
    [assignedToMe]
  );

  // Open cases created by current user
  const createdByMe = useMemo(() => {
    return openCases.filter(
      (c) => c.createdById === currentUser.id || c.createdByCrmUser === currentUser.crmUser
    );
  }, [openCases, currentUser]);

  const activeList = useMemo(() => {
    let list = activeTab === 'assigned' ? assignedToMe : createdByMe;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.caseId.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.taxRegistrationNumber.includes(q) ||
          c.taxpayerName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeTab, assignedToMe, createdByMe, searchTerm]);

  const isCaseEligibleForBulkReply = useCallback(
    (c: Case) =>
      canBulkReply &&
      c.status !== 'مغلقة' &&
      !c.isDeleted &&
      isCaseOwnedByUser(c, currentUser),
    [canBulkReply, currentUser]
  );

  // Keep selectedIds pruned to eligible open cases owned by currentUser
  useEffect(() => {
    if (!canBulkReply) {
      setSelectedIds([]);
      return;
    }
    const eligibleSet = new Set(
      openCases.filter((c) => isCaseEligibleForBulkReply(c)).map((c) => c.id)
    );
    setSelectedIds((prev) => {
      const next = prev.filter((id) => eligibleSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [canBulkReply, openCases, isCaseEligibleForBulkReply]);

  const eligibleVisibleCases = useMemo(
    () => (canBulkReply ? activeList.filter((c) => isCaseEligibleForBulkReply(c)) : []),
    [canBulkReply, activeList, isCaseEligibleForBulkReply]
  );

  const selectedCases = useMemo(
    () =>
      canBulkReply
        ? openCases.filter(
            (c) => selectedIds.includes(c.id) && isCaseEligibleForBulkReply(c)
          )
        : [],
    [canBulkReply, openCases, selectedIds, isCaseEligibleForBulkReply]
  );

  const allVisibleEligibleSelected =
    eligibleVisibleCases.length > 0 &&
    eligibleVisibleCases.every((c) => selectedIds.includes(c.id));

  const toggleSelectOne = (caseDocId: string) => {
    if (!canBulkReply) return;
    setBulkFeedback(null);
    setSelectedIds((prev) =>
      prev.includes(caseDocId)
        ? prev.filter((id) => id !== caseDocId)
        : [...prev, caseDocId]
    );
  };

  const toggleSelectAllVisible = () => {
    if (!canBulkReply || eligibleVisibleCases.length === 0) return;
    setBulkFeedback(null);
    const visibleIds = eligibleVisibleCases.map((c) => c.id);
    if (allVisibleEligibleSelected) {
      const visibleSet = new Set(visibleIds);
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const managementStaffOptions = useMemo(() => {
    const sourceUsers =
      allUsers.length > 0
        ? allUsers.filter(
            (u) =>
              u.status === 'active' &&
              (u.role === 'management' ||
                u.role === 'technical_support' ||
                u.role === 'super_admin')
          )
        : [currentUser];

    const seen = new Set<string>();
    const list: User[] = [];
    for (const u of [currentUser, ...sourceUsers]) {
      const key = u.fullName.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(u);
    }
    return list;
  }, [allUsers, currentUser]);

  const openBulkReplyModal = () => {
    if (!canBulkReply || selectedCases.length === 0) return;
    setBulkEmployeeName(currentUser.fullName);
    setBulkReplyText('');
    setBulkReturnToAgent(false);
    setBulkError(null);
    setIsBulkModalOpen(true);
  };

  const handleSubmitBulkReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBulkReply || selectedCases.length === 0) return;

    if (!bulkReplyText.trim()) {
      setBulkError('برجاء كتابة نص الرد الموحد قبل الاعتماد.');
      return;
    }
    if (!bulkEmployeeName.trim()) {
      setBulkError('برجاء تحديد اسم الموظف المسؤول.');
      return;
    }

    setIsSubmittingBulk(true);
    setBulkError(null);
    try {
      const { updatedCount, skippedCount } = await bulkReplyToManagementCases(
        selectedCases.map((c) => c.id),
        {
          managementReply: bulkReplyText.trim(),
          managementEmployeeName: bulkEmployeeName.trim(),
          returnToAgent: bulkReturnToAgent,
        },
        currentUser
      );

      setIsBulkModalOpen(false);
      setSelectedIds([]);
      setBulkReplyText('');

      if (updatedCount > 0) {
        const actionDesc = bulkReturnToAgent
          ? `تم حفظ الرد الموحد وإعادة (${updatedCount}) حالة إلى وكلاء الاتصال المنشئين بنجاح.`
          : `تم تسجيل الرد الموحد على (${updatedCount}) حالة بنجاح.`;
        setBulkFeedback(
          skippedCount > 0
            ? `${actionDesc} (تم تخطي ${skippedCount} حالة لانتقالها أو إغلاقها).`
            : actionDesc
        );
      } else {
        setBulkFeedback('تعذر تنفيذ الرد الموحد: الحالات المحددة لم تعد متاحة داخل حسابك.');
      }
    } catch (err: any) {
      setBulkError(err?.message || 'حدث خطأ أثناء إرسال الرد الموحد.');
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  return (
    <div className="space-y-4 text-start animate-fade-up">
      {/* Header */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              الحالات المفتوحة
            </h1>
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 text-xs font-bold tabular-nums">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{overdueCount} متأخرة (+72 ساعة)</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
            {canBulkReply
              ? 'عرض الحالات المفتوحة بحسابك — يمكنك تحديد أكثر من حالة للرد عليها جميعاً برد واحد'
              : 'عرض الحالات المفتوحة فقط المسندة إلى حسابك أو التي قمت بتسجيلها'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="bg-slate-100 dark:bg-[#071629] p-1 rounded-xl flex text-xs font-bold border border-slate-200 dark:border-[#00386B]">
            <button
              onClick={() => setActiveTab('assigned')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'assigned'
                  ? 'bg-[#004B87] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>المفتوحة بحسابي ({assignedToMe.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('created')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'created'
                  ? 'bg-[#004B87] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
              }`}
            >
              <FilePlus className="w-3.5 h-3.5" />
              <span>أنشأتها أنا ({createdByMe.length})</span>
            </button>
          </div>

          <div className="relative flex-1 sm:flex-none">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث في الحالات المفتوحة..."
              className="p-2 text-xs bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-800 dark:text-white rounded-xl pl-8 w-full sm:w-52 focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>
      </div>

      {/* Smart Table */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
        {/* Bulk Reply Action Toolbar (Management & Technical Support only) */}
        {canBulkReply && (selectedCases.length > 0 || bulkFeedback) && (
          <div className="px-4 py-2.5 bg-[#E6F7EF] dark:bg-[#003324]/80 border-b border-[#00A651]/40 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-[#006B34] dark:text-[#00E676]">
              {bulkFeedback && selectedCases.length === 0 ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <CheckSquare className="w-4 h-4 shrink-0" />
              )}
              <span>
                {selectedCases.length > 0
                  ? `تم تحديد ${selectedCases.length} حالة للرد عليها برد واحد`
                  : bulkFeedback}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCases.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={openBulkReplyModal}
                    className="px-3.5 py-1.5 rounded-xl bg-[#004B87] hover:bg-[#00386B] text-white font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>الرد على الحالات المحددة برد واحد ({selectedCases.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-[#002B54] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>إلغاء التحديد</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setBulkFeedback(null)}
                  className="p-1 rounded-lg text-[#006B34] dark:text-[#00E676] hover:bg-[#00A651]/15 cursor-pointer"
                  aria-label="إغلاق التنبيه"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full text-start text-xs min-w-[780px]">
            <thead className="bg-[#00264D] text-white border-b border-[#004B87] text-xs">
              <tr>
                {canBulkReply && (
                  <th className="p-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleEligibleSelected}
                      disabled={eligibleVisibleCases.length === 0}
                      onChange={toggleSelectAllVisible}
                      aria-label="تحديد كافة الحالات للرد الموحد"
                      title={
                        eligibleVisibleCases.length > 0
                          ? 'تحديد / إلغاء تحديد كافة الحالات المفتوحة بحسابك'
                          : 'لا توجد حالات متاحة للتحديد في هذه القائمة'
                      }
                      className="w-4 h-4 accent-[#00A651] cursor-pointer disabled:opacity-40"
                    />
                  </th>
                )}
                <th className="p-3.5">رقم الحالة</th>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5">الضريبة والخدمة</th>
                <th className="p-3.5">الممول</th>
                <th className="p-3.5">عنوان الحالة</th>
                <th className="p-3.5">الأولوية</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]/70">
              {activeList.map((c) => {
                const isEligible = isCaseEligibleForBulkReply(c);
                const isSelected = isEligible && selectedIds.includes(c.id);
                const isOverdueOwned = isCaseOwnedByUser(c, currentUser) && isCaseOverdue72Hours(c);
                const idleDuration = isOverdueOwned
                  ? formatOverdueDurationArabic(getCaseIdleHours(c))
                  : '';

                return (
                  <tr
                    key={c.id}
                    onClick={() => onOpenCase(c)}
                    className={`group cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? 'bg-[#E6F7EF]/80 dark:bg-[#003324]/55'
                        : isOverdueOwned
                        ? 'bg-rose-50/70 dark:bg-rose-950/25 hover:bg-rose-100/80 dark:hover:bg-rose-950/45'
                        : 'hover:bg-[#EBF4FC] dark:hover:bg-[#002B54]'
                    }`}
                  >
                    {canBulkReply && (
                      <td
                        className="p-3.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isEligible}
                          onChange={() => toggleSelectOne(c.id)}
                          aria-label={`تحديد الحالة ${c.caseId}`}
                          title={
                            isEligible
                              ? 'تحديد الحالة للرد الجماعي'
                              : 'هذه الحالة مسندة حالياً لحساب آخر'
                          }
                          className="w-4 h-4 accent-[#00A651] cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                        />
                      </td>
                    )}
                    <td className="p-3.5 font-mono font-bold text-[#004B87] dark:text-sky-300 whitespace-nowrap tabular-nums">
                      <div>{c.caseId}</div>
                      {isOverdueOwned && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs font-sans font-bold text-rose-700 dark:text-rose-400">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>متأخرة ({idleDuration})</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap tabular-nums">
                      {new Date(c.createdAt).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 dark:text-white">{c.taxType}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                        {c.callType} · {c.serviceType}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 dark:text-white line-clamp-1">
                        {c.taxpayerName || '—'}
                      </div>
                      <div className="font-mono text-slate-500 dark:text-slate-400 text-xs tabular-nums">
                        {c.taxRegistrationNumber || 'بدون رقم ضريبي'}
                      </div>
                    </td>
                    <td className="p-3.5 max-w-xs">
                      <div className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:text-[#004B87] dark:group-hover:text-[#00E676] transition-colors">
                        {c.title}
                      </div>
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <PriorityIndicator priority={c.priority} />
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCase(c);
                        }}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-[#071629] group-hover:bg-[#004B87] group-hover:text-white rounded-lg font-bold text-slate-700 dark:text-slate-200 transition-all inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>معاينة</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {activeList.length === 0 && (
                <tr>
                  <td
                    colSpan={canBulkReply ? 9 : 8}
                    className="p-12 text-center text-slate-400 text-sm"
                  >
                    لا توجد حالات مسجلة في هذا القسم حالياً
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unified Bulk Management / Technical Support Reply Modal */}
      {canBulkReply && isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 overflow-y-auto">
          <div className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#00386B] w-full max-w-2xl my-auto overflow-hidden flex flex-col max-h-[92dvh] text-start animate-scale-in">
            {/* Modal Header */}
            <div className="bg-[#00264D] px-5 py-4 text-white flex items-center justify-between border-b border-[#004B87] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#00A651] text-white">
                  <MessageSquarePlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-sm">رد موحد على الحالات المحددة</h2>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    تطبيق نفس رد الإدارة / الدعم التقني على ({selectedCases.length}) حالة دفعة واحدة
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmittingBulk}
                onClick={() => setIsBulkModalOpen(false)}
                className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-40 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitBulkReply} className="p-5 overflow-y-auto space-y-4 text-xs">
              {bulkError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              {/* Selected Cases Summary */}
              <div className="bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl p-3">
                <div className="font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center justify-between">
                  <span>الحالات المشمولة بالرد الموحد ({selectedCases.length}):</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {selectedCases.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#004B87] text-slate-800 dark:text-slate-200 font-semibold"
                    >
                      <span className="font-mono font-bold text-[#004B87] dark:text-sky-300">
                        {c.caseId}
                      </span>
                      <span className="max-w-[140px] truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {c.title}
                      </span>
                      {selectedCases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleSelectOne(c.id)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="إزالة من التحديد"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Responsible Employee */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  اسم موظف الإدارة / الدعم التقني المسؤول *
                </label>
                <select
                  value={bulkEmployeeName}
                  onChange={(e) => setBulkEmployeeName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl font-bold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
                >
                  {managementStaffOptions.map((u) => (
                    <option key={u.id} value={u.fullName}>
                      {u.fullName} ({u.crmUser})
                    </option>
                  ))}
                </select>
              </div>

              {/* Unified Reply Textarea (uses StyledTextarea for scoped font controls) */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  نص رد الإدارة والدعم التقني الموحد *
                </label>
                <StyledTextarea
                  rows={4}
                  required
                  value={bulkReplyText}
                  onChange={(e) => setBulkReplyText(e.target.value)}
                  placeholder="اكتب التوجيه الفني أو الرد الرسمي ليتم تطبيقه على جميع الحالات المحددة..."
                  className="w-full p-3 bg-white dark:bg-[#071629] border border-blue-300 dark:border-[#004B87] rounded-xl text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Optional Return to Creating Agents */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 dark:bg-[#071C36] border border-blue-200 dark:border-[#004B87] cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkReturnToAgent}
                  onChange={(e) => setBulkReturnToAgent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#004B87] cursor-pointer"
                />
                <div>
                  <div className="font-bold text-blue-950 dark:text-sky-200 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-blue-700 dark:text-sky-300" />
                    <span>إعادة الحالات إلى وكلاء الاتصال المنشئين تلقائياً بعد حفظ الرد</span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    {bulkReturnToAgent
                      ? 'سيتم حفظ الرد وإعادة كل حالة إلى وكيل الاتصال المنشئ مع إرسال إشعار فوري له.'
                      : 'سيتم حفظ الرد في الحالات المحددة مع بقائها مفتوحة في حسابك.'}
                  </div>
                </div>
              </label>

              {/* Footer Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#00386B]">
                <button
                  type="button"
                  disabled={isSubmittingBulk}
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#071629] hover:bg-slate-200 dark:hover:bg-[#002B54] text-slate-700 dark:text-slate-200 font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBulk || selectedCases.length === 0}
                  className="px-5 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingBulk ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جارٍ إرسال الرد الموحد...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>اعتماد وإرسال الرد ({selectedCases.length} حالة)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
