// Regression test for the signup confirmation banner layout bug.
//
// The banner read: "We sent a confirmation link and a 6-digit code to <email>.
// Confirm before logging in." — but the copy, the address and the trailing
// sentence were children of a `flex` container, so each one became its own flex
// item and they rendered as side-by-side columns instead of one flowing sentence.
// On a narrow screen the address also pushed the banner past the card edge.
//
// These are source-level assertions (the project has no DOM renderer, and JSX in
// .js files cannot be imported by `node --test`), guarded narrowly: they check the
// flex/`min-w-0` invariants that the bug turned on, not the exact wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authView = readFileSync(new URL('../components/rupee/views/AuthView.js', import.meta.url), 'utf8');
const banner = readFileSync(new URL('../components/rupee/SecurityAlertBanner.js', import.meta.url), 'utf8');

/** The JSX slice belonging to one banner, from its opening tag to its closing tag. */
function bannerBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `could not find the banner containing ${marker}`);
  const start = source.lastIndexOf('<SecurityAlertBanner', markerIndex);
  assert.notEqual(start, -1, 'could not find the banner opening tag');
  const end = source.indexOf('</SecurityAlertBanner>', markerIndex);
  assert.notEqual(end, -1, 'unterminated banner block');
  return source.slice(start, end);
}

test('signup confirmation banner keeps the message and the address in one flowing text run', () => {
  const block = bannerBlock(authView, 'We sent a confirmation link');

  // The icon may sit beside the text, but the sentence itself must be a single
  // element so its words wrap normally instead of forming columns.
  assert.match(block, /<MailCheck[^>]*\/>/, 'the mail icon is still shown');
  assert.match(
    block,
    /<span className="min-w-0">[\s\S]*We sent a confirmation link[\s\S]*\{email\}[\s\S]*Confirm before logging in\.[\s\S]*<\/span>/,
    'copy, {email} and the closing sentence must share one non-flex span',
  );

  // The bug: a flex *text* container makes each text node its own flex item, so
  // the copy and the address lay out as columns.
  assert.doesNotMatch(
    block,
    /className="flex[^"]*"[^>]*>\s*We sent a confirmation link/,
    'the sentence must not be a direct child of a flex container',
  );
});

test('the address is allowed to wrap instead of overflowing the card on mobile', () => {
  const block = bannerBlock(authView, 'We sent a confirmation link');
  assert.match(block, /className="min-w-0"/, 'the text column can shrink inside the flex row');
  // The shared banner provides the hard-stop wrapping for unbreakable strings.
  assert.match(
    banner,
    /className="[^"]*\bmin-w-0\b[^"]*"/,
    'the banner content column must be allowed to shrink',
  );
  assert.match(
    banner,
    /\[overflow-wrap:anywhere\]/,
    'a long unbroken token (an email address) must wrap rather than overflow',
  );
});

test('the recovery "code verified" banner uses the same inline pattern', () => {
  const block = bannerBlock(authView, 'Code verified for');
  assert.match(
    block,
    /<span className="min-w-0">[\s\S]*Code verified for[\s\S]*\{recoveryTarget\}[\s\S]*<\/span>/,
    'the recovery banner must not render its copy and address as separate columns',
  );
});
