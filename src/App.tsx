/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeLanguageProvider, useThemeLanguage } from './context/ThemeLanguageContext';
import { Case, User, BackupScheduleConfig, DatabaseBackup } from './types';
import {
  subscribeToCases,
  isCaseOwnedByUser,
  getOverdueCasesForUser,
  syncOverdueNotificationsForUser,
} from './services/caseService';
import { fetchUsers, subscribeToUsers } from './services/userService';
import {
  subscribeToBackupSchedule,
  checkAndRunScheduledBackup,
} from './services/backupService';
import { CheckCircle2, AlertTriangle, LogOut, ArrowRight } from 'lucide-react';
import { LoginPage } from './pages/LoginPage';
import { Navbar } from './components/Navbar';
import { Sidebar, NavPage } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { CasesPage, CasesFilterPreset } from './pages/CasesPage';
import { IncomingCasesPage } from './pages/IncomingCasesPage';
import { MyCasesPage } from './pages/MyCasesPage';
import { ClosedCasesPage } from './pages/ClosedCasesPage';
import { TaxpayersPage } from './pages/TaxpayersPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersManagementPage } from './pages/UsersManagementPage';
import { BackupRestorePage } from './pages/BackupRestorePage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { UserGuidePage } from './pages/UserGuidePage';
import { AiInsightsPage } from './pages/AiInsightsPage';
import { NewCaseModal } from './components/NewCaseModal';
import { CaseDetailModal } from './components/CaseDetailModal';
import { SmartSearchModal } from './components/SmartSearchModal';
import { SendNotificationModal } from './components/SendNotificationModal';
import { SmartSearchParams } from './services/geminiService';
import { Footer } from './components/Footer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { CrmLogo } from './components/EtaLogo';
import { InteractiveBackground } from './components/InteractiveBackground';
import { PWAInstallBanner, OfflineIndicator } from './components/PWAInstallPrompt';
import { OverdueCasesAlert } from './components/OverdueCasesAlert';
import { FloatingAIAssistant } from './components/FloatingAIAssistant';
import { FloatingTeamChat } from './components/FloatingTeamChat';
import { MandatoryNotificationModal } from './components/MandatoryNotificationModal';
import { MandatoryUpdateModal } from './components/MandatoryUpdateModal';
import { IncomingNotificationModal } from './components/IncomingNotificationModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { playAlertSound } from './utils/soundAlerts';

