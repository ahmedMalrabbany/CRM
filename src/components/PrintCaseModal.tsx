/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, ShieldCheck } from 'lucide-react';
import { Case, TimelineEvent } from '../types';
import { EtaLogo } from './EtaLogo';
import { formatFileSizeArabic, getAttachmentStageLabel } from '../services/attachmentService';

interface PrintCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseItem: Case | null;
  timeline: TimelineEvent[];
}

export const PrintCaseModal: React.FC<PrintCaseModalProps> = ({
  isOpen,
  onClose,
  caseItem,
  timeline,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const cleanup = () => {
      document.body.classList.remove('printing-case-modal');
    };
    window.addEventListener('afterprint', cleanup);
    return () => {
      window.removeEventListener('afterprint', cleanup);
      cleanup();
    };
  }, []);

  if (!isOpen || !caseItem) return null;

  const handlePrint = () => {
    document.body.classList.add('printing-case-modal');
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-case-modal');
      }, 1500);
    });
  };

  return createPortal(
    <div
      dir="rtl"
      onClick={onClose}
      className="fixed inset-0 z-90 flex items-center justify-center bg-[#001429]/80 backdrop-blur-xs p-3 sm:p-4 print:static print:inset-auto print:block print:bg-white print:p-0"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden print:max-h-none print:max-w-none print:border-0 print:shadow-none print:rounded-none print:block"
      >
        {/* Sticky Print Toolbar Header (Hidden during print) */}
        <div className="px-4 py-3 bg-[#00264D] text-white flex flex-wrap items-center justify-between gap-2 shrink-0 border-b border-[#004B87] print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Printer className="w-5 h-5 text-[#00E676] shrink-0" />
            <span className="font-bold text-xs sm:text-sm truncate">
              معاينة طباعة استمارة الحالة ({caseItem.caseId})
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-[#00A651] hover:bg-[#008742] text-white text-xs font-black rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة / حفظ PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
              aria-label="إغلاق شاشة الطباعة"
            >
              <X className="w-4 h-4" />
              <span>خروج</span>
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Body */}
        <div
          id="printable-case-area"
          className="flex-1 overflow-y-auto p-5 sm:p-7 bg-white text-slate-900 flex flex-col gap-5 text-right print:overflow-visible print:p-2"
        >
          {/* Official Document Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between gap-4">
            <div className="text-right">
              <div className="font-extrabold text-base sm:text-lg text-slate-900">
                برنامج إدارة خدمة العملاء CRM
              </div>
              <div className="font-bold text-xs sm:text-sm text-slate-700">
                نظام إدارة ومتابعة الحالات - مركز الاتصال 16395
              </div>
              <div className="text-xs text-slate-500 mt-1">
                وثيقة توثيق رسمية لإجراءات ومتابعة الحالة
              </div>
            </div>

            <EtaLogo size={60} />

            <div className="text-left font-mono shrink-0">
              <div className="inline-block border border-slate-400 bg-slate-50 p-2 rounded-lg text-center">
                <div className="text-xs text-slate-500 font-sans">رقم الحالة الموحد</div>
                <div className="text-sm sm:text-base font-black text-slate-900 tracking-wider">
                  {caseItem.caseId}
                </div>
                <div className="text-[10px] text-slate-400">
                  {new Date(caseItem.createdAt).toLocaleDateString('ar-EG')}
                </div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-sm sm:text-base font-black text-slate-900 underline underline-offset-8">
              استمارة متابعة وتوثيق حالة عميل / ممول
            </h2>
          </div>

          {/* Grid of details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Taxpayer Information */}
            <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
              <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-2 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                بيانات الممول
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">رقم التسجيل الضريبي:</span>
                  <span className="font-bold font-mono text-slate-900">
                    {caseItem.taxRegistrationNumber || 'غير متوفر / بدون رقم ضريبي'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">اسم الممول / الشركة:</span>
                  <span className="font-semibold text-slate-900">
                    {caseItem.taxpayerName || 'غير مسجل'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">نوع الضريبة:</span>
                  <span className="font-semibold text-slate-900">{caseItem.taxType}</span>
                </div>
              </div>
            </div>

            {/* Caller Information */}
            <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
              <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-2">
                بيانات المتصل
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">اسم المتصل:</span>
                  <span className="font-bold text-slate-900">{caseItem.callerName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">رقم الهاتف:</span>
                  <span className="font-mono text-slate-900">{caseItem.callerPhone}</span>
                </div>
                {caseItem.callerNationalId && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">الرقم القومي:</span>
                    <span className="font-mono text-slate-900" dir="ltr">
                      {caseItem.callerNationalId}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">قناة الاتصال:</span>
                  <span className="font-semibold text-slate-900">{caseItem.channel}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Case metadata */}
          <div className="border border-slate-300 rounded-xl p-3 bg-white text-xs space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-slate-200 pb-2">
              <div>
                <span className="text-slate-500 block text-[10px]">نوع الاتصال</span>
                <span className="font-bold text-slate-900">{caseItem.callType}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">الخدمة المعنية</span>
                <span className="font-bold text-slate-900">{caseItem.serviceType}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">الحالة الحالية</span>
                <span className="font-bold text-slate-900">{caseItem.status}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">الأولوية</span>
                <span className="font-bold text-slate-900">{caseItem.priority}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px]">عنوان الحالة (الموحد):</span>
              <div className="font-bold text-sm text-slate-900 mt-0.5">{caseItem.title}</div>
            </div>
          </div>

          {/* Notes & Responses */}
          <div className="space-y-3 text-xs">
            {caseItem.agentNotes && (
              <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                <div className="font-bold text-slate-800 mb-1">ملاحظات وكيل الاتصال:</div>
                <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {caseItem.agentNotes}
                </div>
              </div>
            )}

            {caseItem.agentReply && (
              <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50/30">
                <div className="font-bold text-emerald-950 mb-1 flex items-center justify-between">
                  <span>رد وكيل الاتصال:</span>
                  <span className="text-[10px] text-emerald-800 font-normal">
                    الموظف: {caseItem.agentEmployeeName || caseItem.createdByName}
                  </span>
                </div>
                <div className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {caseItem.agentReply}
                </div>
              </div>
            )}

            {caseItem.managementReply && (
              <div className="border border-blue-200 rounded-xl p-3 bg-blue-50/40">
                <div className="font-bold text-blue-950 mb-1 flex items-center justify-between">
                  <span>رد الإدارة والدعم التقني:</span>
                  <span className="text-[10px] text-blue-800 font-normal">
                    الموظف: {caseItem.managementEmployeeName || 'إدارة الدعم التقني'}
                  </span>
                </div>
                <div className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {caseItem.managementReply}
                </div>
              </div>
            )}

            {caseItem.status === 'مغلقة' && (
              <div className="border border-rose-200 bg-rose-50/40 rounded-xl p-3">
                <div className="font-bold text-rose-900 mb-1 flex items-center justify-between">
                  <span>بيانات إغلاق الحالة:</span>
                  <span className="text-[10px] text-rose-700">
                    بواسطة: {caseItem.closedByName || 'غير محدد'} (
                    {caseItem.closedAt ? new Date(caseItem.closedAt).toLocaleString('ar-EG') : ''})
                  </span>
                </div>
                <div className="text-slate-800 font-semibold">{caseItem.closeReason}</div>
              </div>
            )}
          </div>

          {caseItem.attachments && caseItem.attachments.length > 0 && (
            <div className="text-xs">
              <div className="font-bold text-slate-800 mb-2">
                المستندات والمرفقات المسجلة بالحالة ({caseItem.attachments.length}):
              </div>
              <table className="w-full border border-slate-300 rounded-lg overflow-hidden text-right">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[11px]">
                  <tr>
                    <th className="p-2 border-l border-slate-300">اسم المستند</th>
                    <th className="p-2 border-l border-slate-300">المرحلة</th>
                    <th className="p-2 border-l border-slate-300">الحجم</th>
                    <th className="p-2">بواسطة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[11px]">
                  {caseItem.attachments.map((att) => (
                    <tr key={att.id}>
                      <td className="p-2 border-l border-slate-200 font-semibold text-slate-900">
                        {att.fileName}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-slate-700">
                        {getAttachmentStageLabel(att.stage)}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-slate-600">
                        {formatFileSizeArabic(att.sizeBytes)}
                      </td>
                      <td className="p-2 text-slate-700">
                        {att.uploadedByName} ({new Date(att.uploadedAt).toLocaleDateString('ar-EG')})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Timeline Table */}
          <div className="text-xs">
            <div className="font-bold text-slate-800 mb-2">سجل حركة وتاريخ الحالة (Case Timeline):</div>
            <table className="w-full border border-slate-300 rounded-lg overflow-hidden text-right">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[11px]">
                <tr>
                  <th className="p-2 border-l border-slate-300">التاريخ والوقت</th>
                  <th className="p-2 border-l border-slate-300">الإجراء</th>
                  <th className="p-2 border-l border-slate-300">الموظف المسؤول</th>
                  <th className="p-2">تفاصيل وملاحظات الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {timeline.map((evt, idx) => (
                  <tr key={idx}>
                    <td className="p-2 border-l border-slate-200 font-mono text-[10px] text-slate-600 whitespace-nowrap">
                      {new Date(evt.createdAt).toLocaleString('ar-EG')}
                    </td>
                    <td className="p-2 border-l border-slate-200 font-semibold text-slate-800">
                      {evt.action}
                    </td>
                    <td className="p-2 border-l border-slate-200 text-slate-700">
                      {evt.userName} ({evt.userCrmUser})
                    </td>
                    <td className="p-2 text-slate-600">{evt.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Official Signatures Footer */}
          <div className="pt-4 mt-2 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs">
            <div>
              <div className="text-slate-500 text-[10px]">وكيل الاتصال المستلم</div>
              <div className="font-bold mt-1">{caseItem.createdByName}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">مسؤول الإدارة / الدعم التقني</div>
              <div className="font-bold mt-1">{caseItem.managementEmployeeName || '—'}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">اعتماد مشرف الوردية</div>
              <div className="font-bold mt-1">خدمة العملاء والدعم</div>
            </div>
          </div>

          {/* Mandatory Attribution Footer */}
          <div
            dir="ltr"
            className="pt-3 border-t border-slate-200 text-center text-[11px] font-bold text-slate-800 bg-slate-50 p-2.5 rounded-xl space-y-0.5"
          >
            <div>
              © 2026 Integrated Call Center – Egyptian Tax Authority. All Intellectual Property Rights Reserved.
            </div>
            <div>
              Designed &amp; Developed by: Ahmed Mahfouz{' '}
              <span className="font-mono">01026408888</span> | Prepared by Nermin ElSweifi{' '}
              <span className="font-mono">01015313180</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
