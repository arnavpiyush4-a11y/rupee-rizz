'use client';

import { BookOpen, HelpCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { GLOSSARY_LIST } from '@/lib/grow/glossary';

export function InvestmentGlossary() {
  return (
    <section className="space-y-3 pt-2 border-t">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Investment Glossary</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Short, beginner-friendly definitions of key financial terms used across RupeeRizz.
      </p>

      <Card className="p-4">
        <div className="grid md:grid-cols-2 gap-3">
          {GLOSSARY_LIST.map((item) => (
            <div key={item.key} className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5 text-sm">
                <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                {item.term}
              </div>
              <p className="text-muted-foreground leading-relaxed pl-5.5">{item.definition}</p>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

export default InvestmentGlossary;
