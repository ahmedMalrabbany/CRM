/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';
export type Language = 'ar' | 'en';
export type FontSizeOption = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type FontFamilyOption = 'cairo' | 'tajawal' | 'ibm_plex' | 'almarai' | 'amiri';

export const FONT_SIZE_OPTIONS: Array<{
  id: FontSizeOption;
  px: string;
  scaleLabel: string;
  arLabel: string;
  enLabel: string;
}> = [
  { id: 'xs', px: '14.5px', scaleLabel: '85%', arLabel: 'صغير جداً', enLabel: 'Extra Small' },
  { id: 'sm', px: '15.5px', scaleLabel: '92%', arLabel: 'صغير', enLabel: 'Small' },
  { id: 'md', px: '17px', scaleLabel: '100%', arLabel: 'قياسي', enLabel: 'Default' },
  { id: 'lg', px: '18.5px', scaleLabel: '110%', arLabel: 'كبير', enLabel: 'Large' },
  { id: 'xl', px: '20.5px', scaleLabel: '120%', arLabel: 'كبير جداً', enLabel: 'Extra Large' },
];

export const FONT_FAMILY_OPTIONS: Array<{
  id: FontFamilyOption;
  arLabel: string;
  enLabel: string;
  cssFamily: string;
  enCssFamily: string;
}> = [
  {
    id: 'cairo',
    arLabel: 'خط كايرو (الافتراضي)',
    enLabel: 'Cairo (Default)',
    cssFamily: "'Cairo', sans-serif",
    enCssFamily: "'Cairo', system-ui, sans-serif",
  },
  {
    id: 'tajawal',
    arLabel: 'خط تجوّل (عصري مرن)',
    enLabel: 'Tajawal (Modern Clean)',
    cssFamily: "'Tajawal', 'Cairo', sans-serif",
    enCssFamily: "'Tajawal', system-ui, sans-serif",
  },
  {
    id: 'ibm_plex',
    arLabel: 'آي بي إم بلكس (مؤسسي واضح)',
    enLabel: 'IBM Plex Sans Arabic',
    cssFamily: "'IBM Plex Sans Arabic', 'Cairo', sans-serif",
    enCssFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif",
  },
  {
    id: 'almarai',
    arLabel: 'خط المراعي (واضح للقراءة السريعة)',
    enLabel: 'Almarai (High Legibility)',
    cssFamily: "'Almarai', 'Cairo', sans-serif",
    enCssFamily: "'Almarai', system-ui, sans-serif",
  },
  {
    id: 'amiri',
    arLabel: 'خط أميري (نسخ رسمي كلاسيكي)',
    enLabel: 'Amiri (Classic Formal)',
    cssFamily: "'Amiri', 'Cairo', serif",
    enCssFamily: "'Amiri', Georgia, serif",
  },
];

export interface Translations {
  [key: string]: {
    ar: string;
    en: string;
  };
}

