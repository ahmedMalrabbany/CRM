/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Plus,
  Inbox,
  UserCheck,
  Menu,
} from 'lucide-react';
import { NavPage } from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface MobileBottomNavProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  onOpenNewCase: () => void;
  onOpenMoreMenu: () => void;
  incomingCasesCount?: number;
  myCasesCount?: number;
  isMoreMenuOpen?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentPage,
  onNavigate,
  onOpenNewCase,
  onOpenMoreMenu,
  incomingCasesCount = 0,
  myCasesCount = 0,
  isMoreMenuOpen = false,
}) => {
  const { currentUser } = useAuth();
  const { language, t } = useThemeLanguage();
  const role = currentUser?.role;
  const isAgent = role === 'agent';

  // Secondary tab: incoming for management/tech/admin, my_cases for agent
  const secondaryPage: NavPage = isAgent ? 'my_cases' : 'incoming';
  const secondaryLabel = isAgent ? (language === 'ar' ? 'المفتوحة' : 'Open Cases') : (language === 'ar' ? 'الواردة' : 'Incoming');
  const secondaryBadge = isAgent ? myCasesCount : incomingCasesCount;
  const SecondaryIcon = isAgent ? UserCheck : Inbox;

  // Check if current page is one of the "More" pages
  const isMorePageActive =
    [
      'closed_cases',
      'taxpayers',
      ...(isAgent ? [] : ['reports', 'ai_insights']),
      'users',
      'backups',
      'audit',
      'settings',
    ].includes(currentPage) || (isAgent ? currentPage === 'incoming' : currentPage === 'my_cases');

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-[#001F3F] dark:bg-[#001429] border-t border-[#00386B] text-slate-200 lg:hidden shadow-[0_-4px_24px_rgba(0,26,53,0.4)] px-2 py-1 select-none"
      style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
      aria-label="Mobile Navigation"
    >
      <div className="grid grid-cols-5 items-center max-w-xl mx-auto">
        {/* 1. Dashboard */}
        <button
          onClick={() => onNavigate('dashboard')}
          className={`min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
            currentPage === 'dashboard'
              ? 'text-[#00E676] font-black'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <div className="relative">
            <LayoutDashboard className={`w-5 h-5 ${currentPage === 'dashboard' ? 'scale-110 text-[#00E676]' : ''} transition-transform`} />
          </div>
          <span className="text-[11px] font-bold mt-1 whitespace-nowrap">{t('navDashboard')}</span>
        </button>

        {/* 2. Cases */}
        <button
          onClick={() => onNavigate('cases')}
          className={`min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
            currentPage === 'cases'
              ? 'text-[#00E676] font-black'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <div className="relative">
            <FolderKanban className={`w-5 h-5 ${currentPage === 'cases' ? 'scale-110 text-[#00E676]' : ''} transition-transform`} />
          </div>
          <span className="text-[11px] font-bold mt-1 whitespace-nowrap">{language === 'ar' ? 'الحالات' : 'Cases'}</span>
        </button>

        {/* 3. Center Elevated Action: New Case Button */}
        <div className="flex flex-col items-center justify-center">
          <button
            onClick={onOpenNewCase}
            className="w-11 h-11 -mt-3 rounded-2xl bg-[#00A651] hover:bg-[#008742] text-white shadow-lg flex items-center justify-center active:scale-90 hover:scale-105 transition-all duration-150 border-2 border-[#001F3F]"
            title={language === 'ar' ? 'إنشاء حالة جديدة' : 'New Case'}
            aria-label={language === 'ar' ? 'إنشاء حالة جديدة' : 'New Case'}
          >
            <Plus className="w-5 h-5 stroke-[2.75]" />
          </button>
          <span className="text-[11px] font-bold text-[#00E676] mt-0.5 whitespace-nowrap">
            {language === 'ar' ? 'جديدة' : 'New'}
          </span>
        </div>

        {/* 4. Secondary (Incoming or My Cases) with Badge */}
        <button
          onClick={() => onNavigate(secondaryPage)}
          className={`min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
            currentPage === secondaryPage
              ? 'text-[#00E676] font-black'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <div className="relative">
            <SecondaryIcon className={`w-5 h-5 ${currentPage === secondaryPage ? 'scale-110 text-[#00E676]' : ''} transition-transform`} />
            {secondaryBadge > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1.5 min-w-4 h-4 bg-[#004B87] text-white text-[10px] font-bold rounded-full flex items-center justify-center font-mono tabular-nums shadow-xs border border-[#001F3F]">
                {secondaryBadge > 99 ? '99+' : secondaryBadge}
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold mt-1 whitespace-nowrap">{secondaryLabel}</span>
        </button>

        {/* 5. More Menu */}
        <button
          onClick={onOpenMoreMenu}
          className={`min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
            isMoreMenuOpen || isMorePageActive
              ? 'text-amber-400 font-black'
              : 'text-slate-300 hover:text-white'
          }`}
          aria-label={t('moreMenu')}
        >
          <div className="relative">
            <Menu className={`w-5 h-5 ${isMoreMenuOpen || isMorePageActive ? 'scale-110 text-amber-400' : ''} transition-transform`} />
          </div>
          <span className="text-[11px] font-bold mt-1 whitespace-nowrap">{t('moreMenu')}</span>
        </button>
      </div>
    </nav>
  );
};
