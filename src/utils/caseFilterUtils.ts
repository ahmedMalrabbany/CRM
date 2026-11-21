/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Case } from '../types';

export interface CaseFilterCriteria {
  status?: string;
  taxType?: string;
  callType?: string;
  serviceType?: string;
  priority?: string;
  datePreset?: 'today' | 'week' | 'month' | 'all';
  searchTerm?: string;
}

/**
 * Normalize Arabic & Latin text for forgiving search matching:
 * - Unifies Alef variants (أ/إ/آ -> ا)
 * - Unifies Alef Maqsura / Ya (ى -> ي)
 * - Unifies Taa Marbuta / Haa (ة -> ه)
 * - Strips Arabic diacritics/tashkeel and extra whitespace
 */
export function normalizeSearchText(value?: string | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchServiceName(
  targetService: string,
  candidateServices: string[]
): string | undefined {
  const normTarget = normalizeSearchText(targetService);
  if (!normTarget) return undefined;

  const exact = candidateServices.find((s) => normalizeSearchText(s) === normTarget);
  if (exact) return exact;

  const stripPrefix = (s: string) =>
    normalizeSearchText(s).replace(/^منظومه\s+/, '').trim();
  const bareTarget = stripPrefix(targetService);
  if (!bareTarget) return undefined;

  const byBare = candidateServices.find((s) => stripPrefix(s) === bareTarget);
  if (byBare) return byBare;

  return candidateServices.find((s) => {
    const ns = normalizeSearchText(s);
    return ns.includes(bareTarget) || bareTarget.includes(stripPrefix(s));
  });
}

export function filterCasesByCriteria(
  cases: Case[],
  criteria: CaseFilterCriteria
): Case[] {
  let result = [...cases];

  // Status
  const statusFilter = criteria.status || 'all';
  if (statusFilter !== 'all') {
    if (statusFilter === 'open') {
      result = result.filter((c) => c.status !== 'مغلقة');
    } else if (statusFilter === 'incoming') {
      result = result.filter(
        (c) =>
          c.status === 'محولة للإدارة' ||
          c.status === 'محولة للدعم الفني' ||
          c.status === 'محولة للدعم التقني'
      );
    } else if (statusFilter === 'محولة للدعم التقني' || statusFilter === 'محولة للدعم الفني') {
      result = result.filter(
        (c) => c.status === 'محولة للدعم التقني' || c.status === 'محولة للدعم الفني'
      );
    } else {
      result = result.filter((c) => c.status === statusFilter);
    }
  }

  // Tax Type
  if (criteria.taxType && criteria.taxType !== 'all') {
    const normTax = normalizeSearchText(criteria.taxType);
    result = result.filter((c) => normalizeSearchText(c.taxType) === normTax);
  }

  // Service Type
  if (criteria.serviceType && criteria.serviceType !== 'all') {
    const normSrv = normalizeSearchText(criteria.serviceType);
    result = result.filter((c) => normalizeSearchText(c.serviceType) === normSrv);
  }

  // Call Type
  if (criteria.callType && criteria.callType !== 'all') {
    const normCall = normalizeSearchText(criteria.callType);
    result = result.filter((c) => normalizeSearchText(c.callType) === normCall);
  }

  // Priority
  if (criteria.priority && criteria.priority !== 'all') {
    const normPri = normalizeSearchText(criteria.priority);
    result = result.filter((c) => normalizeSearchText(c.priority) === normPri);
  }

  // Date Preset
  const dateFilter = criteria.datePreset || 'all';
  if (dateFilter !== 'all') {
    const now = new Date();
    result = result.filter((c) => {
      const d = new Date(c.createdAt);
      if (Number.isNaN(d.getTime())) return false;
      if (dateFilter === 'today') {
        return (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      }
      if (dateFilter === 'week') {
        const w = new Date(now);
        w.setDate(now.getDate() - 7);
        return d >= w;
      }
      if (dateFilter === 'month') {
        const m = new Date(now);
        m.setMonth(now.getMonth() - 1);
        return d >= m;
      }
      return true;
    });
  }

  // Free Text Search
  if (criteria.searchTerm && criteria.searchTerm.trim()) {
    const rawQ = criteria.searchTerm.trim().replace(/^#/, '');
    const normQ = normalizeSearchText(rawQ);
    const tokens = normQ.split(' ').filter(Boolean);

    result = result.filter((c) => {
      const searchable = normalizeSearchText(
        [
          c.caseId,
          c.taxpayerName,
          c.taxRegistrationNumber,
          (c as unknown as { nationalId?: string }).nationalId,
          c.callerName,
          c.callerPhone,
          c.callerSecondaryPhone,
          c.title,
          c.rawTitle,
          c.serviceType,
          c.taxType,
          c.callType,
          c.agentNotes,
          c.agentReply,
          c.managementReply,
          c.assignedToName,
          c.createdByName,
          c.agentEmployeeName,
        ]
          .filter(Boolean)
          .join(' ')
      );
      if (searchable.includes(normQ)) return true;
      return tokens.length > 1 && tokens.every((tk) => searchable.includes(tk));
    });
  }

  return result;
}
