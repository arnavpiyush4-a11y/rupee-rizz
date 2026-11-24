import test from 'node:test';
import assert from 'node:assert/strict';
import { publicConfig, runtimeConfig } from '../scripts/deploy/public-config.mjs';

const publicEnv = { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
const runtime = { ...publicEnv, RR_OCR_SIGNING_KEY: 'fixture-key-at-least-32-characters-long' };
const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.fixture`;

test('public runtime config requires settings, supports legacy anon and exposes only an allowlist', () => {
  assert.throws(() => publicConfig({}), /runtime environment/);
  assert.throws(() => publicConfig({ NEXT_PUBLIC_SUPABASE_URL: publicEnv.NEXT_PUBLIC_SUPABASE_URL }), /runtime environment/);
  assert.deepEqual(publicConfig(runtime), { url: publicEnv.NEXT_PUBLIC_SUPABASE_URL, key: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY });
  assert.equal(publicConfig({ NEXT_PUBLIC_SUPABASE_URL: publicEnv.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }).key, jwt('anon'));
  assert.equal(publicConfig({ ...runtime, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }).key, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  assert.deepEqual(publicConfig({ NEXT_PUBLIC_SUPABASE_URL: ` ${publicEnv.NEXT_PUBLIC_SUPABASE_URL}\n`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ` ${publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}\n` }), publicConfig(publicEnv));
});
test('public runtime config rejects private, malformed and placeholder keys without echoing values', () => {
  for (const key of ['sb_secret_fixture', ' sb_secret_fixture\n', jwt('service_role'), ` ${jwt('service_role')} `, jwt('authenticated'), 'example-key', '   ']) {
    assert.throws(() => publicConfig({ ...publicEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }), (error) => {
      assert.ok(!error.message.includes(key.trim()) || !key.trim());
      return /Supabase|runtime environment/.test(error.message);
    });
  }
  for (const url of ['file:///private', 'not-a-url', 'https://user:private@fixture.supabase.co'])
    assert.throws(() => publicConfig({ ...publicEnv, NEXT_PUBLIC_SUPABASE_URL: url }), /HTTP/);
});
test('container startup requires the receipt signing key and runtime public settings', () => {
  for (const key of [undefined, '', 'short']) assert.throws(() => runtimeConfig({ ...runtime, RR_OCR_SIGNING_KEY: key }), /RR_OCR_SIGNING_KEY/);
  assert.throws(() => runtimeConfig({ RR_OCR_SIGNING_KEY: runtime.RR_OCR_SIGNING_KEY }), /runtime environment/);
  assert.equal(runtimeConfig(runtime).RR_OCR_SIGNING_KEY, runtime.RR_OCR_SIGNING_KEY);
});
test('container binds all interfaces on the routed port with deployment-specific public values', () => {
  assert.equal(runtimeConfig(runtime).PORT, '80');
  const config = runtimeConfig({ ...runtime, PORT: '8080', HOSTNAME: 'container-id', NEXT_PUBLIC_SUPABASE_URL: 'https://another.supabase.co' });
  assert.equal(config.PORT, '8080'); assert.equal(config.HOSTNAME, '0.0.0.0');
  assert.equal(config.NEXT_PUBLIC_SUPABASE_URL, 'https://another.supabase.co');
  for (const port of ['0', '65536', '-1', 'not-a-port']) assert.throws(() => runtimeConfig({ ...runtime, PORT: port }), /PORT/);
});
