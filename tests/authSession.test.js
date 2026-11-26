// MOCKED unit tests for the auth session plumbing (lib/auth/session.js).
// These exercise the state machine with fake loaders — they do NOT talk to
// Supabase. See tests/authRecovery.test.js header for the integration boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_STATUS,
  USER_SCOPED_STORAGE_KEYS,
  createProfileLoader,
  isSessionReady,
  purgeUserScopedStorage,
  shouldApplyProfileResult,
} from '../lib/auth/session.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    keys: () => [...map.keys()],
  };
}

test('login/session restoration: concurrent profile loads for one account issue a single request', async () => {
  let calls = 0;
  const loader = createProfileLoader(async () => { calls += 1; return { profile: { user_type: 'student' } }; });

  const [first, second] = await Promise.all([loader.load('user-1'), loader.load('user-1')]);

  assert.equal(calls, 1, 'duplicate /me requests must be coalesced');
  assert.equal(first.data, second.data);
  assert.equal(first.status, 'ready');
  assert.equal(first.stale, false);
});

test('session restoration: coalescing is per in-flight request and forced refreshes still go out', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const loader = createProfileLoader(async () => { calls += 1; await gate; return { profile: null }; });

  const first = loader.load('user-1');
  await new Promise((resolve) => setTimeout(resolve, 0)); // let the request start
  assert.equal(calls, 1);

  const second = loader.load('user-1');
  assert.equal(calls, 1, 'a second load while one is in flight must reuse it');

  const forced = loader.load('user-1', { force: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2, 'an explicit refresh is never suppressed');

  release();
  await Promise.all([first, second, forced]);
});

test('session restoration: repeated sequential loads are prevented by the identity guard, not the loader', async () => {
  let calls = 0;
  const loader = createProfileLoader(async () => { calls += 1; return { profile: null }; });

  await loader.load('user-1');
  await loader.load('user-1'); // the loader cannot know this is a repeat...
  assert.equal(calls, 2);

  await loader.load('user-1', { force: true });
  assert.equal(calls, 3);
  // ...which is why app/providers.js only calls loadProfile on identity change;
  // the token-refresh events that fire repeatedly for the same account reach
  // the same-identity branch and issue no request at all.
});

test('stale account state: a response started before an account change is marked stale', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const loader = createProfileLoader(async () => { await gate; return { profile: { user_type: 'student' } }; });

  const pendingA = loader.load('account-a');
  loader.invalidate(); // sign-out or account switch
  const pendingB = loader.load('account-b');
  release();

  const a = await pendingA;
  const b = await pendingB;

  assert.equal(a.stale, true, 'account A response must not be applied after the switch');
  assert.equal(b.stale, false);
  assert.equal(a.uid, 'account-a');
  assert.equal(b.uid, 'account-b');
});

test('stale account state: an expired-generation result is refused at the apply boundary', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const loader = createProfileLoader(async () => { await gate; return { profile: { user_type: 'student' } }; });

  const pendingA = loader.load('account-a');
  loader.invalidate();
  const pendingB = loader.load('account-b');
  release();

  const a = await pendingA;
  const b = await pendingB;

  // Account B signed in: A's payload must be refused even though it arrived.
  assert.equal(shouldApplyProfileResult({ result: a, requestedUid: 'account-a', currentUid: 'account-b' }), false);
  assert.equal(shouldApplyProfileResult({ result: a, requestedUid: 'account-a', currentUid: 'account-a' }), false, 'still stale by generation');
  // Signed out: nothing may be restored.
  assert.equal(shouldApplyProfileResult({ result: b, requestedUid: 'account-b', currentUid: null }), false);
  assert.equal(shouldApplyProfileResult({ result: null, requestedUid: 'account-b', currentUid: 'account-b' }), false);
});

