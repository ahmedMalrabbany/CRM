/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Download,
  RotateCcw,
  Plus,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CalendarClock,
  Save,
  Power,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { GoogleSheetsSyncModal } from '../components/GoogleSheetsSyncModal';
import { buildFullBackupSheetTabs } from '../services/googleWorkspaceService';
import {
  DatabaseBackup,
  User,
  BackupScheduleConfig,
  BackupFrequency,
} from '../types';
import {
  createDatabaseBackup,
  fetchBackups,
  subscribeToBackups,
  restoreDatabaseBackup,
  fetchBackupSchedule,
  subscribeToBackupSchedule,
  saveBackupSchedule,
  computeNextScheduledRun,
  triggerBackupFileDownload,
  DEFAULT_BACKUP_SCHEDULE,
} from '../services/backupService';

interface BackupRestorePageProps {
  currentUser: User;
}

const WEEKDAYS_AR = [
  { value: 6, label: 'السبت' },
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الإثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
];

export const BackupRestorePage: React.FC<BackupRestorePageProps> = ({ currentUser }) => {
  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupNameInput, setBackupNameInput] = useState('');
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<DatabaseBackup | null>(null);

  // Schedule state
  const [schedule, setSchedule] = useState<BackupScheduleConfig>(DEFAULT_BACKUP_SCHEDULE);
  const [draftEnabled, setDraftEnabled] = useState<boolean>(true);
  const [draftFrequency, setDraftFrequency] = useState<BackupFrequency>('daily');
  const [draftTimeOfDay, setDraftTimeOfDay] = useState<string>('02:00');
  const [draftDayOfWeek, setDraftDayOfWeek] = useState<number>(5);
  const [draftDayOfMonth, setDraftDayOfMonth] = useState<number>(1);
  const [draftIntervalHours, setDraftIntervalHours] = useState<number>(24);
  const [draftAutoDownload, setDraftAutoDownload] = useState<boolean>(false);
  const [draftMaxRetention, setDraftMaxRetention] = useState<number>(30);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGoogleSheetsOpen, setIsGoogleSheetsOpen] = useState(false);

  const syncDraftFromSchedule = (cfg: BackupScheduleConfig) => {
    setSchedule(cfg);
    setDraftEnabled(Boolean(cfg.enabled));
    setDraftFrequency(cfg.frequency || 'daily');
    setDraftTimeOfDay(cfg.timeOfDay || '02:00');
    setDraftDayOfWeek(cfg.dayOfWeek ?? 5);
    setDraftDayOfMonth(cfg.dayOfMonth ?? 1);
    setDraftIntervalHours(cfg.intervalHours ?? 24);
    setDraftAutoDownload(Boolean(cfg.autoDownloadJson));
    setDraftMaxRetention(cfg.maxRetentionCount ?? 30);
  };

  const loadBackups = async () => {
    try {
      const list = await fetchBackups();
      setBackups(list);
    } catch {
      setErrorMsg('تعذر تحميل النسخ الاحتياطية');
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchBackupSchedule()
      .then((cfg) => {
        if (mounted) syncDraftFromSchedule(cfg);
      })
      .catch(() => {
        // Fallback to default already set
      });

    const unsubSchedule = subscribeToBackupSchedule((cfg) => {
      if (mounted) {
        setSchedule(cfg);
      }
    });

    const unsubBackups = subscribeToBackups((list) => {
      if (mounted) {
        setBackups(list);
      }
    });

    const ticker = setInterval(() => setNowTick(Date.now()), 30_000);

    return () => {
      mounted = false;
      unsubSchedule();
      unsubBackups();
      clearInterval(ticker);
    };
  }, []);

  const previewNextRunIso = useMemo(() => {
    if (!draftEnabled) return null;
    return computeNextScheduledRun(
      {
        frequency: draftFrequency,
        timeOfDay: draftTimeOfDay,
        dayOfWeek: draftDayOfWeek,
        dayOfMonth: draftDayOfMonth,
        intervalHours: draftIntervalHours,
      },
      new Date(nowTick)
    );
  }, [
    draftEnabled,
    draftFrequency,
    draftTimeOfDay,
    draftDayOfWeek,
    draftDayOfMonth,
    draftIntervalHours,
    nowTick,
  ]);

  const activeCountdownLabel = useMemo(() => {
    if (!schedule.enabled || !schedule.nextScheduledAt) return 'الجدولة التلقائية متوقفة';
    const diffMs = new Date(schedule.nextScheduledAt).getTime() - nowTick;
    if (diffMs <= 0) return 'جارٍ تنفيذ النسخة المجدولة الآن...';
    const totalMins = Math.ceil(diffMs / 60_000);
    const days = Math.floor(totalMins / (60 * 24));
    const hours = Math.floor((totalMins % (60 * 24)) / 60);
    const mins = totalMins % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days} يوم`);
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins} دقيقة`);
    return `بعد ${parts.join(' و ')}`;
  }, [schedule.enabled, schedule.nextScheduledAt, nowTick]);

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSchedule(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      const saved = await saveBackupSchedule(
        {
          ...schedule,
          enabled: draftEnabled,
          frequency: draftFrequency,
          timeOfDay: draftTimeOfDay,
          dayOfWeek: draftDayOfWeek,
          dayOfMonth: draftDayOfMonth,
          intervalHours: draftIntervalHours,
          autoDownloadJson: draftAutoDownload,
          maxRetentionCount: draftMaxRetention,
        },
        currentUser
      );
      syncDraftFromSchedule(saved);
      setMessage(
        saved.enabled && saved.nextScheduledAt
          ? `تم حفظ الجدول التلقائي بنجاح. موعد التنفيذ القادم: ${new Date(saved.nextScheduledAt).toLocaleString('ar-EG')}`
          : 'تم إيقاف النسخ الاحتياطي التلقائي وحفظ الإعدادات.'
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر حفظ إعدادات الجدولة التلقائية');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      const b = await createDatabaseBackup(backupNameInput, currentUser, { triggerType: 'manual' });
      setMessage(`تم إنشاء النسخة الاحتياطية "${b.backupName}" بنجاح (${b.recordsCount} سجل).`);
      setBackupNameInput('');
      await loadBackups();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل إنشاء النسخة الاحتياطية');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownloadJSON = (b: DatabaseBackup) => {
    triggerBackupFileDownload(b);
  };

  const handleConfirmRestore = async () => {
    if (!selectedBackupForRestore) return;
    setIsRestoring(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await restoreDatabaseBackup(selectedBackupForRestore.id, currentUser);
      setMessage(
        `تمت استعادة البيانات بنجاح بإجمالي ${res.restoredRecords} سجل. يرجى تحديث الصفحة لرؤية البيانات المستعادة.`
      );
      setSelectedBackupForRestore(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشلت عملية استعادة النسخة');
    } finally {
      setIsRestoring(false);
    }
  };

  const scheduleSummaryText = useMemo(() => {
    if (!schedule.enabled) return 'النسخ التلقائي متوقف حالياً';
    if (schedule.frequency === 'daily') {
      return `يومياً الساعة ${schedule.timeOfDay}`;
    }
    if (schedule.frequency === 'weekly') {
      const dayLabel = WEEKDAYS_AR.find((d) => d.value === schedule.dayOfWeek)?.label || 'الجمعة';
      return `أسبوعياً كل ${dayLabel} الساعة ${schedule.timeOfDay}`;
    }
    if (schedule.frequency === 'monthly') {
      return `شهرياً يوم ${schedule.dayOfMonth || 1} الساعة ${schedule.timeOfDay}`;
    }
    return `دورياً كل ${schedule.intervalHours || 24} ساعة`;
  }, [schedule]);

  return (
    <div className="space-y-4 text-start animate-fade-up">
      {/* Header */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs mb-1">
            <Archive className="w-4 h-4" />
            <span>إدارة النسخ الاحتياطي وحماية البيانات (Backup & Disaster Recovery)</span>
          </div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">
            النسخ الاحتياطي لقاعدة بيانات مركز الاتصال
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            إنشاء واستعادة لقطات دورية وتلقائية شاملة لكافة الحالات، الممولين، المتصلين، والمستخدمين
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <input
            type="text"
            value={backupNameInput}
            onChange={(e) => setBackupNameInput(e.target.value)}
            placeholder="اسم النسخة (اختياري)..."
            className="p-2 text-xs bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl flex-1 sm:w-48 font-semibold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="px-4 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50 whitespace-nowrap active:scale-95"
          >
            {isCreating ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>إنشاء نسخة احتياطية الآن</span>
          </button>
          <button
            type="button"
            onClick={() => setIsGoogleSheetsOpen(true)}
            className="px-4 py-2 bg-[#004B87] hover:bg-[#00386B] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all whitespace-nowrap active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#00E676]" />
            <span>مزامنة مع Google Sheets</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="p-3 bg-[#E6F7EF] dark:bg-[#00A651]/15 border border-[#00A651]/40 rounded-xl text-xs font-bold text-[#008742] dark:text-[#00E676] flex items-center gap-2 animate-scale-in">
          <CheckCircle className="w-4 h-4 text-[#00A651] shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2 animate-scale-in">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Active Schedule Banner */}
      <div className="p-4 bg-[#00264D] text-white rounded-2xl border border-[#004B87] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-xs shadow-saas">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl text-white ${schedule.enabled ? 'bg-[#00A651]' : 'bg-slate-600'}`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-sm text-white block">
              جدولة النسخ الاحتياطي التلقائي (Automated Schedule)
            </span>
            <span className="text-sky-200 text-xs block mt-0.5">
              الجدول المعتمد حالياً: <strong className="text-white">{scheduleSummaryText}</strong>
              {schedule.enabled && schedule.nextScheduledAt && (
                <>
                  {' '}• التنفيذ القادم:{' '}
                  <strong className="text-[#00E676] font-mono">
                    {new Date(schedule.nextScheduledAt).toLocaleString('ar-EG')}
                  </strong>
                </>
              )}
            </span>
            {schedule.lastRunAt && (
              <span className="text-[11px] text-slate-300 block mt-0.5">
                آخر نسخة تلقائية: {new Date(schedule.lastRunAt).toLocaleString('ar-EG')}
                {schedule.lastBackupName ? ` (${schedule.lastBackupName})` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
          <div
            className={`px-3 py-1.5 rounded-xl border font-mono font-bold whitespace-nowrap flex items-center gap-1.5 ${
              schedule.enabled
                ? 'bg-[#001A35] border-[#00A651] text-[#00E676]'
                : 'bg-[#001A35] border-slate-500 text-slate-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{schedule.enabled ? `نشط (${activeCountdownLabel})` : 'الحالة: متوقف مؤقتاً'}</span>
          </div>
        </div>
      </div>

      {/* Admin Schedule Configurator Card */}
      <form
        onSubmit={handleSaveSchedule}
        className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas space-y-4 text-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#00386B] pb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[#004B87] dark:text-[#00E676]" />
            <div>
              <h2 className="font-black text-sm text-slate-900 dark:text-white">
                ضبط التوقيت الزمني للنسخ الاحتياطي التلقائي (صلاحية الأدمن)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                يقوم النظام بإنشاء نسخة احتياطية كاملة تلقائياً فور حلول التوقيت المحدد أدناه وحفظها في الأرشيف
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDraftEnabled((prev) => !prev)}
            className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all active:scale-95 ${
              draftEnabled
                ? 'bg-[#00A651] text-white border-[#008742] shadow-sm'
                : 'bg-slate-100 dark:bg-[#071629] text-slate-600 dark:text-slate-300 border-slate-300 dark:border-[#00386B]'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{draftEnabled ? 'النسخ التلقائي: مُفعّل' : 'النسخ التلقائي: معطل'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Frequency */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              معدل التكرار الزمني:
            </label>
            <select
              value={draftFrequency}
              onChange={(e) => setDraftFrequency(e.target.value as BackupFrequency)}
              disabled={!draftEnabled}
              className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl font-bold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none disabled:opacity-50"
            >
              <option value="daily">يومياً في ساعة محددة</option>
              <option value="weekly">أسبوعياً (يوم محدد وساعة محددة)</option>
              <option value="monthly">شهرياً (تاريخ محدد وساعة محددة)</option>
              <option value="interval_hours">دورياً كل عدة ساعات</option>
            </select>
          </div>

          {/* Time Of Day (daily / weekly / monthly) */}
          {draftFrequency !== 'interval_hours' ? (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                الساعة والدقيقة المحددة للتنفيذ:
              </label>
              <input
                type="time"
                value={draftTimeOfDay}
                onChange={(e) => setDraftTimeOfDay(e.target.value)}
                disabled={!draftEnabled}
                required
                className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl font-mono font-bold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none disabled:opacity-50"
              />
            </div>
          ) : (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                التكرار كل (ساعة):
              </label>
              <select
                value={draftIntervalHours}
                onChange={(e) => setDraftIntervalHours(Number(e.target.value))}
                disabled={!draftEnabled}
                className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl font-bold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none disabled:opacity-50"
              >
                <option value={1}>كل ساعة واحدة</option>
                <option value={3}>كل 3 ساعات</option>
                <option value={6}>كل 6 ساعات</option>
                <option value={12}>كل 12 ساعة</option>
                <option value={24}>كل 24 ساعة</option>
              </select>
            </div>
          )}

          {/* Day of week / Day of month */}
          {draftFrequency === 'weekly' && (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                يوم التنفيذ الأسبوعي:
              </label>
              <select
                value={draftDayOfWeek}
                onChange={(e) => setDraftDayOfWeek(Number(e.target.value))}
                disabled={!draftEnabled}
                className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl font-bold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none disabled:opacity-50"
              >
                {WEEKDAYS_AR.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {draftFrequency === 'monthly' && (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                اليوم من الشهر (1 إلى 28):
              </label>
              <input
                type="number"
                min={1}
                max={28}
                value={draftDayOfMonth}
                onChange={(e) => setDraftDayOfMonth(Number(e.target.value))}
                disabled={!draftEnabled}
                className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl font-mono font-bold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none disabled:opacity-50"
              />
            </div>
          )}

          {/* Retention count */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              الاحتفاظ بآخر (نسخ تلقائية):
            </label>
            <select
              value={draftMaxRetention}
              onChange={(e) => setDraftMaxRetention(Number(e.target.value))}
              disabled={!draftEnabled}
              className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl font-bold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none disabled:opacity-50"
            >
              <option value={10}>آخر 10 نسخ تلقائية</option>
              <option value={20}>آخر 20 نسخة تلقائية</option>
              <option value={30}>آخر 30 نسخة تلقائية</option>
              <option value={50}>آخر 50 نسخة تلقائية</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-[#00386B]">
          <div className="space-y-1.5">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draftAutoDownload}
                onChange={(e) => setDraftAutoDownload(e.target.checked)}
                disabled={!draftEnabled}
                className="w-4 h-4 rounded accent-[#00A651]"
              />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                تنزيل ملف النسخة (JSON) تلقائياً على جهاز مدير النظام عند كل تشغيل مجدول
              </span>
            </label>
            {draftEnabled && previewNextRunIso && (
              <div className="text-[11px] text-[#004B87] dark:text-[#00E676] font-bold">
                معاينة الموعد القادم عند الحفظ:{' '}
                <span className="font-mono">
                  {new Date(previewNextRunIso).toLocaleString('ar-EG')}
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSavingSchedule}
            className="px-5 py-2.5 bg-[#004B87] hover:bg-[#00386B] text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            {isSavingSchedule ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4 text-[#00E676]" />
            )}
            <span>حفظ وتطبيق الجدول الزمني</span>
          </button>
        </div>
      </form>

      {/* Backups List Table */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-[#00386B] flex justify-between items-center text-xs">
          <h2 className="font-bold text-slate-800 dark:text-white">
            أرشيف وسجل النسخ الاحتياطية المحفوظة ({backups.length})
          </h2>
          <button
            onClick={loadBackups}
            className="text-[#004B87] dark:text-[#00E676] hover:underline font-bold flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث القائمة</span>
          </button>
        </div>

        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full text-start text-xs min-w-[740px]">
            <thead className="bg-[#00264D] text-white border-b border-[#004B87] text-[11px]">
              <tr>
                <th className="p-3">اسم النسخة</th>
                <th className="p-3 text-center">النوع</th>
                <th className="p-3">التاريخ والوقت</th>
                <th className="p-3">أنشئت بواسطة</th>
                <th className="p-3 text-center">عدد الحالات</th>
                <th className="p-3 text-center">إجمالي السجلات</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]/70">
              {backups.map((b) => {
                const isAuto = b.triggerType === 'automatic';
                return (
                  <tr
                    key={b.id}
                    className="hover:bg-[#EBF4FC] dark:hover:bg-[#002B54] transition-colors"
                  >
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{b.backupName}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                          isAuto
                            ? 'bg-[#E6F7EF] dark:bg-[#00A651]/20 text-[#008742] dark:text-[#00E676] border-[#00A651]/40'
                            : 'bg-[#EBF4FC] dark:bg-[#004B87]/30 text-[#004B87] dark:text-sky-300 border-[#004B87]/30'
                        }`}
                      >
                        {isAuto ? 'تلقائي مجدول' : 'يدوي'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                      {new Date(b.createdAt).toLocaleString('ar-EG')}
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">{b.createdBy}</td>
                    <td className="p-3 text-center font-mono font-bold text-[#00A651] dark:text-[#00E676] tabular-nums">
                      {b.casesCount}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                      {b.recordsCount}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadJSON(b)}
                          className="p-1.5 bg-slate-100 dark:bg-[#071629] hover:bg-[#004B87] hover:text-white text-slate-700 dark:text-slate-200 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold"
                          title="تنزيل كملف JSON"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>تنزيل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedBackupForRestore(b)}
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-600 hover:text-white text-rose-700 dark:text-rose-300 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold"
                          title="استعادة البيانات"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>استعادة</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {backups.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">
                    لا توجد نسخ احتياطية مسجلة بعد. اضغط على "إنشاء نسخة احتياطية الآن" أو انتظر التوقيت المجدول.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog for Restore */}
      {selectedBackupForRestore &&
        createPortal(
          <div
            dir="rtl"
            onClick={() => !isRestoring && setSelectedBackupForRestore(null)}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0B1D35] rounded-2xl p-5 max-w-md w-full my-auto max-h-[90dvh] overflow-y-auto shadow-2xl border border-rose-400 dark:border-rose-700 text-right space-y-4 animate-scale-in"
            >
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 rounded-xl flex items-center gap-2.5 text-rose-800 dark:text-rose-200">
                <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
                <div className="font-bold text-sm">تحذير أمني: استعادة قاعدة البيانات</div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                أنت على وشك استعادة البيانات من النسخة:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {selectedBackupForRestore.backupName}
                </strong>{' '}
                (بتاريخ {new Date(selectedBackupForRestore.createdAt).toLocaleString('ar-EG')}).
                <br />
                هذا الإجراء سيقوم باستبدال أو تحديث سجلات الحالات والممولين الحالية بما يطابق هذه النسخة.
              </p>

              <div className="p-3 bg-slate-50 dark:bg-[#071629] rounded-xl border border-slate-200 dark:border-[#00386B] text-xs font-mono text-slate-800 dark:text-slate-200 space-y-1">
                <div>عدد الحالات المستعادة: {selectedBackupForRestore.casesCount}</div>
                <div>إجمالي السجلات: {selectedBackupForRestore.recordsCount}</div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200 dark:border-[#00386B]">
                <button
                  type="button"
                  onClick={() => setSelectedBackupForRestore(null)}
                  disabled={isRestoring}
                  className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#002B54] rounded-xl font-bold"
                >
                  إلغاء الأمر
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  disabled={isRestoring}
                  className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md flex items-center gap-1.5"
                >
                  {isRestoring ? 'جارٍ استعادة البيانات...' : 'تأكيد واستعادة النسخة الاحتياطية'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <GoogleSheetsSyncModal
        isOpen={isGoogleSheetsOpen}
        onClose={() => setIsGoogleSheetsOpen(false)}
        title="مزامنة قاعدة البيانات مع Google Sheets"
        subtitle="ربط حساب Google وقراءة أو مزامنة كافة الجداول (الحالات، الممولون، المتصلون، المستخدمون)"
        defaultNewSheetName={`ETA_CRM_Backup_${new Date().toISOString().slice(0, 10)}`}
        prepareTabsToWrite={async () => {
          const { tabs } = await buildFullBackupSheetTabs();
          return tabs;
        }}
      />
    </div>
  );
};
