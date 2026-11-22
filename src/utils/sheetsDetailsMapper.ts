/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Bidirectional field-to-column mapping engine for Google Sheets (`Details` tab)
 * on Spreadsheet ID: 1HsxOPbasrVx1sWY7GSfkXy1IxLZp0xKPsLYS7yFDQoU
 */

import type {
  Case,
  CallType,
  TaxType,
  ContactChannel,
  CaseStatus,
  CasePriority,
  CallerTitle,
  CallerClassification,
  UserRole,
} from '../types';

export const TARGET_SPREADSHEET_ID = '1HsxOPbasrVx1sWY7GSfkXy1IxLZp0xKPsLYS7yFDQoU';
export const TARGET_DETAILS_TAB = 'Details';
export const TARGET_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}/edit`;

export type MappableCaseField =
  | 'caseId'
  | 'createdAt'
  | 'updatedAt'
  | 'callType'
  | 'taxType'
  | 'serviceType'
  | 'channel'
  | 'priority'
  | 'status'
  | 'title'
  | 'rawTitle'
  | 'taxRegistrationNumber'
  | 'taxpayerName'
  | 'callerName'
  | 'callerTitle'
  | 'callerClassification'
  | 'callerNationalId'
  | 'callerPhone'
  | 'callerSecondaryPhone'
  | 'callerEmail'
  | 'callerDescription'
  | 'agentNotes'
  | 'agentReply'
  | 'agentEmployeeName'
  | 'managementReply'
  | 'managementEmployeeName'
  | 'assignedTo'
  | 'assignedToName'
  | 'assignedToRole'
  | 'createdById'
  | 'createdByName'
  | 'createdByCrmUser'
  | 'createdByRole'
  | 'closeReason'
  | 'closedAt'
  | 'closedByName'
  | 'id'
  | 'isDeleted';

export interface DetailsColumnDefinition {
  field: MappableCaseField;
  defaultHeader: string;
  arabicLabel: string;
  aliases: string[];
}

export const DETAILS_COLUMN_DEFINITIONS: DetailsColumnDefinition[] = [
  {
    field: 'caseId',
    defaultHeader: 'Case ID',
    arabicLabel: 'رقم الحالة',
    aliases: ['case id', 'caseid', 'case_id', 'case number', 'ticket id', 'رقم الحالة', 'كود الحالة', 'رقم التذكرة'],
  },
  {
    field: 'createdAt',
    defaultHeader: 'Created At',
    arabicLabel: 'تاريخ التسجيل',
    aliases: ['created at', 'createdat', 'created_at', 'date', 'timestamp', 'created date', 'تاريخ التسجيل', 'تاريخ الانشاء', 'التاريخ'],
  },
  {
    field: 'updatedAt',
    defaultHeader: 'Updated At',
    arabicLabel: 'آخر تحديث',
    aliases: ['updated at', 'updatedat', 'updated_at', 'last updated', 'modified at', 'اخر تحديث', 'تاريخ التحديث'],
  },
  {
    field: 'callType',
    defaultHeader: 'Call Type',
    arabicLabel: 'نوع المكالمة',
    aliases: ['call type', 'calltype', 'call_type', 'type', 'inquiry type', 'نوع المكالمة', 'نوع الاتصال', 'التصنيف'],
  },
  {
    field: 'taxType',
    defaultHeader: 'Tax Type',
    arabicLabel: 'نوع الضريبة',
    aliases: ['tax type', 'taxtype', 'tax_type', 'نوع الضريبة', 'الضريبة'],
  },
  {
    field: 'serviceType',
    defaultHeader: 'Service Type',
    arabicLabel: 'الخدمة',
    aliases: ['service type', 'servicetype', 'service_type', 'service', 'الخدمة', 'نوع الخدمة', 'اسم الخدمة'],
  },
  {
    field: 'channel',
    defaultHeader: 'Channel',
    arabicLabel: 'قناة التواصل',
    aliases: ['channel', 'contact channel', 'source', 'قناة التواصل', 'وسيلة التواصل'],
  },
  {
    field: 'priority',
    defaultHeader: 'Priority',
    arabicLabel: 'الأولوية',
    aliases: ['priority', 'urgency', 'الاولوية', 'درجة الاهمية'],
  },
  {
    field: 'status',
    defaultHeader: 'Status',
    arabicLabel: 'الحالة',
    aliases: ['status', 'case status', 'state', 'الحالة', 'حالة الطلب', 'حالة التذكرة'],
  },
  {
    field: 'title',
    defaultHeader: 'Title',
    arabicLabel: 'عنوان الحالة',
    aliases: ['title', 'subject', 'case title', 'summary', 'topic', 'عنوان الحالة', 'العنوان', 'الموضوع'],
  },
  {
    field: 'rawTitle',
    defaultHeader: 'Raw Title',
    arabicLabel: 'العنوان الأصلي',
    aliases: ['raw title', 'rawtitle', 'raw_title', 'original title', 'العنوان الاصلي'],
  },
  {
    field: 'taxRegistrationNumber',
    defaultHeader: 'Tax Registration Number',
    arabicLabel: 'رقم التسجيل الضريبي',
    aliases: [
      'tax registration number',
      'taxregistrationnumber',
      'tax_registration_number',
      'trn',
      'tax number',
      'tax id',
      'registration number',
      'رقم التسجيل الضريبي',
      'الرقم الضريبي',
      'رقم التسجيل',
    ],
  },
  {
    field: 'taxpayerName',
    defaultHeader: 'Taxpayer Name',
    arabicLabel: 'اسم الممول',
    aliases: ['taxpayer name', 'taxpayername', 'taxpayer_name', 'taxpayer', 'company', 'company name', 'اسم الممول', 'الممول', 'اسم الشركة'],
  },
  {
    field: 'callerName',
    defaultHeader: 'Caller Name',
    arabicLabel: 'اسم المتصل',
    aliases: ['caller name', 'callername', 'caller_name', 'caller', 'contact name', 'name', 'اسم المتصل', 'المتصل', 'الاسم'],
  },
  {
    field: 'callerTitle',
    defaultHeader: 'Caller Title',
    arabicLabel: 'صفة المتصل',
    aliases: ['caller title', 'callertitle', 'caller_title', 'job title', 'صفة المتصل', 'الصفة'],
  },
  {
    field: 'callerClassification',
    defaultHeader: 'Caller Classification',
    arabicLabel: 'تصنيف المتصل',
    aliases: ['caller classification', 'callerclassification', 'caller_classification', 'classification', 'entity type', 'تصنيف المتصل', 'الكيان'],
  },
  {
    field: 'callerNationalId',
    defaultHeader: 'National ID',
    arabicLabel: 'الرقم القومي',
    aliases: ['national id', 'callernationalid', 'caller_national_id', 'nid', 'الرقم القومي', 'رقم قومي'],
  },
  {
    field: 'callerPhone',
    defaultHeader: 'Caller Phone',
    arabicLabel: 'هاتف المتصل',
    aliases: ['caller phone', 'callerphone', 'caller_phone', 'phone', 'mobile', 'primary phone', 'telephone', 'هاتف المتصل', 'رقم الهاتف', 'الهاتف', 'الموبايل', 'التليفون'],
  },
  {
    field: 'callerSecondaryPhone',
    defaultHeader: 'Secondary Phone',
    arabicLabel: 'الهاتف البديل',
    aliases: ['secondary phone', 'callersecondaryphone', 'caller_secondary_phone', 'alt phone', 'alternative phone', 'الهاتف البديل', 'هاتف بديل'],
  },
  {
    field: 'callerEmail',
    defaultHeader: 'Caller Email',
    arabicLabel: 'البريد الإلكتروني',
    aliases: ['caller email', 'calleremail', 'caller_email', 'email', 'e-mail', 'البريد الالكتروني', 'الايميل'],
  },
  {
    field: 'callerDescription',
    defaultHeader: 'Caller Description',
    arabicLabel: 'وصف المتصل',
    aliases: ['caller description', 'callerdescription', 'caller_description', 'وصف المتصل'],
  },
  {
    field: 'agentNotes',
    defaultHeader: 'Agent Notes',
    arabicLabel: 'ملاحظات الوكيل',
    aliases: ['agent notes', 'agentnotes', 'agent_notes', 'notes', 'details', 'description', 'comments', 'ملاحظات الوكيل', 'الملاحظات', 'التفاصيل', 'تفاصيل الحالة'],
  },
  {
    field: 'agentReply',
    defaultHeader: 'Agent Reply',
    arabicLabel: 'رد الوكيل',
    aliases: ['agent reply', 'agentreply', 'agent_reply', 'reply', 'رد الوكيل', 'رد وكيل الاتصال'],
  },
  {
    field: 'agentEmployeeName',
    defaultHeader: 'Agent Employee',
    arabicLabel: 'موظف الاتصال',
    aliases: ['agent employee', 'agentemployeename', 'agent_employee_name', 'agent name', 'موظف الاتصال'],
  },
  {
    field: 'managementReply',
    defaultHeader: 'Management Reply',
    arabicLabel: 'رد الإدارة والدعم',
    aliases: ['management reply', 'managementreply', 'management_reply', 'tech reply', 'resolution', 'رد الادارة', 'رد الاداره والدعم', 'رد الدعم الفني'],
  },
  {
    field: 'managementEmployeeName',
    defaultHeader: 'Management Employee',
    arabicLabel: 'موظف الإدارة',
    aliases: ['management employee', 'managementemployeename', 'management_employee_name', 'موظف الادارة'],
  },
  {
    field: 'assignedTo',
    defaultHeader: 'Assigned To ID',
    arabicLabel: 'معرف المكلف',
    aliases: ['assigned to id', 'assignedto', 'assigned_to', 'owner id', 'معرف المكلف'],
  },
  {
    field: 'assignedToName',
    defaultHeader: 'Assigned To',
    arabicLabel: 'المكلف الحالي',
    aliases: ['assigned to', 'assignedtoname', 'assigned_to_name', 'owner', 'assignee', 'المكلف الحالي', 'مسند الى', 'المسؤول'],
  },
  {
    field: 'assignedToRole',
    defaultHeader: 'Assigned Role',
    arabicLabel: 'دور المكلف',
    aliases: ['assigned role', 'assignedtorole', 'assigned_to_role', 'دور المكلف'],
  },
  {
    field: 'createdById',
    defaultHeader: 'Created By ID',
    arabicLabel: 'معرف المنشئ',
    aliases: ['created by id', 'createdbyid', 'created_by_id', 'معرف المنشئ'],
  },
  {
    field: 'createdByName',
    defaultHeader: 'Created By',
    arabicLabel: 'الوكيل المسجل',
    aliases: ['created by', 'createdbyname', 'created_by_name', 'agent', 'الوكيل المسجل', 'منشئ الحالة'],
  },
  {
    field: 'createdByCrmUser',
    defaultHeader: 'CRM User',
    arabicLabel: 'كود CRM',
    aliases: ['crm user', 'createdbycrmuser', 'created_by_crm_user', 'agent code', 'كود crm', 'كود الوكيل'],
  },
  {
    field: 'createdByRole',
    defaultHeader: 'Created By Role',
    arabicLabel: 'دور المنشئ',
    aliases: ['created by role', 'createdbyrole', 'created_by_role', 'دور المنشئ'],
  },
  {
    field: 'closeReason',
    defaultHeader: 'Close Reason',
    arabicLabel: 'سبب الإغلاق',
    aliases: ['close reason', 'closereason', 'close_reason', 'closure reason', 'سبب الاغلاق', 'سبب الغلق'],
  },
  {
    field: 'closedAt',
    defaultHeader: 'Closed At',
    arabicLabel: 'تاريخ الإغلاق',
    aliases: ['closed at', 'closedat', 'closed_at', 'تاريخ الاغلاق'],
  },
  {
    field: 'closedByName',
    defaultHeader: 'Closed By',
    arabicLabel: 'أغلق بواسطة',
    aliases: ['closed by', 'closedbyname', 'closed_by_name', 'اغلق بواسطة'],
  },
  {
    field: 'id',
    defaultHeader: 'Record ID',
    arabicLabel: 'المعرف',
    aliases: ['record id', '_id', 'id', 'doc id', 'المعرف'],
  },
  {
    field: 'isDeleted',
    defaultHeader: 'Is Deleted',
    arabicLabel: 'محذوفة',
    aliases: ['is deleted', 'isdeleted', 'is_deleted', 'deleted', 'محذوفة'],
  },
];

export function normalizeHeaderToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ColumnMappingInfo {
  colIndex: number;
  headerName: string;
  mappedField: MappableCaseField | null;
  arabicLabel: string;
  matchConfidence: 'custom' | 'exact' | 'alias' | 'unmapped';
}

export interface ResolvedDetailsSchema {
  headers: string[];
  mappings: ColumnMappingInfo[];
  fieldToColIndex: Partial<Record<MappableCaseField, number>>;
  unmappedAppFields: DetailsColumnDefinition[];
}

export function resolveDetailsColumnMappings(
  headers: string[],
  customFieldMap?: Record<string, MappableCaseField | ''>
): ResolvedDetailsSchema {
  const usedFields = new Set<MappableCaseField>();
  const mappings: ColumnMappingInfo[] = headers.map((headerName, colIndex) => ({
    colIndex,
    headerName: String(headerName ?? '').trim(),
    mappedField: null,
    arabicLabel: '',
    matchConfidence: 'unmapped',
  }));

  // Pass 0: explicit custom overrides
  if (customFieldMap) {
    for (const m of mappings) {
      const custom = customFieldMap[m.headerName];
      if (custom && !usedFields.has(custom)) {
        const def = DETAILS_COLUMN_DEFINITIONS.find((d) => d.field === custom);
        if (def) {
          m.mappedField = custom;
          m.arabicLabel = def.arabicLabel;
          m.matchConfidence = 'custom';
          usedFields.add(custom);
        }
      }
    }
  }

  // Pass 1: exact match on field name, defaultHeader, or arabicLabel
  for (const m of mappings) {
    if (m.mappedField || !m.headerName) continue;
    const norm = normalizeHeaderToken(m.headerName);
    const exactDef = DETAILS_COLUMN_DEFINITIONS.find(
      (d) =>
        !usedFields.has(d.field) &&
        (normalizeHeaderToken(d.field) === norm ||
          normalizeHeaderToken(d.defaultHeader) === norm ||
          normalizeHeaderToken(d.arabicLabel) === norm)
    );
    if (exactDef) {
      m.mappedField = exactDef.field;
      m.arabicLabel = exactDef.arabicLabel;
      m.matchConfidence = 'exact';
      usedFields.add(exactDef.field);
    }
  }

  // Pass 2: alias match
  for (const m of mappings) {
    if (m.mappedField || !m.headerName) continue;
    const norm = normalizeHeaderToken(m.headerName);
    const aliasDef = DETAILS_COLUMN_DEFINITIONS.find(
      (d) => !usedFields.has(d.field) && d.aliases.some((a) => normalizeHeaderToken(a) === norm)
    );
    if (aliasDef) {
      m.mappedField = aliasDef.field;
      m.arabicLabel = aliasDef.arabicLabel;
      m.matchConfidence = 'alias';
      usedFields.add(aliasDef.field);
    }
  }

  const fieldToColIndex: Partial<Record<MappableCaseField, number>> = {};
  for (const m of mappings) {
    if (m.mappedField) {
      fieldToColIndex[m.mappedField] = m.colIndex;
    }
  }

  const unmappedAppFields = DETAILS_COLUMN_DEFINITIONS.filter((d) => !usedFields.has(d.field));

  return {
    headers: mappings.map((m) => m.headerName),
    mappings,
    fieldToColIndex,
    unmappedAppFields,
  };
}

function toAsciiDigits(val: unknown): string {
  return String(val ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
}

function normalizeIsoTimestamp(val: unknown, fallback: string): string {
  const raw = String(val ?? '').trim();
  if (!raw) return fallback;
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return fallback;
}

function normalizeStatus(val: unknown): CaseStatus {
  const raw = String(val ?? '').trim();
  const valid: CaseStatus[] = [
    'جديدة',
    'مفتوحة',
    'قيد المعالجة',
    'محولة للإدارة',
    'محولة للدعم التقني',
    'محولة للدعم الفني',
    'محولة لوكيل الاتصال',
    'قيد الانتظار',
    'مغلقة',
  ];
  if (valid.includes(raw as CaseStatus)) return raw as CaseStatus;
  const low = raw.toLowerCase();
  if (low === 'closed' || low === 'done' || low === 'resolved') return 'مغلقة';
  if (low === 'in progress' || low === 'processing') return 'قيد المعالجة';
  if (low === 'open') return 'مفتوحة';
  if (low === 'pending') return 'قيد الانتظار';
  return raw ? (raw as CaseStatus) : 'جديدة';
}

function normalizeCallType(val: unknown): CallType {
  const raw = String(val ?? '').trim();
  if (raw === 'طلب' || raw === 'استفسار' || raw === 'شكوى' || raw === 'رسائل SMS') {
    return raw;
  }
  const low = raw.toLowerCase();
  if (low.includes('complaint') || low.includes('شكو')) return 'شكوى';
  if (low.includes('request') || low.includes('طلب')) return 'طلب';
  if (low.includes('sms') || low.includes('رسا')) return 'رسائل SMS';
  return 'استفسار';
}

function normalizeTaxType(val: unknown): TaxType {
  const raw = String(val ?? '').trim();
  if (raw === 'ضرائب دخل' || raw === 'ضرائب قيمة مضافة') return raw;
  const low = raw.toLowerCase();
  if (low.includes('vat') || low.includes('قيمه') || low.includes('قيمة')) {
    return 'ضرائب قيمة مضافة';
  }
  return 'ضرائب دخل';
}

function normalizeChannel(val: unknown): ContactChannel {
  const raw = String(val ?? '').trim();
  if (raw === 'اتصال هاتفي' || raw === 'بريد إلكتروني') return raw;
  const low = raw.toLowerCase();
  if (low.includes('email') || low.includes('بريد')) return 'بريد إلكتروني';
  return 'اتصال هاتفي';
}

function normalizePriority(val: unknown): CasePriority {
  const raw = String(val ?? '').trim();
  if (raw === 'عادي' || raw === 'هام' || raw === 'عاجل') return raw;
  const low = raw.toLowerCase();
  if (low === 'urgent' || low === 'high' || low === 'critical') return 'عاجل';
  if (low === 'important' || low === 'medium') return 'هام';
  return 'عادي';
}

function normalizeRole(val: unknown): UserRole {
  const raw = String(val ?? '').trim();
  if (
    raw === 'super_admin' ||
    raw === 'agent' ||
    raw === 'management' ||
    raw === 'technical_support'
  ) {
    return raw;
  }
  return 'agent';
}

function parseBool(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  const s = String(val ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'نعم';
}

export interface DecodedDetailsResult {
  schema: ResolvedDetailsSchema;
  cases: Case[];
  rowNumbersByCaseId: Record<string, number>;
}

export function decodeDetailsRowsToCases(
  rows: any[][],
  customFieldMap?: Record<string, MappableCaseField | ''>
): DecodedDetailsResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    const emptySchema = resolveDetailsColumnMappings([], customFieldMap);
    return { schema: emptySchema, cases: [], rowNumbersByCaseId: {} };
  }

  const rawHeaders = (rows[0] || []).map((h) => String(h ?? '').trim());
  const schema = resolveDetailsColumnMappings(rawHeaders, customFieldMap);
  const cases: Case[] = [];
  const rowNumbersByCaseId: Record<string, number> = {};
  const nowIso = new Date().toISOString();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const hasContent = row.some((cell) => String(cell ?? '').trim() !== '');
    if (!hasContent) continue;

    const getField = (field: MappableCaseField): string => {
      const idx = schema.fieldToColIndex[field];
      if (idx === undefined) return '';
      const val = row[idx];
      return val === undefined || val === null ? '' : String(val).trim();
    };

    const rawId = getField('id');
    const rawCaseId = getField('caseId');
    const fallbackCaseId = rawCaseId || `CRM-${String(r).padStart(6, '0')}`;
    const docId = rawId || fallbackCaseId.replace(/[^a-zA-Z0-9_-]/g, '_') || `sheet_row_${r + 1}`;
    const createdAt = normalizeIsoTimestamp(getField('createdAt'), nowIso);
    const updatedAt = normalizeIsoTimestamp(getField('updatedAt'), createdAt);

    const parsedCase: Case = {
      id: docId,
      caseId: fallbackCaseId,
      callType: normalizeCallType(getField('callType')),
      taxType: normalizeTaxType(getField('taxType')),
      serviceType: getField('serviceType') || 'استفسارات ضريبية',
      channel: normalizeChannel(getField('channel')),
      title: getField('title') || getField('agentNotes').slice(0, 80) || fallbackCaseId,
      rawTitle: getField('rawTitle') || undefined,
      taxRegistrationNumber: toAsciiDigits(getField('taxRegistrationNumber')),
      taxpayerName: getField('taxpayerName') || 'غير محدد',
      callerName: getField('callerName') || 'غير محدد',
      callerTitle: (getField('callerTitle') as CallerTitle) || '',
      callerClassification: (getField('callerClassification') as CallerClassification) || '',
      callerNationalId: toAsciiDigits(getField('callerNationalId')) || undefined,
      callerPhone: toAsciiDigits(getField('callerPhone')),
      callerSecondaryPhone: toAsciiDigits(getField('callerSecondaryPhone')) || undefined,
      callerEmail: getField('callerEmail') || undefined,
      callerDescription: getField('callerDescription') || undefined,
      status: normalizeStatus(getField('status')),
      priority: normalizePriority(getField('priority')),
      agentNotes: getField('agentNotes') || undefined,
      agentReply: getField('agentReply') || undefined,
      agentEmployeeName: getField('agentEmployeeName') || undefined,
      managementReply: getField('managementReply') || undefined,
      managementEmployeeName: getField('managementEmployeeName') || undefined,
      assignedTo: getField('assignedTo') || undefined,
      assignedToName: getField('assignedToName') || undefined,
      assignedToRole: getField('assignedToRole') ? normalizeRole(getField('assignedToRole')) : undefined,
      closeReason: getField('closeReason') || undefined,
      closedAt: getField('closedAt') ? normalizeIsoTimestamp(getField('closedAt'), '') || undefined : undefined,
      closedByName: getField('closedByName') || undefined,
      createdById: getField('createdById') || 'sheets_import',
      createdByName: getField('createdByName') || 'Google Sheets',
      createdByCrmUser: getField('createdByCrmUser') || 'SHEETS',
      createdByRole: getField('createdByRole') ? normalizeRole(getField('createdByRole')) : 'agent',
      createdAt,
      updatedAt,
      isDeleted: parseBool(getField('isDeleted')),
    };

    cases.push(parsedCase);
    rowNumbersByCaseId[docId] = r + 1;
  }

  return { schema, cases, rowNumbersByCaseId };
}

function serializeCaseFieldValue(c: Case, field: MappableCaseField): string | boolean {
  const val = c[field];
  if (val === undefined || val === null) return '';
  if (typeof val === 'boolean') return val;
  return String(val);
}

export interface EncodedDetailsResult {
  headers: string[];
  rows: (string | number | boolean)[][];
  schema: ResolvedDetailsSchema;
}

export function encodeCasesToDetailsRows(
  cases: Case[],
  existingHeaders: string[] = [],
  existingRows: any[][] = [],
  options: {
    includeMissingColumns?: boolean;
    customFieldMap?: Record<string, MappableCaseField | ''>;
  } = {}
): EncodedDetailsResult {
  const cleanExistingHeaders = existingHeaders.map((h) => String(h ?? '').trim()).filter(Boolean);
  let targetHeaders: string[];

  if (cleanExistingHeaders.length === 0) {
    targetHeaders = DETAILS_COLUMN_DEFINITIONS.map((d) => d.defaultHeader);
  } else {
    const baseSchema = resolveDetailsColumnMappings(cleanExistingHeaders, options.customFieldMap);
    targetHeaders = [...cleanExistingHeaders];
    if (options.includeMissingColumns) {
      for (const missingDef of baseSchema.unmappedAppFields) {
        targetHeaders.push(missingDef.defaultHeader);
      }
    }
  }

  const finalSchema = resolveDetailsColumnMappings(targetHeaders, options.customFieldMap);

  // Index existing rows by id or caseId so any unmapped custom columns in Details are preserved
  const existingRowByKey = new Map<string, any[]>();
  if (existingRows.length > 1) {
    const existingSchema = resolveDetailsColumnMappings(
      (existingRows[0] || []).map((h) => String(h ?? '').trim()),
      options.customFieldMap
    );
    const idCol = existingSchema.fieldToColIndex.id;
    const caseIdCol = existingSchema.fieldToColIndex.caseId;
    for (let r = 1; r < existingRows.length; r++) {
      const row = existingRows[r] || [];
      const rowId = idCol !== undefined ? String(row[idCol] ?? '').trim() : '';
      const rowCaseId = caseIdCol !== undefined ? String(row[caseIdCol] ?? '').trim() : '';
      if (rowId) existingRowByKey.set(`id:${rowId}`, row);
      if (rowCaseId) existingRowByKey.set(`caseId:${rowCaseId}`, row);
    }
  }

  const dataRows = cases.map((c) => {
    const prevRow =
      existingRowByKey.get(`id:${c.id}`) || existingRowByKey.get(`caseId:${c.caseId}`) || [];
    return finalSchema.mappings.map((col) => {
      if (col.mappedField) {
        return serializeCaseFieldValue(c, col.mappedField);
      }
      // Preserve unknown/custom column content if present
      return prevRow[col.colIndex] !== undefined && prevRow[col.colIndex] !== null
        ? prevRow[col.colIndex]
        : '';
    });
  });

  return {
    headers: targetHeaders,
    rows: [targetHeaders, ...dataRows],
    schema: finalSchema,
  };
}

export interface DetailsSyncDiff {
  toAddCount: number;
  toUpdateCount: number;
  onlyInSheetCount: number;
  totalTargetRows: number;
}

export function computeDetailsSyncDiff(localCases: Case[], sheetCases: Case[]): DetailsSyncDiff {
  const activeLocal = localCases.filter((c) => !c.isDeleted);
  const sheetByKey = new Map<string, Case>();
  for (const sc of sheetCases) {
    if (sc.id) sheetByKey.set(`id:${sc.id}`, sc);
    if (sc.caseId) sheetByKey.set(`caseId:${sc.caseId}`, sc);
  }

  let toAddCount = 0;
  let toUpdateCount = 0;
  const matchedSheetIds = new Set<string>();

  for (const lc of activeLocal) {
    const match = sheetByKey.get(`id:${lc.id}`) || sheetByKey.get(`caseId:${lc.caseId}`);
    if (match) {
      toUpdateCount++;
      matchedSheetIds.add(match.id || match.caseId);
    } else {
      toAddCount++;
    }
  }

  const onlyInSheetCount = sheetCases.filter(
    (sc) => !matchedSheetIds.has(sc.id || sc.caseId)
  ).length;

  return {
    toAddCount,
    toUpdateCount,
    onlyInSheetCount,
    totalTargetRows: activeLocal.length,
  };
}
