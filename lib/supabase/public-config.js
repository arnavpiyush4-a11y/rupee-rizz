// Read through an environment object so Next never freezes these values at build time.
// Return only the two public values that may be serialized to the browser.
export function publicConfig(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) throw Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in the runtime environment.');
  let parsed;
  try { parsed = new URL(url); } catch { throw Error('NEXT_PUBLIC_SUPABASE_URL must be an HTTP(S) URL without credentials.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw Error('NEXT_PUBLIC_SUPABASE_URL must be an HTTP(S) URL without credentials.');
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* Publishable keys are not JWTs. */ }
  if (key.startsWith('sb_secret_') || role === 'service_role')
    throw Error('A private Supabase key cannot be used as NEXT_PUBLIC configuration. Use the publishable or anon key.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && role !== 'anon')
    throw Error('Supabase public configuration requires a publishable key or a legacy anon JWT.');
  return { url, key };
}

// Optional deployment base URL used to build Supabase email redirect targets when
// the browser origin is not available. Must also be listed in the Supabase
// Redirect URLs allowlist (see docs/auth/AUTH_SETUP.md).
export function siteBaseUrl(env) {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
