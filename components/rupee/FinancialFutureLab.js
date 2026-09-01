'use client';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ArrowRight, BrainCircuit, CheckCircle2, ChevronRight, FlaskConical, History, Lightbulb, RotateCcw, Sparkles, Target, TimerReset, WandSparkles } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { api } from '@/lib/apiClient';
import { buildExperiment, opportunityCost, simulateScenario, spendingDNA } from '@/lib/behavior';

const EXP_KEY = 'rr_money_experiment_v1';

function readExperiment() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(EXP_KEY) || 'null'); } catch { return null; }
}

function saveExperiment(value) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(EXP_KEY, JSON.stringify(value));
}

export function FinancialFutureLab({ data: incomingData, onNav, compact = false }) {
  const [loadedData, setLoadedData] = useState(incomingData || null);
  const [loading, setLoading] = useState(!incomingData);
  useEffect(() => {
    setLoadedData(incomingData || null);
    if (!incomingData) {
      setLoading(true);
      api('/dashboard').then((d) => setLoadedData(d.dashboard)).catch(() => {}).finally(() => setLoading(false));
    }
  }, [incomingData]);
  const data = loadedData;
  const snapshot = data?.snapshot || {};
  const goal = data?.goals?.[0] || null;
  const dna = useMemo(() => spendingDNA(data?.recent_receipts || [], snapshot), [data?.recent_receipts, snapshot]);
  const [selectedCategory, setSelectedCategory] = useState('Other');
  const [simValue, setSimValue] = useState(0);
  useEffect(() => {
    const first = dna.topCategory?.name || 'Other';
    const amount = dna.topCategory?.amount || Math.max(0, snapshot.non_essential_expenses || 0);
    setSelectedCategory(first);
    setSimValue(amount);
  }, [dna.topCategory?.name, dna.topCategory?.amount, snapshot.non_essential_expenses]);
  const [tab, setTab] = useState('time');
  const [experiment, setExperiment] = useState(() => readExperiment());
  const [toast, setToast] = useState('');

  const categories = dna.categories.length ? dna.categories.slice(0, 4) : [{ name: 'Non-essentials', amount: snapshot.non_essential_expenses || 0 }];
  const selectedAmount = categories.find((c) => c.name === selectedCategory)?.amount || 0;
  const sim = simulateScenario({ snapshot, goal, categorySpend: selectedAmount, simulatedSpend: simValue });
  const lastReceipt = data?.recent_receipts?.[0];
  const cost = opportunityCost(lastReceipt?.total || 100, snapshot, goal);
  const suggestedExperiment = useMemo(() => buildExperiment(dna, snapshot, goal), [dna, snapshot, goal]);

  const enterTimeMachine = () => setTab('time');
  const startExperiment = () => {
    const exp = { ...suggestedExperiment, startedAt: new Date().toISOString(), status: 'active', actualSavings: null, worked: null };
    setExperiment(exp); saveExperiment(exp); setTab('experiment'); setToast('Your 7-day experiment is live.');
    setTimeout(() => setToast(''), 2600);
  };
  const resetExperiment = () => { setExperiment(null); localStorage.removeItem(EXP_KEY); };
  const simulateResult = () => {
    if (!experiment) return;
    const mockActualSpend = Math.max(0, experiment.target - Math.max(20, Math.round(experiment.predictedSavings * 0.2)));
    const actualSavings = Math.max(0, experiment.baseline - mockActualSpend);
    const worked = actualSavings >= Math.max(1, Math.round(experiment.predictedSavings * 0.6));
    const next = { ...experiment, status: 'completed', actualSavings, worked, completedAt: new Date().toISOString() };
    setExperiment(next); saveExperiment(next); setToast('Demo result recorded. Replace with live transactions for the real experiment.');
    setTimeout(() => setToast(''), 3200);
  };

  const setCategory = (name, amount) => { setSelectedCategory(name); setSimValue(Math.max(0, Math.round(amount))); };

  if (loading) return <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Loading your financial future…</div>;
  if (!data) return null;

  if (compact) return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card">
      <div className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-primary" /><h2 className="font-bold">Money Time Machine</h2><Badge variant="secondary">New</Badge></div>
            <p className="mt-1 text-sm text-muted-foreground">See how one small spending change could affect your savings and goal.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-secondary px-3 py-1">🧬 {dna.topCategory?.name || 'Spending DNA'}</span>
              <span className="rounded-full bg-secondary px-3 py-1">💰 {formatINR(dna.recoverable)} recoverable</span>
              <span className="rounded-full bg-secondary px-3 py-1">🎯 {goal?.goal_name || 'Set a goal'}</span>
            </div>
          </div>
          <Button onClick={() => onNav('money-lab')} className="shrink-0 gap-2">Enter Alternate Reality <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {!compact && (
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge variant="secondary" className="mb-2 gap-1"><Sparkles className="h-3 w-3" /> RupeeRizz Future Lab</Badge>
              <h1 className="text-2xl font-extrabold tracking-tight">Don't just track your money. Test your future.</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">A receipt-powered behavioral layer that detects patterns, simulates decisions, and turns one insight into a real-world money experiment.</p>
            </div>
            <Button onClick={enterTimeMachine} className="shrink-0 gap-2"><WandSparkles className="h-4 w-4" /> Enter Alternate Reality</Button>
          </div>
        </div>
      )}

      {toast && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">{toast}</div>}

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.6fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">Spending DNA</h2><p className="text-xs text-muted-foreground">What your verified receipts reveal</p></div></div>
            <Badge variant={dna.hasEnoughData ? 'default' : 'secondary'}>{dna.receiptCount} receipts</Badge>
          </div>
          <div className="mt-5 space-y-3">
            <div className="rounded-xl bg-secondary/60 p-4"><div className="text-xs text-muted-foreground">Biggest pattern</div><div className="mt-1 font-semibold">{dna.pattern}</div></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Weekend lift</div><div className="mt-1 text-lg font-bold">{dna.weekendLift ? `${dna.weekendLift}%` : '—'}</div><div className="text-[11px] text-muted-foreground">per purchase vs weekdays</div></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Recoverable</div><div className="mt-1 text-lg font-bold">{formatINR(dna.recoverable)}/mo</div><div className="text-[11px] text-muted-foreground">illustrative 20% trim</div></div>
            </div>
            <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Highest merchant</div><div className="mt-1 font-semibold truncate">{dna.topMerchant?.name || 'Add more receipts'}</div><div className="text-xs text-muted-foreground">{dna.topMerchant ? formatINR(dna.topMerchant.amount) + ' observed' : 'No merchant pattern yet'}</div></div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b bg-secondary/30 p-2">
            {[
              ['time', WandSparkles, 'Time Machine'],
              ['cost', TimerReset, '₹100 Question'],
              ['experiment', FlaskConical, 'Money Experiment'],
            ].map(([key, Icon, label]) => <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${tab === key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}><Icon className="h-4 w-4" />{label}</button>)}
          </div>

          {tab === 'time' && (
            <div className="p-5">
              <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wider text-primary">Counterfactual simulator</div><h2 className="mt-1 text-xl font-bold">Change one decision. See the ripple.</h2><p className="mt-1 text-sm text-muted-foreground">This is a simulation — it never changes your actual receipts.</p></div><Target className="h-6 w-6 text-primary/60" /></div>
              <div className="mt-5 grid gap-4 md:grid-cols-5">
                <div className="md:col-span-2 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Choose a spending category</div>
                  {categories.map((c) => <button key={c.name} onClick={() => setCategory(c.name, c.amount)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedCategory === c.name ? 'border-primary bg-primary/5' : 'hover:bg-secondary/50'}`}><span className="font-medium">{c.name}</span><span className="float-right text-muted-foreground">{formatINR(c.amount)}</span></button>)}
                </div>
                <div className="md:col-span-3 rounded-2xl bg-grid-soft border p-5">
                  <div className="flex items-center justify-between"><span className="text-sm font-medium">{selectedCategory}</span><Badge variant="secondary">Simulation</Badge></div>
                  <div className="mt-5 text-3xl font-extrabold">{formatINR(simValue)}</div>
                  <div className="mt-2 text-xs text-muted-foreground">Simulated monthly spend</div>
                  <Slider className="mt-5" min={0} max={Math.max(100, selectedAmount)} step={50} value={[simValue]} onValueChange={([v]) => setSimValue(v)} />
                  <div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>₹0</span><span>{formatINR(selectedAmount)} current</span></div>
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric label="Recovered" value={formatINR(sim.recovered)} />
                    <Metric label="New savings" value={formatINR(sim.projectedMonthlySavings) + '/mo'} />
                    <Metric label="Year impact" value={formatINR(sim.annualImpact)} />
                    <Metric label="Goal earlier" value={sim.daysEarlier ? `${sim.daysEarlier}d` : '—'} />
                  </div>
                  <div className="mt-4 rounded-xl border bg-card p-3 text-sm"><span className="font-semibold">RupeeRizz says:</span> {sim.recovered > 0 ? `A ${formatINR(sim.recovered)} monthly change here could add ${formatINR(sim.annualImpact)} a year without changing your income.` : 'Try moving the slider below your current pattern to explore an alternate future.'}</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'cost' && (
            <div className="p-5">
              <div className="rounded-2xl border bg-secondary/35 p-5">
                <Badge variant="secondary" className="gap-1"><Lightbulb className="h-3 w-3" /> Opportunity cost, not guilt</Badge>
                <h2 className="mt-3 text-xl font-bold">What did your last purchase really cost?</h2>
                <div className="mt-6 flex items-end justify-between gap-4"><div><div className="text-4xl font-extrabold text-primary">{formatINR(cost.spend)}</div><div className="text-sm text-muted-foreground">latest verified receipt</div></div><History className="h-8 w-8 text-primary/50" /></div>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <Metric label="Of monthly savings" value={cost.savingsImpactPct ? `${cost.savingsImpactPct}%` : '—'} />
                  <Metric label="Goal progress delay" value={cost.days ? `${cost.days} days` : '—'} />
                  <Metric label="Of goal remaining" value={cost.goalPct ? `${cost.goalPct}%` : '—'} />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">This is not a judgement. It simply translates a purchase into the thing you're trying to achieve.</p>
              </div>
            </div>
          )}

          {tab === 'experiment' && (
            <div className="p-5">
              {!experiment ? (
                <>
                  <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wider text-primary">Closed-loop learning</div><h2 className="mt-1 text-xl font-bold">Run a 7-day Money Experiment</h2><p className="mt-1 text-sm text-muted-foreground">Test one small behavior instead of collecting another generic tip.</p></div><FlaskConical className="h-6 w-6 text-primary/60" /></div>
                  <div className="mt-5 rounded-2xl border p-5"><div className="text-sm text-muted-foreground">Recommended experiment</div><div className="mt-2 text-lg font-bold">{suggestedExperiment.category}</div><div className="mt-3 rounded-xl bg-secondary/50 p-4 text-sm">{suggestedExperiment.action}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"><Metric label="Baseline" value={formatINR(suggestedExperiment.baseline)} /><Metric label="Target" value={formatINR(suggestedExperiment.target)} /><Metric label="Predicted save" value={formatINR(suggestedExperiment.predictedSavings)} /></div><Button className="mt-5 w-full sm:w-auto" onClick={startExperiment}>Start 7-day experiment <ArrowRight className="ml-1 h-4 w-4" /></Button></div>
                </>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-4"><div><Badge className={experiment.status === 'active' ? '' : 'bg-emerald-600 hover:bg-emerald-600'}>{experiment.status === 'active' ? 'LIVE EXPERIMENT' : 'COMPLETED'}</Badge><h2 className="mt-2 text-xl font-bold">{experiment.category} experiment</h2><p className="text-sm text-muted-foreground">{experiment.action}</p></div><Button variant="ghost" size="icon" onClick={resetExperiment}><RotateCcw className="h-4 w-4" /></Button></div>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Baseline" value={formatINR(experiment.baseline)} /><Metric label="Target" value={formatINR(experiment.target)} /><Metric label="Predicted" value={formatINR(experiment.predictedSavings)} /><Metric label="Actual" value={experiment.actualSavings == null ? 'Waiting' : formatINR(experiment.actualSavings)} /></div>
                  {experiment.status === 'active' ? <div className="mt-5 rounded-2xl border bg-secondary/35 p-5"><div className="flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-primary" /> Measure reality, not intentions.</div><p className="mt-2 text-sm text-muted-foreground">In production, verified receipts during the next 7 days are compared with this recent observed baseline automatically. For your hackathon demo, you can record an illustrative result below.</p><Button variant="outline" className="mt-4" onClick={simulateResult}><CheckCircle2 className="mr-2 h-4 w-4" /> Show demo result</Button></div> : <div className={`mt-5 rounded-2xl p-5 ${experiment.worked ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}><div className="flex items-center gap-2 text-lg font-bold">{experiment.worked ? <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> This intervention worked for you.</> : <><ChevronRight className="h-5 w-5" /> Try a different strategy.</>}</div><p className="mt-1 text-sm text-muted-foreground">{experiment.worked ? `This outcome is saved in the browser prototype so the system can use the result when refining future suggestions.` : `Your next experiment can target a different category or behavior.`}</p></div>}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-xl border bg-card p-3"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-bold">{value}</div></div>;
}
