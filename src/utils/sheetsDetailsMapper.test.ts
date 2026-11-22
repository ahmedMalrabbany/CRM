/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_SPREADSHEET_ID,
  TARGET_DETAILS_TAB,
  resolveDetailsColumnMappings,
  decodeDetailsRowsToCases,
  encodeCasesToDetailsRows,
  computeDetailsSyncDiff,
} from './sheetsDetailsMapper';
import type { Case } from '../types';

test('targets configured Spreadsheet ID and Details tab', () => {
  assert.equal(TARGET_SPREADSHEET_ID, '1HsxOPbasrVx1sWY7GSfkXy1IxLZp0xKPsLYS7yFDQoU');
  assert.equal(TARGET_DETAILS_TAB, 'Details');
});

test('resolves both English and Arabic column headers in Details tab', () => {
  const headers = [
    'Case ID',
    'Title',
    'رقم التسجيل الضريبي',
    'اسم الممول',
    'Phone',
    'Status',
    'Details',
    'Custom Column',
  ];

  const schema = resolveDetailsColumnMappings(headers);
  assert.equal(schema.fieldToColIndex.caseId, 0);
  assert.equal(schema.fieldToColIndex.title, 1);
  assert.equal(schema.fieldToColIndex.taxRegistrationNumber, 2);
  assert.equal(schema.fieldToColIndex.taxpayerName, 3);
  assert.equal(schema.fieldToColIndex.callerPhone, 4);
  assert.equal(schema.fieldToColIndex.status, 5);
  assert.equal(schema.fieldToColIndex.agentNotes, 6);
  assert.equal(schema.mappings[7].mappedField, null);
});

test('decodes Details tab rows into typed CRM Case objects', () => {
  const rows = [
    ['Case ID', 'Title', 'Tax Registration Number', 'Taxpayer Name', 'Caller Name', 'Phone', 'Status', 'Tax Type'],
    ['CRM-000105', 'استفسار فاتورة إلكترونية', '١٢٣٤٥٦٧٨٩', 'شركة النيل للتجارة', 'أحمد محمد علي', '٠١٠٠١٢٣٤٥٦٧', 'قيد المعالجة', 'ضرائب قيمة مضافة'],
  ];

  const decoded = decodeDetailsRowsToCases(rows);
  assert.equal(decoded.cases.length, 1);
  const c = decoded.cases[0];
  assert.equal(c.caseId, 'CRM-000105');
  assert.equal(c.title, 'استفسار فاتورة إلكترونية');
  assert.equal(c.taxRegistrationNumber, '123456789');
  assert.equal(c.callerPhone, '01001234567');
  assert.equal(c.status, 'قيد المعالجة');
  assert.equal(c.taxType, 'ضرائب قيمة مضافة');
  assert.equal(decoded.rowNumbersByCaseId[c.id], 2);
});

test('encodes Case records back to existing Details headers while preserving extra columns', () => {
  const existingHeaders = ['Case ID', 'Title', 'Status', 'Extra Notes'];
  const existingRows = [
    existingHeaders,
    ['CRM-000001', 'Old Title', 'جديدة', 'Preserve Me'],
  ];

  const sampleCase: Case = {
    id: 'CRM-000001',
    caseId: 'CRM-000001',
    callType: 'استفسار',
    taxType: 'ضرائب دخل',
    serviceType: 'الاقرارات الضريبية',
    channel: 'اتصال هاتفي',
    title: 'Updated Title',
    taxRegistrationNumber: '123456789',
    taxpayerName: 'شركة مصر',
    callerName: 'محمد حسن',
    callerPhone: '01011112222',
    status: 'مغلقة',
    priority: 'عادي',
    createdById: 'u1',
    createdByName: 'وكيل 1',
    createdByCrmUser: 'ETA_AGT_1',
    createdByRole: 'agent',
    createdAt: '2026-11-22T08:00:00.000Z',
    updatedAt: '2026-11-22T09:00:00.000Z',
  };

  const encoded = encodeCasesToDetailsRows([sampleCase], existingHeaders, existingRows);
  assert.deepEqual(encoded.headers, ['Case ID', 'Title', 'Status', 'Extra Notes']);
  assert.deepEqual(encoded.rows[1], ['CRM-000001', 'Updated Title', 'مغلقة', 'Preserve Me']);
});

test('computes accurate diff counts between local cases and sheet cases', () => {
  const mk = (caseId: string, isDeleted = false): Case => ({
    id: caseId,
    caseId,
    callType: 'طلب',
    taxType: 'ضرائب دخل',
    serviceType: 'أخرى',
    channel: 'اتصال هاتفي',
    title: caseId,
    taxRegistrationNumber: '123456789',
    taxpayerName: 'Test',
    callerName: 'Caller',
    callerPhone: '01000000000',
    status: 'جديدة',
    priority: 'عادي',
    createdById: 'u1',
    createdByName: 'Agent',
    createdByCrmUser: 'A1',
    createdByRole: 'agent',
    createdAt: '2026-11-22T00:00:00.000Z',
    updatedAt: '2026-11-22T00:00:00.000Z',
    isDeleted,
  });

  const diff = computeDetailsSyncDiff(
    [mk('CRM-000001'), mk('CRM-000002'), mk('CRM-000003', true)],
    [mk('CRM-000001'), mk('CRM-000099')]
  );

  assert.equal(diff.toUpdateCount, 1);
  assert.equal(diff.toAddCount, 1);
  assert.equal(diff.onlyInSheetCount, 1);
  assert.equal(diff.totalTargetRows, 2);
});
