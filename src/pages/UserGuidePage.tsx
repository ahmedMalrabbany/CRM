/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Download,
  FileText,
  Layers,
  Search,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Eye,
} from 'lucide-react';
import {
  USER_GUIDE_METADATA,
  USER_GUIDE_SECTIONS,
} from '../data/userGuideContent';
import { generateUserGuidePdf, GeneratedUserGuidePdf } from '../utils/userGuidePdf';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

type ViewMode = 'pages' | 'pdf_embed' | 'interactive';

export const UserGuidePage: React.FC = () => {
  const { isRtl } = useThemeLanguage();
  const [viewMode, setViewMode] = useState<ViewMode>('pages');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>(USER_GUIDE_SECTIONS[0].id);
  const [pdfArtifact, setPdfArtifact] = useState<GeneratedUserGuidePdf | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const buildPdf = () => {
    setIsGenerating(true);
    setErrorMsg(null);
    setTimeout(() => {
      try {
        const result = generateUserGuidePdf();
        setPdfArtifact((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return result;
        });
      } catch (err: any) {
        setErrorMsg(err?.message || 'تعذر توليد ملف الدليل بصيغة PDF.');
      } finally {
        setIsGenerating(false);
      }
    }, 30);
  };

  useEffect(() => {
    buildPdf();
    return () => {
      setPdfArtifact((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return null;
      });
    };
  }, []);

  const handleDownloadPdf = () => {
    if (!pdfArtifact) return;
    const link = document.createElement('a');
    link.href = pdfArtifact.url;
    link.download = pdfArtifact.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return USER_GUIDE_SECTIONS;
    return USER_GUIDE_SECTIONS.filter(
      (sec) =>
        sec.title.toLowerCase().includes(q) ||
        sec.summary.toLowerCase().includes(q) ||
        sec.audience.toLowerCase().includes(q) ||
        sec.steps.some(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q)
        )
    );
  }, [searchQuery]);

  return (
    <div className="space-y-4 text-start animate-fade-up" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>وثيقة مرجعية حصرية لحساب مدير النظام (Admin Guide · PDF)</span>
          </div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#00A651] shrink-0" />
            <span>{USER_GUIDE_METADATA.title}</span>
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {USER_GUIDE_METADATA.subtitle} · يشمل كافة مسارات العمل والخطوات التشغيلية بصيغة PDF قابلة للعرض والتحميل المباشر.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={buildPdf}
            disabled={isGenerating}
            className="px-3.5 py-2.5 bg-slate-100 dark:bg-[#071629] hover:bg-[#EBF4FC] dark:hover:bg-[#00386B] text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-[#004B87] flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-[#004B87] dark:text-sky-300 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>إعادة توليد PDF</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={!pdfArtifact || isGenerating}
            className="px-4 py-2.5 bg-[#00A651] hover:bg-[#008742] text-white font-black text-xs rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>تحميل دليل الاستخدام (PDF)</span>
            {pdfArtifact && (
              <span className="px-1.5 py-0.5 rounded bg-white/20 font-mono text-[10px] tabular-nums">
                {pdfArtifact.pageCount} صفحات
              </span>
            )}
          </button>
        </div>
      </div>

      {/* View Mode Switcher */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-2 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('pages')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'pages'
                ? 'bg-[#004B87] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071629]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>معاينة صفحات ملف PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('pdf_embed')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'pdf_embed'
                ? 'bg-[#004B87] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071629]'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>عارض PDF المدمج</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('interactive')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'interactive'
                ? 'bg-[#004B87] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071629]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>الدليل التفاعلي بالخطوات</span>
          </button>
        </div>

        {viewMode === 'interactive' && (
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث داخل خطوات دليل الاستخدام..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
            />
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Mode 1: High-Resolution Rendered A4 PDF Pages Viewer */}
      {viewMode === 'pages' && (
        <div className="space-y-4">
          {isGenerating ? (
            <div className="bg-white/95 dark:bg-[#0B1D35]/95 rounded-2xl border border-slate-200 dark:border-[#00386B] p-12 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-[#00A651] border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="font-bold text-sm text-slate-700 dark:text-slate-200">
                جارٍ تجهيز صفحات دليل الاستخدام الرسمي بصيغة PDF...
              </div>
            </div>
          ) : (
            pdfArtifact && (
              <div className="grid grid-cols-1 gap-6 max-w-4xl mx-auto">
                {pdfArtifact.pageImages.map((imgSrc, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-300 dark:border-[#004B87] shadow-xl overflow-hidden"
                  >
                    <div className="px-4 py-2 bg-[#00264D] text-white text-xs font-bold flex items-center justify-between">
                      <span>
                        {idx === 0
                          ? 'صفحة الغلاف وفهرس المحتويات'
                          : USER_GUIDE_SECTIONS[idx - 1]?.title || `الصفحة ${idx + 1}`}
                      </span>
                      <span className="font-mono text-[#00E676] tabular-nums">
                        {idx + 1} / {pdfArtifact.pageCount}
                      </span>
                    </div>
                    <img
                      src={imgSrc}
                      alt={`صفحة ${idx + 1} من دليل استخدام المنظومة`}
                      className="w-full h-auto block"
                    />
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Mode 2: Native Embedded PDF Viewer */}
      {viewMode === 'pdf_embed' && (
        <div className="bg-white dark:bg-[#0B1D35] rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
          {pdfArtifact ? (
            <div className="flex flex-col">
              <div className="px-4 py-2.5 bg-[#00264D] text-white text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  معاينة المستند بصيغة PDF ({pdfArtifact.fileName})
                </span>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="px-3 py-1 rounded-lg bg-[#00A651] hover:bg-[#008742] text-white font-black text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل نسخة PDF</span>
                </button>
              </div>
              <iframe
                src={pdfArtifact.url}
                title={USER_GUIDE_METADATA.title}
                className="w-full h-[78vh] min-h-[540px] bg-slate-100"
              />
            </div>
          ) : (
            <div className="p-10 text-center text-xs text-slate-500">جارٍ تحميل ملف PDF...</div>
          )}
        </div>
      )}

      {/* Mode 3: Interactive Step-by-Step Guide */}
      {viewMode === 'interactive' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Quick Section Navigation */}
          <div className="lg:col-span-4 bg-white/95 dark:bg-[#0B1D35]/95 rounded-2xl border border-slate-200 dark:border-[#00386B] p-3 space-y-1.5 shadow-saas">
            <div className="px-2 py-1 text-xs font-black text-[#004B87] dark:text-[#00E676]">
              فصول دليل الاستخدام ({filteredSections.length})
            </div>
            {filteredSections.map((sec) => {
              const active = sec.id === selectedSectionId;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSelectedSectionId(sec.id)}
                  className={`w-full text-right p-2.5 rounded-xl border text-xs transition-all flex items-center gap-2.5 cursor-pointer ${
                    active
                      ? 'bg-[#004B87] text-white border-[#004B87] shadow-sm'
                      : 'bg-slate-50 dark:bg-[#071629] text-slate-800 dark:text-slate-100 border-slate-200 dark:border-[#00386B] hover:border-[#00A651]'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg font-mono font-black flex items-center justify-center shrink-0 ${
                      active ? 'bg-[#00A651] text-white' : 'bg-[#00264D] text-[#00E676]'
                    }`}
                  >
                    {sec.chapterNumber}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold truncate">{sec.title}</div>
                    <div className={`text-[10px] truncate ${active ? 'text-sky-200' : 'text-slate-500 dark:text-slate-400'}`}>
                      {sec.audience}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Chapter Steps */}
          <div className="lg:col-span-8 space-y-4">
            {filteredSections.map((sec) => {
              if (!searchQuery.trim() && sec.id !== selectedSectionId) return null;
              return (
                <div
                  key={sec.id}
                  className="bg-white/95 dark:bg-[#0B1D35]/95 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden"
                >
                  <div className="bg-[#00264D] p-4 text-white border-b border-[#004B87] flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold text-[#00E676]">
                        الفصل {sec.chapterNumber} · {sec.audience}
                      </div>
                      <h2 className="text-base font-black mt-0.5">{sec.title}</h2>
                    </div>
                    <Sparkles className="w-5 h-5 text-[#00E676] shrink-0" />
                  </div>

                  <div className="p-5 space-y-4 text-xs">
                    <p className="p-3.5 rounded-xl bg-[#EBF4FC] dark:bg-[#071629] border border-blue-200 dark:border-[#004B87] text-slate-800 dark:text-slate-100 font-semibold leading-relaxed">
                      {sec.summary}
                    </p>

                    <div className="space-y-3">
                      {sec.steps.map((step) => (
                        <div
                          key={step.number}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] flex items-start gap-3"
                        >
                          <span className="w-7 h-7 rounded-full bg-[#004B87] text-[#00E676] font-mono font-black flex items-center justify-center shrink-0">
                            {step.number}
                          </span>
                          <div className="space-y-1">
                            <h3 className="font-black text-sm text-slate-900 dark:text-white">
                              {step.title}
                            </h3>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {sec.importantNote && (
                      <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-[#003324]/50 border border-emerald-300 dark:border-[#00A651] text-emerald-900 dark:text-emerald-200 font-bold flex items-start gap-2 leading-relaxed">
                        <CheckCircle2 className="w-4 h-4 text-[#00A651] shrink-0 mt-0.5" />
                        <span>{sec.importantNote}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredSections.length === 0 && (
              <div className="bg-white/95 dark:bg-[#0B1D35]/95 rounded-2xl border border-slate-200 dark:border-[#00386B] p-10 text-center text-xs text-slate-400">
                لا توجد خطوات مطابقة لكلمة البحث
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
