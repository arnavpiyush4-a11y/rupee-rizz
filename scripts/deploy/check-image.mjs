import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const image = process.argv[2];
if (!image || image.startsWith('-')) throw Error('Usage: node scripts/deploy/check-image.mjs IMAGE_TAG');
const secret = randomBytes(32).toString('hex');
const env = { ...process.env, RR_OCR_SIGNING_KEY: secret };
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', env, timeout: 90000 }).trim();
const config = JSON.parse(docker(['image', 'inspect', image]))[0];
assert.ok(!(config.Config.Env || []).some((v) => /^(RR_OCR_SIGNING_KEY|TINYFISH_API_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY)=/.test(v)), 'Runtime secrets must not be image ENV values.');
assert.ok(!docker(['history', '--no-trunc', image]).includes(secret));
const missing = spawnSync('docker', ['run', '--rm', image], { encoding: 'utf8', timeout: 20000 });
assert.notEqual(missing.status, 0);
assert.match(missing.stderr, /RR_OCR_SIGNING_KEY/);
docker(['run', '--rm', '--entrypoint', 'node', image, '-e', `
  const fs=require('node:fs');
  if(fs.readdirSync('/app').some(n=>n.startsWith('.env'))) process.exit(1);
  const c=JSON.parse(fs.readFileSync('/app/container-public-config.json'));
  if(Object.keys(c).sort().join(',')!=='key,keyVariable,url') process.exit(1);
`]);

for (const port of [80, 8081]) {
  let id;
  try {
    id = docker(['run', '--rm', '-d', '-e', 'RR_OCR_SIGNING_KEY', '-e', `PORT=${port}`, '-p', `127.0.0.1::${port}`, image]);
    const address = docker(['port', id, `${port}/tcp`]);
    const base = `http://${address}`;
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`${base}/api/root`)).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'Standalone container did not start on its routed port.');
    assert.equal((await fetch(`${base}/api/ocr/receipt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
    if (port === 80) {
      const home = await fetch(base);
      assert.equal(home.status, 200);
      const html = await home.text();
      const asset = html.match(/\/_next\/static\/[^"'<> ]+\.js/)?.[0];
      assert.ok(asset, 'Home page must retain Next static assets.');
      assert.equal((await fetch(base + asset)).status, 200);
      assert.equal((await fetch(`${base}/ocr/sample-supplier.png`)).status, 200);
      const sample = await fetch(`${base}/api/demo/document`);
      assert.equal(sample.status, 200);
      const data = await sample.json();
      assert.equal(data.extraction.total, 44);
      assert.equal(data.extraction.extraction_meta.version, 'local-3');
      assert.equal(data.extraction.items[0].quantity, 2);
    }
    console.log(`Runtime image passed HTTP, authentication and routed port ${port} checks.`);
  } finally {
    if (id) docker(['stop', '--time', '30', id]);
  }
}
console.log(`Image verified: ${Math.round(config.Size / 1024 / 1024)} MiB uncompressed; no baked runtime secrets or env files.`);
