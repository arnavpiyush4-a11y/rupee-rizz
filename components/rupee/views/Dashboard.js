'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScanLine, PiggyBank, Landmark, TrendingUp, TrendingDown, Wallet, Coins, Receipt, HeartPulse, Sparkles, Loader2, ArrowRight, ChevronRight, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { formatINR, formatDate } from '@/lib/format';
import { scoreBandLabel } from '@/lib/finance';
import { StatCard, Loading, Money } from '@/components/rupee/common';
import { SpendingCategoryChart, IncomeExpenseChart } from '@/components/rupee/SpendingCategoryChart';
import { SavingsGoalCard } from '@/components/rupee/SavingsGoalCard';
import { FriendlyNudgeCard } from '@/components/rupee/FriendlyNudgeCard';

export function Dashboard({ onNav }) {
  const { lang, profile } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState(null);
  const [insightBusy, setInsightBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api('/dashboard'); setData(d.dashboard); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const genInsight = async () => {
    setInsightBusy(true);
    try { const d = await api('/insights/generate', { method: 'POST' }); setInsight(d.insight); }
    catch (e) { toast.error(e.message); } finally { setInsightBusy(false); }
  };

  if (loading) return <Loading label={t(lang, 'loading')} />;
  if (!data) return null;

  const s = data.snapshot;
  const hour = new Date().getHours();
  const greetKey = hour < 12 ? 'good_morning' : hour < 17 ? 'good_afternoon' : 'good_evening';
  const activeGoal = data.goals?.[0];
  const chartData = data.spending_by_category?.length ? data.spending_by_category : data.budget_breakdown;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t(lang, greetKey)}, {profile?.full_name || 'Friend'} 👋</h1>
          <p className="text-muted-foreground text-sm">
            {t(lang, 'this_month_saved', { amount: formatINR(s.safe_monthly_saving) })}
            {activeGoal ? ` · ${activeGoal.goal_name} — ${activeGoal.metrics.progressPct}%` : ''}
            {data.top_category ? ` · Top: ${data.top_category.name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onNav('receipts')}><ScanLine className="h-4 w-4 mr-1" /> {t(lang, 'scan_receipt')}</Button>
          <Button size="sm" variant="outline" onClick={() => onNav('plan')}><PiggyBank className="h-4 w-4 mr-1" /> {t(lang, 'view_plan')}</Button>
          <Button size="sm" variant="outline" onClick={() => onNav('options')}><Landmark className="h-4 w-4 mr-1" /> {t(lang, 'explore_schemes')}</Button>
          <Button size="sm" variant="outline" onClick={() => onNav('report')}><FileText className="h-4 w-4 mr-1" /> Readiness Report</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label={t(lang, 'reliable_income')} value={formatINR(s.reliable_monthly_income)} tone="navy" sub={s.income_regular ? 'Regular' : 'Conservative estimate'} />
        <StatCard icon={Coins} label={t(lang, 'essential_spend')} value={formatINR(s.essential_expenses)} />
        <StatCard icon={Receipt} label={t(lang, 'nonessential_spend')} value={formatINR(s.non_essential_expenses)} tone="warn" />
        {s.business_operating_costs > 0
          ? <StatCard icon={TrendingDown} label={t(lang, 'business_costs')} value={formatINR(s.business_operating_costs)} />
          : <StatCard icon={TrendingDown} label={t(lang, 'emi_payments')} value={formatINR(s.compulsory_emi)} tone={s.compulsory_emi > 0 ? 'risk' : 'default'} />}
        <StatCard icon={s.monthly_surplus >= 0 ? TrendingUp : TrendingDown} label={t(lang, 'monthly_surplus')} value={formatINR(s.monthly_surplus)} tone={s.monthly_surplus >= 0 ? 'positive' : 'risk'} />
        <StatCard icon={PiggyBank} label={t(lang, 'safe_saving')} value={formatINR(s.safe_monthly_saving)} tone="positive" />
        <StatCard icon={HeartPulse} label={t(lang, 'fin_health')} value={`${data.health.score}/100`} tone="positive" sub={scoreBandLabel(data.health.band)} />
        <Card className="p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/40" onClick={() => onNav('financial-health')}>
          <div><div className="text-xs text-muted-foreground">Readiness details</div><div className="text-sm font-medium">View checklist</div></div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <SpendingCategoryChart data={chartData} title={t(lang, 'spending_by_cat')} />
        <IncomeExpenseChart data={data.income_vs_expenses} title={t(lang, 'income_vs_exp')} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <FriendlyNudgeCard nudge={data.nudge} onAction={() => onNav('plan')} actionLabel={t(lang, 'view_plan')} />
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Friendly AI insight</div>
              <Button size="sm" variant="outline" onClick={genInsight} disabled={insightBusy}>{insightBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}</Button>
            </div>
            {insight ? (
              <div className="mt-3 space-y-2 text-sm">
                <p>{insight.insight}</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Try this:</span> {insight.suggested_action}</p>
                {insight.estimated_monthly_saving > 0 && <p>Approx. saving: <span className="font-semibold text-emerald-600">{formatINR(insight.estimated_monthly_saving)}/mo</span></p>}
                {insight.safety_note && <p className="text-xs text-muted-foreground">{insight.safety_note}</p>}
              </div>
            ) : <p className="text-sm text-muted-foreground mt-2">Turn your verified numbers into one kind, practical tip. We never invent facts or push loans.</p>}
          </Card>
        </div>

        <div className="space-y-4">
          {activeGoal ? <SavingsGoalCard goal={activeGoal} lang={lang} onContribute={() => onNav('goals')} onOpen={() => onNav('goals')} />
            : <Card className="p-5"><p className="text-sm text-muted-foreground">No goals yet. <button className="text-primary underline" onClick={() => onNav('goals')}>Add your first goal</button>.</p></Card>}

          <Card className="p-5">
            <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">{t(lang, 'recent_receipts')}</h3><Button size="sm" variant="ghost" onClick={() => onNav('receipts')}>All <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></div>
            {data.recent_receipts?.length ? data.recent_receipts.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <span className="truncate">{r.merchant || 'Receipt'} <span className="text-muted-foreground text-xs">· {r.category}</span></span>
                <span className="font-medium">{formatINR(r.total)}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">{t(lang, 'empty_receipts')}</p>}
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3"><h3 className="font-semibold flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /> Support you might explore</h3><Button size="sm" variant="ghost" onClick={() => onNav('options')}>See all <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></div>
        <div className="grid sm:grid-cols-3 gap-3">
          {data.schemes_preview?.map((s2) => (
            <div key={s2.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-sm leading-tight">{s2.scheme_name}</span></div>
              <Badge className="mt-2 bg-amber-100 text-amber-800 hover:bg-amber-100">{t(lang, 'potentially_relevant')}</Badge>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{s2.purpose}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default Dashboard;
