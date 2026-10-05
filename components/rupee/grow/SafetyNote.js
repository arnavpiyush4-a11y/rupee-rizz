'use client';
import { AlertTriangle, Info } from 'lucide-react';
import { formatINR } from '@/lib/format';

export function GrowSimulationNote({ className = '' }) {
  return (
    <div className={`rounded-lg border bg-secondary/50 px-3 py-2.5 text-sm text-muted-foreground flex gap-2 ${className}`}>
      <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
      <p>
        This is an <span className="font-medium text-foreground">educational simulation</span> based on your
        safe monthly saving capacity. It is not extra cash, and it does not reallocate your existing savings plan.
      </p>
    </div>
  );
}

export function GrowSafetyNote() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1.5">
      <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> Financial safety note</div>
      <ul className="list-disc pl-5 space-y-1 text-amber-900/90">
        <li>RupeeRizz is for financial-health education. We do not execute investments, open accounts, or process payments.</li>
        <li>Projections are illustrative. Actual returns vary and can be negative. Nothing here is guaranteed.</li>
        <li>Example products are not ranked, not “best”, and have no live NAVs, ratings, or performance figures.</li>
        <li>This is not personalised investment advice. Verify every scheme and platform on official sources.</li>
      </ul>
    </div>
  );
}

export function EmergencyExploreWarning({ emergency, format = formatINR }) {
  if (!emergency || emergency.amount >= emergency.target) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex gap-2">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <p>
        Your emergency buffer ({format(emergency.amount)}) is still below the one-month essentials target ({format(emergency.target)}).
        Exploring growth is optional learning — it does not replace building that buffer in your savings plan.
      </p>
    </div>
  );
}
