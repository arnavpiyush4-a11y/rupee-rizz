'use client';
import { useState } from 'react';
import { Wallet, Mail, ShieldCheck, Loader2, ArrowLeft, KeyRound, User, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { SecurityAlertBanner } from '@/components/rupee/SecurityAlertBanner';

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
  );
}

export function AuthView({ onBack, onDone }) {
  const { lang, signUpEmail, signInEmail, signInGoogle, resetPassword, verifyOtpAndSetPassword } = useApp();
  const [mode, setMode] = useState('login'); // login | signup | forgot
  const [forgotStep, setForgotStep] = useState('request'); // request | verify
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const doGoogle = async () => { try { await signInGoogle(); } catch (e) { toast.error(e.message || 'Google sign-in failed. Is it configured in Supabase?'); } };

  const doSignup = async () => {
    if (!name.trim()) return toast.error('Please enter your name.');
    if (!email.trim()) return toast.error('Please enter your email.');
    if (password.length < 6) return toast.error('Password must be at least 6 characters.');
    if (password !== confirm) return toast.error('Passwords do not match.');
    setBusy(true);
    try {
      const data = await signUpEmail({ name: name.trim(), email: email.trim(), password });
      if (data?.session) { toast.success('Account created!'); onDone?.(); }
      else { toast.success('Account created! Check your email to confirm, then log in.'); setMode('login'); setPassword(''); setConfirm(''); }
    } catch (e) { toast.error(e.message || 'Could not sign up.'); } finally { setBusy(false); }
  };

  const doLogin = async () => {
    if (!email.trim() || !password) return toast.error('Enter email and password.');
    setBusy(true);
    try { await signInEmail({ email: email.trim(), password }); toast.success('Welcome back!'); onDone?.(); }
    catch (e) {
      if (/confirm/i.test(e.message || '')) toast.error('Please confirm your email first (check your inbox).');
      else toast.error(e.message || 'Could not sign in.');
    } finally { setBusy(false); }
  };

  const doForgotRequest = async () => {
    if (!email.trim()) return toast.error('Enter your email.');
    setBusy(true);
    try { await resetPassword(email.trim()); toast.success('If the account exists, a 6-digit code was sent to your email.'); setForgotStep('verify'); }
    catch (e) { toast.error(e.message || 'Could not send code.'); } finally { setBusy(false); }
  };

  const doForgotVerify = async () => {
    if (!/^[0-9]{6}$/.test(otp.trim())) return toast.error('Enter the 6-digit code.');
    if (password.length < 6) return toast.error('New password must be at least 6 characters.');
    if (password !== confirm) return toast.error('Passwords do not match.');
    setBusy(true);
    try { await verifyOtpAndSetPassword({ email: email.trim(), token: otp.trim(), password }); toast.success('Password updated - you are signed in!'); onDone?.(); }
    catch (e) { toast.error(e.message || 'Invalid or expired code.'); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background bg-grid-soft p-4">
      <button onClick={onBack} className="self-start container flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</button>
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-2 font-extrabold text-xl justify-center">
          <span className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Wallet className="h-5 w-5" /></span>
          Rupee<span className="text-primary">Rizz</span>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-2">{t(lang, 'tagline')}</p>

        {mode !== 'forgot' && (
          <>
            <div className="grid grid-cols-2 gap-1 mt-6 p-1 bg-secondary rounded-lg">
              <button onClick={() => setMode('login')} className={`py-2 rounded-md text-sm font-medium transition-colors ${mode === 'login' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>Log in</button>
              <button onClick={() => setMode('signup')} className={`py-2 rounded-md text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>Sign up</button>
            </div>

            <Button className="w-full mt-4" variant="outline" onClick={doGoogle}><GoogleIcon /> {t(lang, 'continue_google')}</Button>
            <div className="flex items-center gap-3 my-4"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or</span><div className="h-px flex-1 bg-border" /></div>

            <div className="space-y-3">
              {mode === 'signup' && (
                <div className="space-y-1.5"><Label htmlFor="name">Name</Label>
                  <div className="relative"><User className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input id="name" className="pl-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Arnav" /></div>
                </div>
              )}
              <div className="space-y-1.5"><Label htmlFor="email">Email</Label>
                <div className="relative"><Mail className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input id="email" type="email" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="password">Password</Label>
                <div className="relative"><Lock className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input id="password" type="password" className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" onKeyDown={(e) => e.key === 'Enter' && mode === 'login' && doLogin()} /></div>
              </div>
              {mode === 'signup' && (
                <div className="space-y-1.5"><Label htmlFor="confirm">Confirm password</Label>
                  <div className="relative"><Lock className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" /><Input id="confirm" type="password" className="pl-9" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" /></div>
                </div>
              )}

              {mode === 'login' ? (
                <Button className="w-full" onClick={doLogin} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />} Log in</Button>
              ) : (
                <Button className="w-full" onClick={doSignup} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />} Create account</Button>
              )}

              {mode === 'login' && (
                <button className="text-sm text-primary hover:underline w-full text-center" onClick={() => { setMode('forgot'); setForgotStep('request'); setPassword(''); setConfirm(''); setOtp(''); }}>Forgot password?</button>
              )}
            </div>
          </>
        )}

        {mode === 'forgot' && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Reset password</div>
            {forgotStep === 'request' ? (
              <>
                <p className="text-sm text-muted-foreground">Enter your email and we will send a 6-digit code.</p>
                <div className="space-y-1.5"><Label htmlFor="femail">Email</Label><Input id="femail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
                <Button className="w-full" onClick={doForgotRequest} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Send 6-digit code</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to <span className="font-medium text-foreground">{email}</span> and choose a new password.</p>
                <div className="space-y-1.5"><Label htmlFor="otp">6-digit code</Label><Input id="otp" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))} placeholder="123456" className="tracking-[0.4em] text-center text-lg" /></div>
                <div className="space-y-1.5"><Label htmlFor="np">New password</Label><Input id="np" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /></div>
                <div className="space-y-1.5"><Label htmlFor="nc">Confirm new password</Label><Input id="nc" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
                <Button className="w-full" onClick={doForgotVerify} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Verify & set new password</Button>
              </>
            )}
            <button className="text-sm text-muted-foreground hover:underline w-full text-center" onClick={() => setMode('login')}>Back to log in</button>
          </div>
        )}

        <div className="mt-5"><SecurityAlertBanner variant="info"><span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> We never ask for your bank password, PIN, Aadhaar, or card details.</span></SecurityAlertBanner></div>
      </Card>
    </div>
  );
}

export default AuthView;
