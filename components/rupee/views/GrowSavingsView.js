'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sprout, PiggyBank, TrendingUp, Target, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { formatINR } from '@/lib/format';
import { StatCard, Loading } from '@/components/rupee/common';
import {
  DEFAULT_AMOUNT_MODE, DEFAULT_GOAL, DEFAULT_HORIZON, DEFAULT_RISK,
} from '@/lib/grow/types';
import { resolveExploreAmount } from '@/lib/grow/calculators';
import { selectCategories } from '@/lib/grow/rules';
import { exampleProductsForCategories } from '@/lib/grow/exampleProducts';
import { GROW } from '@/lib/constants/testIds/grow';
import { AmountExplorer } from '@/components/rupee/grow/AmountExplorer';
import { PreferenceSelectors } from '@/components/rupee/grow/PreferenceSelectors';
import { CategoryCards } from '@/components/rupee/grow/CategoryCards';
import { ExampleProductCards } from '@/components/rupee/grow/ExampleProductCards';
import { PlatformCards } from '@/components/rupee/grow/PlatformCards';
import { EmergencyExploreWarning, GrowSafetyNote } from '@/components/rupee/grow/SafetyNote';
import { InvestmentCalculators } from '@/components/rupee/grow/InvestmentCalculators';
import { InvestmentGlossary } from '@/components/rupee/grow/InvestmentGlossary';

export function GrowSavingsView() {
  const { lang } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(DEFAULT_AMOUNT_MODE);
  const [customAmount, setCustomAmount] = useState('');
  const [investmentGoal, setGoal] = useState(DEFAULT_GOAL);
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON);
  const [riskComfort, setRisk] = useState(DEFAULT_RISK);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/dashboard');
      setData(d.dashboard);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const snapshot = data?.snapshot || {};
  const safe = snapshot.safe_monthly_saving || 0;
  const activeGoal = data?.goals?.[0] || null;
  const exploreAmount = useMemo(
    () => resolveExploreAmount({ safeMonthlySaving: safe, mode, customAmount }),
    [safe, mode, customAmount],
  );
  const categoryResult = useMemo(
    () => selectCategories({ goal: investmentGoal, horizon, riskComfort }),
    [investmentGoal, horizon, riskComfort],
  );
  const products = useMemo(
    () => exampleProductsForCategories(categoryResult.categoryIds),
    [categoryResult.categoryIds],
  );

  if (loading) return <Loading label={t(lang, 'loading')} />;
  if (!data) return null;

  return (
    <div className="space-y-8" data-testid={GROW.page}>
      <header>
        <div className="flex items-center gap-2">
          <Sprout className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Grow your savings</h1>
        </div>
        <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
          You&apos;ve identified money you can safely set aside. Explore how different investment categories work based on your goal, time horizon and risk comfort. RupeeRizz does not place trades or promise returns.
        </p>
      </header>

      <section data-testid={GROW.snapshot}>
        <h2 className="text-lg font-semibold mb-1">Your RupeeRizz numbers</h2>
        <p className="text-sm text-muted-foreground mb-3">These values come from your existing plan. They are separate from the simulation choices below.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={TrendingUp} label={t(lang, 'monthly_surplus')} value={formatINR(snapshot.monthly_surplus)} tone={snapshot.monthly_surplus >= 0 ? 'positive' : 'risk'} />
          <StatCard icon={PiggyBank} label={t(lang, 'safe_saving')} value={formatINR(snapshot.safe_monthly_saving)} tone="positive" />
          <StatCard icon={Target} label="Current savings goal" value={activeGoal?.goal_name || 'None yet'} />
          <StatCard icon={Wallet} label="Goal contribution / mo" value={activeGoal ? formatINR(activeGoal.recommended_monthly ?? 0) : '—'} />
        </div>
      </section>

      <EmergencyExploreWarning emergency={data.emergency} />

      <AmountExplorer
        safeMonthlySaving={safe}
        mode={mode}
        customAmount={customAmount}
        exploreAmount={exploreAmount}
        onMode={setMode}
        onCustomAmount={setCustomAmount}
      />

      <PreferenceSelectors
        investmentGoal={investmentGoal}
        horizon={horizon}
        riskComfort={riskComfort}
        onGoal={setGoal}
        onHorizon={setHorizon}
        onRisk={setRisk}
      />

      <CategoryCards result={categoryResult} />
      <ExampleProductCards products={products} />
      <PlatformCards />

      <InvestmentCalculators exploreAmount={exploreAmount} horizon={horizon} />

      <InvestmentGlossary />

      <div data-testid={GROW.safetyNote}>
        <GrowSafetyNote />
      </div>
    </div>
  );
}


export default GrowSavingsView;
