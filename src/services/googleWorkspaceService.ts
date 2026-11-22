/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import oauthClientConfig from '../../firebase-applet-config.json';
import { Case, User, Taxpayer, Caller } from '../types';
import { collection, getDocs } from '../lib/sheetsDb';
import {
  db,
  TARGET_SPREADSHEET_ID,
  TARGET_DETAILS_TAB,
  TARGET_SPREADSHEET_URL,
} from '../config/sheetsConfig';
import type {
  MappableCaseField,
  ResolvedDetailsSchema,
} from '../utils/sheetsDetailsMapper';
import {
  type GoogleWorkspaceUser,
  computeTokenExpiryMs,
  isAccessTokenValid,
  formatGoogleOAuthError,
  parseDriveAboutUser,
} from '../utils/googleOAuthUtils';

export {
  TARGET_SPREADSHEET_ID,
  TARGET_DETAILS_TAB,
  TARGET_SPREADSHEET_URL,
  type GoogleWorkspaceUser,
};

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface GisErrorResponse {
  type?: string;
  message?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleAccountsOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GisTokenResponse) => void;
    error_callback?: (error: GisErrorResponse) => void;
  }) => GisTokenClient;
  revoke?: (token: string, done?: () => void) => void;
}

function getGoogleOAuth2Api(): GoogleAccountsOAuth2 | null {
  const w = window as unknown as {
    google?: { accounts?: { oauth2?: GoogleAccountsOAuth2 } };
  };
  return w.google?.accounts?.oauth2 || null;
}

let gsiScriptPromise: Promise<GoogleAccountsOAuth2> | null = null;

function loadGoogleIdentityServices(): Promise<GoogleAccountsOAuth2> {
  const existing = getGoogleOAuth2Api();
  if (existing) return Promise.resolve(existing);

  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise<GoogleAccountsOAuth2>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src^="https://accounts.google.com/gsi/client"]'
    );

    const handleReady = () => {
      const api = getGoogleOAuth2Api();
      if (api) {
        resolve(api);
      } else {
        gsiScriptPromise = null;
        reject(new Error(formatGoogleOAuthError('gsi_load_failed')));
      }
    };

    const handleError = () => {
      gsiScriptPromise = null;
      reject(new Error(formatGoogleOAuthError('gsi_load_failed')));
    };

    if (existingScript) {
      // Wait briefly if script tag is already in DOM and still loading
      let checks = 0;
      const poll = window.setInterval(() => {
        const api = getGoogleOAuth2Api();
        if (api) {
          window.clearInterval(poll);
          resolve(api);
        } else if (++checks >= 60) {
          window.clearInterval(poll);
          gsiScriptPromise = null;
          reject(new Error(formatGoogleOAuthError('gsi_load_failed')));
        }
      }, 100);
      existingScript.addEventListener('error', () => {
        window.clearInterval(poll);
        handleError();
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = handleReady;
    script.onerror = handleError;
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

// Strictly in-memory token & user cache (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;
let cachedUser: GoogleWorkspaceUser | null = null;

type AuthListener = (user: GoogleWorkspaceUser | null, token: string | null) => void;
const authListeners = new Set<AuthListener>();

function notifyAuthListeners() {
  const valid = isAccessTokenValid(cachedAccessToken, cachedTokenExpiresAt);
  const token = valid ? cachedAccessToken : null;
  const user = valid ? cachedUser : null;
  authListeners.forEach((listener) => listener(user, token));
}

function clearInMemoryAuthSession() {
  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;
  cachedUser = null;
  notifyAuthListeners();
}

export function initGoogleWorkspaceAuth(
  onAuthSuccess?: (user: GoogleWorkspaceUser, token: string) => void,
  onAuthFailure?: () => void
): () => void {
  const listener: AuthListener = (user, token) => {
    if (user && token) {
      onAuthSuccess?.(user, token);
    } else {
      onAuthFailure?.();
    }
  };
  authListeners.add(listener);

  // Immediately emit current in-memory auth state
  if (isAccessTokenValid(cachedAccessToken, cachedTokenExpiresAt) && cachedAccessToken && cachedUser) {
    onAuthSuccess?.(cachedUser, cachedAccessToken);
  } else {
    onAuthFailure?.();
  }

  return () => {
    authListeners.delete(listener);
  };
}

async function fetchDriveUserProfile(accessToken: string): Promise<GoogleWorkspaceUser> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) {
      return parseDriveAboutUser(null);
    }
    const payload = await res.json();
    return parseDriveAboutUser(payload);
  } catch {
    return parseDriveAboutUser(null);
  }
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: GoogleWorkspaceUser;
  accessToken: string;
}> {
  const clientId = String(oauthClientConfig?.oAuthClientId || '').trim();
  if (!clientId) {
    throw new Error(formatGoogleOAuthError('invalid_client'));
  }

  const oauth2 = await loadGoogleIdentityServices();

  const tokenResult = await new Promise<{ accessToken: string; expiresIn?: number | string }>(
    (resolve, reject) => {
      let settled = false;
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES.join(' '),
        callback: (response: GisTokenResponse) => {
          if (settled) return;
          settled = true;
          if (response?.error || !response?.access_token) {
            reject(
              new Error(
                formatGoogleOAuthError(response?.error, response?.error_description)
              )
            );
            return;
          }
          resolve({
            accessToken: response.access_token,
            expiresIn: response.expires_in,
          });
        },
        error_callback: (err: GisErrorResponse) => {
          if (settled) return;
          settled = true;
          reject(new Error(formatGoogleOAuthError(err?.type, err?.message)));
        },
      });

      client.requestAccessToken({ prompt: 'consent' });
    }
  );

  cachedAccessToken = tokenResult.accessToken;
  cachedTokenExpiresAt = computeTokenExpiryMs(tokenResult.expiresIn);
  cachedUser = await fetchDriveUserProfile(tokenResult.accessToken);
  notifyAuthListeners();

  return { user: cachedUser, accessToken: cachedAccessToken };
}

