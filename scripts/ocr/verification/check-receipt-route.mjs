import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { unseal } from '../../../lib/ocr/provenance.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--access-only')) {
  console.error('Usage: node scripts/ocr/verification/check-receipt-route.mjs [--access-only]. Supply a private image only through RR_RECEIPT_REGRESSION_IMAGE.');
  process.exit(2);
}
const privateImage = process.env.RR_RECEIPT_REGRESSION_IMAGE;
const fixtureOwner = 'receipt-route-fixture-owner';
const fixtureAuthorization = 'Bearer receipt-route-fixture-token';
const previousKey = process.env.RR_OCR_SIGNING_KEY;
const previousFetch = globalThis.fetch;
let bundlePath;
let stage = 'loading verification dependencies';
let networkAttempts = 0;

try {
  let build;
  try { ({ build } = await import('esbuild')); }
  catch {
    console.error('Install the pinned verification dependencies first: npm install --prefix scripts/ocr/verification');
    process.exitCode = 2;
  }
  if (!build) process.exit(2);
  process.chdir(root);
  process.env.RR_OCR_SIGNING_KEY = randomBytes(32).toString('hex');
  globalThis.fetch = async () => {
    networkAttempts++;
    throw new Error('External network access is disabled by the receipt route fixture.');
  };
  const fixtureModule = `
    export function createRequestClient(request) {
      const authenticated = request.headers.get('authorization') === ${JSON.stringify(fixtureAuthorization)};
      const consented = request.headers.get('x-rr-fixture-consent') === 'granted';
      return {
        auth: { getUser: async () => authenticated
          ? { data: { user: { id: ${JSON.stringify(fixtureOwner)} } }, error: null }
          : { data: { user: null }, error: null } },
        from(table) {
          if (table !== 'consents') throw new Error('Unexpected database access in receipt route fixture.');
          const query = {
            select() { return query; },
            eq(field, value) {
              if (field === 'user_id' && value !== ${JSON.stringify(fixtureOwner)})
                throw new Error('Unexpected owner in consent fixture.');
              return query;
            },
            is() { return query; },
            async limit() { return { data: authenticated && consented ? [{ id: 'fixture-consent' }] : [] }; }
          };
          return query;
        }
      };
    }
  `;
  stage = 'bundling the actual API route';
  bundlePath = path.join(root, 'node_modules', `.rr-receipt-route-${randomUUID()}.cjs`);
  const bundle = await build({
    absWorkingDir: root,
    entryPoints: ['app/api/[[...path]]/route.js'],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'cjs',
    alias: { '@': root },
    outfile: bundlePath,
    write: false,
    logLevel: 'silent',
    plugins: [{
      name: 'fixture-supabase-auth-and-consent',
      setup(plugin) {
        plugin.onResolve({ filter: /(?:^@\/lib\/supabase\/request$|[/\\]lib[/\\]supabase[/\\]request(?:\.js)?$)/ }, () => ({
          path: 'receipt-auth-fixture', namespace: 'receipt-auth-fixture',
        }));
        plugin.onLoad({ filter: /.*/, namespace: 'receipt-auth-fixture' }, () => ({
          contents: fixtureModule, loader: 'js',
        }));
      },
    }],
  });
  await fs.writeFile(bundlePath, bundle.outputFiles[0].contents, { flag: 'wx' });
  const { POST } = require(bundlePath);
  const post = (body, { authenticated = true, consented = true } = {}) => POST(
    new Request('http://localhost/api/ocr/receipt', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authenticated ? { authorization: fixtureAuthorization } : {}),
        ...(consented ? { 'x-rr-fixture-consent': 'granted' } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: ['ocr', 'receipt'] }) },
  );

  stage = 'rejecting unauthenticated uploads';
  const anonymous = await post({}, { authenticated: false });
  assert.equal(anonymous.status, 401, 'Anonymous receipt upload must be rejected.');
  assert.equal((await anonymous.json()).code, 'no_auth');
  stage = 'rejecting uploads without consent';
  const noConsent = await post({}, { consented: false });
  assert.equal(noConsent.status, 403, 'Receipt upload without active consent must be rejected.');
  assert.equal((await noConsent.json()).code, 'consent_required');
  stage = 'rejecting invalid image data';
  const invalid = await post({ image: 'invalid-image' });
  assert.equal(invalid.status, 400, 'Malformed image data must be rejected.');
  assert.equal((await invalid.json()).code, 'bad_image');
  assert.equal(networkAttempts, 0, 'Access checks must not contact an external service.');
  console.log('Passed: actual receipt API rejects anonymous, unconsented and malformed uploads without network access.');

  if (args.includes('--access-only')) {
    console.log('Actual-image OCR was not run (--access-only).');
  } else if (!privateImage) {
    console.log('SKIP actual-image OCR: RR_RECEIPT_REGRESSION_IMAGE is unset.');
  } else {
    stage = 'reading the private regression image';
    const bytes = await fs.readFile(privateImage);
    const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    assert.ok(mime, 'Private regression fixture must be a supported image.');
    stage = 'recognizing the private image through the actual route';
    const response = await post({ image: `data:${mime};base64,${bytes.toString('base64')}`, language: 'en' });
    assert.equal(response.status, 200, 'Actual receipt route must return a successful scan.');
    const result = await response.json();
    assert.equal(result.mode, 'local', 'Fixture must exercise the local production OCR path.');
    const extraction = result.extraction;
    stage = 'checking extracted merchant, date and total';
    assert.equal(extraction.merchant, 'Trent Ltd.', 'Merchant must match the printed receipt.');
    assert.equal(extraction.date, '2026-08-31', 'Date must match the printed receipt.');
    assert.equal(extraction.total, 808, 'Paid total must match the printed receipt.');
    stage = 'checking each purchased item occurrence';
    const expectedItems = [
      ['MENS DENIM T-SHIRT STATEMENT', 399],
      ['MENS DENIM T-SHIRT STATEMENT', 399],
      ['CARRY BAG', 10],
    ];
    assert.deepEqual(extraction.items.map((item) => [item.name, item.price]), expectedItems,
      'Every printed product occurrence and its paid amount must match.');
    assert.equal(extraction.extraction_meta.verified, false, 'The scan must still require owner review.');
    stage = 'checking image- and owner-bound scan provenance';
    const origin = unseal(extraction.ticket, bytes, fixtureOwner);
    assert.ok(origin, 'The real route must sign the actual source image for the fixture owner.');
    assert.equal(origin.total, extraction.total);
    assert.deepEqual(origin.items.map((item) => [item.name, item.price]), expectedItems);
    assert.equal(unseal(extraction.ticket, bytes, 'different-fixture-owner'), null, 'Ticket must reject a different owner.');
    assert.equal(unseal(extraction.ticket, Buffer.from('different-fixture-image'), fixtureOwner), null, 'Ticket must reject a different image.');
    assert.equal(networkAttempts, 0, 'Receipt recognition must not contact an external service.');
    console.log('Passed: actual private receipt through production POST route, merchant/date/808 total, three product occurrences, source-bound ticket and zero external requests.');
  }
} catch (error) {
  // Raw assertion/FS errors can expose image paths or extracted private text.
  console.error(`Receipt route verification failed during ${stage}.`);
  if (typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) console.error(`Code: ${error.code}`);
  process.exitCode = 1;
} finally {
  globalThis.fetch = previousFetch;
  if (previousKey === undefined) delete process.env.RR_OCR_SIGNING_KEY;
  else process.env.RR_OCR_SIGNING_KEY = previousKey;
  if (bundlePath) await fs.unlink(bundlePath).catch(() => {});
}
