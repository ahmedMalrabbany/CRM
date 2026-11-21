/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Headphones,
  Briefcase,
  Shield,
  ArrowRightLeft,
  Sun,
  Moon,
  Globe,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import { CrmLogo } from '../components/EtaLogo';
import { lookupEmployeeInfo } from '../services/userService';
import { Footer } from '../components/Footer';
import { InteractiveBackground } from '../components/InteractiveBackground';
import { PWAInstallButton } from '../components/PWAInstallPrompt';

export type LoginSection = 'agents' | 'management_tech' | 'admin';

export const LoginPage: React.FC = () => {
  const { login, currentUser, isVerifiedInScreen, confirmIdentity, logout } = useAuth();
  const { isDark, language, isRtl, toggleTheme, toggleLanguage, t } = useThemeLanguage();
  const [activeSection, setActiveSection] = useState<LoginSection>('agents');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live lookup from database to display employee name and job title
  const [detectedEmployee, setDetectedEmployee] = useState<{
    fullName: string;
    jobTitle: string;
    role: string;
    crmUser: string;
    nationalId: string;
    status: string;
  } | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Reset error on section switch
  const handleSectionChange = (section: LoginSection) => {
    setActiveSection(section);
    setErrorMsg(null);
  };

  // Debounced lookup when user types in username / nationalId
  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      setDetectedEmployee(null);
      setIsLookingUp(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLookingUp(true);
      try {
        const found = await lookupEmployeeInfo(trimmed);
        setDetectedEmployee(found);
      } catch (err) {
        console.warn('Lookup error:', err);
        setDetectedEmployee(null);
      } finally {
        setIsLookingUp(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Strict validation: do not allow login from wrong section
    if (isRoleMismatch) {
      const targetPortal = recommendedSection ? sectionConfig[recommendedSection].title : '';
      setErrorMsg(
        language === 'ar'
          ? `غير مصرح لك بتسجيل الدخول من هذه الشاشة. يجب تسجيل الدخول حصراً من (${targetPortal}).`
          : `Sign in is not permitted from this screen. You must sign in exclusively from (${targetPortal}).`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await login(username.trim(), password.trim(), activeSection);
      if (!res.success && res.errorMessage) {
        setErrorMsg(res.errorMessage);
      }
    } catch (err: any) {
      setErrorMsg(err.message || (language === 'ar' ? 'فشل تسجيل الدخول. تحقق من صحة البيانات.' : 'Login failed. Please check credentials.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // If user is already authenticated in Firebase but awaiting session screen confirmation
  if (currentUser && !isVerifiedInScreen) {
    return (
      <div
        className="relative min-h-screen flex flex-col justify-between p-4 selection:bg-[#00A651] selection:text-white overflow-x-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <InteractiveBackground variant="login" />

        {/* Top Controls Bar */}
        <div className="relative z-10 max-w-lg mx-auto w-full flex items-center justify-end gap-2 pt-2">
          <PWAInstallButton variant="login" />
          <button
            onClick={toggleTheme}
            className="p-2 min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-amber-300 border border-white/20 backdrop-blur-md transition-all text-xs flex items-center gap-1.5"
            title={isDark ? t('themeLight') : t('themeDark')}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-sky-200" />}
            <span className="text-[11px] font-bold text-white hidden sm:inline">{isDark ? t('themeLight') : t('themeDark')}</span>
          </button>
          <button
            onClick={toggleLanguage}
            className="px-2.5 py-1.5 min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md transition-all text-xs font-bold flex items-center gap-1.5"
            title="Change Language"
          >
            <Globe className="w-4 h-4 text-[#00A651]" />
            <span className="font-mono text-[11px]">{language === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>

        <div className="relative z-10 flex-1 flex items-center justify-center py-6">
          <div className="w-full max-w-md bg-white/94 dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-700/80 overflow-hidden flex flex-col animate-scale-in text-start">
            {/* Header */}
            <div className="bg-[#00386B] p-6 text-white text-center flex flex-col items-center relative overflow-hidden border-b border-[#004B87]">
              <CrmLogo size={96} lightMode={true} noShadow={true} title="CRM" subtitle={t('appSub')} />
              <h2 className="font-black text-base sm:text-lg text-white mt-3">
                {language === 'ar' ? 'تأكيد هوية الموظف وبدء الجلسة' : 'Confirm Employee Identity & Start Session'}
              </h2>
              <p className="text-xs text-sky-100/80 mt-1">
                {t('callCenterSub')}
              </p>
            </div>

            {/* Profile Confirmation Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 bg-emerald-50 dark:bg-[#002447]/60 border border-emerald-200 dark:border-[#00A651]/40 rounded-2xl flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#00A651] text-white flex items-center justify-center font-black text-lg shrink-0 shadow-xs">
                  {currentUser.fullName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-sm text-slate-900 dark:text-white truncate">
                    {currentUser.fullName}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 font-medium text-[11px]">
                    {currentUser.jobTitle || (language === 'ar' ? 'موظف مصلحة الضرائب' : 'Tax Authority Staff')}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] bg-white dark:bg-[#001730] px-1.5 py-0.5 rounded-md border border-emerald-300 dark:border-[#00386b] text-slate-800 dark:text-slate-200 font-bold">
                      {currentUser.crmUser}
                    </span>
                    <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold">
                      {currentUser.role === 'super_admin'
                        ? t('roleSuperAdmin')
                        : currentUser.role === 'agent'
                        ? t('roleCallAgent')
                        : currentUser.role === 'management'
                        ? t('roleDeptManager')
                        : t('roleTechSupport')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={confirmIdentity}
                  className="w-full py-3 bg-[#00A651] hover:bg-[#008742] text-white font-black text-xs rounded-xl shadow-md shadow-[#00A651]/25 flex items-center justify-center gap-2 transition-all hover:scale-101"
                >
                  <span>{language === 'ar' ? 'تأكيد الهوية والدخول إلى لوحة التحكم' : 'Confirm Identity & Enter Dashboard'}</span>
                  {isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => logout('manual')}
                  className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                  {language === 'ar' ? 'تسجيل الخروج والتبديل لحساب آخر' : 'Sign Out & Switch Account'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mandatory Attribution Footer */}
        <div className="relative z-10">
          <Footer />
        </div>
      </div>
    );
  }

  // Section details
  const sectionConfig = {
    agents: {
      title: language === 'ar' ? 'تسجيل دخول وكلاء الاتصال' : 'Call Agents Sign In',
      subtitle:
        language === 'ar'
          ? 'مخصص لوكلاء الاتصال وممثلي خدمة العملاء بالرقم القومي (14 رقم)'
          : 'Dedicated for Call Agents & Taxpayer Service Reps (14-digit National ID)',
      badge: language === 'ar' ? 'بوابة وكلاء الاتصال' : 'Agents Portal',
      badgeColor: 'bg-emerald-50 dark:bg-emerald-950/40 text-[#00A651] border-emerald-200 dark:border-emerald-800',
      activeTabClass: 'bg-[#00A651] text-white shadow-md',
      bannerBg: 'bg-[#E6F7EF] dark:bg-[#00264D] border-emerald-200 dark:border-[#004B87]',
      iconBg: 'bg-emerald-100 dark:bg-[#003324] text-[#00A651]',
      btnBg: 'bg-[#00A651] hover:bg-[#008742]',
      userLabel: language === 'ar' ? 'الرقم القومي أو اسم المستخدم / كود CRM *' : 'National ID, Username, or CRM Code *',
      userPlaceholder: language === 'ar' ? 'أدخل الرقم القومي (14 رقماً) أو اسم المستخدم أو كود CRM...' : 'Enter 14-digit National ID, Username, or CRM code...',
      userHelp: language === 'ar' ? 'يمكن تسجيل الدخول بالرقم القومي أو اسم المستخدم أو كود CRM المسجل بقاعدة البيانات' : 'Sign in using your registered National ID, Username, or CRM Code',
      icon: Headphones,
    },
    management_tech: {
      title: language === 'ar' ? 'تسجيل دخول الادارة والدعم التقني' : 'Management & Support Sign In',
      subtitle:
        language === 'ar'
          ? 'مخصص لمسؤولي إدارة العمليات والمتابعة وفرق الدعم التقني'
          : 'Dedicated for Operations Management, Quality Supervisors & Tech Support',
      badge: language === 'ar' ? 'بوابة الإدارة والدعم التقني' : 'Management & Tech Portal',
      badgeColor: 'bg-[#EBF4FC] dark:bg-[#002B54] text-[#004B87] dark:text-sky-300 border-blue-200 dark:border-[#004B87]',
      activeTabClass: 'bg-[#004B87] text-white shadow-md',
      bannerBg: 'bg-[#EBF4FC] dark:bg-[#00264D] border-blue-200 dark:border-[#004B87]',
      iconBg: 'bg-blue-100 dark:bg-[#00386B] text-[#004B87] dark:text-sky-300',
      btnBg: 'bg-[#004B87] hover:bg-[#00386B]',
      userLabel: language === 'ar' ? 'الرقم القومي أو كود المستخدم (CRM) *' : 'National ID or CRM Code *',
      userPlaceholder: language === 'ar' ? 'أدخل الرقم القومي (14 رقماً) أو كود المستخدم...' : 'Enter 14-digit National ID or CRM Code...',
      userHelp: language === 'ar' ? 'يمكن تسجيل الدخول بالرقم القومي (14 رقماً) أو كود CRM المعتمد' : 'Log in using 14-digit National ID or approved CRM Code',
      icon: Briefcase,
    },
    admin: {
      title: language === 'ar' ? 'تسجيل دخول مدير البرنامج' : 'Super Administrator Sign In',
      subtitle:
        language === 'ar'
          ? 'لوحة الدخول المركزية لمدير النظام والإشراف والتحكم الشامل'
          : 'Central Administrative Access for Full System Oversight & Configuration',
      badge: language === 'ar' ? 'بوابة مدير البرنامج' : 'Admin Portal',
      badgeColor: 'bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      activeTabClass: 'bg-amber-600 text-white shadow-md',
      bannerBg: 'bg-amber-50 dark:bg-[#00264D] border-amber-200 dark:border-[#004B87]',
      iconBg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300',
      btnBg: 'bg-amber-600 hover:bg-amber-700',
      userLabel: language === 'ar' ? 'اسم مستخدم مدير البرنامج (admin) أو الرقم القومي *' : 'Administrator Username (admin) or National ID *',
      userPlaceholder: language === 'ar' ? 'أدخل اسم المستخدم (admin) أو الرقم القومي...' : 'Enter admin or National ID...',
      userHelp: language === 'ar' ? 'مخصص للمسؤول الرئيسي عن المنظومة بكامل الصلاحيات' : 'Dedicated to the Primary System Administrator with full authority',
      icon: ShieldCheck,
    },
  };

  const currentConfig = sectionConfig[activeSection];
  const CurrentIcon = currentConfig.icon;

  // Check if detected employee role mismatches current section (strictly partitioned)
  const isRoleMismatch =
    detectedEmployee &&
    ((activeSection === 'agents' && detectedEmployee.role !== 'agent') ||
      (activeSection === 'management_tech' &&
        detectedEmployee.role !== 'management' &&
        detectedEmployee.role !== 'technical_support') ||
      (activeSection === 'admin' && detectedEmployee.role !== 'super_admin'));

  const getRecommendedSection = (): LoginSection | null => {
    if (!detectedEmployee) return null;
    if (detectedEmployee.role === 'agent') return 'agents';
    if (detectedEmployee.role === 'management' || detectedEmployee.role === 'technical_support')
      return 'management_tech';
    if (detectedEmployee.role === 'super_admin') return 'admin';
    return null;
  };

  const recommendedSection = getRecommendedSection();

  return (
    <div
      className="relative min-h-screen flex flex-col justify-between p-3 sm:p-4 selection:bg-[#00A651] selection:text-white overflow-x-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <InteractiveBackground variant="login" />

      {/* Top Utility Controls (Theme & Language) */}
      <div className="relative z-10 max-w-lg mx-auto w-full flex items-center justify-between gap-2 pt-2 px-1">
        <div className="flex items-center gap-1.5 text-xs text-sky-200/90 font-bold">
          <span>{t('hotline')}: <strong className="font-mono text-white tabular-nums">16395</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <PWAInstallButton variant="login" />

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-amber-300 border border-white/20 backdrop-blur-md transition-all text-xs flex items-center gap-1.5"
            title={isDark ? t('themeLight') : t('themeDark')}
            aria-label={isDark ? t('themeLight') : t('themeDark')}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-sky-200" />}
            <span className="text-[11px] font-bold text-white hidden sm:inline">
              {isDark ? t('themeLight') : t('themeDark')}
            </span>
          </button>

          {/* Language Switch */}
          <button
            onClick={toggleLanguage}
            className="px-2.5 py-1.5 min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md transition-all text-xs font-bold flex items-center gap-1.5"
            title="Change Language"
          >
            <Globe className="w-4 h-4 text-[#00A651]" />
            <span className="font-mono text-[11px]">{language === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center py-4">
        <div className="w-full max-w-lg bg-white/94 dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-700/80 overflow-hidden flex flex-col text-start animate-fade-up">
          {/* Top Official Banner (Solid ETA Royal Navy - No Gradients) */}
          <div className="bg-[#00386B] p-5 sm:p-7 text-white text-center flex flex-col items-center border-b border-[#004B87] relative overflow-hidden">
            <CrmLogo size={108} lightMode={true} noShadow={true} title="CRM" subtitle={t('appSub')} />
            <h1 className="font-['Outfit',sans-serif] font-black text-4xl sm:text-5xl text-white mt-3 tracking-[0.22em] uppercase drop-shadow-sm">
              CRM
            </h1>
            <div className="text-xs font-bold text-[#00A651] mt-1">
              {t('callCenterSub')}
            </div>
            <div className="text-[11px] text-sky-100/80 mt-1">
              {t('loginOfficialPortal')}
            </div>
          </div>

          {/* 3-Section Segmented Navigation Switcher */}
          <div className="bg-[#001c38] p-2 border-b border-[#00386b]">
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#001730] rounded-2xl border border-[#00386b]">
              <button
                type="button"
                onClick={() => handleSectionChange('agents')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1.5 text-center ${
                  activeSection === 'agents'
                    ? sectionConfig.agents.activeTabClass
                    : 'text-slate-300 hover:text-white hover:bg-[#002447]'
                }`}
              >
                <Headphones className="w-4 h-4" />
                <span className="leading-tight text-[11px] sm:text-xs">{t('tabAgents')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSectionChange('management_tech')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1.5 text-center ${
                  activeSection === 'management_tech'
                    ? sectionConfig.management_tech.activeTabClass
                    : 'text-slate-300 hover:text-white hover:bg-[#002447]'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                <span className="leading-tight text-[11px] sm:text-xs">{t('tabManagementTech')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSectionChange('admin')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1.5 text-center ${
                  activeSection === 'admin'
                    ? sectionConfig.admin.activeTabClass
                    : 'text-slate-300 hover:text-white hover:bg-[#002447]'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="leading-tight text-[11px] sm:text-xs">{t('tabAdmin')}</span>
              </button>
            </div>
          </div>

          {/* Section Header Context */}
          <div className={`p-4 border-b flex items-center justify-between gap-3 ${currentConfig.bannerBg}`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${currentConfig.iconBg}`}>
                <CurrentIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                  {currentConfig.title}
                </h2>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
                  {currentConfig.subtitle}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 hidden sm:inline-block ${currentConfig.badgeColor}`}>
              {currentConfig.badge}
            </span>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-900 dark:text-rose-200 font-bold flex items-center gap-2 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-bold text-slate-700 dark:text-slate-200">
                  {currentConfig.userLabel}
                </label>
                <span className="text-[10px] text-slate-400 font-medium">
                  {language === 'ar' ? 'قاعدة البيانات' : 'Database'}
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  autoComplete="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={currentConfig.userPlaceholder}
                  className={`w-full p-3 ${
                    isRtl ? 'pl-10' : 'pr-10'
                  } bg-slate-50 dark:bg-[#001730] border border-slate-300 dark:border-[#00386b] rounded-xl focus:ring-2 focus:ring-[#00A651] font-mono font-bold text-slate-900 dark:text-white placeholder:text-slate-400 text-sm`}
                  required
                />
                <User
                  className={`w-4 h-4 text-slate-400 absolute ${
                    isRtl ? 'left-3' : 'right-3'
                  } top-3.5`}
                />
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-400 mt-1 block">
                {currentConfig.userHelp}
              </span>

              {/* Dynamic Employee Identification from Database during typing */}
              {isLookingUp && (
                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 animate-pulse">
                  <span className="w-3 h-3 border-2 border-[#00A651] border-t-transparent rounded-full animate-spin"></span>
                  <span>
                    {language === 'ar'
                      ? 'جارٍ التحقق والمطابقة مع قاعدة البيانات...'
                      : 'Verifying against database records...'}
                  </span>
                </div>
              )}

              {detectedEmployee && !isLookingUp && (
                <div className="mt-2.5 p-3 bg-emerald-50/95 dark:bg-[#002447]/80 border border-emerald-300/80 dark:border-[#00A651]/40 rounded-2xl text-emerald-950 dark:text-sky-100 space-y-2 shadow-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-[#16b962] font-bold text-[11px]">
                      <CheckCircle2 className="w-4 h-4 text-[#00A651] shrink-0" />
                      <span>
                        {language === 'ar' ? 'بيانات المستخدم مطابقة بقاعدة البيانات:' : 'Verified Database Match:'}
                      </span>
                    </div>
                    <span className="text-[10px] bg-emerald-200/90 dark:bg-[#00A651]/30 text-emerald-950 dark:text-[#16b962] px-2 py-0.5 rounded-md font-mono font-black border border-emerald-300 dark:border-emerald-600">
                      {detectedEmployee.crmUser}
                    </span>
                  </div>
                  <div className="bg-white/90 dark:bg-[#001730] p-2.5 rounded-xl border border-emerald-200/70 dark:border-[#00386b] space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-bold">
                        {language === 'ar' ? 'الاسم:' : 'Name:'}
                      </span>
                      <span className="font-black text-slate-900 dark:text-white">{detectedEmployee.fullName}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-bold">
                        {language === 'ar' ? 'الوظيفة:' : 'Position:'}
                      </span>
                      <span className="font-bold text-[#00A651]">{detectedEmployee.jobTitle}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-bold">CRM User:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{detectedEmployee.crmUser}</span>
                    </div>
                  </div>

                  {/* Section mismatch guidance - Strict Enforced Notice */}
                  {isRoleMismatch && recommendedSection && (
                    <div className="pt-2">
                      <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-xl space-y-2">
                        <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-300 font-bold text-xs">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>
                            {language === 'ar'
                              ? 'تنبيه: محاولة دخول من شاشة غير مصرح بها'
                              : 'Warning: Unauthorized Screen Attempt'}
                          </span>
                        </div>
                        <p className="text-[11px] text-rose-700 dark:text-rose-300/90 leading-relaxed">
                          {language === 'ar'
                            ? `حسابك مسجل كـ (${detectedEmployee.jobTitle}) ويُحظر تسجيل الدخول إلا من خلال الشاشة الخاصة بك حصراً.`
                            : `Your account is registered as (${detectedEmployee.jobTitle}) and sign-in is strictly restricted to your dedicated portal.`}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleSectionChange(recommendedSection)}
                          className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-black text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>
                            {language === 'ar'
                              ? `الانتقال فوراً إلى (${sectionConfig[recommendedSection].title})`
                              : `Switch Now to (${sectionConfig[recommendedSection].title})`}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1.5">
                {language === 'ar' ? 'كلمة المرور المسجلة بقاعدة البيانات *' : 'Database Password *'}
              </label>
              <div className="relative">
                <input
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={language === 'ar' ? 'أدخل كلمة المرور الخاصة بك...' : 'Enter your password...'}
                  className={`w-full p-3 ${
                    isRtl ? 'pl-10' : 'pr-10'
                  } bg-slate-50 dark:bg-[#001730] border border-slate-300 dark:border-[#00386b] rounded-xl focus:ring-2 focus:ring-[#00A651] font-mono font-bold text-slate-900 dark:text-white placeholder:text-slate-400 text-sm`}
                  required
                />
                <Lock
                  className={`w-4 h-4 text-slate-400 absolute ${
                    isRtl ? 'left-3' : 'right-3'
                  } top-3.5`}
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !!isRoleMismatch}
                className={`w-full py-3 text-white font-black text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 hover:scale-101 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isRoleMismatch ? 'bg-slate-500 cursor-not-allowed' : currentConfig.btnBg
                }`}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>
                      {language === 'ar' ? 'جارٍ التحقق من قاعدة البيانات...' : 'Verifying with database...'}
                    </span>
                  </>
                ) : isRoleMismatch ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>
                      {language === 'ar'
                        ? 'الدخول محظور من هذه الشاشة - انتقل لشاشتك'
                        : 'Blocked on this screen - Switch to your portal'}
                    </span>
                  </>
                ) : (
                  <>
                    <span>{currentConfig.title}</span>
                    {isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </>
                )}
              </button>
            </div>

            <div className="pt-2 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#00A651]" />
              <span>
                {language === 'ar'
                  ? 'دخول مشفر ومؤمن بالكامل عبر قاعدة البيانات السحابية'
                  : 'Encrypted & secured authentication via Cloud Database'}
              </span>
            </div>
          </form>
        </div>
      </div>

      {/* Mandatory Attribution Footer */}
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
};
