/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import firebaseConfig from '../../legacy-firebase/firebase-applet-config.json';
import { Case, User, Taxpayer, Caller } from '../types';
import { collection, getDocs } from '../lib/sheetsDb';
import { db } from '../config/firebase';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
// Strictly in-memory token cache (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export function initGoogleWorkspaceAuth(
  onAuthSuccess?: (user: FirebaseUser, token: string) => void,
  onAuthFailure?: () => void
): () => void {
  return onAuthStateChanged(auth, (user: FirebaseUser | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: FirebaseUser;
  accessToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('تعذر الحصول على رمز الوصول من Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleWorkspace(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}

export async function getGoogleWorkspaceAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export function getCurrentGoogleUser(): FirebaseUser | null {
  return auth.currentUser;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export interface DriveSpreadsheetItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SheetTabInfo[];
}

export interface SheetWriteTab {
  title: string;
  rows: (string | number | boolean)[][];
}

async function googleApiFetch(url: string, init: RequestInit = {}): Promise<any> {
  const token = await getGoogleWorkspaceAccessToken();
  if (!token) {
    const err: any = new Error('GOOGLE_AUTH_REQUIRED');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    cachedAccessToken = null;
    const err: any = new Error('انتهت صلاحية جلسة Google، يرجى إعادة تسجيل الدخول بحساب Google.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  if (!res.ok) {
    const errText = await res.text();
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      detail = parsed?.error?.message || errText;
    } catch {
      // keep raw text
    }
    throw new Error(`Google API (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function listUserSpreadsheets(): Promise<DriveSpreadsheetItem[]> {
  const q = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
  const data = await googleApiFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=25`
  );
  return Array.isArray(data.files) ? data.files : [];
}

export async function getSpreadsheetMetadata(
  spreadsheetIdInput: string
): Promise<SpreadsheetMetadata> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdInput);
  if (!spreadsheetId) {
    throw new Error('يرجى إدخال معرف أو رابط ملف Google Sheets صحيح.');
  }
  const fields = encodeURIComponent(
    'spreadsheetId,properties.title,spreadsheetUrl,sheets.properties(sheetId,title)'
  );
  const data = await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=${fields}`
  );
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || spreadsheetId,
    spreadsheetUrl:
      data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheets: Array.isArray(data.sheets)
      ? data.sheets.map((s: any) => ({
          sheetId: Number(s.properties?.sheetId ?? 0),
          title: String(s.properties?.title || ''),
        }))
      : [],
  };
}

export async function readSheetPreview(
  spreadsheetIdInput: string,
  sheetTitle: string
): Promise<string[][]> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdInput);
  const safeRange = `'${sheetTitle.replace(/'/g, "''")}'!A1:Z20`;
  const data = await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(safeRange)}`
  );
  return Array.isArray(data.values) ? data.values : [];
}

export async function createGoogleSpreadsheet(
  title: string,
  initialSheetTitles: string[]
): Promise<SpreadsheetMetadata> {
  const sheetsPayload =
    initialSheetTitles.length > 0
      ? initialSheetTitles.map((t) => ({ properties: { title: t } }))
      : [{ properties: { title: 'الحالات_CRM' } }];

  const data = await googleApiFetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: title.trim() || 'ETA CRM Report' },
      sheets: sheetsPayload,
    }),
  });

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || title,
    spreadsheetUrl:
      data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    sheets: Array.isArray(data.sheets)
      ? data.sheets.map((s: any) => ({
          sheetId: Number(s.properties?.sheetId ?? 0),
          title: String(s.properties?.title || ''),
        }))
      : [],
  };
}

export async function writeTabsToSpreadsheet(
  spreadsheetIdInput: string,
  tabs: SheetWriteTab[]
): Promise<{ spreadsheetUrl: string; updatedTabs: string[]; totalRows: number }> {
  const meta = await getSpreadsheetMetadata(spreadsheetIdInput);
  const existingTitles = new Set(meta.sheets.map((s) => s.title));
  const missingTabs = tabs.filter((t) => !existingTitles.has(t.title));

  if (missingTabs.length > 0) {
    await googleApiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(meta.spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: missingTabs.map((t) => ({
            addSheet: { properties: { title: t.title } },
          })),
        }),
      }
    );
  }

  const quoteTab = (title: string) => `'${title.replace(/'/g, "''")}'`;

  await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(meta.spreadsheetId)}/values:batchClear`,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: tabs.map((t) => quoteTab(t.title)),
      }),
    }
  );

  await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(meta.spreadsheetId)}/values:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: tabs.map((t) => ({
          range: `${quoteTab(t.title)}!A1`,
          majorDimension: 'ROWS',
          values: t.rows,
        })),
      }),
    }
  );

  const totalRows = tabs.reduce((sum, t) => sum + Math.max(0, t.rows.length - 1), 0);
  return {
    spreadsheetUrl: meta.spreadsheetUrl,
    updatedTabs: tabs.map((t) => t.title),
    totalRows,
  };
}

export interface StaffStatForSheet {
  fullName: string;
  crmUser: string;
  roleLabel: string;
  totalHandled: number;
  openOwnedCount: number;
  totalClosed: number;
  closeRate: number;
}

export function buildReportSheetTabs(
  cases: Case[],
  staffStats?: StaffStatForSheet[],
  periodLabel?: string
): SheetWriteTab[] {
  const caseHeaders = [
    'رقم الحالة',
    'تاريخ التسجيل',
    'نوع المكالمة',
    'نوع الضريبة',
    'الخدمة',
    'الأولوية',
    'الحالة',
    'عنوان الحالة',
    'رقم التسجيل الضريبي',
    'اسم الممول',
    'اسم المتصل',
    'هاتف المتصل',
    'الوكيل المسجل',
    'المكلف الحالي',
    'ملاحظات الوكيل',
    'رد الوكيل',
    'رد الإدارة والدعم',
    'سبب الإغلاق',
  ];

  const caseRows = cases.map((c) => [
    c.caseId || c.id || '',
    c.createdAt ? new Date(c.createdAt).toLocaleString('ar-EG') : '',
    c.callType || '',
    c.taxType || '',
    c.serviceType || '',
    c.priority || '',
    c.status || '',
    c.title || '',
    c.taxRegistrationNumber || '',
    c.taxpayerName || '',
    c.callerName || '',
    c.callerPhone || '',
    c.createdByName || '',
    c.assignedToName || '',
    c.agentNotes || '',
    c.agentReply || '',
    c.managementReply || '',
    c.closeReason || '',
  ]);

  const tabs: SheetWriteTab[] = [
    {
      title: 'الحالات_CRM',
      rows: [caseHeaders, ...caseRows],
    },
  ];

  if (staffStats && staffStats.length > 0) {
    const kpiHeaders = [
      'الفترة',
      'اسم الموظف',
      'كود CRM',
      'الدور الوظيفي',
      'إجمالي الحالات',
      'قيد المتابعة',
      'الحالات المغلقة',
      'نسبة الإغلاق %',
    ];
    const kpiRows = staffStats.map((s) => [
      periodLabel || 'كافة الفترات',
      s.fullName,
      s.crmUser,
      s.roleLabel,
      s.totalHandled,
      s.openOwnedCount,
      s.totalClosed,
      s.closeRate,
    ]);
    tabs.push({
      title: 'مؤشرات_الأداء',
      rows: [kpiHeaders, ...kpiRows],
    });
  }

  return tabs;
}

export async function buildFullBackupSheetTabs(): Promise<{
  tabs: SheetWriteTab[];
  counts: { cases: number; users: number; taxpayers: number; callers: number };
}> {
  const [usersSnap, casesSnap, taxpayersSnap, callersSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'cases')),
    getDocs(collection(db, 'taxpayers')),
    getDocs(collection(db, 'callers')),
  ]);

  const users: User[] = [];
  usersSnap.forEach((d) => users.push({ id: d.id, ...(d.data() as Omit<User, 'id'>) }));

  const cases: Case[] = [];
  casesSnap.forEach((d) => cases.push({ id: d.id, ...(d.data() as Omit<Case, 'id'>) }));

  const taxpayers: Taxpayer[] = [];
  taxpayersSnap.forEach((d) => taxpayers.push({ id: d.id, ...(d.data() as Omit<Taxpayer, 'id'>) }));

  const callers: Caller[] = [];
  callersSnap.forEach((d) => callers.push({ id: d.id, ...(d.data() as Omit<Caller, 'id'>) }));

  const casesTab = buildReportSheetTabs(cases)[0];

  const usersRows: (string | number | boolean)[][] = [
    ['المعرف', 'اسم المستخدم / الرقم القومي', 'الاسم الكامل', 'كود CRM', 'الدور', 'المسمى الوظيفي', 'الحالة', 'تاريخ الإنشاء'],
    ...users.map((u) => [
      u.id || '',
      u.username || '',
      u.fullName || '',
      u.crmUser || '',
      u.role || '',
      u.jobTitle || '',
      u.status || '',
      u.createdAt || '',
    ]),
  ];

  const taxpayersRows: (string | number | boolean)[][] = [
    ['رقم التسجيل الضريبي', 'اسم الممول', 'نوع الضريبة', 'المدينة', 'النشاط', 'ملاحظات'],
    ...taxpayers.map((t) => [
      t.taxRegistrationNumber || t.id || '',
      t.name || '',
      t.taxType || '',
      t.city || '',
      t.activity || '',
      t.notes || '',
    ]),
  ];

  const callersRows: (string | number | boolean)[][] = [
    ['الاسم', 'الصفة', 'التصنيف', 'رقم التسجيل الضريبي', 'الرقم القومي', 'الهاتف الأساسي', 'الهاتف البديل', 'البريد الإلكتروني'],
    ...callers.map((c) => [
      c.name || '',
      c.title || '',
      c.classification || '',
      c.taxRegistrationNumber || '',
      c.nationalId || '',
      c.primaryPhone || '',
      c.secondaryPhone || '',
      c.email || '',
    ]),
  ];

  return {
    tabs: [
      casesTab,
      { title: 'الممولون', rows: taxpayersRows },
      { title: 'المتصلون', rows: callersRows },
      { title: 'المستخدمون', rows: usersRows },
    ],
    counts: {
      cases: cases.length,
      users: users.length,
      taxpayers: taxpayers.length,
      callers: callers.length,
    },
  };
}
