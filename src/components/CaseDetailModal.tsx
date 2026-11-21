/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Printer,
  Sparkles,
  Send,
  UserCheck,
  RotateCcw,
  CheckCircle,
  Share2,
  AlertCircle,
  Mic,
  Clock,
  Building,
  Phone,
  Tag,
  AlertTriangle,
  Lock,
  Search,
  Check,
  Loader2,
} from 'lucide-react';
import { Case, TimelineEvent, User, CaseStatus, CaseAttachmentStage } from '../types';
import {
  subscribeToCaseTimeline,
  claimCase,
  assignCase,
  transferCase,
  returnCaseToAgent,
  closeCase,
  reopenCase,
  updateAgentResponse,
  updateManagementResponse,
  addAttachmentsToCase,
  removeAttachmentFromCase,
  isCaseOwnedByUser,
  canUserClaimCase,
  isCaseOverdue72Hours,
  getCaseIdleHours,
  formatOverdueDurationArabic,
} from '../services/caseService';
import { uploadCaseAttachment } from '../services/attachmentService';
import { getRoleDefaultJobTitle, isUserOnline } from '../services/userService';
import { summarizeCaseWithAI, generateSuggestedResponse } from '../services/geminiService';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { PrintCaseModal } from './PrintCaseModal';
import {
  CaseAttachmentsManager,
  ReplyAttachmentTrigger,
} from './CaseAttachmentsSection';
import { StyledTextarea } from './StyledTextarea';

interface CaseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseItem: Case | null;
  currentUser: User;
  allUsers: User[];
  onCaseUpdated?: (updatedCase: Case) => void;
}

