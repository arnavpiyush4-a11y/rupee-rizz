'use client';
import { ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PLATFORMS, PLATFORM_DISCLAIMER } from '@/lib/grow/platforms';
import { GROW } from '@/lib/constants/testIds/grow';

export function PlatformCards() {
  return (
    <section className="space-y-3" data-testid={GROW.platformsSection}>
      <div>
        <h2 className="text-lg font-semibold">Where can I invest?</h2>
        <p className="text-sm text-muted-foreground">{PLATFORM_DISCLAIMER}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {PLATFORMS.map((p) => (
          <Card key={p.id} className="p-4 space-y-2">
            <div>
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-xs text-muted-foreground">{p.kind} · Unaffiliated</p>
            </div>
            <p className="text-sm">{p.description}</p>
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline">Official site <ExternalLink className="h-3.5 w-3.5 ml-1" /></Button>
            </a>
          </Card>
        ))}
      </div>
    </section>
  );
}
