'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Coins, FileText, HeartPulse, Landmark, Loader2, PiggyBank, Receipt, ScanLine, Sparkles, TrendingDown, TrendingUp, Wallet, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { formatINR } from '@/lib/format';
import { scoreBandLabel } from '@/lib/finance';
import { Loading, Money } from '@/components/rupee/common';
import { SpendingCategoryChart, IncomeExpenseChart } from '@/components/rupee/SpendingCategoryChart';
import { SavingsGoalCard } from '@/components/rupee/SavingsGoalCard';
import { FriendlyNudgeCard } from '@/components/rupee/FriendlyNudgeCard';
import { FinancialFutureLab } from '@/components/rupee/FinancialFutureLab';

function HeroMetric({ icon: Icon, label, value, sub, tone = 'mint' }) {
  return (
    <motion.div className={`rr-dash-metric rr-dash-metric--${tone}`} whileHover={{ y: -3 }}>
      <span className="rr-dash-metric-icon"><Icon size={17} /></span>
      <div><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>
    </motion.div>
  );
}

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

  if (loading) return <Loading label="Waking up your money space…" />;
  if (!data) return null;

  const s = data.snapshot;
  const hour = new Date().getHours();
  const greetKey = hour < 12 ? 'good_morning' : hour < 17 ? 'good_afternoon' : 'good_evening';
  const activeGoal = data.goals?.[0];
  const chartData = data.spending_by_category?.length ? data.spending_by_category : data.budget_breakdown;

  return (
    <div className="space-y-6 rr-dashboard-page">
      <section className="rr-dash-hero">
        <div className="rr-dash-hero-copy">
          <span className="rr-eyebrow"><Sparkles size={13} /> your money, in motion</span>
          <h1>{t(lang, greetKey)}, {profile?.full_name || 'Friend'} <span className="rr-wave">👋</span></h1>
          <p>Here is the part where the numbers start telling a useful story.</p>
          <div className="rr-dash-hero-actions">
            <Button onClick={() => onNav('receipts')}><ScanLine size={15} /> Scan receipt</Button>
            <Button variant="outline" onClick={() => onNav('goals')}><PiggyBank size={15} /> Open goal</Button>
            <Button variant="outline" onClick={() => onNav('money-lab')}><Zap size={15} /> Money Lab</Button>
          </div>
        </div>
        <div className="rr-dash-pulse">
          <div className="rr-dash-pulse-ring rr-dash-pulse-ring--a" />
          <div className="rr-dash-pulse-ring rr-dash-pulse-ring--b" />
          <div className="rr-dash-pulse-core"><Wallet size={26} /><strong>{formatINR(s.safe_monthly_saving)}</strong><span>safe to save / month</span></div>
          <span className="rr-dash-float rr-dash-float--one">+{data.health.score} health</span>
          <span className="rr-dash-float rr-dash-float--two">{data.top_category ? data.top_category.name : 'balanced'} focus</span>
        </div>
      </section>

      <section className="rr-dash-metrics-grid">
        <HeroMetric icon={Wallet} label={t(lang, 'reliable_income')} value={formatINR(s.reliable_monthly_income)} sub={s.income_regular ? 'regular flow' : 'conservative estimate'} />
        <HeroMetric icon={Coins} label={t(lang, 'essential_spend')} value={formatINR(s.essential_expenses)} tone="blue" />
        <HeroMetric icon={Receipt} label={t(lang, 'nonessential_spend')} value={formatINR(s.non_essential_expenses)} tone="amber" />
        <HeroMetric icon={s.monthly_surplus >= 0 ? TrendingUp : TrendingDown} label={t(lang, 'monthly_surplus')} value={formatINR(s.monthly_surplus)} tone={s.monthly_surplus >= 0 ? 'mint' : 'rose'} />
        <HeroMetric icon={HeartPulse} label={t(lang, 'fin_health')} value={`${data.health.score}/100`} sub={scoreBandLabel(data.health.band)} tone="violet" />
        <HeroMetric icon={PiggyBank} label={t(lang, 'safe_saving')} value={formatINR(s.safe_monthly_saving)} sub="room for your goals" tone="mint" />
      </section>

      <section className="grid lg:grid-cols-[1.25fr_.75fr] gap-4">
        <Card className="rr-dash-card rr-dash-money-card p-5">
          <div className="rr-dash-card-head"><div><span className="rr-mini-label">THE QUICK READ</span><h2>Your month at a glance</h2></div><span className="rr-dash-card-badge"><span /> live math</span></div>
          <div className="rr-dash-story-row">
            <div className="rr-dash-story-number"><strong>{formatINR(s.monthly_surplus)}</strong><span>monthly surplus</span></div>
            <div className="rr-dash-story-arrow">→</div>
            <div className="rr-dash-story-number"><strong>{formatINR(s.safe_monthly_saving)}</strong><span>safe savings</span></div>
            <div className="rr-dash-story-arrow">→</div>
            <div className="rr-dash-story-number"><strong>{data.health.score}</strong><span>health pulse</span></div>
          </div>
          <div className="rr-dash-story-line"><span style={{ width: `${Math.max(10, Math.min(100, data.health.score))}%` }} /></div>
          <p className="rr-dash-footnote">The dashboard is deliberately explainable: each number is derived from the income, spending, goal and EMI information you chose to share.</p>
        </Card>
        <Card className="rr-dash-card rr-dash-insight-card p-5">
          <div className="rr-dash-card-head"><div><span className="rr-mini-label">RIZZ NOTICED</span><h2>One useful nudge</h2></div><Sparkles size={19} /></div>
          <div className="rr-dash-insight-orb"><Sparkles size={22} /></div>
          <p>{data.nudge?.text || 'Add a few receipts and I will find a pattern worth your attention.'}</p>
          <button onClick={() => onNav('plan')} className="rr-inline-link">Turn it into a plan <ArrowRight size={14} /></button>
        </Card>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <SpendingCategoryChart data={chartData} title={t(lang, 'spending_by_cat')} />
        <IncomeExpenseChart data={data.income_vs_expenses} title={t(lang, 'income_vs_exp')} />
      </section>

      <FinancialFutureLab data={data} onNav={onNav} compact />

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <FriendlyNudgeCard nudge={data.nudge} onAction={() => onNav('plan')} actionLabel={t(lang, 'view_plan')} />
          <Card className="rr-dash-card p-5">
            <div className="rr-dash-card-head"><div><span className="rr-mini-label">AI NOTE</span><h2>Friendly AI insight</h2></div><Button size="sm" variant="outline" onClick={genInsight} disabled={insightBusy}>{insightBusy ? <Loader2 size={14} className="animate-spin" /> : 'Generate'}</Button></div>
            {insight ? <div className="mt-3 space-y-2 text-sm"><p>{insight.insight}</p><p className="text-muted-foreground"><span className="font-medium text-foreground">Try this:</span> {insight.suggested_action}</p>{insight.estimated_monthly_saving > 0 && <p>Approx. saving: <span className="font-semibold text-emerald-600">{formatINR(insight.estimated_monthly_saving)}/mo</span></p>}</div> : <p className="text-sm text-muted-foreground mt-3">Turn your verified numbers into one practical tip — never a shame spiral.</p>}
          </Card>
        </div>

        <div className="space-y-4">
          {activeGoal ? <SavingsGoalCard goal={activeGoal} lang={lang} onContribute={() => onNav('goals')} onOpen={() => onNav('goals')} /> : <Card className="rr-dash-card p-5"><p className="text-sm text-muted-foreground">No goals yet. <button className="text-primary underline" onClick={() => onNav('goals')}>Add your first goal</button>.</p></Card>}
          <Card className="rr-dash-card p-5">
            <div className="rr-dash-card-head"><div><span className="rr-mini-label">RECEIPTS</span><h2>Recent money moves</h2></div><button className="rr-inline-link" onClick={() => onNav('receipts')}>All receipts <ArrowRight size={13} /></button></div>
            {data.recent_receipts?.length ? data.recent_receipts.slice(0, 4).map((r) => <div key={r.id} className="rr-receipt-row"><span><strong>{r.merchant || 'Receipt'}</strong><small>{r.category}</small></span><strong>{formatINR(r.total)}</strong></div>) : <p className="text-sm text-muted-foreground">{t(lang, 'empty_receipts')}</p>}
          </Card>
        </div>
      </section>

      <Card className="rr-dash-card p-5">
        <div className="rr-dash-card-head"><div><span className="rr-mini-label">SUPPORT MAP</span><h2>Options worth exploring</h2></div><button className="rr-inline-link" onClick={() => onNav('options')}>See all <ArrowRight size={13} /></button></div>
        <div className="grid sm:grid-cols-3 gap-3">
          {data.schemes_preview?.map((s2) => <button key={s2.id} onClick={() => onNav('options')} className="rr-scheme-tile"><span>{s2.scheme_name}</span><Badge className="rr-scheme-badge">{t(lang, 'potentially_relevant')}</Badge><small>{s2.purpose}</small></button>)}
        </div>
      </Card>
    </div>
  );
}

export default Dashboard;
