// Regression tests for the intermittent "We could not load your profile" screen
// seen immediately after OTP verification.
//
// That failure was always transient: the first /me fires while the freshly minted
// session is still being written, so it can lose to a transport error, a timeout,
// or a token that is one refresh behind — and then succeed on the retry the user
// performed by hand. These tests pin the automatic-retry contract that replaces
// that manual tap, and confirm the retry can never resurrect a signed-out account.
//
// MOCKED: no Supabase, no network. See tests/authRecovery.test.js for the
// integration boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_REQUEST_TIMEOUT_MS,
  createProfileLoader,
  isRetryableProfileError,
} from '../lib/auth/session.js';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

// The exact shape `fetch()` produces when the network is unavailable.
const networkError = () => Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' });
// An HTTP failure as lib/apiClient throws it.
const httpError = (status, code) => Object.assign(new Error(`Request failed (${status})`), { status, code });
const timeoutError = () => Object.assign(new Error('request_timeout'), { code: 'timeout' });

test('post-OTP race: a transient first failure is retried automatically instead of showing the error screen', async () => {
  let calls = 0;
  const loader = createProfileLoader(
    async () => {
      calls += 1;
      if (calls === 1) throw networkError();
      return { profile: { user_type: 'student' }, consent: { active: true } };
    },
    { retries: 1, retryDelayMs: 1 },
  );

  const result = await loader.load('user-1');

  assert.equal(calls, 2, 'exactly one extra attempt');
  assert.equal(result.status, 'ready');
  assert.equal(result.stale, false);
  assert.equal(result.data.profile.user_type, 'student', 'the recovered payload is applied');
});

test('post-OTP race: a token that is one refresh behind (401) is retried', async () => {
  let calls = 0;
  const loader = createProfileLoader(
    async () => {
      calls += 1;
      if (calls === 1) throw httpError(401, 'no_auth');
      return { profile: null };
    },
    { retries: 1, retryDelayMs: 1 },
  );

  const result = await loader.load('user-1');
  assert.equal(result.status, 'ready');
  assert.equal(calls, 2);
});

test('post-OTP race: a request that exceeds the budget is retried once, then surfaces as a timeout', async () => {
  let calls = 0;
  const loader = createProfileLoader(
    () => { calls += 1; return new Promise(() => {}); },
    { timeoutMs: 10, retries: 1, retryDelayMs: 1 },
  );

  const result = await loader.load('user-1');

  assert.equal(calls, 2, 'the stalled attempt is abandoned and retried once');
  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'timeout');
});

test('post-OTP race: a stalled first attempt recovers when the retry answers', async () => {
  let calls = 0;
  const loader = createProfileLoader(
    () => {
      calls += 1;
      if (calls === 1) return new Promise(() => {});
      return Promise.resolve({ profile: { user_type: 'micro_entrepreneur' } });
    },
    { timeoutMs: 15, retries: 1, retryDelayMs: 1 },
  );

  const result = await loader.load('user-1');

  assert.equal(result.status, 'ready');
  assert.equal(result.data.profile.user_type, 'micro_entrepreneur', 'business mode still loads');
});

test('a definitive answer is never retried (no consent, bad request, not found)', async () => {
  for (const [status, code] of [[400, 'bad_request'], [403, 'consent_required'], [404, 'not_found']]) {
    let calls = 0;
    const loader = createProfileLoader(
      async () => { calls += 1; throw httpError(status, code); },
      { retries: 1, retryDelayMs: 1 },
    );

    const result = await loader.load('user-1');

    assert.equal(calls, 1, `${status} must settle immediately`);
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, code, 'the real reason reaches the caller');
  }
});

test('sign-out during the retry backoff cancels further attempts and marks the result stale', async () => {
  let calls = 0;
  const loader = createProfileLoader(
    async () => { calls += 1; throw networkError(); },
    { retries: 3, retryDelayMs: 30 },
  );

  const pending = loader.load('user-1');
  await tick(); // first attempt has failed, we are inside the backoff
  loader.invalidate(); // sign-out / account switch

  const result = await pending;

  assert.equal(calls, 1, 'no request is issued after the identity was invalidated');
  assert.equal(result.stale, true, 'the caller must refuse to apply it');
});

test('retries keep the coalescing guarantee: concurrent loads still issue one logical sequence', async () => {
  let calls = 0;
  const loader = createProfileLoader(
    async () => {
      calls += 1;
      if (calls === 1) throw timeoutError();
      return { profile: null };
    },
    { retries: 1, retryDelayMs: 1 },
  );

  const [a, b] = await Promise.all([loader.load('user-1'), loader.load('user-1')]);

  assert.equal(a, b, 'the same promise is shared');
  assert.equal(calls, 2, 'one retry for the whole coalesced load, not one per caller');
});

test('an explicit retry (force) still works after the automatic attempts are exhausted', async () => {
  let attempt = 0;
  const loader = createProfileLoader(
    async () => {
      attempt += 1;
      if (attempt <= 2) throw networkError(); // first load: fail + retry both fail
      return { profile: { user_type: 'student' } };
    },
    { retries: 1, retryDelayMs: 1 },
  );

  const failed = await loader.load('user-1');
  assert.equal(failed.status, 'error', 'the budget is finite — the user still gets a retry button');

  const retried = await loader.load('user-1', { force: true });
  assert.equal(retried.status, 'ready');
  assert.equal(retried.data.profile.user_type, 'student');
});

test('isRetryableProfileError classifies real transport failures and nothing else', () => {
  assert.equal(isRetryableProfileError(timeoutError()), true);
  assert.equal(isRetryableProfileError(networkError()), true);
  assert.equal(isRetryableProfileError(httpError(401, 'no_auth')), true);
  assert.equal(isRetryableProfileError(httpError(500, undefined)), true);
  assert.equal(isRetryableProfileError(httpError(503, 'upstream')), true);
  assert.equal(isRetryableProfileError(httpError(429, 'rate_limited')), true);

  assert.equal(isRetryableProfileError(httpError(400, 'bad_request')), false);
  assert.equal(isRetryableProfileError(httpError(403, 'consent_required')), false);
  assert.equal(isRetryableProfileError(httpError(404, 'not_found')), false);
  assert.equal(isRetryableProfileError(null), false);
  assert.equal(isRetryableProfileError(undefined), false);
});

test('the /me budget leaves room under the loader ceiling', () => {
  // A request that stalls must be cut by its own timer (yielding a code the UI can
  // classify) before the loader backstop fires on the whole load.
  assert.ok(PROFILE_REQUEST_TIMEOUT_MS > 0);
  assert.ok(PROFILE_REQUEST_TIMEOUT_MS < 12_000, 'request budget must be below the loader ceiling');
});
