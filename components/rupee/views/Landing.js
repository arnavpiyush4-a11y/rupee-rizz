'use client';
import { Wallet, ScanLine, PiggyBank, HeartPulse, Landmark, ShieldCheck, Sparkles, Lock, HandHeart, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { LanguageToggle } from '@/components/rupee/AppShell';

const IMG = {
  hero: 'https://images.unsplash.com/photo-1522125670776-3c7abb882bc2?auto=format&fit=crop&w=900&q=80',
  student: 'https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=600&q=80',
  entrepreneur: 'https://images.unsplash.com/photo-1753162658547-f017a4d84541?auto=format&fit=crop&w=600&q=80',
  budget: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=600&q=80',
};

const TRUST = [
  { icon: ShieldCheck, key: 'trust_consent', dkey: 'trust_consent_d' },
  { icon: Lock, key: 'trust_private', dkey: 'trust_private_d' },
  { icon: HandHeart, key: 'trust_nopressure', dkey: 'trust_nopressure_d' },
];

const STEPS = [
  { icon: ScanLine, title: 'Scan or enter', desc: 'Add a receipt or your monthly money snapshot.' },
  { icon: PiggyBank, title: 'See safe savings', desc: 'Transparent maths shows what you can save.' },
  { icon: HeartPulse, title: 'Check readiness', desc: 'A friendly health checklist, not a hidden score.' },
  { icon: Landmark, title: 'Explore support', desc: 'Schemes & safer options before any borrowing.' },
];

export function Landing({ onGetStarted, onDemo }) {
  const { lang } = useApp();
  return (
    <div className="min-h-screen flex flex-col bg-background bg-grid-soft">
      <header className="border-b bg-card/70 backdrop-blur sticky top-0 z-40">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-lg">
            <span className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Wallet className="h-5 w-5" /></span>
            <span>Rupee<span className="text-primary">Rizz</span></span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Button size="sm" onClick={onGetStarted}>{t(lang, 'get_started')}</Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container py-12 md:py-20 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {t(lang, 'tagline')}
            </div>
            <h1 className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">{t(lang, 'hero_title')}</h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl">{t(lang, 'hero_sub')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={onGetStarted}>{t(lang, 'continue_google')} <ArrowRight className="h-4 w-4 ml-1" /></Button>
              <Button size="lg" variant="outline" onClick={onDemo}>{t(lang, 'try_demo')}</Button>
            </div>
            <p className="mt-4 text-sm font-medium text-primary">{t(lang, 'no_loan_push')}</p>
          </div>
          <div className="relative">
            <img src={IMG.hero} alt="A young person happily managing money on a phone" className="rounded-2xl shadow-xl w-full object-cover aspect-[4/3]" />
            <div className="absolute -bottom-5 -left-3 md:-left-6 grid grid-cols-2 gap-2">
              <img src={IMG.student} alt="Student" className="h-24 w-24 rounded-xl border-4 border-background object-cover shadow-lg" />
              <img src={IMG.entrepreneur} alt="Micro-entrepreneur" className="h-24 w-24 rounded-xl border-4 border-background object-cover shadow-lg" />
            </div>
          </div>
        </section>

        <section className="container pb-6 grid sm:grid-cols-3 gap-4">
          {TRUST.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.key} className="p-5">
                <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-primary" /></div>
                <div className="font-semibold">{t(lang, c.key)}</div>
                <p className="text-sm text-muted-foreground mt-1">{t(lang, c.dkey)}</p>
              </Card>
            );
          })}
        </section>

        <section className="container py-14">
          <h2 className="text-2xl font-bold text-center">{t(lang, 'how_it_works')}</h2>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <Card key={i} className="p-5 relative">
                  <span className="absolute top-4 right-4 text-3xl font-black text-secondary">{i + 1}</span>
                  <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center mb-3"><Icon className="h-6 w-6 text-primary" /></div>
                  <div className="font-semibold">{s.title}</div>
                  <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="container pb-16">
          <Card className="p-8 md:p-10 bg-gradient-to-br from-primary/10 to-emerald-50 border-primary/20 flex flex-col md:flex-row items-center gap-6">
            <img src={IMG.budget} alt="Budgeting with receipts" className="rounded-xl w-full md:w-64 object-cover aspect-video" />
            <div>
              <h3 className="text-2xl font-bold">Ready to make every rupee count?</h3>
              <p className="text-muted-foreground mt-1">Start free in demo mode with a sample profile — no bank details, ever.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button size="lg" onClick={onGetStarted}>{t(lang, 'get_started')}</Button>
                <Button size="lg" variant="outline" onClick={onDemo}>{t(lang, 'try_demo')}</Button>
              </div>
            </div>
          </Card>
        </section>
      </main>

      <footer className="border-t bg-card">
        <div className="container py-6 text-center text-xs text-muted-foreground">
          <p>We never ask for your bank password, PIN, Aadhaar, or card details.</p>
          <p className="mt-1">{t(lang, 'footer_note')}</p>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
