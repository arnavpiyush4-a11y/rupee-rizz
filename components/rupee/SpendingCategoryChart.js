'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card } from '@/components/ui/card';
import { formatINR } from '@/lib/format';
import { CHART_COLORS, EmptyState } from './common';
import { PieChart as PieIcon } from 'lucide-react';

// Doughnut chart of spending by category.
export function SpendingCategoryChart({ data = [], title = 'Spending by category' }) {
  const clean = (data || []).filter((d) => d.amount > 0);
  const total = clean.reduce((s, d) => s + d.amount, 0);
  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3">{title}</h3>
      {clean.length === 0 ? (
        <EmptyState icon={PieIcon} title="No spending data yet" hint="Add a few receipts or your budget to see the breakdown." />
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="h-48 w-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={clean} dataKey="amount" nameKey="name" innerRadius={54} outerRadius={80} paddingAngle={2}>
                  {clean.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatINR(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="font-bold">{formatINR(total)}</span>
            </div>
          </div>
          <div className="flex-1 w-full space-y-1.5">
            {clean.slice(0, 6).map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} /><span className="truncate">{d.name}</span></span>
                <span className="font-medium">{formatINR(d.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// Income vs expenses bar chart.
export function IncomeExpenseChart({ data = [], title = 'Income vs expenses' }) {
  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(200 20% 90%)" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `\u20b9${v >= 1000 ? (v / 1000) + 'k' : v}`} />
            <Tooltip formatter={(v) => formatINR(v)} />
            <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.name === 'Income' ? CHART_COLORS[0] : CHART_COLORS[3]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default SpendingCategoryChart;
