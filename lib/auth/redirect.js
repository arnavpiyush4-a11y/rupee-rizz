// Builds the `emailRedirectTo` / `redirectTo` value used by signup confirmation
// and password recovery emails. Getting this wrong is the single most common
// cause of "the link says it is invalid": whatever origin the user is actually
// on must be present in Supabase's Redirect URL allowlist.

/** Normalise a configured base URL, dropping paths/credentials. */
export function sanitizeBaseUrl(value) {
  if (!value) return null;
  let raw = String(value).trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;
  // `next dev --hostname 0.0.0.0` can surface 0.0.0.0 as the browser origin, which
  // is never a reachable redirect target; map it to loopback.
  if (parsed.hostname === '0.0.0.0' || parsed.hostname === '::') parsed.hostname = 'localhost';
  return parsed.origin;
}

/**
 * Prefer the origin the user's browser is really on (correct for both localhost
 * and production), falling back to the configured site URL when an origin is not
 * available (SSR, or a plain node test).
 */
export function resolveAuthRedirect({ origin, siteUrl, path = '/auth/confirm' } = {}) {
  const base = sanitizeBaseUrl(origin) || sanitizeBaseUrl(siteUrl);
  if (!base) return undefined;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** Devices/environments where an absolute https URL cannot be derived. */
export function isLoopbackOrigin(url) {
  const base = sanitizeBaseUrl(url);
  if (!base) return false;
  try {
    const host = new URL(base).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}
