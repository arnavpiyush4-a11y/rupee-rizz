export function publicConfig(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) before building the container.');
  let parsed;
  try { parsed = new URL(url); } catch { throw Error('NEXT_PUBLIC_SUPABASE_URL must be an HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw Error('NEXT_PUBLIC_SUPABASE_URL must be an HTTP(S) URL.');
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* New publishable keys are not JWTs. */ }
  if (key.startsWith('sb_secret_') || role === 'service_role') throw Error('A private Supabase key cannot be used as NEXT_PUBLIC configuration. Use the publishable or anon key.');
  return { url, key, keyVariable: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY' };
}

export function runtimeConfig(env, built) {
  if (!env.RR_OCR_SIGNING_KEY || env.RR_OCR_SIGNING_KEY.length < 32)
    throw Error('RR_OCR_SIGNING_KEY is required at runtime and must contain at least 32 random characters. Configure it in the deployment environment, never in the Dockerfile.');
  const port = env.PORT || '80';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error('PORT must be an integer from 1 to 65535.');
  const suppliedKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if ((env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL !== built.url) || (suppliedKey && suppliedKey !== built.key))
    throw Error('Runtime public Supabase configuration differs from the browser build. Rebuild this image with the deployment environment public values.');
  return { ...env, PORT: port, HOSTNAME: '0.0.0.0', NEXT_PUBLIC_SUPABASE_URL: built.url, [built.keyVariable]: built.key };
}
