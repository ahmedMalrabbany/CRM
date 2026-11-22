/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Clock,
  Phone,
  CheckCircle,
  AlertCircle,
  Save,
  FileSpreadsheet,
  ExternalLink,
  ArrowLeftRight,
  Loader2,
} from 'lucide-react';
import { User } from '../types';
import { INCOME_TAX_SERVICES, VAT_SERVICES } from '../data/taxServices';
import {
  TARGET_SPREADSHEET_ID,
  TARGET_DETAILS_TAB,
  TARGET_SPREADSHEET_URL,
} from '../utils/sheetsDetailsMapper';
import {
  DEFAULT_SYSTEM_SETTINGS,
  fetchSystemSettings,
  saveSystemSettings,
  validateSystemSettingsInput,
} from '../services/systemSettingsService';

interface SystemSettingsPageProps {
  currentUser?: User | null;
  onOpenSheetsSync?: () => void;
}

export const SystemSettingsPage: React.FC<SystemSettingsPageProps> = ({
  currentUser,
  onOpenSheetsSync,
}) => {
  const [hotline, setHotline] = useState(DEFAULT_SYSTEM_SETTINGS.hotline);
  const [sessionTimeout, setSessionTimeout] = useState(
    String(DEFAULT_SYSTEM_SETTINGS.sessionTimeoutMinutes)
  );
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastUpdatedMeta, setLastUpdatedMeta] = useState<{
    updatedAt?: string;
    updatedBy?: string;
  }>({});

  useEffect(() => {
    let active = true;
    fetchSystemSettings()
      .then((cfg) => {
        if (!active) return;
        setHotline(cfg.hotline);
        setSessionTimeout(String(cfg.sessionTimeoutMinutes));
        setLastUpdatedMeta({ updatedAt: cfg.updatedAt, updatedBy: cfg.updatedBy });
      })
      .finally(() => {
        if (active) setIsLoadingSettings(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    const validation = validateSystemSettingsInput(hotline, sessionTimeout);
    if (!validation.valid || !validation.normalized) {
      setSaveError(validation.error || 'بيانات الإعدادات غير صالحة.');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveSystemSettings(validation.normalized, currentUser);
      setHotline(saved.hotline);
      setSessionTimeout(String(saved.sessionTimeoutMinutes));
      setLastUpdatedMeta({ updatedAt: saved.updatedAt, updatedBy: saved.updatedBy });
      setSaveSuccess(
        `تم حفظ إعدادات النظام بنجاح وتطبيقها فوراً (مهلة الجلسة: ${saved.sessionTimeoutMinutes} دقيقة).`
      );
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err: any) {
      setSaveError(err?.message || 'تعذر حفظ إعدادات النظام. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-start animate-fade-up">
      {/* Header */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs mb-1">
          <Settings className="w-4 h-4" />
          <span>إعدادات النظام والتهيئة المؤسسية (System Settings)</span>
        </div>
        <h1 className="text-lg font-black text-slate-900 dark:text-white">
          تهيئة برنامج إدارة خدمة العملاء CRM
        </h1>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
          إدارة معايير التشغيل، مهلة الجلسات، وقوائم الخدمات وقنوات التواصل المعتمدة
        </p>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-[#E6F7EF] dark:bg-[#00A651]/15 border border-[#00A651]/40 rounded-xl text-xs font-bold text-[#008742] dark:text-[#00E676] flex items-center gap-2 animate-scale-in">
          <CheckCircle className="w-4 h-4 text-[#00A651] shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2 animate-scale-in">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Basic System Parameters */}
        <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas space-y-4 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-[#00386B] pb-2">
            <h2 className="font-bold text-sm text-slate-800 dark:text-white">
              المعايير التشغيلية للخدمة والاتصال
            </h2>
            {lastUpdatedMeta.updatedAt && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                آخر حفظ: {new Date(lastUpdatedMeta.updatedAt).toLocaleString('ar-EG')}
              </span>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                رقم هاتف الخط الساخن / مركز الدعم:
              </label>
              <div className="relative">
                <input
                  type="text"
                  disabled={isLoadingSettings || isSaving}
                  value={hotline}
                  onChange={(e) => setHotline(e.target.value)}
                  className="w-full p-2.5 pl-8 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none disabled:opacity-60"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                مهلة تسجيل الخروج التلقائي عند عدم النشاط (بالدقائق):
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={5}
                  max={120}
                  disabled={isLoadingSettings || isSaving}
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(e.target.value)}
                  className="w-full p-2.5 pl-8 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none disabled:opacity-60"
                />
                <Clock className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                * يتم إنهاء جلسة الموظف تلقائياً في حال عدم وجود أي حركة ماوس أو نقرات للحماية (5 إلى 120 دقيقة)
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoadingSettings || isSaving}
                className="px-5 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{isSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Security & Invariants Status */}
        <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas space-y-3 text-xs">
          <h2 className="font-bold text-sm text-slate-800 dark:text-white border-b border-slate-100 dark:border-[#00386B] pb-2 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-[#00A651]" />
            معايير الأمان وقواعد البيانات المطبقة
          </h2>

          <div className="space-y-2 text-slate-700 dark:text-slate-300">
            <div className="p-2.5 bg-slate-50 dark:bg-[#071629] rounded-xl border border-slate-200 dark:border-[#00386B] flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">تشفير كلمات المرور</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Salted SHA-256 مع حظر تخزين النصوص المجردة</span>
              </div>
              <span className="text-[10px] font-bold text-[#00A651] dark:text-[#00E676]">مفعل</span>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-[#071629] rounded-xl border border-slate-200 dark:border-[#00386B] flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">توحيد النصوص العربية (Normalization Engine)</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">توحيد التاء المربوطة والألفات والأسماء المركبة</span>
              </div>
              <span className="text-[10px] font-bold text-[#00A651] dark:text-[#00E676]">مفعل</span>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-[#071629] rounded-xl border border-slate-200 dark:border-[#00386B] flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">حماية التسلسل الذري (Atomic Transactions)</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">أرقام الحالات CRM-000000 بدون أي تكرار</span>
              </div>
              <span className="text-[10px] font-bold text-[#00A651] dark:text-[#00E676]">مفعل</span>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-[#071629] rounded-xl border border-slate-200 dark:border-[#00386B] flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">سجل الحركات التاريخي غير القابل للتعديل</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Immutable Timeline Subcollections</span>
              </div>
              <span className="text-[10px] font-bold text-[#00A651] dark:text-[#00E676]">مفعل</span>
            </div>
          </div>
        </div>
      </div>

      {/* Google Sheets Database (Details Tab) Card */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-[#00A651]/40 dark:border-[#00A651]/50 shadow-saas space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-[#00386B] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00A651]/15 text-[#008742] dark:text-[#00E676]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                قاعدة بيانات Google Sheets (ورقة {TARGET_DETAILS_TAB})
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                الربط المباشر ومطابقة أعمدة الحالات مع ورقة البيانات الرئيسية في جدول البيانات المعتمد
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={TARGET_SPREADSHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#00386B] bg-slate-50 dark:bg-[#071629] hover:bg-slate-100 dark:hover:bg-[#003366] text-[#004B87] dark:text-sky-300 font-bold flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح الملف في Google Sheets</span>
            </a>
            {onOpenSheetsSync && (
              <button
                type="button"
                onClick={onOpenSheetsSync}
                className="px-4 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>فحص ومطابقة الأعمدة والمزامنة</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] md:col-span-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
              معرف جدول البيانات المعتمد (Spreadsheet ID):
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-sky-200 break-all select-all">
              {TARGET_SPREADSHEET_ID}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B]">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
              ورقة العمل المرتبطة (Target Tab):
            </span>
            <span className="font-mono font-black text-[#008742] dark:text-[#00E676]">
              {TARGET_DETAILS_TAB}
            </span>
          </div>
        </div>
      </div>

      {/* Tax Services Directory Inspector */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas space-y-3 text-xs">
        <h2 className="font-bold text-sm text-slate-800 dark:text-white border-b border-slate-100 dark:border-[#00386B] pb-2">
          دليل الخدمات الضريبية المعتمدة بالمنظومة (Official ETA Service Catalog)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Income Tax Services */}
          <div>
            <span className="font-bold text-[#00A651] dark:text-[#00E676] block mb-2">
              خدمات ضرائب الدخل ({INCOME_TAX_SERVICES.length} خدمة):
            </span>
            <div className="space-y-1 max-h-48 overflow-y-auto bg-slate-50 dark:bg-[#071629] p-2 rounded-xl border border-slate-200 dark:border-[#00386B]">
              {INCOME_TAX_SERVICES.map((srv, idx) => (
                <div key={idx} className="p-1 text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-[#E6F7EF] dark:bg-[#00A651]/20 text-[#008742] dark:text-[#00E676] rounded-full flex items-center justify-center text-[9px] font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <span>{srv}</span>
                </div>
              ))}
            </div>
          </div>

          {/* VAT Services */}
          <div>
            <span className="font-bold text-[#004B87] dark:text-sky-300 block mb-2">
              خدمات ضرائب القيمة المضافة ({VAT_SERVICES.length} خدمة):
            </span>
            <div className="space-y-1 max-h-48 overflow-y-auto bg-slate-50 dark:bg-[#071629] p-2 rounded-xl border border-slate-200 dark:border-[#00386B]">
              {VAT_SERVICES.map((srv, idx) => (
                <div key={idx} className="p-1 text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-[#EBF4FC] dark:bg-[#004B87]/40 text-[#004B87] dark:text-sky-300 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <span>{srv}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
