/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  FolderKanban,
  Inbox,
  UserCheck,
  BarChart3,
  Users,
  Archive,
  ShieldAlert,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Sun,
  Moon,
  Globe,
  Database,
  PhoneCall,
  ArchiveX,
  BellRing,
  BookOpen,
  BrainCircuit,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

export type NavPage =
  | 'dashboard'
  | 'cases'
  | 'incoming'
  | 'my_cases'
  | 'closed_cases'
  | 'taxpayers'
  | 'reports'
  | 'ai_insights'
  | 'users'
  | 'backups'
  | 'audit'
  | 'settings'
  | 'guide';

interface SidebarProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  onOpenNewCase: () => void;
  onOpenSendNotification?: () => void;
  incomingCasesCount?: number;
  myCasesCount?: number;
  closedCasesCount?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onRequestLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  onOpenNewCase,
  onOpenSendNotification,
  incomingCasesCount = 0,
  myCasesCount = 0,
  closedCasesCount = 0,
  isMobileOpen = false,
  onCloseMobile,
  onRequestLogout,
}) => {
  const { currentUser, logout } = useAuth();
  const { isDark, language, isRtl, toggleTheme, toggleLanguage, t } = useThemeLanguage();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentPage, isMobileOpen]);

  const role = currentUser?.role;
  const isSuperAdmin = role === 'super_admin';
  const isManagement = role === 'management';
  const isTechSupport = role === 'technical_support';
  const isAgent = role === 'agent';

  interface NavItemDef {
    id: NavPage;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
    show: boolean;
  }

  const primaryNavItems: NavItemDef[] = [
    {
      id: 'dashboard',
      label: t('navDashboard'),
      icon: LayoutDashboard,
      show: true,
    },
    {
      id: 'cases',
      label: t('navCases'),
      icon: FolderKanban,
      show: true,
    },
    {
      id: 'incoming',
      label: t('navIncoming'),
      icon: Inbox,
      badge: incomingCasesCount,
      badgeColor: 'bg-[#004B87] text-white',
      show: isSuperAdmin || isManagement || isTechSupport,
    },
    {
      id: 'my_cases',
      label: t('navMyCases'),
      icon: UserCheck,
      badge: myCasesCount,
      badgeColor: 'bg-[#00A651] text-white',
      show: true,
    },
    {
      id: 'closed_cases',
      label: t('navClosedCases'),
      icon: ArchiveX,
      badge: closedCasesCount,
      badgeColor: 'bg-slate-600 text-white',
      show: true,
    },
    {
      id: 'taxpayers',
      label: t('navTaxpayers'),
      icon: Database,
      show: true,
    },
    {
      id: 'reports',
      label: t('navReports'),
      icon: BarChart3,
      show: !isAgent && (isSuperAdmin || isManagement || isTechSupport),
    },
    {
      id: 'ai_insights',
      label: language === 'ar' ? 'تقييم الأداء ورصد المشاكل (AI)' : 'AI Performance & Issues',
      icon: BrainCircuit,
      show: !isAgent && (isSuperAdmin || isManagement || isTechSupport),
    },
  ];

  const adminNavItems: NavItemDef[] = [
    {
      id: 'users',
      label: t('navUsers'),
      icon: Users,
      show: isSuperAdmin,
    },
    {
      id: 'backups',
      label: t('navBackups'),
      icon: Archive,
      show: isSuperAdmin,
    },
    {
      id: 'audit',
      label: language === 'ar' ? 'سجل الدخول والخروج والرقابة' : t('navAudit'),
      icon: ShieldAlert,
      show: !isAgent && (isSuperAdmin || isManagement || isTechSupport),
    },
    {
      id: 'settings',
      label: t('navSettings'),
      icon: Settings,
      show: isSuperAdmin,
    },
    {
      id: 'guide',
      label: language === 'ar' ? 'دليل الاستخدام (PDF)' : 'User Guide (PDF)',
      icon: BookOpen,
      show: isSuperAdmin,
    },
  ];

  const handleNavigate = (page: NavPage) => {
    onNavigate(page);
    if (onCloseMobile) onCloseMobile();
  };

  const handleCreateCase = () => {
    onOpenNewCase();
    if (onCloseMobile) onCloseMobile();
  };

  const ChevronIcon = isRtl ? ChevronLeft : ChevronRight;
  const CollapseToggleIcon = isCollapsed
    ? isRtl
      ? PanelLeftClose
      : PanelLeftOpen
    : isRtl
    ? PanelLeftOpen
    : PanelLeftClose;

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div
        className={`fixed inset-0 bg-[#001429]/70 backdrop-blur-xs z-50 lg:hidden transition-opacity duration-300 ${
          isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      {/* Collapsible Desktop Sidebar & Smooth Mobile Drawer */}
      <aside
        className={`
          bg-[#001F3F] dark:bg-[#001429] text-slate-200 flex flex-col shrink-0 select-none text-start
          transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50
          border-[#00386B]
          /* Desktop */
          hidden lg:flex lg:static lg:h-full
          ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
          ${isRtl ? 'lg:border-l' : 'lg:border-r'}
          /* Mobile Drawer */
          ${
            isMobileOpen
              ? `!flex fixed inset-y-0 ${
                  isRtl ? 'right-0' : 'left-0'
                } w-72 max-w-[85vw] h-full shadow-2xl`
              : ''
          }
        `}
      >
        {/* Mobile Header with Close Button */}
        {isMobileOpen && (
          <div className="p-3 border-b border-[#00386B] flex items-center justify-between lg:hidden bg-[#001429]">
            <span className="font-bold text-xs text-white">{t('mainMenu')}</span>
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#003366] transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-[#00E676]" />
            </button>
          </div>
        )}

        {/* Top Action Bar: Quick Create Case + Collapse Button */}
        <div className="p-2.5 border-b border-[#00386B] flex items-center gap-2 shrink-0">
          <button
            onClick={handleCreateCase}
            title={t('createCaseQuick')}
            className={`flex-1 py-2 px-3 bg-[#00A651] hover:bg-[#008742] text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 whitespace-nowrap ${
              isCollapsed && !isMobileOpen ? 'px-0' : ''
            }`}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            {(!isCollapsed || isMobileOpen) && <span>{t('createCaseQuick')}</span>}
          </button>

          {/* Desktop Collapse Button */}
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="hidden lg:flex p-2.5 rounded-xl bg-[#002D5A] hover:bg-[#003D7A] text-slate-200 hover:text-white border border-[#004B87] transition-all duration-200 active:scale-95 shrink-0"
            title={
              isCollapsed
                ? language === 'ar'
                  ? 'توسيع القائمة الجانبية'
                  : 'Expand Sidebar'
                : language === 'ar'
                ? 'طي القائمة الجانبية'
                : 'Collapse Sidebar'
            }
            aria-label="Toggle Sidebar"
          >
            <CollapseToggleIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 text-xs overscroll-contain">
          {(!isCollapsed || isMobileOpen) && (
            <div className="px-3 py-1 text-[11px] font-bold text-sky-200/90 tracking-wide">
              {t('navOperationsGroup')}
            </div>
          )}

          {primaryNavItems
            .filter((item) => item.show)
            .map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  ref={isActive ? activeItemRef : undefined}
                  onClick={() => handleNavigate(item.id)}
                  title={isCollapsed && !isMobileOpen ? item.label : undefined}
                  className={`group relative w-full flex items-center ${
                    isCollapsed && !isMobileOpen ? 'justify-center px-2' : 'justify-between px-3'
                  } py-2 rounded-xl font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-[#004B87] text-white shadow-sm border border-[#0062B0]'
                      : 'text-slate-200 hover:bg-[#002D5A] hover:text-white hover:translate-x-0.5 rtl:hover:-translate-x-0.5'
                  }`}
                >
                  {/* Active side indicator bar */}
                  {isActive && (
                    <span
                      className={`absolute inset-y-1.5 w-1 rounded-full bg-[#00E676] ${
                        isRtl ? 'right-1' : 'left-1'
                      }`}
                    />
                  )}

                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                        isActive ? 'text-[#00E676]' : 'text-[#00E676]/85 group-hover:text-white'
                      }`}
                    />
                    {(!isCollapsed || isMobileOpen) && (
                      <span className="truncate whitespace-nowrap">{item.label}</span>
                    )}
                  </div>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`${
                        isCollapsed && !isMobileOpen
                          ? 'absolute -top-1 -right-1 px-1.5 py-0.2 text-[9px]'
                          : 'px-2 py-0.5 text-[10px]'
                      } rounded-lg font-mono font-bold tabular-nums shrink-0 ${
                        isActive
                          ? 'bg-[#00A651] text-white'
                          : item.badgeColor || 'bg-[#004B87] text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

          {/* Administration & Oversight Section (Never shown to agents) */}
          {!isAgent && (isSuperAdmin || isManagement || isTechSupport) && (
            <>
              <div className="my-1.5 border-t border-[#00386B]" />
              {(!isCollapsed || isMobileOpen) && (
                <div className="px-3 pt-1 pb-0.5 text-[11px] font-bold text-amber-300 tracking-wide">
                  {isSuperAdmin
                    ? t('navAdminGroup')
                    : language === 'ar'
                    ? 'الإشراف والرقابة والتنبيهات'
                    : 'Oversight & Notices'}
                </div>
              )}
              {adminNavItems
                .filter((item) => item.show)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      ref={isActive ? activeItemRef : undefined}
                      onClick={() => handleNavigate(item.id)}
                      title={isCollapsed && !isMobileOpen ? item.label : undefined}
                      className={`group relative w-full flex items-center ${
                        isCollapsed && !isMobileOpen ? 'justify-center px-2' : 'justify-between px-3'
                      } py-2 rounded-xl font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-[#004B87] text-white shadow-sm border border-[#0062B0]'
                          : 'text-slate-200 hover:bg-[#002D5A] hover:text-white'
                      }`}
                    >
                      {isActive && (
                        <span
                          className={`absolute inset-y-1.5 w-1 rounded-full bg-[#00E676] ${
                            isRtl ? 'right-1' : 'left-1'
                          }`}
                        />
                      )}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                            isActive ? 'text-amber-300' : 'text-amber-400'
                          }`}
                        />
                        {(!isCollapsed || isMobileOpen) && (
                          <span className="truncate whitespace-nowrap">{item.label}</span>
                        )}
                      </div>
                      {(!isCollapsed || isMobileOpen) && (
                        <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform" />
                      )}
                    </button>
                  );
                })}

              {onOpenSendNotification && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSendNotification();
                    if (onCloseMobile) onCloseMobile();
                  }}
                  title={
                    isCollapsed && !isMobileOpen
                      ? language === 'ar'
                        ? 'إرسال ومتابعة الإشعارات'
                        : 'Send Staff Notification'
                      : undefined
                  }
                  className={`group relative w-full flex items-center ${
                    isCollapsed && !isMobileOpen ? 'justify-center px-2' : 'justify-between px-3'
                  } py-2 rounded-xl font-semibold transition-all duration-150 text-slate-200 hover:bg-[#00A651] hover:text-white`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BellRing className="w-4 h-4 shrink-0 text-[#00E676] group-hover:text-white transition-transform duration-200 group-hover:scale-110" />
                    {(!isCollapsed || isMobileOpen) && (
                      <span className="truncate whitespace-nowrap">
                        {language === 'ar' ? 'إرسال إشعار للموظفين' : 'Send Staff Notice'}
                      </span>
                    )}
                  </div>
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer: Theme/Lang + Hotline 16395 + Logout */}
        <div className="p-2.5 border-t border-[#00386B] bg-[#001429] text-xs space-y-1.5 shrink-0">
          {(!isCollapsed || isMobileOpen) ? (
            <>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#001F3F] rounded-xl border border-[#00386B]">
                <button
                  onClick={toggleTheme}
                  className="py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 text-amber-300 hover:bg-[#003366] transition-colors whitespace-nowrap"
                  title={isDark ? t('themeLight') : t('themeDark')}
                >
                  {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  <span>{isDark ? t('themeLight') : t('themeDark')}</span>
                </button>
                <button
                  onClick={toggleLanguage}
                  className="py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 text-slate-100 hover:bg-[#003366] transition-colors whitespace-nowrap"
                  title="Change Language"
                >
                  <Globe className="w-3.5 h-3.5 text-[#00E676]" />
                  <span>{language === 'ar' ? 'English' : 'العربية'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#001F3F] border border-[#00386B] text-slate-200">
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <PhoneCall className="w-3.5 h-3.5 text-[#00E676]" />
                  <span>{t('hotline')}</span>
                </span>
                <span className="font-mono font-black text-[#00E676] text-xs tabular-nums">
                  16395
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl bg-[#001F3F] hover:bg-[#003366] text-amber-300 border border-[#00386B] transition-colors"
                title={isDark ? t('themeLight') : t('themeDark')}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <span
                className="font-mono font-black text-[10px] text-[#00E676] tabular-nums"
                title={`${t('hotline')}: 16395`}
              >
                16395
              </span>
            </div>
          )}

          <button
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              if (onRequestLogout) {
                onRequestLogout();
              } else {
                logout();
              }
            }}
            title={t('logout')}
            className="w-full py-2 px-3 bg-[#001F3F] hover:bg-rose-700 text-slate-200 hover:text-white border border-[#00386B] hover:border-rose-600 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 font-bold text-xs active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            {(!isCollapsed || isMobileOpen) && <span>{t('logout')}</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
