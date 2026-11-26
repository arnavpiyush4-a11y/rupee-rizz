'use client';

// Landing point for Supabase email links (signup confirmation and password
// recovery). Handling them here — instead of on "/" — is what lets an expired
// link say so, keeps PKCE failures explainable, and gives recovery links a
// screen that is not the app dashboard.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ShieldCheck, RefreshCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/app/providers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SecurityAlertBanner } from '@/components/rupee/SecurityAlertBanner';
import { authErrorMessage, classifyAuthError, isRateLimited } from '@/lib/auth/authErrors';
import { readRecoveryPhase } from '@/lib/auth/recovery';

function readLinkParams() {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const pick = (key) => url.searchParams.get(key) ?? hash.get(key);
  return {
    code: pick('code'),
    // `token_hash` is device independent; the classic /verify link ships it as `token`.
    tokenHash: pick('token_hash') || pick('token'),
    type: pick('type'),
    errorCode: pick('error_code') || pick('error'),
    errorDescription: pick('error_description'),
  };
}

const RESEND_COOLDOWN_SECONDS = 60;

export default function ConfirmPage() {
  const router = useRouter();
  const { completeAuthLink, resendSignupConfirmation, resendRecoveryCode } = useApp();
  const [status, setStatus] = useState('working'); // working | confirmed | recovery | expired | error | idle
  const [message, setMessage] = useState('');
  const [linkType, setLinkType] = useState(null); // recovery | signup | null
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!until) { setRemaining(0); return undefined; }
    const tick = () => setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = readLinkParams();
    if (!params) return;

    const isRecovery = params.type === 'recovery'
      // GoTrue does not always echo `type` on an error redirect, so fall back to
      // the marker written when the reset was requested in this tab.
      || (typeof window !== 'undefined' && readRecoveryPhase(window.sessionStorage) !== null);
    setLinkType(isRecovery ? 'recovery' : 'signup');

    // Drop the token material from the address bar/history as soon as it is read
    // so it cannot leak through a referrer or a copied URL.
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch { /* ignore */ }

    if (params.errorCode) {
      const kind = classifyAuthError({ code: params.errorCode, message: params.errorDescription });
      setStatus(kind === 'otp_rejected' ? 'expired' : 'error');
      setMessage(authErrorMessage({ code: params.errorCode, message: params.errorDescription }));
      return;
    }

    if (!params.code && !params.tokenHash) {
      setStatus('idle');
      setMessage('There is nothing to confirm in this link.');
      return;
    }

    completeAuthLink({ tokenHash: params.tokenHash, code: params.code, type: params.type })
      .then((result) => {
        if (result?.outcome === 'recovery_ready') {
          // Providers already marked the flow; the app will render the
          // "choose a new password" step and must not route past it.
          setStatus('recovery');
          router.replace('/');
          return;
        }
        setStatus('confirmed');
        router.replace('/');
      })
      .catch((error) => {
        const kind = classifyAuthError(error);
        setStatus(kind === 'otp_rejected' ? 'expired' : 'error');
        setMessage(authErrorMessage(error));
      });
  }, [completeAuthLink, router]);

  const resend = async () => {
    if (busy || remaining > 0) return;
    if (!email.trim()) { toast.error('Enter the email you signed up with.'); return; }
    setBusy(true);
    try {
      if (linkType === 'recovery') await resendRecoveryCode(email.trim());
      else await resendSignupConfirmation(email.trim());
      setUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      toast.success('If that account exists, a new email is on its way.');
      setStatus('sent');
    } catch (error) {
      if (isRateLimited(error)) setUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      toast.error(authErrorMessage(error));
    } finally { setBusy(false); }
  };

  const showResend = ['expired', 'error', 'sent'].includes(status);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background bg-grid-soft p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-2 font-extrabold text-xl justify-center">
          <span className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Wallet className="h-5 w-5" /></span>
          Rupee<span className="text-primary">Rizz</span>
        </div>

        {status === 'working' && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Confirming your link…
          </p>
        )}

        {status === 'confirmed' && (
          <SecurityAlertBanner variant="info">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Email confirmed. Taking you to RupeeRizz…</span>
          </SecurityAlertBanner>
        )}

        {status === 'recovery' && (
          <SecurityAlertBanner variant="info">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Link verified. Choose a new password to continue.</span>
          </SecurityAlertBanner>
        )}

        {(status === 'expired' || status === 'error') && (
          <>
            <SecurityAlertBanner variant="mask">
              {message || authErrorMessage()}
            </SecurityAlertBanner>
            <p className="text-sm text-muted-foreground">
              Links are single use and time limited. Request a new one below, or open the link in the same
              browser you started from and enter the 6-digit code instead — that works on any device.
            </p>
          </>
        )}

        {status === 'idle' && (
          <p className="text-sm text-muted-foreground">{message} You can log in as usual, or request a new link.</p>
        )}

        {status === 'sent' && (
          <p className="text-sm text-muted-foreground">A new email is on its way. It can take a minute to arrive — check spam too.</p>
        )}

        {showResend && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="confirm-email">Email</Label>
              <Input id="confirm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <Button className="w-full" onClick={resend} disabled={busy || remaining > 0}>
              {remaining > 0
                ? <>Resend in {remaining}s</>
                : <><RefreshCw className="h-4 w-4 mr-2" /> Send a new email</>}
            </Button>
          </div>
        )}

        <Link href="/" className="block text-center text-sm text-primary hover:underline">Back to RupeeRizz</Link>
      </Card>
    </div>
  );
}
