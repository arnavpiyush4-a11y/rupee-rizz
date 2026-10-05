'use client';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/format';
import { EXAMPLE_PRODUCTS_BANNER } from '@/lib/grow/exampleProducts';
import { GROW } from '@/lib/constants/testIds/grow';
import { TermTooltip } from '@/components/rupee/grow/TermTooltip';

function renderPerfValue(val) {
  if (val === null || val === undefined || val === '') {
    return <span className="text-muted-foreground font-normal text-xs">Not available</span>;
  }
  const isNegative = typeof val === 'string' && val.startsWith('-');
  return (
    <span className={`font-semibold text-sm ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
      {val}
    </span>
  );
}

export function ExampleProductCards({ products = [] }) {
  return (
    <section className="space-y-3" data-testid={GROW.productsSection}>
      <div>
        <h2 className="text-lg font-semibold">Example products</h2>
        <p className="text-sm text-muted-foreground">{EXAMPLE_PRODUCTS_BANNER}</p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <span>
          <strong>Educational Notice:</strong> Past performance does not guarantee future returns. Historical returns are shown for educational purposes.
        </span>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">No example products in the categories currently shown.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {products.map((p) => {
            const perf = p.historicalPerformance || {};
            return (
              <Card key={p.id} className="p-4 space-y-3.5 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-base leading-tight">{p.fundName}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {p.amc} · {p.categoryName || p.categoryId}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 font-medium">
                      <TermTooltip termKey="directGrowth" customLabel={p.planType} />
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>

                  {/* Historical Returns */}
                  <div className="bg-muted/40 rounded-lg p-2.5 border text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-muted-foreground font-medium pb-1 border-b">
                      <TermTooltip termKey="historicalReturn" customLabel="Historical Performance" />
                      <span className="text-[11px]">As of {perf.asOfDate || 'N/A'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center pt-0.5">
                      <div>
                        <div className="text-[11px] text-muted-foreground">
                          <TermTooltip termKey="return1Y" customLabel="1Y Return" />
                        </div>
                        <div>{renderPerfValue(perf.return1Y)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">
                          <TermTooltip termKey="cagr3Y" customLabel="3Y CAGR" />
                        </div>
                        <div>{renderPerfValue(perf.cagr3Y)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">
                          <TermTooltip termKey="cagr5Y" customLabel="5Y CAGR" />
                        </div>
                        <div>{renderPerfValue(perf.cagr5Y)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Fund Details */}
                  <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                    <div>
                      <div className="text-[11px] text-muted-foreground">
                        <TermTooltip termKey="riskometer" customLabel="SEBI Riskometer" />
                      </div>
                      <div className="font-medium">{p.riskLevel}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">
                        <TermTooltip termKey="minSip" customLabel="Min. SIP" />
                      </div>
                      <div className="font-medium">{formatINR(p.minimumSip)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">
                        <TermTooltip termKey="minLumpsum" customLabel="Min. Lumpsum" />
                      </div>
                      <div className="font-medium">{formatINR(p.minimumLumpsum)}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <a href={p.officialWebsiteUrl} target="_blank" rel="noopener noreferrer" className="block w-full">
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      Official AMC fund details <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </a>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}


