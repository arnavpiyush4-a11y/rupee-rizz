'use client';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/format';

// Warm, supportive nudge (never shaming).
export function FriendlyNudgeCard({ nudge, onAction, actionLabel = 'Apply to goal' }) {
  if (!nudge) return null;
  return (
    <Card className="p-5 bg-gradient-to-br from-primary/10 to-emerald-50 border-primary/20">
      <div className="flex items-center gap-2 text-primary font-medium text-sm">
        <Sparkles className="h-4 w-4" /> Today&apos;s nudge
      </div>
      <p className="mt-2 font-semibold text-lg leading-snug">
        {nudge.text}{nudge.save ? <> {'\u2192'} save <span className="text-emerald-600">{formatINR(nudge.save)}</span></> : null}
      </p>
      {nudge.category && <p className="text-sm text-muted-foreground mt-1">Based on your recent {nudge.category} spending.</p>}
      {onAction && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onAction}>
          {actionLabel} <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      )}
    </Card>
  );
}

export default FriendlyNudgeCard;
