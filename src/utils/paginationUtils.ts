/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PaginationResult<T> {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
  items: T[];
}

export function paginateItems<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number
): PaginationResult<T> {
  const safePageSize = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 15;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const rawPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const currentPage = Math.min(totalPages, Math.max(1, rawPage));
  const startIndex = (currentPage - 1) * safePageSize;
  const endIndex = Math.min(totalItems, startIndex + safePageSize);

  return {
    totalItems,
    totalPages,
    currentPage,
    pageSize: safePageSize,
    startIndex,
    endIndex,
    items: items.slice(startIndex, endIndex),
  };
}
