'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Wallet, CheckCircle2, AlertTriangle, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { formatINR, formatDate } from '@/lib/format';
import { Loading, ProgressBar } from '@/components/rupee/common';

export function ReadinessReport({ onNav }) {
  const { lang } = useApp();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api('/readiness-report'); setReport(d.report); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!report) return null;
  const r = report;
  const totalSpend = (r.spending_by_category || []).reduce((s, c) => s + c.amount, 0);
  const userTypeLabel = r.user_type === 'micro_entrepreneur' ? 'Micro-entrepreneur' : 'Student';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Button variant="ghost" size="sm" onClick={() => onNav('dashboard')}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print / Download PDF</Button>
      </div>

      <div className="rr-report bg-white text-slate-800 rounded-xl border p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2 font-extrabold text-xl">
            <span className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Wallet className="h-5 w-5" /></span>
            Rupee<span className="text-primary">Rizz</span>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>Financial Readiness Report</div>
            <div>{formatDate(r.generated_at, lang)}</div>
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{r.name || 'Friend'}</h1>
            <p className="text-sm text-slate-500">{userTypeLabel}{r.state ? ` · ${r.state}` : ''}{r.business_type ? ` · ${r.business_type}` : ''}</p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black text-primary">{r.score}<span className="text-lg text-slate-400">/100</span></div>
            <div className="text-xs font-medium text-slate-600">{r.band_label}</div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">For self-improvement only. This is not a credit score and never implies loan approval or rejection.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <Stat label="Reliable income" value={formatINR(r.snapshot.reliable_monthly_income)} />
          <Stat label="Monthly surplus" value={formatINR(r.snapshot.monthly_surplus)} />
          <Stat label="Safe saving / mo" value={formatINR(r.snapshot.safe_monthly_saving)} />
          <Stat label="Emergency buffer" value={`${formatINR(r.emergency.amount)} / ${formatINR(r.emergency.target)}`} />
        </div>

        <Section title="How the score is built">
          <div className="space-y-2">
            {r.breakdown.map((b) => (
              <div key={b.key}>
                <div className="flex justify-between text-sm"><span>{b.label}</span><span className="font-medium">{b.points}/{b.max}</span></div>
                <ProgressBar value={(b.points / b.max) * 100} />
              </div>
            ))}
          </div>
        </Section>

        <div className="grid md:grid-cols-2 gap-4">
          <Section title="Spending summary">
            {(r.spending_by_category || []).length ? (
              <div className="space-y-1.5 text-sm">
                {r.spending_by_category.slice(0, 6).map((c) => (
                  <div key={c.name} className="flex justify-between"><span className="text-slate-600">{c.name}</span><span className="font-medium">{formatINR(c.amount)}</span></div>
                ))}
                <div className="flex justify-between border-t pt-1.5 font-semibold"><span>Total (from receipts)</span><span>{formatINR(totalSpend)}</span></div>
              </div>
            ) : <p className="text-sm text-slate-500">No receipt spending recorded yet.</p>}
          </Section>

          <Section title="Savings & goal progress">
            {(r.goals || []).length ? r.goals.map((g, i) => (
              <div key={i} className="mb-3">
                <div className="flex justify-between text-sm"><span className="font-medium">{g.goal_name}</span><span>{g.progressPct}%</span></div>
                <ProgressBar value={g.progressPct} />
                <div className="text-xs text-slate-500 mt-1">{formatINR(g.saved)} of {formatINR(g.amount)} · recommended {formatINR(g.recommended_monthly)}/mo</div>
              </div>
            )) : <p className="text-sm text-slate-500">No goals set yet.</p>}
          </Section>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Section title="Strengths">
            {(r.strengths || []).length ? (
              <ul className="space-y-1.5 text-sm">{r.strengths.map((s, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />{s.label}</li>)}</ul>
            ) : <p className="text-sm text-slate-500">Keep going - strengths will appear as your plan improves.</p>}
          </Section>
          <Section title="Areas to improve">
            {(r.improvements || []).length ? (
              <ul className="space-y-1.5 text-sm">{r.improvements.map((s, i) => <li key={i} className="flex gap-2"><AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />{s.label}</li>)}</ul>
            ) : <p className="text-sm text-slate-500">No major gaps - nicely balanced!</p>}
          </Section>
        </div>

        <Section title="Actionable suggestions">
          <ul className="space-y-1.5 text-sm">
            {(r.suggestions || []).map((s, i) => <li key={i} className="flex gap-2"><TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />{s}</li>)}
            {(!r.suggestions || !r.suggestions.length) && <li className="text-slate-500">You are on track - keep saving consistently.</li>}
          </ul>
        </Section>

        <p className="text-[11px] text-slate-400 mt-6 border-t pt-3">Generated by RupeeRizz from your own verified data. For guidance only; verify scheme and lender conditions from official sources. We do not push loans.</p>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (<div className="rounded-lg bg-slate-50 border p-3"><div className="text-xs text-slate-500">{label}</div><div className="font-semibold">{value}</div></div>);
}
function Section({ title, children }) {
  return (<div className="mt-5"><h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500 mb-2">{title}</h3>{children}</div>);
}

export default ReadinessReport;
