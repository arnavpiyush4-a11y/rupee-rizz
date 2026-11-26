// Auth session plumbing, deliberately free of React/Next imports so it can be
// exercised by `node --test` without a browser or a live Supabase project.
//
// Responsibilities:
//  * keep "session resolved" and "profile loaded" as two separate facts
//  * coalesce duplicate /me requests for the same account
//  * drop responses that belong to a previous identity (stale / cross-account)
//  * never let a network failure look like a sign-out

export const PROFILE_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

// Budget for a single /me request. Kept below the loader ceiling so a stalled
// request is reported as a timeout with a real code instead of hanging until the
// backstop fires.
export const PROFILE_REQUEST_TIMEOUT_MS = 8_000;

/**
 * Whether a failed profile load is worth one more automatic attempt.
 *
 * The failure this exists for is the one seen right after OTP verification: the
 * first /me fires while the freshly minted session is still being written and
 * propagated, so it can fail with a transport error, a 401 against a token that
 * is one refresh behind, or a stall on the auth lock. All of those clear within
 * a few hundred milliseconds and succeed on retry — which is exactly what users
 * were doing by hand on the "We could not load your profile" screen.
 *
 * A definitive answer (400/403/404 — bad request, no consent, missing row) is
 * not retried: repeating it would only delay the real message.
 */
export function isRetryableProfileError(error) {
  if (!error) return false;
  const code = String(error.code || '').toLowerCase();
  const status = Number(error.status || 0);
  if (code === 'timeout' || code === 'fetch_error' || code === 'network' || code === 'aborted') return true;
  if (error.name === 'TypeError') return true; // fetch() rejects with TypeError when offline
  return status === 401 || status === 408 || status === 425 || status === 429 || status >= 500;
}

// Only user-scoped, non-secret, device-local caches belong here.
// The Supabase session itself lives under `rr-sb-auth` and is owned by
// supabase-js: purging it here would fight the SDK's own token lifecycle.
export const USER_SCOPED_STORAGE_KEYS = Object.freeze([
  'rr_money_experiment_v1', // FinancialFutureLab experiment
  'rr_demo_profile', // onboarding demo preset marker
]);

/**
 * Remove user-specific locally cached values. Language (`rr_lang`) is a device
 * preference rather than account data and is restored from the profile, so it
 * is intentionally left alone.
 * @returns {string[]} the keys that were actually removed
 */
export function purgeUserScopedStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.removeItem !== 'function') return [];
  const removed = [];
  for (const key of USER_SCOPED_STORAGE_KEYS) {
    try {
      if (storage.getItem(key) !== null) {
        storage.removeItem(key);
        removed.push(key);
      }
    } catch {
      // Private mode / quota errors must never break sign-out.
    }
  }
  return removed;
}

/**
 * Coalescing, generation-guarded loader for the current user's profile.
 *
 * Every result carries the generation it was started in; the caller compares
 * `stale` (and the identity it asked for) before writing anything to state, so
 * a slow response for account A can never overwrite account B — or resurrect a
 * signed-out user.
 *
 * `retries` is opt-in: the loader itself performs one request and reports the
 * outcome unless a caller asks for automatic re-attempts of transient failures
 * (app/providers.js does, for the first /me after sign-in).
 */
export function createProfileLoader(fetchMe, { timeoutMs = 12_000, retries = 0, retryDelayMs = 400 } = {}) {
  let generation = 0;
  let inflight = null;

  /** Invalidate everything in flight (sign-out, account switch, retry). */
  function invalidate() {
    generation += 1;
    inflight = null;
  }

  /** One attempt, bounded by its own timer so a hung request cannot hold the splash. */
  function attemptOnce(gen) {
    return new Promise((resolve) => {
      let timer = null;
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        if (timer) { clearTimeout(timer); timer = null; }
        resolve(result);
      };
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const error = new Error('profile_load_timeout');
          error.code = 'timeout';
          settle({ status: 'error', error });
        }, timeoutMs);
        // No unref(): the timer is always cleared by `settle`, and leaving it
        // referenced keeps `node --test` from exiting mid-file on a hung request.
      }
      Promise.resolve().then(fetchMe).then(
        (data) => settle({ status: 'ready', data: data ?? null }),
        (error) => settle({ status: 'error', error }),
      );
    });
  }

  const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  function load(uid, { force = false } = {}) {
    if (!uid) return Promise.resolve({ uid: null, gen: generation, status: 'skipped', stale: false, data: null });
    if (!force && inflight && inflight.uid === uid) return inflight.promise;

    const gen = generation;
    const promise = (async () => {
      let outcome = null;
      for (let i = 0; i <= retries; i += 1) {
        // A sign-out or account switch while we were waiting makes further
        // attempts pointless: the result could not be applied anyway.
        if (gen !== generation) break;
        if (i > 0 && retryDelayMs > 0) await wait(retryDelayMs);
        if (gen !== generation) break;
        outcome = await attemptOnce(gen);
        if (outcome.status === 'ready' || !isRetryableProfileError(outcome.error)) break;
      }
      // A generation bump mid-attempt still resolves the promise; `stale` tells
      // the caller to throw the payload away.
      return { uid, gen, stale: gen !== generation, ...outcome };
    })();

    const entry = { uid, gen, promise };
    inflight = entry;
    promise.then(() => { if (inflight === entry) inflight = null; });
    return promise;
  }

  return {
    load,
    invalidate,
    get generation() { return generation; },
    get inflight() { return inflight; },
  };
}

/**
 * Single decision point for "may this /me response be written to state?".
 * A result is only applied when it belongs to the account that is current right
 * now and was started in the current generation.
 */
export function shouldApplyProfileResult({ result, requestedUid, currentUid }) {
  if (!result) return false;
  if (!requestedUid || requestedUid !== currentUid) return false;
  if (result.uid !== requestedUid) return false;
  if (result.stale) return false;
  return true;
}

/**
 * Whether the app can render a real screen yet.
 *
 * Session initialisation and profile loading are distinct: a resolved session
 * with the profile still loading must keep showing the splash rather than let
 * `app/page.js` mistake a missing `user_type` for "needs onboarding".
 */
export function isSessionReady({ sessionResolved, uid, profileStatus, authFlow = 'none' }) {
  if (authFlow === 'recovery') return true; // the reset form must never wait on app state
  if (!sessionResolved) return false;
  if (!uid) return true;
  return profileStatus === PROFILE_STATUS.READY || profileStatus === PROFILE_STATUS.ERROR;
}
