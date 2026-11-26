'use client';

// RupeeRizz global client context: REAL Supabase auth (email/password + OTP recovery reset),
// plus profile / consent / language. Sessions persist via the Supabase browser client.
//
// Auth rules enforced here (see lib/auth/*.js for the testable pieces):
//  * the onAuthStateChange callback stays synchronous — @supabase/auth-js holds an
//    internal lock while running it, so any supabase call made inside it can deadlock;
//  * "session resolved" and "profile loaded" are separate pieces of state;
//  * profile responses are generation-guarded so a slow reply for one account can
//    never land on another account (or on a signed-out user);
//  * duplicate /me requests for the same account are coalesced;
//  * a network or /me failure is surfaced as a retry, never as a sign-out and never
//    as a trip back through onboarding.
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { api } from '@/lib/apiClient';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { classifyAuthError, isRateLimited } from '@/lib/auth/authErrors';
import { resolveAuthRedirect } from '@/lib/auth/redirect';
import { PROFILE_STATUS, PROFILE_REQUEST_TIMEOUT_MS, createProfileLoader, isSessionReady, purgeUserScopedStorage, shouldApplyProfileResult } from '@/lib/auth/session';
import {
  RECOVERY_PHASE,
  clearRecoveryPending,
  markRecoveryPending,
  readRecoveryPhase,
} from '@/lib/auth/recovery';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const browserStorage = (name) => (typeof window !== 'undefined' ? window[name] : null);

function identityOf(user) {
  if (!user) return null;
  return { id: user.id, email: user.email || null, name: user.user_metadata?.full_name || null };
}

function sameIdentity(a, b) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.email === b.email && a.name === b.name;
}

