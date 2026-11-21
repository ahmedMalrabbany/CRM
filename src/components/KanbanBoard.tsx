/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GripVertical,
  Clock,
  UserCheck,
  Building2,
  Phone,
  ArrowLeftRight,
  CheckCircle2,
  Sparkles,
  Inbox,
  Wrench,
  Eye,
  X,
  Lock,
} from 'lucide-react';
import { Case, CaseStatus, User } from '../types';
import {
  updateCaseStatusPipeline,
  closeCase,
  isCaseOwnedByUser,
  isCaseOverdue72Hours,
} from '../services/caseService';
import { PriorityIndicator } from './SkeletonLoader';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import { StyledTextarea } from './StyledTextarea';

interface KanbanBoardProps {
  cases: Case[];
  currentUser: User;
  onOpenCase: (caseItem: Case) => void;
}

interface ColumnConfig {
  id: CaseStatus;
  titleAr: string;
  titleEn: string;
  accentBorder: string;
  headerBg: string;
  dotColor: string;
  badgeBg: string;
  matchStatus: (status: CaseStatus) => boolean;
}

const COLUMNS: ColumnConfig[] = [
  {
    id: 'جديدة',
    titleAr: 'حالات جديدة',
    titleEn: 'New Cases',
    accentBorder: 'border-t-[#004B87]',
    headerBg: 'bg-[#EBF4FC] dark:bg-[#002B54]',
    dotColor: 'bg-[#004B87] dark:bg-sky-400',
    badgeBg: 'bg-[#004B87] text-white',
    matchStatus: (s) => s === 'جديدة' || s === 'مفتوحة' || s === 'قيد الانتظار',
  },
  {
    id: 'قيد المعالجة',
    titleAr: 'قيد المعالجة والمتابعة',
    titleEn: 'In Progress',
    accentBorder: 'border-t-[#00A651]',
    headerBg: 'bg-[#E6F7EF] dark:bg-[#003324]',
    dotColor: 'bg-[#00A651]',
    badgeBg: 'bg-[#00A651] text-white',
    matchStatus: (s) => s === 'قيد المعالجة' || s === 'محولة لوكيل الاتصال',
  },
  {
    id: 'محولة للإدارة',
    titleAr: 'محولة للإدارة',
    titleEn: 'Escalated to Mgmt',
    accentBorder: 'border-t-amber-600',
    headerBg: 'bg-amber-50 dark:bg-amber-950/60',
    dotColor: 'bg-amber-600',
    badgeBg: 'bg-amber-600 text-white',
    matchStatus: (s) => s === 'محولة للإدارة',
  },
  {
    id: 'محولة للدعم الفني',
    titleAr: 'محولة للدعم الفني',
    titleEn: 'Escalated to Tech',
    accentBorder: 'border-t-sky-600',
    headerBg: 'bg-sky-50 dark:bg-sky-950/60',
    dotColor: 'bg-sky-600',
    badgeBg: 'bg-sky-600 text-white',
    matchStatus: (s) => s === 'محولة للدعم الفني' || s === 'محولة للدعم التقني',
  },
  {
    id: 'مغلقة',
    titleAr: 'مغلقة ومنجزة',
    titleEn: 'Resolved & Closed',
    accentBorder: 'border-t-slate-500',
    headerBg: 'bg-slate-100 dark:bg-slate-800',
    dotColor: 'bg-slate-500',
    badgeBg: 'bg-slate-600 text-white',
    matchStatus: (s) => s === 'مغلقة',
  },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  cases,
  currentUser,
  onOpenCase,
}) => {
  const { language } = useThemeLanguage();
  const [draggedCaseId, setDraggedCaseId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<CaseStatus | null>(null);
  const [updatingCaseId, setUpdatingCaseId] = useState<string | null>(null);

  // Quick Close modal when dropping into 'مغلقة'
  const [pendingCloseCase, setPendingCloseCase] = useState<Case | null>(null);
  const [closeReasonText, setCloseReasonText] = useState('');
  const [closeAgentReplyText, setCloseAgentReplyText] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, c: Case) => {
    if (!isCaseOwnedByUser(c, currentUser)) {
      e.preventDefault();
      return;
    }
    setDraggedCaseId(c.id);
    e.dataTransfer.setData('text/plain', c.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedCaseId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: CaseStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: CaseStatus) => {
    e.preventDefault();
    const caseId = e.dataTransfer.getData('text/plain') || draggedCaseId;
    setDraggedCaseId(null);
    setDragOverColumn(null);

    if (!caseId) return;
    const targetCase = cases.find((item) => item.id === caseId);
    if (!targetCase || targetCase.status === targetStatus) return;
    if (!isCaseOwnedByUser(targetCase, currentUser)) return;

    await triggerStatusTransition(targetCase, targetStatus);
  };

  const triggerStatusTransition = async (targetCase: Case, targetStatus: CaseStatus) => {
    if (!isCaseOwnedByUser(targetCase, currentUser)) return;
    if (targetStatus === 'مغلقة') {
      setPendingCloseCase(targetCase);
      setCloseReasonText(targetCase.closeReason || 'تم الرد على الممول وإنهاء الاستفسار بنجاح');
      setCloseAgentReplyText(targetCase.agentReply || '');
      setCloseError(null);
      return;
    }

    try {
      setUpdatingCaseId(targetCase.id);
      await updateCaseStatusPipeline(targetCase.id, targetStatus, currentUser);
    } catch (err) {
      console.error('Failed to update status from Kanban:', err);
    } finally {
      setUpdatingCaseId(null);
    }
  };

  const handleConfirmQuickClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingCloseCase) return;

    const isAgentUser = currentUser.role === 'agent';
    const effectiveAgentReply = isAgentUser
      ? closeAgentReplyText.trim()
      : (pendingCloseCase.agentReply || '').trim();

    if (!effectiveAgentReply) {
      setCloseError(
        language === 'ar'
          ? isAgentUser
            ? 'يجب كتابة رد وكيل الاتصال على الحالة أولاً (إجباري قبل إغلاق الحالة).'
            : 'لا يمكن إغلاق الحالة قبل تسجيل رد وكلاء الاتصال عليها أولاً.'
          : 'Call agent reply is mandatory before closing this case.'
      );
      return;
    }

    if (!closeReasonText.trim()) {
      setCloseError(
        language === 'ar'
          ? 'برجاء إدخال سبب إغلاق الحالة'
          : 'Please enter a close reason'
      );
      return;
    }
    try {
      setUpdatingCaseId(pendingCloseCase.id);
      await closeCase(
        pendingCloseCase.id,
        closeReasonText.trim(),
        currentUser.fullName,
        currentUser,
        isAgentUser ? effectiveAgentReply : undefined
      );
      setPendingCloseCase(null);
    } catch (err: any) {
      setCloseError(err.message || 'فشل إغلاق الحالة');
    } finally {
      setUpdatingCaseId(null);
    }
  };

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Helper instruction banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-[#EBF4FC] dark:bg-[#002B54] border border-[#004B87]/25 text-xs text-[#00264D] dark:text-slate-200">
        <div className="flex items-center gap-2 font-semibold">
          <ArrowLeftRight className="w-4 h-4 text-[#004B87] dark:text-[#00E676] shrink-0" />
          <span>
            {language === 'ar'
              ? 'لوحة المسار التفاعلية (Kanban Pipeline): اسحب أي بطاقة وأفلتها بين الأعمدة لتحديث حالة التذكرة فورياً في النظام.'
              : 'Interactive Kanban Pipeline: Drag and drop any case card across columns to update its live workflow status.'}
          </span>
        </div>
        <span className="text-[11px] font-mono text-[#004B87] dark:text-[#00E676] font-bold">
          {cases.length} {language === 'ar' ? 'تذكرة في المسار' : 'Tickets in pipeline'}
        </span>
      </div>

      {/* 5-Column Pipeline Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5 items-start">
        {COLUMNS.map((col) => {
          const colCases = cases.filter((c) => col.matchStatus(c.status));
          const isOver = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`rounded-2xl border-t-4 ${col.accentBorder} border border-slate-200 dark:border-[#00386B] bg-white/90 dark:bg-[#0B1D35]/90 flex flex-col max-h-[74vh] transition-all duration-200 ${
                isOver
                  ? 'ring-2 ring-[#00A651] bg-[#E6F7EF] dark:bg-[#003324] scale-[1.01] shadow-saas-lg'
                  : 'shadow-saas'
              }`}
            >
              {/* Column Header */}
              <div
                className={`p-3 border-b border-slate-200 dark:border-[#00386B] flex items-center justify-between rounded-t-xl ${col.headerBg}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${col.dotColor}`} />
                  <h3 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                    {language === 'ar' ? col.titleAr : col.titleEn}
                  </h3>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold tabular-nums ${col.badgeBg}`}
                >
                  {colCases.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="p-2.5 space-y-2.5 overflow-y-auto flex-1 min-h-[180px]">
                {colCases.map((c) => {
                  const isDragging = draggedCaseId === c.id;
                  const isUpdating = updatingCaseId === c.id;
                  const canModify = isCaseOwnedByUser(c, currentUser);
                  const isOverdueOwned = canModify && isCaseOverdue72Hours(c);

                  return (
                    <div
                      key={c.id}
                      draggable={canModify}
                      onDragStart={(e) => handleDragStart(e, c)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onOpenCase(c)}
                      className={`group relative p-3 rounded-xl border shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${
                        isOverdueOwned
                          ? 'bg-rose-50/80 dark:bg-rose-950/35 border-rose-400 dark:border-rose-700 hover:border-rose-600'
                          : 'bg-white dark:bg-[#001F3F] border-slate-200 dark:border-[#00386B] hover:border-[#004B87] dark:hover:border-[#00A651]'
                      } ${
                        canModify ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      } select-none ${
                        isDragging ? 'opacity-40 scale-95 ring-2 ring-[#004B87]' : ''
                      } ${isUpdating ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      {/* Top row: Case ID + Priority + Drag Handle */}
                      <div className="flex items-center justify-between gap-1.5 mb-2">
                        <div className="flex items-center gap-1.5">
                          <GripVertical className="w-3.5 h-3.5 text-slate-300 dark:text-slate-500 group-hover:text-[#004B87] dark:group-hover:text-[#00E676] transition-colors shrink-0" />
                          <span className="font-mono font-bold text-xs text-[#004B87] dark:text-sky-300 tabular-nums">
                            {c.caseId}
                          </span>
                        </div>
                        <PriorityIndicator priority={c.priority} />
                      </div>

                      {isOverdueOwned && (
                        <div className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-400">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{language === 'ar' ? 'تجاوزت 72 ساعة' : 'Overdue +72h'}</span>
                        </div>
                      )}

                      {/* Case Title */}
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 leading-relaxed mb-2 group-hover:text-[#004B87] dark:group-hover:text-[#00E676] transition-colors">
                        {c.title}
                      </h4>

                      {/* Taxpayer & Service compact metadata (Zero-pill discipline: unboxed text with · separator) */}
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 mb-2.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {c.taxpayerName || (language === 'ar' ? 'غير مسجل' : 'Unregistered')}
                          </span>
                          {c.taxRegistrationNumber && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-[11px] tabular-nums">
                                {c.taxRegistrationNumber}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 truncate">
                          <span>{c.callType}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold truncate">
                            {c.serviceType}
                          </span>
                        </div>
                      </div>

                      {/* Card Footer: Date/Assignee + Hover Quick Actions */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                          {new Date(c.createdAt).toLocaleDateString(
                            language === 'ar' ? 'ar-EG' : 'en-US'
                          )}
                        </span>

                        {/* Quick status move selector on hover (owner only) */}
                        <div
                          className="flex items-center gap-1 opacity-85 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canModify ? (
                            <select
                              aria-label="نقل الحالة"
                              value={col.id}
                              onChange={(e) =>
                                triggerStatusTransition(c, e.target.value as CaseStatus)
                              }
                              className="bg-slate-100 dark:bg-[#002D5A] hover:bg-[#EBF4FC] dark:hover:bg-[#004B87] text-slate-700 dark:text-slate-200 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border border-slate-200 dark:border-[#004B87] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#00A651]"
                            >
                              {COLUMNS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {language === 'ar' ? opt.titleAr : opt.titleEn}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#002D5A]/70 text-slate-400 dark:text-slate-400 text-[10px] font-semibold border border-slate-200 dark:border-[#00386B]"
                              title={language === 'ar' ? 'التعديل متاح لصاحب الحساب فقط' : 'Read-only (assigned elsewhere)'}
                            >
                              <Lock className="w-2.5 h-2.5" />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenCase(c)}
                            className="p-1 rounded-md bg-[#EBF4FC] dark:bg-[#002D5A] text-[#004B87] dark:text-sky-300 hover:bg-[#004B87] hover:text-white transition-colors"
                            title={language === 'ar' ? 'فتح التفاصيل' : 'Open Details'}
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {colCases.length === 0 && (
                  <div className="h-36 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center p-4 text-slate-400 dark:text-slate-500 text-[11px]">
                    <span>
                      {language === 'ar' ? 'اسحب حالة إلى هنا' : 'Drop a case card here'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Close Confirmation Modal when dragging a card to 'مغلقة' */}
      {pendingCloseCase &&
        createPortal(
          <div
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[90] bg-[#001429]/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
            onClick={() => setPendingCloseCase(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-200 dark:border-[#004B87] shadow-2xl w-full max-w-md my-auto max-h-[90dvh] overflow-y-auto p-5 space-y-4 animate-scale-in text-start"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#00386B] pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#00A651]" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {language === 'ar'
                      ? `تأكيد إغلاق الحالة ${pendingCloseCase.caseId}`
                      : `Confirm Closing Case ${pendingCloseCase.caseId}`}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingCloseCase(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmQuickClose} className="space-y-3 text-xs">
                {currentUser.role === 'agent' ? (
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                      {language === 'ar'
                        ? 'رد وكيل الاتصال (إجباري قبل الإغلاق) *:'
                        : 'Call Agent Reply (Required before closing) *:'}
                    </label>
                    <StyledTextarea
                      rows={2}
                      value={closeAgentReplyText}
                      onChange={(e) => setCloseAgentReplyText(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                      placeholder={
                        language === 'ar'
                          ? 'اكتب رد وكيل الاتصال المقدم للممول...'
                          : 'Enter call agent reply...'
                      }
                    />
                  </div>
                ) : !(pendingCloseCase.agentReply || '').trim() ? (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 font-bold">
                    {language === 'ar'
                      ? 'لا يمكن إغلاق الحالة قبل تسجيل رد وكلاء الاتصال عليها أولاً.'
                      : 'Call agent reply is required before closing this case.'}
                  </div>
                ) : null}

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    {language === 'ar'
                      ? 'سبب إغلاق الحالة والرد النهائي (إجباري):'
                      : 'Final Resolution & Close Reason (Required):'}
                  </label>
                  <StyledTextarea
                    rows={3}
                    value={closeReasonText}
                    onChange={(e) => setCloseReasonText(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    placeholder={
                      language === 'ar'
                        ? 'اكتب ملخص الحل أو الإفادة المقدمة للممول...'
                        : 'Enter resolution summary...'
                    }
                  />
                </div>

                {closeError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-bold">
                    {closeError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPendingCloseCase(null)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#071629] text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-[#002B54]"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={
                      currentUser.role !== 'agent' && !(pendingCloseCase.agentReply || '').trim()
                    }
                    className="px-4 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-bold shadow-md transition-all disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {language === 'ar' ? 'تأكيد الإغلاق النهائي' : 'Confirm Close'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
