'use client';

import { ArrowRight, Check, Lock, ScanLine, PiggyBank, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { LanguageToggle } from '@/components/rupee/AppShell';
import GlyphPortal from '@/components/ui/glyph-portal';

function MoneyScene() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'radial-gradient(circle at 24% 20%, rgba(130,242,193,.62), transparent 24%), radial-gradient(circle at 76% 20%, rgba(255,255,255,.14), transparent 20%), linear-gradient(135deg,#0a2b20 0%,#145d43 46%,#071f17 100%)' }}>
      <div style={{ position: 'absolute', width: '42vw', height: '42vw', maxWidth: 640, maxHeight: 640, minWidth: 280, minHeight: 280, borderRadius: '50%', left: '-10vw', top: '-14vw', background: 'radial-gradient(circle, rgba(156,240,210,.72), rgba(156,240,210,0) 67%)', filter: 'blur(2px)' }} />
      <div style={{ position: 'absolute', width: '55vw', height: '55vw', maxWidth: 820, maxHeight: 820, right: '-18vw', bottom: '-30vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(7,45,33,.65), rgba(7,45,33,0) 68%)' }} />
      <div style={{ position: 'absolute', inset: '14% 9%', borderRadius: 36, border: '1px solid rgba(255,255,255,.08)', boxShadow: 'inset 0 0 80px rgba(255,255,255,.03)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%,-50%)', width: 'min(64vw,900px)', padding: 28, color: '#fff' }}>
        <div style={{ fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.64)', textAlign: 'center' }}>financial health / made human</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'clamp(42px,8vw,110px)', fontWeight: 900, letterSpacing: '-.08em' }}>₹</span>
          <span style={{ fontSize: 'clamp(34px,5.2vw,76px)', fontWeight: 800, letterSpacing: '-.07em' }}>RupeeRizz</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, maxWidth: 820, margin: '28px auto 0' }}>
          {[
            ['Receipt', '₹480', 'Food · today'],
            ['Safe to save', '₹8,420', '+12.4%'],
            ['Goal', '68%', 'Laptop fund'],
          ].map(([label, value, note]) => (
            <div key={label} style={{ borderRadius: 18, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', padding: '14px 16px', backdropFilter: 'blur(10px)' }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.54)' }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.05em', marginTop: 5 }}>{value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{note}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', left: '8%', bottom: '12%', padding: '10px 14px', borderRadius: 999, color: '#d9fff1', border: '1px solid rgba(217,255,241,.12)', background: 'rgba(0,0,0,.11)', fontSize: 10, backdropFilter: 'blur(12px)' }}>receipt → insight → action</div>
      <div style={{ position: 'absolute', right: '8%', top: '17%', padding: '10px 14px', borderRadius: 999, color: '#d9fff1', border: '1px solid rgba(217,255,241,.12)', background: 'rgba(0,0,0,.11)', fontSize: 10, backdropFilter: 'blur(12px)' }}>consent-first</div>
    </div>
  );
}

export function Landing({ onGetStarted, onDemo }) {
  const { lang } = useApp();
  return (
    <div className="rr-glyph-landing">
      <GlyphPortal
        word="RIZZ"
        focusChar="Z"
        interactive
        scrollLength={3.25}
        fontFamily={'"Arial Black", "Arial", sans-serif'}
        fontWeight={900}
        enterLabel="Enter RupeeRizz"
        onEnter={onGetStarted}
        background={<MoneyScene />}
        front={
          <>
            <header className="rr-glyph-topbar">
              <button className="rr-logo rr-logo--button rr-glyph-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                <span className="rr-logo-box"><Wallet size={18} /></span>
                <span>Rupee<span>Rizz</span></span>
              </button>
              <div className="rr-glyph-category">Financial health & better money habits</div>
              <div className="rr-glyph-language"><LanguageToggle /></div>
            </header>
            <p className="rr-glyph-eyebrow"><Sparkles size={13} /> A different perspective starts here.</p>
            <div className="rr-glyph-center-copy">
              <h1>Your money, <em>seen differently.</em></h1>
              <p>Receipts become context. Goals become visible. Better money decisions feel a lot less intimidating.</p>
            </div>
          </>
        }
      >
        <div className="rr-glyph-content-inner">
          <div className="rr-glyph-content-kicker"><Sparkles size={14} /> Step inside RupeeRizz</div>
          <h2>Money clarity without the lecture.</h2>
          <p className="rr-glyph-content-lede">Your first screen should feel like an experience, not another dashboard. Start with a receipt, a goal, or just a better question about where your money is going.</p>

          <div className="rr-glyph-action-row">
            <button className="rr-pill-button rr-pill-button--light-solid rr-pill-button--large" onClick={onGetStarted}>Start your money era <ArrowRight size={17} /></button>
            <button className="rr-pill-button rr-pill-button--light-ghost rr-pill-button--large" onClick={onDemo}><Sparkles size={16} /> See the demo</button>
          </div>

          <div className="rr-glyph-feature-grid">
            <article className="rr-glyph-feature">
              <div className="rr-glyph-feature-num">01</div>
              <ScanLine size={20} />
              <h3>Scan it.</h3>
              <p>Turn receipts into structured money data without drowning in spreadsheets.</p>
            </article>
            <article className="rr-glyph-feature">
              <div className="rr-glyph-feature-num">02</div>
              <PiggyBank size={20} />
              <h3>Shape it.</h3>
              <p>See what is safe to save, what is eating the budget, and what can move.</p>
            </article>
            <article className="rr-glyph-feature">
              <div className="rr-glyph-feature-num">03</div>
              <ShieldCheck size={20} />
              <h3>Know it.</h3>
              <p>Get explainable financial-health signals built around consent and control.</p>
            </article>
          </div>

          <div className="rr-glyph-proof-row">
            <span><Check size={13} /> Explainable</span>
            <span><Check size={13} /> Correctable</span>
            <span><Check size={13} /> Consent-based</span>
            <span><Lock size={13} /> No bank password</span>
          </div>
        </div>
      </GlyphPortal>

      <section className="rr-glyph-mini-foot">
        <span>Rupee<span>Rizz</span></span>
        <span>{t(lang, 'tagline')}</span>
      </section>
    </div>
  );
}

export default Landing;
