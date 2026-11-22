/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Case } from '../types';

export interface SparklineSeries {
  total: number[];
  open: number[];
  incoming: number[];
  closed: number[];
  completionRate: number[];
}

export interface TrendDelta {
  currentCount: number;
  previousCount: number;
  percentChange: number | null;
  label: string;
  direction: 'up' | 'down' | 'flat';
}

function isIncomingCase(c: Pick<Case, 'status'>): boolean {
  return (
    c.status === 'محولة للإدارة' ||
    c.status === 'محولة للدعم الفني' ||
    c.status === 'محولة للدعم التقني'
  );
}

function startOfLocalDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function buildDailySparklineSeries(
  cases: readonly Pick<Case, 'createdAt' | 'status'>[],
  days = 7,
  referenceDate: Date = new Date()
): SparklineSeries {
  const safeDays = Math.max(2, Math.min(30, Math.floor(days)));
  const todayStart = startOfLocalDayMs(referenceDate);
  const oneDayMs = 24 * 60 * 60 * 1000;

  const total = new Array<number>(safeDays).fill(0);
  const open = new Array<number>(safeDays).fill(0);
  const incoming = new Array<number>(safeDays).fill(0);
  const closed = new Array<number>(safeDays).fill(0);

  for (const c of cases) {
    const createdMs = new Date(c.createdAt).getTime();
    if (Number.isNaN(createdMs)) continue;
    const dayStart = startOfLocalDayMs(new Date(createdMs));
    const diffDays = Math.floor((todayStart - dayStart) / oneDayMs);
    if (diffDays < 0 || diffDays >= safeDays) continue;

    const bucketIndex = safeDays - 1 - diffDays;
    total[bucketIndex] += 1;
    if (c.status === 'مغلقة') {
      closed[bucketIndex] += 1;
    } else {
      open[bucketIndex] += 1;
    }
    if (isIncomingCase(c)) {
      incoming[bucketIndex] += 1;
    }
  }

  const completionRate = total.map((t, i) => (t > 0 ? Math.round((closed[i] / t) * 100) : 0));

  return { total, open, incoming, closed, completionRate };
}

export function computeTrendDelta(
  cases: readonly Pick<Case, 'createdAt' | 'status'>[],
  predicate: (c: Pick<Case, 'createdAt' | 'status'>) => boolean,
  windowDays = 7,
  referenceDate: Date = new Date()
): TrendDelta {
  const safeWindow = Math.max(1, Math.floor(windowDays));
  const nowMs = referenceDate.getTime();
  const windowMs = safeWindow * 24 * 60 * 60 * 1000;
  const currentStartMs = nowMs - windowMs;
  const previousStartMs = nowMs - windowMs * 2;

  let currentCount = 0;
  let previousCount = 0;

  for (const c of cases) {
    if (!predicate(c)) continue;
    const createdMs = new Date(c.createdAt).getTime();
    if (Number.isNaN(createdMs) || createdMs > nowMs) continue;
    if (createdMs >= currentStartMs) {
      currentCount += 1;
    } else if (createdMs >= previousStartMs) {
      previousCount += 1;
    }
  }

  if (previousCount === 0 && currentCount === 0) {
    return {
      currentCount: 0,
      previousCount: 0,
      percentChange: 0,
      label: '0%',
      direction: 'flat',
    };
  }

  if (previousCount === 0) {
    return {
      currentCount,
      previousCount: 0,
      percentChange: null,
      label: `+${currentCount}`,
      direction: 'up',
    };
  }

  const rawPct = ((currentCount - previousCount) / previousCount) * 100;
  const rounded = Math.round(rawPct * 10) / 10;
  const direction: 'up' | 'down' | 'flat' = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const sign = rounded > 0 ? '+' : '';

  return {
    currentCount,
    previousCount,
    percentChange: rounded,
    label: `${sign}${rounded}%`,
    direction,
  };
}

export function extractMaxCaseSequence(
  cases: readonly Pick<Partial<Case>, 'caseId'>[]
): number {
  let maxSeq = 0;
  for (const c of cases) {
    const raw = (c.caseId || '').trim();
    const match = raw.match(/CRM-(\d+)/i) || raw.match(/(\d+)$/);
    if (!match) continue;
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > maxSeq) {
      maxSeq = parsed;
    }
  }
  return maxSeq;
}
