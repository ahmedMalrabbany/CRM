/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Search,
  Pencil,
  Trash2,
  Phone,
  Mail,
  Users,
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Briefcase,
  FileText,
} from 'lucide-react';
import {
  Taxpayer,
  Caller,
  Case,
  User,
  TaxType,
  CallerTitle,
  CallerClassification,
} from '../types';
import {
  subscribeToTaxpayers,
  updateTaxpayer,
  deleteTaxpayer,
} from '../services/taxpayerService';
import {
  subscribeToCallers,
  updateCaller,
  deleteCaller,
} from '../services/callerService';
import { StatusBadge } from '../components/SkeletonLoader';
import { useThemeLanguage } from '../context/ThemeLanguageContext';
import { StyledTextarea } from '../components/StyledTextarea';
import {
  isValidTaxRegistrationNumber,
  normalizeAsciiDigits,
} from '../utils/normalization';

interface TaxpayersPageProps {
  cases: Case[];
  currentUser?: User;
  onOpenCase: (caseItem: Case) => void;
}

type DirectoryTab = 'taxpayers' | 'callers';

const CALLER_TITLES: CallerTitle[] = [
  'أستاذ',
  'أستاذة',
  'محاسب',
  'شريك',
  'مدير مالي',
  'صاحب الشأن',
  'صاحب شركة',
  'مهن حرة',
];

