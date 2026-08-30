'use client';
import { formatINR } from '@/lib/format';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const CHART_COLORS = [
  'hsl(168 72% 40%)', 'hsl(150 58% 45%)', 'hsl(38 92% 55%)',
  'hsl(215 55% 45%)', 'hsl(262 52% 62%)', 'hsl(200 30% 60%)', 'hsl(20 80% 60%)',
];

export function Money({ value, className = '' }) {
  return <span className={className}>{formatINR(value)}</span>;
}

const toneMap = {
  default: 'text-foreground',
  positive: 'text-emerald-600',
  warn: 'text-amber-600',
  risk: 'text-rose-600',
  navy: 'text-slate-700',
};

export function StatCard({ icon: Icon, label, value, sub, tone = 'default' }) {
  return (
    <Card className="p-4 flex items-start gap-3">
      {Icon && (
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Icon className={`h-5 w-5 ${toneMap[tone] || ''}`} />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className={`text-lg font-semibold ${toneMap[tone] || ''}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </Card>
  );
}

export function SectionTitle({ title, subtitle, icon: Icon, action }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-5 w-5 text-primary" />}
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 rounded-xl border border-dashed">
      {Icon && <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-3"><Icon className="h-6 w-6 text-primary" /></div>}
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading\u2026' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function ProgressBar({ value = 0, tone = 'primary' }) {
  const v = Math.max(0, Math.min(100, value));
  const bg = tone === 'primary' ? 'bg-primary' : tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
      <div className={`h-full rounded-full ${bg} transition-all`} style={{ width: `${v}%` }} />
    </div>
  );
}
