/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Download,
  Printer,
  Users,
  TrendingUp,
  UserCheck,
  CheckCircle2,
  Clock,
  FolderKanban,
  ArrowUpRight,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  BrainCircuit,
} from 'lucide-react';
import { Case, User } from '../types';
import { exportCasesToExcel } from '../utils/export';
import { CrmLogo } from '../components/EtaLogo';
import { Sparkline } from '../components/SkeletonLoader';
import { isCaseOwnedByUser, isCaseOverdue72Hours } from '../services/caseService';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface ReportsPageProps {
  cases: Case[];
  allUsers: User[];
  currentUser?: User;
  onNavigateToMyCases?: () => void;
  onOpenAiInsights?: () => void;
}

const normStr = (val?: string) => (val || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const ReportsPage: React.FC<ReportsPageProps> = ({
  cases,
  allUsers,
  currentUser,
  onNavigateToMyCases,
  onOpenAiInsights,
}) => {
  const { language, isRtl } = useThemeLanguage();
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('all');
  const [showAllStaff, setShowAllStaff] = useState(false);

  // Filter cases by date
  const filteredCases = useMemo(() => {
    const now = new Date();
    return cases.filter((c) => {
      if (dateFilter === 'all') return true;
      const d = new Date(c.createdAt);
      if (dateFilter === 'today') return d.toDateString() === now.toDateString();
      if (dateFilter === 'week') return d >= new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      if (dateFilter === 'month') return d >= new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      if (dateFilter === 'year') return d >= new Date(now.getTime() - 365 * 24 * 3600 * 1000);
      return true;
    });
  }, [cases, dateFilter]);

  // Personal Performance Metrics (especially for Call Agents & active staff)
  const personalPerformance = useMemo(() => {
    if (!currentUser) return null;

    const uId = normStr(currentUser.id);
    const uUsername = normStr(currentUser.username);
    const uCrm = normStr(currentUser.crmUser);
    const uName = normStr(currentUser.fullName);

    const matchesUser = (idVal?: string, crmVal?: string, nameVal?: string) => {
      const nId = normStr(idVal);
      const nCrm = normStr(crmVal);
      const nName = normStr(nameVal);
      return (
        (uId && nId === uId) ||
        (uUsername && nId === uUsername) ||
        (uCrm && (nCrm === uCrm || nId === uCrm)) ||
        (uName && nName === uName)
      );
    };

    const createdCases = filteredCases.filter((c) =>
      matchesUser(c.createdById, c.createdByCrmUser, c.createdByName)
    );
    const ownedOpenCases = filteredCases.filter(
      (c) => c.status !== 'مغلقة' && isCaseOwnedByUser(c, currentUser)
    );
    const overdueCount = ownedOpenCases.filter((c) => isCaseOverdue72Hours(c)).length;

    const escalatedCases = createdCases.filter(
      (c) =>
        c.status === 'محولة للإدارة' ||
        c.status === 'محولة للدعم الفني' ||
        c.status === 'محولة للدعم التقني'
    );

    const handledMap = new Map<string, Case>();
    filteredCases.forEach((c) => {
      const involved =
        matchesUser(c.createdById, c.createdByCrmUser, c.createdByName) ||
        isCaseOwnedByUser(c, currentUser) ||
        matchesUser(c.assignedTo, undefined, c.assignedToName) ||
        matchesUser(c.closedBy, undefined, c.closedByName);
      if (involved) {
        handledMap.set(c.id, c);
      }
    });

    const handledList = Array.from(handledMap.values());
    const closedCount = handledList.filter(
      (c) =>
        c.status === 'مغلقة' &&
        (matchesUser(c.closedBy, undefined, c.closedByName) ||
          isCaseOwnedByUser(c, currentUser) ||
          matchesUser(c.createdById, c.createdByCrmUser, c.createdByName))
    ).length;

    const completionRate =
      handledList.length > 0 ? Math.round((closedCount / handledList.length) * 100) : 0;

    // Personal service breakdown
    const serviceCounts: Record<string, number> = {};
    handledList.forEach((c) => {
      if (c.serviceType) {
        serviceCounts[c.serviceType] = (serviceCounts[c.serviceType] || 0) + 1;
      }
    });
    const topServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return {
      registeredCount: createdCases.length,
      openOwnedCount: ownedOpenCases.length,
      overdueCount,
      escalatedCount: escalatedCases.length,
      closedCount,
      totalHandled: handledList.length,
      completionRate,
      topServices,
    };
  }, [filteredCases, currentUser]);

  // Agent & Staff Performance Table (matching by id, username, crmUser, OR normalized fullName)
  const agentPerformance = useMemo(() => {
    interface AgentStat {
      key: string;
      userId: string;
      fullName: string;
      crmUser: string;
      role: string;
      registeredCount: number;
      openOwnedCount: number;
      totalClosed: number;
      handledCaseIds: Set<string>;
      isCurrentUser: boolean;
    }

    const statsList: AgentStat[] = [];
    const keyLookup = new Map<string, AgentStat>();

    const registerKeys = (stat: AgentStat, keys: (string | undefined)[]) => {
      keys.forEach((k) => {
        const nk = normStr(k);
        if (nk && !keyLookup.has(nk)) {
          keyLookup.set(nk, stat);
        }
      });
    };

    const seedUser = (u: User) => {
      const existing =
        keyLookup.get(normStr(u.id)) ||
        keyLookup.get(normStr(u.username)) ||
        keyLookup.get(normStr(u.crmUser)) ||
        keyLookup.get(normStr(u.fullName));
      if (existing) return existing;

      const isMe =
        !!currentUser &&
        (normStr(u.id) === normStr(currentUser.id) ||
          normStr(u.username) === normStr(currentUser.username) ||
          normStr(u.crmUser) === normStr(currentUser.crmUser));

      const stat: AgentStat = {
        key: u.id || u.username || u.fullName,
        userId: u.id,
        fullName: u.fullName,
        crmUser: u.crmUser,
        role: u.role,
        registeredCount: 0,
        openOwnedCount: 0,
        totalClosed: 0,
        handledCaseIds: new Set<string>(),
        isCurrentUser: isMe,
      };
      statsList.push(stat);
      registerKeys(stat, [u.id, u.username, u.crmUser, u.fullName]);
      return stat;
    };

    if (currentUser) {
      seedUser(currentUser);
    }
    allUsers.forEach(seedUser);

    const resolveOrCreateStat = (
      idVal?: string,
      crmVal?: string,
      nameVal?: string
    ): AgentStat | null => {
      const existing =
        (idVal && keyLookup.get(normStr(idVal))) ||
        (crmVal && keyLookup.get(normStr(crmVal))) ||
        (nameVal && keyLookup.get(normStr(nameVal)));
      if (existing) return existing;

      const displayName = (nameVal || crmVal || idVal || '').trim();
      if (!displayName) return null;

      const fallback: AgentStat = {
        key: `fallback_${normStr(displayName)}`,
        userId: idVal || '',
        fullName: displayName,
        crmUser: (crmVal || '—').trim(),
        role: 'agent',
        registeredCount: 0,
        openOwnedCount: 0,
        totalClosed: 0,
        handledCaseIds: new Set<string>(),
        isCurrentUser: false,
      };
      statsList.push(fallback);
      registerKeys(fallback, [idVal, crmVal, nameVal]);
      return fallback;
    };

    filteredCases.forEach((c) => {
      const creator = resolveOrCreateStat(
        c.createdById,
        c.createdByCrmUser,
        c.createdByName
      );
      if (creator) {
        creator.registeredCount++;
        creator.handledCaseIds.add(c.id);
      }

      const assignee = resolveOrCreateStat(c.assignedTo, undefined, c.assignedToName);
      if (assignee) {
        assignee.handledCaseIds.add(c.id);
        if (c.status !== 'مغلقة') {
          assignee.openOwnedCount++;
        }
      } else if (creator && c.status !== 'مغلقة') {
        const isPooledToQueue =
          c.status === 'محولة للإدارة' ||
          c.status === 'محولة للدعم الفني' ||
          c.status === 'محولة للدعم التقني';
        if (!isPooledToQueue) {
          creator.openOwnedCount++;
        }
      }

      if (c.status === 'مغلقة') {
        const closer = resolveOrCreateStat(c.closedBy, undefined, c.closedByName) || assignee || creator;
        if (closer) {
          closer.totalClosed++;
          closer.handledCaseIds.add(c.id);
        }
      }
    });

    const mapped = statsList.map((s) => ({
      ...s,
      totalHandled: s.handledCaseIds.size,
    }));

    return mapped
      .filter((s) =>
        showAllStaff
          ? true
          : s.isCurrentUser || s.totalHandled > 0 || s.totalClosed > 0
      )
      .sort((a, b) => {
        if (a.isCurrentUser && !b.isCurrentUser) return -1;
        if (!a.isCurrentUser && b.isCurrentUser) return 1;
        return b.totalHandled - a.totalHandled;
      });
  }, [filteredCases, allUsers, currentUser, showAllStaff]);

  // Service distribution
  const serviceDistribution = useMemo(() => {
    const map: Record<string, { count: number; taxType: string }> = {};
    filteredCases.forEach((c) => {
      if (!map[c.serviceType]) {
        map[c.serviceType] = { count: 1, taxType: c.taxType };
      } else {
        map[c.serviceType].count++;
      }
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [filteredCases]);

  const total = filteredCases.length;
  const closed = filteredCases.filter((c) => c.status === 'مغلقة').length;
  const rate = total > 0 ? Math.round((closed / total) * 100) : 0;

  const periodLabel =
    dateFilter === 'today'
      ? 'اليوم'
      : dateFilter === 'week'
      ? 'آخر 7 أيام'
      : dateFilter === 'month'
      ? 'آخر 30 يوم'
      : dateFilter === 'year'
      ? 'آخر سنة'
      : 'كافة الفترات';

  const handleExportPdf = () => {
    window.print();
  };

  const handleExportExcel = () => {
    exportCasesToExcel(filteredCases, `تقرير_مركز_الاتصال_${dateFilter}.xlsx`, {
      periodLabel,
      total,
      closed,
      rate,
      staffStats: agentPerformance.map((s) => ({
        fullName: s.fullName,
        crmUser: s.crmUser,
        roleLabel:
          s.role === 'super_admin'
            ? 'مدير النظام'
            : s.role === 'management'
            ? 'مدير إدارة'
            : s.role === 'technical_support'
            ? 'دعم تقني'
            : 'وكيل اتصال',
        totalHandled: s.totalHandled,
        openOwnedCount: s.openOwnedCount,
        totalClosed: s.totalClosed,
        closeRate: s.totalHandled > 0 ? Math.round((s.totalClosed / s.totalHandled) * 100) : 0,
      })),
    });
  };

  return (
    <div className="space-y-5 text-start animate-fade-up" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Printable Report Header */}
      <div className="hidden print:flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">برنامج إدارة خدمة العملاء CRM</h1>
          <p className="text-sm font-bold text-slate-700">تقرير مؤشرات الأداء التشغيلي (KPIs)</p>
          <p className="text-xs text-slate-500">
            الفترة:{' '}
            {dateFilter === 'today'
              ? 'اليوم'
              : dateFilter === 'week'
              ? 'آخر 7 أيام'
              : dateFilter === 'month'
              ? 'آخر 30 يوماً'
              : dateFilter === 'year'
              ? 'آخر سنة'
              : 'كافة الفترات'}{' '}
            · تاريخ الاستخراج: {new Date().toLocaleString('ar-EG')}
          </p>
        </div>
        <CrmLogo size={60} />
      </div>

      {/* Header */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
            {language === 'ar'
              ? 'تقارير ومؤشرات الأداء التشغيلي (KPIs)'
              : 'Operational Reports & KPI Analytics'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            {language === 'ar'
              ? 'إحصائيات إنجاز الحالات، إنتاجية وكلاء الاتصال، ومؤشرات أدائك الشخصي والخدمات الأكثر استفساراً'
              : 'Case resolution metrics, call agent productivity, personal KPIs, and top services'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="bg-slate-100 dark:bg-[#071629] p-1 rounded-xl flex flex-wrap text-xs font-bold border border-slate-200 dark:border-[#00386B]">
            {(['today', 'week', 'month', 'year', 'all'] as const).map((p) => {
              const label =
                p === 'today'
                  ? language === 'ar'
                    ? 'اليوم'
                    : 'Today'
                  : p === 'week'
                  ? language === 'ar'
                    ? 'الأسبوع'
                    : 'Week'
                  : p === 'month'
                  ? language === 'ar'
                    ? 'الشهر'
                    : 'Month'
                  : p === 'year'
                  ? language === 'ar'
                    ? 'السنة'
                    : 'Year'
                  : language === 'ar'
                  ? 'الكل'
                  : 'All';
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDateFilter(p)}
                  className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                    dateFilter === p
                      ? 'bg-[#004B87] text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-colors active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <span>{language === 'ar' ? 'تصدير Excel' : 'Export Excel'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3.5 py-2 bg-[#004B87] hover:bg-[#00386B] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-white" />
            <span>{language === 'ar' ? 'تصدير PDF' : 'Export PDF'}</span>
          </button>

          {onOpenAiInsights && currentUser?.role !== 'agent' && (
            <button
              type="button"
              onClick={onOpenAiInsights}
              className="px-3.5 py-2 bg-[#00264D] hover:bg-[#001A35] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 border border-[#004B87] transition-all active:scale-95 cursor-pointer"
            >
              <BrainCircuit className="w-4 h-4 text-[#00E676]" />
              <span>{language === 'ar' ? 'التحليل الذكي بالـ AI' : 'AI Insights'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Personal Performance Report Card (Always visible for Call Agents & Logged-in Staff) */}
      {currentUser && personalPerformance && (
        <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-[#004B87]/40 dark:border-[#004B87] shadow-saas overflow-hidden">
          <div className="bg-[#00264D] p-4 sm:p-5 text-white flex flex-wrap items-center justify-between gap-3 border-b border-[#004B87]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#00A651] text-white shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-sm sm:text-base text-white">
                    {language === 'ar'
                      ? 'مؤشرات وتقارير أدائي الشخصي'
                      : 'My Personal Performance Report'}
                  </h2>
                  <span className="px-2 py-0.5 rounded-lg bg-[#004B87] text-[#00E676] text-[11px] font-bold">
                    {currentUser.role === 'agent'
                      ? language === 'ar'
                        ? 'وكيل اتصال'
                        : 'Call Agent'
                      : currentUser.role === 'super_admin'
                      ? language === 'ar'
                        ? 'مدير النظام'
                        : 'System Admin'
                      : language === 'ar'
                      ? 'الإدارة والدعم التقني'
                      : 'Management & Tech Support'}
                  </span>
                </div>
                <p className="text-xs text-sky-200 mt-0.5">
                  {currentUser.fullName} · <span className="font-mono">{currentUser.crmUser}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {personalPerformance.overdueCount > 0 && onNavigateToMyCases && (
                <button
                  type="button"
                  onClick={onNavigateToMyCases}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    {language === 'ar'
                      ? `${personalPerformance.overdueCount} متأخرة (+72س)`
                      : `${personalPerformance.overdueCount} Overdue (+72h)`}
                  </span>
                </button>
              )}
              {onNavigateToMyCases && (
                <button
                  type="button"
                  onClick={onNavigateToMyCases}
                  className="px-3 py-1.5 rounded-xl bg-[#004B87] hover:bg-[#0062B0] text-white text-xs font-bold flex items-center gap-1 transition-colors print:hidden"
                >
                  <span>{language === 'ar' ? 'الحالات المفتوحة بحسابي' : 'My Open Cases'}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] flex items-end justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <FolderKanban className="w-3.5 h-3.5 text-[#004B87] dark:text-sky-300" />
                    <span>{language === 'ar' ? 'الحالات المسجلة بواسطتي' : 'Registered by Me'}</span>
                  </span>
                  <div className="text-2xl font-black text-[#004B87] dark:text-sky-300 font-mono tabular-nums mt-1.5">
                    {personalPerformance.registeredCount}
                  </div>
                </div>
                <Sparkline
                  data={[1, 2, 2, 4, 3, 5, Math.max(personalPerformance.registeredCount, 2)]}
                  color="#004B87"
                  id="my-reg"
                />
              </div>

              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 flex items-end justify-between">
                <div>
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'المفتوحة حالياً بحسابي' : 'Open in My Account'}</span>
                  </span>
                  <div className="text-2xl font-black text-amber-700 dark:text-amber-300 font-mono tabular-nums mt-1.5">
                    {personalPerformance.openOwnedCount}
                  </div>
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-300/80 font-semibold">
                    {language === 'ar'
                      ? `محولة للإدارة/الدعم: ${personalPerformance.escalatedCount}`
                      : `Escalated: ${personalPerformance.escalatedCount}`}
                  </span>
                </div>
                <Sparkline
                  data={[1, 2, 1, 3, 2, 2, Math.max(personalPerformance.openOwnedCount, 1)]}
                  color="#d97706"
                  id="my-open"
                />
              </div>

              <div className="p-4 rounded-xl bg-[#E6F7EF]/80 dark:bg-[#003324]/60 border border-[#00A651]/30 flex items-end justify-between">
                <div>
                  <span className="text-[11px] font-bold text-[#008742] dark:text-[#00E676] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'الحالات المنجزة والمغلقة' : 'Resolved & Closed'}</span>
                  </span>
                  <div className="text-2xl font-black text-[#00A651] dark:text-[#00E676] font-mono tabular-nums mt-1.5">
                    {personalPerformance.closedCount}
                  </div>
                </div>
                <Sparkline
                  data={[1, 2, 3, 3, 4, 5, Math.max(personalPerformance.closedCount, 2)]}
                  color="#00A651"
                  id="my-closed"
                />
              </div>

              <div className="p-4 rounded-xl bg-[#EBF4FC] dark:bg-[#002B54] border border-[#004B87]/35 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#004B87] dark:text-sky-200">
                    {language === 'ar' ? 'معدل الإنجاز الشخصي' : 'Personal Completion Rate'}
                  </span>
                  <span className="text-xl font-black text-[#00264D] dark:text-white font-mono tabular-nums">
                    {personalPerformance.completionRate}%
                  </span>
                </div>
                <div className="mt-2">
                  <div className="w-full h-2.5 rounded-full bg-white dark:bg-[#071629] overflow-hidden border border-[#004B87]/20">
                    <div
                      className="h-full bg-[#00A651] rounded-full transition-all duration-500"
                      style={{ width: `${personalPerformance.completionRate}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-sky-200/80 mt-1.5 font-mono tabular-nums">
                    {language === 'ar'
                      ? `إجمالي الحالات التي تعاملت معها: ${personalPerformance.totalHandled}`
                      : `Total cases handled: ${personalPerformance.totalHandled}`}
                  </div>
                </div>
              </div>
            </div>

            {personalPerformance.topServices.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-[#00386B] flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  {language === 'ar' ? 'أبرز الخدمات التي تعاملت معها:' : 'Your Top Handled Services:'}
                </span>
                {personalPerformance.topServices.map(([srv, count]) => (
                  <span
                    key={srv}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-800 dark:text-slate-200 font-semibold"
                  >
                    {srv}{' '}
                    <span className="font-mono font-bold text-[#00A651] dark:text-[#00E676] tabular-nums">
                      ({count})
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Center-Wide KPI Cards with Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex items-end justify-between hover:-translate-y-0.5 transition-all">
          <div>
            <span className="text-slate-500 dark:text-slate-400 font-bold text-xs">
              {language === 'ar' ? 'إجمالي الحالات خلال الفترة (المركز)' : 'Total Center Cases'}
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
                {total}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-bold text-[#00A651] dark:text-[#00E676] tabular-nums">
                <TrendingUp className="w-3 h-3" />
                +14.2%
              </span>
            </div>
          </div>
          <Sparkline data={[3, 6, 5, 8, 9, 11, Math.max(total, 10)]} color="#004B87" id="rep-total" />
        </div>

        <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex items-end justify-between hover:-translate-y-0.5 transition-all">
          <div>
            <span className="text-slate-500 dark:text-slate-400 font-bold text-xs">
              {language === 'ar' ? 'الحالات المنجزة والمغلقة (المركز)' : 'Center Closed Cases'}
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-[#00A651] dark:text-[#00E676] font-mono tabular-nums">
                {closed}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-bold text-[#00A651] dark:text-[#00E676] tabular-nums">
                <TrendingUp className="w-3 h-3" />
                +19.5%
              </span>
            </div>
          </div>
          <Sparkline data={[2, 4, 4, 7, 8, 9, Math.max(closed, 8)]} color="#00A651" id="rep-closed" />
        </div>

        <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex items-end justify-between hover:-translate-y-0.5 transition-all">
          <div>
            <span className="text-slate-500 dark:text-slate-400 font-bold text-xs">
              {language === 'ar' ? 'معدل الإنجاز العام' : 'Overall Resolution Rate'}
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-[#004B87] dark:text-sky-300 font-mono tabular-nums">
                {rate}%
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-bold text-[#004B87] dark:text-sky-300 tabular-nums">
                <TrendingUp className="w-3 h-3" />
                +6.8%
              </span>
            </div>
          </div>
          <Sparkline data={[60, 68, 72, 75, 80, 84, Math.max(rate, 78)]} color="#0284c7" id="rep-rate" />
        </div>
      </div>

      {/* Agent Performance Table */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-[#00386B] flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-[#004B87] dark:text-sky-300" />
            <span>
              {language === 'ar'
                ? 'إنتاجية ومؤشرات أداء وكلاء الاتصال وموظفي المركز'
                : 'Call Agents & Staff Performance Metrics'}
            </span>
          </h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAllStaff((prev) => !prev)}
              className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-[#071629] hover:bg-[#EBF4FC] dark:hover:bg-[#002B54] text-xs font-bold text-[#004B87] dark:text-sky-300 border border-slate-200 dark:border-[#00386B] transition-colors print:hidden"
            >
              {showAllStaff
                ? language === 'ar'
                  ? 'عرض أصحاب النشاط وحسابي'
                  : 'Active & Me Only'
                : language === 'ar'
                ? 'عرض كافة الموظفين والوكلاء'
                : 'Show All Staff'}
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {language === 'ar' ? 'عدد الموظفين:' : 'Staff:'} {agentPerformance.length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-[#00264D] text-white border-b border-[#004B87] text-[11px]">
              <tr>
                <th className="p-3.5">{language === 'ar' ? 'اسم الموظف' : 'Employee Name'}</th>
                <th className="p-3.5">{language === 'ar' ? 'كود CRM' : 'CRM Code'}</th>
                <th className="p-3.5">{language === 'ar' ? 'الوظيفة' : 'Role'}</th>
                <th className="p-3.5 text-center">
                  {language === 'ar' ? 'الحالات المسجلة والمتابعة' : 'Handled Cases'}
                </th>
                <th className="p-3.5 text-center">
                  {language === 'ar' ? 'المفتوحة حالياً' : 'Currently Open'}
                </th>
                <th className="p-3.5 text-center">
                  {language === 'ar' ? 'الحالات المغلقة' : 'Closed Cases'}
                </th>
                <th className="p-3.5 text-center">
                  {language === 'ar' ? 'نسبة الإغلاق' : 'Close Rate'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]/70">
              {agentPerformance.map((a) => {
                const individualRate =
                  a.totalHandled > 0 ? Math.round((a.totalClosed / a.totalHandled) * 100) : 0;

                return (
                  <tr
                    key={a.key}
                    className={`transition-colors ${
                      a.isCurrentUser
                        ? 'bg-[#E6F7EF]/65 dark:bg-[#003324]/45 hover:bg-[#E6F7EF] dark:hover:bg-[#003324]/70'
                        : 'hover:bg-[#EBF4FC] dark:hover:bg-[#002B54]'
                    }`}
                  >
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span>{a.fullName}</span>
                        {a.isCurrentUser && (
                          <span className="px-2 py-0.5 rounded-md bg-[#00A651] text-white text-[10px] font-black">
                            {language === 'ar' ? 'حسابك' : 'You'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-[#004B87] dark:text-sky-300 tabular-nums">
                      {a.crmUser}
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300 font-medium">
                      {a.role === 'agent'
                        ? language === 'ar'
                          ? 'وكيل اتصال'
                          : 'Call Agent'
                        : a.role === 'management' || a.role === 'technical_support'
                        ? language === 'ar'
                          ? 'الإدارة والدعم التقني'
                          : 'Management & Tech Support'
                        : language === 'ar'
                        ? 'مدير نظام'
                        : 'System Admin'}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                      {a.totalHandled}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                      {a.openOwnedCount}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-[#00A651] dark:text-[#00E676] tabular-nums">
                      {a.totalClosed}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold tabular-nums">
                      <span
                        className={
                          individualRate >= 70
                            ? 'text-[#00A651] dark:text-[#00E676]'
                            : individualRate >= 40
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {individualRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}

              {agentPerformance.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {language === 'ar'
                      ? 'لا توجد بيانات نشاط للموظفين خلال الفترة المحددة'
                      : 'No staff activity data in this timeframe'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Services Breakdown */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-[#00386B]">
          <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#00A651]" />
            <span>
              {language === 'ar'
                ? 'توزيع الاستفسارات حسب الخدمات الضريبية'
                : 'Inquiries Breakdown by Tax Service'}
            </span>
          </h3>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {serviceDistribution.map(([srv, data]) => (
            <div
              key={srv}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] flex items-center justify-between hover:border-[#004B87] transition-colors"
            >
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-100 block">{srv}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                  {data.taxType}
                </span>
              </div>
              <div className="text-left font-mono tabular-nums">
                <span className="font-bold text-sm text-[#004B87] dark:text-[#00E676]">
                  {data.count}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  ({total > 0 ? Math.round((data.count / total) * 100) : 0}%)
                </span>
              </div>
            </div>
          ))}

          {serviceDistribution.length === 0 && (
            <div className="md:col-span-2 text-center py-6 text-slate-400">
              {language === 'ar'
                ? 'لا توجد حالات مسجلة خلال الفترة المحددة'
                : 'No cases recorded in this timeframe'}
            </div>
          )}
        </div>
      </div>

      {/* Cases Log with Case Timestamp (Included in Screen & PDF Print Reports) */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-[#00386B] flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#004B87] dark:text-[#00E676]" />
            <span>
              {language === 'ar'
                ? 'سجل الحالات وتوقيت التسجيل التفصيلي'
                : 'Detailed Cases Log & Timestamps'}
            </span>
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {language === 'ar' ? 'عدد الحالات:' : 'Cases:'} {filteredCases.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-[#00264D] text-white border-b border-[#004B87] text-[11px]">
              <tr>
                <th className="p-3">{language === 'ar' ? 'رقم الحالة' : 'Case ID'}</th>
                <th className="p-3">{language === 'ar' ? 'تاريخ الحالة' : 'Date'}</th>
                <th className="p-3">{language === 'ar' ? 'توقيت الحالة' : 'Case Time'}</th>
                <th className="p-3">{language === 'ar' ? 'الممول' : 'Taxpayer'}</th>
                <th className="p-3">{language === 'ar' ? 'الضريبة والخدمة' : 'Tax & Service'}</th>
                <th className="p-3">{language === 'ar' ? 'نوع الحالة' : 'Status'}</th>
                <th className="p-3">{language === 'ar' ? 'المسؤول' : 'Assigned To'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]/70">
              {filteredCases.slice(0, 100).map((c) => {
                const created = new Date(c.createdAt);
                return (
                  <tr key={c.id} className="hover:bg-[#EBF4FC] dark:hover:bg-[#002B54]">
                    <td className="p-3 font-mono font-bold text-[#004B87] dark:text-sky-300 whitespace-nowrap tabular-nums">
                      {c.caseId}
                    </td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                      {created.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}
                    </td>
                    <td
                      dir="ltr"
                      className="p-3 font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap tabular-nums text-start"
                    >
                      {created.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                      {c.taxpayerName || c.callerName || '—'}
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">
                      {c.taxType} · {c.serviceType}
                    </td>
                    <td className="p-3 whitespace-nowrap font-bold text-[#004B87] dark:text-sky-300">
                      {c.status}
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {c.assignedToName || c.createdByName || '—'}
                    </td>
                  </tr>
                );
              })}

              {filteredCases.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400">
                    {language === 'ar'
                      ? 'لا توجد حالات مسجلة خلال الفترة المحددة'
                      : 'No cases recorded in this timeframe'}
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
