/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Send,
  Headphones,
  Wrench,
  Users,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  BellRing,
  ClipboardList,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  RotateCcw,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { User, NotificationItem } from '../types';
import {
  sendTargetedAdminNotifications,
  subscribeToSentAdminNotifications,
  subscribeToAllNotificationsForAdmin,
  resetNotificationsForFreshSend,
  deleteSentNotificationBatch,
  deleteSelectedNotifications,
} from '../services/caseService';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import { StyledTextarea } from './StyledTextarea';

interface SendNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
}

type AudienceMode = 'agents' | 'management' | 'both' | 'custom';
type ModalTab = 'compose' | 'sent_log' | 'account_notifs';

interface GroupedNotificationBatch {
  batchKey: string;
  title: string;
  message: string;
  senderName: string;
  senderUsername?: string;
  createdAt: string;
  items: NotificationItem[];
  acknowledgedCount: number;
  totalCount: number;
}

export const SendNotificationModal: React.FC<SendNotificationModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers,
}) => {
  const { language, isRtl } = useThemeLanguage();
  const modalRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<ModalTab>('compose');
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('agents');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sent Log state
  const [sentItems, setSentItems] = useState<NotificationItem[]>([]);
  const [expandedBatchKey, setExpandedBatchKey] = useState<string | null>(null);
  const [logFilterScope, setLogFilterScope] = useState<'all' | 'mine'>('all');
  const [logSearch, setLogSearch] = useState('');

  // Super Admin Reset & Multi-Select Delete Notifications state
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetScope, setResetScope] = useState<'all' | 'admin_notices'>('all');
  const [isResetting, setIsResetting] = useState(false);
  const [confirmDeleteBatchKey, setConfirmDeleteBatchKey] = useState<string | null>(null);
  const [deletingBatchKey, setDeletingBatchKey] = useState<string | null>(null);

  // Super Admin multi-select sent batches
  const [selectedBatchKeys, setSelectedBatchKeys] = useState<string[]>([]);
  const [confirmDeleteSelectedBatches, setConfirmDeleteSelectedBatches] = useState(false);
  const [isDeletingSelectedBatches, setIsDeletingSelectedBatches] = useState(false);

  // Super Admin all account notifications tab
  const [allSystemNotifications, setAllSystemNotifications] = useState<NotificationItem[]>([]);
  const [accountNotifSearch, setAccountNotifSearch] = useState('');
  const [accountNotifTypeFilter, setAccountNotifTypeFilter] = useState<'all' | 'admin_notice' | 'case' | 'overdue_alert'>('all');
  const [selectedAccountNotifIds, setSelectedAccountNotifIds] = useState<string[]>([]);
  const [confirmDeleteAccountNotifs, setConfirmDeleteAccountNotifs] = useState(false);
  const [isDeletingAccountNotifs, setIsDeletingAccountNotifs] = useState(false);

  const isSuperAdmin = currentUser.role === 'super_admin';
  const canAccess =
    isSuperAdmin ||
    currentUser.role === 'management' ||
    currentUser.role === 'technical_support';

  useEffect(() => {
    if (isOpen) {
      setActiveTab('compose');
      setAudienceMode('agents');
      setSelectedUserIds([]);
      setTitle('');
      setMessage('');
      setErrorMsg(null);
      setSuccessMsg(null);
      setIsSending(false);
      setExpandedBatchKey(null);
      setIsResetConfirmOpen(false);
      setResetScope('all');
      setIsResetting(false);
      setConfirmDeleteBatchKey(null);
      setDeletingBatchKey(null);
      setSelectedBatchKeys([]);
      setConfirmDeleteSelectedBatches(false);
      setIsDeletingSelectedBatches(false);
      setAccountNotifSearch('');
      setAccountNotifTypeFilter('all');
      setSelectedAccountNotifIds([]);
      setConfirmDeleteAccountNotifs(false);
      setIsDeletingAccountNotifs(false);
      modalRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen]);

  // Subscribe to sent admin notifications log while modal is open
  useEffect(() => {
    if (!isOpen || !canAccess) return;
    const unsub = subscribeToSentAdminNotifications((items) => {
      setSentItems(items);
    });
    return () => unsub();
  }, [isOpen, canAccess]);

  // Subscribe to all system notifications across accounts for Super Admin selection & deletion
  useEffect(() => {
    if (!isOpen || !isSuperAdmin) return;
    const unsub = subscribeToAllNotificationsForAdmin((items) => {
      setAllSystemNotifications(items);
    });
    return () => unsub();
  }, [isOpen, isSuperAdmin]);

  // Deduplicated active staff grouped cleanly by role (excluding self)
  const { agentUsers, managementUsers } = useMemo(() => {
    const active = allUsers.filter(
      (u) => u.status === 'active' && u.id !== currentUser.id && u.username !== currentUser.username
    );
    const seen = new Set<string>();
    const unique: User[] = [];
    for (const u of active) {
      const key = `${u.username}:${u.role}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(u);
      }
    }
    return {
      agentUsers: unique.filter((u) => u.role === 'agent'),
      managementUsers: unique.filter(
        (u) => u.role === 'management' || u.role === 'technical_support' || u.role === 'super_admin'
      ),
    };
  }, [allUsers, currentUser.id, currentUser.username]);

  const resolvedRecipients = useMemo(() => {
    if (audienceMode === 'agents') return agentUsers;
    if (audienceMode === 'management') return managementUsers;
    if (audienceMode === 'both') return [...agentUsers, ...managementUsers];
    const selectedSet = new Set(selectedUserIds);
    return [...agentUsers, ...managementUsers].filter((u) => selectedSet.has(u.id));
  }, [audienceMode, agentUsers, managementUsers, selectedUserIds]);

  const usersNameMap = useMemo(() => {
    const map = new Map<string, User>();
    allUsers.forEach((u) => {
      if (u.username) map.set(u.username, u);
      if (u.crmUser) map.set(u.crmUser, u);
    });
    return map;
  }, [allUsers]);

  // Group sent notification documents into logical batches
  const groupedBatches = useMemo<GroupedNotificationBatch[]>(() => {
    const groups = new Map<string, GroupedNotificationBatch>();
    for (const item of sentItems) {
      const batchKey =
        item.batchId || `${item.title}__${item.senderName || ''}__${(item.createdAt || '').slice(0, 16)}`;
      if (!groups.has(batchKey)) {
        groups.set(batchKey, {
          batchKey,
          title: item.title,
          message: item.message,
          senderName: item.senderName || 'الإدارة',
          senderUsername: item.senderUsername,
          createdAt: item.createdAt,
          items: [],
          acknowledgedCount: 0,
          totalCount: 0,
        });
      }
      const g = groups.get(batchKey)!;
      g.items.push(item);
      g.totalCount++;
      if (item.acknowledged || item.isRead) {
        g.acknowledgedCount++;
      }
    }

    const q = logSearch.trim().toLowerCase();
    return Array.from(groups.values())
      .filter((g) => {
        if (logFilterScope === 'mine') {
          const matchesUser =
            g.senderUsername === currentUser.username || g.senderName === currentUser.fullName;
          if (!matchesUser) return false;
        }
        if (q) {
          return (
            g.title.toLowerCase().includes(q) ||
            g.message.toLowerCase().includes(q) ||
            g.senderName.toLowerCase().includes(q) ||
            g.items.some((i) =>
              (i.recipientName || i.recipientUsername || '').toLowerCase().includes(q)
            )
          );
        }
        return true;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [sentItems, logFilterScope, logSearch, currentUser.username, currentUser.fullName]);

  const filteredAccountNotifs = useMemo(() => {
    const q = accountNotifSearch.trim().toLowerCase();
    return allSystemNotifications.filter((n) => {
      if (accountNotifTypeFilter === 'admin_notice' && n.type !== 'admin_notice') return false;
      if (accountNotifTypeFilter === 'overdue_alert' && n.type !== 'overdue_alert') return false;
      if (
        accountNotifTypeFilter === 'case' &&
        (n.type === 'admin_notice' || n.type === 'overdue_alert')
      ) {
        return false;
      }
      if (q) {
        const targetUser = usersNameMap.get(n.recipientUsername);
        const recipientLabel = `${n.recipientName || ''} ${n.recipientUsername || ''} ${targetUser?.fullName || ''} ${targetUser?.crmUser || ''}`.toLowerCase();
        return (
          (n.title || '').toLowerCase().includes(q) ||
          (n.message || '').toLowerCase().includes(q) ||
          (n.senderName || '').toLowerCase().includes(q) ||
          (n.caseId || '').toLowerCase().includes(q) ||
          recipientLabel.includes(q)
        );
      }
      return true;
    });
  }, [allSystemNotifications, accountNotifSearch, accountNotifTypeFilter, usersNameMap]);

  useEffect(() => {
    const validKeys = new Set(groupedBatches.map((b) => b.batchKey));
    setSelectedBatchKeys((prev) => prev.filter((k) => validKeys.has(k)));
  }, [groupedBatches]);

  useEffect(() => {
    const validIds = new Set(allSystemNotifications.map((n) => n.id));
    setSelectedAccountNotifIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [allSystemNotifications]);

  if (!isOpen || !canAccess) return null;

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const selectGroupInCustom = (group: User[]) => {
    const ids = group.map((u) => u.id);
    setSelectedUserIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearGroupInCustom = (group: User[]) => {
    const ids = new Set(group.map((u) => u.id));
    setSelectedUserIds((prev) => prev.filter((id) => !ids.has(id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!title.trim() || !message.trim()) {
      setErrorMsg(
        language === 'ar'
          ? 'يرجى إدخال عنوان الإشعار ونص الرسالة.'
          : 'Please enter notification title and message.'
      );
      return;
    }

    if (resolvedRecipients.length === 0) {
      setErrorMsg(
        language === 'ar'
          ? 'لا يوجد موظفون مستهدفون في الفئة المختارة.'
          : 'No active recipients in the selected audience.'
      );
      return;
    }

    setIsSending(true);
    try {
      const count = await sendTargetedAdminNotifications({
        recipients: resolvedRecipients,
        title: title.trim(),
        message: message.trim(),
        sender: currentUser,
      });
      setSuccessMsg(
        language === 'ar'
          ? `تم إرسال الإشعار بنجاح إلى (${count}) موظف، وتم حفظه في سجل الإشعارات المرسلة.`
          : `Notification successfully sent to ${count} staff members.`
      );
      setTitle('');
      setMessage('');
      if (audienceMode === 'custom') setSelectedUserIds([]);
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر إرسال الإشعار.');
    } finally {
      setIsSending(false);
    }
  };

  const handleResetAllNotifications = async () => {
    if (!isSuperAdmin || isResetting) return;
    setIsResetting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const deletedCount = await resetNotificationsForFreshSend(currentUser, resetScope);
      setIsResetConfirmOpen(false);
      setExpandedBatchKey(null);
      setConfirmDeleteBatchKey(null);
      setActiveTab('compose');
      setSuccessMsg(
        language === 'ar'
          ? deletedCount > 0
            ? `تم تصفير وحذف (${deletedCount}) إشعار من السجل والحسابات بنجاح، يمكنك الآن البدء في إرسال جديد.`
            : 'السجل والحسابات مصفّرة بالفعل ولا توجد إشعارات حالية، يمكنك البدء في إرسال جديد.'
          : deletedCount > 0
          ? `Successfully reset and cleared ${deletedCount} notification(s). Ready for fresh sending.`
          : 'Notifications are already clear and ready for fresh sending.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تصفير الإشعارات.');
      setIsResetConfirmOpen(false);
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteBatch = async (batch: GroupedNotificationBatch) => {
    if (!isSuperAdmin || deletingBatchKey) return;
    setDeletingBatchKey(batch.batchKey);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const deletedCount = await deleteSentNotificationBatch(
        batch.items.map((i) => i.id),
        batch.title,
        currentUser
      );
      setConfirmDeleteBatchKey(null);
      if (expandedBatchKey === batch.batchKey) setExpandedBatchKey(null);
      setSuccessMsg(
        language === 'ar'
          ? `تم حذف الإشعار "${batch.title}" من السجل وحسابات الموظفين (${deletedCount} سجل).`
          : `Deleted notice "${batch.title}" (${deletedCount} records).`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر حذف الإشعار.');
    } finally {
      setDeletingBatchKey(null);
    }
  };

  const toggleBatchSelection = (batchKey: string) => {
    setConfirmDeleteSelectedBatches(false);
    setSelectedBatchKeys((prev) =>
      prev.includes(batchKey) ? prev.filter((k) => k !== batchKey) : [...prev, batchKey]
    );
  };

  const handleToggleSelectAllBatches = () => {
    setConfirmDeleteSelectedBatches(false);
    const visibleKeys = groupedBatches.map((b) => b.batchKey);
    const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedBatchKeys.includes(k));
    setSelectedBatchKeys(allSelected ? [] : visibleKeys);
  };

  const handleDeleteSelectedBatches = async () => {
    if (!isSuperAdmin || selectedBatchKeys.length === 0 || isDeletingSelectedBatches) return;
    setIsDeletingSelectedBatches(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const selectedSet = new Set(selectedBatchKeys);
      const selectedBatches = groupedBatches.filter((b) => selectedSet.has(b.batchKey));
      const idsToDelete = selectedBatches.flatMap((b) => b.items.map((i) => i.id));
      const deletedCount = await deleteSelectedNotifications(
        idsToDelete,
        currentUser,
        `حذف ${selectedBatches.length} إشعار مرسل من السجل`
      );
      setSelectedBatchKeys([]);
      setConfirmDeleteSelectedBatches(false);
      setSuccessMsg(
        language === 'ar'
          ? `تم حذف (${selectedBatches.length}) إشعار مرسل بإجمالي (${deletedCount}) سجل من السجل وحسابات المستلمين.`
          : `Deleted ${selectedBatches.length} selected batch(es) (${deletedCount} records).`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر حذف الإشعارات المحددة.');
    } finally {
      setIsDeletingSelectedBatches(false);
    }
  };

  const toggleAccountNotifSelection = (id: string) => {
    setConfirmDeleteAccountNotifs(false);
    setSelectedAccountNotifIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllAccountNotifs = () => {
    setConfirmDeleteAccountNotifs(false);
    const visibleIds = filteredAccountNotifs.map((n) => n.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedAccountNotifIds.includes(id));
    setSelectedAccountNotifIds(allSelected ? [] : visibleIds);
  };

  const handleDeleteSelectedAccountNotifs = async () => {
    if (!isSuperAdmin || selectedAccountNotifIds.length === 0 || isDeletingAccountNotifs) return;
    setIsDeletingAccountNotifs(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const deletedCount = await deleteSelectedNotifications(
        selectedAccountNotifIds,
        currentUser,
        'إدارة إشعارات الحسابات'
      );
      setSelectedAccountNotifIds([]);
      setConfirmDeleteAccountNotifs(false);
      setSuccessMsg(
        language === 'ar'
          ? `تم حذف (${deletedCount}) إشعار محدد من حسابات المستخدمين بنجاح.`
          : `Deleted ${deletedCount} selected notification(s).`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر حذف الإشعارات المحددة.');
    } finally {
      setIsDeletingAccountNotifs(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 overflow-y-auto">
      <div
        ref={modalRef}
        tabIndex={-1}
        dir={isRtl ? 'rtl' : 'ltr'}
        className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#004B87] w-full max-w-3xl my-auto max-h-[92dvh] overflow-hidden flex flex-col animate-scale-in text-start focus:outline-none"
      >
        {/* Header */}
        <div className="bg-[#00264D] p-4 text-white flex items-center justify-between border-b border-[#004B87] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#00A651] text-white shadow-xs">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm text-white">
                {language === 'ar'
                  ? 'مركز الإشعارات الإدارية والتقنية الموجهة'
                  : 'Targeted Staff Notification Center'}
              </h2>
              <p className="text-[11px] text-sky-200">
                {language === 'ar'
                  ? 'إرسال إشعارات إلزامية للموظفين ومتابعة إقرار القراءة والموافقة'
                  : 'Send mandatory staff notices and track acknowledgment status'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sky-200 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2 bg-slate-50 dark:bg-[#071629] border-b border-slate-200 dark:border-[#00386B] shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('compose')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'compose'
                  ? 'bg-[#004B87] text-white shadow-xs'
                  : 'bg-white dark:bg-[#0B1D35] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#00386B] hover:border-[#004B87]'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال إشعار جديد</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sent_log')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'sent_log'
                  ? 'bg-[#00A651] text-white shadow-xs'
                  : 'bg-white dark:bg-[#0B1D35] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#00386B] hover:border-[#00A651]'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>سجل الإشعارات المرسلة</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                  activeTab === 'sent_log'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-[#071629] text-slate-700 dark:text-sky-300'
                }`}
              >
                {groupedBatches.length}
              </span>
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('account_notifs')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'account_notifs'
                    ? 'bg-[#00264D] text-white shadow-xs border border-[#00A651]'
                    : 'bg-white dark:bg-[#0B1D35] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#00386B] hover:border-[#004B87]'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>إدارة إشعارات الحسابات</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                    activeTab === 'account_notifs'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-[#071629] text-slate-700 dark:text-sky-300'
                  }`}
                >
                  {allSystemNotifications.length}
                </span>
              </button>
            )}
          </div>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                setResetScope('all');
                setIsResetConfirmOpen(true);
              }}
              className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-600 text-rose-700 dark:text-rose-300 hover:text-white border border-rose-300 dark:border-rose-700 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              title={
                language === 'ar'
                  ? 'تصفير جميع الإشعارات المرسلة والموجودة بالحسابات لبدء إرسال جديد'
                  : 'Reset all sent & account notifications for fresh sending'
              }
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'تصفير الإشعارات' : 'Reset Notifications'}</span>
            </button>
          )}
        </div>

        {/* Super Admin Inline Reset Confirmation Panel */}
        {isSuperAdmin && isResetConfirmOpen && (
          <div className="p-4 bg-rose-50/95 dark:bg-rose-950/60 border-b-2 border-rose-400 dark:border-rose-600 text-xs space-y-3 shrink-0 animate-scale-in">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-900 dark:text-rose-100 font-black">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>
                  {language === 'ar'
                    ? 'تأكيد تصفير الإشعارات لبدء إرسال جديد (صلاحية الأدمن)'
                    : 'Confirm Resetting Notifications for Fresh Sending (Admin Only)'}
                </span>
              </div>
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setIsResetConfirmOpen(false)}
                className="text-rose-700 dark:text-rose-300 hover:text-rose-950 p-1 rounded-lg cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 transition-colors ${
                  resetScope === 'all'
                    ? 'bg-white dark:bg-[#0B1D35] border-rose-500 shadow-xs'
                    : 'bg-white/60 dark:bg-[#071629]/60 border-rose-200 dark:border-rose-800'
                }`}
              >
                <input
                  type="radio"
                  name="notifResetScope"
                  checked={resetScope === 'all'}
                  onChange={() => setResetScope('all')}
                  className="mt-0.5 accent-rose-600"
                />
                <div>
                  <div className="font-black text-slate-900 dark:text-white">
                    تصفير شامل (المرسلة + الموجودة بجميع الحسابات)
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    يحذف كافة الإشعارات المرسلة وكل التنبيهات والإشعارات الموجودة داخل حسابات الموظفين.
                  </div>
                </div>
              </label>

              <label
                className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 transition-colors ${
                  resetScope === 'admin_notices'
                    ? 'bg-white dark:bg-[#0B1D35] border-rose-500 shadow-xs'
                    : 'bg-white/60 dark:bg-[#071629]/60 border-rose-200 dark:border-rose-800'
                }`}
              >
                <input
                  type="radio"
                  name="notifResetScope"
                  checked={resetScope === 'admin_notices'}
                  onChange={() => setResetScope('admin_notices')}
                  className="mt-0.5 accent-rose-600"
                />
                <div>
                  <div className="font-black text-slate-900 dark:text-white">
                    تصفير الإشعارات الإدارية المرسلة فقط
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    يحذف سجل التعميمات الإدارية المرسلة ومن حسابات المستلمين مع إبقاء تنبيهات الحالات.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#00386B] text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleResetAllNotifications}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting ? 'جارٍ التصفير والحذف...' : 'تأكيد التصفير الآن'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Compose */}
        {activeTab === 'compose' ? (
          <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-900 dark:text-rose-200 font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-[#003324] border border-emerald-200 dark:border-[#00A651] rounded-xl text-emerald-900 dark:text-[#00E676] font-bold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-[#00E676]" />
                  <span>{successMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('sent_log')}
                  className="underline font-black text-[11px] shrink-0 cursor-pointer"
                >
                  عرض السجل
                </button>
              </div>
            )}

            {/* Audience Selector */}
            <div className="space-y-2">
              <label className="font-black text-slate-800 dark:text-white block">
                {language === 'ar' ? '1. اختر الفئة المستهدفة بالإشعار *' : '1. Select Target Audience *'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setAudienceMode('agents')}
                  className={`p-3 rounded-xl border text-start transition-all flex flex-col gap-1.5 cursor-pointer ${
                    audienceMode === 'agents'
                      ? 'bg-[#004B87] text-white border-[#004B87] shadow-sm'
                      : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B] hover:border-[#004B87]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Headphones className="w-4 h-4 text-[#00E676]" />
                    <span className="font-mono font-bold text-[11px] tabular-nums">
                      {agentUsers.length}
                    </span>
                  </div>
                  <span className="font-bold text-[11px]">
                    {language === 'ar' ? 'وكلاء الاتصال' : 'Call Agents'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAudienceMode('management')}
                  className={`p-3 rounded-xl border text-start transition-all flex flex-col gap-1.5 cursor-pointer ${
                    audienceMode === 'management'
                      ? 'bg-[#004B87] text-white border-[#004B87] shadow-sm'
                      : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B] hover:border-[#004B87]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Wrench className="w-4 h-4 text-[#00E676]" />
                    <span className="font-mono font-bold text-[11px] tabular-nums">
                      {managementUsers.length}
                    </span>
                  </div>
                  <span className="font-bold text-[11px]">
                    {language === 'ar' ? 'الإدارة والدعم التقني' : 'Mgmt & Tech Support'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAudienceMode('both')}
                  className={`p-3 rounded-xl border text-start transition-all flex flex-col gap-1.5 cursor-pointer ${
                    audienceMode === 'both'
                      ? 'bg-[#00A651] text-white border-[#00A651] shadow-sm'
                      : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B] hover:border-[#00A651]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Users className="w-4 h-4" />
                    <span className="font-mono font-bold text-[11px] tabular-nums">
                      {agentUsers.length + managementUsers.length}
                    </span>
                  </div>
                  <span className="font-bold text-[11px]">
                    {language === 'ar' ? 'جميع الموظفين' : 'All Staff'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAudienceMode('custom')}
                  className={`p-3 rounded-xl border text-start transition-all flex flex-col gap-1.5 cursor-pointer ${
                    audienceMode === 'custom'
                      ? 'bg-[#00264D] text-white border-[#00A651] shadow-sm'
                      : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B] hover:border-[#004B87]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <UserCheck className="w-4 h-4 text-amber-400" />
                    <span className="font-mono font-bold text-[11px] tabular-nums">
                      {selectedUserIds.length}
                    </span>
                  </div>
                  <span className="font-bold text-[11px]">
                    {language === 'ar' ? 'موظفون محددون' : 'Specific Staff'}
                  </span>
                </button>
              </div>
            </div>

            {/* Custom staff checklist grouped by role */}
            {audienceMode === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-[#071629] rounded-xl border border-slate-200 dark:border-[#00386B]">
                {/* Agents column */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#00386B] pb-1.5">
                    <span className="font-bold text-[#004B87] dark:text-sky-300 flex items-center gap-1">
                      <Headphones className="w-3.5 h-3.5" />
                      وكلاء الاتصال ({agentUsers.length})
                    </span>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => selectGroupInCustom(agentUsers)}
                        className="text-[#00A651] font-bold hover:underline cursor-pointer"
                      >
                        الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => clearGroupInCustom(agentUsers)}
                        className="text-slate-400 hover:text-rose-500 font-bold cursor-pointer"
                      >
                        مسح
                      </button>
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {agentUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-[#0B1D35] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={() => toggleUserSelection(u.id)}
                          className="accent-[#00A651] w-3.5 h-3.5"
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {u.fullName}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 ms-auto">
                          {u.crmUser}
                        </span>
                      </label>
                    ))}
                    {agentUsers.length === 0 && (
                      <div className="text-[11px] text-slate-400 py-2">لا يوجد وكلاء نشطون</div>
                    )}
                  </div>
                </div>

                {/* Management & Tech Support column */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#00386B] pb-1.5">
                    <span className="font-bold text-[#004B87] dark:text-[#00E676] flex items-center gap-1">
                      <Wrench className="w-3.5 h-3.5" />
                      الإدارة والدعم التقني والإشراف ({managementUsers.length})
                    </span>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => selectGroupInCustom(managementUsers)}
                        className="text-[#00A651] font-bold hover:underline cursor-pointer"
                      >
                        الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => clearGroupInCustom(managementUsers)}
                        className="text-slate-400 hover:text-rose-500 font-bold cursor-pointer"
                      >
                        مسح
                      </button>
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {managementUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-[#0B1D35] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={() => toggleUserSelection(u.id)}
                          className="accent-[#00A651] w-3.5 h-3.5"
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {u.fullName}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 ms-auto">
                          {u.crmUser}
                        </span>
                      </label>
                    ))}
                    {managementUsers.length === 0 && (
                      <div className="text-[11px] text-slate-400 py-2">لا يوجد أعضاء إدارة نشطون</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Notification Title */}
            <div>
              <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                {language === 'ar' ? '2. عنوان الإشعار *' : '2. Notification Title *'}
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'مثال: تنبيه إداري هام بشأن مواعيد الإقرارات الضريبية'
                    : 'Enter notification title...'
                }
                className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-bold text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#0B1D35] focus:ring-2 focus:ring-[#00A651] focus:outline-none"
              />
            </div>

            {/* Notification Body */}
            <div>
              <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                {language === 'ar' ? '3. نص الإشعار والتوجيهات *' : '3. Notification Message *'}
              </label>
              <StyledTextarea
                rows={4}
                required
                maxLength={600}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'اكتب تفاصيل الإشعار أو التعليمات المراد إرسالها... (سيظهر في منتصف شاشة الموظف ويتطلب الإقرار والموافقة)'
                    : 'Write notification message details...'
                }
                className="w-full p-3 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#0B1D35] focus:ring-2 focus:ring-[#00A651] focus:outline-none leading-relaxed"
              />
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-[#00386B] flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] font-bold text-[#004B87] dark:text-[#00E676]">
                {language === 'ar'
                  ? `عدد المستلمين المحددين: ${resolvedRecipients.length} موظف`
                  : `Target Recipients: ${resolvedRecipients.length} staff`}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071629] rounded-xl font-bold transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'إغلاق' : 'Close'}
                </button>
                <button
                  type="submit"
                  disabled={isSending || resolvedRecipients.length === 0}
                  className="px-5 py-2.5 bg-[#00A651] hover:bg-[#008742] text-white font-black rounded-xl shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isSending
                      ? language === 'ar'
                        ? 'جارٍ الإرسال...'
                        : 'Sending...'
                      : language === 'ar'
                      ? 'إرسال الإشعار الآن'
                      : 'Send Notification'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        ) : activeTab === 'sent_log' ? (
          /* Tab 2: Sent Notifications Log */
          <div className="p-4 overflow-y-auto flex-1 space-y-3 text-xs">
            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-900 dark:text-rose-200 font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-[#003324] border border-emerald-200 dark:border-[#00A651] rounded-xl text-emerald-900 dark:text-[#00E676] font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-[#00E676]" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-[#071629] p-2.5 rounded-xl border border-slate-200 dark:border-[#00386B]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="بحث في عنوان الإشعار، المحتوى، المرسل أو المستلم..."
                  className="w-full ps-8 pe-3 py-1.5 bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#00A651]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLogFilterScope('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer transition-colors ${
                    logFilterScope === 'all'
                      ? 'bg-[#004B87] text-white'
                      : 'bg-white dark:bg-[#0B1D35] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#00386B]'
                  }`}
                >
                  جميع الإشعارات
                </button>
                <button
                  type="button"
                  onClick={() => setLogFilterScope('mine')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer transition-colors ${
                    logFilterScope === 'mine'
                      ? 'bg-[#00A651] text-white'
                      : 'bg-white dark:bg-[#0B1D35] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#00386B]'
                  }`}
                >
                  مرسلة بواسطتي
                </button>
              </div>
            </div>

            {isSuperAdmin && groupedBatches.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B]">
                <label className="flex items-center gap-2 font-bold text-[#004B87] dark:text-sky-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={
                      groupedBatches.length > 0 &&
                      groupedBatches.every((b) => selectedBatchKeys.includes(b.batchKey))
                    }
                    onChange={handleToggleSelectAllBatches}
                    className="w-4 h-4 accent-rose-600 cursor-pointer"
                  />
                  <span>تحديد الكل للحذف ({groupedBatches.length})</span>
                </label>

                {selectedBatchKeys.length > 0 &&
                  (confirmDeleteSelectedBatches ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isDeletingSelectedBatches}
                        onClick={handleDeleteSelectedBatches}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] disabled:opacity-50 cursor-pointer"
                      >
                        {isDeletingSelectedBatches
                          ? 'جارٍ الحذف...'
                          : `تأكيد حذف المحدد (${selectedBatchKeys.length})`}
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingSelectedBatches}
                        onClick={() => setConfirmDeleteSelectedBatches(false)}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#00386B] text-slate-700 dark:text-slate-200 font-bold text-[11px] cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteSelectedBatches(true)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الإشعارات المحددة ({selectedBatchKeys.length})</span>
                    </button>
                  ))}
              </div>
            )}

            {groupedBatches.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-bold">لا توجد إشعارات مرسلة مسجلة حتى الآن</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {groupedBatches.map((batch) => {
                  const isExpanded = expandedBatchKey === batch.batchKey;
                  const isBatchSelected = selectedBatchKeys.includes(batch.batchKey);
                  const pct =
                    batch.totalCount > 0
                      ? Math.round((batch.acknowledgedCount / batch.totalCount) * 100)
                      : 0;
                  return (
                    <div
                      key={batch.batchKey}
                      className={`rounded-xl border overflow-hidden shadow-xs transition-colors ${
                        isBatchSelected
                          ? 'border-rose-500 bg-rose-50/40 dark:bg-rose-950/25'
                          : 'border-slate-200 dark:border-[#00386B] bg-white dark:bg-[#071629]'
                      }`}
                    >
                      <div className="p-3.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            {isSuperAdmin && (
                              <input
                                type="checkbox"
                                checked={isBatchSelected}
                                onChange={() => toggleBatchSelection(batch.batchKey)}
                                className="mt-1 w-4 h-4 accent-rose-600 shrink-0 cursor-pointer"
                                aria-label={`تحديد ${batch.title}`}
                              />
                            )}
                            <div className="min-w-0">
                              <h4 className="font-black text-sm text-[#00264D] dark:text-white truncate">
                                {batch.title}
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                المرسل: <strong className="text-[#004B87] dark:text-sky-300">{batch.senderName}</strong> •{' '}
                                <span className="font-mono tabular-nums">
                                  {new Date(batch.createdAt).toLocaleString('ar-EG', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isSuperAdmin &&
                              (confirmDeleteBatchKey === batch.batchKey ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={deletingBatchKey === batch.batchKey}
                                    onClick={() => handleDeleteBatch(batch)}
                                    className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] disabled:opacity-50 cursor-pointer"
                                  >
                                    {deletingBatchKey === batch.batchKey ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deletingBatchKey === batch.batchKey}
                                    onClick={() => setConfirmDeleteBatchKey(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-[#0B1D35] text-slate-700 dark:text-slate-300 font-bold text-[11px] cursor-pointer"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteBatchKey(batch.batchKey)}
                                  className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 text-rose-600 dark:text-rose-300 hover:text-white border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                                  title="حذف هذا الإشعار من السجل وحسابات المستلمين"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ))}
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedBatchKey(isExpanded ? null : batch.batchKey)
                              }
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#0B1D35] hover:bg-slate-200 dark:hover:bg-[#00264D] text-[#004B87] dark:text-sky-300 font-bold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <span>تفاصيل المستلمين ({batch.totalCount})</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#0B1D35] p-2.5 rounded-lg border border-slate-100 dark:border-[#00386B] whitespace-pre-wrap">
                          {batch.message}
                        </p>

                        {/* Acknowledgment progress */}
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-[#0B1D35] rounded-full overflow-hidden min-w-[140px]">
                            <div
                              className="h-full bg-[#00A651] transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-bold tabular-nums shrink-0">
                            <span className="text-emerald-700 dark:text-[#00E676]">
                              تمت القراءة والموافقة: {batch.acknowledgedCount} / {batch.totalCount} ({pct}%)
                            </span>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-200 dark:border-[#00386B] bg-slate-50 dark:bg-[#0B1D35] p-3 max-h-56 overflow-y-auto space-y-1.5">
                          {batch.items.map((item) => {
                            const targetUser = usersNameMap.get(item.recipientUsername);
                            const displayName =
                              item.recipientName || targetUser?.fullName || item.recipientUsername;
                            const isApproved = Boolean(item.acknowledged || item.isRead);
                            return (
                              <div
                                key={item.id}
                                className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-[11px]"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {displayName}
                                  </span>
                                  {targetUser?.crmUser && (
                                    <span className="font-mono text-[10px] text-slate-400">
                                      {targetUser.crmUser}
                                    </span>
                                  )}
                                </div>
                                {isApproved ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-[#00E676] font-bold">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>
                                      تمت الموافقة{' '}
                                      {item.acknowledgedAt
                                        ? `(${new Date(item.acknowledgedAt).toLocaleString('ar-EG', {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })})`
                                        : ''}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-bold">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>بانتظار القراءة والموافقة</span>
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Tab 3: Super Admin Individual Account Notifications Management */
          <div className="p-4 overflow-y-auto flex-1 space-y-3 text-xs">
            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-900 dark:text-rose-200 font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-[#003324] border border-emerald-200 dark:border-[#00A651] rounded-xl text-emerald-900 dark:text-[#00E676] font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-[#00E676]" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-[#071629] p-2.5 rounded-xl border border-slate-200 dark:border-[#00386B]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={accountNotifSearch}
                  onChange={(e) => setAccountNotifSearch(e.target.value)}
                  placeholder="بحث باسم المستلم، عنوان الإشعار، المحتوى، أو رقم الحالة..."
                  className="w-full ps-8 pe-3 py-1.5 bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#00A651]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ['all', 'الكل'],
                    ['admin_notice', 'تعميمات إدارية'],
                    ['case', 'إشعارات الحالات'],
                    ['overdue_alert', 'تنبيهات تأخر'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAccountNotifTypeFilter(key)}
                    className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer transition-colors ${
                      accountNotifTypeFilter === key
                        ? 'bg-[#004B87] text-white'
                        : 'bg-white dark:bg-[#0B1D35] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#00386B]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredAccountNotifs.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B]">
                <label className="flex items-center gap-2 font-bold text-[#004B87] dark:text-sky-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={
                      filteredAccountNotifs.length > 0 &&
                      filteredAccountNotifs.every((n) => selectedAccountNotifIds.includes(n.id))
                    }
                    onChange={handleToggleSelectAllAccountNotifs}
                    className="w-4 h-4 accent-rose-600 cursor-pointer"
                  />
                  <span>تحديد الكل ({filteredAccountNotifs.length})</span>
                </label>

                {selectedAccountNotifIds.length > 0 &&
                  (confirmDeleteAccountNotifs ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isDeletingAccountNotifs}
                        onClick={handleDeleteSelectedAccountNotifs}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] disabled:opacity-50 cursor-pointer"
                      >
                        {isDeletingAccountNotifs
                          ? 'جارٍ الحذف...'
                          : `تأكيد حذف المحدد (${selectedAccountNotifIds.length})`}
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingAccountNotifs}
                        onClick={() => setConfirmDeleteAccountNotifs(false)}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#00386B] text-slate-700 dark:text-slate-200 font-bold text-[11px] cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAccountNotifs(true)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الإشعارات المحددة ({selectedAccountNotifIds.length})</span>
                    </button>
                  ))}
              </div>
            )}

            {filteredAccountNotifs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500">
                <BellRing className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-bold">لا توجد إشعارات مطابقة في حسابات المستخدمين</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAccountNotifs.map((n) => {
                  const isSelected = selectedAccountNotifIds.includes(n.id);
                  const targetUser = usersNameMap.get(n.recipientUsername);
                  const recipientDisplay =
                    n.recipientName ||
                    targetUser?.fullName ||
                    (n.recipientUsername === 'all' ? 'الجميع' : n.recipientUsername);

                  return (
                    <div
                      key={n.id}
                      onClick={() => toggleAccountNotifSelection(n.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-start gap-2.5 ${
                        isSelected
                          ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/35'
                          : 'border-slate-200 dark:border-[#00386B] bg-white dark:bg-[#071629] hover:border-[#004B87]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAccountNotifSelection(n.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 accent-rose-600 shrink-0 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className="font-black text-xs text-[#00264D] dark:text-white">
                              {n.title}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                n.isRead
                                  ? 'bg-slate-100 dark:bg-[#0B1D35] text-slate-500 dark:text-slate-400'
                                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {n.isRead ? 'مقروء' : 'غير مقروء'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
                            {n.createdAt
                              ? new Date(n.createdAt).toLocaleString('ar-EG', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                          {n.message}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                          <span>
                            المستلم:{' '}
                            <strong className="text-[#004B87] dark:text-sky-300">
                              {recipientDisplay}
                            </strong>
                          </span>
                          {n.senderName && (
                            <span>
                              • المرسل:{' '}
                              <strong className="text-[#00A651] dark:text-[#00E676]">
                                {n.senderName}
                              </strong>
                            </span>
                          )}
                          {n.caseId && n.caseId !== 'ADMIN-NOTICE' && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#0B1D35] text-[#004B87] dark:text-sky-300">
                              {n.caseId}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
