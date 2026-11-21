/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { Case } from '../types';

export interface StaffReportRow {
  fullName: string;
  crmUser: string;
  roleLabel: string;
  totalHandled: number;
  openOwnedCount: number;
  totalClosed: number;
  closeRate: number;
}

/**
 * Export cases array to a real Excel (.xlsx) workbook with full RTL Arabic sheet support
 */
export function exportCasesToExcel(
  cases: Case[],
  fileName = `تقرير_حالات_مركز_الاتصال_${new Date().toISOString().slice(0, 10)}.xlsx`,
  extraSummary?: {
    periodLabel?: string;
    total?: number;
    closed?: number;
    rate?: number;
    staffStats?: StaffReportRow[];
  }
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Detailed Cases
  const caseRows = cases.map((c) => ({
    'رقم الحالة': c.caseId,
    'تاريخ الإنشاء': new Date(c.createdAt).toLocaleDateString('ar-EG'),
    'توقيت الحالة': new Date(c.createdAt).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    'نوع الاتصال': c.callType,
    'نوع الضريبة': c.taxType,
    'نوع الخدمة': c.serviceType,
    'القناة': c.channel,
    'عنوان الحالة': c.title || '',
    'رقم التسجيل الضريبي': c.taxRegistrationNumber || 'بدون رقم',
    'اسم الممول': c.taxpayerName || '',
    'اسم المتصل': c.callerName || '',
    'هاتف المتصل': c.callerPhone || '',
    'الحالة': c.status,
    'الأولوية': c.priority,
    'المنشئ': c.createdByName || '',
    'المسؤول الحالي': c.assignedToName || 'غير مسند',
    'رد وكيل الاتصال': c.agentReply || '',
    'رد الإدارة والدعم التقني': c.managementReply || '',
    'سبب الإغلاق': c.closeReason || '',
  }));

  const wsCases = XLSX.utils.json_to_sheet(
    caseRows.length > 0
      ? caseRows
      : [{ 'ملاحظة': 'لا توجد حالات مطابقة في الفترة المحددة' }]
  );
  wsCases['!cols'] = [
    { wch: 15 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 24 },
    { wch: 16 },
    { wch: 36 },
    { wch: 18 },
    { wch: 26 },
    { wch: 24 },
    { wch: 16 },
    { wch: 20 },
    { wch: 12 },
    { wch: 22 },
    { wch: 22 },
    { wch: 35 },
    { wch: 35 },
    { wch: 30 },
  ];
  wsCases['!views'] = [{ rightToLeft: true }];
  XLSX.utils.book_append_sheet(wb, wsCases, 'سجل الحالات');

  // Sheet 2: KPIs & Staff Performance (if provided for ReportsPage)
  if (extraSummary) {
    const kpiRows: Array<Record<string, string | number>> = [
      { 'المؤشر': 'الفترة الزمنية', 'القيمة': extraSummary.periodLabel || 'كافة الفترات' },
      { 'المؤشر': 'إجمالي الحالات', 'القيمة': extraSummary.total ?? cases.length },
      { 'المؤشر': 'الحالات المغلقة', 'القيمة': extraSummary.closed ?? 0 },
      { 'المؤشر': 'معدل الإنجاز العام (%)', 'القيمة': `${extraSummary.rate ?? 0}%` },
      { 'المؤشر': 'تاريخ الاستخراج', 'القيمة': new Date().toLocaleString('ar-EG') },
    ];
    const wsKpi = XLSX.utils.json_to_sheet(kpiRows);
    wsKpi['!cols'] = [{ wch: 30 }, { wch: 32 }];
    wsKpi['!views'] = [{ rightToLeft: true }];
    XLSX.utils.book_append_sheet(wb, wsKpi, 'ملخص المؤشرات');

    if (extraSummary.staffStats && extraSummary.staffStats.length > 0) {
      const staffSheetRows = extraSummary.staffStats.map((s) => ({
        'اسم الموظف': s.fullName,
        'كود CRM': s.crmUser,
        'الوظيفة': s.roleLabel,
        'الحالات المسجلة والمتابعة': s.totalHandled,
        'المفتوحة حالياً': s.openOwnedCount,
        'الحالات المغلقة': s.totalClosed,
        'نسبة الإغلاق (%)': `${s.closeRate}%`,
      }));
      const wsStaff = XLSX.utils.json_to_sheet(staffSheetRows);
      wsStaff['!cols'] = [
        { wch: 28 },
        { wch: 16 },
        { wch: 24 },
        { wch: 22 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
      ];
      wsStaff['!views'] = [{ rightToLeft: true }];
      XLSX.utils.book_append_sheet(wb, wsStaff, 'إنتاجية الموظفين');
    }
  }

  const normalizedName = fileName.endsWith('.xlsx')
    ? fileName
    : fileName.replace(/\.(csv|xls)$/i, '') + '.xlsx';

  XLSX.writeFile(wb, normalizedName);
}

/**
 * Legacy CSV wrapper preserved for compatibility (downloads real Excel .xlsx cleanly)
 */
export function exportCasesToCSV(cases: Case[], fileName = 'حالات_مركز_الاتصال_الضرائب.xlsx'): void {
  exportCasesToExcel(cases, fileName);
}
