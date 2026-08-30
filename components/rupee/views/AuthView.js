'use client';
import { useState } from 'react';
import { Wallet, Mail, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { SecurityAlertBanner } from '@/components/rupee/SecurityAlertBanner';

export function AuthView({ onBack, onDone, onDemo }) {
  const { lang, login } = useApp();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const emailLogin = async () => {
    if (!email.trim()) { toast.error('Please enter an email to continue.'); return; }
    setBusy(true);
    try { await login({ email: email.trim(), name: name.trim() }); onDone?.(); }
    catch (e) { toast.error(e.message || 'Could not sign in.'); }
    finally { setBusy(false); }
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

        <Button className="w-full mt-6" variant="outline" onClick={() => { toast.info('Google sign-in needs Supabase setup (see README). Using a demo-safe email session for now.'); }}>
          <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          {t(lang, 'continue_google')}
        </Button>

        <div className="flex items-center gap-3 my-4"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or</span><div className="h-px flex-1 bg-border" /></div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Your name (optional)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Arnav" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={(e) => e.key === 'Enter' && emailLogin()} />
          </div>
          <Button className="w-full" onClick={emailLogin} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />} {t(lang, 'continue_email')}
          </Button>
        </div>

        <Button variant="ghost" className="w-full mt-3" onClick={onDemo}>{t(lang, 'try_demo')}</Button>

        <div className="mt-5"><SecurityAlertBanner variant="info"><span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> We never ask for your bank password, PIN, Aadhaar, or card details.</span></SecurityAlertBanner></div>
      </Card>
    </div>
  );
}

export default AuthView;
