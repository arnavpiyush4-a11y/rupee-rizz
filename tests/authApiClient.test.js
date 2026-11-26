// Regression tests for lib/apiClient.js — the two changes that remove the
// intermittent profile-load failure:
//
//  1. an explicitly supplied access token is used as-is, so /me does not have to
//     re-enter supabase-js's `auth.getSession()` (and its internal lock) at the
//     moment the OTP sign-in flow is still unwinding;
//  2. an opt-in timeout aborts a stalled request and reports `code: 'timeout'`
//     instead of letting it hang until the profile loader gives up.
//
// MOCKED: global fetch is stubbed. Nothing here talks to Supabase or the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../lib/apiClient.js';

function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => { globalThis.fetch = original; });
}

test('/me uses the token it was handed instead of asking supabase-js for a session', async () => {
  let seen = null;
  await withFetch(
    async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({ profile: null }) };
    },
    async () => {
      // No Supabase runtime configuration is present in this process, so any
      // attempt to resolve a session here would yield no token at all. The header
      // can only be correct if the supplied token was used directly.
      const data = await api('/me', { token: 'eyJ-supplied-token' });
      assert.deepEqual(data, { profile: null });
    },
  );

  assert.equal(seen.url, '/api/me');
  assert.equal(seen.init.headers.Authorization, 'Bearer eyJ-supplied-token');
});

test('a stalled request is aborted by its budget and reported as a timeout', async () => {
  await withFetch(
    (url, init) => new Promise((resolve, reject) => {
      // Mirror the platform: aborting the signal rejects the pending fetch.
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));
    }),
    async () => {
      await assert.rejects(
        () => api('/me', { token: 'eyJ-supplied-token', timeoutMs: 10 }),
        (error) => {
          assert.equal(error.code, 'timeout', 'classified as a retryable timeout, not a generic failure');
          return true;
        },
      );
    },
  );
});

test('a request without a budget is not aborted (long-running endpoints are unaffected)', async () => {
  let signal;
  await withFetch(
    async (url, init) => {
      signal = init.signal;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
    async () => { await api('/receipts'); },
  );

  assert.equal(signal, undefined, 'no signal is attached unless a timeout is requested');
});

test('HTTP failures keep their status and server code', async () => {
  await withFetch(
    async () => ({ ok: false, status: 403, json: async () => ({ error: 'Consent required', code: 'consent_required' }) }),
    async () => {
      await assert.rejects(
        () => api('/profile', { token: 'eyJ-supplied-token' }),
        (error) => {
          assert.equal(error.status, 403);
          assert.equal(error.code, 'consent_required');
          return true;
        },
      );
    },
  );
});
