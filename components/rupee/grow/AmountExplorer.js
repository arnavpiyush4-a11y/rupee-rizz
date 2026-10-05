'use client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/format';
import { AMOUNT_PRESETS } from '@/lib/grow/types';
import { GrowSimulationNote } from './SafetyNote';
import { GROW } from '@/lib/constants/testIds/grow';

export function AmountExplorer({
  safeMonthlySaving = 0,
  mode,
  customAmount,
  exploreAmount,
  onMode,
  onCustomAmount,
}) {
  const disabled = safeMonthlySaving <= 0;
  return (
    <section className="space-y-3" data-testid={GROW.amountSection}>
      <div>
        <h2 className="text-lg font-semibold">Amount to explore</h2>
        <p className="text-sm text-muted-foreground">Choose a share of your safe monthly saving to model. Nothing is invested or moved.</p>
      </div>
      <GrowSimulationNote />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Share of safe monthly saving">
        {AMOUNT_PRESETS.map((p) => {
          const selected = mode === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onMode(p.id)}
              data-testid={GROW.amountPreset(p.id)}
              className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                selected ? 'border-primary bg-secondary text-primary' : 'border-border hover:bg-secondary/60'
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={mode === 'custom'}
          onClick={() => onMode('custom')}
          data-testid={GROW.amountCustomToggle}
          className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
            mode === 'custom' ? 'border-primary bg-secondary text-primary' : 'border-border hover:bg-secondary/60'
          }`}
        >
          Custom
        </button>
      </div>
      {mode === 'custom' && !disabled && (
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="grow-custom-amount">Custom monthly amount (₹)</Label>
          <Input
            id="grow-custom-amount"
            type="number"
            min={0}
            max={safeMonthlySaving}
            value={customAmount}
            onChange={(e) => onCustomAmount(e.target.value)}
            data-testid={GROW.amountCustomInput}
          />
        </div>
      )}
      <p className="text-sm" data-testid={GROW.exploreAmount}>
        Exploring <span className="font-semibold text-emerald-600">{formatINR(exploreAmount)}</span>
        {' '}per month of {formatINR(safeMonthlySaving)} safe monthly saving capacity.
      </p>
      {disabled && (
        <p className="text-sm text-amber-800">There is no safe monthly saving to model yet. Recalculate your plan first — you can still read the categories below.</p>
      )}
    </section>
  );
}
