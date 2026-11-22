/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Download,
  Plus,
  RotateCcw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Kanban,
  Eye,
  UserCheck,
  Clock,
  CheckSquare,
  X,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { GoogleSheetsSyncModal } from '../components/GoogleSheetsSyncModal';
import { buildReportSheetTabs } from '../services/googleWorkspaceService';
import { Case, User } from '../types';
import { exportCasesToExcel } from '../utils/export';
import { INCOME_TAX_SERVICES, VAT_SERVICES, OTHER_SERVICE_OPTION } from '../data/taxServices';
import {
  deleteCase,
  claimCase,
  claimMultipleCases,
  canUserClaimCase,
  isCaseOwnedByUser,
  isCaseOverdue72Hours,
} from '../services/caseService';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import {
  StatusBadge,
  PriorityIndicator,
  TableRowsSkeleton,
  KanbanSkeleton,
} from '../components/SkeletonLoader';
import { KanbanBoard } from '../components/KanbanBoard';

import {
  CaseFilterCriteria,
  filterCasesByCriteria,
} from '../utils/caseFilterUtils';
import { paginateItems } from '../utils/paginationUtils';

export interface CasesFilterPreset extends CaseFilterCriteria {
  key: number;
  fromSmartSearch?: boolean;
}

interface CasesPageProps {
  cases: Case[];
  currentUser: User;
  onOpenCase: (caseItem: Case) => void;
  onOpenNewCase: () => void;
  initialStatusFilter?: string;
  filterPreset?: CasesFilterPreset | null;
  isLoadingCases?: boolean;
}

