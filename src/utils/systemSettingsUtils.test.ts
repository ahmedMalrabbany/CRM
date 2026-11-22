/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SYSTEM_SETTINGS,
  normalizeSystemSettings,
  validateSystemSettingsInput,
} from './systemSettingsUtils.ts';

test('normalizeSystemSettings clamps timeout between 5 and 120 minutes and defaults hotline', () => {
  assert.deepEqual(normalizeSystemSettings(undefined), DEFAULT_SYSTEM_SETTINGS);
  assert.deepEqual(
    normalizeSystemSettings({ hotline: ' 16395 ', sessionTimeoutMinutes: 2 }),
    { hotline: '16395', sessionTimeoutMinutes: 5 }
  );
  assert.deepEqual(
    normalizeSystemSettings({ hotline: '', sessionTimeoutMinutes: 500 }),
    { hotline: '16395', sessionTimeoutMinutes: 120 }
  );
});

test('validateSystemSettingsInput rejects out-of-range timeouts and empty hotlines', () => {
  const badHotline = validateSystemSettingsInput('1', '30');
  assert.equal(badHotline.valid, false);

  const badTimeout = validateSystemSettingsInput('16395', '2');
  assert.equal(badTimeout.valid, false);

  const ok = validateSystemSettingsInput('16395', '45');
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.normalized, { hotline: '16395', sessionTimeoutMinutes: 45 });
});
