/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailySparklineSeries,
  computeTrendDelta,
  extractMaxCaseSequence,
} from './analyticsUtils.ts';

test('buildDailySparklineSeries buckets real cases across 7 days from oldest to newest', () => {
  const ref = new Date('2026-05-10T15:00:00Z');
  const d0 = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 10, 0).toISOString();
  const d2 = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 2, 10, 0).toISOString();
  const old = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 12, 10, 0).toISOString();

  const cases = [
    { createdAt: d0, status: 'جديدة' as const },
    { createdAt: d0, status: 'محولة للإدارة' as const },
    { createdAt: d2, status: 'مغلقة' as const },
    { createdAt: old, status: 'مغلقة' as const },
  ];

  const series = buildDailySparklineSeries(cases, 7, ref);
  assert.deepEqual(series.total, [0, 0, 0, 0, 1, 0, 2]);
  assert.deepEqual(series.open, [0, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(series.incoming, [0, 0, 0, 0, 1 - 1, 0, 1]);
  assert.deepEqual(series.closed, [0, 0, 0, 0, 1, 0, 0]);
  assert.deepEqual(series.completionRate, [0, 0, 0, 0, 100, 0, 0]);
});

test('computeTrendDelta calculates accurate percentage changes and flat/zero baselines', () => {
  const ref = new Date('2026-05-10T12:00:00Z');
  const recent = new Date(ref.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  const prior = new Date(ref.getTime() - 10 * 24 * 3600 * 1000).toISOString();

  const deltaUp = computeTrendDelta(
    [
      { createdAt: recent, status: 'جديدة' },
      { createdAt: recent, status: 'جديدة' },
      { createdAt: recent, status: 'مغلقة' },
      { createdAt: prior, status: 'جديدة' },
      { createdAt: prior, status: 'مغلقة' },
    ],
    () => true,
    7,
    ref
  );
  assert.equal(deltaUp.currentCount, 3);
  assert.equal(deltaUp.previousCount, 2);
  assert.equal(deltaUp.percentChange, 50);
  assert.equal(deltaUp.label, '+50%');
  assert.equal(deltaUp.direction, 'up');

  const deltaEmpty = computeTrendDelta([], () => true, 7, ref);
  assert.equal(deltaEmpty.label, '0%');
  assert.equal(deltaEmpty.direction, 'flat');

  const deltaNew = computeTrendDelta(
    [{ createdAt: recent, status: 'مغلقة' }],
    (c) => c.status === 'مغلقة',
    7,
    ref
  );
  assert.equal(deltaNew.label, '+1');
  assert.equal(deltaNew.direction, 'up');
});

test('extractMaxCaseSequence finds highest numeric suffix cleanly', () => {
  assert.equal(
    extractMaxCaseSequence([
      { caseId: 'CRM-000004' },
      { caseId: 'CRM-000128' },
      { caseId: 'CRM-000099' },
      { caseId: '' },
    ]),
    128
  );
  assert.equal(extractMaxCaseSequence([]), 0);
});
