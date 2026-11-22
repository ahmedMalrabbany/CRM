/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  BrainCircuit,
  Users,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  Printer,
  TrendingUp,
  ShieldAlert,
  Headphones,
  Wrench,
  ExternalLink,
  X,
  Activity,
  FileWarning,
  Target,
} from 'lucide-react';
import { Case, User } from '../types';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import { StyledTextarea } from '../components/StyledTextarea';
import {
  isCaseOwnedByUser,
  isCaseOverdue72Hours,
  sendTargetedAdminNotifications,
} from '../services/caseService';
import { logAuditEvent } from '../services/auditService';
import {
  AgentMetricsPayload,
  ExecutiveInsightsResult,
  generateExecutiveInsightsWithAI,
} from '../services/geminiService';

interface AiInsightsPageProps {
  cases: Case[];
  allUsers: User[];
  currentUser: User;
  onOpenCase: (c: Case) => void;
}

type InsightsTab = 'overview' | 'agents' | 'issues' | 'alerts';
type DispatchAudience = 'agents' | 'management' | 'both' | 'specific';

interface PendingAlertDraft {
  sourceKey: string;
  title: string;
  message: string;
  audience: DispatchAudience;
  specificUsername?: string;
}

const normStr = (val?: string) => (val || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const AiInsightsPage: React.FC<AiInsightsPageProps> = ({
  cases,
  allUsers,
  currentUser,
  onOpenCase,
}) => {
  const { language, isRtl } = useThemeLanguage();

  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [focusAgentUsername, setFocusAgentUsername] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<InsightsTab>('overview');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<ExecutiveInsightsResult | null>(null);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);

  // Alert dispatch modal state
  const [alertDraft, setAlertDraft] = useState<PendingAlertDraft | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);
  const [sentAlertKeys, setSentAlertKeys] = useState<Record<string, string>>({});

  const isAuthorized =
    currentUser.role === 'super_admin' ||
    currentUser.role === 'management' ||
    currentUser.role === 'technical_support';

  const activeCallAgents = useMemo(() => {
    const map = new Map<string, User>();
    allUsers.forEach((u) => {
      if (u.role === 'agent' && u.status !== 'disabled') {
        map.set(u.username, u);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));
  }, [allUsers]);

  const activeManagementUsers = useMemo(() => {
    const map = new Map<string, User>();
    allUsers.forEach((u) => {
      if (
        (u.role === 'management' || u.role === 'technical_support' || u.role === 'super_admin') &&
        u.status !== 'disabled'
      ) {
        map.set(u.username, u);
      }
    });
    return Array.from(map.values());
  }, [allUsers]);

  const periodCases = useMemo(() => {
    const now = new Date();
    return cases.filter((c) => {
      if (c.isDeleted) return false;
      if (dateFilter === 'all') return true;
      const d = new Date(c.createdAt);
      if (dateFilter === 'today') return d.toDateString() === now.toDateString();
      if (dateFilter === 'week') return d >= new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      if (dateFilter === 'month') return d >= new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      return true;
    });
  }, [cases, dateFilter]);

  const focusedAgentUser = useMemo(
    () => activeCallAgents.find((u) => u.username === focusAgentUsername) || null,
    [activeCallAgents, focusAgentUsername]
  );

  // Per-agent quantitative metrics computed directly from real database cases
  const agentMetricsList = useMemo<AgentMetricsPayload[]>(() => {
    const nowMs = Date.now();

    return activeCallAgents.map((agent) => {
      const aId = normStr(agent.id);
      const aUser = normStr(agent.username);
      const aCrm = normStr(agent.crmUser);
      const aName = normStr(agent.fullName);

      const matchesAgent = (idVal?: string, crmVal?: string, nameVal?: string) => {
        const nId = normStr(idVal);
        const nCrm = normStr(crmVal);
        const nName = normStr(nameVal);
        return (
          (aId && nId === aId) ||
          (aUser && nId === aUser) ||
          (aCrm && (nCrm === aCrm || nId === aCrm)) ||
          (aName && nName === aName)
        );
      };

      const registered = periodCases.filter((c) =>
        matchesAgent(c.createdById, c.createdByCrmUser, c.createdByName)
      );
      const ownedOpen = periodCases.filter(
        (c) => c.status !== 'مغلقة' && isCaseOwnedByUser(c, agent)
      );
      const escalated = registered.filter(
        (c) =>
          c.status === 'محولة للإدارة' ||
          c.status === 'محولة للدعم الفني' ||
          c.status === 'محولة للدعم التقني'
      );
      const overdue72h = ownedOpen.filter((c) => isCaseOverdue72Hours(c, nowMs));

      const handledMap = new Map<string, Case>();
      periodCases.forEach((c) => {
        if (
          matchesAgent(c.createdById, c.createdByCrmUser, c.createdByName) ||
          isCaseOwnedByUser(c, agent) ||
          matchesAgent(c.assignedTo, undefined, c.assignedToName) ||
          matchesAgent(c.closedBy, undefined, c.closedByName)
        ) {
          handledMap.set(c.id, c);
        }
      });

      const handledList = Array.from(handledMap.values());
      const closedCases = handledList.filter(
        (c) =>
          c.status === 'مغلقة' &&
          (matchesAgent(c.closedBy, undefined, c.closedByName) ||
            isCaseOwnedByUser(c, agent) ||
            matchesAgent(c.createdById, c.createdByCrmUser, c.createdByName))
      );

      let resolutionHoursSum = 0;
      let resolutionHoursCount = 0;
      closedCases.forEach((c) => {
        if (c.closedAt && c.createdAt) {
          const diffMs = new Date(c.closedAt).getTime() - new Date(c.createdAt).getTime();
          if (diffMs >= 0) {
            resolutionHoursSum += diffMs / (1000 * 60 * 60);
            resolutionHoursCount++;
          }
        }
      });

      const serviceCounts: Record<string, number> = {};
      handledList.forEach((c) => {
        if (c.serviceType) {
          serviceCounts[c.serviceType] = (serviceCounts[c.serviceType] || 0) + 1;
        }
      });
      const topServices = Object.entries(serviceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([srv]) => srv);

      const closeRatePct =
        handledList.length > 0 ? Math.round((closedCases.length / handledList.length) * 100) : 0;

      return {
        fullName: agent.fullName,
        crmUser: agent.crmUser,
        registeredCount: registered.length,
        openCount: ownedOpen.length,
        escalatedCount: escalated.length,
        overdue72hCount: overdue72h.length,
        closedCount: closedCases.length,
        closeRatePct,
        avgResolutionHours:
          resolutionHoursCount > 0
            ? Math.round((resolutionHoursSum / resolutionHoursCount) * 10) / 10
            : null,
        topServices,
      };
    });
  }, [activeCallAgents, periodCases]);

  // Real-time Common Issues & Services Monitor (always live before & after AI)
  const serviceBreakdown = useMemo(() => {
    const nowMs = Date.now();
    const map = new Map<
      string,
      {
        serviceType: string;
        taxType: string;
        count: number;
        openCount: number;
        escalatedCount: number;
        overdue72hCount: number;
        sampleCaseIds: string[];
      }
    >();

    periodCases.forEach((c) => {
      const key = c.serviceType || 'خدمات ضريبية أخرى';
      if (!map.has(key)) {
        map.set(key, {
          serviceType: key,
          taxType: c.taxType,
          count: 0,
          openCount: 0,
          escalatedCount: 0,
          overdue72hCount: 0,
          sampleCaseIds: [],
        });
      }
      const entry = map.get(key)!;
      entry.count++;
      if (c.status !== 'مغلقة') entry.openCount++;
      if (
        c.status === 'محولة للإدارة' ||
        c.status === 'محولة للدعم الفني' ||
        c.status === 'محولة للدعم التقني'
      ) {
        entry.escalatedCount++;
      }
      if (isCaseOverdue72Hours(c, nowMs)) {
        entry.overdue72hCount++;
      }
      if (entry.sampleCaseIds.length < 4) {
        entry.sampleCaseIds.push(c.caseId);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [periodCases]);

  const summaryStats = useMemo(() => {
    const nowMs = Date.now();
    const totalCases = periodCases.length;
    const closedCases = periodCases.filter((c) => c.status === 'مغلقة').length;
    const openCases = totalCases - closedCases;
    const escalatedCases = periodCases.filter(
      (c) =>
        c.status === 'محولة للإدارة' ||
        c.status === 'محولة للدعم الفني' ||
        c.status === 'محولة للدعم التقني'
    ).length;
    const overdue72hCases = periodCases.filter((c) => isCaseOverdue72Hours(c, nowMs)).length;
    const closeRatePct = totalCases > 0 ? Math.round((closedCases / totalCases) * 100) : 0;

    return {
      totalCases,
      openCases,
      closedCases,
      escalatedCases,
      overdue72hCases,
      closeRatePct,
    };
  }, [periodCases]);

  // Automatic real-time threshold flags (live detection without waiting for AI button)
  const liveRadarAlerts = useMemo(() => {
    const items: Array<{
      key: string;
      severity: 'عاجل' | 'تنبيه';
      title: string;
      description: string;
      audience: DispatchAudience;
      specificUsername?: string;
      suggestedMessage: string;
    }> = [];

    // 1. Flag overdue 72h agents
    agentMetricsList.forEach((ag) => {
      if (ag.overdue72hCount > 0) {
        const matchedUser = activeCallAgents.find((u) => u.crmUser === ag.crmUser);
        items.push({
          key: `live_overdue_${ag.crmUser}`,
          severity: 'عاجل',
          title: `تجاوز مهلة 72 ساعة لدى الوكيل ${ag.fullName}`,
          description: `يوجد (${ag.overdue72hCount}) حالة مفتوحة متأخرة عن 72 ساعة من إجمالي (${ag.openCount}) حالة مفتوحة.`,
          audience: matchedUser ? 'specific' : 'agents',
          specificUsername: matchedUser?.username,
          suggestedMessage: `تنبيه متابعة عاجل: يوجد عدد (${ag.overdue72hCount}) حالة مفتوحة بحسابكم تجاوزت 72 ساعة دون إجراء نهائي. يرجى سرعة المراجعة والرد أو التصعيد وفقاً لضوابط الجودة.`,
        });
      }
    });

    // 2. Flag top recurring problem/service spikes
    serviceBreakdown.slice(0, 5).forEach((srv) => {
      const sharePct =
        summaryStats.totalCases > 0 ? Math.round((srv.count / summaryStats.totalCases) * 100) : 0;
      if (srv.escalatedCount >= 2 || srv.overdue72hCount >= 1 || (srv.count >= 3 && sharePct >= 25)) {
        items.push({
          key: `live_srv_${srv.serviceType}`,
          severity: srv.overdue72hCount > 0 || srv.escalatedCount >= 3 ? 'عاجل' : 'تنبيه',
          title: `ارتفاع معدل الاستفسارات/المشاكل: ${srv.serviceType}`,
          description: `تم رصد (${srv.count}) حالة بنسبة (${sharePct}%) — منها (${srv.escalatedCount}) محولة للإدارة/الدعم و(${srv.overdue72hCount}) متأخرة +72س.`,
          audience: 'both',
          suggestedMessage: `تنبيه رصد تشغيلي: تم رصد تزايد ملحوظ في الاستفسارات والمشاكل الخاصة بخدمة "${srv.serviceType}" (${srv.count} حالة بنسبة ${sharePct}%). يرجى توحيد إجراءات الرد والتنسيق الفوري مع الدعم التقني لسرعة الحل.`,
        });
      }
    });

    return items;
  }, [agentMetricsList, activeCallAgents, serviceBreakdown, summaryStats.totalCases]);

  const casesByCodeMap = useMemo(() => {
    const map = new Map<string, Case>();
    cases.forEach((c) => {
      if (c.caseId) map.set(c.caseId.toUpperCase(), c);
    });
    return map;
  }, [cases]);

  const periodLabel =
    dateFilter === 'today'
      ? 'اليوم'
      : dateFilter === 'week'
      ? 'آخر 7 أيام'
      : dateFilter === 'month'
      ? 'آخر 30 يوم'
      : 'كافة الفترات';

  const handleRunAiAnalysis = async () => {
    if (isAnalyzing) return;
    if (periodCases.length === 0) {
      setAiError('لا توجد حالات مسجلة في الفترة المختارة لتحليلها بالذكاء الاصطناعي.');
      return;
    }

    setIsAnalyzing(true);
    setAiError(null);
    try {
      const relevantAgents = focusedAgentUser
        ? agentMetricsList.filter((a) => a.crmUser === focusedAgentUser.crmUser)
        : agentMetricsList;

      const filteredSampleSource = focusedAgentUser
        ? periodCases.filter(
            (c) =>
              normStr(c.createdByCrmUser) === normStr(focusedAgentUser.crmUser) ||
              normStr(c.createdByName) === normStr(focusedAgentUser.fullName) ||
              isCaseOwnedByUser(c, focusedAgentUser)
          )
        : periodCases;

      const sortedSample = [...filteredSampleSource]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 55)
        .map((c) => ({
          caseId: c.caseId,
          callType: c.callType,
          taxType: c.taxType,
          serviceType: c.serviceType,
          status: c.status,
          priority: c.priority,
          title: c.title,
          agentName: c.agentEmployeeName || c.createdByName,
          agentNotes: c.agentNotes ? c.agentNotes.slice(0, 160) : undefined,
          agentReply: c.agentReply ? c.agentReply.slice(0, 140) : undefined,
          managementReply: c.managementReply ? c.managementReply.slice(0, 140) : undefined,
          isOverdue72h: isCaseOverdue72Hours(c),
        }));

      const res = await generateExecutiveInsightsWithAI({
        periodLabel,
        focusAgentName: focusedAgentUser?.fullName,
        summaryStats,
        agentMetrics: relevantAgents,
        serviceBreakdown: serviceBreakdown.slice(0, 20).map((s) => ({
          serviceType: s.serviceType,
          taxType: s.taxType,
          count: s.count,
          openCount: s.openCount,
          escalatedCount: s.escalatedCount,
          overdue72hCount: s.overdue72hCount,
        })),
        sampleCases: sortedSample,
      });

      setAiResult(res);
      setLastAnalyzedAt(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));

      await logAuditEvent({
        userId: currentUser.id,
        username: currentUser.username,
        fullName: currentUser.fullName,
        role: currentUser.role,
        action: 'تشغيل تحليل الأداء ورصد المشاكل بالـ AI',
        details: `الفترة: ${periodLabel} | عدد الحالات: ${summaryStats.totalCases}${
          focusedAgentUser ? ` | الوكيل: ${focusedAgentUser.fullName}` : ''
        }`,
      });
    } catch (err: unknown) {
      setAiError(
        err instanceof Error ? err.message : 'تعذر إتمام التحليل عبر خدمة الذكاء الاصطناعي.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const openAlertDrawer = (draft: PendingAlertDraft) => {
    setDispatchError(null);
    setDispatchSuccess(null);
    setAlertDraft(draft);
  };

  const handleDispatchAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertDraft || isDispatching) return;

    const cleanTitle = alertDraft.title.trim();
    const cleanMsg = alertDraft.message.trim();
    if (!cleanTitle || !cleanMsg) {
      setDispatchError('يرجى إدخال عنوان التنبيه ونص الإخطار.');
      return;
    }

    let recipients: User[] = [];
    if (alertDraft.audience === 'agents') {
      recipients = activeCallAgents;
    } else if (alertDraft.audience === 'management') {
      recipients = activeManagementUsers.filter((u) => u.username !== currentUser.username);
      if (recipients.length === 0) recipients = activeManagementUsers;
    } else if (alertDraft.audience === 'both') {
      recipients = [...activeCallAgents, ...activeManagementUsers].filter(
        (u) => u.username !== currentUser.username
      );
      if (recipients.length === 0) recipients = [...activeCallAgents, ...activeManagementUsers];
    } else if (alertDraft.audience === 'specific' && alertDraft.specificUsername) {
      const target = activeCallAgents.find((u) => u.username === alertDraft.specificUsername);
      if (target) recipients = [target];
    }

    if (recipients.length === 0) {
      setDispatchError('لا يوجد موظفون نشطون في الفئة المختارة لإرسال الإخطار.');
      return;
    }

    setIsDispatching(true);
    setDispatchError(null);
    try {
      const count = await sendTargetedAdminNotifications({
        recipients,
        title: cleanTitle.slice(0, 100),
        message: cleanMsg.slice(0, 600),
        sender: currentUser,
      });

      const stamp = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      setSentAlertKeys((prev) => ({ ...prev, [alertDraft.sourceKey]: stamp }));
      setDispatchSuccess(
        `تم إرسال الإخطار الرسمي بنجاح إلى (${count}) موظف مع التنبيه الصوتي وإلزام إقرار القراءة.`
      );
      setTimeout(() => {
        setAlertDraft(null);
        setDispatchSuccess(null);
      }, 1500);
    } catch (err: unknown) {
      setDispatchError(err instanceof Error ? err.message : 'تعذر إرسال الإخطار.');
    } finally {
      setIsDispatching(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="p-8 text-center bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-200 dark:border-[#00386B]">
        <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto mb-2" />
        <p className="font-bold text-sm text-slate-800 dark:text-white">
          هذه الصفحة متاحة حصرياً لمدير النظام والإدارة والدعم التقني.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-start animate-fade-up" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Executive Header & Action Bar */}
      <div className="bg-white dark:bg-[#0B1D35] p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00264D] text-[#00E676] shrink-0">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {language === 'ar'
                ? 'مركز الذكاء الاصطناعي لتقييم الأداء ورصد المشاكل'
                : 'AI Agent Evaluation & Common Issues Monitor'}
            </h1>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {language === 'ar'
              ? 'تقييم أداء وكلاء الاتصال، رصد المشاكل والاستفسارات الأكثر شيوعاً، وإرسال إخطارات فورية للفرق المعنية'
              : 'Evaluate call center agents, monitor recurring issues and inquiries, and dispatch instant staff alerts'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-start xl:justify-end print:hidden">
          {/* Period Segmented Selector */}
          <div className="bg-slate-100 dark:bg-[#071629] p-1 rounded-xl flex text-xs font-bold border border-slate-200 dark:border-[#00386B]">
            {(['today', 'week', 'month', 'all'] as const).map((p) => {
              const label =
                p === 'today'
                  ? 'اليوم'
                  : p === 'week'
                  ? '7 أيام'
                  : p === 'month'
                  ? '30 يوم'
                  : 'الكل';
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDateFilter(p)}
                  className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    dateFilter === p
                      ? 'bg-[#004B87] text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Agent Focus Selector */}
          <select
            value={focusAgentUsername}
            onChange={(e) => setFocusAgentUsername(e.target.value)}
            aria-label="تحديد نطاق تقييم الوكلاء"
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00A651]"
          >
            <option value="all">جميع وكلاء الاتصال ({activeCallAgents.length})</option>
            {activeCallAgents.map((ag) => (
              <option key={ag.id} value={ag.username}>
                تركيز: {ag.fullName} ({ag.crmUser})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-slate-100 dark:bg-[#071629] hover:bg-slate-200 dark:hover:bg-[#002B54] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-[#00386B] font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير</span>
          </button>

          <button
            type="button"
            onClick={handleRunAiAnalysis}
            disabled={isAnalyzing}
            className="px-4 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-black text-xs rounded-xl flex items-center gap-2 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>
              {isAnalyzing
                ? 'جارٍ التحليل الذكي بالـ AI...'
                : aiResult
                ? 'تحديث التحليل الذكي'
                : 'تشغيل التحليل الذكي بالـ AI'}
            </span>
          </button>
        </div>
      </div>

      {/* Top Operational Summary Metrics (Tabular Numerals) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white dark:bg-[#0B1D35] p-4 rounded-2xl border border-slate-200 dark:border-[#00386B]">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            إجمالي الحالات ({periodLabel})
          </div>
          <div className="text-2xl font-black text-[#004B87] dark:text-sky-300 font-mono tabular-nums mt-1">
            {summaryStats.totalCases}
          </div>
        </div>

        <div className="bg-white dark:bg-[#0B1D35] p-4 rounded-2xl border border-slate-200 dark:border-[#00386B]">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            وكلاء الاتصال النشطون
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums mt-1">
            {activeCallAgents.length}
          </div>
        </div>

        <div className="bg-white dark:bg-[#0B1D35] p-4 rounded-2xl border border-slate-200 dark:border-[#00386B]">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            معدل الإنجاز والإغلاق
          </div>
          <div className="text-2xl font-black text-[#00A651] dark:text-[#00E676] font-mono tabular-nums mt-1">
            {summaryStats.closeRatePct}%
          </div>
        </div>

        <div className="bg-white dark:bg-[#0B1D35] p-4 rounded-2xl border border-slate-200 dark:border-[#00386B]">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            محولة للإدارة والدعم
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-300 font-mono tabular-nums mt-1">
            {summaryStats.escalatedCases}
          </div>
        </div>

        <div className="bg-white dark:bg-[#0B1D35] p-4 rounded-2xl border border-slate-200 dark:border-[#00386B] col-span-2 lg:col-span-1">
          <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
            حالات متأخرة (+72 ساعة)
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums mt-1">
            {summaryStats.overdue72hCases}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-[#0B1D35] p-1.5 rounded-2xl border border-slate-200 dark:border-[#00386B] print:hidden">
        {(
          [
            { id: 'overview', label: 'الرادار التلقائي والملخص التنفيذي', icon: Activity },
            { id: 'agents', label: 'تقييم أداء وكلاء الاتصال', icon: Users },
            { id: 'issues', label: 'رصد المشاكل والاستفسارات الشائعة', icon: FileWarning },
            { id: 'alerts', label: 'مركز الإخطار والتنبيهات', icon: BellRing },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#00264D] text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071629]'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-[#00E676]' : 'text-[#004B87] dark:text-sky-300'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}

        {lastAnalyzedAt && (
          <span className="ms-auto px-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            آخر تحليل بالـ AI: {lastAnalyzedAt}
          </span>
        )}
      </div>

      {/* Error State Banner */}
      {aiError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{aiError}</span>
          </div>
          <button
            type="button"
            onClick={handleRunAiAnalysis}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Loading Skeleton State during AI Analysis */}
      {isAnalyzing && (
        <div className="bg-white dark:bg-[#0B1D35] p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] space-y-3 animate-pulse">
          <div className="h-4 w-56 bg-slate-200 dark:bg-[#071629] rounded" />
          <div className="h-3 w-full bg-slate-100 dark:bg-[#071629] rounded" />
          <div className="h-3 w-4/5 bg-slate-100 dark:bg-[#071629] rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="h-24 bg-slate-100 dark:bg-[#071629] rounded-xl" />
            <div className="h-24 bg-slate-100 dark:bg-[#071629] rounded-xl" />
            <div className="h-24 bg-slate-100 dark:bg-[#071629] rounded-xl" />
          </div>
        </div>
      )}

      {/* AI Executive Summary Banner (shown when AI analysis has completed) */}
      {!isAnalyzing && aiResult && (
        <div className="bg-[#00264D] text-white p-5 rounded-2xl border border-[#004B87] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-[#00E676]" />
              <h2 className="font-black text-sm text-white">الملخص التنفيذي للذكاء الاصطناعي</h2>
            </div>
            <span className="text-xs font-bold text-sky-200">
              مستوى المخاطر التشغيلية:{' '}
              <strong
                className={
                  aiResult.overallRiskLevel === 'مرتفع'
                    ? 'text-rose-300'
                    : aiResult.overallRiskLevel === 'متوسط'
                    ? 'text-amber-300'
                    : 'text-[#00E676]'
                }
              >
                {aiResult.overallRiskLevel}
              </strong>
            </span>
          </div>
          <p className="text-xs leading-relaxed text-sky-100">{aiResult.executiveSummary}</p>
        </div>
      )}

      {/* TAB 1: OVERVIEW + LIVE AUTOMATED MONITORING RADAR */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {!aiResult && !isAnalyzing && (
            <div className="bg-white dark:bg-[#0B1D35] p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-black text-sm text-slate-900 dark:text-white">
                  التحليل المتعمق وتقييم الجودة بالذكاء الاصطناعي جاهز للتشغيل
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl">
                  يقوم النظام بقراءة مؤشرات وكلاء الاتصال وعينة الحالات المسجلة لتوليد تقييم موضوعي لكل وكيل، واستخلاص المشاكل المتكررة مع أسبابها الجذرية، وتجهيز إخطارات فورية جاهزة للإرسال.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunAiAnalysis}
                className="px-4 py-2.5 bg-[#004B87] hover:bg-[#00386B] text-white text-xs font-black rounded-xl flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <BrainCircuit className="w-4 h-4 text-[#00E676]" />
                <span>بدء التحليل بالـ AI الآن</span>
              </button>
            </div>
          )}

          {/* Automated Live Monitoring Alerts */}
          <div className="bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-200 dark:border-[#00386B] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-[#00386B] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#00A651]" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  مؤشرات الرصد اللحظي التلقائي (حالات متأخرة وارتفاع الشكاوى)
                </h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {liveRadarAlerts.length} تنبيه مرصود
              </span>
            </div>

            {liveRadarAlerts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-[#00A651] mx-auto mb-2" />
                <span>لا توجد اختناقات أو تأخيرات (+72 ساعة) مرصودة حالياً في الفترة المحددة.</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#00386B]">
                {liveRadarAlerts.map((item) => {
                  const sentTime = sentAlertKeys[item.key];
                  return (
                    <div
                      key={item.key}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#071629]/60 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`font-black ${
                              item.severity === 'عاجل'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-300'
                            }`}
                          >
                            {item.severity}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {item.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 print:hidden">
                        {sentTime && (
                          <span className="text-[11px] font-bold text-[#00A651] dark:text-[#00E676]">
                            تم الإخطار ({sentTime})
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            openAlertDrawer({
                              sourceKey: item.key,
                              title: item.title,
                              message: item.suggestedMessage,
                              audience: item.audience,
                              specificUsername: item.specificUsername,
                            })
                          }
                          className="px-3.5 py-2 rounded-xl bg-[#004B87] hover:bg-[#00386B] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5 text-[#00E676]" />
                          <span>إخطار الآن</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CALL AGENT PERFORMANCE EVALUATION */}
      {(activeTab === 'agents' || activeTab === 'overview') && (
        <div className="space-y-4">
          {/* AI Qualitative Agent Evaluation Cards */}
          {aiResult && aiResult.agentEvaluations.length > 0 && (
            <div className="bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-200 dark:border-[#00386B] overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-[#00386B] flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <BrainCircuit className="w-4 h-4 text-[#00A651]" />
                  <span>التقييم النوعي لوكلاء الاتصال بالذكاء الاصطناعي</span>
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {aiResult.agentEvaluations.length} وكيل
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-[#00386B]">
                {aiResult.agentEvaluations.map((ev, idx) => {
                  const matchedUser = activeCallAgents.find(
                    (u) => normStr(u.crmUser) === normStr(ev.crmUser) || normStr(u.fullName) === normStr(ev.agentName)
                  );
                  const alertKey = `ai_agent_${ev.crmUser}_${idx}`;
                  const sentTime = sentAlertKeys[alertKey];
                  return (
                    <div key={alertKey} className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-black text-sm text-slate-900 dark:text-white">
                            {ev.agentName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="font-mono tabular-nums">{ev.crmUser}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`font-bold ${
                                ev.performanceRating === 'ممتاز' || ev.performanceRating === 'جيد جداً'
                                  ? 'text-[#00A651] dark:text-[#00E676]'
                                  : ev.performanceRating === 'جيد'
                                  ? 'text-[#004B87] dark:text-sky-300'
                                  : 'text-amber-600 dark:text-amber-300'
                              }`}
                            >
                              التقييم: {ev.performanceRating}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">
                              المؤشر: {ev.performanceScore}/100
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 print:hidden">
                          {sentTime && (
                            <span className="text-[11px] font-bold text-[#00A651] dark:text-[#00E676]">
                              تم الإخطار ({sentTime})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              openAlertDrawer({
                                sourceKey: alertKey,
                                title: `توجيه أداء ومتابعة: ${ev.agentName}`,
                                message: `السيد/ة ${ev.agentName} (${ev.crmUser}): بناءً على مراجعة مؤشرات الأداء (${ev.performanceRating} - ${ev.performanceScore}/100)، نرجو الالتزام بالتوصية التالية: ${ev.coachingRecommendation}`,
                                audience: matchedUser ? 'specific' : 'agents',
                                specificUsername: matchedUser?.username,
                              })
                            }
                            className="px-3 py-1.5 rounded-xl bg-[#004B87] hover:bg-[#00386B] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5 text-[#00E676]" />
                            <span>إرسال تقييم وتوجيه للوكيل</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="font-bold text-[#008742] dark:text-[#00E676] mb-1">
                            نقاط القوة:
                          </div>
                          <ul className="space-y-1 text-slate-700 dark:text-slate-300 list-disc list-inside">
                            {ev.strengths.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="font-bold text-amber-700 dark:text-amber-300 mb-1">
                            جوانب التحسين والمتابعة:
                          </div>
                          <ul className="space-y-1 text-slate-700 dark:text-slate-300 list-disc list-inside">
                            {ev.improvementAreas.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="text-xs text-slate-700 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-[#00386B]">
                        <span className="font-bold text-[#004B87] dark:text-sky-300">
                          التوصية الإدارية:
                        </span>{' '}
                        {ev.coachingRecommendation}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantitative Call Agents Table */}
          <div className="bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-200 dark:border-[#00386B] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-[#00386B] flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#004B87] dark:text-sky-300" />
                <span>جدول المؤشرات الكمية لوكلاء الاتصال ({periodLabel})</span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-[#00264D] text-white text-[11px]">
                  <tr>
                    <th className="p-3">وكيل الاتصال</th>
                    <th className="p-3">كود CRM</th>
                    <th className="p-3 text-center">المسجلة</th>
                    <th className="p-3 text-center">المفتوحة</th>
                    <th className="p-3 text-center">المحولة</th>
                    <th className="p-3 text-center">متأخرة +72س</th>
                    <th className="p-3 text-center">المغلقة</th>
                    <th className="p-3 text-center">نسبة الإغلاق</th>
                    <th className="p-3 text-center">متوسط الحل</th>
                    <th className="p-3 text-center print:hidden">إخطار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]">
                  {agentMetricsList.map((ag) => {
                    const matchedUser = activeCallAgents.find((u) => u.crmUser === ag.crmUser);
                    const rowAlertKey = `row_agent_${ag.crmUser}`;
                    return (
                      <tr
                        key={ag.crmUser}
                        className="hover:bg-slate-50 dark:hover:bg-[#071629]/60 transition-colors"
                      >
                        <td className="p-3 font-bold text-slate-900 dark:text-white">
                          <div>{ag.fullName}</div>
                          {ag.topServices.length > 0 && (
                            <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                              {ag.topServices.join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-[#004B87] dark:text-sky-300 tabular-nums">
                          {ag.crmUser}
                        </td>
                        <td className="p-3 text-center font-mono font-bold tabular-nums">
                          {ag.registeredCount}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                          {ag.openCount}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                          {ag.escalatedCount}
                        </td>
                        <td className="p-3 text-center font-mono font-bold tabular-nums">
                          <span
                            className={
                              ag.overdue72hCount > 0
                                ? 'text-rose-600 dark:text-rose-400 font-black'
                                : 'text-slate-400'
                            }
                          >
                            {ag.overdue72hCount}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-[#00A651] dark:text-[#00E676] tabular-nums">
                          {ag.closedCount}
                        </td>
                        <td className="p-3 text-center font-mono font-bold tabular-nums">
                          {ag.closeRatePct}%
                        </td>
                        <td className="p-3 text-center font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {ag.avgResolutionHours !== null ? `${ag.avgResolutionHours} س` : '—'}
                        </td>
                        <td className="p-3 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() =>
                              openAlertDrawer({
                                sourceKey: rowAlertKey,
                                title: `متابعة مؤشرات الأداء - ${ag.fullName}`,
                                message:
                                  ag.overdue72hCount > 0
                                    ? `يوجد (${ag.overdue72hCount}) حالة متأخرة عن 72 ساعة بحسابكم من إجمالي (${ag.openCount}) حالة مفتوحة. يرجى سرعة المتابعة والإغلاق.`
                                    : `ملخص متابعة الأداء (${periodLabel}): الحالات المسجلة (${ag.registeredCount}) · المغلقة (${ag.closedCount}) · نسبة الإنجاز (${ag.closeRatePct}%).`,
                                audience: matchedUser ? 'specific' : 'agents',
                                specificUsername: matchedUser?.username,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#071629] hover:bg-[#004B87] hover:text-white text-[#004B87] dark:text-sky-300 font-bold text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>{sentAlertKeys[rowAlertKey] ? 'أُخطِر' : 'إخطار'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {agentMetricsList.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-slate-400">
                        لا يوجد وكلاء اتصال مسجلون بالمنظومة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COMMON PROBLEMS & INQUIRIES MONITORING */}
      {(activeTab === 'issues' || activeTab === 'overview') && (
        <div className="space-y-4">
          {/* AI Clustered Common Problems & Inquiries */}
          {aiResult && aiResult.commonIssues.length > 0 && (
            <div className="bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-200 dark:border-[#00386B] overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-[#00386B] flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <FileWarning className="w-4 h-4 text-amber-500" />
                  <span>المشاكل والاستفسارات الأكثر شيوعاً المرصودة بالـ AI</span>
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {aiResult.commonIssues.length} محور مرصود
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-[#00386B]">
                {aiResult.commonIssues.map((issue, idx) => {
                  const issueKey = `ai_issue_${idx}`;
                  const sentTime = sentAlertKeys[issueKey];
                  return (
                    <div key={issueKey} className="p-4 space-y-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-sm text-slate-900 dark:text-white">
                            {issue.issueTitle}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                            <span>{issue.category}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`font-bold ${
                                issue.severity === 'حرج'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : issue.severity === 'مرتفع'
                                  ? 'text-amber-600 dark:text-amber-300'
                                  : 'text-[#004B87] dark:text-sky-300'
                              }`}
                            >
                              الأهمية: {issue.severity}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{issue.estimatedFrequency}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 print:hidden">
                          {sentTime && (
                            <span className="text-[11px] font-bold text-[#00A651] dark:text-[#00E676]">
                              تم الإخطار ({sentTime})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              openAlertDrawer({
                                sourceKey: issueKey,
                                title: `تنبيه حول مشكلة متكررة: ${issue.issueTitle}`,
                                message: `رصد متكرر (${issue.category} - ${issue.severity}): ${issue.rootCauseHypothesis}\n\nالإجراء الموحد الموصى به: ${issue.recommendedAction}`,
                                audience: 'both',
                              })
                            }
                            className="px-3 py-1.5 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>إخطار الفريق بالمشكلة</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="text-slate-700 dark:text-slate-300">
                          <span className="font-bold text-slate-900 dark:text-white">
                            السبب المرجح:
                          </span>{' '}
                          {issue.rootCauseHypothesis}
                        </div>
                        <div className="text-slate-700 dark:text-slate-300">
                          <span className="font-bold text-[#008742] dark:text-[#00E676]">
                            الإجراء الموصى به:
                          </span>{' '}
                          {issue.recommendedAction}
                        </div>
                      </div>

                      {issue.relatedCaseIds && issue.relatedCaseIds.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] pt-1">
                          <span className="font-bold text-slate-500 dark:text-slate-400">
                            حالات مرتبطة:
                          </span>
                          {issue.relatedCaseIds.map((code) => {
                            const matchedCase = casesByCodeMap.get(code.trim().toUpperCase());
                            return matchedCase ? (
                              <button
                                key={code}
                                type="button"
                                onClick={() => onOpenCase(matchedCase)}
                                className="font-mono font-bold text-[#004B87] dark:text-[#00E676] underline inline-flex items-center gap-0.5 cursor-pointer"
                              >
                                <span>{matchedCase.caseId}</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            ) : (
                              <span key={code} className="font-mono text-slate-500">
                                {code}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantitative Recurring Services & Problems Table */}
          <div className="bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-200 dark:border-[#00386B] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-[#00386B] flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#00A651]" />
                <span>ترتيب الخدمات والموضوعات الأكثر تكراراً ({periodLabel})</span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-[#00264D] text-white text-[11px]">
                  <tr>
                    <th className="p-3">الخدمة / موضوع الاستفسار</th>
                    <th className="p-3">نوع الضريبة</th>
                    <th className="p-3 text-center">إجمالي الحالات</th>
                    <th className="p-3 text-center">النسبة</th>
                    <th className="p-3 text-center">المفتوحة</th>
                    <th className="p-3 text-center">المحولة للإدارة/الدعم</th>
                    <th className="p-3 text-center">متأخرة +72س</th>
                    <th className="p-3 text-center print:hidden">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]">
                  {serviceBreakdown.map((srv) => {
                    const sharePct =
                      summaryStats.totalCases > 0
                        ? Math.round((srv.count / summaryStats.totalCases) * 100)
                        : 0;
                    const srvKey = `table_srv_${srv.serviceType}`;
                    return (
                      <tr
                        key={srv.serviceType}
                        className="hover:bg-slate-50 dark:hover:bg-[#071629]/60 transition-colors"
                      >
                        <td className="p-3 font-bold text-slate-900 dark:text-white">
                          {srv.serviceType}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">{srv.taxType}</td>
                        <td className="p-3 text-center font-mono font-bold text-[#004B87] dark:text-sky-300 tabular-nums">
                          {srv.count}
                        </td>
                        <td className="p-3 text-center font-mono tabular-nums">{sharePct}%</td>
                        <td className="p-3 text-center font-mono tabular-nums text-amber-700 dark:text-amber-300">
                          {srv.openCount}
                        </td>
                        <td className="p-3 text-center font-mono tabular-nums">
                          {srv.escalatedCount}
                        </td>
                        <td className="p-3 text-center font-mono font-bold tabular-nums">
                          <span
                            className={
                              srv.overdue72hCount > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-400'
                            }
                          >
                            {srv.overdue72hCount}
                          </span>
                        </td>
                        <td className="p-3 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() =>
                              openAlertDrawer({
                                sourceKey: srvKey,
                                title: `توجيه بخصوص استفسارات: ${srv.serviceType}`,
                                message: `رصد تشغيلي حول "${srv.serviceType}" (${srv.count} حالة بنسبة ${sharePct}% من إجمالي الفترة، منها ${srv.escalatedCount} محولة للإدارة/الدعم). يرجى الالتزام بدليل الرد المعتمد وسرعة معالجة الحالات المفتوحة (${srv.openCount}).`,
                                audience: 'both',
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#071629] hover:bg-[#004B87] hover:text-white text-[#004B87] dark:text-sky-300 font-bold text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>{sentAlertKeys[srvKey] ? 'تم الإخطار' : 'إخطار'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {serviceBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-400">
                        لا توجد حالات مسجلة في الفترة المحددة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PROACTIVE ALERTS & STAFF NOTIFICATION CENTER */}
      {(activeTab === 'alerts' || activeTab === 'overview') && (
        <div className="bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-200 dark:border-[#00386B] overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-[#00386B] flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[#00A651]" />
              <span>مسودات الإخطارات والتنبيهات الاستباقية المقترحة بالـ AI</span>
            </h3>
            <button
              type="button"
              onClick={() =>
                openAlertDrawer({
                  sourceKey: `manual_custom_${Date.now()}`,
                  title: 'توجيه إداري وتقني لفريق مركز الاتصال',
                  message: '',
                  audience: 'agents',
                })
              }
              className="px-3 py-1.5 rounded-xl bg-[#004B87] hover:bg-[#00386B] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer print:hidden"
            >
              <Send className="w-3.5 h-3.5 text-[#00E676]" />
              <span>إنشاء إخطار مخصص</span>
            </button>
          </div>

          {!aiResult || aiResult.proactiveAlerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <Target className="w-8 h-8 text-[#004B87]/50 dark:text-sky-300/50 mx-auto" />
              <p>
                قم بتشغيل <strong>«التحليل الذكي بالـ AI»</strong> لتوليد إخطارات وتنبيهات استباقية مصاغة تلقائياً بناءً على أحدث المشاكل وأداء الوكلاء.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#00386B]">
              {aiResult.proactiveAlerts.map((al, idx) => {
                const key = `ai_proactive_${idx}`;
                const sentTime = sentAlertKeys[key];
                const audienceType: DispatchAudience =
                  al.targetAudience === 'management'
                    ? 'management'
                    : al.targetAudience === 'both'
                    ? 'both'
                    : 'agents';
                const audienceLabel =
                  audienceType === 'management'
                    ? 'الإدارة والدعم التقني'
                    : audienceType === 'both'
                    ? 'جميع الموظفين'
                    : 'وكلاء الاتصال';

                return (
                  <div
                    key={key}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`font-black ${
                            al.severity === 'عاجل'
                              ? 'text-rose-600 dark:text-rose-400'
                              : al.severity === 'تنبيه'
                              ? 'text-amber-600 dark:text-amber-300'
                              : 'text-[#004B87] dark:text-sky-300'
                          }`}
                        >
                          {al.severity}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {al.alertTitle}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          المستهدف: {audienceLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {al.alertMessage}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 print:hidden">
                      {sentTime && (
                        <span className="text-[11px] font-bold text-[#00A651] dark:text-[#00E676]">
                          تم الإخطار ({sentTime})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          openAlertDrawer({
                            sourceKey: key,
                            title: al.alertTitle,
                            message: al.alertMessage,
                            audience: audienceType,
                          })
                        }
                        className="px-3.5 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>مراجعة وإرسال الإخطار</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Official Staff Alert Dispatch Modal */}
      {alertDraft && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 print:hidden"
          onClick={() => !isDispatching && setAlertDraft(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            dir={isRtl ? 'rtl' : 'ltr'}
            className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#004B87] w-full max-w-xl overflow-hidden text-start animate-scale-in"
          >
            <div className="bg-[#00264D] p-4 text-white flex items-center justify-between border-b border-[#004B87]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#00A651] text-white">
                  <BellRing className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm">اعتماد وإرسال إخطار رسمي للموظفين</h3>
                  <p className="text-[11px] text-sky-200">
                    يظهر بوسط الشاشة مع تنبيه صوتي ويتطلب الإقرار بالقراءة والموافقة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDispatching && setAlertDraft(null)}
                className="p-1.5 rounded-lg text-sky-200 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDispatchAlert} className="p-4 space-y-3.5 text-xs">
              {dispatchError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 font-bold">
                  {dispatchError}
                </div>
              )}

              {dispatchSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-[#003324] border border-emerald-200 dark:border-[#00A651] text-emerald-900 dark:text-[#00E676] font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{dispatchSuccess}</span>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1.5">
                  الفئة المستهدفة بالإخطار:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAlertDraft({ ...alertDraft, audience: 'agents' })}
                    className={`p-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                      alertDraft.audience === 'agents'
                        ? 'bg-[#004B87] text-white border-[#004B87]'
                        : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B]'
                    }`}
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>وكلاء الاتصال</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAlertDraft({ ...alertDraft, audience: 'management' })}
                    className={`p-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                      alertDraft.audience === 'management'
                        ? 'bg-[#004B87] text-white border-[#004B87]'
                        : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B]'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>الإدارة والدعم</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAlertDraft({ ...alertDraft, audience: 'both' })}
                    className={`p-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                      alertDraft.audience === 'both'
                        ? 'bg-[#00A651] text-white border-[#00A651]'
                        : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B]'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>الجميع</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAlertDraft({
                        ...alertDraft,
                        audience: 'specific',
                        specificUsername:
                          alertDraft.specificUsername || activeCallAgents[0]?.username || '',
                      })
                    }
                    className={`p-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                      alertDraft.audience === 'specific'
                        ? 'bg-[#00264D] text-white border-[#00A651]'
                        : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B]'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>وكيل محدد</span>
                  </button>
                </div>
              </div>

              {alertDraft.audience === 'specific' && (
                <div>
                  <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                    اختر وكيل الاتصال:
                  </label>
                  <select
                    value={alertDraft.specificUsername || ''}
                    onChange={(e) =>
                      setAlertDraft({ ...alertDraft, specificUsername: e.target.value })
                    }
                    className="w-full p-2 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] font-bold text-slate-900 dark:text-white"
                  >
                    {activeCallAgents.map((u) => (
                      <option key={u.id} value={u.username}>
                        {u.fullName} ({u.crmUser})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                  عنوان الإخطار *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={alertDraft.title}
                  onChange={(e) => setAlertDraft({ ...alertDraft, title: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00A651]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                  نص الإخطار والتوجيهات *
                </label>
                <StyledTextarea
                  rows={4}
                  required
                  maxLength={600}
                  value={alertDraft.message}
                  onChange={(e) => setAlertDraft({ ...alertDraft, message: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#00A651]"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-[#00386B] flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDispatching}
                  onClick={() => setAlertDraft(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071629] font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isDispatching}
                  className="px-5 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{isDispatching ? 'جارٍ الإرسال...' : 'إرسال الإخطار فوراً'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