function authFailure(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

export function Providers({ children, supabaseConfig, siteUrl = null }) {
  const supabase = getBrowserSupabase(supabaseConfig);
  const [lang, setLangState] = useState('en');
  const [uid, setUid] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [consent, setConsent] = useState({ active: false, history: [] });
  const [profileStatus, setProfileStatus] = useState(PROFILE_STATUS.IDLE);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [authFlow, setAuthFlow] = useState('none'); // 'none' | 'recovery'
  const [recoveryStage, setRecoveryStage] = useState(RECOVERY_PHASE.REQUESTED);

  // Identity is tracked in a ref so the auth callback can compare against the
  // *current* account without being re-created (and re-subscribed) on every render.
  const identityRef = useRef({ uid: null, gen: 0 });
  const resolvedRef = useRef(false);
  const recoverySessionRef = useRef(false);
  // Bumped on every explicit sign-out so an already-queued auth event cannot
  // resurrect the session that sign-out just cleared.
  const signOutEpochRef = useRef(0);
  const applySessionRef = useRef(() => {});
  // The access token of the session we last applied. /me uses it directly instead
  // of asking supabase-js for the session again: right after verifyOtp that call
  // has to wait on the auth lock the sign-in flow is still unwinding, which is
  // what made the first profile load stall and surface as an error screen.
  const accessTokenRef = useRef(null);
  const loaderRef = useRef(null);
  if (!loaderRef.current) {
    loaderRef.current = createProfileLoader(
      () => api('/me', { timeoutMs: PROFILE_REQUEST_TIMEOUT_MS, token: accessTokenRef.current }),
      // One automatic retry for transient failures (transport error, timeout, a
      // token one refresh behind). A definitive 4xx is not retried.
      { timeoutMs: 12_000, retries: 1 },
    );
  }

  const markSessionResolved = useCallback(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setSessionResolved(true);
  }, []);

  const loadProfile = useCallback(async (targetUid, { force = false } = {}) => {
    if (!targetUid) return null;
    // Only show the loading gate before the first successful load; a background
    // refresh keeps the current screen instead of flashing the splash again.
    setProfileStatus((prev) => (prev === PROFILE_STATUS.READY ? prev : PROFILE_STATUS.LOADING));

    const result = await loaderRef.current.load(targetUid, { force });

    // Guard: anything that belongs to a previous identity (or a previous
    // generation of this one) is discarded rather than written to state.
    if (!shouldApplyProfileResult({ result, requestedUid: targetUid, currentUid: identityRef.current.uid })) return null;

    if (result.status !== 'ready' || !result.data) {
      setProfileStatus(PROFILE_STATUS.ERROR);
      return null;
    }

    const d = result.data;
    setUser(d.user || null);
    setProfile(d.profile || null);
    setConsent(d.consent || { active: false, history: [] });
    if (d.profile?.preferred_language) setLangState(d.profile.preferred_language);
    setProfileStatus(PROFILE_STATUS.READY);
    return d;
  }, []);

  const applySession = useCallback((session) => {
    const nextUid = session?.user?.id || null;
    const prev = identityRef.current;

    // Refresh the token even when the identity is unchanged: a TOKEN_REFRESHED
    // event replaces the access token without changing the account, and a later
    // /me must not be sent with the expired one.
    accessTokenRef.current = session?.access_token || null;

    if (nextUid === prev.uid) {
      // Same account: metadata may have changed (USER_UPDATED) but there is no
      // reason to re-fetch the profile, and nothing to clear.
      if (nextUid) {
        const next = identityOf(session.user);
        setUser((current) => (sameIdentity(current, next) ? current : next));
      }
      return;
    }

    identityRef.current = { uid: nextUid, gen: prev.gen + 1 };
    loaderRef.current.invalidate(); // drop every in-flight profile request

    // User-scoped caches must never survive a sign-out or an account change.
    // (Not on the very first sign-in of a page load — there is nothing stale yet,
    // and clearing would wipe a returning user's own local experiment data.)
    if (prev.uid !== null) {
      queryClient.clear();
      purgeUserScopedStorage(browserStorage('localStorage'));
    }

    setUser(nextUid ? identityOf(session.user) : null);
    setProfile(null);
    setConsent({ active: false, history: [] });
    setUid(nextUid);

    if (!nextUid) {
      setProfileStatus(PROFILE_STATUS.IDLE);
      recoverySessionRef.current = false;
      return;
    }

    setProfileStatus(PROFILE_STATUS.LOADING);
    loadProfile(nextUid);
  }, [loadProfile]);
  applySessionRef.current = applySession;

  const syncSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error) applySessionRef.current(data?.session ?? null);
    } catch {
      // Offline / transient: the queued auth event will reconcile state.
    }
    markSessionResolved();
  }, [supabase, markSessionResolved]);

  useEffect(() => {
    let disposed = false;

    try {
      const stored = window.localStorage.getItem('rr_lang');
      if (stored) setLangState(stored);
    } catch { /* storage unavailable */ }

    // A recovery link may already have been consumed in this tab: keep the reset
    // form in front of the user instead of letting the session route them away.
    const phase = readRecoveryPhase(browserStorage('sessionStorage'));
    if (phase) {
      setAuthFlow('recovery');
      setRecoveryStage(phase);
      recoverySessionRef.current = phase === RECOVERY_PHASE.VERIFIED;
    }

    // Never leave the app trapped on the splash screen when Supabase is slow or offline.
    const readyFallback = setTimeout(() => { if (!disposed) markSessionResolved(); }, 2500);
    const epochAtStart = signOutEpochRef.current;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (disposed) return;
        // A failed read means "could not check", not "signed out": never clear an
        // existing identity or the stored session from here.
        if (error) return;
        if (epochAtStart !== signOutEpochRef.current) return; // superseded by sign-out
        applySessionRef.current(data?.session ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!disposed) markSessionResolved(); });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Keep this callback synchronous. @supabase/auth-js serialises auth work
      // behind an internal lock that is held while subscribers run, so calling
      // getSession()/updateUser()/api() here is what causes the classic
      // "auth callback never returns" deadlock. Hop out of the task instead.
      const epochAtEvent = signOutEpochRef.current;
      setTimeout(() => {
        if (disposed) return;
        markSessionResolved();
        if (epochAtEvent !== signOutEpochRef.current) return; // a sign-out happened first
        if (event === 'PASSWORD_RECOVERY') {
          markRecoveryPending(browserStorage('sessionStorage'), RECOVERY_PHASE.VERIFIED);
          recoverySessionRef.current = true;
          setAuthFlow('recovery');
          setRecoveryStage(RECOVERY_PHASE.VERIFIED);
        }
        applySessionRef.current(session ?? null);
        markSessionResolved();
      }, 0);
    });

    return () => {
      disposed = true;
      clearTimeout(readyFallback);
      sub?.subscription?.unsubscribe?.();
    };
  }, [supabase, markSessionResolved]);

  const setLang = (l) => {
    setLangState(l);
    try { browserStorage('localStorage')?.setItem('rr_lang', l); } catch { /* ignore */ }
  };

  /** Force a fresh profile read for the current account (used after profile/consent edits). */
  const refresh = useCallback(async () => {
    const target = identityRef.current.uid;
    if (!target) return null;
    return loadProfile(target, { force: true });
  }, [loadProfile]);

  const authRedirectTo = useCallback(() => resolveAuthRedirect({
    origin: typeof window !== 'undefined' ? window.location.origin : null,
    siteUrl,
  }), [siteUrl]);

  // ---- Auth methods (Supabase) ----
  const signUpEmail = useCallback(async ({ name, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        // Confirmation links come back to the handler page so expired/invalid
        // links produce a real message instead of a silent landing page.
        emailRedirectTo: authRedirectTo(),
      },
    });
    if (error) throw error;
    // data.session is null whenever email confirmation is required (the default).
    return { user: data?.user ?? null, session: data?.session ?? null, needsConfirmation: !data?.session };
  }, [supabase, authRedirectTo]);

  const resendSignupConfirmation = useCallback(async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirectTo() },
    });
    if (error) throw error;
    return true;
  }, [supabase, authRedirectTo]);

  const confirmSignupOtp = useCallback(async ({ email, token }) => {
    // Six-digit token path: works on any device, unlike the PKCE `?code=` link
    // whose verifier only exists in the browser that started the signup.
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) throw error;
    await syncSession();
    return { session: data?.session ?? null };
  }, [supabase, syncSession]);

  const signInEmail = useCallback(async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Load the profile right away so an existing user is never shown onboarding
    // while the queued SIGNED_IN event is still pending. Coalescing keeps this to
    // a single /me request.
    await syncSession();
    return data;
  }, [supabase, syncSession]);

  const sendRecoveryCode = useCallback(async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectTo() });
      return { ok: true, limited: isRateLimited(error) };
    } catch (error) {
      return { ok: true, limited: isRateLimited(error) };
    }
  }, [supabase, authRedirectTo]);

  /**
   * Always resolves with a generic outcome: the UI must never reveal whether an
   * address has an account (enumeration).
   */
  const requestPasswordRecovery = useCallback(async (email) => {
    setAuthFlow('recovery');
    setRecoveryStage(RECOVERY_PHASE.REQUESTED);
    markRecoveryPending(browserStorage('sessionStorage'), RECOVERY_PHASE.REQUESTED);
    return sendRecoveryCode(email);
  }, [sendRecoveryCode]);

  const resendRecoveryCode = useCallback((email) => sendRecoveryCode(email), [sendRecoveryCode]);

  /** Retained for callers that used the original single-shot helper. */
  const resetPassword = useCallback(async (email) => {
    await requestPasswordRecovery(email);
  }, [requestPasswordRecovery]);

  const verifyRecoveryOtp = useCallback(async ({ email, token }) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    if (error) throw error;

    // Bind the new password to the account the code was requested for. Without
    // this, a code for account B pasted into account A's form would silently set
    // the password on B.
    const intended = String(email || '').trim().toLowerCase();
    const actual = String(data?.user?.email || '').trim().toLowerCase();
    if (intended && actual && intended !== actual) {
      try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* best effort */ }
      throw authFailure('account_mismatch');
    }

    recoverySessionRef.current = true;
    setAuthFlow('recovery');
    setRecoveryStage(RECOVERY_PHASE.VERIFIED);
    markRecoveryPending(browserStorage('sessionStorage'), RECOVERY_PHASE.VERIFIED);
    await syncSession();
    return { email: actual || intended || null };
  }, [supabase, syncSession]);

  /**
   * Runs only against a session that verifyOtp already established, so it can be
   * retried after a failure without asking for the (now consumed) one-time code.
   */
  const updateRecoveryPassword = useCallback(async (password) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session) throw authFailure('session_not_found');

    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    clearRecoveryPending(browserStorage('sessionStorage'));
    recoverySessionRef.current = false;
    setAuthFlow('none');
    setRecoveryStage(RECOVERY_PHASE.REQUESTED);
    await syncSession();
    return data?.user ?? null;
  }, [supabase, syncSession]);

  const verifyOtpAndSetPassword = useCallback(async ({ email, token, password }) => {
    await verifyRecoveryOtp({ email, token });
    return updateRecoveryPassword(password);
  }, [verifyRecoveryOtp, updateRecoveryPassword]);

  const signOut = useCallback(async () => {
    signOutEpochRef.current += 1; // invalidate auth events queued before this point
    try {
      await supabase.auth.signOut();
    } catch {
      // Offline: still drop the local session so the next load cannot resurrect it.
      try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
    }
    identityRef.current = { uid: null, gen: identityRef.current.gen + 1 };
    accessTokenRef.current = null;
    loaderRef.current.invalidate();
    queryClient.clear();
    purgeUserScopedStorage(browserStorage('localStorage'));
    clearRecoveryPending(browserStorage('sessionStorage'));
    recoverySessionRef.current = false;
    setUid(null);
    setUser(null);
    setProfile(null);
    setConsent({ active: false, history: [] });
    setProfileStatus(PROFILE_STATUS.IDLE);
    setAuthFlow('none');
    setRecoveryStage(RECOVERY_PHASE.REQUESTED);
  }, [supabase]);

  /** Leave recovery. Only signs out the transient session that recovery itself created. */
  const cancelRecovery = useCallback(async () => {
    const hadRecoverySession = recoverySessionRef.current;
    clearRecoveryPending(browserStorage('sessionStorage'));
    recoverySessionRef.current = false;
    setAuthFlow('none');
    setRecoveryStage(RECOVERY_PHASE.REQUESTED);
    if (hadRecoverySession) await signOut();
  }, [signOut]);

  /**
   * Completes a link that lands on /auth/confirm.
   * `token_hash` is device-independent; `code` is PKCE and only works in the
   * browser that requested the email (supabase-js may already have exchanged it
   * via detectSessionInUrl, in which case a live session counts as success).
   */
  const completeAuthLink = useCallback(async ({ tokenHash = null, code = null, type = null } = {}) => {
    let resolvedType = type;
    if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type || 'email' });
      if (error) throw error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        const { data } = await supabase.auth.getSession();
        if (!data?.session) throw error; // nothing was established: real failure
      }
      resolvedType = resolvedType || (readRecoveryPhase(browserStorage('sessionStorage')) ? 'recovery' : 'email');
    } else {
      throw authFailure('unknown', 'Nothing to confirm');
    }

    await syncSession();

    if (resolvedType === 'recovery') {
      recoverySessionRef.current = true;
      setAuthFlow('recovery');
      setRecoveryStage(RECOVERY_PHASE.VERIFIED);
      markRecoveryPending(browserStorage('sessionStorage'), RECOVERY_PHASE.VERIFIED);
      return { outcome: 'recovery_ready' };
    }

    clearRecoveryPending(browserStorage('sessionStorage'));
    return { outcome: 'signup_confirmed' };
  }, [supabase, syncSession]);

  const ready = useMemo(
    () => isSessionReady({ sessionResolved, uid, profileStatus, authFlow }),
    [sessionResolved, uid, profileStatus, authFlow],
  );

  const value = {
    lang, setLang, uid, user, profile, consent, ready,
    profileStatus, authFlow, recoveryStage,
    refresh, setProfile,
    signUpEmail, signInEmail, resendSignupConfirmation, confirmSignupOtp,
    requestPasswordRecovery, resendRecoveryCode, resetPassword,
    verifyRecoveryOtp, updateRecoveryPassword, verifyOtpAndSetPassword,
    cancelRecovery, completeAuthLink,
    signOut, logout: signOut,
    classifyAuthError,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AppCtx.Provider value={value}>
        {children}
        <Toaster richColors position="top-center" />
      </AppCtx.Provider>
    </QueryClientProvider>
  );
}
