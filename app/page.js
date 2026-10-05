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

const PUBLIC = ['landing', 'auth'];
const PREAPP = ['landing', 'auth', 'consent', 'onboarding'];
const APP_ROUTES = ['dashboard', 'receipts', 'plan', 'goals', 'financial-health', 'options', 'before-you-borrow', 'my-data', 'report', 'money-lab', 'grow'];

function FullLoader() {
  return <RizzSplash label="Waking up your money universe…" />;
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
      {current === 'money-lab' && <FinancialFutureLab data={null} onNav={nav} />}
      {current === 'grow' && <GrowSavingsView />}
    </AppShell>
  );
}

export default App;
