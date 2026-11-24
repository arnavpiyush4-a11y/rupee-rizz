// Server-side per-request Supabase client scoped to the END USER's access token so that
// Row Level Security is enforced as that user. NEVER uses the service_role key.
import { createClient } from '@supabase/supabase-js';
import { publicConfig } from './public-config.js';

export function createRequestClient(request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) return null;
  const { url, key } = publicConfig(process.env);
  return createClient(
    url,
    key,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}
