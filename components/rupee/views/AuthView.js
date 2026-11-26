'use client';
import { useCallback, useEffect, useState } from 'react';
import { Wallet, Mail, ShieldCheck, Loader2, ArrowLeft, KeyRound, User, Lock, RefreshCw, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { SecurityAlertBanner } from '@/components/rupee/SecurityAlertBanner';
import { authErrorMessage, isRateLimited } from '@/lib/auth/authErrors';
import { RECOVERY_STEP, initialRecoveryState, nextRecoveryState } from '@/lib/auth/recovery';

const RESEND_COOLDOWN_SECONDS = 60;

// Visible countdown for resend buttons. Supabase throttles these endpoints
// server-side anyway; without a local cooldown the second click just surfaces a
// raw provider error.
function useResendCooldown(seconds = RESEND_COOLDOWN_SECONDS) {
  const [until, setUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!until) { setRemaining(0); return undefined; }
    const tick = () => setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);

  const start = useCallback(() => setUntil(Date.now() + seconds * 1000), [seconds]);
  return { remaining, start, active: remaining > 0 };
}

export function AuthView({ onBack, onDone, recovery = null }) {
  const {
    lang, user, signUpEmail, signInEmail,
    requestPasswordRecovery, resendRecoveryCode,
    verifyRecoveryOtp, updateRecoveryPassword, cancelRecovery,
    resendSignupConfirmation, confirmSignupOtp,
  } = useApp();

  const [mode, setMode] = useState(recovery ? 'forgot' : 'login'); // login | signup | forgot
  const [signupStep, setSignupStep] = useState('form'); // form | confirm
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryState, setRecoveryState] = useState(() => (
    recovery?.stage === 'verified'
      // The link already established a verified session: go straight to choosing
      // the new password, never back to a code that is already spent.
      ? nextRecoveryState(initialRecoveryState(), { type: 'VERIFIED' })
      : initialRecoveryState()
  ));

  const confirmCooldown = useResendCooldown();
  const recoveryCooldown = useResendCooldown();
  const resetRecovery = (event) => setRecoveryState((s) => nextRecoveryState(s, event));

  const doSignup = async () => {
    if (!name.trim()) return toast.error('Please enter your name.');
    if (!email.trim()) return toast.error('Please enter your email.');
    if (password.length < 6) return toast.error('Password must be at least 6 characters.');
    if (password !== confirm) return toast.error('Passwords do not match.');
    setBusy(true);
    try {
      const data = await signUpEmail({ name: name.trim(), email: email.trim(), password });
      setPassword(''); setConfirm('');
      if (data?.session) { toast.success('Account created!'); onDone?.(); }
      else {
        // Confirmation is required: show the resend + 6-digit code panel instead
        // of a dead end. The message stays generic so it never reveals whether the
        // address already had an account.
        setSignupStep('confirm');
        setOtp('');
        confirmCooldown.start();
        toast.success('Account created! Check your email to confirm your address.');
      }
    } catch (e) { toast.error(authErrorMessage(e)); } finally { setBusy(false); }
  };

  const doLogin = async () => {
    if (!email.trim() || !password) return toast.error('Enter email and password.');
    setBusy(true);
    try { await signInEmail({ email: email.trim(), password }); toast.success('Welcome back!'); onDone?.(); }
    catch (e) { toast.error(authErrorMessage(e)); } finally { setBusy(false); }
  };

  const doResendConfirmation = async () => {
    if (confirmCooldown.active || busy) return;
    setBusy(true);
    try {
      await resendSignupConfirmation(email.trim());
      confirmCooldown.start();
      toast.success('Confirmation email sent again. It can take a minute to arrive.');
    } catch (e) {
      if (isRateLimited(e)) confirmCooldown.start();
      toast.error(authErrorMessage(e));
    } finally { setBusy(false); }
  };

  const doConfirmSignupCode = async () => {
    if (!/^[0-9]{6}$/.test(otp.trim())) return toast.error('Enter the 6-digit code from the email.');
    setBusy(true);
    try {
      await confirmSignupOtp({ email: email.trim(), token: otp.trim() });
      setOtp('');
      toast.success('Email confirmed — you are signed in!');
      onDone?.();
    } catch (e) { toast.error(authErrorMessage(e)); } finally { setBusy(false); }
  };

  const doForgotRequest = async () => {
    if (!email.trim()) return toast.error('Enter your email.');
    setBusy(true);
    try {
      // Generic on purpose: identical wording whether or not the account exists.
      const result = await requestPasswordRecovery(email.trim());
      resetRecovery({ type: 'CODE_SENT' });
      recoveryCooldown.start();
      toast.success(result?.limited
        ? 'If that account exists, a code was sent recently. Please wait a moment before asking again.'
        : 'If that account exists, a 6-digit code is on its way.');
    } catch (e) { toast.error(authErrorMessage(e)); } finally { setBusy(false); }
  };

  const doResendRecovery = async () => {
    if (recoveryCooldown.active || busy) return;
    if (!email.trim()) return toast.error('Enter your email.');
    setBusy(true);
    try {
      const result = await resendRecoveryCode(email.trim());
      recoveryCooldown.start();
      toast.success(result?.limited
        ? 'A code was sent recently. Please wait a moment before asking again.'
        : 'If that account exists, a new 6-digit code is on its way.');
    } catch (e) { toast.error(authErrorMessage(e)); } finally { setBusy(false); }
  };

  // Once the code is verified the session exists and the code is spent: only the
  // password update is left, and it can be retried without a new code.
  const applyNewPassword = async () => {
    if (password.length < 6) { toast.error('New password must be at least 6 characters.'); return false; }
    if (password !== confirm) { toast.error('Passwords do not match.'); return false; }
    try {
      await updateRecoveryPassword(password);
      resetRecovery({ type: 'PASSWORD_UPDATED' });
      setPassword(''); setConfirm(''); setOtp('');
      toast.success('Password updated — you are signed in!');
      onDone?.();
      return true;
    } catch (e) {
      resetRecovery({ type: 'PASSWORD_FAILED', error: authErrorMessage(e) });
      toast.error(authErrorMessage(e));
      return false;
    }
  };

  const doForgotVerify = async () => {
    if (!/^[0-9]{6}$/.test(otp.trim())) return toast.error('Enter the 6-digit code.');
    if (password.length < 6) return toast.error('New password must be at least 6 characters.');
    if (password !== confirm) return toast.error('Passwords do not match.');
    setBusy(true);
    try {
      await verifyRecoveryOtp({ email: email.trim(), token: otp.trim() });
      setOtp('');
      resetRecovery({ type: 'VERIFIED' });
      await applyNewPassword();
    } catch (e) {
      resetRecovery({ type: 'VERIFY_FAILED', error: authErrorMessage(e) });
      toast.error(authErrorMessage(e));
    } finally { setBusy(false); }
  };

  const doSetPasswordOnly = async () => {
    setBusy(true);
    try { await applyNewPassword(); } finally { setBusy(false); }
  };

  const leaveRecovery = async ({ goBack = false } = {}) => {
    setBusy(true);
    try { await cancelRecovery(); } catch { /* leaving anyway */ } finally { setBusy(false); }
    setRecoveryState(initialRecoveryState());
    setOtp(''); setPassword(''); setConfirm('');
    setMode('login');
    if (goBack) onBack?.();
  };

  const handleBack = () => {
    // While recovering, "Back" must also end the recovery session — otherwise the
    // guard that keeps the reset form on screen would trap the user here.
    if (recovery) { leaveRecovery({ goBack: true }); return; }
    onBack?.();
  };

  const openForgot = () => {
    setMode('forgot');
    setRecoveryState(initialRecoveryState());
    setPassword(''); setConfirm(''); setOtp('');
    recoveryCooldown.start();
  };

  const recoveryStep = recoveryState.step;
  const recoveryTarget = email.trim() || user?.email || '';
  const otpInput = (id) => (
    <div className="space-y-1.5"><Label htmlFor={id}>6-digit code</Label>
      <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))} placeholder="123456"
        className="tracking-[0.4em] text-center text-lg" />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background bg-grid-soft p-4">
      <button onClick={handleBack} className="self-start container flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</button>
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-2 font-extrabold text-xl justify-center">
          <span className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Wallet className="h-5 w-5" /></span>
          Rupee<span className="text-primary">Rizz</span>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-2">{t(lang, 'tagline')}</p>

        {mode !== 'forgot' && (
          <>
            <div className="grid grid-cols-2 gap-1 mt-6 p-1 bg-secondary rounded-lg">
              <button onClick={() => { setMode('login'); setSignupStep('form'); }} className={`py-2 rounded-md text-sm font-medium transition-colors ${mode === 'login' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>Log in</button>
              <button onClick={() => { setMode('signup'); setSignupStep('form'); }} className={`py-2 rounded-md text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>Sign up</button>
            </div>

            <div className="space-y-3 mt-4">
              {mode === 'signup' && (
                <div className="space-y-1.5"><Label htmlFor="name">Name</Label>
                  <div className="relative"><User className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input id="name" className="pl-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Arnav" /></div>
                </div>
              )}
              <div className="space-y-1.5"><Label htmlFor="email">Email</Label>
                <div className="relative"><Mail className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input id="email" type="email" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
              </div>
              {!(mode === 'signup' && signupStep === 'confirm') && (
                <div className="space-y-1.5"><Label htmlFor="password">Password</Label>
                  <div className="relative"><Lock className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input id="password" type="password" className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" onKeyDown={(e) => e.key === 'Enter' && mode === 'login' && doLogin()} /></div>
                </div>
              )}
              {mode === 'signup' && signupStep === 'form' && (
                <div className="space-y-1.5"><Label htmlFor="confirm">Confirm password</Label>
                  <div className="relative"><Lock className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input id="confirm" type="password" className="pl-9" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" /></div>
                </div>
              )}

              {mode === 'signup' && signupStep === 'confirm' ? (
                <>
                  <SecurityAlertBanner variant="info">
                    {/* The message must stay ONE inline text run. Wrapping the
                        copy and the address in a `flex` container turns each of
                        them into its own flex item, which renders the sentence
                        and the email as side-by-side columns. */}
                    <span className="flex items-start gap-1.5">
                      <MailCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        We sent a confirmation link and a 6-digit code to{' '}
                        <span className="font-medium text-foreground">{email}</span>. Confirm before logging in.
                      </span>
                    </span>
                  </SecurityAlertBanner>
                  {otpInput('signup-otp')}
                  <Button className="w-full" onClick={doConfirmSignupCode} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />} Confirm email
                  </Button>
                  <Button variant="outline" className="w-full" onClick={doResendConfirmation} disabled={busy || confirmCooldown.active}>
                    {confirmCooldown.active
                      ? <>Resend in {confirmCooldown.remaining}s</>
                      : <><RefreshCw className="h-4 w-4 mr-2" /> Resend confirmation email</>}
                  </Button>
                  <button className="text-sm text-muted-foreground hover:underline w-full text-center" onClick={() => { setSignupStep('form'); setMode('login'); setOtp(''); }}>Back to log in</button>
                </>
              ) : mode === 'login' ? (
                <Button className="w-full" onClick={doLogin} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />} Log in</Button>
              ) : (
                <Button className="w-full" onClick={doSignup} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />} Create account</Button>
              )}

              {mode === 'login' && (
                <button className="text-sm text-primary hover:underline w-full text-center" onClick={openForgot}>Forgot password?</button>
              )}
            </div>
          </>
        )}

        {mode === 'forgot' && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Reset password</div>
            {recoveryStep === RECOVERY_STEP.REQUEST ? (
              <>
                <p className="text-sm text-muted-foreground">Enter your email and we will send a 6-digit code.</p>
                <div className="space-y-1.5"><Label htmlFor="femail">Email</Label><Input id="femail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
                <Button className="w-full" onClick={doForgotRequest} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Send 6-digit code</Button>
              </>
            ) : recoveryStep === RECOVERY_STEP.VERIFY ? (
              <>
                <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to <span className="font-medium text-foreground">{recoveryTarget}</span> and choose a new password.</p>
                {otpInput('otp')}
                <div className="space-y-1.5"><Label htmlFor="np">New password</Label><Input id="np" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /></div>
                <div className="space-y-1.5"><Label htmlFor="nc">Confirm new password</Label><Input id="nc" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
                <Button className="w-full" onClick={doForgotVerify} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Verify &amp; set new password</Button>
                <Button variant="outline" className="w-full" onClick={doResendRecovery} disabled={busy || recoveryCooldown.active}>
                  {recoveryCooldown.active ? <>Resend code in {recoveryCooldown.remaining}s</> : <><RefreshCw className="h-4 w-4 mr-2" /> Send a new code</>}
                </Button>
              </>
            ) : (
              <>
                {/* Code already verified. Only the password is left, and it can be
                    retried: the one-time code cannot be used a second time. */}
                <SecurityAlertBanner variant="info">
                  <span className="flex items-start gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      Code verified for{' '}
                      <span className="font-medium text-foreground">{recoveryTarget}</span>. Choose your new password.
                    </span>
                  </span>
                </SecurityAlertBanner>
                {recoveryState.error && <p className="text-sm text-destructive">{recoveryState.error}</p>}
                <div className="space-y-1.5"><Label htmlFor="sp">New password</Label><Input id="sp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /></div>
                <div className="space-y-1.5"><Label htmlFor="sc">Confirm new password</Label><Input id="sc" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
                <Button className="w-full" onClick={doSetPasswordOnly} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save new password</Button>
              </>
            )}
            <button className="text-sm text-muted-foreground hover:underline w-full text-center" onClick={() => leaveRecovery({ goBack: false })}>Cancel and back to log in</button>
          </div>
        )}

        <div className="mt-5"><SecurityAlertBanner variant="info"><span className="flex items-start gap-1.5"><ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" /> We never ask for your bank password, PIN, Aadhaar, or card details.</span></SecurityAlertBanner></div>
      </Card>
    </div>
  );
}

export default AuthView;
