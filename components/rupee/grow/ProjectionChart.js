'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, TrendingUp } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { SCENARIOS } from '@/lib/grow/scenarios';
import { projectSip, projectLumpsum, projectionSeries } from '@/lib/grow/calculators';
import { GROW } from '@/lib/constants/testIds/grow';

export function ProjectionChart({ exploreAmount = 0, initialMode = 'sip', initialYears = 10 }) {
  const [mode, setMode] = useState(initialMode);
  const [durationYears, setDurationYears] = useState(initialYears);

  const amount = Math.max(0, Number(exploreAmount) || 0);
  const years = Math.max(0, Math.min(50, Number(durationYears) || 0));

  // Compute summary values for the 3 scenario cards
  const scenarioSummaries = useMemo(() => {
    return SCENARIOS.map((sc) => {
      const calcFn = mode === 'lumpsum' ? projectLumpsum : projectSip;
      const inputObj = mode === 'lumpsum'
        ? { initialInvestment: amount, annualReturnAssumption: sc.annualReturnAssumption, durationYears: years }
        : { monthlyInvestment: amount, annualReturnAssumption: sc.annualReturnAssumption, durationYears: years };
      const res = calcFn(inputObj);
      return {
        ...sc,
        totalInvested: res.totalInvested,
        estimatedValue: res.estimatedValue,
        growth: res.growth,
      };
    });
  }, [amount, years, mode]);

  // Compute dataset for Recharts line chart
  const chartData = useMemo(() => {
    const consSeries = projectionSeries({
      mode,
      monthlyInvestment: mode === 'sip' ? amount : 0,
      initialInvestment: mode === 'lumpsum' ? amount : 0,
      annualReturnAssumption: SCENARIOS[0].annualReturnAssumption,
      durationYears: years,
    });
    const modSeries = projectionSeries({
      mode,
      monthlyInvestment: mode === 'sip' ? amount : 0,
      initialInvestment: mode === 'lumpsum' ? amount : 0,
      annualReturnAssumption: SCENARIOS[1].annualReturnAssumption,
      durationYears: years,
    });
    const highSeries = projectionSeries({
      mode,
      monthlyInvestment: mode === 'sip' ? amount : 0,
      initialInvestment: mode === 'lumpsum' ? amount : 0,
      annualReturnAssumption: SCENARIOS[2].annualReturnAssumption,
      durationYears: years,
    });

    return consSeries.map((pt, idx) => ({
      label: pt.label,
      year: pt.year,
      'Total Invested': pt.invested,
      'Conservative (6%)': pt.illustrativeValue,
      'Moderate (10%)': modSeries[idx]?.illustrativeValue ?? 0,
      'Higher Growth (12%)': highSeries[idx]?.illustrativeValue ?? 0,
    }));
  }, [amount, years, mode]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" />
            Illustrative growth scenarios
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comparing 3 potential modelling rates over {years} years for {mode === 'sip' ? 'monthly SIP' : 'lumpsum'} of {formatINR(amount)}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('sip')}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              mode === 'sip'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            SIP Mode
          </button>
          <button
            type="button"
            onClick={() => setMode('lumpsum')}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              mode === 'lumpsum'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Lumpsum Mode
          </button>
        </div>
      </div>

      {/* Scenario Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {scenarioSummaries.map((sc) => {
          const pct = Math.round(sc.annualReturnAssumption * 100);
          return (
            <Card key={sc.id} className="p-3.5 space-y-2 border">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{sc.label}</span>
                <Badge variant="outline" className="text-xs font-medium">
                  {pct}% p.a.
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground leading-snug">{sc.description}</p>

              <div className="pt-1 text-xs space-y-1 border-t">
                <div className="flex justify-between text-muted-foreground">
                  <span>Duration:</span>
                  <span className="font-medium text-foreground">{years} years</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Contributed:</span>
                  <span className="font-medium text-foreground">{formatINR(sc.totalInvested)}</span>
                </div>
                <div className="flex justify-between pt-0.5 font-medium">
                  <span>Future Value:</span>
                  <span className="font-bold text-primary">{formatINR(sc.estimatedValue)}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Recharts Line Chart */}
      <Card className="p-4 space-y-3" data-testid={GROW.chart}>
        <div className="h-[320px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" stroke="currentColor" className="text-[11px] text-muted-foreground" />
              <YAxis
                stroke="currentColor"
                className="text-[11px] text-muted-foreground"
                tickFormatter={(val) => (val >= 100000 ? `₹${(val / 100000).toFixed(1)}L` : `₹${val}`)}
              />
              <Tooltip
                formatter={(val, name) => [formatINR(val), name]}
                labelFormatter={(label) => `Time: ${label}`}
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                  color: '#0f172a',
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
              <Line type="monotone" dataKey="Total Invested" stroke="#64748b" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="Conservative (6%)" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Moderate (10%)" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Higher Growth (12%)" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-muted/40 rounded-lg p-2.5 text-xs text-muted-foreground flex items-start gap-1.5 border">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          <span>
            These scenarios are illustrations based on assumed rates, not predictions of future returns.
          </span>
        </div>
      </Card>
    </div>
  );
}

export default ProjectionChart;
