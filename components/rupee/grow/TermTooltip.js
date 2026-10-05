'use client';

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FINANCIAL_DEFINITIONS } from '@/lib/grow/glossary';

export function TermTooltip({ termKey, customLabel, children }) {
  const item = FINANCIAL_DEFINITIONS[termKey];
  if (!item) return children || <span>{customLabel}</span>;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 cursor-help group focus:outline-none focus:ring-1 focus:ring-primary rounded px-0.5 text-left"
            aria-label={`Definition for ${item.term}`}
          >
            {children || <span>{customLabel || item.term}</span>}
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-primary transition-colors shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs p-2.5 bg-slate-900 text-slate-50 border border-slate-800 shadow-md">
          <p className="font-semibold text-amber-300 mb-0.5">{item.term}</p>
          <p className="leading-snug text-slate-200">{item.definition}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