export const translations = {
  // Brand & Header
  appTitle: {
    ar: 'برنامج إدارة خدمة العملاء CRM',
    en: 'Customer Service Management CRM',
  },
  appSub: {
    ar: 'مصلحة الضرائب المصرية | وزارة المالية',
    en: 'Egyptian Tax Authority | Ministry of Finance',
  },
  callCenterSub: {
    ar: 'مركز الاتصال المتكامل - مصلحة الضرائب المصرية',
    en: 'Integrated Call Center - Egyptian Tax Authority',
  },
  hotline: {
    ar: 'الخط الساخن',
    en: 'Hotline',
  },
  systemVersion: {
    ar: 'منظومة CRM مركز الاتصال v2.4',
    en: 'Contact Center CRM System v2.4',
  },

  // Navigation
  navDashboard: {
    ar: 'الرئيسية',
    en: 'Dashboard',
  },
  navCases: {
    ar: 'سجل الحالات',
    en: 'Cases Registry',
  },
  navIncoming: {
    ar: 'الحالات الواردة للقسم',
    en: 'Incoming Section Cases',
  },
  navMyCases: {
    ar: 'الحالات المفتوحة',
    en: 'Open Cases',
  },
  navClosedCases: {
    ar: 'الحالات المغلقة',
    en: 'Closed Cases',
  },
  navTaxpayers: {
    ar: 'سجل الممولين والمتصلين',
    en: 'Taxpayers & Callers',
  },
  navReports: {
    ar: 'تقارير ومؤشرات الأداء',
    en: 'Reports & KPI Analytics',
  },
  navUsers: {
    ar: 'إدارة المستخدمين والصلاحيات',
    en: 'Users & Permissions',
  },
  navBackups: {
    ar: 'النسخ الاحتياطي والاستعادة',
    en: 'Backup & Restore',
  },
  navAudit: {
    ar: 'سجل العمليات والرقابة',
    en: 'Audit & Activity Log',
  },
  navSettings: {
    ar: 'إعدادات المنظومة',
    en: 'System Settings',
  },
  navOperationsGroup: {
    ar: 'التشغيل وخدمة الممولين',
    en: 'Operations & Taxpayer Service',
  },
  navAdminGroup: {
    ar: 'إدارة النظام والرقابة',
    en: 'System Administration & Control',
  },

  // Action Buttons & Controls
  newCase: {
    ar: '+ حالة جديدة',
    en: '+ New Case',
  },
  createCaseQuick: {
    ar: '+ إنشاء حالة جديدة',
    en: '+ Create New Case',
  },
  smartSearchPlaceholder: {
    ar: 'بحث ذكي بالذكاء الاصطناعي...',
    en: 'Smart AI Search...',
  },
  notifications: {
    ar: 'الإشعارات والتنبيهات',
    en: 'Notifications & Alerts',
  },
  markAllRead: {
    ar: 'تعليم الكل كمقروء',
    en: 'Mark all as read',
  },
  noNotifications: {
    ar: 'لا توجد إشعارات جديدة حالياً',
    en: 'No new notifications right now',
  },
  logout: {
    ar: 'تسجيل الخروج',
    en: 'Sign Out',
  },
  mainMenu: {
    ar: 'القائمة الرئيسية',
    en: 'Main Menu',
  },
  moreMenu: {
    ar: 'المزيد',
    en: 'More',
  },

  // Theme & Language
  themeLight: {
    ar: 'الوضع النهاري',
    en: 'Light Mode',
  },
  themeDark: {
    ar: 'الوضع الليلي',
    en: 'Dark Mode',
  },
  langArabic: {
    ar: 'العربية',
    en: 'Arabic',
  },
  langEnglish: {
    ar: 'English',
    en: 'English',
  },

  // Roles
  roleSuperAdmin: {
    ar: 'مشرف عام النظام',
    en: 'Super Administrator',
  },
  roleDeptManager: {
    ar: 'الإدارة والدعم التقني',
    en: 'Management & Tech Support',
  },
  roleTechSupport: {
    ar: 'الإدارة والدعم التقني',
    en: 'Management & Tech Support',
  },
  roleCallAgent: {
    ar: 'وكيل اتصال',
    en: 'Call Agent',
  },

  // Dashboard Filters & Stats
  welcomeUser: {
    ar: 'مرحباً بك،',
    en: 'Welcome,',
  },
  dashboardSub: {
    ar: 'مصلحة الضرائب المصرية | متابعة وإدارة حالات واستفسارات الممولين',
    en: 'Egyptian Tax Authority | Monitoring and managing taxpayer cases & inquiries',
  },
  filterToday: {
    ar: 'اليوم',
    en: 'Today',
  },
  filterWeek: {
    ar: 'الأسبوع',
    en: 'Week',
  },
  filterMonth: {
    ar: 'الشهر',
    en: 'Month',
  },
  filterAll: {
    ar: 'الكل',
    en: 'All',
  },
  statTotalCases: {
    ar: 'إجمالي الحالات',
    en: 'Total Cases',
  },
  statTotalSub: {
    ar: 'جميع التذاكر المسجلة بالمنظومة',
    en: 'All tickets logged in system',
  },
  statPending: {
    ar: 'حالات قيد الانتظار',
    en: 'Pending Cases',
  },
  statPendingSub: {
    ar: 'بانتظار الإسناد أو التحويل',
    en: 'Awaiting assignment or transfer',
  },
  statInProgress: {
    ar: 'حالات قيد المعالجة',
    en: 'In Progress Cases',
  },
  statInProgressSub: {
    ar: 'يجري العمل عليها ومتابعتها',
    en: 'Currently under active follow-up',
  },
  statClosed: {
    ar: 'حالات مغلقة (معدل الإنجاز)',
    en: 'Closed Cases (Resolution Rate)',
  },
  statClosedSub: {
    ar: 'تم حلها وإغلاقها نهائياً',
    en: 'Fully resolved and closed',
  },
  statRegisteredToday: {
    ar: 'حالات تم تسجيلها اليوم',
    en: 'Cases Logged Today',
  },
  statUrgent: {
    ar: 'حالات حرجة وعاجلة',
    en: 'Critical / Urgent Cases',
  },
  statAvgTime: {
    ar: 'متوسط سرعة الإنجاز',
    en: 'Avg. Resolution Speed',
  },
  statSatisfaction: {
    ar: 'نسبة رضا الممولين',
    en: 'Taxpayer Satisfaction',
  },
  quickActions: {
    ar: 'إجراءات سريعة',
    en: 'Quick Actions',
  },
  recentCases: {
    ar: 'أحدث الحالات المسجلة',
    en: 'Recent Cases',
  },
  viewAll: {
    ar: 'عرض الكل',
    en: 'View All',
  },

  // Case Statuses
  statusNew: {
    ar: 'جديدة',
    en: 'New',
  },
  statusInProgress: {
    ar: 'قيد المعالجة',
    en: 'In Progress',
  },
  statusTransferredDept: {
    ar: 'محولة للإدارة',
    en: 'Transferred to Dept',
  },
  statusTransferredTech: {
    ar: 'محولة للدعم الفني',
    en: 'Transferred to Tech',
  },
  statusResolved: {
    ar: 'تم الحل',
    en: 'Resolved',
  },
  statusClosed: {
    ar: 'مغلقة',
    en: 'Closed',
  },

  // Priorities
  priorityLow: {
    ar: 'منخفضة',
    en: 'Low',
  },
  priorityNormal: {
    ar: 'عادية',
    en: 'Normal',
  },
  priorityHigh: {
    ar: 'عالية',
    en: 'High',
  },
  priorityUrgent: {
    ar: 'حرجة / عاجلة',
    en: 'Critical / Urgent',
  },

  // Login Page
  loginOfficialPortal: {
    ar: 'بوابة تسجيل الدخول',
    en: 'Sign-In Portal',
  },
  tabAgents: {
    ar: 'وكلاء الاتصال',
    en: 'Call Agents',
  },
  tabManagementTech: {
    ar: 'الإدارة والدعم التقني',
    en: 'Management & Support',
  },
  tabAdmin: {
    ar: 'مدير النظام',
    en: 'System Admin',
  },
  agentNationalId: {
    ar: 'الرقم القومي لوكيل الاتصال (14 رقماً) *',
    en: 'Agent National ID (14 digits) *',
  },
  password: {
    ar: 'كلمة المرور *',
    en: 'Password *',
  },
  signInButton: {
    ar: 'تسجيل الدخول للنظام',
    en: 'Sign In to System',
  },
  quickDemoAccess: {
    ar: 'الدخول التجريبي السريع المباشر:',
    en: 'Quick Demo Direct Access:',
  },
  loginCopyright: {
    ar: 'منظومة إدارة علاقات العملاء وخدمة الممولين لمركز الاتصال المتكامل بمصلحة الضرائب المصرية',
    en: 'Customer Relationship Management & Taxpayer Service System - Egyptian Tax Authority Integrated Call Center',
  },
  preparedBy: {
    ar: 'تم الاعداد والتصميم بواسطة',
    en: 'تم الاعداد والتصميم بواسطة',
  },
};

