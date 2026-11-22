import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTokenExpiryMs,
  isAccessTokenValid,
  formatGoogleOAuthError,
  parseDriveAboutUser,
} from './googleOAuthUtils';

test('computeTokenExpiryMs falls back to 3600s when missing or invalid', () => {
  const now = 1_700_000_000_000;
  assert.equal(computeTokenExpiryMs(undefined, now), now + 3_600_000);
  assert.equal(computeTokenExpiryMs(-10, now), now + 3_600_000);
  assert.equal(computeTokenExpiryMs('1800', now), now + 1_800_000);
});

test('isAccessTokenValid enforces non-empty token and 30s expiry buffer', () => {
  const now = 1_700_000_000_000;
  assert.equal(isAccessTokenValid(null, now + 120_000, now), false);
  assert.equal(isAccessTokenValid('', now + 120_000, now), false);
  assert.equal(isAccessTokenValid('ya29.valid', now + 29_000, now), false);
  assert.equal(isAccessTokenValid('ya29.valid', now + 60_000, now), true);
});

test('formatGoogleOAuthError maps GIS popup & consent errors to Arabic', () => {
  assert.match(formatGoogleOAuthError('popup_closed'), /إغلاق نافذة/);
  assert.match(formatGoogleOAuthError('popup_failed_to_open'), /النوافذ المنبثقة/);
  assert.match(formatGoogleOAuthError('access_denied'), /رفض منح صلاحيات/);
  assert.match(formatGoogleOAuthError('unknown_code', 'Token error'), /Token error/);
});

test('parseDriveAboutUser extracts user info and provides safe fallback', () => {
  assert.deepEqual(
    parseDriveAboutUser({
      user: {
        displayName: 'Ahmed Ragab',
        emailAddress: 'ahmed@example.com',
        photoLink: 'https://example.com/p.png',
      },
    }),
    {
      displayName: 'Ahmed Ragab',
      email: 'ahmed@example.com',
      photoURL: 'https://example.com/p.png',
    }
  );

  assert.deepEqual(parseDriveAboutUser(null), {
    displayName: 'حساب Google متصل',
    email: null,
    photoURL: null,
  });
});
