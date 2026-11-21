/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  BrainCircuit,
  X,
  Filter,
  ArrowRight,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { Case } from '../types';
import { parseSmartSearchQuery, SmartSearchParams } from '../services/geminiService';
import { INCOME_TAX_SERVICES, VAT_SERVICES, OTHER_SERVICE_OPTION } from '../data/taxServices';
import { filterCasesByCriteria } from '../utils/caseFilterUtils';

interface SmartSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFilters: (filters: SmartSearchParams) => void;
  cases?: Case[];
  onOpenCase?: (caseItem: Case) => void;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'المفتوحة / قيد المعالجة',
  incoming: 'الواردة للإدارة والدعم',
};

const DATE_LABELS: Record<string, string> = {
  today: 'اليوم',
  week: 'آخر 7 أيام',
  month: 'آخر 30 يوماً',
  all: 'كافة التواريخ',
};

export const SmartSearchModal: React.FC<SmartSearchModalProps> = ({
  isOpen,
  onClose,
  onApplyFilters,
  cases = [],
  onOpenCase,
}) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<SmartSearchParams | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const availableServices = useMemo(() => {
    const set = new Set<string>([
      ...INCOME_TAX_SERVICES,
      ...VAT_SERVICES,
      OTHER_SERVICE_OPTION,
    ]);
    cases.forEach((c) => {
      if (c.serviceType && c.serviceType.trim()) {
        set.add(c.serviceType.trim());
      }
    });
    return Array.from(set);
  }, [cases]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const matchedCases = useMemo(() => {
    if (!parsedResult) return [];
    const filtered = filterCasesByCriteria(cases, {
      status: parsedResult.status || 'all',
      taxType: parsedResult.taxType || 'all',
      callType: parsedResult.callType || 'all',
      serviceType: parsedResult.serviceType || 'all',
      priority: parsedResult.priority || 'all',
      datePreset: parsedResult.datePreset || 'all',
      searchTerm: parsedResult.freeText || '',
    });
    return filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [cases, parsedResult]);

  if (!isOpen) return null;

  const executeSearch = async (textToSearch: string) => {
    const trimmed = textToSearch.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setErrorMsg(null);
    setParsedResult(null);
    try {
      const result = await parseSmartSearchQuery(trimmed, availableServices);
      setParsedResult(result);
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : 'تعذر تحليل استعلام البحث عبر الذكاء الاصطناعي حالياً.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSearch(query);
  };

  const handleExampleClick = async (example: string) => {
    setQuery(example);
    await executeSearch(example);
  };

  const handleApply = () => {
    if (parsedResult) {
      onApplyFilters(parsedResult);
      onClose();
    }
  };

  const handleApplyRawTextFallback = () => {
    if (!query.trim()) return;
    onApplyFilters({
      datePreset: 'all',
      freeText: query.trim(),
    });
    onClose();
  };

  const sampleQueries = [
    'اعرض الحالات الخاصة بضريبة القيمة المضافة الخاصة بالفاتورة الإلكترونية',
    'الحالات المغلقة الخاصة بضريبة الدخل هذا الشهر',
    'الشكاوى المحولة للإدارة اليوم',
    'استفسارات منظومة الإيصال الإلكتروني',
  ];

  const hasAnyStructuredOrTextFilter =
    !!parsedResult &&
    Boolean(
      parsedResult.taxType ||
        parsedResult.callType ||
        parsedResult.serviceType ||
        parsedResult.status ||
        parsedResult.priority ||
        (parsedResult.datePreset && parsedResult.datePreset !== 'all') ||
        parsedResult.freeText
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-4 text-start"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#00386B] w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        {/* Header */}
        <div className="bg-[#00264D] p-4 text-white flex items-center justify-between border-b border-[#004B87] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00A651] text-white">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                البحث الذكي باللغة الطبيعية (Gemini AI)
              </h3>
              <p className="text-xs text-sky-200">
                اكتب طلبك بالعربية أو رقم الحالة أو اسم الممول وسيتم تحويله لفلاتر دقيقة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sky-200 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 text-xs overflow-y-auto">
          <form onSubmit={handleSearch} className="space-y-2">
            <label className="font-bold text-slate-700 dark:text-slate-200 block">
              اكتب استعلام البحث:
            </label>
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="مثال: الشكاوى العاجلة للفاتورة الإلكترونية أو رقم حالة CRM-000001..."
                  className="w-full p-3 pl-11 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl focus:ring-2 focus:ring-[#00A651] font-semibold text-slate-900 dark:text-white text-xs focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isLoading || !query.trim()}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-[#00A651] hover:bg-[#008742] text-white rounded-lg disabled:opacity-50 transition-colors"
                  title="تحليل وبحث"
                >
                  {isLoading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Quick Examples */}
          <div>
            <span className="text-slate-500 dark:text-slate-400 font-bold block mb-1.5 text-[11px]">
              أمثلة شائعة (اضغط للتنفيذ المباشر):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {sampleQueries.map((sq, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleExampleClick(sq)}
                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-[#071629] hover:bg-slate-200 dark:hover:bg-[#003366] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#00386B] rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50 text-start"
                >
                  {sq}
                </button>
              ))}
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl space-y-2.5">
              <div className="flex items-start gap-2 text-rose-800 dark:text-rose-200 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => executeSearch(query)}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition-colors"
                >
                  إعادة المحاولة
                </button>
                {query.trim() && (
                  <button
                    type="button"
                    onClick={handleApplyRawTextFallback}
                    className="px-3 py-1 bg-white dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] text-slate-700 dark:text-slate-200 hover:bg-slate-100 rounded-lg text-[11px] font-bold transition-colors"
                  >
                    بحث نصي مباشر بالكلمات المدخلة
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Parsed Result */}
          {parsedResult && (
            <div className="p-3.5 bg-emerald-50/80 dark:bg-[#071F2A] border border-emerald-300 dark:border-[#00A651]/50 rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5 text-xs">
                  <Filter className="w-3.5 h-3.5 text-emerald-700 dark:text-[#00E676]" />
                  <span>تم استخراج معايير التصفية التالية:</span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-white dark:bg-[#0B1D35] border border-emerald-300 dark:border-[#00A651]/40 text-emerald-800 dark:text-[#00E676] font-bold text-[11px] font-mono tabular-nums">
                  {matchedCases.length} حالة مطابقة
                </span>
              </div>

              {hasAnyStructuredOrTextFilter ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {parsedResult.taxType && (
                    <div className="bg-white dark:bg-[#0B1D35] p-2 rounded-lg border border-emerald-200 dark:border-[#00386B]">
                      <span className="text-slate-500 dark:text-slate-400">نوع الضريبة: </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {parsedResult.taxType}
                      </span>
                    </div>
                  )}
                  {parsedResult.callType && (
                    <div className="bg-white dark:bg-[#0B1D35] p-2 rounded-lg border border-emerald-200 dark:border-[#00386B]">
                      <span className="text-slate-500 dark:text-slate-400">نوع الاتصال: </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {parsedResult.callType}
                      </span>
                    </div>
                  )}
                  {parsedResult.serviceType && (
                    <div className="bg-white dark:bg-[#0B1D35] p-2 rounded-lg border border-emerald-200 dark:border-[#00386B]">
                      <span className="text-slate-500 dark:text-slate-400">الخدمة: </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {parsedResult.serviceType}
                      </span>
                    </div>
                  )}
                  {parsedResult.status && (
                    <div className="bg-white dark:bg-[#0B1D35] p-2 rounded-lg border border-emerald-200 dark:border-[#00386B]">
                      <span className="text-slate-500 dark:text-slate-400">الحالة: </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {STATUS_LABELS[parsedResult.status] || parsedResult.status}
                      </span>
                    </div>
                  )}
                  {parsedResult.priority && (
                    <div className="bg-white dark:bg-[#0B1D35] p-2 rounded-lg border border-emerald-200 dark:border-[#00386B]">
                      <span className="text-slate-500 dark:text-slate-400">الأولوية: </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {parsedResult.priority}
                      </span>
                    </div>
                  )}
                  {parsedResult.datePreset && parsedResult.datePreset !== 'all' && (
                    <div className="bg-white dark:bg-[#0B1D35] p-2 rounded-lg border border-emerald-200 dark:border-[#00386B]">
                      <span className="text-slate-500 dark:text-slate-400">الفترة: </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {DATE_LABELS[parsedResult.datePreset] || 'كافة التواريخ'}
                      </span>
                    </div>
                  )}
                  {parsedResult.freeText && (
                    <div className="sm:col-span-2 bg-white dark:bg-[#0B1D35] p-2 rounded-lg border border-emerald-200 dark:border-[#00386B]">
                      <span className="text-slate-500 dark:text-slate-400">كلمات البحث: </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {parsedResult.freeText}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white dark:bg-[#0B1D35] p-2.5 rounded-lg border border-emerald-200 dark:border-[#00386B] text-[11px] text-slate-600 dark:text-slate-300">
                  لم يتم تحديد فلتر مقيد؛ سيتم عرض كافة الحالات المسجلة.
                </div>
              )}

              {/* Direct Top Matching Cases Preview */}
              {matchedCases.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-emerald-200/80 dark:border-[#00A651]/30">
                  <div className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300">
                    أبرز النتائج المطابقة (اضغط لفتح الحالة مباشرة):
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {matchedCases.slice(0, 4).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (onOpenCase) {
                            onOpenCase(c);
                            onClose();
                          }
                        }}
                        className="w-full text-start p-2 rounded-lg bg-white dark:bg-[#0B1D35] hover:bg-emerald-100/70 dark:hover:bg-[#003366] border border-emerald-200 dark:border-[#00386B] transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#004B87] dark:text-sky-300 text-[11px]">
                              {c.caseId}
                            </span>
                            <span className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                              {c.title}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {c.taxpayerName || c.callerName} · {c.serviceType} · {c.status}
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-[#00A651] shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#003366] rounded-lg text-xs font-bold transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!parsedResult}
            className="px-4 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-bold rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            <span>
              تطبيق الفلترة وعرض النتائج
              {parsedResult ? ` (${matchedCases.length})` : ''}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
