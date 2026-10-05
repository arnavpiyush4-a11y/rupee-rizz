'use client';

import { motion } from 'framer-motion';
import { LayoutDashboard, ScanLine, PiggyBank, Target, Landmark, ShieldCheck, LogOut, Menu, Wallet, FileText, Sparkles, X, Bell, ChevronRight, CircleUserRound, Sprout } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/app/providers';
import { t, LANGS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RizzAtmosphere } from './RizzAtmosphere';

const NAV = [
  { key: 'dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard, short: 'Home' },
  { key: 'receipts', labelKey: 'nav_scan', icon: ScanLine, short: 'Scan' },
  { key: 'plan', labelKey: 'nav_plan', icon: PiggyBank, short: 'Plan' },
  { key: 'grow', labelKey: 'nav_grow', icon: Sprout, short: 'Grow', testId: 'grow-nav-item' },
  { key: 'goals', labelKey: 'nav_goals', icon: Target, short: 'Goals' },
  { key: 'options', labelKey: 'nav_options', icon: Landmark, short: 'Options' },
  { key: 'my-data', labelKey: 'nav_mydata', icon: ShieldCheck, short: 'Privacy' },
  { key: 'money-lab', labelKey: 'nav_money_lab', icon: Sparkles, short: 'Lab' },
];

export function LanguageToggle() {
  const { lang, setLang } = useApp();
  return (
    <div className="rr-language-toggle" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.code} onClick={() => setLang(l.code)} aria-pressed={lang === l.code}>{l.label}</button>
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
    <div className="rr-app-shell">
      <RizzAtmosphere compact />

      <header className="rr-app-header">
        <button onClick={() => onNav('dashboard')} className="rr-logo rr-logo--button">
          <span className="rr-logo-box"><Wallet size={18} /></span>
          <span>Rupee<span>Rizz</span></span>
        </button>

        <div className="rr-header-center">
          <span className="rr-live-pill"><span /> your money space</span>
          <span className="rr-header-route">{NAV.find((n) => n.key === route)?.short || 'Dashboard'}</span>
        </div>

        <div className="rr-app-header-actions">
          <LanguageToggle />
          <button className="rr-icon-button rr-icon-button--notification" aria-label="Notifications"><Bell size={16} /><span /></button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rr-profile-button" aria-label="Open profile">
                <Avatar className="rr-avatar"><AvatarFallback>{initials}</AvatarFallback></Avatar>
                <span className="rr-profile-name">{profile?.full_name || user?.name || 'Friend'}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel><div className="font-semibold">{profile?.full_name || user?.name || 'Friend'}</div><div className="text-xs text-muted-foreground font-normal">{typeLabel}{user?.is_demo ? ' · Demo' : ''}</div></DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onNav('report')}><FileText className="h-4 w-4 mr-2" /> Readiness Report</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNav('my-data')}><ShieldCheck className="h-4 w-4 mr-2" /> {t(lang, 'nav_mydata')}</DropdownMenuItem>
              <DropdownMenuItem onClick={logout} className="text-rose-600"><LogOut className="h-4 w-4 mr-2" /> {t(lang, 'sign_out')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="rr-menu-button" onClick={() => setOpen((v) => !v)} aria-label="Menu">{open ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </header>

      <div className="rr-app-frame">
        <aside className="rr-side-rail">
          <div className="rr-side-rail-label">move around</div>
          <nav>
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = route === n.key || (n.key === 'receipts' && route?.startsWith('receipt'));
              return (
                <button key={n.key} onClick={() => onNav(n.key)} className={`rr-side-link ${active ? 'is-active' : ''}`} title={t(lang, n.labelKey)} data-testid={n.testId}>
                  <span className="rr-side-icon"><Icon size={17} /></span>
                  <span>{n.short}</span>
                  {active && <ChevronRight className="rr-side-chevron" size={13} />}
                </button>
              );
            })}
          </nav>
          <div className="rr-side-foot">
            <span className="rr-side-mini-icon"><CircleUserRound size={16} /></span>
            <span><strong>Consent-first</strong><small>Always yours</small></span>
          </div>
        </aside>

        <main className="rr-app-main">
          <motion.div key={route} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35, ease: 'easeOut' }} className="rr-route-view">
            {children}
          </motion.div>
        </main>
      </div>

      {open && (
        <div className="rr-mobile-nav-overlay" onClick={() => setOpen(false)}>
          <motion.nav className="rr-mobile-drawer" initial={{ x: '100%' }} animate={{ x: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="rr-drawer-head"><span>RupeeRizz</span><button onClick={() => setOpen(false)}><X size={17} /></button></div>
            {NAV.map((n) => { const Icon = n.icon; return <button key={n.key} onClick={() => { onNav(n.key); setOpen(false); }} className={route === n.key ? 'is-active' : ''} data-testid={n.testId}><Icon size={17} />{t(lang, n.labelKey)}<ChevronRight size={15} /></button>; })}
          </motion.nav>
        </div>
      )}

      <footer className="rr-app-footer"><span><ShieldCheck size={13} /> No bank password, PIN, Aadhaar, or card details.</span><span>RupeeRizz · financial wellbeing with a little personality.</span></footer>
    </div>
  );
}

export default AppShell;
