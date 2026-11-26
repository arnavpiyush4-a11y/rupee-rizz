// MOCKED unit tests for the recovery / confirmation building blocks
// (lib/auth/authErrors.js, lib/auth/cooldown.js, lib/auth/redirect.js,
// lib/auth/recovery.js).
//
// INTEGRATION BOUNDARY — everything here is a pure function driven by fabricated
// Supabase-shaped error objects. Nothing in this file contacts Supabase, sends
// email or exchanges a real token, so these tests prove the *logic* is right,
// not that the project's SMTP/dashboard setup is. Real integration checks are
// listed as manual steps in docs/auth/AUTH_SETUP.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_ERROR_MESSAGES, authErrorMessage, classifyAuthError, isRateLimited } from '../lib/auth/authErrors.js';
import { createCooldown } from '../lib/auth/cooldown.js';
import { resolveAuthRedirect, sanitizeBaseUrl, isLoopbackOrigin } from '../lib/auth/redirect.js';
import {
  RECOVERY_MARKER_KEY,
  RECOVERY_PHASE,
  RECOVERY_STEP,
  clearRecoveryPending,
  initialRecoveryState,
  markRecoveryPending,
  nextRecoveryState,
  readRecoveryPhase,
} from '../lib/auth/recovery.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    raw: () => Object.fromEntries(map),
  };
}

// ---------------------------------------------------------------- OTP errors

test('OTP validation: wrong, expired and reused codes all produce one honest, generic message', () => {
  const wrong = { code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 };
  const expired = { code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 };
  const reused = { message: 'Token has expired or is invalid', status: 403 };

  for (const error of [wrong, expired, reused]) {
    assert.equal(classifyAuthError(error), 'otp_rejected');
    assert.equal(authErrorMessage(error), AUTH_ERROR_MESSAGES.otp_rejected);
  }
  // Never leak the raw provider text (it is identical for all three on purpose,
  // and it must not be the string the UI renders).
  assert.ok(!authErrorMessage(wrong).includes('Token has expired'));
});

test('OTP validation: provider throttling is recognised and not reported as a bad code', () => {
  const limited = { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.', status: 429 };
  assert.equal(classifyAuthError(limited), 'rate_limited');
  assert.equal(isRateLimited(limited), true);
  assert.equal(isRateLimited({ code: 'otp_expired' }), false);
});

test('OTP validation: password-update failures are classified separately from code failures', () => {
  assert.equal(classifyAuthError({ code: 'same_password', message: 'New password should be different from the old password.' }), 'same_password');
  assert.equal(classifyAuthError({ code: 'weak_password', message: 'Password should be at least 6 characters.' }), 'weak_password');
  assert.equal(classifyAuthError({ code: 'session_not_found', message: 'Auth session missing!' }), 'session_missing');
});

test('signup confirmation: PKCE device mismatch and unconfirmed email are distinguishable', () => {
  assert.equal(
    classifyAuthError({ message: 'PKCE code verifier not found in storage. This can happen if the user loaded the page in a different tab or browser for most auth flows.' }),
    'pkce_verifier_missing',
  );
  assert.equal(classifyAuthError({ code: 'email_not_confirmed', message: 'Email not confirmed' }), 'email_not_confirmed');
  assert.equal(classifyAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }), 'invalid_credentials');
});

test('network failures are never reported as a wrong password or a bad code', () => {
  assert.equal(classifyAuthError(Object.assign(new TypeError('Failed to fetch'))), 'network');
  assert.equal(classifyAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }), 'network');
  assert.equal(classifyAuthError({ code: 'timeout', message: 'profile_load_timeout' }), 'timeout');
  assert.equal(classifyAuthError(null), 'unknown');
  assert.equal(authErrorMessage({ something: 'unexpected' }), AUTH_ERROR_MESSAGES.unknown);
});

// ------------------------------------------------------------------ cooldown

test('resend cooldown: blocks for the full window then frees up', () => {
  let now = 1_000_000;
  const cooldown = createCooldown({ seconds: 60, now: () => now });

  assert.equal(cooldown.active(), false, 'no request yet');
  cooldown.start();
  assert.equal(cooldown.active(), true);
  assert.equal(cooldown.remaining(), 60);

  now += 30_000;
  assert.equal(cooldown.remaining(), 30);

  now += 30_000;
  assert.equal(cooldown.remaining(), 0);
  assert.equal(cooldown.active(), false);

  cooldown.reset();
  assert.equal(cooldown.active(), false);
});

// --------------------------------------------------------- redirect handling

test('signup/recovery redirects are valid for localhost and production', () => {
  assert.equal(
    resolveAuthRedirect({ origin: 'http://localhost:3000' }),
    'http://localhost:3000/auth/confirm',
  );
  assert.equal(
    resolveAuthRedirect({ origin: 'https://rupeerizz.vercel.app', siteUrl: 'https://ignored.example' }),
    'https://rupeerizz.vercel.app/auth/confirm',
    'the origin the browser is actually on wins over configuration',
  );
  assert.equal(
    resolveAuthRedirect({ origin: null, siteUrl: 'https://rupeerizz.vercel.app' }),
    'https://rupeerizz.vercel.app/auth/confirm',
    'falls back to NEXT_PUBLIC_SITE_URL when no origin is available',
  );
  assert.equal(resolveAuthRedirect({ origin: null, siteUrl: null }), undefined);
  assert.equal(resolveAuthRedirect({ origin: 'not a url', siteUrl: null }), undefined);
});

