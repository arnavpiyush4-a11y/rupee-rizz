'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
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

const PUBLIC = ['landing', 'auth'];
const PREAPP = ['landing', 'auth', 'consent', 'onboarding'];
const APP_ROUTES = ['dashboard', 'receipts', 'plan', 'goals', 'financial-health', 'options', 'before-you-borrow', 'my-data', 'report'];

function FullLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /> Loading RupeeRizz…</div>
    </div>
  );
}

function App() {
  const { ready, uid, consent, profile } = useApp();
  const [route, setRoute] = useState('landing');
  const nav = useCallback((r) => setRoute(r), []);

  useEffect(() => {
    if (!ready) return;
    if (!uid) { setRoute((r) => (PUBLIC.includes(r) ? r : 'landing')); return; }
    if (!consent?.active) { setRoute('consent'); return; }
    if (!profile?.user_type) { setRoute('onboarding'); return; }
    setRoute((r) => (PREAPP.includes(r) ? 'dashboard' : r));
  }, [ready, uid, consent?.active, profile?.user_type]);

  if (!ready) return <FullLoader />;

  if (!uid) {
    if (route === 'auth') return <AuthView onBack={() => nav('landing')} onDone={() => {}} />;
    return <Landing onGetStarted={() => nav('auth')} onDemo={() => nav('auth')} />;
  }

  if (!consent?.active) return <ConsentView onAgreed={() => {}} />;
  if (!profile?.user_type) return <Onboarding onDone={() => {}} />;

  const current = APP_ROUTES.includes(route) ? route : 'dashboard';
  return (
    <AppShell route={current} onNav={nav}>
      {current === 'dashboard' && <Dashboard onNav={nav} />}
      {current === 'receipts' && <ReceiptsView />}
      {current === 'plan' && <PlanView onNav={nav} />}
      {current === 'goals' && <GoalsView />}
      {current === 'financial-health' && <FinancialHealthView onNav={nav} />}
      {current === 'options' && <OptionsView />}
      {current === 'before-you-borrow' && <BeforeYouBorrowView />}
      {current === 'my-data' && <MyDataView />}
      {current === 'report' && <ReadinessReport onNav={nav} />}
    </AppShell>
  );
}

export default App;
