/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateItems } from './paginationUtils.ts';

test('paginateItems clamps currentPage when list shrinks below current page', () => {
  const list = ['a', 'b', 'c', 'd'];
  const result = paginateItems(list, 5, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.currentPage, 2);
  assert.deepEqual(result.items, ['c', 'd']);
});

test('paginateItems handles empty list cleanly', () => {
  const result = paginateItems([], 3, 15);
  assert.equal(result.totalItems, 0);
  assert.equal(result.totalPages, 1);
  assert.equal(result.currentPage, 1);
  assert.deepEqual(result.items, []);
});

test('paginateItems handles invalid page and pageSize inputs safely', () => {
  const list = [1, 2, 3, 4, 5];
  const result = paginateItems(list, -2, 0);
  assert.equal(result.currentPage, 1);
  assert.equal(result.pageSize, 15);
  assert.deepEqual(result.items, [1, 2, 3, 4, 5]);
});