export const CaseDetailModal: React.FC<CaseDetailModalProps> = ({
  isOpen,
  onClose,
  caseItem,
  currentUser,
  allUsers,
  onCaseUpdated,
}) => {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'timeline'>('details');

  // Management reply state
  const [managementReplyText, setManagementReplyText] = useState('');
  const [managementEmployeeName, setManagementEmployeeName] = useState('');

  // Agent reply state
  const [agentReplyText, setAgentReplyText] = useState('');
  const [agentNotesText, setAgentNotesText] = useState('');
  const [agentEmployeeName, setAgentEmployeeName] = useState('');

  // Close Case submodal state
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeReasonInput, setCloseReasonInput] = useState('');
  const [closeEmployeeNameInput, setCloseEmployeeNameInput] = useState(currentUser.fullName);

  // Transfer submodal state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetRole, setTransferTargetRole] = useState<'management'>('management');
  const [transferNotesInput, setTransferNotesInput] = useState('');

  // Assign submodal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignTargetUserId, setAssignTargetUserId] = useState('');
  const [assignSearchTerm, setAssignSearchTerm] = useState('');
  const [assignNotesInput, setAssignNotesInput] = useState('');

  // Auto-save indicator state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Voice recorder state
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<'management' | 'agentNotes' | 'agentReply'>('management');

  // Print modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // AI assistant states
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSuggestedReply, setAiSuggestedReply] = useState<string | null>(null);
  const [isSuggestingReply, setIsSuggestingReply] = useState(false);

  // Status & error tracking
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && caseItem) {
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      dialogRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen, caseItem?.id, activeTab]);

  // Load initial data
  useEffect(() => {
    if (caseItem) {
      setManagementReplyText(caseItem.managementReply || '');
      setManagementEmployeeName(caseItem.managementEmployeeName || currentUser.fullName);
      setAgentReplyText(caseItem.agentReply || '');
      setAgentNotesText(caseItem.agentNotes || '');
      setAgentEmployeeName(caseItem.agentEmployeeName || currentUser.fullName);
      setActionError(null);
      setActionSuccess(null);
      setAutoSaveStatus('idle');
      setAiSummary(null);
      setAiSuggestedReply(null);

      // Subscribe to real-time timeline
      const unsubscribe = subscribeToCaseTimeline(caseItem.id, (events) => {
        setTimeline(events);
      });
      return () => unsubscribe();
    }
  }, [caseItem?.id, currentUser.id]);

  // Debounced auto-save for Agent & Management replies/notes while keeping manual save buttons
  useEffect(() => {
    if (!isOpen || !caseItem || caseItem.status === 'مغلقة') return;
    if (!isCaseOwnedByUser(caseItem, currentUser)) return;

    const agentRole = currentUser.role === 'agent';
    const mgmtRole =
      currentUser.role === 'management' ||
      currentUser.role === 'technical_support' ||
      currentUser.role === 'super_admin';

    const hasAgentChanges =
      agentRole &&
      (agentNotesText !== (caseItem.agentNotes || '') ||
        agentReplyText !== (caseItem.agentReply || ''));

    const hasMgmtChanges =
      mgmtRole && managementReplyText !== (caseItem.managementReply || '');

    if (!hasAgentChanges && !hasMgmtChanges) return;

    setAutoSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        if (hasAgentChanges) {
          await updateAgentResponse(
            caseItem.id,
            {
              agentNotes: agentNotesText,
              agentReply: agentReplyText,
              agentEmployeeName: agentEmployeeName || currentUser.fullName,
              silentAutoSave: true,
            },
            currentUser
          );
        }
        if (hasMgmtChanges) {
          await updateManagementResponse(
            caseItem.id,
            {
              managementReply: managementReplyText,
              managementEmployeeName: managementEmployeeName || currentUser.fullName,
              silentAutoSave: true,
            },
            currentUser
          );
        }
        setAutoSaveStatus('saved');
      } catch {
        setAutoSaveStatus('idle');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    isOpen,
    caseItem,
    currentUser,
    agentNotesText,
    agentReplyText,
    agentEmployeeName,
    managementReplyText,
    managementEmployeeName,
  ]);

  if (!isOpen || !caseItem) return null;

  // Role permissions checks
  const isAgent = currentUser.role === 'agent';
  const isManagementOrSupport =
    currentUser.role === 'management' ||
    currentUser.role === 'technical_support' ||
    currentUser.role === 'super_admin';

  // Strict ownership check: edit & close are available ONLY to the account owner;
  // Reopen closed cases is allowed for owner OR Management / Tech Support / Super Admin even outside their account.
  const isInMyAccount = isCaseOwnedByUser(caseItem, currentUser);
  const isOverdueInMyAccount = isInMyAccount && isCaseOverdue72Hours(caseItem);
  const canEditOrClose = isInMyAccount && caseItem.status !== 'مغلقة';
  const canReopen = (isInMyAccount || isManagementOrSupport) && caseItem.status === 'مغلقة';

  // Claim eligibility via unified helper (Agents can claim pooled OR Mgmt/Tech cases; Mgmt/Tech can claim pooled cases)
  const canClaim = canUserClaimCase(caseItem, currentUser);

  // Voice input callback
  const handleVoiceConfirmed = (text: string) => {
    if (voiceTarget === 'management') {
      setManagementReplyText(text);
    } else if (voiceTarget === 'agentReply') {
      setAgentReplyText(text);
    } else {
      setAgentNotesText(text);
    }
  };

  // Claim Handler (Atomic)
  const handleClaim = async () => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      await claimCase(caseItem.id, currentUser);
      setActionSuccess('تم سحب الحالة بنجاح وبدء معالجتها.');
    } catch (err: any) {
      setActionError(err.message || 'فشل سحب الحالة');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Transfer Handler
  const handleTransfer = async () => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      await transferCase(caseItem.id, transferTargetRole, transferNotesInput, currentUser);
      setIsTransferModalOpen(false);
      setActionSuccess('تم تحويل الحالة إلى الإدارة والدعم التقني بنجاح.');
    } catch (err: any) {
      setActionError(err.message || 'فشل تحويل الحالة');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Assign Handler
  const handleAssign = async () => {
    if (!assignTargetUserId) {
      setActionError('برجاء اختيار الموظف المراد إسناد الحالة إليه');
      return;
    }
    const targetUser = allUsers.find((u) => u.id === assignTargetUserId);
    if (!targetUser) return;
    if (targetUser.role === 'super_admin') {
      setActionError('لا يمكن إسناد الحالات إلى حساب مدير النظام (الأدمن).');
      return;
    }

    setIsActionLoading(true);
    setActionError(null);
    try {
      await assignCase(caseItem.id, targetUser, assignNotesInput, currentUser);
      setIsAssignModalOpen(false);
      setActionSuccess(`تم إسناد الحالة إلى ${targetUser.fullName} بنجاح.`);
    } catch (err: any) {
      setActionError(err.message || 'فشل إسناد الحالة');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Return to Agent Handler
  const handleReturnToAgent = async () => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      await returnCaseToAgent(caseItem.id, managementReplyText, currentUser);
      setActionSuccess(`تمت إعادة الحالة إلى وكيل الاتصال المنشئ (${caseItem.createdByName})`);
    } catch (err: any) {
      setActionError(err.message || 'فشلت إعادة الحالة');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Close Case Handler
  const handleCloseCase = async () => {
    const effectiveAgentReply = isAgent
      ? agentReplyText.trim()
      : (caseItem.agentReply || '').trim();

    if (!effectiveAgentReply) {
      setActionError(
        isAgent
          ? 'يجب كتابة رد وكيل الاتصال على الحالة أولاً (إجباري قبل إغلاق الحالة).'
          : 'لا يمكن إغلاق الحالة قبل تسجيل رد وكلاء الاتصال أولاً (يجب إسنادها أو إعادتها لوكيل الاتصال للرد ثم الإغلاق).'
      );
      return;
    }

    if (!closeReasonInput.trim()) {
      setActionError('برجاء إدخال سبب غلق الحالة (إجباري لإتمام الإغلاق).');
      return;
    }
    setIsActionLoading(true);
    setActionError(null);
    try {
      await closeCase(
        caseItem.id,
        closeReasonInput,
        closeEmployeeNameInput,
        currentUser,
        isAgent ? effectiveAgentReply : undefined
      );
      setIsCloseModalOpen(false);
      setActionSuccess('تم إغلاق الحالة نهائياً وتسجيل رد الوكيل وسبب الإغلاق والموظف المسؤول.');
    } catch (err: any) {
      setActionError(err.message || 'فشل إغلاق الحالة');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Reopen Case Handler
  const handleReopenCase = async () => {
    setIsActionLoading(true);
    setActionError(null);
    try {
      await reopenCase(caseItem.id, 'إعادة فتح لمتابعة مستجدات الممول', currentUser);
      setActionSuccess('تمت إعادة فتح الحالة بنجاح.');
    } catch (err: any) {
      setActionError(err.message || 'فشلت إعادة فتح الحالة');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Save Management Reply
  const handleSaveManagementReply = async () => {
    if (!managementReplyText.trim()) {
      setActionError('برجاء كتابة نص الرد قبل الحفظ.');
      return;
    }
    if (!managementEmployeeName.trim()) {
      setActionError('برجاء تحديد اسم موظف الإدارة / الدعم التقني المسؤول.');
      return;
    }
    setIsActionLoading(true);
    setActionError(null);
    try {
      await updateManagementResponse(
        caseItem.id,
        {
          managementReply: managementReplyText.trim(),
          managementEmployeeName: managementEmployeeName.trim(),
        },
        currentUser
      );
      setActionSuccess('تم حفظ رد الإدارة والدعم التقني وتسجيله في سجل الحركة.');
    } catch (err: any) {
      setActionError(err.message || 'فشل حفظ الرد');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Save Agent Reply
  const handleSaveAgentReply = async () => {
    if (!agentEmployeeName.trim()) {
      setActionError('برجاء تحديد اسم وكيل الاتصال المسؤول.');
      return;
    }
    setIsActionLoading(true);
    setActionError(null);
    try {
      await updateAgentResponse(
        caseItem.id,
        {
          agentNotes: agentNotesText.trim(),
          agentReply: agentReplyText.trim(),
          agentEmployeeName: agentEmployeeName.trim(),
        },
        currentUser
      );
      setActionSuccess('تم تحديث ملاحظات ورد وكيل الاتصال بنجاح.');
    } catch (err: any) {
      setActionError(err.message || 'فشل تحديث الرد');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Upload one or more documents to Case
  const handleUploadAttachments = async (files: File[], stage: CaseAttachmentStage) => {
    if (!files || files.length === 0) return;
    setIsUploadingAttachment(true);
    setActionError(null);
    try {
      const uploaded = [];
      for (const file of files) {
        const att = await uploadCaseAttachment(file, stage, currentUser);
        uploaded.push(att);
      }
      const updatedList = await addAttachmentsToCase(caseItem.id, uploaded, currentUser, stage);
      if (onCaseUpdated) {
        onCaseUpdated({ ...caseItem, attachments: updatedList });
      }
      setActionSuccess(`تم إرفاق (${uploaded.length}) مستند بالحالة بنجاح.`);
    } catch (err: any) {
      setActionError(err?.message || 'فشل رفع أو إرفاق المستند.');
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  // Delete an attachment from Case
  const handleDeleteAttachment = async (attachmentId: string) => {
    setActionError(null);
    try {
      const remaining = await removeAttachmentFromCase(caseItem.id, attachmentId, currentUser);
      if (onCaseUpdated) {
        onCaseUpdated({ ...caseItem, attachments: remaining });
      }
      setActionSuccess('تم حذف المستند المرفق من الحالة.');
    } catch (err: any) {
      setActionError(err?.message || 'تعذر حذف المستند المرفق.');
    }
  };

  // AI Summarize
  const handleSummarize = async () => {
    setIsSummarizing(true);
    try {
      const summary = await summarizeCaseWithAI({
        title: caseItem.title,
        notes: caseItem.agentNotes,
        agentReply: caseItem.agentReply,
        managementReply: caseItem.managementReply,
        timelineActions: timeline.map((t) => t.action),
      });
      setAiSummary(summary);
    } finally {
      setIsSummarizing(false);
    }
  };

  // AI Suggest Reply
  const handleSuggestReply = async () => {
    setIsSuggestingReply(true);
    setActionError(null);
    try {
      const reply = await generateSuggestedResponse({
        title: caseItem.title,
        taxType: caseItem.taxType,
        serviceType: caseItem.serviceType,
        notes: caseItem.agentNotes,
        callerName: caseItem.callerName,
        targetRole: isManagementOrSupport ? 'management' : 'agent',
      });
      setAiSuggestedReply(reply);
    } catch (err: any) {
      setActionError(err?.message || 'تعذر توليد مسودة الرد بالذكاء الاصطناعي حالياً.');
    } finally {
      setIsSuggestingReply(false);
    }
  };

  // Colors based on status
  const getStatusBadge = (status: CaseStatus) => {
    switch (status) {
      case 'جديدة':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'مفتوحة':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'قيد المعالجة':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'محولة للإدارة':
        return 'bg-[#004B87] text-white border-[#00386B]';
      case 'محولة للدعم الفني':
        return 'bg-sky-600 text-white border-sky-700';
      case 'محولة لوكيل الاتصال':
        return 'bg-cyan-700 text-white border-cyan-800';
      case 'مغلقة':
        return 'bg-slate-600 text-white border-slate-700';
      default:
        return 'bg-slate-200 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 overflow-y-auto">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#00386B] w-full max-w-4xl my-auto overflow-hidden flex flex-col max-h-[92dvh] text-start animate-scale-in focus:outline-none"
      >
        {/* Header */}
        <div className="bg-[#00264D] p-4 text-white flex items-center justify-between shrink-0 border-b border-[#004B87]">
          <div className="flex items-center gap-3">
            <div className="bg-[#00A651] text-white font-mono font-black text-sm px-3 py-1 rounded-xl shadow-xs">
              {caseItem.caseId}
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-white line-clamp-1">{caseItem.title}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                <span>
                  الممول: {caseItem.taxpayerName || 'غير مسجل'}{' '}
                  {caseItem.taxRegistrationNumber ? `(${caseItem.taxRegistrationNumber})` : '(بدون رقم تسجيل)'}
                </span>
                <span>•</span>
                <span>{new Date(caseItem.createdAt).toLocaleDateString('ar-EG')}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              طباعة
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Status Notifications */}
        {actionError && (
          <div className="m-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div className="m-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-bold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Action Bar (Buttons) */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg font-bold border ${getStatusBadge(caseItem.status)}`}>
              {caseItem.status}
            </span>
            <span className="text-slate-600 font-medium">
              المسؤول الحالي:{' '}
              <strong className="text-slate-900">
                {caseItem.assignedToName ||
                  (caseItem.status === 'محولة للإدارة' || caseItem.status === 'محولة للدعم الفني' || caseItem.status === 'محولة للدعم التقني'
                    ? 'غير مسند لموظف محدد (في قائمة الواردة)'
                    : caseItem.createdByName)}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Claim button */}
            {canClaim && (
              <button
                type="button"
                onClick={handleClaim}
                disabled={isActionLoading}
                className="px-3 py-1.5 bg-[#00A651] hover:bg-[#008742] text-white font-bold rounded-xl flex items-center gap-1 shadow-xs transition-all active:scale-95"
              >
                <UserCheck className="w-3.5 h-3.5" />
                سحب الحالة (Claim)
              </button>
            )}

            {/* Transfer to Management / Support — Owner only */}
            {canEditOrClose && (
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(true)}
                className="px-3 py-1.5 bg-[#004B87] hover:bg-[#00386B] text-white font-bold rounded-xl flex items-center gap-1 transition-all active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5" />
                تحويل الحالة
              </button>
            )}

            {/* Assign to colleague — Owner & Mgmt/Support only */}
            {canEditOrClose && isManagementOrSupport && (
              <button
                type="button"
                onClick={() => {
                  setAssignSearchTerm('');
                  setAssignTargetUserId('');
                  setIsAssignModalOpen(true);
                }}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-1 transition-all active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                إسناد لزميل
              </button>
            )}

            {/* Return to creating agent — Owner & Mgmt/Support only */}
            {canEditOrClose && isManagementOrSupport && (
              <button
                type="button"
                onClick={handleReturnToAgent}
                disabled={isActionLoading}
                className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-xl flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                إعادة للوكيل المنشئ
              </button>
            )}

            {/* Close Case / Reopen Case — STRICTLY Owner only */}
            {caseItem.status !== 'مغلقة'
              ? canEditOrClose && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setIsCloseModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    غلق الحالة
                  </button>
                )
              : canReopen && (
                  <button
                    type="button"
                    onClick={handleReopenCase}
                    disabled={isActionLoading}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    إعادة فتح الحالة
                  </button>
                )}
          </div>
        </div>

        {/* Read-only notice when case is NOT inside current user's account */}
        {!isInMyAccount && (
          <div className="mx-4 mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 text-xs font-bold flex items-center gap-2 shrink-0">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {canClaim
                ? 'وضع القراءة فقط: يمكنك سحب هذه الحالة إلى حسابك عبر زر "سحب الحالة (Claim)" لتتمكن من الرد عليها أو تحويلها أو إغلاقها.'
                : canReopen
                ? 'الحالة مغلقة خارج حسابك — متاح لحسابات الإدارة والدعم التقني إعادة فتح الحالة للمتابعة.'
                : `وضع القراءة فقط: هذه الحالة مسندة حالياً في حساب (${caseItem.assignedToName || caseItem.createdByName}) — التعديل وغلق الحالة متاح لصاحب الحساب فقط.`}
            </span>
          </div>
        )}

        {/* >72 Hours Overdue Warning Banner for Account Owner */}
        {isOverdueInMyAccount && (
          <div className="mx-4 mt-3 p-3 bg-rose-50 border-2 border-rose-500 rounded-xl text-rose-950 text-xs font-bold flex items-center gap-2.5 shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>
              تنبيه تأخر إجراء (+72 ساعة): بقيت هذه الحالة في حسابك لمدة ({formatOverdueDurationArabic(getCaseIdleHours(caseItem))}) دون اتخاذ أي إجراء — يرجى تسجيل الرد أو التحويل أو إغلاق الحالة.
            </span>
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex border-b border-slate-200 px-5 pt-2 bg-slate-50/70 shrink-0 text-xs font-bold">
          <button
            onClick={() => setActiveTab('details')}
            className={`pb-2 px-4 border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            تفاصيل الحالة والردود
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`pb-2 px-4 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'timeline'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            سجل حركة الحالة (Case Timeline)
            <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full text-[10px]">
              {timeline.length}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div ref={bodyRef} className="p-5 overflow-y-auto flex-1 text-xs space-y-4">
          {activeTab === 'details' ? (
            <>
              {/* AI Assistant Quick Tools */}
              <div className="p-3 bg-[#E6F7EF] border border-[#00A651]/40 rounded-2xl flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-[#00A651] text-white rounded-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs">مساعد الذكاء الاصطناعي (Gemini AI)</div>
                    <div className="text-[11px] text-slate-600">تلخيص فوري للحالة واقتراح ردود رسمية ذكية</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSummarize}
                    disabled={isSummarizing}
                    className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold rounded-lg shadow-xs flex items-center gap-1 transition-colors"
                  >
                    {isSummarizing ? 'جارٍ التلخيص...' : 'تلخيص الحالة'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSuggestReply}
                    disabled={isSuggestingReply}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs flex items-center gap-1 transition-colors"
                  >
                    {isSuggestingReply ? 'جارٍ صياغة الرد...' : 'اقتراح رد رسمي'}
                  </button>
                </div>
              </div>

              {/* AI Summary Display */}
              {aiSummary && (
                <div className="p-3 bg-white border border-emerald-300 rounded-xl shadow-xs">
                  <div className="font-bold text-emerald-950 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    الملخص التنفيذي للحالة:
                  </div>
                  <div className="text-slate-800 leading-relaxed">{aiSummary}</div>
                </div>
              )}

              {/* AI Suggested Reply Display */}
              {aiSuggestedReply && (
                <div className="p-3 bg-white border border-blue-300 rounded-xl shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-bold text-blue-950 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      مسودة الرد المقترحة (للمراجعة والاعتماد):
                    </div>
                    {canEditOrClose && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isManagementOrSupport) {
                            setManagementReplyText(aiSuggestedReply);
                          } else {
                            setAgentReplyText(aiSuggestedReply);
                          }
                        }}
                        className="text-emerald-700 hover:text-emerald-900 font-bold text-[11px] underline"
                      >
                        اعتماد ونسخ إلى خانة الرد
                      </button>
                    )}
                  </div>
                  <div className="text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-2.5 rounded-lg">
                    {aiSuggestedReply}
                  </div>
                </div>
              )}

              {/* Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Taxpayer Card */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-800 mb-2 flex items-center gap-1 border-b border-slate-200 pb-1">
                    <Building className="w-4 h-4 text-emerald-700" />
                    بيانات الممول
                  </div>
                  <div className="space-y-1 text-slate-700">
                    <div>
                      <span className="text-slate-500">رقم التسجيل: </span>
                      <span className="font-mono font-bold text-slate-900">
                        {caseItem.taxRegistrationNumber || 'لا يوجد رقم تسجيل ضريبي'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">الاسم / الكيان: </span>
                      <span className="font-bold text-slate-900">{caseItem.taxpayerName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">نوع الضريبة: </span>
                      <span className="font-semibold text-emerald-800">{caseItem.taxType}</span>
                    </div>
                  </div>
                </div>

                {/* Caller Card */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-800 mb-2 flex items-center gap-1 border-b border-slate-200 pb-1">
                    <Phone className="w-4 h-4 text-emerald-700" />
                    بيانات المتصل
                  </div>
                  <div className="space-y-1 text-slate-700">
                    <div>
                      <span className="text-slate-500">اسم المتصل: </span>
                      <span className="font-bold text-slate-900">{caseItem.callerName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">الهاتف: </span>
                      <span className="font-mono text-slate-900">{caseItem.callerPhone}</span>
                    </div>
                    {caseItem.callerNationalId && (
                      <div>
                        <span className="text-slate-500">الرقم القومي: </span>
                        <span className="font-mono font-bold text-slate-900" dir="ltr">
                          {caseItem.callerNationalId}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500">القناة: </span>
                      <span className="font-semibold">{caseItem.channel}</span>
                    </div>
                  </div>
                </div>

                {/* Ticket Meta */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-800 mb-2 flex items-center gap-1 border-b border-slate-200 pb-1">
                    <Tag className="w-4 h-4 text-emerald-700" />
                    بيانات التذكرة
                  </div>
                  <div className="space-y-1 text-slate-700">
                    <div>
                      <span className="text-slate-500">نوع الاتصال: </span>
                      <span className="font-bold text-slate-900">{caseItem.callType}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">الخدمة: </span>
                      <span className="font-semibold text-slate-900">{caseItem.serviceType}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">المنشئ: </span>
                      <span>{caseItem.createdByName} ({caseItem.createdByCrmUser})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Title & Agent Notes */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="text-slate-500 font-bold text-[10px] mb-0.5">عنوان الحالة الموحد:</div>
                <div className="text-sm font-black text-slate-900 mb-2">{caseItem.title}</div>

                <div className="border-t border-slate-200 pt-2">
                  <div className="font-bold text-slate-800 mb-1 flex items-center justify-between">
                    <span>ملاحظات وكيل الاتصال:</span>
                    {isAgent && canEditOrClose && (
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceTarget('agentNotes');
                          setIsVoiceModalOpen(true);
                        }}
                        className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                      >
                        <Mic className="w-3 h-3" /> تسجيل صوتي
                      </button>
                    )}
                  </div>
                  {isAgent && canEditOrClose ? (
                    <StyledTextarea
                      rows={2}
                      value={agentNotesText}
                      onChange={(e) => setAgentNotesText(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800"
                    />
                  ) : (
                    <div className="bg-white p-2 rounded-lg border border-slate-200 text-slate-800 whitespace-pre-wrap">
                      {caseItem.agentNotes || 'لا توجد ملاحظات إضافية'}
                    </div>
                  )}
                </div>
              </div>

              {/* Agent Reply Section */}
              <div className="bg-emerald-50/40 p-3.5 rounded-xl border border-emerald-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-emerald-950 flex flex-wrap items-center gap-1.5">
                    <span>رد وكيل الاتصال (Agent Reply) *:</span>
                    <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                      إجباري قبل إغلاق الحالة
                    </span>
                    {caseItem.agentEmployeeName && (
                      <span className="text-[10px] font-normal text-emerald-800">
                        (المسؤول: {caseItem.agentEmployeeName})
                      </span>
                    )}
                  </div>
                  {isAgent && canEditOrClose && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceTarget('agentReply');
                        setIsVoiceModalOpen(true);
                      }}
                      className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1"
                    >
                      <Mic className="w-3.5 h-3.5" /> تسجيل صوتي للرد
                    </button>
                  )}
                </div>

                {isAgent && canEditOrClose ? (
                  <div className="space-y-2">
                    <StyledTextarea
                      rows={2}
                      value={agentReplyText}
                      onChange={(e) => setAgentReplyText(e.target.value)}
                      placeholder="اكتب رد وكيل الاتصال هنا..."
                      className="w-full p-2 bg-white border border-emerald-300 rounded-lg text-slate-800"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-700">الموظف المسؤول:</label>
                        <select
                          value={agentEmployeeName}
                          onChange={(e) => setAgentEmployeeName(e.target.value)}
                          className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                        >
                          {(() => {
                            const seen = new Set<string>();
                            return allUsers
                              .filter((u) => u.status === 'active')
                              .filter((u) => {
                                const key = u.fullName.trim();
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                              })
                              .map((u) => (
                                <option key={u.id} value={u.fullName}>
                                  {u.fullName} ({u.crmUser} - {u.role === 'agent' ? 'وكيل اتصال' : 'موظف'})
                                </option>
                              ));
                          })()}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {autoSaveStatus === 'saving' && (
                          <span className="text-[11px] font-bold text-[#004B87] flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            جارٍ الحفظ تلقائياً...
                          </span>
                        )}
                        {autoSaveStatus === 'saved' && (
                          <span className="text-[11px] font-bold text-[#00A651] flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            تم الحفظ تلقائياً
                          </span>
                        )}
                        <ReplyAttachmentTrigger
                          stage="agent_reply"
                          canUpload={isAgent && canEditOrClose}
                          isUploading={isUploadingAttachment}
                          onFilesSelected={(files, stage) => void handleUploadAttachments(files, stage)}
                          variant="emerald"
                        />
                        <button
                          type="button"
                          onClick={handleSaveAgentReply}
                          disabled={isActionLoading}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
                        >
                          حفظ رد الوكيل
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-slate-800 whitespace-pre-wrap">
                    {caseItem.agentReply || 'لم يتم تسجيل رد من وكيل الاتصال بعد.'}
                  </div>
                )}
              </div>

              {/* Management & Technical Support Reply Section */}
              <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-blue-950 flex items-center gap-1.5">
                    <span>رد الإدارة والدعم التقني (Management & Support Reply):</span>
                    {caseItem.managementEmployeeName && (
                      <span className="text-[10px] font-normal text-blue-800">
                        (المسؤول: {caseItem.managementEmployeeName})
                      </span>
                    )}
                  </div>

                  {isManagementOrSupport && canEditOrClose && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceTarget('management');
                        setIsVoiceModalOpen(true);
                      }}
                      className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1"
                    >
                      <Mic className="w-3.5 h-3.5" /> تسجيل صوتي للرد
                    </button>
                  )}
                </div>

                {isManagementOrSupport && canEditOrClose ? (
                  <div className="space-y-2">
                    <StyledTextarea
                      rows={3}
                      value={managementReplyText}
                      onChange={(e) => setManagementReplyText(e.target.value)}
                      placeholder="اكتب التوجيه الفني أو حل المشكلة من قبل الإدارة / الدعم التقني..."
                      className="w-full p-2.5 bg-white border border-blue-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-700">
                          اسم موظف الإدارة / الدعم التقني المسؤول *
                        </label>
                        <select
                          value={managementEmployeeName}
                          onChange={(e) => setManagementEmployeeName(e.target.value)}
                          className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                        >
                          {(() => {
                            const seen = new Set<string>();
                            return allUsers
                              .filter(
                                (u) =>
                                  u.status === 'active' &&
                                  (u.role === 'management' ||
                                    u.role === 'technical_support' ||
                                    u.role === 'super_admin')
                              )
                              .filter((u) => {
                                const key = u.fullName.trim();
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                              })
                              .map((u) => (
                                <option key={u.id} value={u.fullName}>
                                  {u.fullName} ({u.crmUser} - ادارة ودعم تقني)
                                </option>
                              ));
                          })()}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {autoSaveStatus === 'saving' && (
                          <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            جارٍ الحفظ تلقائياً...
                          </span>
                        )}
                        {autoSaveStatus === 'saved' && (
                          <span className="text-[11px] font-bold text-[#00A651] flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            تم الحفظ تلقائياً
                          </span>
                        )}
                        <ReplyAttachmentTrigger
                          stage="management_reply"
                          canUpload={isManagementOrSupport && canEditOrClose}
                          isUploading={isUploadingAttachment}
                          onFilesSelected={(files, stage) => void handleUploadAttachments(files, stage)}
                          variant="blue"
                        />
                        <button
                          type="button"
                          onClick={handleSaveManagementReply}
                          disabled={isActionLoading}
                          className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
                        >
                          حفظ رد الإدارة والدعم التقني
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-2.5 rounded-lg border border-blue-200 text-slate-800 whitespace-pre-wrap">
                    {caseItem.managementReply ? (
                      <div>{caseItem.managementReply}</div>
                    ) : (
                      <div className="text-slate-400 italic">
                        {isAgent
                          ? 'لم تقم الإدارة أو الدعم التقني بإضافة رد بعد. (هذا الحقل للقراءة فقط بالنسبة لوكيل الاتصال).'
                          : 'لم يتم تسجيل رد من الإدارة بعد.'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Case Attachments Section */}
              <CaseAttachmentsManager
                attachments={caseItem.attachments || []}
                canEdit={canEditOrClose}
                isUploading={isUploadingAttachment}
                defaultUploadStage={isManagementOrSupport ? 'management_reply' : 'agent_reply'}
                onUploadFiles={handleUploadAttachments}
                onDeleteAttachment={handleDeleteAttachment}
              />

              {/* Close reason info if closed */}
              {caseItem.status === 'مغلقة' && (
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl">
                  <div className="font-bold text-rose-950 mb-1 flex items-center justify-between">
                    <span>بيانات إغلاق الحالة:</span>
                    <span className="text-[10px] text-rose-700">
                      أغلقت بواسطة: {caseItem.closedByName} ({caseItem.closedAt ? new Date(caseItem.closedAt).toLocaleString('ar-EG') : ''})
                    </span>
                  </div>
                  <div className="text-slate-800 font-semibold">{caseItem.closeReason}</div>
                </div>
              )}
            </>
          ) : (
            /* Timeline Tab */
            <div className="space-y-3">
              <div className="font-bold text-slate-800 text-sm flex items-center justify-between">
                <span>سجل حركة الحالة التاريخي (Audit Timeline Trail):</span>
                <span className="text-[10px] text-slate-400">سجل مؤمّن غير قابل للتعديل أو الحذف</span>
              </div>

              <div className="relative border-r-2 border-slate-200 mr-3 pr-4 space-y-4">
                {timeline.map((event, idx) => (
                  <div key={idx} className="relative group">
                    {/* Timeline dot */}
                    <div className="absolute -right-[23px] top-1 w-3.5 h-3.5 rounded-full bg-emerald-600 border-2 border-white shadow-xs"></div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 hover:bg-slate-100/80 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 text-xs">{event.action}</span>
                        <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap">
                          {new Date(event.createdAt).toLocaleString('ar-EG')}
                        </span>
                      </div>

                      <div className="text-slate-600 text-[11px] mt-1 flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{event.userName}</span>
                        <span className="text-slate-400">({event.userCrmUser} - {event.userRole})</span>
                        {event.previousStatus && event.newStatus && (
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                            {event.previousStatus} → {event.newStatus}
                          </span>
                        )}
                      </div>

                      {event.notes && (
                        <div className="mt-1.5 text-slate-700 bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
                          {event.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {timeline.length === 0 && (
                  <div className="text-center py-6 text-slate-400">لا توجد حركات مسجلة بعد.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Submodal: Close Case (Strictly requires agent reply & close reason) */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0B1D35] rounded-2xl p-5 max-w-md w-full shadow-2xl border border-slate-200 dark:border-[#004B87] text-right space-y-3 my-auto">
            <h3 className="font-bold text-sm text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              إغلاق الحالة ({caseItem.caseId})
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              يشترط النظام تسجيل رد وكيل الاتصال وإدخال سبب غلق الحالة واسم الموظف المسؤول لإتمام الإغلاق.
            </p>

            {/* Mandatory Call Agent Reply check / input */}
            {isAgent ? (
              <div>
                <label className="font-bold text-slate-800 dark:text-slate-100 block mb-1 text-xs">
                  رد وكيل الاتصال * (إجباري قبل الإغلاق)
                </label>
                <StyledTextarea
                  rows={2}
                  value={agentReplyText}
                  onChange={(e) => setAgentReplyText(e.target.value)}
                  placeholder="اكتب رد وكيل الاتصال المقدم للممول قبل إغلاق الحالة..."
                  className={`w-full p-2.5 rounded-xl text-xs border ${
                    !agentReplyText.trim()
                      ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-400'
                      : 'bg-slate-50 dark:bg-[#071629] border-emerald-400'
                  } text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00A651]`}
                />
              </div>
            ) : !(caseItem.agentReply || '').trim() ? (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-bold leading-relaxed">
                تنبيه هام: لم يتم تسجيل رد وكيل الاتصال على هذه الحالة بعد. يجب أن يكون رد وكلاء الاتصال مسجلاً على الحالة قبل إغلاقها (يمكنك إسنادها أو إعادتها لوكيل الاتصال للرد ثم الإغلاق).
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-[#003324]/50 border border-emerald-200 dark:border-[#00A651]/40 text-xs">
                <div className="font-bold text-emerald-900 dark:text-[#00E676] mb-0.5">
                  رد وكيل الاتصال المسجل:
                </div>
                <div className="text-slate-700 dark:text-slate-200 line-clamp-2">
                  {caseItem.agentReply}
                </div>
              </div>
            )}

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1 text-xs">
                سبب غلق الحالة * (إجباري)
              </label>
              <StyledTextarea
                rows={3}
                value={closeReasonInput}
                onChange={(e) => setCloseReasonInput(e.target.value)}
                placeholder="مثال: تم التواصل مع الممول هاتفياً وشرح خطوات التسجيل بمنظومة الفاتورة وحل الإشكال..."
                className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1 text-xs">
                اسم الموظف القائم بالإغلاق * (إجباري)
              </label>
              <input
                type="text"
                value={closeEmployeeNameInput}
                onChange={(e) => setCloseEmployeeNameInput(e.target.value)}
                className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl text-xs font-semibold"
              />
            </div>

            {actionError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-200 dark:border-[#00386B]">
              <button
                type="button"
                onClick={() => setIsCloseModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#002B54] rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleCloseCase}
                disabled={
                  isActionLoading ||
                  (!isAgent && !(caseItem.agentReply || '').trim())
                }
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs disabled:opacity-45 disabled:cursor-not-allowed"
              >
                تأكيد إغلاق الحالة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submodal: Transfer Case */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-[#001429]/75 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border border-slate-200 text-right space-y-3 animate-scale-in">
            <h3 className="font-bold text-sm text-[#004B87] flex items-center gap-1.5">
              <Share2 className="w-5 h-5 text-[#004B87]" />
              تحويل الحالة إلى الإدارة والدعم التقني
            </h3>
            <p className="text-xs text-slate-600">
              سيتم إدراج الحالة في الشاشة العامة للحالات الواردة للإدارة والدعم التقني.
            </p>

            <div>
              <label className="font-bold text-slate-700 block mb-1 text-xs">جهة التحويل *</label>
              <select
                value={transferTargetRole}
                onChange={(e) => setTransferTargetRole(e.target.value as 'management')}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#004B87] focus:outline-none"
              >
                <option value="management">الإدارة والدعم التقني (Management &amp; Technical Support)</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1 text-xs">ملاحظات التحويل</label>
              <StyledTextarea
                rows={2}
                value={transferNotesInput}
                onChange={(e) => setTransferNotesInput(e.target.value)}
                placeholder="سبب التحويل، النقطة الفنية المطلوب البت فيها..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#004B87] focus:outline-none"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleTransfer}
                disabled={isActionLoading}
                className="px-4 py-1.5 text-xs font-bold bg-[#004B87] hover:bg-[#00386B] text-white rounded-xl shadow-xs transition-all active:scale-95"
              >
                تأكيد التحويل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submodal: Assign to Colleague */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border border-slate-200 text-right space-y-3">
            <h3 className="font-bold text-sm text-blue-900 flex items-center gap-1.5">
              <Send className="w-5 h-5 text-blue-600" />
              إسناد الحالة إلى زميل
            </h3>

            <div className="space-y-2">
              <label className="font-bold text-slate-700 block text-xs">
                ابحث واختر الموظف المسند إليه الحالة *
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={assignSearchTerm}
                  onChange={(e) => setAssignSearchTerm(e.target.value)}
                  placeholder="بحث باسم الزميل أو كود CRM..."
                  className="w-full pr-8 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#004B87] focus:outline-none"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-1.5 space-y-1">
                {(() => {
                  const seen = new Set<string>();
                  const q = assignSearchTerm.trim().toLowerCase();
                  const filtered = allUsers
                    .filter((u) => u.status === 'active' && u.role !== 'super_admin')
                    .filter((u) => {
                      const key = u.fullName.trim();
                      if (seen.has(key)) return false;
                      seen.add(key);
                      if (!q) return true;
                      return (
                        u.fullName.toLowerCase().includes(q) ||
                        u.crmUser.toLowerCase().includes(q) ||
                        u.username.toLowerCase().includes(q)
                      );
                    });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-4 text-center text-xs text-slate-400">
                        لا يوجد موظفون مطابقون للبحث
                      </div>
                    );
                  }

                  return filtered.map((u) => {
                    const isSelected = assignTargetUserId === u.id;
                    const online = isUserOnline(u);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setAssignTargetUserId(u.id)}
                        className={`w-full text-right px-2.5 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#004B87] text-white border-[#004B87]'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-[#00A651]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              online ? 'bg-[#00E676]' : 'bg-slate-400'
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="font-bold truncate">{u.fullName}</div>
                            <div className={`text-[10px] truncate ${isSelected ? 'text-sky-200' : 'text-slate-500'}`}>
                              {u.crmUser} · {getRoleDefaultJobTitle(u.role)}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold shrink-0 ${
                            online
                              ? isSelected
                                ? 'text-[#00E676]'
                                : 'text-[#00A651]'
                              : isSelected
                              ? 'text-sky-200'
                              : 'text-slate-400'
                          }`}
                        >
                          {online ? 'أون لاين' : 'أوف لاين'}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1 text-xs">ملاحظات الإسناد</label>
              <StyledTextarea
                rows={2}
                value={assignNotesInput}
                onChange={(e) => setAssignNotesInput(e.target.value)}
                placeholder="تعليمات أو ملاحظات لزميلك..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={isActionLoading}
                className="px-4 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white rounded-xl shadow-xs"
              >
                تأكيد الإسناد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Recorder Modal */}
      <VoiceRecorderModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onConfirm={handleVoiceConfirmed}
        title={
          voiceTarget === 'management'
            ? 'تسجيل صوتي لرد الإدارة والدعم التقني'
            : voiceTarget === 'agentReply'
            ? 'تسجيل صوتي لرد وكيل الاتصال'
            : 'تسجيل صوتي لملاحظات وكيل الاتصال'
        }
        initialText={
          voiceTarget === 'management'
            ? managementReplyText
            : voiceTarget === 'agentReply'
            ? agentReplyText
            : agentNotesText
        }
      />

      {/* Print Modal */}
      <PrintCaseModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        caseItem={caseItem}
        timeline={timeline}
      />
    </div>
  );
};