export const TaxpayersPage: React.FC<TaxpayersPageProps> = ({
  cases,
  currentUser,
  onOpenCase,
}) => {
  const { language, isRtl } = useThemeLanguage();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [activeTab, setActiveTab] = useState<DirectoryTab>('taxpayers');
  const [taxpayers, setTaxpayers] = useState<Taxpayer[]>([]);
  const [callers, setCallers] = useState<Caller[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedTaxpayer, setSelectedTaxpayer] = useState<Taxpayer | null>(null);
  const [selectedCaller, setSelectedCaller] = useState<Caller | null>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  const focusDetailPanel = () => {
    if (window.innerWidth < 1024 && detailPanelRef.current) {
      requestAnimationFrame(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        detailPanelRef.current?.focus({ preventScroll: true });
      });
    }
  };

  // Toast feedback
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Edit Taxpayer Modal State
  const [editingTaxpayer, setEditingTaxpayer] = useState<Taxpayer | null>(null);
  const [tpRegNum, setTpRegNum] = useState('');
  const [tpName, setTpName] = useState('');
  const [tpTaxType, setTpTaxType] = useState<TaxType>('ضرائب دخل');
  const [tpCity, setTpCity] = useState('');
  const [tpActivity, setTpActivity] = useState('');
  const [tpNotes, setTpNotes] = useState('');
  const [tpError, setTpError] = useState<string | null>(null);
  const [isSavingTp, setIsSavingTp] = useState(false);

  // Edit Caller Modal State
  const [editingCaller, setEditingCaller] = useState<Caller | null>(null);
  const [clName, setClName] = useState('');
  const [clTitle, setClTitle] = useState<CallerTitle>('');
  const [clClass, setClClass] = useState<CallerClassification>('');
  const [clTaxNum, setClTaxNum] = useState('');
  const [clPrimaryPhone, setClPrimaryPhone] = useState('');
  const [clSecondaryPhone, setClSecondaryPhone] = useState('');
  const [clEmailAvail, setClEmailAvail] = useState<'متوفر' | 'غير متوفر'>('غير متوفر');
  const [clEmail, setClEmail] = useState('');
  const [clDesc, setClDesc] = useState('');
  const [clError, setClError] = useState<string | null>(null);
  const [isSavingCl, setIsSavingCl] = useState(false);

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: 'taxpayer'; item: Taxpayer }
    | { type: 'caller'; item: Caller }
    | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const unsubTp = subscribeToTaxpayers((list) => {
      setTaxpayers(list);
      setSelectedTaxpayer((prev) => {
        if (!prev) return null;
        return list.find((t) => t.id === prev.id) || null;
      });
    });

    const unsubCl = subscribeToCallers((list) => {
      setCallers(list);
      setSelectedCaller((prev) => {
        if (!prev) return null;
        return list.find((c) => c.id === prev.id) || null;
      });
    });

    return () => {
      unsubTp();
      unsubCl();
    };
  }, []);

  useEffect(() => {
    if (!feedbackMsg) return;
    const timer = setTimeout(() => setFeedbackMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [feedbackMsg]);

  const filteredTaxpayers = useMemo(() => {
    if (!searchTerm.trim()) return taxpayers;
    const q = searchTerm.toLowerCase().trim();
    return taxpayers.filter(
      (t) =>
        t.taxRegistrationNumber.includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.city && t.city.toLowerCase().includes(q)) ||
        (t.activity && t.activity.toLowerCase().includes(q))
    );
  }, [taxpayers, searchTerm]);

  const filteredCallers = useMemo(() => {
    if (!searchTerm.trim()) return callers;
    const q = searchTerm.toLowerCase().trim();
    return callers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.primaryPhone.includes(q) ||
        (c.secondaryPhone && c.secondaryPhone.includes(q)) ||
        (c.taxRegistrationNumber && c.taxRegistrationNumber.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [callers, searchTerm]);

  const relatedTaxpayerCases = useMemo(() => {
    if (!selectedTaxpayer) return [];
    return cases.filter(
      (c) => c.taxRegistrationNumber === selectedTaxpayer.taxRegistrationNumber
    );
  }, [cases, selectedTaxpayer]);

  const relatedCallerCases = useMemo(() => {
    if (!selectedCaller) return [];
    return cases.filter(
      (c) =>
        c.callerId === selectedCaller.id ||
        c.callerPhone === selectedCaller.primaryPhone ||
        (selectedCaller.taxRegistrationNumber &&
          c.taxRegistrationNumber === selectedCaller.taxRegistrationNumber)
    );
  }, [cases, selectedCaller]);

  // Open Edit Taxpayer Modal
  const openEditTaxpayer = (tp: Taxpayer) => {
    setEditingTaxpayer(tp);
    setTpRegNum(tp.taxRegistrationNumber);
    setTpName(tp.name);
    setTpTaxType(tp.taxType || 'ضرائب دخل');
    setTpCity(tp.city || '');
    setTpActivity(tp.activity || '');
    setTpNotes(tp.notes || '');
    setTpError(null);
  };

  const handleSaveTaxpayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTaxpayer) return;
    setTpError(null);

    const cleanReg = tpRegNum.trim();
    if (!isValidTaxRegistrationNumber(cleanReg)) {
      setTpError(
        language === 'ar'
          ? 'رقم التسجيل الضريبي يجب أن يتكون من 9 أرقام بالضبط.'
          : 'Tax registration number must be exactly 9 digits.'
      );
      return;
    }

    if (!tpName.trim()) {
      setTpError(
        language === 'ar'
          ? 'اسم الممول / الشركة بيان إلزامي.'
          : 'Taxpayer name is required.'
      );
      return;
    }

    setIsSavingTp(true);
    try {
      const updated = await updateTaxpayer(
        editingTaxpayer.id,
        {
          taxRegistrationNumber: cleanReg,
          name: tpName.trim(),
          taxType: tpTaxType,
          city: tpCity.trim(),
          activity: tpActivity.trim(),
          notes: tpNotes.trim(),
        },
        currentUser
      );
      setSelectedTaxpayer(updated);
      setEditingTaxpayer(null);
      setFeedbackMsg({
        type: 'success',
        text:
          language === 'ar'
            ? `تم تحديث بيانات الممول "${updated.name}" بنجاح.`
            : `Taxpayer "${updated.name}" updated successfully.`,
      });
    } catch (err: any) {
      setTpError(
        err.message ||
          (language === 'ar' ? 'فشل تحديث بيانات الممول.' : 'Failed to update taxpayer.')
      );
    } finally {
      setIsSavingTp(false);
    }
  };

  // Open Edit Caller Modal
  const openEditCaller = (caller: Caller) => {
    setEditingCaller(caller);
    setClName(caller.name);
    setClTitle(caller.title || '');
    setClClass(caller.classification || '');
    setClTaxNum(caller.taxRegistrationNumber || '');
    setClPrimaryPhone(caller.primaryPhone);
    setClSecondaryPhone(caller.secondaryPhone || '');
    setClEmailAvail(caller.emailAvailability || 'غير متوفر');
    setClEmail(caller.email || '');
    setClDesc(caller.description || '');
    setClError(null);
  };

  const handleSaveCaller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCaller) return;
    setClError(null);

    if (!clName.trim() || clName.trim().length < 2) {
      setClError(
        language === 'ar'
          ? 'اسم المتصل بيان أساسي ولا يمكن تركه فارغاً.'
          : 'Caller name is required.'
      );
      return;
    }

    const cleanPrimary = normalizeAsciiDigits(clPrimaryPhone).replace(/\D/g, '');
    if (!cleanPrimary) {
      setClError(
        language === 'ar'
          ? 'رقم التليفون الأساسي إلزامي.'
          : 'Primary phone is required.'
      );
      return;
    }

    const cleanSecondary = normalizeAsciiDigits(clSecondaryPhone).replace(/\D/g, '');

    const cleanTax = clTaxNum.trim();
    if (cleanTax && !isValidTaxRegistrationNumber(cleanTax)) {
      setClError(
        language === 'ar'
          ? 'رقم التسجيل الضريبي المرتبط يجب أن يتكون من 9 أرقام بالضبط.'
          : 'Linked tax registration number must be 9 digits.'
      );
      return;
    }

    if (clEmailAvail === 'متوفر' && !clEmail.trim()) {
      setClError(
        language === 'ar'
          ? 'يرجى إدخال البريد الإلكتروني أو اختيار "غير متوفر".'
          : 'Please enter an email or select Unavailable.'
      );
      return;
    }

    setIsSavingCl(true);
    try {
      const updated = await updateCaller(
        editingCaller.id,
        {
          name: clName.trim(),
          title: clTitle,
          classification: clClass,
          taxRegistrationNumber: cleanTax,
          primaryPhone: cleanPrimary,
          secondaryPhone: cleanSecondary,
          emailAvailability: clEmailAvail,
          email: clEmailAvail === 'متوفر' ? clEmail.trim() : '',
          description: clDesc.trim(),
        },
        currentUser
      );
      setSelectedCaller(updated);
      setEditingCaller(null);
      setFeedbackMsg({
        type: 'success',
        text:
          language === 'ar'
            ? `تم تحديث بيانات المتصل "${updated.name}" بنجاح.`
            : `Caller "${updated.name}" updated successfully.`,
      });
    } catch (err: any) {
      setClError(
        err.message ||
          (language === 'ar' ? 'فشل تحديث بيانات المتصل.' : 'Failed to update caller.')
      );
    } finally {
      setIsSavingCl(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (!isSuperAdmin) {
      setDeleteTarget(null);
      setFeedbackMsg({
        type: 'error',
        text: language === 'ar' ? 'صلاحية الحذف متاحة لمدير النظام فقط.' : 'Delete permission is restricted to System Admin only.',
      });
      return;
    }
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'taxpayer') {
        await deleteTaxpayer(deleteTarget.item.id, deleteTarget.item.name, currentUser);
        if (selectedTaxpayer?.id === deleteTarget.item.id) {
          setSelectedTaxpayer(null);
        }
        setFeedbackMsg({
          type: 'success',
          text:
            language === 'ar'
              ? `تم حذف سجل الممول "${deleteTarget.item.name}" نهائياً.`
              : `Taxpayer "${deleteTarget.item.name}" deleted.`,
        });
      } else {
        await deleteCaller(deleteTarget.item.id, deleteTarget.item.name, currentUser);
        if (selectedCaller?.id === deleteTarget.item.id) {
          setSelectedCaller(null);
        }
        setFeedbackMsg({
          type: 'success',
          text:
            language === 'ar'
              ? `تم حذف سجل المتصل "${deleteTarget.item.name}" نهائياً.`
              : `Caller "${deleteTarget.item.name}" deleted.`,
        });
      }
      setDeleteTarget(null);
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text:
          err.message ||
          (language === 'ar' ? 'تعذر إتمام عملية الحذف.' : 'Failed to delete record.'),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 text-start animate-fade-up" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-2xl border shadow-md flex items-center justify-between gap-3 text-xs font-bold animate-fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-[#003324] border-emerald-300 dark:border-[#00A651] text-emerald-900 dark:text-[#00E676]'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header + Segmented Tabs + Search */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {language === 'ar'
                ? 'سجل وقاعدة بيانات الممولين والمتصلين'
                : 'Taxpayers & Callers Directory'}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              {isSuperAdmin
                ? language === 'ar'
                  ? 'إدارة والبحث وتعديل أو حذف بيانات الممولين والمتصلين والاطلاع على سجل حالاتهم'
                  : 'Manage, search, edit, or delete taxpayer and caller records and view case history'
                : language === 'ar'
                ? 'إدارة والبحث وتعديل بيانات الممولين والمتصلين والاطلاع على سجل حالاتهم'
                : 'Manage, search, and edit taxpayer and caller records and view case history'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
            {/* Segmented Tab Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#071629] rounded-xl border border-slate-200 dark:border-[#00386B] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('taxpayers');
                  setSearchTerm('');
                }}
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'taxpayers'
                    ? 'bg-[#004B87] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#004B87] dark:hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'الممولين' : 'Taxpayers'}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums ${
                    activeTab === 'taxpayers'
                      ? 'bg-[#00264D] text-[#00E676]'
                      : 'bg-slate-200 dark:bg-[#002B54] text-slate-700 dark:text-sky-200'
                  }`}
                >
                  {taxpayers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('callers');
                  setSearchTerm('');
                }}
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'callers'
                    ? 'bg-[#00A651] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#00A651] dark:hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'المتصلين' : 'Callers'}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums ${
                    activeTab === 'callers'
                      ? 'bg-[#007A3D] text-white'
                      : 'bg-slate-200 dark:bg-[#002B54] text-slate-700 dark:text-sky-200'
                  }`}
                >
                  {callers.length}
                </span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  activeTab === 'taxpayers'
                    ? language === 'ar'
                      ? 'بحث برقم التسجيل (9 أرقام) أو اسم الممول...'
                      : 'Search by Tax ID or name...'
                    : language === 'ar'
                    ? 'بحث باسم المتصل، الهاتف، أو الرقم الضريبي...'
                    : 'Search by caller name, phone, or Tax ID...'
                }
                className={`w-full p-2.5 ${
                  isRtl ? 'pl-8 pr-3' : 'pr-8 pl-3'
                } bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-800 dark:text-white rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none`}
              />
              <Search
                className={`w-4 h-4 text-slate-400 absolute ${
                  isRtl ? 'left-2.5' : 'right-2.5'
                } top-3`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Active List & Selected Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left List */}
        <div className="lg:col-span-2 bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
          <div className="p-3.5 bg-[#00264D] text-white border-b border-[#004B87] flex justify-between items-center text-xs">
            <span className="font-bold">
              {activeTab === 'taxpayers'
                ? language === 'ar'
                  ? `قائمة الممولين (${filteredTaxpayers.length})`
                  : `Taxpayers List (${filteredTaxpayers.length})`
                : language === 'ar'
                ? `قائمة المتصلين (${filteredCallers.length})`
                : `Callers List (${filteredCallers.length})`}
            </span>
            <span className="text-sky-200 text-[11px] hidden sm:inline">
              {isSuperAdmin
                ? language === 'ar'
                  ? 'اضغط على السجل للعرض، أو استخدم أزرار التعديل والحذف'
                  : 'Select a record to view details, or edit/delete directly'
                : language === 'ar'
                ? 'اضغط على السجل للعرض، أو استخدم زر التعديل'
                : 'Select a record to view details or edit directly'}
            </span>
          </div>

          {activeTab === 'taxpayers' ? (
            <div className="divide-y divide-slate-100 dark:divide-[#00386B]/70 max-h-[600px] overflow-y-auto">
              {filteredTaxpayers.map((tp) => {
                const count = cases.filter(
                  (c) => c.taxRegistrationNumber === tp.taxRegistrationNumber
                ).length;
                const isSelected = selectedTaxpayer?.id === tp.id;

                return (
                  <div
                    key={tp.id}
                    onClick={() => {
                      setSelectedTaxpayer(tp);
                      focusDetailPanel();
                    }}
                    className={`p-3.5 cursor-pointer transition-all duration-150 flex items-center justify-between gap-3 ${
                      isSelected
                        ? `bg-[#EBF4FC] dark:bg-[#002B54] ${
                            isRtl ? 'border-r-4' : 'border-l-4'
                          } border-[#004B87] dark:border-[#00A651]`
                        : 'hover:bg-[#EBF4FC]/60 dark:hover:bg-[#002B54]/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="p-2.5 rounded-xl bg-[#EBF4FC] dark:bg-[#071629] text-[#004B87] dark:text-[#00E676] shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">
                          {tp.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                            {tp.taxRegistrationNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#00A651] dark:text-[#00E676] font-semibold">
                            {tp.taxType || (language === 'ar' ? 'غير محدد' : 'Unspecified')}
                          </span>
                          {tp.city && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-[120px]">{tp.city}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <span className="hidden sm:inline-block text-slate-600 dark:text-slate-300 text-xs font-bold font-mono tabular-nums px-2">
                        {count} {language === 'ar' ? 'حالة' : 'cases'}
                      </span>

                      <button
                        type="button"
                        onClick={() => openEditTaxpayer(tp)}
                        className="p-2 rounded-xl bg-[#EBF4FC] dark:bg-[#071629] hover:bg-[#004B87] text-[#004B87] dark:text-sky-300 hover:text-white border border-blue-200/80 dark:border-[#004B87] transition-colors"
                        title={language === 'ar' ? 'تعديل بيانات الممول' : 'Edit Taxpayer'}
                        aria-label={language === 'ar' ? 'تعديل بيانات الممول' : 'Edit Taxpayer'}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ type: 'taxpayer', item: tp })}
                          className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white border border-rose-200 dark:border-rose-800 transition-colors"
                          title={language === 'ar' ? 'حذف سجل الممول' : 'Delete Taxpayer'}
                          aria-label={language === 'ar' ? 'حذف سجل الممول' : 'Delete Taxpayer'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredTaxpayers.length === 0 && (
                <div className="p-12 text-center text-slate-400 text-xs">
                  {language === 'ar'
                    ? 'لا يوجد ممولين مسجلين يطابقون استعلام البحث'
                    : 'No registered taxpayers match your search'}
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#00386B]/70 max-h-[600px] overflow-y-auto">
              {filteredCallers.map((cl) => {
                const isSelected = selectedCaller?.id === cl.id;
                const count = cases.filter(
                  (c) =>
                    c.callerId === cl.id ||
                    c.callerPhone === cl.primaryPhone ||
                    (cl.taxRegistrationNumber && c.taxRegistrationNumber === cl.taxRegistrationNumber)
                ).length;

                return (
                  <div
                    key={cl.id}
                    onClick={() => {
                      setSelectedCaller(cl);
                      focusDetailPanel();
                    }}
                    className={`p-3.5 cursor-pointer transition-all duration-150 flex items-center justify-between gap-3 ${
                      isSelected
                        ? `bg-[#E6F7EF] dark:bg-[#002B54] ${
                            isRtl ? 'border-r-4' : 'border-l-4'
                          } border-[#00A651]`
                        : 'hover:bg-[#EBF4FC]/60 dark:hover:bg-[#002B54]/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="p-2.5 rounded-xl bg-[#E6F7EF] dark:bg-[#071629] text-[#00A651] dark:text-[#00E676] shrink-0">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">
                            {cl.title ? `${cl.title} / ` : ''}
                            {cl.name}
                          </span>
                          {cl.classification && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#071629] text-slate-600 dark:text-sky-200 border border-slate-200 dark:border-[#004B87] font-semibold">
                              {cl.classification}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="font-mono font-bold text-[#004B87] dark:text-sky-300 tabular-nums">
                            {cl.primaryPhone}
                          </span>
                          {cl.taxRegistrationNumber && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                {language === 'ar' ? 'ضريبي:' : 'Tax:'} {cl.taxRegistrationNumber}
                              </span>
                            </>
                          )}
                          {cl.email && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-[140px]">{cl.email}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <span className="hidden sm:inline-block text-slate-600 dark:text-slate-300 text-xs font-bold font-mono tabular-nums px-2">
                        {count} {language === 'ar' ? 'حالة' : 'cases'}
                      </span>

                      <button
                        type="button"
                        onClick={() => openEditCaller(cl)}
                        className="p-2 rounded-xl bg-[#EBF4FC] dark:bg-[#071629] hover:bg-[#004B87] text-[#004B87] dark:text-sky-300 hover:text-white border border-blue-200/80 dark:border-[#004B87] transition-colors"
                        title={language === 'ar' ? 'تعديل بيانات المتصل' : 'Edit Caller'}
                        aria-label={language === 'ar' ? 'تعديل بيانات المتصل' : 'Edit Caller'}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ type: 'caller', item: cl })}
                          className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white border border-rose-200 dark:border-rose-800 transition-colors"
                          title={language === 'ar' ? 'حذف سجل المتصل' : 'Delete Caller'}
                          aria-label={language === 'ar' ? 'حذف سجل المتصل' : 'Delete Caller'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredCallers.length === 0 && (
                <div className="p-12 text-center text-slate-400 text-xs">
                  {language === 'ar'
                    ? 'لا يوجد متصلين مسجلين يطابقون استعلام البحث'
                    : 'No registered callers match your search'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Detail Panel */}
        <div
          ref={detailPanelRef}
          tabIndex={-1}
          className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas p-5 flex flex-col justify-between lg:sticky lg:top-0 lg:self-start focus:outline-none"
        >
          {activeTab === 'taxpayers' ? (
            selectedTaxpayer ? (
              <div className="space-y-4 animate-scale-in">
                <div className="border-b border-slate-200 dark:border-[#00386B] pb-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#004B87] dark:text-[#00E676] font-bold">
                      {language === 'ar' ? 'ملف الممول المسجل' : 'Registered Taxpayer File'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditTaxpayer(selectedTaxpayer)}
                        className="px-2.5 py-1 rounded-lg bg-[#EBF4FC] dark:bg-[#071629] hover:bg-[#004B87] text-[#004B87] dark:text-sky-300 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-blue-200 dark:border-[#004B87] transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>{language === 'ar' ? 'تعديل' : 'Edit'}</span>
                      </button>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ type: 'taxpayer', item: selectedTaxpayer })}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-rose-200 dark:border-rose-800 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{language === 'ar' ? 'حذف' : 'Delete'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="font-black text-sm text-slate-900 dark:text-white">
                    {selectedTaxpayer.name}
                  </h3>
                  <div className="font-mono font-bold text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {language === 'ar' ? 'رقم التسجيل:' : 'Tax Reg. No:'}{' '}
                    {selectedTaxpayer.taxRegistrationNumber}
                  </div>

                  {(selectedTaxpayer.taxType ||
                    selectedTaxpayer.city ||
                    selectedTaxpayer.activity ||
                    selectedTaxpayer.notes) && (
                    <div className="pt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                      {selectedTaxpayer.taxType && (
                        <div className="flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-[#00A651]" />
                          <span>{selectedTaxpayer.taxType}</span>
                        </div>
                      )}
                      {selectedTaxpayer.city && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#004B87] dark:text-sky-300" />
                          <span>{selectedTaxpayer.city}</span>
                        </div>
                      )}
                      {selectedTaxpayer.activity && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{selectedTaxpayer.activity}</span>
                        </div>
                      )}
                      {selectedTaxpayer.notes && (
                        <div className="flex items-start gap-1.5 pt-1 text-slate-500 dark:text-slate-400">
                          <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{selectedTaxpayer.notes}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-2.5 flex items-center justify-between">
                    <span>
                      {language === 'ar'
                        ? 'سجل الحالات والمكالمات السابقة:'
                        : 'Related Cases History:'}
                    </span>
                    <span className="font-mono tabular-nums text-[#004B87] dark:text-[#00E676]">
                      {relatedTaxpayerCases.length}
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-96 overflow-y-auto">
                    {relatedTaxpayerCases.map((rc) => (
                      <div
                        key={rc.id}
                        onClick={() => onOpenCase(rc)}
                        className="group p-3 bg-slate-50 dark:bg-[#071629] hover:bg-[#EBF4FC] dark:hover:bg-[#002B54] rounded-xl border border-slate-200 dark:border-[#00386B] cursor-pointer transition-all text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[#004B87] dark:text-sky-300 text-[11px] tabular-nums">
                            {rc.caseId}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                            {new Date(rc.createdAt).toLocaleDateString(
                              language === 'ar' ? 'ar-EG' : 'en-US'
                            )}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:text-[#004B87] dark:group-hover:text-[#00E676] transition-colors">
                          {rc.title}
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {rc.serviceType}
                          </span>
                          <StatusBadge status={rc.status} />
                        </div>
                      </div>
                    ))}

                    {relatedTaxpayerCases.length === 0 && (
                      <div className="text-center py-6 text-slate-400 text-xs">
                        {language === 'ar'
                          ? 'لا توجد حالات سابقة لهذا الممول'
                          : 'No previous cases for this taxpayer'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <Building2 className="w-12 h-12 stroke-1 text-slate-300 dark:text-slate-700 mb-2" />
                <div className="font-bold text-xs text-slate-600 dark:text-slate-300">
                  {language === 'ar' ? 'حدد ممولاً من القائمة' : 'Select a Taxpayer'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {language === 'ar'
                    ? 'لعرض تفاصيل ملفه أو تعديل بياناته والاطلاع على حالات الاستفسار السابقة'
                    : 'To view profile, edit details, or browse previous cases'}
                </div>
              </div>
            )
          ) : selectedCaller ? (
            <div className="space-y-4 animate-scale-in">
              <div className="border-b border-slate-200 dark:border-[#00386B] pb-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#00A651] dark:text-[#00E676] font-bold">
                    {language === 'ar' ? 'ملف المتصل المسجل' : 'Registered Caller Profile'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditCaller(selectedCaller)}
                      className="px-2.5 py-1 rounded-lg bg-[#EBF4FC] dark:bg-[#071629] hover:bg-[#004B87] text-[#004B87] dark:text-sky-300 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-blue-200 dark:border-[#004B87] transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>{language === 'ar' ? 'تعديل' : 'Edit'}</span>
                    </button>
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ type: 'caller', item: selectedCaller })}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-rose-200 dark:border-rose-800 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{language === 'ar' ? 'حذف' : 'Delete'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  {selectedCaller.title ? `${selectedCaller.title} / ` : ''}
                  {selectedCaller.name}
                </h3>

                <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300 pt-1">
                  <div className="flex items-center gap-2 font-mono font-bold tabular-nums">
                    <Phone className="w-3.5 h-3.5 text-[#00A651]" />
                    <span>{selectedCaller.primaryPhone}</span>
                    {selectedCaller.secondaryPhone && (
                      <span className="text-slate-400">/ {selectedCaller.secondaryPhone}</span>
                    )}
                  </div>
                  {selectedCaller.taxRegistrationNumber && (
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <Building2 className="w-3.5 h-3.5 text-[#004B87] dark:text-sky-300" />
                      <span>
                        {language === 'ar' ? 'الرقم الضريبي المرتبط:' : 'Tax ID:'}{' '}
                        {selectedCaller.taxRegistrationNumber}
                      </span>
                    </div>
                  )}
                  {selectedCaller.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{selectedCaller.email}</span>
                    </div>
                  )}
                  {selectedCaller.description && (
                    <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400 pt-1">
                      <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{selectedCaller.description}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-2.5 flex items-center justify-between">
                  <span>
                    {language === 'ar' ? 'الحالات المرتبطة بالمتصل:' : 'Related Cases:'}
                  </span>
                  <span className="font-mono tabular-nums text-[#00A651] dark:text-[#00E676]">
                    {relatedCallerCases.length}
                  </span>
                </div>

                <div className="space-y-2.5 max-h-96 overflow-y-auto">
                  {relatedCallerCases.map((rc) => (
                    <div
                      key={rc.id}
                      onClick={() => onOpenCase(rc)}
                      className="group p-3 bg-slate-50 dark:bg-[#071629] hover:bg-[#EBF4FC] dark:hover:bg-[#002B54] rounded-xl border border-slate-200 dark:border-[#00386B] cursor-pointer transition-all text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[#004B87] dark:text-sky-300 text-[11px] tabular-nums">
                          {rc.caseId}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                          {new Date(rc.createdAt).toLocaleDateString(
                            language === 'ar' ? 'ar-EG' : 'en-US'
                          )}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:text-[#004B87] dark:group-hover:text-[#00E676] transition-colors">
                        {rc.title}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {rc.serviceType}
                        </span>
                        <StatusBadge status={rc.status} />
                      </div>
                    </div>
                  ))}

                  {relatedCallerCases.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      {language === 'ar'
                        ? 'لا توجد حالات مرتبطة بهذا المتصل'
                        : 'No cases linked to this caller'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <Users className="w-12 h-12 stroke-1 text-slate-300 dark:text-slate-700 mb-2" />
              <div className="font-bold text-xs text-slate-600 dark:text-slate-300">
                {language === 'ar' ? 'حدد متصلاً من القائمة' : 'Select a Caller'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {isSuperAdmin
                  ? language === 'ar'
                    ? 'لعرض بياناته وأرقام التواصل وتعديل أو حذف السجل'
                    : 'To inspect details, edit, or delete the caller record'
                  : language === 'ar'
                  ? 'لعرض بياناته وأرقام التواصل وتعديل السجل'
                  : 'To inspect details or edit the caller record'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Taxpayer Modal */}
      {editingTaxpayer &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            onClick={() => setEditingTaxpayer(null)}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#004B87] w-full max-w-lg my-auto max-h-[92dvh] overflow-hidden flex flex-col text-start animate-scale-in"
            >
              <div className="bg-[#00264D] p-4 text-white flex items-center justify-between border-b border-[#004B87] shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-[#004B87] text-[#00E676] shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-sm truncate">
                      {language === 'ar' ? 'تعديل بيانات الممول' : 'Edit Taxpayer Record'}
                    </h3>
                    <p className="text-[11px] text-sky-200 font-mono tabular-nums truncate">
                      {editingTaxpayer.taxRegistrationNumber}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTaxpayer(null)}
                  className="p-1.5 rounded-xl bg-[#003366] hover:bg-[#004B87] text-slate-200 hover:text-white transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={handleSaveTaxpayer}
                className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3.5 text-xs"
              >
                {tpError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>{tpError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'رقم التسجيل الضريبي (9 أرقام) *' : 'Tax Reg. Number (9 digits) *'}
                    </label>
                    <input
                      type="text"
                      maxLength={9}
                      value={tpRegNum}
                      onChange={(e) => setTpRegNum(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none tabular-nums"
                      required
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'نوع الضريبة' : 'Tax Type'}
                    </label>
                    <select
                      value={tpTaxType}
                      onChange={(e) => setTpTaxType(e.target.value as TaxType)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    >
                      <option value="ضرائب دخل">ضرائب دخل</option>
                      <option value="ضرائب قيمة مضافة">ضرائب قيمة مضافة</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    {language === 'ar' ? 'اسم الممول / الشركة *' : 'Taxpayer / Company Name *'}
                  </label>
                  <input
                    type="text"
                    value={tpName}
                    onChange={(e) => setTpName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'المحافظة / المأمورية' : 'City / Tax Office'}
                    </label>
                    <input
                      type="text"
                      value={tpCity}
                      onChange={(e) => setTpCity(e.target.value)}
                      placeholder={language === 'ar' ? 'مثال: القاهرة' : 'e.g. Cairo'}
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'النشاط الضريبي' : 'Business Activity'}
                    </label>
                    <input
                      type="text"
                      value={tpActivity}
                      onChange={(e) => setTpActivity(e.target.value)}
                      placeholder={language === 'ar' ? 'مثال: تجارة ومقاولات' : 'e.g. Commerce'}
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    {language === 'ar' ? 'ملاحظات إضافية' : 'Notes'}
                  </label>
                  <StyledTextarea
                    rows={2}
                    value={tpNotes}
                    onChange={(e) => setTpNotes(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#00386B]">
                  <button
                    type="button"
                    onClick={() => setEditingTaxpayer(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#071629] hover:bg-slate-200 dark:hover:bg-[#002B54] text-slate-700 dark:text-slate-200 font-bold transition-colors"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTp}
                    className="px-4 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black flex items-center gap-1.5 shadow-md disabled:opacity-50 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {isSavingTp
                        ? language === 'ar'
                          ? 'جارٍ الحفظ...'
                          : 'Saving...'
                        : language === 'ar'
                        ? 'حفظ التعديلات'
                        : 'Save Changes'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Edit Caller Modal */}
      {editingCaller &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            onClick={() => setEditingCaller(null)}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#004B87] w-full max-w-xl my-auto max-h-[92dvh] overflow-hidden flex flex-col text-start animate-scale-in"
            >
              <div className="bg-[#00264D] p-4 text-white flex items-center justify-between border-b border-[#004B87] shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-[#00A651] text-white shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-sm truncate">
                      {language === 'ar' ? 'تعديل بيانات المتصل' : 'Edit Caller Record'}
                    </h3>
                    <p className="text-[11px] text-sky-200 font-mono tabular-nums truncate">
                      {editingCaller.primaryPhone}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCaller(null)}
                  className="p-1.5 rounded-xl bg-[#003366] hover:bg-[#004B87] text-slate-200 hover:text-white transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={handleSaveCaller}
                className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3.5 text-xs"
              >
                {clError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>{clError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'اسم المتصل *' : 'Caller Name *'}
                    </label>
                    <input
                      type="text"
                      value={clName}
                      onChange={(e) => setClName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'اللقب / الصفة' : 'Title'}
                    </label>
                    <select
                      value={clTitle}
                      onChange={(e) => setClTitle(e.target.value as CallerTitle)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    >
                      <option value="">{language === 'ar' ? 'بدون لقب' : 'None'}</option>
                      {CALLER_TITLES.map((tl) => (
                        <option key={tl} value={tl}>
                          {tl}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'رقم الهاتف الأساسي *' : 'Primary Phone *'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      inputMode="numeric"
                      value={clPrimaryPhone}
                      onChange={(e) =>
                        setClPrimaryPhone(normalizeAsciiDigits(e.target.value).replace(/\D/g, ''))
                      }
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none tabular-nums text-left"
                      required
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'رقم هاتف إضافي' : 'Secondary Phone'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      inputMode="numeric"
                      value={clSecondaryPhone}
                      onChange={(e) =>
                        setClSecondaryPhone(normalizeAsciiDigits(e.target.value).replace(/\D/g, ''))
                      }
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none tabular-nums text-left"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'التصنيف القانوني' : 'Classification'}
                    </label>
                    <select
                      value={clClass}
                      onChange={(e) => setClClass(e.target.value as CallerClassification)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    >
                      <option value="">{language === 'ar' ? 'غير محدد' : 'Unspecified'}</option>
                      <option value="شخص طبيعي">شخص طبيعي</option>
                      <option value="شخص اعتباري">شخص اعتباري</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'رقم التسجيل الضريبي المرتبط (9 أرقام)' : 'Linked Tax Reg. No (9 digits)'}
                    </label>
                    <input
                      type="text"
                      maxLength={9}
                      value={clTaxNum}
                      onChange={(e) => setClTaxNum(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      {language === 'ar' ? 'حالة البريد الإلكتروني' : 'Email Availability'}
                    </label>
                    <select
                      value={clEmailAvail}
                      onChange={(e) =>
                        setClEmailAvail(e.target.value as 'متوفر' | 'غير متوفر')
                      }
                      className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    >
                      <option value="غير متوفر">غير متوفر</option>
                      <option value="متوفر">متوفر</option>
                    </select>
                  </div>

                  {clEmailAvail === 'متوفر' && (
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                        {language === 'ar' ? 'البريد الإلكتروني *' : 'Email Address *'}
                      </label>
                      <input
                        type="email"
                        value={clEmail}
                        onChange={(e) => setClEmail(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                        required
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    {language === 'ar' ? 'ملاحظات عن المتصل' : 'Caller Notes'}
                  </label>
                  <StyledTextarea
                    rows={2}
                    value={clDesc}
                    onChange={(e) => setClDesc(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#00386B]">
                  <button
                    type="button"
                    onClick={() => setEditingCaller(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#071629] hover:bg-slate-200 dark:hover:bg-[#002B54] text-slate-700 dark:text-slate-200 font-bold transition-colors"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCl}
                    className="px-4 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black flex items-center gap-1.5 shadow-md disabled:opacity-50 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {isSavingCl
                        ? language === 'ar'
                          ? 'جارٍ الحفظ...'
                          : 'Saving...'
                        : language === 'ar'
                        ? 'حفظ التعديلات'
                        : 'Save Changes'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Confirmation Modal (Super Admin Only) */}
      {isSuperAdmin &&
        deleteTarget &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            onClick={() => !isDeleting && setDeleteTarget(null)}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[#001429]/80 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-800 w-full max-w-md my-auto max-h-[90dvh] overflow-hidden flex flex-col animate-scale-in text-start"
            >
              <div className="bg-rose-600 p-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-black text-sm">
                    {deleteTarget.type === 'taxpayer'
                      ? language === 'ar'
                        ? 'تأكيد حذف سجل الممول'
                        : 'Confirm Taxpayer Deletion'
                      : language === 'ar'
                      ? 'تأكيد حذف سجل المتصل'
                      : 'Confirm Caller Deletion'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="p-1 rounded-lg hover:bg-rose-700 text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs overflow-y-auto">
                <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
                  {deleteTarget.type === 'taxpayer'
                    ? language === 'ar'
                      ? `هل أنت متأكد من رغبتك في حذف سجل الممول "${deleteTarget.item.name}" (رقم التسجيل: ${deleteTarget.item.taxRegistrationNumber})؟ لا يمكن التراجع عن هذا الإجراء.`
                      : `Are you sure you want to permanently delete taxpayer "${deleteTarget.item.name}" (${deleteTarget.item.taxRegistrationNumber})?`
                    : language === 'ar'
                    ? `هل أنت متأكد من رغبتك في حذف سجل المتصل "${deleteTarget.item.name}" (${deleteTarget.item.primaryPhone})؟ لا يمكن التراجع عن هذا الإجراء.`
                    : `Are you sure you want to permanently delete caller "${deleteTarget.item.name}" (${deleteTarget.item.primaryPhone})?`}
                </p>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#00386B]">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    disabled={isDeleting}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#071629] hover:bg-slate-200 dark:hover:bg-[#002B54] text-slate-700 dark:text-slate-200 font-bold transition-colors"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black flex items-center gap-1.5 shadow-md disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {isDeleting
                        ? language === 'ar'
                          ? 'جارٍ الحذف...'
                          : 'Deleting...'
                        : language === 'ar'
                        ? 'تأكيد الحذف النهائي'
                        : 'Confirm Delete'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
