'use client';
import { Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GROW } from '@/lib/constants/testIds/grow';

export function CategoryCards({ result }) {
  if (!result?.categories?.length) return null;
  return (
    <section className="space-y-3" data-testid={GROW.categorySection}>
      <div>
        <h2 className="text-lg font-semibold">Category exploration</h2>
        <p className="text-sm text-muted-foreground">Educational categories based on your goal, horizon, and risk comfort — not a buy list.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {result.categories.map((c) => (
          <Card key={c.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-tight">{c.name}</h3>
              <Badge variant="secondary">{c.shortLabel}</Badge>
            </div>
            <p className="text-sm">{c.description}</p>
            <p className="text-xs text-muted-foreground">{c.volatilityNote}</p>
            <div className="flex items-start gap-1.5 text-xs rounded-lg bg-secondary/70 px-3 py-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span><span className="font-medium text-foreground">Why you’re seeing this: </span>{c.whyShown}</span>
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-4" data-testid={GROW.explanation}>
        <h3 className="font-semibold mb-1">Why you’re seeing these categories</h3>
        <p className="text-sm text-muted-foreground">{result.explanation}</p>
      </Card>
    </section>
  );
}
