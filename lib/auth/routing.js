// Single, testable place that decides which screen the app is allowed to show.
//
// Three rules matter more than the rest and are covered by regression tests:
//  1. a password reset in progress blocks every other transition, so verifying
//     the OTP (which establishes a session) cannot navigate the user away from
//     the "choose a new password" form;
//  2. a session that is still loading its profile is NOT an un-onboarded user;
//  3. a failed profile load is an error screen with a retry, not a sign-out and
//     not a trip back through onboarding.
import { PROFILE_STATUS } from './session.js';

export const PUBLIC_ROUTES = Object.freeze(['landing', 'auth', 'business-demo']);
export const PREAPP_ROUTES = Object.freeze(['landing', 'auth', 'consent', 'onboarding']);
export const APP_ROUTES = Object.freeze([
  'business',
  'dashboard',
  'receipts',
  'plan',
  'goals',
  'financial-health',
  'options',
  'before-you-borrow',
  'my-data',
  'report',
  'money-lab',
  'grow',
  'earn-radar',
]);

/**
 * @returns {{view: 'auth'|'business-demo'|'landing'|'consent'|'onboarding'|'app'|'loading'|'profile-error', route: string}}
 */
export function decideRoute({
  ready = false,
  uid = null,
  authFlow = 'none',
  consentActive = false,
  hasUserType = false,
  profileStatus = PROFILE_STATUS.IDLE,
  route = 'landing',
} = {}) {
  const current = typeof route === 'string' && route ? route : 'landing';

  // 1. Password recovery owns the screen until it finishes or is cancelled.
  if (authFlow === 'recovery') return { view: 'auth', route: 'auth' };

  if (!ready) return { view: 'loading', route: current };

  // 3. /me failed or timed out: keep the session, offer a retry.
  if (uid && profileStatus === PROFILE_STATUS.ERROR) return { view: 'profile-error', route: current };

  if (!uid) {
    const next = PUBLIC_ROUTES.includes(current) ? current : 'landing';
    const view = next === 'business-demo' ? 'business-demo' : next === 'auth' ? 'auth' : 'landing';
    return { view, route: next };
  }

  // Consent and onboarding are preserved exactly as before.
  if (!consentActive) return { view: 'consent', route: 'consent' };
  if (!hasUserType) return { view: 'onboarding', route: 'onboarding' };

  return { view: 'app', route: APP_ROUTES.includes(current) ? current : 'dashboard' };
}
