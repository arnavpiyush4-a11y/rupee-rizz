'use client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Target, Calendar, TrendingUp, CheckCircle2, Circle } from 'lucide-react';
import { formatINR, formatDate } from '@/lib/format';
import { ProgressBar } from './common';

// Rich goal card: progress, milestones, safe vs required contribution, gap, actions.
export function SavingsGoalCard({ goal, lang = 'en', onContribute, onOpen, compact = false }) {
  if (!goal) return null;
  const m = goal.metrics || {};
  const rec = goal.recommended_monthly ?? m.safeContribution ?? 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center"><Target className="h-5 w-5 text-primary" /></div>
          <div>
            <div className="font-semibold leading-tight">{goal.goal_name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> {goal.target_date ? formatDate(goal.target_date, lang) : 'No target date'}</div>
          </div>
        </div>
        <Badge variant="secondary" className="text-emerald-700">{m.progressPct ?? 0}%</Badge>
      </div>

      <div className="mt-4">
        <ProgressBar value={m.progressPct ?? 0} />
        <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
          <span>{formatINR(m.saved ?? goal.current_saved_amount)} saved</span>
          <span>{formatINR(goal.goal_amount)}</span>
        </div>
      </div>

      {!compact && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-muted-foreground text-xs">Remaining</div><div className="font-medium">{formatINR(m.remaining ?? 0)}</div></div>
          <div><div className="text-muted-foreground text-xs">Recommended / mo</div><div className="font-medium text-emerald-600">{formatINR(rec)}</div></div>
          <div><div className="text-muted-foreground text-xs">Required / mo</div><div className="font-medium">{m.requiredMonthly != null ? formatINR(m.requiredMonthly) : '\u2014'}</div></div>
          <div><div className="text-muted-foreground text-xs">Est. completion</div><div className="font-medium">{m.estDate ? formatDate(m.estDate, lang) : '\u2014'}</div></div>
        </div>
      )}

      {!compact && m.gap > 0 && (
        <div className="mt-3 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" /> Shortfall of {formatINR(m.gap)}/mo vs your target date. We won&apos;t over-allocate {'\u2014'} consider a later date or smaller milestone.
        </div>
      )}

      {!compact && Array.isArray(m.milestones) && (
        <div className="mt-4 flex items-center justify-between">
          {m.milestones.map((ms) => (
            <div key={ms.pct} className="flex flex-col items-center gap-1">
              {ms.reached ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground/40" />}
              <span className={`text-[10px] ${ms.reached ? 'text-emerald-600' : 'text-muted-foreground'}`}>{ms.pct}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {onContribute && <Button size="sm" onClick={() => onContribute(goal)}>Add saving</Button>}
        {onOpen && <Button size="sm" variant="outline" onClick={() => onOpen(goal)}>Details</Button>}
      </div>
    </Card>
  );
}

export default SavingsGoalCard;