interface ThemeLanguageContextType {
  theme: Theme;
  language: Language;
  fontSize: FontSizeOption;
  fontFamily: FontFamilyOption;
  isDark: boolean;
  isRtl: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
  setFontSize: (size: FontSizeOption) => void;
  setFontFamily: (family: FontFamilyOption) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetTypography: () => void;
  t: (key: keyof typeof translations) => string;
}

const ThemeLanguageContext = createContext<ThemeLanguageContextType | undefined>(undefined);

export const ThemeLanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme state: defaults to light (or stored preference)
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('eta_crm_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return 'light';
    } catch {
      return 'light';
    }
  });

  // Language state: defaults to Arabic 'ar' (or stored preference)
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('eta_crm_lang');
      if (saved === 'ar' || saved === 'en') return saved;
      return 'ar';
    } catch {
      return 'ar';
    }
  });

  // Font size state: defaults to 'md' (100% / 17px)
  const [fontSize, setFontSizeState] = useState<FontSizeOption>(() => {
    try {
      const saved = localStorage.getItem('eta_crm_font_size') as FontSizeOption | null;
      if (saved && FONT_SIZE_OPTIONS.some((o) => o.id === saved)) return saved;
      return 'md';
    } catch {
      return 'md';
    }
  });

  // Font family state: defaults to 'cairo'
  const [fontFamily, setFontFamilyState] = useState<FontFamilyOption>(() => {
    try {
      const saved = localStorage.getItem('eta_crm_font_family') as FontFamilyOption | null;
      if (saved && FONT_FAMILY_OPTIONS.some((o) => o.id === saved)) return saved;
      return 'cairo';
    } catch {
      return 'cairo';
    }
  });

  // Sync theme changes with HTML document element
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
      localStorage.setItem('eta_crm_theme', theme);
    } catch (e) {
      console.warn('Failed to update theme storage', e);
    }
  }, [theme]);

  // Sync language, direction & store writing-field font preferences
  useEffect(() => {
    try {
      const root = document.documentElement;
      root.setAttribute('lang', language);
      root.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
      if (language === 'ar') {
        document.body.style.fontFamily = "'Cairo', sans-serif";
      } else {
        document.body.style.fontFamily =
          "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      }
      localStorage.setItem('eta_crm_lang', language);
    } catch (e) {
      console.warn('Failed to update language storage', e);
    }
  }, [language]);

  useEffect(() => {
    try {
      localStorage.setItem('eta_crm_font_size', fontSize);
      localStorage.setItem('eta_crm_font_family', fontFamily);
    } catch (e) {
      console.warn('Failed to update editor typography storage', e);
    }
  }, [fontSize, fontFamily]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  const toggleLanguage = () => {
    setLanguageState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const setFontSize = (size: FontSizeOption) => {
    setFontSizeState(size);
  };

  const setFontFamily = (family: FontFamilyOption) => {
    setFontFamilyState(family);
  };

  const increaseFontSize = () => {
    const idx = FONT_SIZE_OPTIONS.findIndex((o) => o.id === fontSize);
    if (idx < FONT_SIZE_OPTIONS.length - 1) {
      setFontSizeState(FONT_SIZE_OPTIONS[idx + 1].id);
    }
  };

  const decreaseFontSize = () => {
    const idx = FONT_SIZE_OPTIONS.findIndex((o) => o.id === fontSize);
    if (idx > 0) {
      setFontSizeState(FONT_SIZE_OPTIONS[idx - 1].id);
    }
  };

  const resetTypography = () => {
    setFontSizeState('md');
    setFontFamilyState('cairo');
  };

  const t = (key: keyof typeof translations): string => {
    const item = translations[key];
    if (!item) return key as string;
    return item[language] || item.ar;
  };

  const isDark = theme === 'dark';
  const isRtl = language === 'ar';

  return (
    <ThemeLanguageContext.Provider
      value={{
        theme,
        language,
        fontSize,
        fontFamily,
        isDark,
        isRtl,
        toggleTheme,
        setTheme,
        toggleLanguage,
        setLanguage,
        setFontSize,
        setFontFamily,
        increaseFontSize,
        decreaseFontSize,
        resetTypography,
        t,
      }}
    >
      {children}
    </ThemeLanguageContext.Provider>
  );
};

export const useThemeLanguage = (): ThemeLanguageContextType => {
  const context = useContext(ThemeLanguageContext);
  if (!context) {
    throw new Error('useThemeLanguage must be used within a ThemeLanguageProvider');
  }
  return context;
};
