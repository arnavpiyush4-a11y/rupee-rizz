import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const image = process.argv[2];
const browserImage = process.argv[3] === '--browser-image' ? process.argv[4] : undefined;
if (!image || image.startsWith('-') || (process.argv.length > 3 && (!browserImage || browserImage.startsWith('-') || process.argv.length !== 5)))
  throw Error('Usage: node scripts/deploy/check-image.mjs IMAGE_TAG [--browser-image VERIFICATION_IMAGE_TAG]');
const secret = randomBytes(32).toString('hex');
const privateFeatureKey = randomBytes(32).toString('hex');
const env = { ...process.env, RR_OCR_SIGNING_KEY: secret, TINYFISH_API_KEY: privateFeatureKey };
const docker = (args, values = {}) => execFileSync('docker', args, { encoding: 'utf8', env: { ...env, ...values }, timeout: 90000 }).trim();
const config = JSON.parse(docker(['image', 'inspect', image]))[0];
assert.ok(!(config.Config.Env || []).some((v) => /^(NEXT_PUBLIC_SUPABASE_(?:URL|PUBLISHABLE_KEY|ANON_KEY)|RR_OCR_SIGNING_KEY|TINYFISH_API_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY)=/.test(v)), 'Public configuration and runtime secrets must not be image ENV values.');
assert.ok(!docker(['history', '--no-trunc', image]).includes(secret));

function failsStartup(args, values, message) {
  const result = spawnSync('docker', ['run', '--rm', ...args, image], { encoding: 'utf8', env: { ...env, ...values }, timeout: 20000 });
  assert.equal(result.error, undefined, 'Startup validation must exit instead of leaving a running server.');
  assert.notEqual(result.status, 0, 'Incomplete or private runtime configuration must fail startup.');
  assert.match(result.stderr, message);
  assert.ok(!result.stderr.includes(secret), 'Startup errors must not print the signing key.');
}
failsStartup([], {}, /RR_OCR_SIGNING_KEY/);
failsStartup(['-e', 'RR_OCR_SIGNING_KEY'], {}, /NEXT_PUBLIC_SUPABASE/);
failsStartup(['-e', 'RR_OCR_SIGNING_KEY', '-e', 'NEXT_PUBLIC_SUPABASE_URL'], { NEXT_PUBLIC_SUPABASE_URL: 'https://runtime-a.supabase.co' }, /NEXT_PUBLIC_SUPABASE/);
for (const key of ['sb_secret_test_only_private_fixture', `a.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.z`]) {
  failsStartup(['-e', 'RR_OCR_SIGNING_KEY', '-e', 'NEXT_PUBLIC_SUPABASE_URL', '-e', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'], {
    NEXT_PUBLIC_SUPABASE_URL: 'https://runtime-a.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  }, /private Supabase/);
}

docker(['run', '--rm', '--entrypoint', 'node', image, '-e', `
  const fs=require('node:fs');
  if(fs.readdirSync('/app').some(n=>n.startsWith('.env'))) process.exit(1);
  if(fs.existsSync('/app/container-public-config.json')) process.exit(1);
`]);
assert.match(docker(['run', '--rm', '--entrypoint', 'tesseract', image, '--version']), /tesseract 5\./);
const languages = docker(['run', '--rm', '--entrypoint', 'tesseract', image, '--list-langs']).split(/\r?\n/).map((line) => line.trim());
for (const language of ['eng', 'hin', 'ori']) assert.ok(languages.includes(language), `Missing Tesseract ${language} language pack.`);

// Synthetic test-only values: production startup has no public configuration defaults.
// Reuse this exact image for two environments to detect values baked into Next output.
const deployments = [
  { port: 80, url: 'https://runtime-a.supabase.co', key: 'sb_publishable_fixtureA', variable: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' },
  { port: 8081, url: 'https://runtime-b.supabase.co', key: `a.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.z`, variable: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
];
for (const deployment of deployments) {
  const { port, url, key, variable } = deployment;
  let id;
  try {
    id = docker(['run', '--rm', '-d', '-e', 'RR_OCR_SIGNING_KEY', '-e', 'TINYFISH_API_KEY', '-e', 'NEXT_PUBLIC_SUPABASE_URL', '-e', variable,
      ...(port === 80 ? [] : ['-e', `PORT=${port}`]), '-p', `127.0.0.1::${port}`, image], {
      NEXT_PUBLIC_SUPABASE_URL: url, [variable]: key,
    });
    const address = docker(['port', id, `${port}/tcp`]);
    const base = `http://${address}`;
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`${base}/api/root`)).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'Standalone container did not start on its routed port.');
    assert.match(docker(['logs', id]), /Verified native Tesseract and pinned/);
    assert.equal((await fetch(`${base}/api/ocr/receipt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('cache-control') || '', /no-store/);
    const html = await home.text();
    assert.ok(html.includes(url) && html.includes(key), 'SSR and hydration must receive this deployment\'s runtime public configuration.');
    for (const other of deployments.filter((item) => item !== deployment)) {
      assert.ok(!html.includes(other.url) && !html.includes(other.key), 'Configuration from another deployment must not be cached in HTML.');
    }
    assert.ok(!html.includes(secret) && !html.includes(privateFeatureKey), 'Only allowlisted public values may reach browser HTML.');
    const asset = html.match(/\/_next\/static\/[^"'<> ]+\.js/)?.[0];
    assert.ok(asset, 'Home page must retain Next static assets.');
    const assetResponse = await fetch(base + asset);
    assert.equal(assetResponse.status, 200);
    const assetText = await assetResponse.text();
    assert.ok(!assetText.includes(key) && !assetText.includes(secret), 'Runtime values must not be baked into immutable JavaScript.');
    if (port === 80) {
      assert.equal((await fetch(`${base}/ocr/sample-supplier.png`)).status, 200);
      const sample = await fetch(`${base}/api/demo/document`);
      assert.equal(sample.status, 200);
      const data = await sample.json();
      assert.equal(data.extraction.total, 44);
      assert.equal(data.extraction.extraction_meta.version, 'local-3');
      assert.equal(data.extraction.items[0].quantity, 2);
    }
    if (browserImage) {
      const script = fileURLToPath(new URL('../ocr/verification/check-runtime-browser.mjs', import.meta.url));
      console.log(docker(['run', '--rm', '--network', 'host', '--mount', `type=bind,src=${script},dst=/app/scripts/ocr/verification/check-runtime-browser.mjs,readonly`,
        '--entrypoint', 'node', browserImage, 'scripts/ocr/verification/check-runtime-browser.mjs', base]));
    }
    console.log(`Same runtime image passed public configuration, HTTP, authentication and routed port ${port} checks.`);
  } finally {
    if (id) docker(['stop', '--time', '30', id]);
  }
}
console.log(`Image verified: ${Math.round(config.Size / 1024 / 1024)} MiB uncompressed; native Tesseract/languages present, no baked public configuration, runtime secrets or env files.`);
