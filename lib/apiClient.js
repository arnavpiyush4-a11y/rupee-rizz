// RupeeRizz client API helper. Forwards the current Supabase access token as a Bearer header
// so the server can enforce RLS as the authenticated user.
'use client';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export async function getAccessToken() {
  try {
    const { data } = await getBrowserSupabase().auth.getSession();
    return data?.session?.access_token || null;
  } catch (e) { return null; }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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
