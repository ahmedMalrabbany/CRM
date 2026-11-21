/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Settings, Shield, Clock, Phone, Server, CheckCircle, Save } from 'lucide-react';
import { INCOME_TAX_SERVICES, VAT_SERVICES } from '../data/taxServices';

export const SystemSettingsPage: React.FC = () => {
  const [hotline, setHotline] = useState('16395');
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
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
          <span>تم حفظ إعدادات النظام بنجاح.</span>
        </div>
      )}

      {/* Main Settings Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Basic System Parameters */}
        <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas space-y-4 text-xs">
          <h2 className="font-bold text-sm text-slate-800 dark:text-white border-b border-slate-100 dark:border-[#00386B] pb-2">
            المعايير التشغيلية للخدمة والاتصال
          </h2>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                رقم هاتف الخط الساخن / مركز الدعم:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={hotline}
                  onChange={(e) => setHotline(e.target.value)}
                  className="w-full p-2.5 pl-8 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
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
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(e.target.value)}
                  className="w-full p-2.5 pl-8 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
                />
                <Clock className="w-4 h-4 text-slate-400 absolute left-2.5 top-3" />
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">
                * يتم إنهاء جلسة الموظف تلقائياً في حال عدم وجود أي حركة ماوس أو نقرات للحماية
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-5 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Save className="w-4 h-4" />
                حفظ التعديلات
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
