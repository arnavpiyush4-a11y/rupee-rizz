'use client';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { INVESTMENT_GOALS, HORIZONS, RISK_COMFORT } from '@/lib/grow/types';
import { GROW } from '@/lib/constants/testIds/grow';

function OptionGrid({ name, value, onChange, options, testid }) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onChange}
      className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2"
      aria-label={name}
      data-testid={testid}
    >
      {options.map((opt) => {
        const id = `${name}-${opt.id}`;
        const selected = value === opt.id;
        return (
          <Label
            key={opt.id}
            htmlFor={id}
            className={`flex items-start gap-2 rounded-lg border-2 p-3 cursor-pointer font-normal ${
              selected ? 'border-primary bg-secondary' : 'border-border hover:bg-secondary/40'
            }`}
          >
            <RadioGroupItem value={opt.id} id={id} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">{opt.label}</span>
              {opt.description && <span className="block text-xs text-muted-foreground mt-0.5">{opt.description}</span>}
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

export function PreferenceSelectors({
  investmentGoal, horizon, riskComfort,
  onGoal, onHorizon, onRisk,
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Investment goal</h2>
        <p className="text-sm text-muted-foreground">What you are exploring — not an order to place.</p>
        <OptionGrid name="grow-goal" value={investmentGoal} onChange={onGoal} options={INVESTMENT_GOALS} testid={GROW.goalGroup} />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Investment horizon</h2>
        <p className="text-sm text-muted-foreground">How long the money could stay invested in this thought experiment.</p>
        <OptionGrid name="grow-horizon" value={horizon} onChange={onHorizon} options={HORIZONS} testid={GROW.horizonGroup} />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Risk comfort</h2>
        <p className="text-sm text-muted-foreground">
          Labels follow everyday SEBI Riskometer wording (Low to Very High). This is your comfort choice, not an official regulatory score.
        </p>
        <OptionGrid
          name="grow-risk"
          value={riskComfort}
          onChange={onRisk}
          options={RISK_COMFORT.map((r) => ({ id: r.id, label: r.label, description: r.sebiHint }))}
          testid={GROW.riskGroup}
        />
      </section>
    </div>
  );
}