export async function signOutGoogleWorkspace(): Promise<void> {
  const tokenToRevoke = cachedAccessToken;
  clearInMemoryAuthSession();
  if (tokenToRevoke) {
    try {
      const oauth2 = getGoogleOAuth2Api();
      oauth2?.revoke?.(tokenToRevoke, () => {});
    } catch {
      // ignore revoke failures on sign-out
    }
  }
}

export async function getGoogleWorkspaceAccessToken(): Promise<string | null> {
  if (!isAccessTokenValid(cachedAccessToken, cachedTokenExpiresAt)) {
    if (cachedAccessToken || cachedUser) {
      clearInMemoryAuthSession();
    }
    return null;
  }
  return cachedAccessToken;
}

export function getCurrentGoogleUser(): GoogleWorkspaceUser | null {
  if (!isAccessTokenValid(cachedAccessToken, cachedTokenExpiresAt)) {
    return null;
  }
  return cachedUser;
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
    clearInMemoryAuthSession();
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

async function backendSheetsFetch(path: string, init: RequestInit = {}): Promise<any> {
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

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    clearInMemoryAuthSession();
    const err: any = new Error('انتهت صلاحية جلسة Google، يرجى إعادة تسجيل الدخول بحساب Google.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Google Sheets Sync Error (${res.status})`);
  }
  return payload;
}

export interface DetailsTabInspectionResult {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SheetTabInfo[];
  detailsTabTitle: string;
  hasDetailsTab: boolean;
  headers: string[];
  rows: any[][];
  schema: ResolvedDetailsSchema;
  cases: Case[];
  rowNumbersByCaseId: Record<string, number>;
}

export interface DetailsTabSyncResult {
  ok: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  tabTitle: string;
  headers: string[];
  totalRows: number;
  schema: ResolvedDetailsSchema;
}

export async function fetchDetailsTabFromTargetSheet(
  spreadsheetIdInput: string = TARGET_SPREADSHEET_ID,
  tabName: string = TARGET_DETAILS_TAB,
  customFieldMap?: Record<string, MappableCaseField | ''>
): Promise<DetailsTabInspectionResult> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdInput) || TARGET_SPREADSHEET_ID;
  const params = new URLSearchParams({
    spreadsheetId,
    tabName: tabName || TARGET_DETAILS_TAB,
  });
  if (customFieldMap && Object.keys(customFieldMap).length > 0) {
    params.set('customMap', JSON.stringify(customFieldMap));
  }
  return backendSheetsFetch(`/api/sheets/details?${params.toString()}`);
}

export async function importDetailsCasesIntoAppStore(
  cases: Case[]
): Promise<{ ok: boolean; importedCount: number }> {
  const res = await fetch('/api/db/hydrate-cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cases }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'تعذر استيراد الحالات إلى قاعدة بيانات النظام.');
  }
  return data;
}

export async function syncCasesToDetailsTab(params: {
  spreadsheetId?: string;
  tabName?: string;
  cases: Case[];
  includeMissingColumns?: boolean;
  customFieldMap?: Record<string, MappableCaseField | ''>;
}): Promise<DetailsTabSyncResult> {
  const spreadsheetId = extractSpreadsheetId(params.spreadsheetId || '') || TARGET_SPREADSHEET_ID;
  return backendSheetsFetch('/api/sheets/details/sync', {
    method: 'POST',
    body: JSON.stringify({
      spreadsheetId,
      tabName: params.tabName || TARGET_DETAILS_TAB,
      cases: params.cases,
      includeMissingColumns: Boolean(params.includeMissingColumns),
      customFieldMap: params.customFieldMap,
    }),
  });
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
