import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const cwd = process.cwd(),
  require = createRequire(cwd + '/package.json');
const base = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: { '@': cwd },
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.css': 'empty' },
  logLevel: 'silent',
};
await build({
  ...base,
  entryPoints: ['app/api/[[...path]]/route.js'],
  packages: 'external',
  outfile: 'node_modules/.rr-route.cjs',
});
const { GET, POST } = require(cwd + '/node_modules/.rr-route.cjs');
const call = (fn, method, path) =>
  fn(new Request('http://localhost/api/' + path.join('/'), { method }), {
    params: Promise.resolve({ path }),
  });
const anon = await call(POST, 'POST', ['ocr', 'receipt']);
assert.equal(anon.status, 401);
const live = await call(GET, 'GET', ['demo', 'document']);
assert.equal(live.status, 200);
const data = await live.json();
assert.equal(data.extraction.total, 44);
await build({
  ...base,
  entryPoints: ['components/rupee/views/BusinessDesk.js'],
  external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
  outfile: 'node_modules/.rr-view.cjs',
});
const dom = new JSDOM('<main></main>', { url: 'https://localhost' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.fetch = async (url) => {
  assert.equal(url, '/api/demo/document');
  return call(GET, 'GET', ['demo', 'document']);
};
for (const key of [
  'DocumentFragment',
  'MutationObserver',
  'Node',
  'HTMLElement',
  'HTMLInputElement',
  'CustomEvent',
  'Event',
  'HTMLSelectElement',
  'getComputedStyle',
])
  global[key] = dom.window[key];
const React = require('react'),
  { createRoot } = require('react-dom/client'),
  { BusinessDesk } = require(cwd + '/node_modules/.rr-view.cjs');
const root = createRoot(document.querySelector('main')),
  act = React.act;
await act(() =>
  root.render(
    React.createElement(BusinessDesk, { demo: true, onNav: () => {} }),
  ),
);
const click = async (text) =>
  act(async () => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === text,
    );
    assert.ok(btn && !btn.disabled, text);
    btn.click();
  });
await click('Scan sample with local OCR');
const checkbox = [...document.querySelectorAll('label')]
  .find((l) => l.textContent.includes('Indian rupees'))
  .querySelector('input');
await act(() => checkbox.click());
await click('Confirm and save');
const field = (name) =>
  [...document.querySelectorAll('label')]
    .find((l) => l.firstElementChild?.textContent === name)
    ?.querySelector('select');
const select = async (el, val) =>
  act(() => {
    el.value = val;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
const receipt = field('Receipt evidence');
await select(
  receipt,
  [...receipt.options].find((o) => o.textContent.includes('Market Grocery'))
    .value,
);
await select(field('Transaction'), 'purchase');
const lines = [...document.querySelectorAll('label')]
  .find((l) => l.textContent.includes('Post reviewed inventory lines'))
  .querySelector('input');
await act(() => lines.click());
await act(() =>
  document
    .querySelector('form')
    .dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    ),
);
assert.match(document.body.textContent, /Transaction recorded/);
await click('Stock & suppliers');
assert.match(document.body.textContent, /Market Grocery/);
assert.match(document.body.textContent, /2 units/);
await click('Evidence Passport');
let blob;
URL.createObjectURL = (b) => {
  blob = b;
  return 'blob:test';
};
window.HTMLAnchorElement.prototype.click = () => {};
await click('Download passport JSON');
const passport = JSON.parse(await blob.text());
assert.equal(passport.summary.coverage, 67);
assert.equal(passport.receipts.filter((r) => r.source_sha256).length, 1);
console.log(
  'Passed: real OCR demo API, anonymous denial, review form, receipt selection, purchase posting, stock and supplier views, passport export.',
);
assert.equal(passport.entries.length,3);
assert.equal(passport.summary.profit,6000);
assert.equal(passport.summary.cash,-54400);
await click('Export GST register');
const register=await blob.text();
assert.match(register,/"Market Grocery".*"44.00","4.00","40".*"2","2"/);
await click('Ledger');
await click('Settle by digital');
await click('Evidence Passport');
await click('Download passport JSON');
const settled=JSON.parse(await blob.text());
assert.equal(settled.summary.owed,0);
assert.equal(settled.summary.cash,-38400);
assert.equal(settled.summary.profit,6000);
assert.equal(settled.entries.length,3);
console.log('GST CSV and udhaar settlement reconciled to the passport without duplicate entries.');
