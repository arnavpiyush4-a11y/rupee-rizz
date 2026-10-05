'use client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { formatINR } from '@/lib/format';

function impactText(v) {
  if (!v) return '—';
  const sign = v < 0 ? '−' : '+';
  return `${sign}${formatINR(Math.abs(v))}/mo`;
}

const GUARD_LABELS = {
  surplus_non_positive: 'no monthly surplus yet',
  emergency_below_target: 'emergency buffer below one month of essentials',
  emi_over_30pct: 'EMIs would exceed 30% of reliable income',
};

// Recommends options in a safe order and never says "approved".
export function BeforeYouBorrowComparison({ data, lang = 'en' }) {
  if (!data) return null;
  const { guard, options = [], goal } = data;
  const safe = guard?.canBorrow;
  return (
    <div className="space-y-4">
      <Card className={`p-5 border-2 ${safe ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center gap-2 font-semibold">
          {safe ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}
          {safe ? 'You look reasonably prepared to consider options' : 'Do not borrow yet'}
        </div>
        <p className="text-sm mt-1 text-muted-foreground">
          {safe
            ? 'Ordinary credit could be considered — but only after the safer steps below. Always verify official eligibility and lender conditions.'
            : `We gently suggest waiting because: ${(guard?.reasons || []).map((r) => GUARD_LABELS[r] || r).join('; ')}. Let\u2019s build the basics first.`}
        </p>
        {goal && <p className="text-xs mt-2">For goal: <span className="font-medium">{goal.goal_name}</span> ({formatINR(goal.goal_amount)})</p>}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Option</TableHead>
                <TableHead>Upfront</TableHead>
                <TableHead>Monthly impact</TableHead>
                <TableHead>Main benefit</TableHead>
                <TableHead>Important conditions</TableHead>
                <TableHead>Next safe action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {options.map((o) => (
                <TableRow key={o.rank} className={o.option === 'Do not borrow yet' ? 'bg-amber-50/60' : ''}>
                  <TableCell><Badge variant="secondary">{o.rank}</Badge></TableCell>
                  <TableCell className="font-medium min-w-[180px]">{o.option}</TableCell>
                  <TableCell>{o.upfront ? formatINR(o.upfront) : '—'}</TableCell>
                  <TableCell className={o.monthly_impact < 0 ? 'text-rose-600' : o.monthly_impact > 0 ? 'text-emerald-600' : ''}>{impactText(o.monthly_impact)}</TableCell>
                  <TableCell className="min-w-[160px] text-sm">{o.benefit}</TableCell>
                  <TableCell className="min-w-[180px] text-sm text-muted-foreground">{o.conditions}</TableCell>
                  <TableCell className="min-w-[180px] text-sm">{o.next_action}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">This option may be relevant. Please verify official eligibility and lender conditions. We never say you are approved or definitely eligible.</p>
    </div>
  );
}

export default BeforeYouBorrowComparison;
