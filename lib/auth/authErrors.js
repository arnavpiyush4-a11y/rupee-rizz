// Maps Supabase auth failures onto a small set of stable kinds plus user-safe
// wording. Raw provider messages are never surfaced: they can reveal whether an
// account exists, and some variants echo request material back to the client.

export const AUTH_ERROR_MESSAGES = Object.freeze({
  otp_rejected: 'That code is incorrect, has expired, or was already used. Request a new code.',
  rate_limited: 'Too many attempts just now. Please wait a moment and try again.',
  weak_password: 'Choose a stronger password (at least 6 characters).',
  same_password: 'Choose a password you have not used before.',
  session_missing: 'Your verified session has ended. Start the reset again to get a new code.',
  account_mismatch: 'That code belongs to a different account. Start the reset again.',
  email_not_confirmed: 'Please confirm your email first — check your inbox for the confirmation link or code.',
  invalid_credentials: 'Email or password is incorrect.',
  redirect_not_allowed: 'This link is not allowed for this app. Check the Supabase redirect URL configuration.',
  pkce_verifier_missing: 'Open the link in the same browser that requested it, or enter the 6-digit code instead.',
  network: 'We could not reach the server. Check your connection and try again.',
  timeout: 'The request took too long. Please try again.',
  unknown: 'Something went wrong. Please try again.',
});

/**
 * @returns {keyof typeof AUTH_ERROR_MESSAGES}
 */
export function classifyAuthError(error) {
  if (!error) return 'unknown';
  const code = String(error.code || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();
  const status = Number(error.status || error.statusCode || 0);
  const has = (needle) => message.includes(needle);

  // Transport-level failures first: they must never be shown as "wrong code".
  if (code === 'timeout' || has('timed out') || has('timeout')) return 'timeout';
  if (
    error.name === 'TypeError'
    || code === 'fetch_error'
    || has('failed to fetch')
    || has('networkerror')
    || has('network request failed')
    || has('load failed')
  ) return 'network';

  if (code === 'account_mismatch') return 'account_mismatch';
  if (code === 'same_password' || has('different from the old password')) return 'same_password';
  if (code === 'weak_password' || has('password should be') || has('weak password')) return 'weak_password';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429 || has('for security purposes')) return 'rate_limited';
  if (code === 'email_not_confirmed' || has('email not confirmed')) return 'email_not_confirmed';
  if (code === 'invalid_credentials' || has('invalid login credentials')) return 'invalid_credentials';
  if (code === 'redirect_to_not_allowed' || has('redirect_to') || has('redirect url')) return 'redirect_not_allowed';
  if (code === 'pkce_code_verifier_not_found' || has('code verifier')) return 'pkce_verifier_missing';
  if (code === 'session_not_found' || code === 'session_missing' || has('auth session missing') || has('no session')) return 'session_missing';

  // Wrong, expired and already-consumed one-time codes all come back from
  // Supabase as the same 403 (deliberately, to stop probing), so they share one
  // kind and one message that covers all three cases honestly.
  if (
    code === 'otp_expired'
    || code === 'otp_disabled'
    || code === 'otp_disabled_or_invalid'
    || has('token has expired or is invalid')
    || has('link is invalid or has expired')
    || has('invalid otp')
    || has('otp')
  ) return 'otp_rejected';

  return 'unknown';
}

/** User-facing wording for any auth error. Never throws. */
export function authErrorMessage(error) {
  return AUTH_ERROR_MESSAGES[classifyAuthError(error)] || AUTH_ERROR_MESSAGES.unknown;
}

/** True when Supabase refused the request because of its own send throttle. */
export function isRateLimited(error) {
  return classifyAuthError(error) === 'rate_limited';
}