export const CasesPage: React.FC<CasesPageProps> = ({
  cases,
  currentUser,
  onOpenCase,
  onOpenNewCase,
  initialStatusFilter = 'all',
  filterPreset = null,
  isLoadingCases = false,
}) => {
  const { language, isRtl, t } = useThemeLanguage();
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [searchTerm, setSearchTerm] = useState(() => filterPreset?.searchTerm ?? '');
  const [statusFilter, setStatusFilter] = useState<string>(
    () => filterPreset?.status ?? initialStatusFilter
  );
  const [taxTypeFilter, setTaxTypeFilter] = useState<string>(
    () => filterPreset?.taxType ?? 'all'
  );
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>(
    () => filterPreset?.serviceType ?? 'all'
  );
  const [callTypeFilter, setCallTypeFilter] = useState<string>(
    () => filterPreset?.callType ?? 'all'
  );
  const [priorityFilter, setPriorityFilter] = useState<string>(
    () => filterPreset?.priority ?? 'all'
  );
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>(
    () => filterPreset?.datePreset ?? 'all'
  );
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkClaiming, setIsBulkClaiming] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [pendingDeleteCase, setPendingDeleteCase] = useState<Case | null>(null);
  const [isDeletingCase, setIsDeletingCase] = useState(false);
  const [isGoogleSheetsOpen, setIsGoogleSheetsOpen] = useState(false);

  const serviceTypeOptions = useMemo(() => {
    const set = new Set<string>([
      ...INCOME_TAX_SERVICES,
      ...VAT_SERVICES,
      OTHER_SERVICE_OPTION,
    ]);
    cases.forEach((c) => {
      if (c.serviceType && c.serviceType.trim()) {
        set.add(c.serviceType.trim());
      }
    });
    return Array.from(set);
  }, [cases]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (filterPreset) return;
    setStatusFilter(initialStatusFilter);
    setCurrentPage(1);
  }, [initialStatusFilter, filterPreset]);

  useEffect(() => {
    if (!filterPreset) return;
    setSearchTerm(filterPreset.searchTerm ?? '');
    setStatusFilter(filterPreset.status ?? 'all');
    setTaxTypeFilter(filterPreset.taxType ?? 'all');
    setServiceTypeFilter(filterPreset.serviceType ?? 'all');
    setCallTypeFilter(filterPreset.callType ?? 'all');
    setPriorityFilter(filterPreset.priority ?? 'all');
    setDateFilter(filterPreset.datePreset ?? 'all');
    setCurrentPage(1);
  }, [filterPreset]);

  const handlePageChange = (nextPage: number) => {
    setCurrentPage(nextPage);
    const mainEl = pageContainerRef.current?.closest('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  };

  // Filter pipeline
  const filteredCases = useMemo(() => {
    const result = filterCasesByCriteria(cases, {
      status: statusFilter,
      taxType: taxTypeFilter,
      serviceType: serviceTypeFilter,
      callType: callTypeFilter,
      priority: priorityFilter,
      datePreset: dateFilter,
      searchTerm,
    });

    // Sort Order
    result.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [
    cases,
    statusFilter,
    taxTypeFilter,
    serviceTypeFilter,
    callTypeFilter,
    priorityFilter,
    dateFilter,
    searchTerm,
    sortOrder,
  ]);

  // Paginated records (automatically clamps page when filtered list shrinks)
  const pagination = useMemo(
    () => paginateItems(filteredCases, currentPage, pageSize),
    [filteredCases, currentPage, pageSize]
  );
  const totalPages = pagination.totalPages;
  const effectivePage = pagination.currentPage;
  const paginatedCases = pagination.items;

  useEffect(() => {
    if (effectivePage !== currentPage) {
      setCurrentPage(effectivePage);
    }
  }, [effectivePage, currentPage]);

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTaxTypeFilter('all');
    setServiceTypeFilter('all');
    setCallTypeFilter('all');
    setPriorityFilter('all');
    setDateFilter('all');
    setCurrentPage(1);
  };

  const handleExport = () => {
    exportCasesToExcel(
      filteredCases,
      `ETA_CRM_Cases_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const isSuperAdmin = currentUser.role === 'super_admin';
  const canBulkSelectCases =
    currentUser.role === 'management' ||
    currentUser.role === 'technical_support' ||
    currentUser.role === 'super_admin';

  const handleRequestDelete = (e: React.MouseEvent, c: Case) => {
    e.stopPropagation();
    if (!isSuperAdmin) return;
    setActionFeedback(null);
    setPendingDeleteCase(c);
  };

  const handleConfirmDelete = async () => {
    if (!isSuperAdmin || !pendingDeleteCase || isDeletingCase) return;
    setIsDeletingCase(true);
    setActionFeedback(null);
    try {
      await deleteCase(pendingDeleteCase.id, false, currentUser);
      setSelectedIds((prev) => prev.filter((id) => id !== pendingDeleteCase.id));
      setActionFeedback({
        type: 'success',
        message:
          language === 'ar'
            ? `تم أرشفة/حذف الحالة ${pendingDeleteCase.caseId} بنجاح.`
            : `Case ${pendingDeleteCase.caseId} archived successfully.`,
      });
      setPendingDeleteCase(null);
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message:
          err?.message ||
          (language === 'ar' ? 'تعذر أرشفة الحالة.' : 'Failed to archive case.'),
      });
      setPendingDeleteCase(null);
    } finally {
      setIsDeletingCase(false);
    }
  };

  const handleQuickClaim = async (e: React.MouseEvent, c: Case) => {
    e.stopPropagation();
    setActionFeedback(null);
    try {
      setClaimingId(c.id);
      await claimCase(c.id, currentUser);
      setSelectedIds((prev) => prev.filter((id) => id !== c.id));
      setActionFeedback({
        type: 'success',
        message:
          language === 'ar'
            ? `تم سحب الحالة ${c.caseId} إلى حسابك بنجاح.`
            : `Claimed case ${c.caseId} successfully.`,
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message:
          err?.message ||
          (language === 'ar' ? 'فشل سحب الحالة.' : 'Failed to claim case.'),
      });
    } finally {
      setClaimingId(null);
    }
  };

  const claimableOnPage = useMemo(
    () => (canBulkSelectCases ? paginatedCases.filter((c) => canUserClaimCase(c, currentUser)) : []),
    [canBulkSelectCases, paginatedCases, currentUser]
  );

  const allClaimableOnPageSelected =
    claimableOnPage.length > 0 && claimableOnPage.every((c) => selectedIds.includes(c.id));

  const toggleSelectRow = (e: React.MouseEvent | React.ChangeEvent, caseDocId: string) => {
    e.stopPropagation();
    if (!canBulkSelectCases) return;
    setSelectedIds((prev) =>
      prev.includes(caseDocId) ? prev.filter((id) => id !== caseDocId) : [...prev, caseDocId]
    );
  };

  const toggleSelectAllOnPage = () => {
    if (!canBulkSelectCases) return;
    if (allClaimableOnPageSelected) {
      const pageIds = new Set(claimableOnPage.map((c) => c.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const merged = new Set(selectedIds);
      claimableOnPage.forEach((c) => merged.add(c.id));
      setSelectedIds(Array.from(merged));
    }
  };

  const handleBulkClaim = async () => {
    if (!canBulkSelectCases || selectedIds.length === 0 || isBulkClaiming) return;
    setIsBulkClaiming(true);
    setBulkMessage(null);
    try {
      const { claimedCount, skippedCount } = await claimMultipleCases(selectedIds, currentUser);
      setSelectedIds([]);
      setBulkMessage(
        language === 'ar'
          ? skippedCount > 0
            ? `تم سحب (${claimedCount}) حالة إلى حسابك بنجاح، وتخطي (${skippedCount}) حالة غير متاحة للسحب.`
            : `تم سحب (${claimedCount}) حالة إلى حسابك بنجاح للمتابعة والرد والإغلاق.`
          : skippedCount > 0
          ? `Claimed ${claimedCount} case(s); skipped ${skippedCount} ineligible.`
          : `Successfully claimed ${claimedCount} case(s) to your account.`
      );
      setTimeout(() => setBulkMessage(null), 5000);
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message:
          err?.message ||
          (language === 'ar' ? 'تعذر تنفيذ السحب الجماعي للحالات.' : 'Bulk claim failed.'),
      });
    } finally {
      setIsBulkClaiming(false);
    }
  };

  const PrevChevron = isRtl ? ChevronRight : ChevronLeft;
  const NextChevron = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div ref={pageContainerRef} className="space-y-4 text-start animate-fade-up">
      {/* Top Header with View Mode Switcher (Table vs Kanban Pipeline) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas">
        <div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
            {language === 'ar'
              ? 'سجل الحالات ومسار المعالجة'
              : 'CRM Cases Registry & Workflow Pipeline'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            {language === 'ar' ? 'إجمالي الحالات المطابقة:' : 'Total Matching Cases:'}{' '}
            <span className="font-bold text-[#004B87] dark:text-[#00E676] font-mono tabular-nums">
              {filteredCases.length}
            </span>{' '}
            {language === 'ar' ? 'حالة' : 'Cases'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          {/* Segmented View Mode Toggle: Table vs Kanban */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#071629] rounded-xl border border-slate-200 dark:border-[#00386B]">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                viewMode === 'table'
                  ? 'bg-[#004B87] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'جدول البيانات' : 'Data Table'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                viewMode === 'kanban'
                  ? 'bg-[#004B87] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'لوحة المسار (Kanban)' : 'Kanban Pipeline'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-3.5 py-2 bg-slate-100 dark:bg-[#071629] hover:bg-[#E6F7EF] dark:hover:bg-[#00386B] text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all duration-200 border border-slate-200 dark:border-[#004B87] whitespace-nowrap active:scale-95"
              title="Export to Excel / CSV"
            >
              <Download className="w-4 h-4 text-[#00A651]" />
              <span>{language === 'ar' ? 'تصدير Excel' : 'Export CSV'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsGoogleSheetsOpen(true)}
              className="px-3.5 py-2 bg-slate-100 dark:bg-[#071629] hover:bg-[#E6F7EF] dark:hover:bg-[#00386B] text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all duration-200 border border-slate-200 dark:border-[#004B87] whitespace-nowrap active:scale-95 cursor-pointer"
              title="Google Sheets"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#00A651]" />
              <span>Google Sheets</span>
            </button>

            <button
              onClick={onOpenNewCase}
              className="px-4 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all duration-200 hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>{t('newCase')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Solid ETA Filter Control Bar */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              {language === 'ar' ? 'بحث شامل:' : 'Search Cases:'}
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={
                language === 'ar'
                  ? 'رقم الحالة، الممول، الهاتف، العنوان...'
                  : 'Case ID, taxpayer, phone, title...'
              }
              className="w-full p-2 pl-8 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none font-semibold text-slate-800 dark:text-white"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-8" />
          </div>

          {/* Status */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              {language === 'ar' ? 'نوع الحالة:' : 'Case Status:'}
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
            >
              <option value="all">{language === 'ar' ? 'كافة الحالات' : 'All Cases'}</option>
              <option value="open">
                {language === 'ar' ? 'المفتوحة / قيد المعالجة فقط' : 'Open & In Progress'}
              </option>
              <option value="incoming">
                {language === 'ar' ? 'الواردة للإدارة والدعم الفني' : 'Incoming to Mgmt / Tech'}
              </option>
              <option value="جديدة">{language === 'ar' ? 'جديدة' : 'New'}</option>
              <option value="قيد المعالجة">
                {language === 'ar' ? 'قيد المعالجة' : 'In Progress'}
              </option>
              <option value="محولة للإدارة">
                {language === 'ar' ? 'محولة للإدارة' : 'Escalated to Mgmt'}
              </option>
              <option value="محولة للدعم الفني">
                {language === 'ar' ? 'محولة للدعم الفني' : 'Escalated to Tech'}
              </option>
              <option value="محولة لوكيل الاتصال">
                {language === 'ar' ? 'محولة لوكيل الاتصال' : 'Returned to Agent'}
              </option>
              <option value="مغلقة">{language === 'ar' ? 'مغلقة' : 'Closed'}</option>
            </select>
          </div>

          {/* Tax Type */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              {language === 'ar' ? 'نوع الضريبة:' : 'Tax Type:'}
            </label>
            <select
              value={taxTypeFilter}
              onChange={(e) => {
                setTaxTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
            >
              <option value="all">{language === 'ar' ? 'كافة الضرائب' : 'All Tax Types'}</option>
              <option value="ضرائب دخل">{language === 'ar' ? 'ضرائب دخل' : 'Income Tax'}</option>
              <option value="ضرائب قيمة مضافة">
                {language === 'ar' ? 'ضرائب قيمة مضافة' : 'VAT'}
              </option>
            </select>
          </div>

          {/* Call Type */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              {language === 'ar' ? 'نوع الاتصال:' : 'Call Type:'}
            </label>
            <select
              value={callTypeFilter}
              onChange={(e) => {
                setCallTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-semibold text-slate-800 dark:text-white focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
            >
              <option value="all">{language === 'ar' ? 'كافة الأنواع' : 'All Call Types'}</option>
              <option value="استفسار">{language === 'ar' ? 'استفسار' : 'Inquiry'}</option>
              <option value="طلب">{language === 'ar' ? 'طلب' : 'Request'}</option>
              <option value="شكوى">{language === 'ar' ? 'شكوى' : 'Complaint'}</option>
              <option value="رسائل SMS">{language === 'ar' ? 'رسائل SMS' : 'SMS'}</option>
            </select>
          </div>
        </div>

        {/* Secondary Filters & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            {/* Service Type */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold">
                {language === 'ar' ? 'نوع الخدمة:' : 'Service:'}
              </span>
              <select
                value={serviceTypeFilter}
                onChange={(e) => {
                  setServiceTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white max-w-[200px]"
              >
                <option value="all">{language === 'ar' ? 'كافة الخدمات' : 'All Services'}</option>
                {serviceTypeOptions.map((srv) => (
                  <option key={srv} value={srv}>
                    {srv}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold">
                {language === 'ar' ? 'الأولوية:' : 'Priority:'}
              </span>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
              >
                <option value="all">{language === 'ar' ? 'الكل' : 'All'}</option>
                <option value="عادي">{language === 'ar' ? 'عادي' : 'Normal'}</option>
                <option value="هام">{language === 'ar' ? 'هام' : 'Important'}</option>
                <option value="عاجل">{language === 'ar' ? 'عاجل' : 'Urgent'}</option>
              </select>
            </div>

            {/* Date Preset */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold">
                {language === 'ar' ? 'الفترة:' : 'Period:'}
              </span>
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
              >
                <option value="all">{language === 'ar' ? 'كافة التواريخ' : 'All Dates'}</option>
                <option value="today">{language === 'ar' ? 'اليوم' : 'Today'}</option>
                <option value="week">{language === 'ar' ? 'آخر 7 أيام' : 'Last 7 Days'}</option>
                <option value="month">{language === 'ar' ? 'آخر 30 يوماً' : 'Last 30 Days'}</option>
              </select>
            </div>

            {/* Sort Order */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold">
                {language === 'ar' ? 'الترتيب:' : 'Sort:'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                  setCurrentPage(1);
                }}
                className="py-1 px-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 font-bold border border-slate-200 dark:border-slate-700 transition-colors"
              >
                {sortOrder === 'desc'
                  ? language === 'ar'
                    ? 'الأحدث أولاً ↓'
                    : 'Newest First ↓'
                  : language === 'ar'
                  ? 'الأقدم أولاً ↑'
                  : 'Oldest First ↑'}
              </button>
            </div>
          </div>

          <button
            onClick={resetFilters}
            className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'إعادة تعيين الفلاتر' : 'Reset Filters'}</span>
          </button>
        </div>
      </div>

      {/* Action Feedback Banner (Claim / Archive / Error) */}
      {actionFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 animate-scale-in ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            aria-label={language === 'ar' ? 'إغلاق' : 'Dismiss'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content: Either Kanban Pipeline Board OR Smart Data Table */}
      {viewMode === 'kanban' ? (
        isLoadingCases ? (
          <KanbanSkeleton />
        ) : (
          <KanbanBoard
            cases={filteredCases}
            currentUser={currentUser}
            onOpenCase={onOpenCase}
          />
        )
      ) : (
        <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
          {/* Bulk Selection & Claim Action Toolbar (Management, Tech Support & Admin only) */}
          {canBulkSelectCases && (selectedIds.length > 0 || bulkMessage) && (
            <div className="px-4 py-2.5 bg-[#E6F7EF] dark:bg-[#003324]/80 border-b border-[#00A651]/40 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-[#006B34] dark:text-[#00E676]">
                <CheckSquare className="w-4 h-4 shrink-0" />
                {bulkMessage ? (
                  <span>{bulkMessage}</span>
                ) : (
                  <span>
                    {language === 'ar'
                      ? `تم تحديد ${selectedIds.length} حالة للسحب`
                      : `${selectedIds.length} case(s) selected for claim`}
                  </span>
                )}
              </div>
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isBulkClaiming}
                    onClick={handleBulkClaim}
                    className="px-3.5 py-1.5 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>
                      {isBulkClaiming
                        ? language === 'ar'
                          ? 'جارٍ السحب...'
                          : 'Claiming...'
                        : language === 'ar'
                        ? `سحب الحالات المحددة (${selectedIds.length})`
                        : `Claim Selected (${selectedIds.length})`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-[#002B54]"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'إلغاء التحديد' : 'Clear'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-start text-xs min-w-[960px]">
              <thead className="bg-[#00264D] text-white border-b border-[#004B87] text-xs">
                <tr>
                  {canBulkSelectCases && (
                    <th className="p-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allClaimableOnPageSelected}
                        disabled={claimableOnPage.length === 0}
                        onChange={toggleSelectAllOnPage}
                        aria-label={language === 'ar' ? 'تحديد الكل للسحب' : 'Select all claimable'}
                        title={
                          claimableOnPage.length > 0
                            ? language === 'ar'
                              ? 'تحديد كافة الحالات المتاحة للسحب في هذه الصفحة'
                              : 'Select all claimable cases on this page'
                            : language === 'ar'
                            ? 'لا توجد حالات متاحة للسحب في هذه الصفحة'
                            : 'No claimable cases on this page'
                        }
                        className="w-4 h-4 accent-[#00A651] cursor-pointer disabled:opacity-40"
                      />
                    </th>
                  )}
                  <th className="p-3.5">{language === 'ar' ? 'رقم الحالة' : 'Case ID'}</th>
                  <th className="p-3.5">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th className="p-3.5">{language === 'ar' ? 'الضريبة والخدمة' : 'Tax & Service'}</th>
                  <th className="p-3.5">{language === 'ar' ? 'الممول' : 'Taxpayer'}</th>
                  <th className="p-3.5">{language === 'ar' ? 'المتصل' : 'Caller'}</th>
                  <th className="p-3.5">{language === 'ar' ? 'عنوان الحالة' : 'Case Subject'}</th>
                  <th className="p-3.5">{language === 'ar' ? 'الأولوية' : 'Priority'}</th>
                  <th className="p-3.5">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="p-3.5">{language === 'ar' ? 'المسؤول' : 'Assigned To'}</th>
                  <th className="p-3.5 text-center">
                    {language === 'ar' ? 'إجراءات سريعة' : 'Quick Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]/70">
                {isLoadingCases ? (
                  <TableRowsSkeleton rows={8} cols={canBulkSelectCases ? 11 : 10} />
                ) : (
                  paginatedCases.map((c) => {
                    const canQuickClaim = canUserClaimCase(c, currentUser);
                    const isSelected = canBulkSelectCases && selectedIds.includes(c.id);
                    const isOverdueOwned =
                      isCaseOwnedByUser(c, currentUser) && isCaseOverdue72Hours(c);

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
                        {canBulkSelectCases && (
                          <td
                            className="p-3.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!canQuickClaim}
                              onChange={(e) => toggleSelectRow(e, c.id)}
                              aria-label={`Select ${c.caseId}`}
                              title={
                                canQuickClaim
                                  ? language === 'ar'
                                    ? 'تحديد الحالة للسحب'
                                    : 'Select case to claim'
                                  : language === 'ar'
                                  ? 'غير متاحة للسحب حالياً'
                                  : 'Not available to claim'
                              }
                              className="w-4 h-4 accent-[#00A651] cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                            />
                          </td>
                        )}
                        <td className="p-3.5 font-mono font-bold text-[#004B87] dark:text-sky-300 whitespace-nowrap tabular-nums">
                          <div>{c.caseId}</div>
                          {isOverdueOwned && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-sans font-bold text-rose-700 dark:text-rose-400">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{language === 'ar' ? 'متأخرة +72س' : 'Overdue +72h'}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 font-mono text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap tabular-nums">
                          {new Date(c.createdAt).toLocaleDateString(
                            language === 'ar' ? 'ar-EG' : 'en-US'
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {c.taxType}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[160px]">
                            {c.callType} · {c.serviceType}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900 dark:text-white line-clamp-1">
                            {c.taxpayerName || '—'}
                          </div>
                          <div className="font-mono text-slate-600 dark:text-slate-300 text-[11px] tabular-nums">
                            {c.taxRegistrationNumber ||
                              (language === 'ar' ? 'بدون رقم ضريبي' : 'No Tax ID')}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                            {c.callerName}
                          </div>
                          <div className="font-mono text-slate-600 dark:text-slate-300 text-[11px] tabular-nums">
                            {c.callerPhone}
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
                        <td className="p-3.5 whitespace-nowrap text-slate-700 dark:text-slate-300 text-xs">
                          {c.assignedToName || (language === 'ar' ? 'غير مسند' : 'Unassigned')}
                        </td>
                        <td
                          className="p-3.5 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Quick Action Buttons on Hover */}
                          <div className="flex items-center justify-center gap-1.5 opacity-85 group-hover:opacity-100 transition-opacity">
                            {canQuickClaim && (
                              <button
                                type="button"
                                onClick={(e) => handleQuickClaim(e, c)}
                                disabled={claimingId === c.id}
                                className="px-2 py-1 bg-[#E6F7EF] dark:bg-[#00A651]/20 hover:bg-[#00A651] text-[#008742] dark:text-[#00E676] hover:text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                                title={language === 'ar' ? 'سحب الحالة للمتابعة' : 'Claim Case'}
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpenCase(c)}
                              className="px-2.5 py-1 bg-slate-100 dark:bg-[#071629] group-hover:bg-[#004B87] group-hover:text-white rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{language === 'ar' ? 'معاينة' : 'View'}</span>
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={(e) => handleRequestDelete(e, c)}
                                className="p-1.5 hover:bg-rose-500/15 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                                title={
                                  language === 'ar' ? 'أرشفة / حذف الحالة' : 'Archive / Delete Case'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}

                {!isLoadingCases && paginatedCases.length === 0 && (
                  <tr>
                    <td colSpan={canBulkSelectCases ? 11 : 10} className="p-12 text-center text-slate-400 text-xs">
                      {language === 'ar'
                        ? 'لا توجد حالات مسجلة مطابقة لمعايير البحث الحالية'
                        : 'No cases match the current filter criteria'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="p-3.5 bg-slate-50 dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-500 dark:text-slate-400">
              {language === 'ar' ? 'عرض الصفحة' : 'Page'}{' '}
              <span className="font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {effectivePage}
              </span>{' '}
              {language === 'ar' ? 'من' : 'of'}{' '}
              <span className="font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {totalPages}
              </span>{' '}
              ({language === 'ar' ? 'إجمالي' : 'Total'}{' '}
              <span className="font-bold text-[#004B87] dark:text-[#00E676] font-mono tabular-nums">
                {filteredCases.length}
              </span>{' '}
              {language === 'ar' ? 'حالة' : 'cases'})
            </div>

            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white rounded-lg text-xs"
              >
                <option value={10}>{language === 'ar' ? '10 لكل صفحة' : '10 / page'}</option>
                <option value={15}>{language === 'ar' ? '15 لكل صفحة' : '15 / page'}</option>
                <option value={25}>{language === 'ar' ? '25 لكل صفحة' : '25 / page'}</option>
                <option value={50}>{language === 'ar' ? '50 لكل صفحة' : '50 / page'}</option>
              </select>

              <button
                onClick={() => handlePageChange(Math.max(1, effectivePage - 1))}
                disabled={effectivePage <= 1}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <PrevChevron className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePageChange(Math.min(totalPages, effectivePage + 1))}
                disabled={effectivePage >= totalPages}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <NextChevron className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <GoogleSheetsSyncModal
        isOpen={isGoogleSheetsOpen}
        onClose={() => setIsGoogleSheetsOpen(false)}
        title={language === 'ar' ? 'مزامنة الحالات مع Google Sheets' : 'Sync Cases to Google Sheets'}
        subtitle={
          language === 'ar'
            ? `تصدير أو تحديث ${filteredCases.length} حالة في جدول Google Sheets`
            : `Sync ${filteredCases.length} filtered cases to Google Sheets`
        }
        defaultNewSheetName={`ETA_CRM_Cases_${new Date().toISOString().slice(0, 10)}`}
        prepareTabsToWrite={() => buildReportSheetTabs(filteredCases)}
      />

      {pendingDeleteCase &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            onClick={() => !isDeletingCase && setPendingDeleteCase(null)}
            className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border-2 border-rose-500 w-full max-w-md overflow-hidden animate-scale-in text-start"
            >
              <div className="bg-[#00264D] px-5 py-4 text-white flex items-center gap-3 border-b border-[#004B87]">
                <div className="p-2 rounded-xl bg-rose-600 text-white shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-sm">
                    {language === 'ar' ? 'تأكيد أرشفة / حذف الحالة' : 'Confirm Case Archive'}
                  </h2>
                  <p className="text-[11px] text-sky-200 font-mono">
                    {pendingDeleteCase.caseId}
                  </p>
                </div>
              </div>

              <div className="p-5 text-xs text-slate-700 dark:text-slate-200 space-y-2 leading-relaxed">
                <p>
                  {language === 'ar'
                    ? 'هل أنت متأكد من أرشفة هذه الحالة وإزالتها من السجل النشط؟'
                    : 'Are you sure you want to archive this case from the active registry?'}
                </p>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] font-bold text-slate-900 dark:text-white">
                  {pendingDeleteCase.title}
                </div>
              </div>

              <div className="px-5 py-3 bg-slate-50 dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeletingCase}
                  onClick={() => setPendingDeleteCase(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#004B87] text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-[#002B54] cursor-pointer"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={isDeletingCase}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {isDeletingCase
                      ? language === 'ar'
                        ? 'جارٍ الأرشفة...'
                        : 'Archiving...'
                      : language === 'ar'
                      ? 'تأكيد الأرشفة'
                      : 'Confirm Archive'}
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
