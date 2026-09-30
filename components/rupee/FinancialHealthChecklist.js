'use client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertTriangle, Pencil } from 'lucide-react';
import { formatINR } from '@/lib/format';

function Row({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {ok === true && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        {ok === false && <XCircle className="h-4 w-4 text-rose-500" />}
        {value}
      </span>
    </div>
  );
}

// Transparent checklist — the primary UI (not a hidden credit score).
export function FinancialHealthChecklist({ checklist, onRecalculate }) {
  if (!checklist) return null;
  const c = checklist;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Financial Health Checklist</h3>
        {onRecalculate && <Button size="sm" variant="outline" onClick={onRecalculate}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit & recalculate</Button>}
      </div>
      <Row label="Emergency fund started" ok={c.emergency_fund_started} value={c.emergency_fund_started ? `${formatINR(c.emergency_amount)} / ${formatINR(c.emergency_target)}` : 'Not yet'} />
      <Row label="Estimated monthly saving capacity" value={formatINR(c.estimated_monthly_saving)} ok={c.estimated_monthly_saving > 0} />
      <Row label="Non-essential spending" value={formatINR(c.non_essential_spending)} />
      <Row label="EMI burden" value={`${formatINR(c.emi_burden)} (${c.emi_burden_pct}% of income)`} ok={c.emi_burden_pct <= 30} />
      <Row label="Receipt data needing verification" ok={!c.data_correction_needed} value={c.data_correction_needed ? 'Yes' : 'No'} />
      {c.data_correction_needed && (
        <div className="mt-3 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> Some receipt data still needs verifying before it affects your plan.
        </div>
      )}
    </Card>
  );
}

export default FinancialHealthChecklist;
