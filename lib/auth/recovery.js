// Password recovery flow: a tiny state machine plus a session-scoped marker.
//
// The marker exists because a recovery link can land on a fresh page load where
// no React state survives. It stores only a phase name — never a token, code,
// email or credential — and lives in sessionStorage (cleared when the tab
// closes) rather than localStorage.

export const RECOVERY_STEP = Object.freeze({
  REQUEST: 'request',
  VERIFY: 'verify',
  SET_PASSWORD: 'setPassword',
  DONE: 'done',
});

export const RECOVERY_MARKER_KEY = 'rr_recovery_pending';
export const RECOVERY_PHASE = Object.freeze({ REQUESTED: 'requested', VERIFIED: 'verified' });

export function markRecoveryPending(storage, phase = RECOVERY_PHASE.REQUESTED) {
  const value = phase === RECOVERY_PHASE.VERIFIED ? RECOVERY_PHASE.VERIFIED : RECOVERY_PHASE.REQUESTED;
  try { storage?.setItem(RECOVERY_MARKER_KEY, value); } catch { /* ignore unavailable storage */ }
}

/** @returns {'requested'|'verified'|null} */
export function readRecoveryPhase(storage) {
  try {
    const value = storage?.getItem(RECOVERY_MARKER_KEY);
    if (value === RECOVERY_PHASE.VERIFIED) return RECOVERY_PHASE.VERIFIED;
    if (value === RECOVERY_PHASE.REQUESTED) return RECOVERY_PHASE.REQUESTED;
    return null;
  } catch {
    return null;
  }
}

export function clearRecoveryPending(storage) {
  try { storage?.removeItem(RECOVERY_MARKER_KEY); } catch { /* ignore */ }
}

export function initialRecoveryState({ step = RECOVERY_STEP.REQUEST, verified = false, email = '' } = {}) {
  return { step, verified, email, error: null, notice: null };
}

/**
 * Pure transition function. The important rule is `PASSWORD_FAILED`: once the
 * one-time code has been verified it is spent forever, so a failure to set the
 * password must keep the user on SET_PASSWORD with the verified session intact
 * instead of sending them back to a code they can no longer use.
 *
 * @param {ReturnType<typeof initialRecoveryState>} state
 * @param {{type: string, error?: string, email?: string}} event
 */
export function nextRecoveryState(state, event = {}) {
  const base = state || initialRecoveryState();
  switch (event.type) {
    case 'START':
      return initialRecoveryState({ email: event.email ?? base.email });
    case 'CODE_SENT':
      return { ...base, step: RECOVERY_STEP.VERIFY, verified: false, error: null, notice: 'code_sent' };
    case 'VERIFIED':
      return { ...base, step: RECOVERY_STEP.SET_PASSWORD, verified: true, error: null, notice: 'code_verified' };
    case 'VERIFY_FAILED':
      return { ...base, step: RECOVERY_STEP.VERIFY, verified: false, error: event.error || 'otp_rejected', notice: null };
    case 'PASSWORD_FAILED':
      return {
        ...base,
        step: base.verified ? RECOVERY_STEP.SET_PASSWORD : RECOVERY_STEP.VERIFY,
        error: event.error || 'unknown',
        notice: null,
      };
    case 'PASSWORD_UPDATED':
      return { ...base, step: RECOVERY_STEP.DONE, error: null, notice: 'password_updated' };
    case 'CANCEL':
      return initialRecoveryState();
    default:
      return base;
  }
}
