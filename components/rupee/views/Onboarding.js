'use client';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { UserTypeSelector } from '@/components/rupee/UserTypeSelector';
import { computeSnapshot } from '@/lib/finance';
import { formatINR } from '@/lib/format';

const PATHWAYS = {
  student: [{ key: 'scan_save', label: 'Scan Receipts & Save' }, { key: 'plan_my_money', label: 'Plan My Money' }],
  micro_entrepreneur: [{ key: 'track_expenses', label: 'Track Business Expenses' }, { key: 'grow_my_business', label: 'Grow My Business' }],
};
const STUDENT_GOALS = ['Laptop / Phone', 'Course / Certification', 'Exam Fees', 'Hostel / Rent', 'Travel', 'Higher Studies', 'Emergency Fund', 'Business Idea', 'Custom Goal'];
const STATES = ['Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal', 'Other'];

export function Onboarding({ onDone }) {
  const { lang, refresh } = useApp();
  const [userType, setUserType] = useState('student');
  const [pathway, setPathway] = useState('plan_my_money');
  const [state, setState] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [incomeType, setIncomeType] = useState('regular');
  const [f, setF] = useState({ reliable_monthly_income: '', essential_expenses: '', non_essential_expenses: '', compulsory_emi: '', business_operating_costs: '', current_savings: '', emergency_fund_amount: '' });
  const [m1, setM1] = useState(''); const [m2, setM2] = useState(''); const [m3, setM3] = useState('');
  const [goalName, setGoalName] = useState('Laptop / Phone');
  const [goalCustom, setGoalCustom] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalSaved, setGoalSaved] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [busy, setBusy] = useState(false);

  const num = (v) => Number(v) || 0;
  const financeObj = useMemo(() => ({
    income_type: incomeType,
    recent_incomes: incomeType === 'irregular' ? [num(m1), num(m2), num(m3)] : [],
    reliable_monthly_income: num(f.reliable_monthly_income),
    essential_expenses: num(f.essential_expenses),
    non_essential_expenses: num(f.non_essential_expenses),
    compulsory_emi: num(f.compulsory_emi),
    business_operating_costs: userType === 'micro_entrepreneur' ? num(f.business_operating_costs) : 0,
    current_savings: num(f.current_savings),
    emergency_fund_amount: num(f.emergency_fund_amount),
    goal_purpose: (userType === 'student' ? goalName : businessType) || 'general',
  }), [incomeType, m1, m2, m3, f, userType, goalName, businessType]);

  const preview = useMemo(() => computeSnapshot(financeObj), [financeObj]);

  const submit = async () => {
    setBusy(true);
    try {
      const finalGoalName = goalName === 'Custom Goal' ? (goalCustom || 'My Goal') : goalName;
      await api('/profile', { method: 'POST', body: {
        user_type: userType, preferred_language: lang, state: state || null, pathway,
        business_type: userType === 'micro_entrepreneur' ? businessType : null,
        finance: financeObj,
        initial_goal: goalAmount ? { goal_name: finalGoalName, goal_amount: num(goalAmount), current_saved_amount: num(goalSaved), target_date: goalDate || null } : null,
      } });
      await refresh();
      toast.success('Your profile is ready!');
      onDone?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const setField = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const isEnt = userType === 'micro_entrepreneur';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t(lang, 'who_are_you')}</h1>
        <p className="text-muted-foreground text-sm">This tailors your plan, goals and support options.</p>
      </div>
      <UserTypeSelector value={userType} onChange={(v) => { setUserType(v); setPathway(PATHWAYS[v][v === 'student' ? 1 : 1].key); }} />

      <Card className="p-5 space-y-3">
        <Label>{t(lang, 'choose_pathway')}</Label>
        <div className="grid sm:grid-cols-2 gap-2">
          {PATHWAYS[userType].map((p) => (
            <button key={p.key} onClick={() => setPathway(p.key)} className={`text-left rounded-lg border-2 p-3 text-sm ${pathway === p.key ? 'border-primary bg-secondary' : 'border-border'}`}>{p.label}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1.5"><Label>State (optional)</Label>
            <Select value={state} onValueChange={setState}><SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger><SelectContent>{STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          {isEnt && <div className="space-y-1.5"><Label>Business type</Label><Input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="e.g. Home food business" /></div>}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="font-semibold">Your monthly money snapshot</div>
        <div>
          <Label className="text-sm">Income type</Label>
          <RadioGroup value={incomeType} onValueChange={setIncomeType} className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="regular" id="reg" /> Regular each month</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="irregular" id="irr" /> Varies (irregular)</label>
          </RadioGroup>
        </div>

        {incomeType === 'regular' ? (
          <Field label={isEnt ? 'Reliable monthly business income (₹)' : 'Monthly allowance + income (₹)'} value={f.reliable_monthly_income} onChange={(v) => setField('reliable_monthly_income', v)} />
        ) : (
          <div>
            <Label className="text-sm">Last 3 months income (₹) — we use the lowest, conservatively</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Input type="number" placeholder="Month 1" value={m1} onChange={(e) => setM1(e.target.value)} />
              <Input type="number" placeholder="Month 2" value={m2} onChange={(e) => setM2(e.target.value)} />
              <Input type="number" placeholder="Month 3" value={m3} onChange={(e) => setM3(e.target.value)} />
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Essential expenses (₹)" value={f.essential_expenses} onChange={(v) => setField('essential_expenses', v)} />
          <Field label="Non-essential expenses (₹)" value={f.non_essential_expenses} onChange={(v) => setField('non_essential_expenses', v)} />
          {isEnt && <Field label="Business operating costs (₹)" value={f.business_operating_costs} onChange={(v) => setField('business_operating_costs', v)} />}
          <Field label="Existing EMI / loan (₹, optional)" value={f.compulsory_emi} onChange={(v) => setField('compulsory_emi', v)} />
          <Field label="Current savings (₹)" value={f.current_savings} onChange={(v) => setField('current_savings', v)} />
          <Field label="Emergency fund saved so far (₹)" value={f.emergency_fund_amount} onChange={(v) => setField('emergency_fund_amount', v)} />
        </div>

        <div className="rounded-xl bg-secondary/60 p-4 flex items-center justify-between">
          <div className="text-sm">
            <div className="flex items-center gap-1.5 text-primary font-medium"><Sparkles className="h-4 w-4" /> Safe monthly saving (live)</div>
            <div className="text-xs text-muted-foreground mt-0.5">income − essentials − EMI − business costs</div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{formatINR(preview.safe_monthly_saving)}</div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="font-semibold">Your first goal</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {userType === 'student' ? (
            <div className="space-y-1.5"><Label>Goal</Label>
              <Select value={goalName} onValueChange={setGoalName}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STUDENT_GOALS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
            </div>
          ) : (
            <div className="space-y-1.5"><Label>Growth goal</Label><Input value={goalName === 'Laptop / Phone' ? '' : goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="e.g. Mixer & packaging equipment" /></div>
          )}
          {goalName === 'Custom Goal' && <div className="space-y-1.5"><Label>Custom goal name</Label><Input value={goalCustom} onChange={(e) => setGoalCustom(e.target.value)} /></div>}
          <Field label="Goal amount (₹)" value={goalAmount} onChange={setGoalAmount} />
          <Field label="Already saved (₹)" value={goalSaved} onChange={setGoalSaved} />
          <div className="space-y-1.5"><Label>Target date</Label><Input type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} /></div>
        </div>
      </Card>

      <div className="flex justify-end pb-8">
        <Button size="lg" onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Go to my dashboard <ArrowRight className="h-4 w-4 ml-1" /></Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input type="number" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
    </div>
  );
}

export default Onboarding;
