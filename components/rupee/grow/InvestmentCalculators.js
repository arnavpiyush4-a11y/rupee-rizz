'use client';

import { useState, useEffect, useMemo } from 'react';
import { Calculator, Info, TrendingUp, PiggyBank, Coins } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatINR } from '@/lib/format';
import { projectSip, projectLumpsum } from '@/lib/grow/calculators';
import { GROW } from '@/lib/constants/testIds/grow';
import { ProjectionChart } from '@/components/rupee/grow/ProjectionChart';
import { TermTooltip } from '@/components/rupee/grow/TermTooltip';

export function InvestmentCalculators({ exploreAmount = 0 }) {
  const defaultAmount = Math.max(0, Number(exploreAmount) || 0);

  const [mode, setMode] = useState('sip');

  // SIP Calculator State
  const [sipAmount, setSipAmount] = useState(defaultAmount);
  const [sipYears, setSipYears] = useState(10);
  const [sipRate, setSipRate] = useState(10);

  // Lumpsum Calculator State
  const [lumpsumAmount, setLumpsumAmount] = useState(defaultAmount);
  const [lumpsumYears, setLumpsumYears] = useState(10);
  const [lumpsumRate, setLumpsumRate] = useState(10);

  // Keep state updated if exploreAmount changes from parent
  useEffect(() => {
    if (exploreAmount !== undefined && exploreAmount !== null) {
      const amt = Math.max(0, Number(exploreAmount) || 0);
      setSipAmount(amt);
      setLumpsumAmount(amt);
    }
  }, [exploreAmount]);

  // SIP Calculation
  const sipResult = useMemo(() => {
    const amount = Math.max(0, Number(sipAmount) || 0);
    const years = Math.max(0, Math.min(50, Number(sipYears) || 0));
    const rate = Math.max(0, Math.min(30, Number(sipRate) || 0)) / 100;
    return projectSip({
      monthlyInvestment: amount,
      annualReturnAssumption: rate,
      durationYears: years,
    });
  }, [sipAmount, sipYears, sipRate]);

  // Lumpsum Calculation
  const lumpsumResult = useMemo(() => {
    const amount = Math.max(0, Number(lumpsumAmount) || 0);
    const years = Math.max(0, Math.min(50, Number(lumpsumYears) || 0));
    const rate = Math.max(0, Math.min(30, Number(lumpsumRate) || 0)) / 100;
    return projectLumpsum({
      initialInvestment: amount,
      annualReturnAssumption: rate,
      durationYears: years,
    });
  }, [lumpsumAmount, lumpsumYears, lumpsumRate]);

  return (
    <section className="space-y-4" data-testid={GROW.calculatorSection}>
      <div>
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Growth calculators</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Simulate potential future growth for SIP (monthly) or Lumpsum (one-time) investments using illustrative rates.
        </p>
      </div>

      <Card className="p-5">
        <Tabs defaultValue="sip" value={mode} onValueChange={setMode} className="w-full space-y-5">
          <TabsList className="grid w-full grid-cols-2 max-w-xs">
            <TabsTrigger value="sip" data-testid={GROW.sipTab}>
              <TermTooltip termKey="sip" customLabel="SIP Calculator" />
            </TabsTrigger>
            <TabsTrigger value="lumpsum" data-testid={GROW.lumpsumTab}>
              <TermTooltip termKey="lumpsum" customLabel="Lumpsum Calculator" />
            </TabsTrigger>
          </TabsList>

          {/* SIP Tab */}
          <TabsContent value="sip" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Inputs */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="sip-amount" className="text-xs font-medium">Monthly Investment (₹)</Label>
                  <Input
                    id="sip-amount"
                    type="number"
                    min="0"
                    step="500"
                    value={sipAmount}
                    onChange={(e) => setSipAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="sip-years" className="text-xs font-medium">Investment Duration (Years)</Label>
                  <Input
                    id="sip-years"
                    type="number"
                    min="0"
                    max="50"
                    value={sipYears}
                    onChange={(e) => setSipYears(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sip-rate" className="text-xs font-medium">Assumed annual return — illustrative only</Label>
                    <span className="text-xs font-semibold text-primary">{sipRate}%</span>
                  </div>
                  <Input
                    id="sip-rate"
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    value={sipRate}
                    onChange={(e) => setSipRate(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* Output Summary */}
              <div className="bg-muted/40 border rounded-xl p-5 flex flex-col justify-between space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  SIP Projection Summary
                </h3>

                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <PiggyBank className="h-4 w-4" /> Total Amount Invested
                    </span>
                    <span className="font-semibold text-foreground">{formatINR(sipResult.totalInvested)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Estimated Growth
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatINR(sipResult.growth)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <span className="font-medium text-foreground">Illustrative Future Value</span>
                    <span className="font-bold text-lg text-primary">{formatINR(sipResult.estimatedValue)}</span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground flex items-start gap-1 pt-2 border-t">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  This calculator uses an assumed rate for illustration. It is not a prediction or guarantee of future returns.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Lumpsum Tab */}
          <TabsContent value="lumpsum" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Inputs */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="lumpsum-amount" className="text-xs font-medium">Initial Investment (₹)</Label>
                  <Input
                    id="lumpsum-amount"
                    type="number"
                    min="0"
                    step="1000"
                    value={lumpsumAmount}
                    onChange={(e) => setLumpsumAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="lumpsum-years" className="text-xs font-medium">Investment Duration (Years)</Label>
                  <Input
                    id="lumpsum-years"
                    type="number"
                    min="0"
                    max="50"
                    value={lumpsumYears}
                    onChange={(e) => setLumpsumYears(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="lumpsum-rate" className="text-xs font-medium">Assumed annual return — illustrative only</Label>
                    <span className="text-xs font-semibold text-primary">{lumpsumRate}%</span>
                  </div>
                  <Input
                    id="lumpsum-rate"
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    value={lumpsumRate}
                    onChange={(e) => setLumpsumRate(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* Output Summary */}
              <div className="bg-muted/40 border rounded-xl p-5 flex flex-col justify-between space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Lumpsum Projection Summary
                </h3>

                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <PiggyBank className="h-4 w-4" /> Total Amount Invested
                    </span>
                    <span className="font-semibold text-foreground">{formatINR(lumpsumResult.totalInvested)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Estimated Growth
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatINR(lumpsumResult.growth)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <span className="font-medium text-foreground">Illustrative Future Value</span>
                    <span className="font-bold text-lg text-primary">{formatINR(lumpsumResult.estimatedValue)}</span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground flex items-start gap-1 pt-2 border-t">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  This calculator uses an assumed rate for illustration. It is not a prediction or guarantee of future returns.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <ProjectionChart
        exploreAmount={mode === 'sip' ? sipAmount : lumpsumAmount}
        initialMode={mode}
        initialYears={mode === 'sip' ? sipYears : lumpsumYears}
      />
    </section>
  );
}

export default InvestmentCalculators;


