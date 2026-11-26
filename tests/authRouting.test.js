// MOCKED unit tests for route decisions (lib/auth/routing.js).
// Pure function, no network, no Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_ROUTES, PUBLIC_ROUTES, decideRoute } from '../lib/auth/routing.js';
import { PROFILE_STATUS } from '../lib/auth/session.js';

const signedIn = {
  ready: true,
  uid: 'user-1',
  consentActive: true,
  hasUserType: true,
  profileStatus: PROFILE_STATUS.READY,
};

test('login: an unauthenticated visitor sees the public routes only', () => {
  assert.equal(decideRoute({ ready: true, uid: null, route: 'landing' }).view, 'landing');
  assert.equal(decideRoute({ ready: true, uid: null, route: 'auth' }).view, 'auth');
  assert.equal(decideRoute({ ready: true, uid: null, route: 'business-demo' }).view, 'business-demo');

  // A protected route is redirected rather than rendered.
  const guarded = decideRoute({ ready: true, uid: null, route: 'receipts' });
  assert.equal(guarded.view, 'landing');
  assert.equal(guarded.route, 'landing');
});

test('session restoration: profile loading never produces the onboarding screen', () => {
  const loading = decideRoute({
    ready: false,
    uid: 'user-1',
    consentActive: false,
    hasUserType: false,
    profileStatus: PROFILE_STATUS.LOADING,
    route: 'landing',
  });
  assert.equal(loading.view, 'loading');

  // ready=false alone is enough to hold the splash, whatever the route says.
  const resolving = decideRoute({ ready: false, uid: null, route: 'receipts' });
  assert.equal(resolving.view, 'loading');
});

test('session restoration: a signed-in user sitting on "auth" lands in the app, not onboarding', () => {
  const decision = decideRoute({ ...signedIn, route: 'auth' });
  assert.equal(decision.view, 'app');
  assert.equal(decision.route, 'dashboard');
});

test('session restoration: consent and onboarding gates are preserved', () => {
  const needsConsent = decideRoute({ ...signedIn, consentActive: false, hasUserType: false, route: 'dashboard' });
  assert.equal(needsConsent.view, 'consent');
  assert.equal(needsConsent.route, 'consent');

  const needsOnboarding = decideRoute({ ...signedIn, hasUserType: false, route: 'dashboard' });
  assert.equal(needsOnboarding.view, 'onboarding');
  assert.equal(needsOnboarding.route, 'onboarding');
});

test('session restoration: a failed profile load offers a retry instead of onboarding or logout', () => {
  const decision = decideRoute({
    ...signedIn,
    consentActive: false,
    hasUserType: false,
    profileStatus: PROFILE_STATUS.ERROR,
    route: 'dashboard',
  });
  assert.equal(decision.view, 'profile-error');
  assert.notEqual(decision.view, 'onboarding');
  assert.notEqual(decision.view, 'landing');
});

test('recovery navigation: verifying the OTP cannot navigate away from the reset form', () => {
  // Session just established by verifyOtp, profile not loaded yet: without the
  // guard this would become 'consent'/'onboarding' and lose the password step.
  const midReset = decideRoute({
    ready: true,
    uid: 'user-1',
    authFlow: 'recovery',
    consentActive: false,
    hasUserType: false,
    profileStatus: PROFILE_STATUS.LOADING,
    route: 'consent',
  });
  assert.equal(midReset.view, 'auth');

  // Even a fully authenticated, fully onboarded account stays on the form while
  // a reset is in progress.
  const onboarded = decideRoute({ ...signedIn, authFlow: 'recovery', route: 'dashboard' });
  assert.equal(onboarded.view, 'auth');

  // Recovery wins over a profile error too: the user still needs to set a password.
  const errored = decideRoute({ ...signedIn, authFlow: 'recovery', profileStatus: PROFILE_STATUS.ERROR });
  assert.equal(errored.view, 'auth');

  // Once cancelled/completed, normal routing resumes.
  assert.equal(decideRoute({ ...signedIn, authFlow: 'none', route: 'dashboard' }).view, 'app');
});

test('business mode: an onboarded micro-entrepreneur keeps the business route', () => {
  const decision = decideRoute({ ...signedIn, route: 'business' });
  assert.equal(decision.view, 'app');
  assert.equal(decision.route, 'business');
});

test('app routes and public routes are stable and disjoint', () => {
  for (const route of APP_ROUTES) {
    assert.ok(decideRoute({ ...signedIn, route }).route === route, `${route} must stay reachable`);
    assert.ok(!PUBLIC_ROUTES.includes(route), `${route} is not a public route`);
  }
  assert.deepEqual(
    ['business', 'dashboard', 'receipts', 'plan', 'goals', 'financial-health', 'options', 'before-you-borrow', 'my-data', 'report', 'money-lab', 'grow', 'earn-radar'],
    [...APP_ROUTES],
  );
});