const MainApp: React.FC = () => {
  const { currentUser, isAuthenticated, isVerifiedInScreen, isLoading, logout } = useAuth();
  const { language, isRtl } = useThemeLanguage();
  const [cases, setCases] = useState<Case[]>([]);
  const [isCasesLoading, setIsCasesLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals state
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [isSmartSearchOpen, setIsSmartSearchOpen] = useState(false);
  const [isSendNotifOpen, setIsSendNotifOpen] = useState(false);
  const [casesFilterStatus, setCasesFilterStatus] = useState<string>('all');
  const [casesFilterPreset, setCasesFilterPreset] = useState<CasesFilterPreset | null>(null);
  const [backupSchedule, setBackupSchedule] = useState<BackupScheduleConfig | null>(null);
  const [autoBackupToast, setAutoBackupToast] = useState<DatabaseBackup | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [exitConfirmReason, setExitConfirmReason] = useState<'back' | 'logout'>('back');

  const requestExitConfirm = useCallback((reason: 'back' | 'logout') => {
    setExitConfirmReason(reason);
    setIsExitConfirmOpen(true);
  }, []);

  const mainRef = useRef<HTMLElement>(null);
  const pageViewRef = useRef<HTMLDivElement>(null);
  const navHistoryRef = useRef<NavPage[]>([]);
  const modalStateRef = useRef({
    isExitConfirmOpen: false,
    isSendNotifOpen: false,
    isSmartSearchOpen: false,
    hasSelectedCase: false,
    isNewCaseOpen: false,
    isMobileMenuOpen: false,
  });

  useEffect(() => {
    modalStateRef.current = {
      isExitConfirmOpen,
      isSendNotifOpen,
      isSmartSearchOpen,
      hasSelectedCase: !!selectedCase,
      isNewCaseOpen,
      isMobileMenuOpen,
    };
  }, [
    isExitConfirmOpen,
    isSendNotifOpen,
    isSmartSearchOpen,
    selectedCase,
    isNewCaseOpen,
    isMobileMenuOpen,
  ]);

  const focusActivePage = useCallback(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    if (pageViewRef.current) {
      pageViewRef.current.focus({ preventScroll: true });
    }
  }, []);

  useLayoutEffect(() => {
    if (isAuthenticated && isVerifiedInScreen && currentUser) {
      if (
        (currentUser.role === 'agent' &&
          (currentPage === 'reports' ||
            currentPage === 'ai_insights' ||
            currentPage === 'audit' ||
            currentPage === 'users' ||
            currentPage === 'backups' ||
            currentPage === 'settings' ||
            currentPage === 'guide')) ||
        (currentUser.role !== 'super_admin' &&
          (currentPage === 'users' ||
            currentPage === 'backups' ||
            currentPage === 'settings' ||
            currentPage === 'guide'))
      ) {
        setCurrentPage('dashboard');
      }
      focusActivePage();
    } else if (!isAuthenticated) {
      setCurrentPage('dashboard');
    }
  }, [currentPage, casesFilterStatus, isAuthenticated, isVerifiedInScreen, currentUser, focusActivePage]);

  // Load all users
  const refreshUsers = async () => {
    try {
      const u = await fetchUsers();
      setAllUsers(u);
    } catch (err) {
      console.warn('Failed to load users:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      setIsCasesLoading(true);
      refreshUsers();
      const unsubUsers = subscribeToUsers((updatedUsers) => {
        setAllUsers(updatedUsers);
      });
      // Real-time cases subscription
      const unsubscribe = subscribeToCases((updatedCases) => {
        setCases(updatedCases);
        setIsCasesLoading(false);
        // If selectedCase is currently open, keep it in sync
        setSelectedCase((prev) => {
          if (!prev) return null;
          const match = updatedCases.find((c) => c.id === prev.id);
          return match || prev;
        });
      });
      const unsubSchedule = subscribeToBackupSchedule((cfg) => {
        setBackupSchedule(cfg);
      });
      return () => {
        unsubUsers();
        unsubscribe();
        unsubSchedule();
      };
    }
  }, [isAuthenticated]);

  // Global background automatic backup scheduler
  useEffect(() => {
    if (!isAuthenticated || !currentUser || !backupSchedule?.enabled) return;

    let toastTimer: ReturnType<typeof setTimeout> | null = null;

    const runCheck = async () => {
      if (!backupSchedule?.enabled || !backupSchedule.nextScheduledAt) return;
      const dueTime = new Date(backupSchedule.nextScheduledAt).getTime();
      if (Number.isNaN(dueTime) || Date.now() < dueTime) return;

      const created = await checkAndRunScheduledBackup(currentUser);
      if (created && currentUser.role === 'super_admin') {
        setAutoBackupToast(created);
        playAlertSound('info');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setAutoBackupToast(null), 7000);
      }
    };

    runCheck();
    const interval = setInterval(runCheck, 10_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        runCheck();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, [
    isAuthenticated,
    currentUser,
    backupSchedule?.enabled,
    backupSchedule?.nextScheduledAt,
  ]);

  // Periodic 60-second clock tick for live 72-hour overdue checks
  useEffect(() => {
    if (!isAuthenticated) return;
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  // Global Ctrl+K / Cmd+K shortcut to open Smart AI Search
  useEffect(() => {
    if (!isAuthenticated || !isVerifiedInScreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSmartSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAuthenticated, isVerifiedInScreen]);

  // Browser & Mobile Back Button Guard + Page History Navigation + Exit Confirmation
  useEffect(() => {
    if (!isAuthenticated || !isVerifiedInScreen) {
      navHistoryRef.current = [];
      setIsExitConfirmOpen(false);
      return;
    }

    if (!window.history.state || !window.history.state.crmGuard) {
      window.history.pushState({ crmGuard: true, root: true }, '');
    }

    const handlePopState = () => {
      const m = modalStateRef.current;

      // Keep user inside the CRM app by re-pushing guard state
      window.history.pushState({ crmGuard: true }, '');

      if (m.isExitConfirmOpen) {
        setIsExitConfirmOpen(false);
        return;
      }
      if (m.isSendNotifOpen) {
        setIsSendNotifOpen(false);
        return;
      }
      if (m.isSmartSearchOpen) {
        setIsSmartSearchOpen(false);
        return;
      }
      if (m.hasSelectedCase) {
        setSelectedCase(null);
        return;
      }
      if (m.isNewCaseOpen) {
        setIsNewCaseOpen(false);
        return;
      }
      if (m.isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
        return;
      }

      if (navHistoryRef.current.length > 0) {
        const previousPage = navHistoryRef.current.pop();
        if (previousPage) {
          setCurrentPage(previousPage);
          requestAnimationFrame(() => focusActivePage());
          return;
        }
      }

      requestExitConfirm('back');
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (window.__crmBypassBeforeUnload) return;
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated, isVerifiedInScreen, focusActivePage, requestExitConfirm]);

  const overdueCasesForUser = useMemo(() => {
    if (!currentUser) return [];
    return getOverdueCasesForUser(cases, currentUser, nowMs);
  }, [cases, currentUser, nowMs]);

  useEffect(() => {
    if (!isAuthenticated || !isVerifiedInScreen || !currentUser) return;
    if (overdueCasesForUser.length === 0) return;
    syncOverdueNotificationsForUser(overdueCasesForUser, currentUser, nowMs);
  }, [isAuthenticated, isVerifiedInScreen, currentUser, overdueCasesForUser, nowMs]);

  // Incoming count (must remain above early returns so hook order is invariant)
  const incomingCasesCount = cases.filter(
    (c) =>
      c.status === 'محولة للإدارة' ||
      c.status === 'محولة للدعم الفني' ||
      c.status === 'محولة للدعم التقني'
  ).length;

  const prevIncomingCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (isCasesLoading || !isAuthenticated || !isVerifiedInScreen || !currentUser) {
      if (!isAuthenticated) {
        prevIncomingCountRef.current = null;
      }
      return;
    }
    if (currentUser.role === 'agent') return;
    if (prevIncomingCountRef.current === null) {
      prevIncomingCountRef.current = incomingCasesCount;
      return;
    }
    if (incomingCasesCount > prevIncomingCountRef.current) {
      playAlertSound('notification');
    }
    prevIncomingCountRef.current = incomingCasesCount;
  }, [incomingCasesCount, isCasesLoading, isAuthenticated, isVerifiedInScreen, currentUser]);

  if (isLoading) {
    return (
      <div
        className="relative min-h-screen bg-[#001A35] flex items-center justify-center text-white overflow-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <InteractiveBackground variant="login" />
        <div className="relative z-10 flex flex-col items-center gap-4 animate-fade-up">
          <CrmLogo size={96} lightMode={true} noShadow={true} />
          <div className="w-48 h-2 rounded-full overflow-hidden bg-[#003161]">
            <div className="h-full w-full bg-[#00A651] animate-pulse rounded-full" />
          </div>
          <span className="text-xs text-slate-200 font-bold">
            {language === 'ar'
              ? 'جارٍ تهيئة منظومة مركز الاتصال المتكامل 16395...'
              : 'Initializing CRM Contact Center System 16395...'}
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isVerifiedInScreen || !currentUser) {
    return <LoginPage />;
  }

  // Open cases in current user's account
  const myCasesCount = cases.filter(
    (c) => c.status !== 'مغلقة' && isCaseOwnedByUser(c, currentUser)
  ).length;

  // Closed cases count
  const closedCasesCount = cases.filter((c) => c.status === 'مغلقة').length;

  const pushPageHistory = (targetPage: NavPage) => {
    if (targetPage !== currentPage) {
      const stack = navHistoryRef.current;
      if (stack[stack.length - 1] !== currentPage) {
        stack.push(currentPage);
        if (stack.length > 30) stack.shift();
      }
      window.history.pushState({ crmGuard: true, page: targetPage }, '');
    }
  };

  const handleNavigate = (page: NavPage) => {
    if (
      ((page === 'reports' || page === 'ai_insights' || page === 'audit') &&
        currentUser?.role === 'agent') ||
      ((page === 'users' || page === 'backups' || page === 'settings' || page === 'guide') &&
        currentUser?.role !== 'super_admin')
    ) {
      pushPageHistory('dashboard');
      setCurrentPage('dashboard');
      requestAnimationFrame(() => focusActivePage());
      return;
    }
    pushPageHistory(page);
    setCurrentPage(page);
    requestAnimationFrame(() => focusActivePage());
  };

  const handleNavigateToCases = (filterStatus = 'all') => {
    pushPageHistory('cases');
    setCasesFilterStatus(filterStatus);
    setCasesFilterPreset({
      key: Date.now(),
      status: filterStatus,
      taxType: 'all',
      callType: 'all',
      serviceType: 'all',
      priority: 'all',
      datePreset: 'all',
      searchTerm: '',
    });
    setCurrentPage('cases');
    requestAnimationFrame(() => focusActivePage());
  };

  const handleApplySmartSearch = (filters: SmartSearchParams) => {
    pushPageHistory('cases');
    const nextStatus = filters.status || 'all';
    setCasesFilterStatus(nextStatus);
    setCasesFilterPreset({
      key: Date.now(),
      status: nextStatus,
      taxType: filters.taxType || 'all',
      callType: filters.callType || 'all',
      serviceType: filters.serviceType || 'all',
      priority: filters.priority || 'all',
      datePreset: filters.datePreset || 'all',
      searchTerm: filters.freeText || '',
      fromSmartSearch: true,
    });
    setCurrentPage('cases');
    requestAnimationFrame(() => focusActivePage());
  };

  return (
    <div
      className="relative h-dvh overflow-hidden flex flex-col font-sans text-slate-900 dark:text-slate-100 selection:bg-[#00A651] selection:text-white transition-colors duration-200"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Interactive Animated Background + Egyptian Tax Authority Seal Watermark */}
      <InteractiveBackground variant="workspace" />

      {/* Top Navigation */}
      <Navbar
        onOpenNewCase={() => setIsNewCaseOpen(true)}
        onOpenSmartSearch={() => setIsSmartSearchOpen(true)}
        onOpenSendNotification={() => setIsSendNotifOpen(true)}
        unreadIncomingCount={incomingCasesCount}
        onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        onRequestLogout={() => requestExitConfirm('logout')}
      />

      {/* Main Layout Body */}
      <div className="relative z-10 flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Collapsible Sidebar (Desktop and Mobile Drawer) */}
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onOpenNewCase={() => setIsNewCaseOpen(true)}
          onOpenSendNotification={() => setIsSendNotifOpen(true)}
          incomingCasesCount={incomingCasesCount}
          myCasesCount={myCasesCount}
          closedCasesCount={closedCasesCount}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          onRequestLogout={() => requestExitConfirm('logout')}
        />

        {/* Content Area */}
        <main
          ref={mainRef}
          className="flex-1 min-h-0 overflow-y-auto scroll-smooth-touch p-3 sm:p-4 md:p-5 flex flex-col justify-between pb-24 lg:pb-6"
        >
          {overdueCasesForUser.length > 0 && (
            <OverdueCasesAlert
              overdueCases={overdueCasesForUser}
              currentUser={currentUser}
              nowMs={nowMs}
              onOpenCase={(c) => setSelectedCase(c)}
              onNavigateToOpenCases={
                currentPage !== 'my_cases' ? () => handleNavigate('my_cases') : undefined
              }
            />
          )}

          <div
            ref={pageViewRef}
            tabIndex={-1}
            key={currentPage}
            className="flex-1 animate-fade-up focus:outline-none"
          >
            {currentPage === 'dashboard' && (
              <DashboardPage
                cases={cases}
                currentUser={currentUser}
                onOpenCase={(c) => setSelectedCase(c)}
                onOpenNewCase={() => setIsNewCaseOpen(true)}
                onNavigateToCases={handleNavigateToCases}
                onNavigateToReports={
                  currentUser.role !== 'agent' ? () => handleNavigate('reports') : undefined
                }
                onNavigateToMyCases={() => handleNavigate('my_cases')}
                isLoadingCases={isCasesLoading}
              />
            )}

            {currentPage === 'cases' && (
              <CasesPage
                cases={cases}
                currentUser={currentUser}
                onOpenCase={(c) => setSelectedCase(c)}
                onOpenNewCase={() => setIsNewCaseOpen(true)}
                initialStatusFilter={casesFilterStatus}
                filterPreset={casesFilterPreset}
                isLoadingCases={isCasesLoading}
              />
            )}

            {currentPage === 'incoming' && (
              <IncomingCasesPage
                cases={cases}
                currentUser={currentUser}
                allUsers={allUsers}
                onOpenCase={(c) => setSelectedCase(c)}
              />
            )}

            {currentPage === 'my_cases' && (
              <MyCasesPage
                cases={cases}
                currentUser={currentUser}
                allUsers={allUsers}
                onOpenCase={(c) => setSelectedCase(c)}
                onOpenNewCase={() => setIsNewCaseOpen(true)}
              />
            )}

            {currentPage === 'closed_cases' && (
              <ClosedCasesPage
                cases={cases}
                currentUser={currentUser}
                onOpenCase={(c) => setSelectedCase(c)}
              />
            )}

            {currentPage === 'taxpayers' && (
              <TaxpayersPage
                cases={cases}
                currentUser={currentUser}
                onOpenCase={(c) => setSelectedCase(c)}
              />
            )}

            {currentPage === 'reports' && currentUser.role !== 'agent' && (
              <ReportsPage
                cases={cases}
                allUsers={allUsers}
                currentUser={currentUser}
                onNavigateToMyCases={() => handleNavigate('my_cases')}
                onOpenAiInsights={() => handleNavigate('ai_insights')}
              />
            )}

            {currentPage === 'ai_insights' &&
              (currentUser.role === 'super_admin' ||
                currentUser.role === 'management' ||
                currentUser.role === 'technical_support') && (
                <AiInsightsPage
                  cases={cases}
                  allUsers={allUsers}
                  currentUser={currentUser}
                  onOpenCase={(c) => setSelectedCase(c)}
                />
              )}

            {currentPage === 'users' && currentUser.role === 'super_admin' && (
              <UsersManagementPage
                users={allUsers}
                currentUser={currentUser}
                onRefreshUsers={refreshUsers}
              />
            )}

            {currentPage === 'backups' && currentUser.role === 'super_admin' && (
              <BackupRestorePage currentUser={currentUser} />
            )}

            {currentPage === 'audit' &&
              (currentUser.role === 'super_admin' ||
                currentUser.role === 'management' ||
                currentUser.role === 'technical_support') && <AuditLogPage />}

            {currentPage === 'settings' && currentUser.role === 'super_admin' && (
              <SystemSettingsPage />
            )}

            {currentPage === 'guide' && currentUser.role === 'super_admin' && (
              <UserGuidePage />
            )}
          </div>

          {/* Mandatory Attribution Footer on all pages */}
          <Footer />
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <MobileBottomNav
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onOpenNewCase={() => setIsNewCaseOpen(true)}
          onOpenMoreMenu={() => setIsMobileMenuOpen(true)}
          incomingCasesCount={incomingCasesCount}
          myCasesCount={myCasesCount}
          isMoreMenuOpen={isMobileMenuOpen}
        />
      </div>

      {/* New Case Modal */}
      <NewCaseModal
        isOpen={isNewCaseOpen}
        onClose={() => setIsNewCaseOpen(false)}
        currentUser={currentUser}
        allUsers={allUsers}
        onCaseCreated={(created) => {
          setSelectedCase(created);
        }}
      />

      {/* Case Detail & Workflow Modal */}
      <CaseDetailModal
        isOpen={!!selectedCase}
        onClose={() => setSelectedCase(null)}
        caseItem={selectedCase}
        currentUser={currentUser}
        allUsers={allUsers}
      />

      {/* Smart Search Modal (Gemini AI) */}
      <SmartSearchModal
        isOpen={isSmartSearchOpen}
        onClose={() => setIsSmartSearchOpen(false)}
        onApplyFilters={handleApplySmartSearch}
        cases={cases}
        onOpenCase={(c) => {
          setIsSmartSearchOpen(false);
          setSelectedCase(c);
        }}
      />

      {/* Admin Targeted Notification Modal */}
      <SendNotificationModal
        isOpen={isSendNotifOpen}
        onClose={() => setIsSendNotifOpen(false)}
        currentUser={currentUser}
        allUsers={allUsers}
      />

      {/* Automatic Scheduled Backup Confirmation Toast (Super Admin) */}
      {autoBackupToast && (
        <div className="fixed bottom-20 lg:bottom-5 left-4 z-60 max-w-sm bg-[#00264D] text-white border border-[#00A651] rounded-2xl p-3.5 shadow-2xl flex items-start gap-3 animate-fade-up">
          <div className="p-2 bg-[#00A651] rounded-xl shrink-0">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
          <div className="text-xs space-y-0.5">
            <div className="font-bold text-[#00E676]">
              تم إنشاء النسخة الاحتياطية التلقائية بنجاح
            </div>
            <div className="text-slate-200 font-semibold">{autoBackupToast.backupName}</div>
            <div className="text-[11px] text-sky-200 font-mono">
              إجمالي السجلات المحفوظة: {autoBackupToast.recordsCount}
            </div>
          </div>
        </div>
      )}
      {/* Mandatory Centered Admin/Support Notice Modal */}
      <MandatoryNotificationModal />

      {/* Auto-Popup Centered Incoming Notification Alert Modal */}
      <IncomingNotificationModal />

      {/* Custom In-App Exit Confirmation Modal (triggered by Logout button or Back at Root) */}
      {isExitConfirmOpen && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
        >
          <div className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border-2 border-amber-500 dark:border-amber-400 w-full max-w-md overflow-hidden animate-scale-in text-start">
            <div className="bg-[#00264D] px-5 py-4 text-white flex items-center gap-3 border-b border-[#004B87]">
              <div className="p-2.5 rounded-xl bg-amber-500 text-white shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-black text-sm text-white">
                  {language === 'ar'
                    ? 'تنبيه قبل الخروج من البرنامج'
                    : 'Exit Confirmation Alert'}
                </h2>
                <p className="text-[11px] text-sky-200 mt-0.5">
                  {exitConfirmReason === 'back'
                    ? language === 'ar'
                      ? 'تم الضغط على زر الرجوع من الشاشة الرئيسية'
                      : 'Back button pressed from root screen'
                    : language === 'ar'
                    ? 'تم اختيار تسجيل الخروج من المنظومة'
                    : 'Sign out requested from system'}
                </p>
              </div>
            </div>

            <div className="p-5 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {language === 'ar'
                ? 'هل تريد بالفعل الخروج من برنامج مركز الاتصال المتكامل أم العودة للبرنامج لمتابعة العمل؟'
                : 'Do you want to sign out and exit the Integrated Call Center CRM, or return to the program to continue working?'}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsExitConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#004B87] hover:bg-[#00386B] text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>{language === 'ar' ? 'العودة للبرنامج' : 'Return to Program'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsExitConfirmOpen(false);
                  logout('manual');
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{language === 'ar' ? 'تأكيد الخروج' : 'Exit Program'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Draggable Smart AI Assistant */}
      <FloatingAIAssistant currentUser={currentUser} />

      {/* Floating Draggable Team Help Chat */}
      <FloatingTeamChat
        currentUser={currentUser}
        allUsers={allUsers}
        cases={cases}
        onOpenCaseById={(caseCode) => {
          const normalized = caseCode.trim().toUpperCase();
          const match = cases.find(
            (c) => c.caseId.toUpperCase() === normalized || c.id === caseCode.trim()
          );
          if (match) {
            setSelectedCase(match);
          }
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeLanguageProvider>
        <AuthProvider>
          <NotificationProvider>
            <OfflineIndicator />
            <MainApp />
            <PWAInstallBanner />
            <MandatoryUpdateModal />
          </NotificationProvider>
        </AuthProvider>
      </ThemeLanguageProvider>
    </ErrorBoundary>
  );
}
