'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Store, ArrowLeft, Loader2, PlayCircle, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/app/providers';
import { AMAN_STORY } from '@/lib/demo';

export function DemoView({ onBack, onStarted }) {
  const { login } = useApp();
  const [busy, setBusy] = useState('');

  const start = async (key) => {
    setBusy(key);
    try { await login({ demo: true, demo_profile: key }); toast.success('Demo profile loaded!'); onStarted?.(); }
    catch (e) { toast.error(e.message); setBusy(''); }
  };

  const profiles = [
    { key: 'student', icon: GraduationCap, name: 'Arnav', tag: 'Student', lines: ['Monthly allowance: ₹8,000', 'Essential expenses: ₹4,500', 'Goal: Laptop Fund (₹15,000)'] },
    { key: 'entrepreneur', icon: Store, name: 'Priya', tag: 'Micro-entrepreneur', lines: ['Home food business income: ₹30,000', 'Operating costs: ₹18,000', 'Goal: Mixer & packaging (₹10,000)'] },
  ];

  return (
    <div className="min-h-screen bg-background bg-grid-soft p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</button>
        <h1 className="text-2xl font-bold">Try RupeeRizz safely</h1>
        <p className="text-muted-foreground text-sm">Pick a sample profile — fully working, no bank details, clearly labelled demo data.</p>

        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          {profiles.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.key} className="p-5">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="h-6 w-6 text-primary" /></div>
                  <div><div className="font-semibold">{p.name}</div><div className="text-xs text-muted-foreground">{p.tag}</div></div>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                <Button className="w-full mt-4" onClick={() => start(p.key)} disabled={!!busy}>
                  {busy === p.key ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />} Start as {p.name}
                </Button>
              </Card>
            );
          })}
        </div>

        <Card className="p-5 mt-6 bg-secondary/40">
          <div className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4 text-primary" /> SIH demo story: {AMAN_STORY.name}</div>
          <p className="text-sm text-muted-foreground mt-1">{AMAN_STORY.business} · Income {AMAN_STORY.income_range} · {AMAN_STORY.goal}</p>
          <ol className="mt-3 space-y-1.5 text-sm list-decimal list-inside">
            {AMAN_STORY.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <p className="text-xs text-muted-foreground mt-3">Start as Priya to follow a similar flow: correct an expense → watch the readiness score and safe savings recalculate.</p>
        </Card>
      </div>
    </div>
  );
}

export default DemoView;
