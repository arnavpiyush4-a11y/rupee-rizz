'use client';
// Browser Supabase client (singleton). Persistent session; handles email confirmation & password-recovery links in the URL.
import { createClient } from '@supabase/supabase-js';

let _client;
export function getBrowserSupabase() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storageKey: 'rr-sb-auth',
        },
      },
    );
  }
  return _client;
}
