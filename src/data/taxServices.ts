/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TaxType } from '../types';

export const OTHER_SERVICE_OPTION = 'أخرى';

export const INCOME_TAX_SERVICES: string[] = [
  'الاقرارات الضريبية',
  'منظومة Eservices',
  'منظومة المرتبات Payroll',
  'منظومة SAP',
  'التصرفات العقارية',
  'الثروة العقارية',
  'الخصم والتحصيل',
  'الدفعات المقدمة',
  'التسجيل والربط',
  'استفسارات ضريبية',
  'السداد والتحصيل',
  'الفحص والطعون',
  'متابعة شكوى',
  'الاعفاءات',
  'دورات تدريبية',
  'التهرب الضريبي',
  'عناوين المأموريات',
  'رسائل SMS',
];

export const VAT_SERVICES: string[] = [
  'منظومة الفاتورة الالكترونية',
  'منظومة الايصال الالكتروني',
  'منظومة التحفيز',
  'منظومة SAP',
  'منظومة Eservices',
  'الاقرارات الضريبية',
  'رد الضريبة',
  'التسجيل والربط',
  'استفسارات ضريبية',
  'السداد والتحصيل',
  'الفحص والطعون',
  'متابعة شكوى',
  'الاعفاءات',
  'دورات تدريبية',
  'التهرب الضريبي',
  'عناوين المأموريات',
  'رسائل SMS',
];

export function getServicesByTaxType(taxType: TaxType): string[] {
  const base = taxType === 'ضرائب قيمة مضافة' ? VAT_SERVICES : INCOME_TAX_SERVICES;
  return [...base, OTHER_SERVICE_OPTION];
}
