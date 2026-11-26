'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/app/providers';
import { AppShell } from '@/components/rupee/AppShell';
import { Landing } from '@/components/rupee/views/Landing';
import { AuthView } from '@/components/rupee/views/AuthView';
import { ConsentView } from '@/components/rupee/views/ConsentView';
import { Onboarding } from '@/components/rupee/views/Onboarding';
import { Dashboard } from '@/components/rupee/views/Dashboard';
import { ReceiptsView } from '@/components/rupee/views/ReceiptsView';
import { PlanView } from '@/components/rupee/views/PlanView';
import { GoalsView } from '@/components/rupee/views/GoalsView';
import { FinancialHealthView } from '@/components/rupee/views/FinancialHealthView';
import { OptionsView } from '@/components/rupee/views/OptionsView';
import { BeforeYouBorrowView } from '@/components/rupee/views/BeforeYouBorrowView';
import { MyDataView } from '@/components/rupee/views/MyDataView';
import { ReadinessReport } from '@/components/rupee/views/ReadinessReport';
import { FinancialFutureLab } from '@/components/rupee/FinancialFutureLab';
import { RizzSplash } from '@/components/rupee/RizzSplash';
import { GrowSavingsView } from '@/components/rupee/views/GrowSavingsView';
import { EarnRadarView } from '@/components/rupee/views/EarnRadarView';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, RefreshCw, LogOut } from 'lucide-react';
import { decideRoute } from '@/lib/auth/routing';

import { BusinessDesk } from '@/components/rupee/views/BusinessDesk';

function FullLoader() {
  return <RizzSplash label="Waking up your money universe…" />;
}

// A failed /me is a connection problem, not a sign-out: keep the session, offer a
// retry, and never bounce the user into onboarding on a transient error.
function ProfileLoadError({ onRetry, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try { await onRetry?.(); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-grid-soft p-4">
      <Card className="w-full max-w-md p-6 space-y-3">
        <h1 className="font-extrabold text-lg">We could not load your profile</h1>
        <p className="text-sm text-muted-foreground">
          You are still signed in — this is usually a connection problem. Your consent and onboarding
          answers are safe.
        </p>
        <Button className="w-full" onClick={retry} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Try again
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => onSignOut?.()} disabled={busy}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out instead
        </Button>
      </Card>
    </div>
  );
}

function App() {
  const { ready, uid, consent, profile, profileStatus, authFlow, recoveryStage, refresh, signOut } = useApp();
  const [route, setRoute] = useState('landing');
  const nav = useCallback((r) => setRoute(r), []);

  const decision = decideRoute({
    ready,
    uid,
    authFlow,
    consentActive: !!consent?.active,
    hasUserType: !!profile?.user_type,
    profileStatus,
    route,
  });

  useEffect(() => {
    // While a password reset is in progress the screen is owned by the recovery
    // form; navigating here is exactly the bug that hid the "set new password"
    // step after verifyOtp established a session.
    if (authFlow === 'recovery') return;
    if (decision.route !== route) setRoute(decision.route);
  }, [authFlow, decision.route, route]);

  if (decision.view === 'loading') return <FullLoader />;

  if (decision.view === 'profile-error') return <ProfileLoadError onRetry={refresh} onSignOut={signOut} />;

  if (decision.view === 'business-demo') return <BusinessDesk demo onNav={() => nav('landing')} />;

  if (decision.view === 'auth') {
    return (
      <AuthView
        recovery={authFlow === 'recovery' ? { stage: recoveryStage } : null}
        onBack={() => nav('landing')}
        onDone={() => {}}
      />
    );
  }

  if (decision.view === 'landing') return <Landing onGetStarted={() => nav('auth')} onDemo={() => nav('business-demo')} />;

  if (decision.view === 'consent') return <ConsentView onAgreed={() => {}} />;
  if (decision.view === 'onboarding') return <Onboarding onDone={() => {}} />;

  const current = decision.route;
  return (
    <AppShell route={current} onNav={nav}>
      {current === 'business' && profile.user_type === 'micro_entrepreneur' && <BusinessDesk key={uid} onNav={nav} />}
      {current === 'dashboard' && <Dashboard onNav={nav} />}
      {current === 'receipts' && <ReceiptsView />}
      {current === 'plan' && <PlanView onNav={nav} />}
      {current === 'goals' && <GoalsView />}
      {current === 'financial-health' && <FinancialHealthView onNav={nav} />}
      {current === 'options' && <OptionsView />}
      {current === 'before-you-borrow' && <BeforeYouBorrowView />}
      {current === 'my-data' && <MyDataView />}
      {current === 'report' && <ReadinessReport onNav={nav} />}
      {current === 'money-lab' && <FinancialFutureLab data={null} onNav={nav} />}
      {current === 'grow' && <GrowSavingsView />}
      {current === 'earn-radar' && <EarnRadarView />}
    </AppShell>
  );
}

export default App;
