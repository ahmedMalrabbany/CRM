/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  DownloadCloud,
  LogOut,
  Search,
  ArrowLeftRight,
} from 'lucide-react';
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
  fetchDetailsTabFromTargetSheet,
  importDetailsCasesIntoAppStore,
  syncCasesToDetailsTab,
  DriveSpreadsheetItem,
  SpreadsheetMetadata,
  SheetWriteTab,
  DetailsTabInspectionResult,
  GoogleWorkspaceUser,
  TARGET_SPREADSHEET_ID,
  TARGET_DETAILS_TAB,
  TARGET_SPREADSHEET_URL,
} from '../services/googleWorkspaceService';
import {
  DETAILS_COLUMN_DEFINITIONS,
  MappableCaseField,
  computeDetailsSyncDiff,
} from '../utils/sheetsDetailsMapper';
import { Case } from '../types';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  defaultNewSheetName: string;
  mode?: 'details' | 'export';
  cases?: Case[];
  defaultSpreadsheetId?: string;
  prepareTabsToWrite?: () => Promise<SheetWriteTab[]> | SheetWriteTab[];
  onDetailsImported?: (importedCount: number) => void;
}

export const GoogleSheetsSyncModal: React.FC<GoogleSheetsSyncModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  defaultNewSheetName,
  mode = 'export',
  cases = [],
  defaultSpreadsheetId = TARGET_SPREADSHEET_ID,
  prepareTabsToWrite,
  onDetailsImported,
}) => {
  const { isRtl } = useThemeLanguage();
  const [needsAuth, setNeedsAuth] = useState(true);
  const [googleUser, setGoogleUser] = useState<GoogleWorkspaceUser | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [spreadsheets, setSpreadsheets] = useState<DriveSpreadsheetItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [sheetIdInput, setSheetIdInput] = useState(defaultSpreadsheetId);
  const [newSheetTitle, setNewSheetTitle] = useState(defaultNewSheetName);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);

  const [selectedMeta, setSelectedMeta] = useState<SpreadsheetMetadata | null>(null);
  const [selectedTabTitle, setSelectedTabTitle] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Details tab inspection & column mapping state
  const [detailsInspection, setDetailsInspection] = useState<DetailsTabInspectionResult | null>(null);
  const [customFieldMap, setCustomFieldMap] = useState<Record<string, MappableCaseField | ''>>({});
  const [includeMissingColumns, setIncludeMissingColumns] = useState(false);
  const [isImportingDetails, setIsImportingDetails] = useState(false);

  // Explicit confirmation dialog state before any mutating Google Sheets write or CRM overwrite
  const [pendingWriteConfirmation, setPendingWriteConfirmation] = useState<{
    kind: 'details_sync' | 'export_tabs' | 'details_import';
    meta: SpreadsheetMetadata;
    tabs?: SheetWriteTab[];
    totalRows: number;
    toAddCount?: number;
    toUpdateCount?: number;
  } | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [writeSuccess, setWriteSuccess] = useState<{
    spreadsheetUrl: string;
    message: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const detailsDiff = useMemo(() => {
    if (!detailsInspection) return null;
    return computeDetailsSyncDiff(cases, detailsInspection.cases);
  }, [cases, detailsInspection]);

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

  const handleInspectSpreadsheet = useCallback(
    async (
      idOrUrl: string,
      mapOverride?: Record<string, MappableCaseField | ''>
    ) => {
      setErrorMsg(null);
      setWriteSuccess(null);
      setIsLoadingPreview(true);
      try {
        const activeMap = mapOverride ?? customFieldMap;
        const trimmed = (idOrUrl || '').trim() || TARGET_SPREADSHEET_ID;
        const isDetailsModeOrTarget =
          mode === 'details' || trimmed.includes(TARGET_SPREADSHEET_ID);

        if (isDetailsModeOrTarget) {
          const inspection = await fetchDetailsTabFromTargetSheet(
            trimmed,
            TARGET_DETAILS_TAB,
            activeMap
          );
          setDetailsInspection(inspection);
          setSelectedMeta({
            spreadsheetId: inspection.spreadsheetId,
            title: inspection.title,
            spreadsheetUrl: inspection.spreadsheetUrl,
            sheets: inspection.sheets,
          });
          setSheetIdInput(inspection.spreadsheetId);
          setSelectedTabTitle(inspection.detailsTabTitle);
          setPreviewRows(
            inspection.rows.map((r) => r.map((c) => (c === undefined || c === null ? '' : String(c))))
          );
        } else {
          setDetailsInspection(null);
          const meta = await getSpreadsheetMetadata(trimmed);
          setSelectedMeta(meta);
          setSheetIdInput(meta.spreadsheetId);
          const firstTab =
            meta.sheets.find((s) => s.title.toLowerCase() === 'details')?.title ||
            meta.sheets[0]?.title ||
            '';
          setSelectedTabTitle(firstTab);
          if (firstTab) {
            const rows = await readSheetPreview(meta.spreadsheetId, firstTab);
            setPreviewRows(rows);
          } else {
            setPreviewRows([]);
          }
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
    },
    [customFieldMap, mode]
  );

  useEffect(() => {
    if (!isOpen) return;
    setNewSheetTitle(defaultNewSheetName);
    setSheetIdInput(defaultSpreadsheetId || TARGET_SPREADSHEET_ID);
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
        handleInspectSpreadsheet(defaultSpreadsheetId || TARGET_SPREADSHEET_ID);
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
  }, [isOpen, defaultNewSheetName, defaultSpreadsheetId, loadFiles, handleInspectSpreadsheet]);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      const result = await signInWithGoogleWorkspace();
      setGoogleUser(result.user);
      setNeedsAuth(false);
      await loadFiles();
      await handleInspectSpreadsheet(sheetIdInput || defaultSpreadsheetId || TARGET_SPREADSHEET_ID);
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
    setDetailsInspection(null);
    setPreviewRows([]);
  };

  const handleSwitchPreviewTab = async (tabTitle: string) => {
    if (!selectedMeta) return;
    setSelectedTabTitle(tabTitle);
    setIsLoadingPreview(true);
    setErrorMsg(null);
    try {
      if (
        mode === 'details' ||
        selectedMeta.spreadsheetId === TARGET_SPREADSHEET_ID ||
        tabTitle.toLowerCase() === 'details'
      ) {
        const inspection = await fetchDetailsTabFromTargetSheet(
          selectedMeta.spreadsheetId,
          tabTitle,
          customFieldMap
        );
        setDetailsInspection(inspection);
        setPreviewRows(
          inspection.rows.map((r) => r.map((c) => (c === undefined || c === null ? '' : String(c))))
        );
      } else {
        setDetailsInspection(null);
        const rows = await readSheetPreview(selectedMeta.spreadsheetId, tabTitle);
        setPreviewRows(rows);
      }
    } catch (err: any) {
      if (err?.code === 'AUTH_REQUIRED') setNeedsAuth(true);
      else setErrorMsg(err?.message || 'تعذر قراءة بيانات الورقة.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleChangeColumnMapping = async (headerName: string, nextField: MappableCaseField | '') => {
    const nextMap = { ...customFieldMap, [headerName]: nextField };
    setCustomFieldMap(nextMap);
    if (selectedMeta) {
      await handleInspectSpreadsheet(selectedMeta.spreadsheetId, nextMap);
    }
  };

  const handleCreateNewSheet = async () => {
    if (!newSheetTitle.trim()) return;
    setIsCreatingSheet(true);
    setErrorMsg(null);
    try {
      const tabs = prepareTabsToWrite ? await prepareTabsToWrite() : [{ title: TARGET_DETAILS_TAB, rows: [] }];
      const created = await createGoogleSpreadsheet(
        newSheetTitle.trim(),
        tabs.map((t) => t.title)
      );
      setDetailsInspection(null);
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

  const handleRequestExportWriteConfirmation = async () => {
    if (!selectedMeta || !prepareTabsToWrite) {
      setErrorMsg('يرجى اختيار ملف Google Sheets أولاً.');
      return;
    }
    setErrorMsg(null);
    try {
      const tabs = await prepareTabsToWrite();
      const totalRows = tabs.reduce((sum, t) => sum + Math.max(0, t.rows.length - 1), 0);
      setPendingWriteConfirmation({
        kind: 'export_tabs',
        meta: selectedMeta,
        tabs,
        totalRows,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تجهيز البيانات للكتابة.');
    }
  };

  const handleRequestDetailsSyncConfirmation = () => {
    if (!selectedMeta) {
      setErrorMsg('يرجى فتح جدول البيانات المستهدف أولاً.');
      return;
    }
    setErrorMsg(null);
    const activeCases = cases.filter((c) => !c.isDeleted);
    setPendingWriteConfirmation({
      kind: 'details_sync',
      meta: selectedMeta,
      totalRows: activeCases.length,
      toAddCount: detailsDiff?.toAddCount ?? activeCases.length,
      toUpdateCount: detailsDiff?.toUpdateCount ?? 0,
    });
  };

  const handleRequestDetailsImportConfirmation = () => {
    if (!selectedMeta || !detailsInspection) return;
    setErrorMsg(null);
    setPendingWriteConfirmation({
      kind: 'details_import',
      meta: selectedMeta,
      totalRows: detailsInspection.cases.length,
    });
  };

  const handleConfirmAction = async () => {
    if (!pendingWriteConfirmation) return;
    setIsWriting(true);
    setIsImportingDetails(pendingWriteConfirmation.kind === 'details_import');
    setErrorMsg(null);
    try {
      if (pendingWriteConfirmation.kind === 'details_import') {
        const casesToImport = detailsInspection?.cases || [];
        const res = await importDetailsCasesIntoAppStore(casesToImport);
        setPendingWriteConfirmation(null);
        setWriteSuccess({
          spreadsheetUrl: pendingWriteConfirmation.meta.spreadsheetUrl,
          message: `تم استيراد ومزامنة ${res.importedCount} حالة من تبويب ${detailsInspection?.detailsTabTitle || TARGET_DETAILS_TAB} إلى قاعدة بيانات المنظومة بنجاح.`,
        });
        onDetailsImported?.(res.importedCount);
      } else if (pendingWriteConfirmation.kind === 'details_sync') {
        const activeCases = cases.filter((c) => !c.isDeleted);
        const res = await syncCasesToDetailsTab({
          spreadsheetId: pendingWriteConfirmation.meta.spreadsheetId,
          tabName: detailsInspection?.detailsTabTitle || TARGET_DETAILS_TAB,
          cases: activeCases,
          includeMissingColumns,
          customFieldMap,
        });
        setPendingWriteConfirmation(null);
        setWriteSuccess({
          spreadsheetUrl: res.spreadsheetUrl,
          message: `تمت مزامنة ${res.totalRows} حالة بنجاح إلى تبويب «${res.tabTitle}» في Google Sheets.`,
        });
        await handleInspectSpreadsheet(res.spreadsheetId);
      } else if (pendingWriteConfirmation.kind === 'export_tabs' && pendingWriteConfirmation.tabs) {
        const res = await writeTabsToSpreadsheet(
          pendingWriteConfirmation.meta.spreadsheetId,
          pendingWriteConfirmation.tabs
        );
        setPendingWriteConfirmation(null);
        setWriteSuccess({
          spreadsheetUrl: res.spreadsheetUrl,
          message: `تمت مزامنة ${res.totalRows} سجل بنجاح في أوراق (${res.updatedTabs.join('، ')}).`,
        });
        await handleInspectSpreadsheet(pendingWriteConfirmation.meta.spreadsheetId);
      }
    } catch (err: any) {
      if (err?.code === 'AUTH_REQUIRED') setNeedsAuth(true);
      else setErrorMsg(err?.message || 'تعذر تنفيذ المزامنة مع Google Sheets.');
    } finally {
      setIsWriting(false);
      setIsImportingDetails(false);
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
        className="bg-white dark:bg-[#0B1D35] rounded-2xl w-full max-w-4xl my-auto max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 dark:border-[#004B87] overflow-hidden animate-scale-in text-start"
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
          {/* Target Spreadsheet Reference Bar */}
          <div className="p-3 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-xl flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                جدول البيانات المستهدف (Tab: <span className="font-mono text-[#00A651]">{TARGET_DETAILS_TAB}</span>):
              </span>
              <code className="px-2 py-0.5 rounded bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] font-mono text-[11px] text-[#004B87] dark:text-sky-300 truncate max-w-full">
                {TARGET_SPREADSHEET_ID}
              </code>
            </div>
            <a
              href={TARGET_SPREADSHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#004B87] dark:text-[#00E676] font-bold hover:underline shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح الملف في Google Sheets</span>
            </a>
          </div>

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
                <span>{writeSuccess.message}</span>
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
                  ربط حساب Google للوصول إلى قاعدة بيانات Google Sheets (ورقة {TARGET_DETAILS_TAB})
                </h3>
                <p className="text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                  سجّل الدخول بحسابك في Google لقراءة ورقة <strong>{TARGET_DETAILS_TAB}</strong> من الجدول{' '}
                  <span className="font-mono text-[11px]">{TARGET_SPREADSHEET_ID}</span> ومطابقة الحقول ومزامنة الحالات.
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
                    معرف أو رابط جدول Google Sheets:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sheetIdInput}
                      onChange={(e) => setSheetIdInput(e.target.value)}
                      placeholder={TARGET_SPREADSHEET_ID}
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
                      <span>فحص وقراءة</span>
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

              {/* Details Tab Field Mapping & Bidirectional Sync Section */}
              {detailsInspection && (
                <div className="p-4 bg-[#E6F7EF]/60 dark:bg-[#071629] border-2 border-[#00A651]/40 dark:border-[#00A651] rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                        <ArrowLeftRight className="w-4 h-4 text-[#00A651]" />
                        <span>
                          مطابقة حقول النظام مع أعمدة تبويب «{detailsInspection.detailsTabTitle}»
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        {detailsInspection.hasDetailsTab
                          ? `تم رصد ${detailsInspection.headers.length} عمود و ${detailsInspection.cases.length} صف بيانات داخل ورقة ${detailsInspection.detailsTabTitle}.`
                          : `ورقة "${TARGET_DETAILS_TAB}" غير موجودة حالياً في هذا الملف — سيتم إنشاؤها تلقائياً عند المزامنة.`}
                      </p>
                    </div>

                    {detailsDiff && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                        <span className="px-2 py-1 rounded-lg bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] text-[#004B87] dark:text-sky-300">
                          في CRM: {cases.filter((c) => !c.isDeleted).length}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] text-[#00A651] dark:text-[#00E676]">
                          إضافة للشيت: +{detailsDiff.toAddCount}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] text-amber-700 dark:text-amber-300">
                          تحديث: {detailsDiff.toUpdateCount}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Column-to-Field Mapping Table */}
                  {detailsInspection.schema.mappings.length > 0 && (
                    <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-[#00386B] rounded-xl bg-white dark:bg-[#0B1D35]">
                      <table className="w-full text-[11px] text-start">
                        <thead className="bg-[#00264D] text-white sticky top-0">
                          <tr>
                            <th className="p-2 font-bold">عمود في Google Sheets ({detailsInspection.detailsTabTitle})</th>
                            <th className="p-2 font-bold">حالة المطابقة</th>
                            <th className="p-2 font-bold">الحقل المقابل في CRM</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]/70">
                          {detailsInspection.schema.mappings.map((col) => (
                            <tr key={`${col.colIndex}-${col.headerName}`}>
                              <td className="p-2 font-bold text-slate-800 dark:text-slate-100">
                                {col.headerName || `عمود ${col.colIndex + 1}`}
                              </td>
                              <td className="p-2">
                                {col.matchConfidence === 'custom' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 font-bold">
                                    تعيين يدوي
                                  </span>
                                ) : col.matchConfidence === 'exact' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-[#00A651]/25 text-emerald-800 dark:text-[#00E676] font-bold">
                                    تطابق مباشر
                                  </span>
                                ) : col.matchConfidence === 'alias' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-[#00A651]/15 text-[#008742] dark:text-[#00E676] font-bold">
                                    تطابق تلقائي
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                                    عمود إضافي (يُحفظ كما هو)
                                  </span>
                                )}
                              </td>
                              <td className="p-2">
                                <select
                                  value={
                                    customFieldMap[col.headerName] !== undefined
                                      ? customFieldMap[col.headerName]
                                      : col.mappedField || ''
                                  }
                                  onChange={(e) =>
                                    handleChangeColumnMapping(
                                      col.headerName,
                                      (e.target.value || '') as MappableCaseField | ''
                                    )
                                  }
                                  className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-800 dark:text-slate-100 font-bold"
                                >
                                  <option value="">-- غير مربوط (حفظ العمود فقط) --</option>
                                  {DETAILS_COLUMN_DEFINITIONS.map((def) => (
                                    <option key={def.field} value={def.field}>
                                      {def.arabicLabel} ({def.defaultHeader})
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeMissingColumns}
                        onChange={(e) => setIncludeMissingColumns(e.target.checked)}
                        className="w-4 h-4 accent-[#00A651] rounded"
                      />
                      <span>إضافة أعمدة الحقول الناقصة من CRM إلى ورقة {TARGET_DETAILS_TAB} عند المزامنة</span>
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                      {detailsInspection.cases.length > 0 && (
                        <button
                          type="button"
                          onClick={handleRequestDetailsImportConfirmation}
                          disabled={isWriting || isImportingDetails}
                          className="px-3.5 py-2 rounded-xl bg-[#004B87] hover:bg-[#00386B] text-white font-black flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                        >
                          <DownloadCloud className="w-4 h-4" />
                          <span>استيراد من {detailsInspection.detailsTabTitle} ({detailsInspection.cases.length})</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleRequestDetailsSyncConfirmation}
                        disabled={isWriting}
                        className="px-4 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>مزامنة الحالات إلى ورقة {detailsInspection.detailsTabTitle}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Google Drive Spreadsheets */}
              <div className="space-y-1.5">
                <div className="font-bold text-slate-700 dark:text-slate-200">
                  ملفات Google Sheets في حسابك ({spreadsheets.length}):
                </div>
                <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-[#00386B] rounded-xl divide-y divide-slate-100 dark:divide-[#00386B]/70">
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
                    <div className="p-3 text-center text-slate-400">
                      لا توجد جداول بيانات أخرى معروضة — يمكنك استخدام الجدول المستهدف أو لصق المعرف أعلاه.
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

                    {prepareTabsToWrite && (
                      <button
                        type="button"
                        onClick={handleRequestExportWriteConfirmation}
                        disabled={isWriting}
                        className="px-4 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-black rounded-xl shadow-md flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>كتابة أوراق التقرير إلى هذا الملف</span>
                      </button>
                    )}
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
                    <div className="overflow-x-auto max-h-44 border border-slate-200 dark:border-[#00386B] rounded-lg bg-white dark:bg-[#0B1D35]">
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

              {/* Explicit Confirmation Dialog before overwriting/updating Google Sheets or CRM */}
              {pendingWriteConfirmation && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 rounded-xl space-y-3 animate-scale-in">
                  <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-black text-sm">
                        {pendingWriteConfirmation.kind === 'details_import'
                          ? 'تأكيد استيراد الحالات من تبويب Details إلى قاعدة بيانات CRM'
                          : 'تأكيد تحديث وكتابة البيانات في Google Sheets'}
                      </div>
                      {pendingWriteConfirmation.kind === 'details_import' ? (
                        <p className="leading-relaxed">
                          سيتم استيراد ودمج <strong>{pendingWriteConfirmation.totalRows}</strong> حالة من تبويب{' '}
                          <strong>«{detailsInspection?.detailsTabTitle || TARGET_DETAILS_TAB}»</strong> في الملف{' '}
                          <span className="font-mono">{pendingWriteConfirmation.meta.spreadsheetId}</span> داخل قاعدة بيانات المنظومة.
                        </p>
                      ) : pendingWriteConfirmation.kind === 'details_sync' ? (
                        <div className="space-y-1">
                          <p className="leading-relaxed">
                            سيتم تحديث واستبدال بيانات تبويب <strong>«{detailsInspection?.detailsTabTitle || TARGET_DETAILS_TAB}»</strong> داخل جدول Google Sheets{' '}
                            <strong>«{pendingWriteConfirmation.meta.title}»</strong> (<span className="font-mono">{pendingWriteConfirmation.meta.spreadsheetId}</span>):
                          </p>
                          <ul className="list-disc list-inside font-bold text-[11px]">
                            <li>إجمالي الحالات التي ستُكتب: {pendingWriteConfirmation.totalRows} صف</li>
                            <li>سجلات جديدة ستُضاف: {pendingWriteConfirmation.toAddCount ?? 0}</li>
                            <li>سجلات حالية ستُحدّث: {pendingWriteConfirmation.toUpdateCount ?? 0}</li>
                          </ul>
                        </div>
                      ) : (
                        <>
                          <p className="leading-relaxed">
                            سيتم تحديث واستبدال محتوى الأوراق التالية داخل الملف{' '}
                            <strong>«{pendingWriteConfirmation.meta.title}»</strong>:
                          </p>
                          <ul className="list-disc list-inside font-bold text-[11px]">
                            {(pendingWriteConfirmation.tabs || []).map((t) => (
                              <li key={t.title}>
                                ورقة «{t.title}» ({Math.max(0, t.rows.length - 1)} صف)
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingWriteConfirmation(null)}
                      disabled={isWriting}
                      className="px-3.5 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-white/60 dark:hover:bg-white/10 font-bold cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmAction}
                      disabled={isWriting}
                      className="px-4 py-2 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white font-black shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isWriting
                          ? 'جارٍ التنفيذ...'
                          : pendingWriteConfirmation.kind === 'details_import'
                          ? `تأكيد الاستيراد (${pendingWriteConfirmation.totalRows} حالة)`
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
