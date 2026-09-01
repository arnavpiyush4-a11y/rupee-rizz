'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HeartPulse, ShieldAlert, ShieldCheck, Info } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { scoreBandLabel } from '@/lib/finance';
import { Loading, ProgressBar } from '@/components/rupee/common';
import { FinancialHealthChecklist } from '@/components/rupee/FinancialHealthChecklist';

const GUARD_LABELS = {
  surplus_non_positive: 'no monthly surplus yet',
  emergency_below_target: 'emergency buffer below one month of essentials',
  emi_over_30pct: 'EMIs would exceed 30% of reliable income',
};

export function FinancialHealthView({ onNav }) {
  const { lang } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api('/financial-health'); setData(d); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!data) return null;
  const { score, band, breakdown, checklist, guard } = data;
  const safe = guard?.canBorrow;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t(lang, 'fin_health')}</h1><p className="text-muted-foreground text-sm">A transparent checklist — not a hidden credit score.</p></div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-6 flex flex-col items-center justify-center text-center">
          <div className="relative h-32 w-32 rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${score * 3.6}deg, hsl(var(--secondary)) 0deg)` }}>
            <div className="absolute inset-2 rounded-full bg-card flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">{score}</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
          </div>
          <div className="mt-3 font-semibold">{t(lang, 'readiness_score')}</div>
          <div className="text-sm text-primary font-medium">{scoreBandLabel(band)}</div>
          <p className="text-xs text-muted-foreground mt-2">{t(lang, 'score_note')}</p>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3">How your score is built</h3>
          <div className="space-y-3">
            {breakdown.map((b) => (
              <div key={b.key}>
                <div className="flex items-center justify-between text-sm">
                  <span>{b.label}</span>
                  <span className="font-medium">{b.points}/{b.max}</span>
                </div>
                <div className="mt-1"><ProgressBar value={(b.points / b.max) * 100} /></div>
                <p className="text-xs text-muted-foreground mt-1">{b.note}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <FinancialHealthChecklist checklist={checklist} onRecalculate={() => onNav('plan')} />

      <Card className={`p-5 border-2 ${safe ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center gap-2 font-semibold">
          {safe ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}
          {safe ? 'You look reasonably prepared' : t(lang, 'do_not_borrow')}
        </div>
        <p className="text-sm mt-1 text-muted-foreground">
          {safe
            ? 'If you ever consider credit, keep EMIs within a safe share of income and verify lender conditions. Explore safer options first.'
            : `We gently suggest waiting because: ${(guard?.reasons || []).map((r) => GUARD_LABELS[r] || r).join('; ')}. Build surplus and an emergency buffer, and explore support first.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onNav('before-you-borrow')}>See Before You Borrow</Button>
          <Button size="sm" variant="outline" onClick={() => onNav('options')}>Explore support</Button>
        </div>
      </Card>

      <div className="flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5 mt-0.5" /> This assessment uses only your verified, consented data. It is for self-improvement and never implies loan approval or rejection.</div>
    </div>
  );
}

export default FinancialHealthView;
