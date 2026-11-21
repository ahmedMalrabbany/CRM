/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Eye,
  UploadCloud,
  LogOut,
  Search,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  initGoogleWorkspaceAuth,
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
  getGoogleWorkspaceAccessToken,
  getCurrentGoogleUser,
  listUserSpreadsheets,
  getSpreadsheetMetadata,
  readSheetPreview,
  createGoogleSpreadsheet,
  writeTabsToSpreadsheet,
  DriveSpreadsheetItem,
  SpreadsheetMetadata,
  SheetWriteTab,
} from '../services/googleWorkspaceService';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  defaultNewSheetName: string;
  prepareTabsToWrite: () => Promise<SheetWriteTab[]> | SheetWriteTab[];
}

export const GoogleSheetsSyncModal: React.FC<GoogleSheetsSyncModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  defaultNewSheetName,
  prepareTabsToWrite,
}) => {
  const { isRtl } = useThemeLanguage();
  const [needsAuth, setNeedsAuth] = useState(true);
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [spreadsheets, setSpreadsheets] = useState<DriveSpreadsheetItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [sheetIdInput, setSheetIdInput] = useState('');
  const [newSheetTitle, setNewSheetTitle] = useState(defaultNewSheetName);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);

  const [selectedMeta, setSelectedMeta] = useState<SpreadsheetMetadata | null>(null);
  const [selectedTabTitle, setSelectedTabTitle] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Explicit confirmation dialog state before any destructive/mutating Google Sheets write
  const [pendingWriteConfirmation, setPendingWriteConfirmation] = useState<{
    meta: SpreadsheetMetadata;
    tabs: SheetWriteTab[];
    totalRows: number;
  } | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [writeSuccess, setWriteSuccess] = useState<{
    spreadsheetUrl: string;
    updatedTabs: string[];
    totalRows: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    setErrorMsg(null);
    try {
      const files = await listUserSpreadsheets();
      setSpreadsheets(files);
    } catch (err: any) {
      if (err?.code === 'AUTH_REQUIRED') {
        setNeedsAuth(true);
      } else {
        setErrorMsg(err?.message || 'تعذر جلب قائمة ملفات Google Sheets.');
      }
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setNewSheetTitle(defaultNewSheetName);
    setWriteSuccess(null);
    setPendingWriteConfirmation(null);
    setErrorMsg(null);

    const checkCurrent = async () => {
      const token = await getGoogleWorkspaceAccessToken();
      const user = getCurrentGoogleUser();
      if (token && user) {
        setGoogleUser(user);
        setNeedsAuth(false);
        loadFiles();
      } else {
        setNeedsAuth(true);
      }
    };
    checkCurrent();

    const unsub = initGoogleWorkspaceAuth(
      (user) => {
        setGoogleUser(user);
        setNeedsAuth(false);
      },
      () => {
        setGoogleUser(null);
        setNeedsAuth(true);
      }
    );

    return () => unsub();
  }, [isOpen, defaultNewSheetName, loadFiles]);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      const result = await signInWithGoogleWorkspace();
      setGoogleUser(result.user);
      setNeedsAuth(false);
      await loadFiles();
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تسجيل الدخول بحساب Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleWorkspace();
    setGoogleUser(null);
    setNeedsAuth(true);
    setSpreadsheets([]);
    setSelectedMeta(null);
    setPreviewRows([]);
  };

  const handleInspectSpreadsheet = async (idOrUrl: string) => {
    setErrorMsg(null);
    setWriteSuccess(null);
    setIsLoadingPreview(true);
    try {
      const meta = await getSpreadsheetMetadata(idOrUrl);
      setSelectedMeta(meta);
      setSheetIdInput(meta.spreadsheetId);
      const firstTab = meta.sheets[0]?.title || '';
      setSelectedTabTitle(firstTab);
      if (firstTab) {
        const rows = await readSheetPreview(meta.spreadsheetId, firstTab);
        setPreviewRows(rows);
      } else {
        setPreviewRows([]);
      }
    } catch (err: any) {
      if (err?.code === 'AUTH_REQUIRED') {
        setNeedsAuth(true);
      } else {
        setErrorMsg(err?.message || 'تعذر فتح ملف Google Sheets المحدد.');
      }
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSwitchPreviewTab = async (tabTitle: string) => {
    if (!selectedMeta) return;
    setSelectedTabTitle(tabTitle);
    setIsLoadingPreview(true);
    setErrorMsg(null);
    try {
      const rows = await readSheetPreview(selectedMeta.spreadsheetId, tabTitle);
      setPreviewRows(rows);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر قراءة بيانات الورقة.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleCreateNewSheet = async () => {
    if (!newSheetTitle.trim()) return;
    setIsCreatingSheet(true);
    setErrorMsg(null);
    try {
      const tabs = await prepareTabsToWrite();
      const created = await createGoogleSpreadsheet(
        newSheetTitle.trim(),
        tabs.map((t) => t.title)
      );
      setSelectedMeta(created);
      setSheetIdInput(created.spreadsheetId);
      setSelectedTabTitle(created.sheets[0]?.title || '');
      setPreviewRows([]);
      await loadFiles();
    } catch (err: any) {
      if (err?.code === 'AUTH_REQUIRED') setNeedsAuth(true);
      else setErrorMsg(err?.message || 'تعذر إنشاء جدول بيانات جديد.');
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleRequestWriteConfirmation = async () => {
    if (!selectedMeta) {
      setErrorMsg('يرجى اختيار ملف Google Sheets أو إنشاء ملف جديد أولاً.');
      return;
    }
    setErrorMsg(null);
    try {
      const tabs = await prepareTabsToWrite();
      const totalRows = tabs.reduce((sum, t) => sum + Math.max(0, t.rows.length - 1), 0);
      setPendingWriteConfirmation({ meta: selectedMeta, tabs, totalRows });
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تجهيز البيانات للكتابة.');
    }
  };

  const handleConfirmWrite = async () => {
    if (!pendingWriteConfirmation) return;
    setIsWriting(true);
    setErrorMsg(null);
    try {
      const res = await writeTabsToSpreadsheet(
        pendingWriteConfirmation.meta.spreadsheetId,
        pendingWriteConfirmation.tabs
      );
      setWriteSuccess(res);
      setPendingWriteConfirmation(null);
      await handleInspectSpreadsheet(pendingWriteConfirmation.meta.spreadsheetId);
    } catch (err: any) {
      if (err?.code === 'AUTH_REQUIRED') setNeedsAuth(true);
      else setErrorMsg(err?.message || 'تعذر تحديث بيانات Google Sheets.');
    } finally {
      setIsWriting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={() => !isWriting && onClose()}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#0B1D35] rounded-2xl w-full max-w-3xl my-auto max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 dark:border-[#004B87] overflow-hidden animate-scale-in text-start"
      >
        {/* Header */}
        <div className="bg-[#00264D] p-4 sm:p-5 text-white flex items-center justify-between gap-3 border-b border-[#004B87] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-[#00A651] text-white shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-sm sm:text-base truncate">{title}</h2>
              {subtitle && (
                <p className="text-[11px] text-sky-200/90 truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {writeSuccess && (
            <div className="p-3.5 bg-emerald-50 dark:bg-[#00A651]/15 border border-emerald-300 dark:border-[#00A651] rounded-xl text-emerald-900 dark:text-emerald-200 space-y-1.5">
              <div className="font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#00A651] shrink-0" />
                <span>
                  تمت مزامنة {writeSuccess.totalRows} سجل بنجاح في أوراق ({writeSuccess.updatedTabs.join('، ')}).
                </span>
              </div>
              <a
                href={writeSuccess.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#004B87] dark:text-[#00E676] font-bold hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح جدول البيانات في Google Sheets</span>
              </a>
            </div>
          )}

          {needsAuth ? (
            <div className="p-6 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-2xl text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#E6F7EF] dark:bg-[#00A651]/20 text-[#00A651] flex items-center justify-center mx-auto">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  ربط حساب Google للوصول إلى Google Sheets و Google Drive
                </h3>
                <p className="text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                  سجّل الدخول بحسابك في Google لقراءة جداول البيانات الموجودة أو إنشاء ومزامنة تقارير الحالات ونسخ المنظومة مباشرة.
                </p>
              </div>

              {/* Official Sign in with Google button */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoggingIn}
                  className="inline-flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-50 text-[#1f1f1f] border border-[#747775] rounded-full font-semibold text-sm shadow-sm transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{isLoggingIn ? 'جارٍ الاتصال بحساب Google...' : 'Sign in with Google'}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Connected Account Bar */}
              <div className="p-3 bg-[#EBF4FC] dark:bg-[#071629] border border-blue-200 dark:border-[#004B87] rounded-xl flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-[#00A651] shrink-0" />
                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                    متصل بحساب Google: <span className="font-mono">{googleUser?.email || googleUser?.displayName}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadFiles}
                    disabled={isLoadingFiles}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1 hover:border-[#00A651] cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                    <span>تحديث الملفات</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleSignOut}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-1 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>فصل الحساب</span>
                  </button>
                </div>
              </div>

              {/* Open by URL/ID or Create New */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl space-y-2">
                  <label className="font-bold text-slate-800 dark:text-slate-100 block">
                    فتح جدول بيانات بالرابط أو المعرف (Spreadsheet ID):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sheetIdInput}
                      onChange={(e) => setSheetIdInput(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="flex-1 p-2 bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#004B87] rounded-lg font-mono text-[11px] text-slate-900 dark:text-white"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => handleInspectSpreadsheet(sheetIdInput)}
                      disabled={!sheetIdInput.trim() || isLoadingPreview}
                      className="px-3 py-2 bg-[#004B87] hover:bg-[#00386B] text-white font-bold rounded-lg flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>فتح</span>
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl space-y-2">
                  <label className="font-bold text-slate-800 dark:text-slate-100 block">
                    أو إنشاء ملف Google Sheets جديد:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSheetTitle}
                      onChange={(e) => setNewSheetTitle(e.target.value)}
                      placeholder="اسم الملف الجديد..."
                      className="flex-1 p-2 bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#004B87] rounded-lg font-bold text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={handleCreateNewSheet}
                      disabled={!newSheetTitle.trim() || isCreatingSheet}
                      className="px-3 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-bold rounded-lg flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isCreatingSheet ? 'جارٍ الإنشاء...' : 'إنشاء'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Recent Google Drive Spreadsheets */}
              <div className="space-y-1.5">
                <div className="font-bold text-slate-700 dark:text-slate-200">
                  ملفات Google Sheets في حسابك ({spreadsheets.length}):
                </div>
                <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-[#00386B] rounded-xl divide-y divide-slate-100 dark:divide-[#00386B]/70">
                  {spreadsheets.map((file) => {
                    const active = selectedMeta?.spreadsheetId === file.id;
                    return (
                      <div
                        key={file.id}
                        className={`p-2.5 flex items-center justify-between gap-2 ${
                          active
                            ? 'bg-[#E6F7EF] dark:bg-[#00A651]/15'
                            : 'bg-white dark:bg-[#0B1D35] hover:bg-slate-50 dark:hover:bg-[#071629]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {file.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            {file.id}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleInspectSpreadsheet(file.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#004B87] text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>اختيار ومعاينة</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!isLoadingFiles && spreadsheets.length === 0 && (
                    <div className="p-4 text-center text-slate-400">
                      لا توجد جداول بيانات متاحة أو يمكنك لصق رابط ملف Google Sheets مباشرة أعلاه.
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Spreadsheet Tabs & Preview */}
              {selectedMeta && (
                <div className="p-3.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-black text-slate-900 dark:text-white">
                        الملف المحدد: {selectedMeta.title}
                      </div>
                      <a
                        href={selectedMeta.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[#004B87] dark:text-[#00E676] inline-flex items-center gap-1 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>فتح في Google Sheets</span>
                      </a>
                    </div>

                    <button
                      type="button"
                      onClick={handleRequestWriteConfirmation}
                      disabled={isWriting}
                      className="px-4 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-black rounded-xl shadow-md flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>مزامنة وكتابة البيانات إلى هذا الملف</span>
                    </button>
                  </div>

                  {/* Sheet Tabs */}
                  {selectedMeta.sheets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMeta.sheets.map((tab) => (
                        <button
                          key={tab.sheetId}
                          type="button"
                          onClick={() => handleSwitchPreviewTab(tab.title)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                            selectedTabTitle === tab.title
                              ? 'bg-[#004B87] text-white border-[#004B87]'
                              : 'bg-white dark:bg-[#0B1D35] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B]'
                          }`}
                        >
                          {tab.title}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Preview Table */}
                  {isLoadingPreview ? (
                    <div className="p-4 text-center text-slate-500">جارٍ قراءة بيانات الورقة...</div>
                  ) : previewRows.length > 0 ? (
                    <div className="overflow-x-auto max-h-48 border border-slate-200 dark:border-[#00386B] rounded-lg bg-white dark:bg-[#0B1D35]">
                      <table className="w-full text-[11px] text-start">
                        <tbody>
                          {previewRows.slice(0, 10).map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx === 0
                                  ? 'bg-[#00264D] text-white font-bold'
                                  : 'border-t border-slate-100 dark:border-[#00386B]/60'
                              }
                            >
                              {row.slice(0, 8).map((cell, cIdx) => (
                                <td key={cIdx} className="p-1.5 whitespace-nowrap max-w-[160px] truncate">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-3 text-center text-slate-400">
                      هذه الورقة فارغة حالياً.
                    </div>
                  )}
                </div>
              )}

              {/* Explicit Confirmation Dialog before overwriting/updating Google Sheets */}
              {pendingWriteConfirmation && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 rounded-xl space-y-3 animate-scale-in">
                  <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-black text-sm">
                        تأكيد تحديث وكتابة البيانات في Google Sheets
                      </div>
                      <p className="leading-relaxed">
                        سيتم تحديث واستبدال محتوى الأوراق التالية داخل الملف{' '}
                        <strong>«{pendingWriteConfirmation.meta.title}»</strong>:
                      </p>
                      <ul className="list-disc list-inside font-bold text-[11px]">
                        {pendingWriteConfirmation.tabs.map((t) => (
                          <li key={t.title}>
                            ورقة «{t.title}» ({Math.max(0, t.rows.length - 1)} صف)
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingWriteConfirmation(null)}
                      disabled={isWriting}
                      className="px-3.5 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-white/60 font-bold cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmWrite}
                      disabled={isWriting}
                      className="px-4 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isWriting
                          ? 'جارٍ الكتابة إلى Google Sheets...'
                          : `تأكيد الكتابة (${pendingWriteConfirmation.totalRows} سجل)`}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
