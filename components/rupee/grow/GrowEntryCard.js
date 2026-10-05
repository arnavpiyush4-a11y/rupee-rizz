'use client';
import { Sprout, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/format';
import { GROW } from '@/lib/constants/testIds/grow';

export function GrowEntryCard({ safeMonthlySaving = 0, onOpen, compact = false }) {
  return (
    <Card
      className={compact
        ? 'overflow-hidden border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card p-5'
        : 'p-5'}
      data-testid={GROW.entryCard}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Grow your savings</h2>
            <Badge variant="secondary">Explore</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Your safe monthly saving</p>
          <p className="text-2xl font-semibold text-emerald-600" data-testid={GROW.entryAmount}>{formatINR(safeMonthlySaving)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Want to grow it? Explore how categories work — this is a simulation, not a new budget.</p>
        </div>
        <Button onClick={onOpen} className="shrink-0 gap-2" data-testid={GROW.entryCta}>
          Explore investment options <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

export default GrowEntryCard;
