'use client';
import { LayoutDashboard, ScanLine, PiggyBank, Target, Landmark, ShieldCheck, LogOut, Menu, Wallet, FileText, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/app/providers';
import { t, LANGS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const NAV = [
  { key: 'dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard },
  { key: 'receipts', labelKey: 'nav_scan', icon: ScanLine },
  { key: 'plan', labelKey: 'nav_plan', icon: PiggyBank },
  { key: 'goals', labelKey: 'nav_goals', icon: Target },
  { key: 'options', labelKey: 'nav_options', icon: Landmark },
  { key: 'my-data', labelKey: 'nav_mydata', icon: ShieldCheck },
  { key: 'money-lab', labelKey: 'nav_money_lab', icon: Sparkles },
];

export function LanguageToggle() {
  const { lang, setLang } = useApp();
  return (
    <div className="inline-flex rounded-full border bg-card p-0.5">
      {LANGS.map((l) => (
        <button key={l.code} onClick={() => setLang(l.code)} aria-pressed={lang === l.code}
          className={`px-2.5 py-1 text-xs rounded-full transition-colors ${lang === l.code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function AppShell({ route, onNav, children }) {
  const { lang, user, profile, logout } = useApp();
  const [open, setOpen] = useState(false);
  const initials = (profile?.full_name || user?.name || 'U').slice(0, 1).toUpperCase();
  const typeLabel = profile?.user_type === 'micro_entrepreneur' ? t(lang, 'micro_ent') : t(lang, 'student');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between gap-2">
          <button onClick={() => onNav('dashboard')} className="flex items-center gap-2 font-extrabold text-lg">
            <span className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Wallet className="h-5 w-5" /></span>
            <span>Rupee<span className="text-primary">Rizz</span></span>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => {
              const Icon = n.icon; const active = route === n.key || (n.key === 'receipts' && route?.startsWith('receipt'));
              return (
                <button key={n.key} onClick={() => onNav(n.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-secondary text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'}`}>
                  <Icon className="h-4 w-4" /> {t(lang, n.labelKey)}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary text-primary-foreground text-sm">{initials}</AvatarFallback></Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-semibold">{profile?.full_name || user?.name || 'Friend'}</div>
                  <div className="text-xs text-muted-foreground font-normal">{typeLabel}{user?.is_demo ? ' \u00b7 Demo' : ''}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onNav('report')}><FileText className="h-4 w-4 mr-2" /> Readiness Report</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNav('my-data')}><ShieldCheck className="h-4 w-4 mr-2" /> {t(lang, 'nav_mydata')}</DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="text-rose-600"><LogOut className="h-4 w-4 mr-2" /> {t(lang, 'sign_out')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)}><Menu className="h-5 w-5" /></Button>
          </div>
        </div>

        {open && (
          <nav className="md:hidden border-t bg-card px-2 py-2 grid grid-cols-3 gap-1">
            {NAV.map((n) => {
              const Icon = n.icon; const active = route === n.key;
              return (
                <button key={n.key} onClick={() => { onNav(n.key); setOpen(false); }}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg text-xs ${active ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}>
                  <Icon className="h-4 w-4" /> {t(lang, n.labelKey)}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      <main className="flex-1 container py-6">{children}</main>

      <footer className="border-t bg-card">
        <div className="container py-6 text-center text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{t(lang, 'no_loan_push')}</p>
          <p className="mt-1">{t(lang, 'footer_note')}</p>
        </div>
      </footer>
    </div>
  );
}

export default AppShell;
