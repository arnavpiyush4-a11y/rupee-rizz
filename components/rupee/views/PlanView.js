'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Save, PiggyBank, ShieldPlus, AlertTriangle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { formatINR } from '@/lib/format';
import { Loading } from '@/components/rupee/common';
import { SavingsGoalCard } from '@/components/rupee/SavingsGoalCard';

function Line({ label, value, op }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{op ? `${op} ` : ''}{label}</span>
      <span className="font-medium">{formatINR(value)}</span>
    </div>
  );
}

export function PlanView({ onNav }) {
  const { lang, refresh } = useApp();
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api('/dashboard'); setData(d.dashboard); setProfile(d.profile); setF(d.profile?.finance || {}); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await api('/profile', { method: 'POST', body: { finance: { ...f, reliable_monthly_income: Number(f.reliable_monthly_income) || 0, essential_expenses: Number(f.essential_expenses) || 0, non_essential_expenses: Number(f.non_essential_expenses) || 0, compulsory_emi: Number(f.compulsory_emi) || 0, business_operating_costs: Number(f.business_operating_costs) || 0, emergency_fund_amount: Number(f.emergency_fund_amount) || 0 } } });
      await refresh(); toast.success('Recalculated with your new numbers!'); setEditing(false); load();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <Loading />;
  if (!data) return null;
  const s = data.snapshot;
  const isEnt = (profile?.user_type === 'micro_entrepreneur');
  const emergency = data.emergency;
  const alloc = data.allocation;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Savings plan</h1><p className="text-muted-foreground text-sm">Transparent maths you can edit anytime.</p></div>
        {!editing ? <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1" /> Edit & recalculate</Button>
          : <Button onClick={save}><Save className="h-4 w-4 mr-1" /> Save & recalculate</Button>}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-2">How your safe saving is calculated</h3>
          {!editing ? (
            <div className="divide-y">
              <Line label="Reliable monthly income" value={s.reliable_monthly_income} />
              <Line label="Essential expenses" value={s.essential_expenses} op="−" />
              <Line label="Compulsory EMI" value={s.compulsory_emi} op="−" />
              {isEnt && <Line label="Business operating costs" value={s.business_operating_costs} op="−" />}
              <div className="flex items-center justify-between py-2 font-semibold"><span>Monthly surplus</span><span className={s.monthly_surplus >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatINR(s.monthly_surplus)}</span></div>
              <div className="flex items-center justify-between py-2 font-semibold"><span>Safe monthly saving = max(0, surplus)</span><span className="text-emerald-600">{formatINR(s.safe_monthly_saving)}</span></div>
            </div>
          ) : (
            <div className="space-y-3">
              <EditField label="Reliable monthly income (₹)" v={f.reliable_monthly_income} on={(x) => set('reliable_monthly_income', x)} />
              <EditField label="Essential expenses (₹)" v={f.essential_expenses} on={(x) => set('essential_expenses', x)} />
              <EditField label="Non-essential expenses (₹)" v={f.non_essential_expenses} on={(x) => set('non_essential_expenses', x)} />
              <EditField label="Compulsory EMI (₹)" v={f.compulsory_emi} on={(x) => set('compulsory_emi', x)} />
              {isEnt && <EditField label="Business operating costs (₹)" v={f.business_operating_costs} on={(x) => set('business_operating_costs', x)} />}
              <EditField label="Emergency fund saved (₹)" v={f.emergency_fund_amount} on={(x) => set('emergency_fund_amount', x)} />
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">Where your safe saving goes</h3>
          {s.safe_monthly_saving <= 0 ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 p-4 text-sm space-y-2">
              <div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> No safe savings yet</div>
              <p>Let’s not add debt. Try one of these first:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Review non-essential spending ({formatINR(s.non_essential_expenses)})</li>
                <li>Set smaller goal milestones</li>
                <li>Look at additional income or support options</li>
                <li>Consider a later target date</li>
              </ul>
              <Button size="sm" variant="outline" onClick={() => onNav('options')}>Explore support <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-secondary/60 p-3">
                <div className="flex items-center gap-1.5 text-sm font-medium"><ShieldPlus className="h-4 w-4 text-primary" /> Emergency fund</div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">{emergency.amount >= emergency.target ? 'Target reached 🎉' : `Target ${formatINR(emergency.target)} (1 month essentials)`}</span>
                  <span className="font-semibold text-emerald-600">{formatINR(alloc.emergency)}/mo</span>
                </div>
              </div>
              {data.goals.map((g) => (
                <div key={g.id} className="rounded-lg bg-secondary/60 p-3">
                  <div className="flex items-center gap-1.5 text-sm font-medium"><PiggyBank className="h-4 w-4 text-primary" /> {g.goal_name}</div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Recommended contribution</span>
                    <span className="font-semibold text-emerald-600">{formatINR(g.recommended_monthly)}/mo</span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Below your emergency target we split 60% to the buffer and 40% to your top goal. Once it is reached, more goes to goals. We never over-allocate money you may not reliably have.</p>
            </div>
          )}
        </Card>
      </div>

      <div>
        <h3 className="font-semibold mb-3">Your goals</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {data.goals.map((g) => <SavingsGoalCard key={g.id} goal={g} lang={lang} onContribute={() => onNav('goals')} />)}
          {data.goals.length === 0 && <p className="text-sm text-muted-foreground">No goals yet. Add one from the Goals tab.</p>}
        </div>
      </div>
    </div>
  );
}

function EditField({ label, v, on }) {
  return (<div className="space-y-1.5"><Label className="text-sm">{label}</Label><Input type="number" value={v ?? ''} onChange={(e) => on(e.target.value)} /></div>);
}

export default PlanView;
