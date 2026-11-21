import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Share, PlusSquare, MoreVertical, X, WifiOff, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

const BANNER_DISMISS_KEY = 'crm_eta_pwa_banner_dismissed';

interface InstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
}

const InstallGuideModal: React.FC<InstallGuideModalProps> = ({ isOpen, onClose, isIOS }) => {
  const { language, isRtl } = useThemeLanguage();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 animate-fade-in"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#0B1D35] rounded-3xl shadow-2xl border border-slate-200 dark:border-[#004B87] overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Solid ETA Header */}
        <div className="bg-[#00264D] p-5 text-white flex items-center justify-between border-b border-[#004B87]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white p-1 flex items-center justify-center shrink-0">
              <img
                src="/pwa-192x192.png"
                alt="CRM - مصلحة الضرائب المصرية"
                className="w-full h-full object-contain rounded-xl"
              />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">
                {language === 'ar' ? 'تثبيت برنامج CRM على الموبايل' : 'Install CRM on Mobile'}
              </h3>
              <p className="text-[11px] text-sky-200">
                {language === 'ar' ? 'مصلحة الضرائب المصرية' : 'Egyptian Tax Authority'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-[#003366] hover:bg-[#004B87] text-slate-200 hover:text-white transition-colors"
            aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* App Icon Preview Showing Seal + "CRM" Label */}
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-white border-2 border-[#004B87] p-1 shadow-md flex items-center justify-center">
                <img
                  src="/pwa-192x192.png"
                  alt="CRM"
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>
              <span className="text-xs font-black tracking-wider text-[#00264D] dark:text-white">
                CRM
              </span>
            </div>

            <div className="flex-1 text-xs space-y-1">
              <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#00A651] shrink-0" />
                <span>
                  {language === 'ar' ? 'شكل الأيقونة بعد التثبيت' : 'Home Screen Icon Preview'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                {language === 'ar'
                  ? 'سيظهر شعار مصلحة الضرائب المصرية على شاشة هاتفك وأسفله كلمة CRM لتشغيل المنظومة مباشرة كتطبيق مستقل.'
                  : 'The Egyptian Tax Authority emblem will appear on your home screen with CRM underneath for instant standalone launch.'}
              </p>
            </div>
          </div>

          {/* OS-Specific Steps */}
          {isIOS ? (
            <div className="space-y-2.5 text-xs">
              <div className="font-black text-[#004B87] dark:text-sky-300">
                {language === 'ar' ? 'خطوات التثبيت على iPhone / iPad (Safari):' : 'Steps for iPhone / iPad (Safari):'}
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#001D3D] border border-slate-200 dark:border-[#00386B]">
                <span className="w-6 h-6 rounded-lg bg-[#004B87] text-white font-black flex items-center justify-center shrink-0">1</span>
                <Share className="w-4 h-4 text-[#004B87] dark:text-sky-300 shrink-0" />
                <span className="text-slate-700 dark:text-slate-200 font-bold">
                  {language === 'ar'
                    ? 'اضغط على أيقونة المشاركة (Share) أسفل الشاشة'
                    : 'Tap the Share icon at the bottom of Safari'}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#001D3D] border border-slate-200 dark:border-[#00386B]">
                <span className="w-6 h-6 rounded-lg bg-[#004B87] text-white font-black flex items-center justify-center shrink-0">2</span>
                <PlusSquare className="w-4 h-4 text-[#00A651] shrink-0" />
                <span className="text-slate-700 dark:text-slate-200 font-bold">
                  {language === 'ar'
                    ? 'اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen)'
                    : 'Select "Add to Home Screen"'}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-[#003324] border border-emerald-200 dark:border-[#00A651]/40">
                <span className="w-6 h-6 rounded-lg bg-[#00A651] text-white font-black flex items-center justify-center shrink-0">3</span>
                <CheckCircle2 className="w-4 h-4 text-[#00A651] shrink-0" />
                <span className="text-emerald-950 dark:text-emerald-200 font-bold">
                  {language === 'ar'
                    ? 'اضغط "إضافة" (Add) لتثبيت برنامج CRM'
                    : 'Tap "Add" to install CRM on your device'}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              <div className="font-black text-[#004B87] dark:text-sky-300">
                {language === 'ar' ? 'خطوات التثبيت على Android (Chrome / Edge):' : 'Steps for Android (Chrome / Edge):'}
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#001D3D] border border-slate-200 dark:border-[#00386B]">
                <span className="w-6 h-6 rounded-lg bg-[#004B87] text-white font-black flex items-center justify-center shrink-0">1</span>
                <MoreVertical className="w-4 h-4 text-[#004B87] dark:text-sky-300 shrink-0" />
                <span className="text-slate-700 dark:text-slate-200 font-bold">
                  {language === 'ar'
                    ? 'افتح قائمة المتصفح (⋮) أعلى الشاشة'
                    : 'Open the browser menu (⋮) in the top corner'}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#001D3D] border border-slate-200 dark:border-[#00386B]">
                <span className="w-6 h-6 rounded-lg bg-[#00A651] text-white font-black flex items-center justify-center shrink-0">2</span>
                <Smartphone className="w-4 h-4 text-[#00A651] shrink-0" />
                <span className="text-slate-700 dark:text-slate-200 font-bold">
                  {language === 'ar'
                    ? 'اختر "تثبيت التطبيق" أو "الإضافة إلى الشاشة الرئيسية"'
                    : 'Tap "Install App" or "Add to Home Screen"'}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-[#00264D] hover:bg-[#00386B] text-white font-black text-xs transition-colors"
          >
            {language === 'ar' ? 'حسناً، فهمت' : 'Got It'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Mobile Auto-Shown Install Banner with ETA Seal Icon + "CRM" Label Preview
 */
export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isMobile, install } = usePWAInstall();
  const { language, isRtl } = useThemeLanguage();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(BANNER_DISMISS_KEY) === '1') {
        setIsDismissed(true);
      }
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  // Hide automatically when already running as an installed PWA
  if (isInstalled) return null;

  // Show on mobile automatically (when opening link on phone/tablet) or whenever browser signals native installability
  const shouldShowBanner = !isDismissed && (isMobile || isInstallable || isIOS);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem(BANNER_DISMISS_KEY, '1');
    } catch {
      // Ignore storage access restrictions
    }
  };

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) return;
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      {shouldShowBanner && (
        <div
          className="fixed bottom-16 lg:bottom-4 inset-x-3 sm:inset-x-auto sm:end-4 z-[90] max-w-md mx-auto sm:mx-0 animate-fade-up"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div className="bg-[#00264D] dark:bg-[#071629] text-white rounded-2xl shadow-2xl border-2 border-[#00A651] p-3 flex items-center gap-3">
            {/* App Icon Tile Preview: Official Seal + "CRM" underneath */}
            <div className="flex flex-col items-center shrink-0 bg-[#001A35] px-2 py-1.5 rounded-xl border border-[#004B87]">
              <div className="w-11 h-11 rounded-xl bg-white p-0.5 flex items-center justify-center shadow-sm">
                <img
                  src="/pwa-192x192.png"
                  alt="CRM"
                  className="w-full h-full object-contain rounded-lg"
                />
              </div>
              <span className="text-[10px] font-black tracking-widest text-white mt-1 leading-none">
                CRM
              </span>
            </div>

            {/* Banner Title & Subtitle */}
            <div className="flex-1 min-w-0">
              <div className="font-black text-xs sm:text-sm text-white leading-tight truncate">
                {language === 'ar' ? 'تثبيت برنامج CRM' : 'Install CRM App'}
              </div>
              <p className="text-[11px] text-sky-200 mt-0.5 leading-snug line-clamp-2">
                {language === 'ar'
                  ? 'ثبّت المنظومة بشعار مصلحة الضرائب المصرية على هاتفك للفتح المباشر'
                  : 'Add Egyptian Tax Authority CRM to your home screen'}
              </p>
            </div>

            {/* Action & Dismiss Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-3 py-2 min-h-[38px] rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'تثبيت' : 'Install'}</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="p-2 min-w-[34px] min-h-[34px] rounded-xl bg-[#003366] hover:bg-[#004B87] text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                aria-label={language === 'ar' ? 'إغلاق إشعار التثبيت' : 'Dismiss install prompt'}
                title={language === 'ar' ? 'لاحقاً' : 'Later'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <InstallGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        isIOS={isIOS}
      />
    </>
  );
};

/**
 * Compact Install Button for Header / Login Utility Bar
 */
interface PWAInstallButtonProps {
  variant?: 'navbar' | 'login';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'navbar' }) => {
  const { isInstallable, isInstalled, isIOS, isMobile, install } = usePWAInstall();
  const { language } = useThemeLanguage();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;
  if (!isInstallable && !isMobile && !isIOS) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === 'login'
            ? 'px-2.5 py-1.5 min-h-[40px] rounded-xl bg-[#00A651] hover:bg-[#008742] text-white border border-[#00E676]/40 transition-all text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap'
            : 'px-2.5 py-2 min-h-[40px] lg:min-h-0 rounded-xl bg-[#003366] hover:bg-[#004080] text-[#00E676] hover:text-white border border-[#004B87] hover:border-[#00A651] transition-all text-xs font-bold flex items-center gap-1.5 active:scale-95 whitespace-nowrap'
        }
        title={language === 'ar' ? 'تثبيت برنامج CRM على الجهاز' : 'Install CRM App'}
        aria-label={language === 'ar' ? 'تثبيت برنامج CRM' : 'Install CRM App'}
      >
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] font-black">
          {language === 'ar' ? 'تثبيت CRM' : 'Install CRM'}
        </span>
      </button>

      <InstallGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        isIOS={isIOS}
      />
    </>
  );
};

/**
 * Offline Network Status Badge
 */
export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { language, isRtl } = useThemeLanguage();

  if (isOnline) return null;

  return (
    <div
      className="fixed top-3 inset-x-4 sm:inset-x-auto sm:start-1/2 sm:-translate-x-1/2 z-[110] flex items-center justify-center pointer-events-none"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="bg-amber-600 text-white px-4 py-2 rounded-xl shadow-xl border border-amber-400 text-xs font-black flex items-center gap-2 pointer-events-auto animate-fade-in">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>
          {language === 'ar'
            ? 'وضع عدم الاتصال — التغييرات محفوظة محلياً'
            : 'Offline mode — Changes saved locally'}
        </span>
      </div>
    </div>
  );
};
