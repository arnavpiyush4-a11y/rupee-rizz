import assert from 'node:assert/strict';
import { TextDecoder, TextEncoder } from 'node:util';
import jsdom from 'jsdom';

const { JSDOM, requestInterceptor, VirtualConsole } = jsdom;

const target = new URL(process.argv[2] || 'http://127.0.0.1:8080');
if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
  throw Error('Usage: node scripts/ocr/verification/check-runtime-browser.mjs http://127.0.0.1:PORT (local test container only)');
}
const pageErrors = [], blockedRequests = [], demoResponses = [];
const localUrl = (value) => {
  const url = new URL(typeof value === 'string' ? value : value.url || value.href, target);
  if (url.origin !== target.origin) {
    blockedRequests.push(url.origin);
    throw Error('External network access is disabled by the runtime hydration fixture.');
  }
  return url;
};
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  // jsdom does not provide browser layout/CSS rendering. Script failures still fail.
  if (error.type !== 'css-parsing') pageErrors.push(error.message);
});
virtualConsole.on('error', (...args) => pageErrors.push(args.map(String).join(' ')));
let dom;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, label, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (predicate()) return;
    if (pageErrors.length) throw Error(`${label}: ${pageErrors.join('; ')}`);
    await pause(100);
  }
  throw Error(`Timed out waiting for ${label}. ${pageErrors.join('; ')}`);
}
try {
  dom = await JSDOM.fromURL(target.href, {
    resources: { interceptors: [requestInterceptor((request) => { localUrl(request.url); })] },
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
      window.ReadableStream = ReadableStream;
      window.Request = Request;
      window.Response = Response;
      window.Headers = Headers;
      window.fetch = async (input, options) => {
        const url = localUrl(input);
        const response = await fetch(url, { ...options, redirect: 'error' });
        if (url.pathname === '/api/demo/document') demoResponses.push(await response.clone().json());
        return response;
      };
      const open = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function (method, url, ...args) {
        return open.call(this, method, localUrl(url).href, ...args);
      };
      window.WebSocket = class {
        constructor(url) {
          blockedRequests.push(new URL(url, target).origin);
          throw Error('Sockets are disabled by the runtime hydration fixture.');
        }
      };
      window.matchMedia = (media) => ({ media, matches: media.includes('prefers-reduced-motion'), onchange: null,
        addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      // Canvas/font measurement is decorative and outside this hydration smoke test.
      window.HTMLCanvasElement.prototype.getContext = () => null;
      Object.defineProperty(window.document, 'fonts', { value: { check: () => false, ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} } });
      for (const method of ['mark', 'measure', 'clearMarks', 'clearMeasures']) window.performance[method] ||= () => {};
      for (const method of ['getEntriesByName', 'getEntriesByType']) window.performance[method] ||= () => [];
      window.addEventListener('error', (event) => pageErrors.push(event.message));
      window.addEventListener('unhandledrejection', (event) => pageErrors.push(String(event.reason)));
    },
  });
  const button = (text) => [...dom.window.document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
  await waitFor(() => button('See the demo'), 'production hydration and landing screen');
  assert.ok(!dom.window.document.querySelector('.rr-splash'), 'Hydration must leave the initial splash.');
  button('See the demo').click();
  await waitFor(() => button('Scan sample with local OCR'), 'business demo navigation');
  button('Scan sample with local OCR').click();
  await waitFor(() => demoResponses.length > 0, 'native demo OCR response', 30000);
  assert.equal(demoResponses[0].extraction.total, 44);
  assert.equal(demoResponses[0].extraction.items[0].quantity, 2);
  await pause(100);
  assert.deepEqual(pageErrors, [], 'Production browser scripts must hydrate without JavaScript errors.');
  assert.deepEqual(blockedRequests, [], 'Anonymous landing and local demo must not attempt external requests.');
  console.log('Passed: actual production Next scripts hydrated runtime configuration, left the splash, navigated to business demo and scanned total 44 without external network access.');
} finally {
  dom?.window.close();
}
