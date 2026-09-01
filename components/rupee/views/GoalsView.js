'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Award, Flame, Target } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { Loading, EmptyState } from '@/components/rupee/common';
import { SavingsGoalCard } from '@/components/rupee/SavingsGoalCard';

export function GoalsView() {
  const { lang } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [contribGoal, setContribGoal] = useState(null);
  const [contribAmt, setContribAmt] = useState('');
  const [form, setForm] = useState({ goal_name: '', goal_amount: '', current_saved_amount: '', target_date: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api('/dashboard'); setData(d.dashboard); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const addGoal = async () => {
    if (!form.goal_name || !form.goal_amount) { toast.error('Please add a name and amount.'); return; }
    try { await api('/goals', { method: 'POST', body: { ...form, goal_amount: Number(form.goal_amount), current_saved_amount: Number(form.current_saved_amount) || 0 } }); toast.success('Goal added!'); setAddOpen(false); setForm({ goal_name: '', goal_amount: '', current_saved_amount: '', target_date: '' }); load(); }
    catch (e) { toast.error(e.message); }
  };
  const contribute = async () => {
    const amt = Number(contribAmt);
    if (!amt) { toast.error('Enter an amount.'); return; }
    try { await api(`/goals/${contribGoal.id}/contribute`, { method: 'POST', body: { amount: amt } }); toast.success(`Added ₹${amt} to ${contribGoal.goal_name}!`); setContribGoal(null); setContribAmt(''); load(); }
    catch (e) { toast.error(e.message); }
  };

  if (loading) return <Loading />;
  const goals = data?.goals || [];
  const emergencyStarted = data?.emergency?.started;
  const goalGetter = goals.some((g) => (g.metrics?.progressPct || 0) >= 50);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Goals</h1><p className="text-muted-foreground text-sm">Track progress and safe monthly contributions.</p></div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Add goal</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New savings goal</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Goal name</Label><Input value={form.goal_name} onChange={(e) => setForm({ ...form, goal_name: e.target.value })} placeholder="e.g. New phone" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" value={form.goal_amount} onChange={(e) => setForm({ ...form, goal_amount: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Saved (₹)</Label><Input type="number" value={form.current_saved_amount} onChange={(e) => setForm({ ...form, current_saved_amount: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Target date</Label><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={addGoal}>Add goal</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className={emergencyStarted ? 'text-emerald-700' : 'opacity-50'}><Award className="h-3.5 w-3.5 mr-1" /> Emergency Fund Starter</Badge>
        <Badge variant="secondary" className={goalGetter ? 'text-emerald-700' : 'opacity-50'}><Target className="h-3.5 w-3.5 mr-1" /> Goal Getter</Badge>
        <Badge variant="secondary"><Flame className="h-3.5 w-3.5 mr-1" /> Saving streak: keep it up!</Badge>
      </div>

      {goals.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" hint="Add a goal to get a safe monthly saving recommendation." action={<Button onClick={() => setAddOpen(true)}>Add a goal</Button>} />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {goals.map((g) => <SavingsGoalCard key={g.id} goal={g} lang={lang} onContribute={(goal) => setContribGoal(goal)} />)}
        </div>
      )}

      <Dialog open={!!contribGoal} onOpenChange={(o) => !o && setContribGoal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add saving to {contribGoal?.goal_name}</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" value={contribAmt} onChange={(e) => setContribAmt(e.target.value)} placeholder="0" autoFocus /></div>
          <DialogFooter><Button onClick={contribute}>Add saving</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GoalsView;
