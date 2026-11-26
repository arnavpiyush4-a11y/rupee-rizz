// RupeeRizz client API helper. Forwards the current Supabase access token as a Bearer header
// so the server can enforce RLS as the authenticated user.
'use client';
// Relative on purpose: keeps this module importable by `node --test` too, which
// is how the request-timeout behaviour below is regression-tested.
import { getBrowserSupabase } from './supabase/browser.js';

export async function getAccessToken() {
  try {
    const { data } = await getBrowserSupabase().auth.getSession();
    return data?.session?.access_token || null;
  } catch (e) { return null; }
}

/**
 * @param {string} path
 * @param {object} [options]
 * @param {string|null} [options.token] Already-known access token. Pass this when the
 *   caller just received the session (e.g. straight after verifyOtp) so the request does
 *   not have to re-enter `auth.getSession()`, which has to acquire @supabase/auth-js's
 *   internal lock at exactly the moment that flow is still releasing it.
 * @param {number} [options.timeoutMs] Abort the request after this long (0 = no limit,
 *   the default, so long-running endpoints such as receipt OCR are unaffected).
 */
export async function api(path, { method = 'GET', body, headers = {}, token = null, timeoutMs = 0 } = {}) {
  const authToken = token || await getAccessToken();

  const controller = timeoutMs > 0 && typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    // An aborted fetch is our own budget expiring, not a server answer: report it
    // as a timeout so callers can classify it and retry.
    if (controller?.signal?.aborted) {
      const timeout = new Error('request_timeout');
      timeout.code = 'timeout';
      throw timeout;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }

  let data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}
