import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrowserSupabase } from '../lib/supabase/browser.js';
import { createRequestClient } from '../lib/supabase/request.js';
import { publicConfig } from '../lib/supabase/public-config.js';

test('browser and end-user server clients share runtime configuration and preserve auth behavior', () => {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    assert.throws(() => getBrowserSupabase(), /application layout/);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://runtime-a.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_runtime_a_fixture';
    const config = publicConfig(process.env);
    const browser = getBrowserSupabase(config);
    const server = createRequestClient(new Request('http://localhost/api/me', { headers: { authorization: 'Bearer end-user-fixture' } }));
    assert.equal(browser.supabaseUrl, config.url);
    assert.equal(browser.supabaseKey, config.key);
    assert.equal(server.supabaseUrl, browser.supabaseUrl);
    assert.equal(server.supabaseKey, browser.supabaseKey);
    assert.equal(server.headers.Authorization, 'Bearer end-user-fixture');
    assert.equal(browser.auth.persistSession, true);
    assert.equal(browser.auth.flowType, 'pkce');
    assert.equal(browser.auth.storageKey, 'rr-sb-auth');
    assert.equal(server.auth.persistSession, false);
    assert.equal(server.auth.autoRefreshToken, false);
    assert.equal(getBrowserSupabase(), browser);
    assert.equal(getBrowserSupabase({ ...config }), browser);
    assert.throws(() => getBrowserSupabase({ ...config, key: 'sb_publishable_other_fixture' }), /changed after initialization/);
    assert.throws(() => getBrowserSupabase({ ...config, url: 'https://runtime-b.supabase.co' }), /changed after initialization/);
    assert.equal(createRequestClient(new Request('http://localhost/api/me')), null);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://runtime-b.supabase.co';
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = `a.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.fixture`;
    const legacy = createRequestClient(new Request('http://localhost/api/me', { headers: { authorization: 'Bearer another-user' } }));
    assert.equal(legacy.supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(legacy.supabaseKey, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
