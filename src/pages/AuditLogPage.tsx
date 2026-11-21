/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ShieldAlert, Search, RefreshCw, LogIn, LogOut, AlertTriangle } from 'lucide-react';
import { AuditLogItem } from '../types';
import { fetchAuditLogs } from '../services/auditService';
import { getRoleDefaultJobTitle } from '../services/userService';

export const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAuditLogs(300);
      setLogs(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const stats = useMemo(() => {
    let logins = 0;
    let logouts = 0;
    let failed = 0;
    for (const l of logs) {
      if (l.action.includes('فشل')) failed++;
      else if (l.action.includes('دخول')) logins++;
      else if (l.action.includes('خروج')) logouts++;
    }
    return { logins, logouts, failed };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter === 'login_logout') {
        if (!l.action.includes('دخول') && !l.action.includes('خروج')) return false;
      } else if (actionFilter !== 'all' && !l.action.includes(actionFilter)) {
        return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return (
          l.action.toLowerCase().includes(q) ||
          l.fullName.toLowerCase().includes(q) ||
          l.username.toLowerCase().includes(q) ||
          (l.details && l.details.toLowerCase().includes(q)) ||
          (l.recordId && l.recordId.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [logs, actionFilter, searchTerm]);

  return (
    <div className="space-y-4 text-start animate-fade-up">
      {/* Header */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs mb-1">
            <ShieldAlert className="w-4 h-4" />
            <span>سجل الدخول والخروج والرقابة الأمنية (Audit Log)</span>
          </div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">
            سجل تسجيل الدخول والخروج وحركات النظام
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            توثيق فوري غير قابل للتعديل لعمليات تسجيل الدخول والخروج وكافة المعاملات لجميع المستخدمين
          </p>
        </div>

        <button
          onClick={loadLogs}
          disabled={isLoading}
          className="px-4 py-2 bg-[#004B87] hover:bg-[#00386B] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#00E676]' : ''}`} />
          <span>تحديث السجل</span>
        </button>
      </div>

      {/* Login/Logout Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === 'دخول' ? 'all' : 'دخول')}
          className={`p-3.5 rounded-2xl border text-start flex items-center justify-between transition-all cursor-pointer ${
            actionFilter === 'دخول'
              ? 'bg-[#003324] text-white border-[#00A651] shadow-sm'
              : 'bg-white dark:bg-[#0B1D35] border-slate-200 dark:border-[#00386B]'
          }`}
        >
          <div>
            <div className={actionFilter === 'دخول' ? 'text-emerald-200 font-bold' : 'text-slate-500 dark:text-slate-400 font-bold'}>
              عمليات تسجيل الدخول الناجحة
            </div>
            <div className={`text-xl font-black font-mono tabular-nums mt-0.5 ${actionFilter === 'دخول' ? 'text-[#00E676]' : 'text-[#00A651]'}`}>
              {stats.logins}
            </div>
          </div>
          <LogIn className="w-6 h-6 text-[#00A651]" />
        </button>

        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === 'خروج' ? 'all' : 'خروج')}
          className={`p-3.5 rounded-2xl border text-start flex items-center justify-between transition-all cursor-pointer ${
            actionFilter === 'خروج'
              ? 'bg-[#00264D] text-white border-[#004B87] shadow-sm'
              : 'bg-white dark:bg-[#0B1D35] border-slate-200 dark:border-[#00386B]'
          }`}
        >
          <div>
            <div className={actionFilter === 'خروج' ? 'text-sky-200 font-bold' : 'text-slate-500 dark:text-slate-400 font-bold'}>
              عمليات تسجيل الخروج (يدوي وتلقائي)
            </div>
            <div className={`text-xl font-black font-mono tabular-nums mt-0.5 ${actionFilter === 'خروج' ? 'text-amber-300' : 'text-[#004B87] dark:text-sky-300'}`}>
              {stats.logouts}
            </div>
          </div>
          <LogOut className="w-6 h-6 text-amber-500" />
        </button>

        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === 'فشل' ? 'all' : 'فشل')}
          className={`p-3.5 rounded-2xl border text-start flex items-center justify-between transition-all cursor-pointer ${
            actionFilter === 'فشل'
              ? 'bg-rose-900 text-white border-rose-600 shadow-sm'
              : 'bg-white dark:bg-[#0B1D35] border-slate-200 dark:border-[#00386B]'
          }`}
        >
          <div>
            <div className={actionFilter === 'فشل' ? 'text-rose-200 font-bold' : 'text-slate-500 dark:text-slate-400 font-bold'}>
              محاولات الدخول غير الناجحة
            </div>
            <div className={`text-xl font-black font-mono tabular-nums mt-0.5 ${actionFilter === 'فشل' ? 'text-white' : 'text-rose-600 dark:text-rose-400'}`}>
              {stats.failed}
            </div>
          </div>
          <AlertTriangle className="w-6 h-6 text-rose-500" />
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم الموظف، المستخدم، أو التفاصيل..."
              className="w-full p-2 pl-8 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="p-2 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl font-bold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
          >
            <option value="all">كافة الإجراءات</option>
            <option value="login_logout">سجل الدخول والخروج معاً</option>
            <option value="دخول">تسجيل الدخول فقط</option>
            <option value="خروج">تسجيل الخروج فقط</option>
            <option value="فشل">محاولات الدخول الفاشلة</option>
            <option value="إنشاء">إنشاء حالة</option>
            <option value="تحويل">تحويل حالة</option>
            <option value="إسناد">إسناد حالة</option>
            <option value="إغلاق">إغلاق حالة</option>
            <option value="Backup">نسخ احتياطي</option>
          </select>
        </div>

        <div className="text-slate-500 dark:text-slate-400 text-[11px]">
          السجلات المعروضة:{' '}
          <span className="font-bold font-mono tabular-nums text-[#004B87] dark:text-[#00E676]">
            {filteredLogs.length}
          </span>
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full text-start text-xs min-w-[750px]">
            <thead className="bg-[#00264D] text-white border-b border-[#004B87] text-[11px]">
              <tr>
                <th className="p-3">التاريخ والوقت</th>
                <th className="p-3">الموظف المسؤول</th>
                <th className="p-3">اسم المستخدم</th>
                <th className="p-3">الوظيفة</th>
                <th className="p-3">نوع الإجراء</th>
                <th className="p-3">رقم السجل المعني</th>
                <th className="p-3">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]/70">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#EBF4FC] dark:hover:bg-[#002B54] transition-colors">
                  <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap tabular-nums">
                    {new Date(log.createdAt).toLocaleString('ar-EG')}
                  </td>
                  <td className="p-3 font-bold text-slate-900 dark:text-white">{log.fullName}</td>
                  <td className="p-3 font-mono text-slate-600 dark:text-slate-300">{log.username}</td>
                  <td className="p-3">
                    <span className="text-slate-600 dark:text-slate-300 text-[11px] font-semibold">
                      {getRoleDefaultJobTitle(log.role)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`font-bold px-2.5 py-0.5 rounded text-[10px] whitespace-nowrap ${
                        log.action.includes('فشل')
                          ? 'bg-rose-600 text-white'
                          : log.action.includes('دخول')
                          ? 'bg-[#00A651] text-white'
                          : log.action.includes('خروج')
                          ? 'bg-amber-600 text-white'
                          : log.action.includes('إنشاء')
                          ? 'bg-[#004B87] text-white'
                          : log.action.includes('إغلاق')
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-200 dark:bg-[#071629] text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[#00A651] dark:text-[#00E676] font-bold">
                    {log.recordId || '—'}
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-300 max-w-sm truncate">
                    {log.details || '—'}
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">
                    لا توجد سجلات تطابق استعلام البحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