test('network failure: /me failing is reported as an error, not as a sign-out', async () => {
  const loader = createProfileLoader(async () => { throw Object.assign(new Error('failed to fetch'), { name: 'TypeError' }); });

  const result = await loader.load('user-1');

  assert.equal(result.status, 'error');
  assert.equal(result.stale, false, 'a failure must not invalidate the identity');
  assert.equal(result.uid, 'user-1');
  assert.equal(result.data, undefined);
  // The identity is still known: the caller decides to retry, it does not sign out.
  assert.equal(shouldApplyProfileResult({ result, requestedUid: 'user-1', currentUid: 'user-1' }), true);
});

test('network failure: a hung request times out instead of trapping the splash screen', async () => {
  const loader = createProfileLoader(() => new Promise(() => {}), { timeoutMs: 20 });

  const result = await loader.load('user-1');

  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'timeout');
});

test('retry after a failure succeeds once the network recovers', async () => {
  let attempt = 0;
  const loader = createProfileLoader(async () => {
    attempt += 1;
    if (attempt === 1) throw new Error('offline');
    return { profile: { user_type: 'micro_entrepreneur' }, consent: { active: true } };
  });

  const failed = await loader.load('user-1');
  assert.equal(failed.status, 'error');

  const retried = await loader.load('user-1', { force: true });
  assert.equal(retried.status, 'ready');
  assert.equal(retried.data.profile.user_type, 'micro_entrepreneur', 'business mode survives a retry');
});

test('session initialisation is distinct from profile loading (no premature onboarding)', () => {
  // Session not resolved yet -> keep showing the splash.
  assert.equal(isSessionReady({ sessionResolved: false, uid: null, profileStatus: PROFILE_STATUS.IDLE }), false);
  assert.equal(isSessionReady({ sessionResolved: false, uid: 'user-1', profileStatus: PROFILE_STATUS.IDLE }), false);

  // Session resolved, no account -> landing/auth is a real screen.
  assert.equal(isSessionReady({ sessionResolved: true, uid: null, profileStatus: PROFILE_STATUS.IDLE }), true);

  // Session resolved, profile still loading -> NOT ready, so app/page.js cannot
  // interpret a missing user_type as "needs onboarding".
  assert.equal(isSessionReady({ sessionResolved: true, uid: 'user-1', profileStatus: PROFILE_STATUS.LOADING }), false);

  // Profile loaded or failed -> renderable (routing shows error/retry on failure).
  assert.equal(isSessionReady({ sessionResolved: true, uid: 'user-1', profileStatus: PROFILE_STATUS.READY }), true);
  assert.equal(isSessionReady({ sessionResolved: true, uid: 'user-1', profileStatus: PROFILE_STATUS.ERROR }), true);

  // Recovery owns the screen immediately, even before the session is known.
  assert.equal(isSessionReady({ sessionResolved: false, uid: null, profileStatus: PROFILE_STATUS.IDLE, authFlow: 'recovery' }), true);
});

test('logout clears user-scoped cached data but never the Supabase session key', () => {
  const storage = memoryStorage({
    rr_money_experiment_v1: '{"saved":true}',
    rr_demo_profile: 'student',
    rr_lang: 'hi',
    'rr-sb-auth': '{"access_token":"secret"}',
  });

  const removed = purgeUserScopedStorage(storage);

  assert.deepEqual(removed.sort(), [...USER_SCOPED_STORAGE_KEYS].sort());
  assert.equal(storage.getItem('rr_money_experiment_v1'), null);
  assert.equal(storage.getItem('rr_demo_profile'), null);
  // Device preference and the SDK-managed session token are left to their owners.
  assert.equal(storage.getItem('rr_lang'), 'hi');
  assert.equal(storage.getItem('rr-sb-auth'), '{"access_token":"secret"}');
  assert.deepEqual(purgeUserScopedStorage(storage), [], 'second purge is a no-op');
});

test('logout purge tolerates missing or broken storage', () => {
  assert.deepEqual(purgeUserScopedStorage(null), []);
  assert.deepEqual(purgeUserScopedStorage(undefined), []);
  assert.deepEqual(purgeUserScopedStorage({ getItem() { throw new Error('denied'); } }), []);
});
