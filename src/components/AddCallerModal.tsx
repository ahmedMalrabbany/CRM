/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Check, AlertCircle, Phone, Mail, Building, FileText } from 'lucide-react';
import { Caller, CallerTitle, CallerClassification } from '../types';
import {
  isValidTaxRegistrationNumber,
  isValidEgyptianNationalId,
  normalizeAsciiDigits,
} from '../utils/normalization';
import { createCaller } from '../services/callerService';
import { StyledTextarea } from './StyledTextarea';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface AddCallerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPhone?: string;
  initialTaxNumber?: string;
  onCallerSaved: (caller: Caller) => void;
}

export const AddCallerModal: React.FC<AddCallerModalProps> = ({
  isOpen,
  onClose,
  initialPhone = '',
  initialTaxNumber = '',
  onCallerSaved,
}) => {
  const { isRtl } = useThemeLanguage();
  const [name, setName] = useState('');
  const [title, setTitle] = useState<CallerTitle>('');
  const [classification, setClassification] = useState<CallerClassification>('');
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState(initialTaxNumber);
  const [nationalId, setNationalId] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState(initialPhone);
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [emailAvailability, setEmailAvailability] = useState<'متوفر' | 'غير متوفر'>('غير متوفر');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync & reset form values whenever modal opens
  React.useEffect(() => {
    if (isOpen) {
      setName('');
      setTitle('');
      setClassification('');
      setTaxRegistrationNumber(initialTaxNumber || '');
      setNationalId('');
      setPrimaryPhone(normalizeAsciiDigits(initialPhone || '').replace(/\D/g, ''));
      setSecondaryPhone('');
      setEmailAvailability('غير متوفر');
      setEmail('');
      setDescription('');
      setErrorMsg(null);
      setIsSaving(false);
    }
  }, [isOpen, initialPhone, initialTaxNumber]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Name validation
    if (!name.trim() || name.trim().length < 2) {
      setErrorMsg('اسم المتصل بيان أساسي ولا يمكن تركه فارغاً.');
      return;
    }

    // 2. Primary Phone validation (any digit length)
    const cleanPrimary = normalizeAsciiDigits(primaryPhone).replace(/\D/g, '');
    if (!cleanPrimary) {
      setErrorMsg('رقم التليفون الأساسي إلزامي.');
      return;
    }

    const cleanSecondary = normalizeAsciiDigits(secondaryPhone).replace(/\D/g, '');

    // 3. Tax number validation if provided
    const cleanTax = taxRegistrationNumber.trim();
    if (cleanTax && !isValidTaxRegistrationNumber(cleanTax)) {
      setErrorMsg('رقم التسجيل الضريبي للممول يجب أن يتكون من 9 أرقام بالضبط.');
      return;
    }

    // 3b. Optional 14-digit National ID validation if entered
    const cleanNationalId = normalizeAsciiDigits(nationalId).replace(/\D/g, '').trim();
    if (cleanNationalId && !isValidEgyptianNationalId(cleanNationalId)) {
      setErrorMsg(`الرقم القومي (في حال إدخاله) يجب أن يتكون من 14 رقماً بالضبط (المكتوب حالياً: ${cleanNationalId.length}).`);
      return;
    }

    // 4. Email validation if available
    if (emailAvailability === 'متوفر' && !email.trim()) {
      setErrorMsg('يرجى إدخال عنوان البريد الإلكتروني أو اختيار "غير متوفر".');
      return;
    }

    setIsSaving(true);
    try {
      const newCaller = await createCaller({
        name: name.trim(),
        title,
        classification,
        taxRegistrationNumber: cleanTax,
        nationalId: cleanNationalId,
        primaryPhone: cleanPrimary,
        secondaryPhone: cleanSecondary,
        emailAvailability,
        email: emailAvailability === 'متوفر' ? email.trim() : '',
        description: description.trim(),
      });

      onCallerSaved(newCaller);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ بيانات المتصل.');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={onClose}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#00386B] w-full max-w-xl my-auto max-h-[92dvh] overflow-hidden flex flex-col text-start animate-scale-in"
      >
        {/* Header */}
        <div className="bg-[#00264D] p-4 text-white flex items-center justify-between border-b border-[#004B87] shadow-md shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00A651] text-white shadow-xs">
              <UserPlus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">إضافة وتسجيل بيانات المتصل</h3>
              <p className="text-[11px] text-sky-200">مصلحة الضرائب المصرية | تسجيل بيانات المتصل وربطه بملف الممول</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sky-200 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 flex flex-col gap-3.5 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-900 dark:text-rose-200 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Name */}
          <div>
            <label className="font-bold text-slate-800 dark:text-slate-100 block mb-1">
              اسم المتصل يدوياً * <span className="text-rose-600 dark:text-rose-400 font-normal">(بيان أساسي لابد من كتابته)</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسم المتصل..."
              className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          {/* 2. Title & Classification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">صفة المتصل</label>
              <select
                value={title}
                onChange={(e) => setTitle(e.target.value as CallerTitle)}
                className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500 font-semibold"
              >
                <option value="">(فارغ / بدون صفة)</option>
                <option value="أستاذ">أستاذ</option>
                <option value="أستاذة">أستاذة</option>
                <option value="محاسب">محاسب</option>
                <option value="شريك">شريك</option>
                <option value="مدير مالي">مدير مالي</option>
                <option value="صاحب الشأن">صاحب الشأن</option>
                <option value="صاحب شركة">صاحب شركة</option>
                <option value="مهن حرة">مهن حرة</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">التصنيف</label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value as CallerClassification)}
                className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500 font-semibold"
              >
                <option value="">(فارغ / بدون تصنيف)</option>
                <option value="شخص طبيعي">شخص طبيعي</option>
                <option value="شخص اعتباري">شخص اعتباري</option>
              </select>
            </div>
          </div>

          {/* 3. Tax Registration Number (Linking to Taxpayer) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-700 dark:text-[#00E676]" />
                الممول (رقم التسجيل الضريبي المكون من 9 أرقام)
              </label>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">لربط بيانات المتصل مع بيانات الممول</span>
            </div>
            <input
              type="text"
              maxLength={9}
              value={taxRegistrationNumber}
              onChange={(e) => setTaxRegistrationNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="9 أرقام لربط المتصل بملف الممول..."
              className="w-full p-2.5 font-mono text-sm bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500 font-bold"
            />
            {taxRegistrationNumber.length > 0 && taxRegistrationNumber.length < 9 && (
              <span className="text-[10px] text-amber-700 dark:text-amber-300 block mt-0.5">
                تم إدخال {taxRegistrationNumber.length} من 9 أرقام
              </span>
            )}
          </div>

          {/* 3b. Optional 14-Digit National ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700 dark:text-slate-200">الرقم القومي للمتصل (14 رقماً)</label>
              <span className="text-[10px] text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-[#071629] px-2 py-0.5 rounded-md font-semibold">
                اختياري - غير أساسي
              </span>
            </div>
            <input
              type="text"
              dir="ltr"
              inputMode="numeric"
              maxLength={14}
              value={nationalId}
              onChange={(e) =>
                setNationalId(normalizeAsciiDigits(e.target.value).replace(/\D/g, '').slice(0, 14))
              }
              placeholder="14 رقماً (اختياري)..."
              className="w-full p-2.5 font-mono text-sm bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500 font-bold text-left"
            />
            {nationalId.length > 0 && nationalId.length < 14 && (
              <span className="text-[10px] text-amber-700 dark:text-amber-300 block mt-0.5">
                تم إدخال {nationalId.length} من 14 رقماً
              </span>
            )}
          </div>

          {/* 4. Phone Numbers (any digit length) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-blue-700 dark:text-[#00E676]" />
                  رقم التليفون الأساسي *
                </label>
              </div>
              <input
                type="text"
                dir="ltr"
                inputMode="numeric"
                required
                value={primaryPhone}
                onChange={(e) =>
                  setPrimaryPhone(normalizeAsciiDigits(e.target.value).replace(/\D/g, ''))
                }
                placeholder="أدخل رقم التليفون الأساسي..."
                className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500 font-mono font-bold text-left"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-200">رقم التليفون الإضافي</label>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">اختياري</span>
              </div>
              <input
                type="text"
                dir="ltr"
                inputMode="numeric"
                value={secondaryPhone}
                onChange={(e) =>
                  setSecondaryPhone(normalizeAsciiDigits(e.target.value).replace(/\D/g, ''))
                }
                placeholder="هاتف أرضي أو محمول إضافي..."
                className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500 font-mono text-left"
              />
            </div>
          </div>

          {/* 5. Email Availability & Field */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-blue-700 dark:text-[#00E676]" />
                البريد الإلكتروني
              </label>
              <select
                value={emailAvailability}
                onChange={(e) => setEmailAvailability(e.target.value as 'متوفر' | 'غير متوفر')}
                className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500 font-semibold"
              >
                <option value="غير متوفر">غير متوفر</option>
                <option value="متوفر">متوفر</option>
              </select>
            </div>

            {emailAvailability === 'متوفر' && (
              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">عنوان البريد الإلكتروني *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            )}
          </div>

          {/* 6. Description / Notes */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-blue-700 dark:text-[#00E676]" />
              الوصف (ملاحظات للمتصل)
            </label>
            <StyledTextarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب أي ملاحظات أو تفاصيل خاصة بالمتصل..."
              className="w-full p-2 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#004B87] text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-[#071629] focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-[#00386B] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#002B54] rounded-xl font-bold transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-[#00A651] hover:bg-[#008742] text-white font-black rounded-xl shadow-md shadow-[#00A651]/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  حفظ واعتماد بيانات المتصل
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
