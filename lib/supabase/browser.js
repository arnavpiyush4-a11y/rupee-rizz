'use client';
// Browser Supabase client (singleton). Persistent session; handles email confirmation & password-recovery links in the URL.
import { createClient } from '@supabase/supabase-js';

let _client;
let _config;
export function getBrowserSupabase(config) {
  if (_client && config && (config.url !== _config.url || config.key !== _config.key))
    throw Error('Supabase public configuration changed after initialization. Reload the application.');
  if (!_client) {
    if (!config?.url || !config?.key) throw Error('Supabase runtime configuration must be supplied by the application layout before initialization.');
    _client = createClient(
      config.url,
      config.key,
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
    _config = { url: config.url, key: config.key };
  }
  return _client;
}
