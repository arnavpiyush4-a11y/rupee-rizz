import test from 'node:test';
import assert from 'node:assert/strict';
import { publicConfig, runtimeConfig } from '../scripts/deploy/public-config.mjs';

const built = publicConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-fixture' });
const runtime = { RR_OCR_SIGNING_KEY: 'fixture-key-at-least-32-characters-long' };

test('container build requires public Supabase settings and supports legacy anon configuration', () => {
  assert.throws(() => publicConfig({}), /before building/);
  assert.equal(publicConfig({ NEXT_PUBLIC_SUPABASE_URL: built.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }).keyVariable, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  assert.throws(() => publicConfig({ NEXT_PUBLIC_SUPABASE_URL: 'file:///private', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'x' }), /HTTP/);
});
test('container build rejects service-role and secret keys from browser configuration', () => {
  for (const key of ['sb_secret_fixture', `a.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.z`])
    assert.throws(() => publicConfig({ NEXT_PUBLIC_SUPABASE_URL: built.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }), /private Supabase/);
});
test('container startup requires the same signing-key rule as receipt provenance', () => {
  for (const key of [undefined, '', 'short']) assert.throws(() => runtimeConfig({ RR_OCR_SIGNING_KEY: key }, built), /RR_OCR_SIGNING_KEY/);
  assert.equal(runtimeConfig(runtime, built).RR_OCR_SIGNING_KEY, runtime.RR_OCR_SIGNING_KEY);
});
test('container binds all interfaces on the routed port and restores only baked public values', () => {
  assert.equal(runtimeConfig(runtime, built).PORT, '80');
  const config = runtimeConfig({ ...runtime, PORT: '8080', HOSTNAME: 'container-id' }, built);
  assert.equal(config.PORT, '8080'); assert.equal(config.HOSTNAME, '0.0.0.0');
  assert.equal(config.NEXT_PUBLIC_SUPABASE_URL, built.url);
  assert.equal(config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, built.key);
  for (const port of ['0', '65536', '-1', 'not-a-port']) assert.throws(() => runtimeConfig({ ...runtime, PORT: port }, built), /PORT/);
});
test('container cannot silently switch the runtime Supabase project under a baked browser build', () => {
  assert.throws(() => runtimeConfig({ ...runtime, NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }, built), /Rebuild/);
  assert.throws(() => runtimeConfig({ ...runtime, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'other' }, built), /Rebuild/);
});