test('dev origins that a browser can never reach are normalised', () => {
  assert.equal(sanitizeBaseUrl('http://0.0.0.0:3000'), 'http://localhost:3000');
  assert.equal(sanitizeBaseUrl('http://localhost:3000/ignored/path'), 'http://localhost:3000');
  assert.equal(sanitizeBaseUrl('https://user:pass@example.com'), null, 'credentials are rejected');
  assert.equal(sanitizeBaseUrl('javascript:alert(1)'), null);
  assert.equal(isLoopbackOrigin('http://127.0.0.1:3000'), true);
  assert.equal(isLoopbackOrigin('https://rupeerizz.vercel.app'), false);
});

// ------------------------------------------------------- recovery state machine

test('recovery navigation: requested -> verified -> password step, never back to the code', () => {
  let state = initialRecoveryState();
  assert.equal(state.step, RECOVERY_STEP.REQUEST);

  state = nextRecoveryState(state, { type: 'CODE_SENT' });
  assert.equal(state.step, RECOVERY_STEP.VERIFY);
  assert.equal(state.verified, false);

  state = nextRecoveryState(state, { type: 'VERIFIED' });
  assert.equal(state.step, RECOVERY_STEP.SET_PASSWORD);
  assert.equal(state.verified, true);

  state = nextRecoveryState(state, { type: 'PASSWORD_UPDATED' });
  assert.equal(state.step, RECOVERY_STEP.DONE);
});

test('password-update failure after a successful OTP keeps the verified step (the code is spent)', () => {
  let state = nextRecoveryState(initialRecoveryState(), { type: 'CODE_SENT' });
  state = nextRecoveryState(state, { type: 'VERIFIED' });

  state = nextRecoveryState(state, { type: 'PASSWORD_FAILED', error: 'weak_password' });

  assert.equal(state.step, RECOVERY_STEP.SET_PASSWORD, 'must not send the user back to a consumed code');
  assert.equal(state.verified, true);
  assert.equal(state.error, 'weak_password');

  // Retrying the update without a code is a normal transition.
  state = nextRecoveryState(state, { type: 'PASSWORD_UPDATED' });
  assert.equal(state.step, RECOVERY_STEP.DONE);
});

test('a password failure before verification cannot skip the code step', () => {
  const state = nextRecoveryState(initialRecoveryState(), { type: 'PASSWORD_FAILED', error: 'unknown' });
  assert.equal(state.step, RECOVERY_STEP.VERIFY);
  assert.equal(state.verified, false);
});

test('a rejected code returns to the verify step with a retry, clearing the verified flag', () => {
  let state = nextRecoveryState(initialRecoveryState(), { type: 'VERIFIED' });
  state = nextRecoveryState(state, { type: 'VERIFY_FAILED', error: 'otp_rejected' });
  assert.equal(state.step, RECOVERY_STEP.VERIFY);
  assert.equal(state.verified, false);
  assert.equal(state.error, 'otp_rejected');
});

test('cancel resets the flow completely (safe cancellation)', () => {
  let state = nextRecoveryState(initialRecoveryState(), { type: 'VERIFIED' });
  state = nextRecoveryState(state, { type: 'CANCEL' });
  assert.deepEqual(state, initialRecoveryState());
});

// ------------------------------------------------------------ session marker

test('the recovery marker stores only a phase name — never a code, token or email', () => {
  const storage = memoryStorage();
  markRecoveryPending(storage, RECOVERY_PHASE.REQUESTED);
  assert.equal(readRecoveryPhase(storage), RECOVERY_PHASE.REQUESTED);

  markRecoveryPending(storage, RECOVERY_PHASE.VERIFIED);
  assert.equal(readRecoveryPhase(storage), RECOVERY_PHASE.VERIFIED);

  const raw = storage.raw();
  assert.deepEqual(Object.keys(raw), [RECOVERY_MARKER_KEY]);
  assert.equal(raw[RECOVERY_MARKER_KEY], 'verified');
  assert.ok(!/[A-Za-z0-9_-]{16,}/.test(raw[RECOVERY_MARKER_KEY]), 'value must not look like a token');
  assert.ok(!raw[RECOVERY_MARKER_KEY].includes('@'), 'value must not contain an email address');

  clearRecoveryPending(storage);
  assert.equal(readRecoveryPhase(storage), null);
});

test('the recovery marker degrades safely when storage is unavailable or tampered with', () => {
  assert.equal(readRecoveryPhase(null), null);
  assert.equal(readRecoveryPhase({ getItem() { throw new Error('denied'); } }), null);
  assert.doesNotThrow(() => markRecoveryPending({ setItem() { throw new Error('quota'); } }));
  assert.equal(readRecoveryPhase(memoryStorage({ [RECOVERY_MARKER_KEY]: 'otp=123456' })), null, 'only known phases are trusted');
});
