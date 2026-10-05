'use client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Eye, ShieldOff, Trash2, CircleCheck, CircleX } from 'lucide-react';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';

const USED = [
  'Income & allowance / business income you enter',
  'Essential & non-essential expenses',
  'Receipt categories & totals you verify',
  'Goal information you set',
  'Loan / EMI amounts \u2014 only if you enter them',
];
const NEVER = [
  'Caste, religion, gender, or political views',
  'Aadhaar, card numbers, PINs or passwords',
  'Bank-login credentials or contacts',
];

// Plain-language consent card. Blocks analysis until the user clearly agrees.
export function ConsentModal({ active, history = [], onAgree, onWithdraw, onDelete, onViewData, busy }) {
  const { lang } = useApp();
  return (
    <Card className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">{t(lang, 'consent_title')}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t(lang, 'no_loan_push')}</p>

      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-2 font-semibold text-emerald-700"><CircleCheck className="h-5 w-5" /> {t(lang, 'consent_collected')}</div>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {USED.map((x) => <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />{x}</li>)}
          </ul>
        </div>
        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-2 font-semibold text-rose-600"><CircleX className="h-5 w-5" /> {t(lang, 'consent_never')}</div>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {NEVER.map((x) => <li key={x} className="flex gap-2"><CircleX className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />{x}</li>)}
          </ul>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        Purpose: cash-flow analysis, savings planning, a financial-health checklist, and relevant support options.
        You can withdraw consent, export, or delete your data at any time.
      </p>

      <div className="flex flex-wrap gap-2 mt-5">
        {!active && <Button onClick={onAgree} disabled={busy}><Check className="h-4 w-4 mr-1" /> {t(lang, 'consent_agree')}</Button>}
        <Button variant="outline" onClick={onViewData}><Eye className="h-4 w-4 mr-1" /> {t(lang, 'consent_view')}</Button>
        {active && <Button variant="outline" onClick={onWithdraw} disabled={busy}><ShieldOff className="h-4 w-4 mr-1" /> {t(lang, 'consent_withdraw')}</Button>}
        {onDelete && <Button variant="ghost" className="text-rose-600" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" /> {t(lang, 'consent_delete')}</Button>}
      </div>

      {history.length > 0 && (
        <div className="mt-6">
          <div className="text-sm font-semibold mb-2">Consent history</div>
          <div className="space-y-1.5">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-xs rounded-lg bg-secondary/60 px-3 py-2">
                <span>{h.status && !h.withdrawn_at ? 'Consent given' : 'Consent withdrawn'} · {h.purpose}</span>
                <span className="text-muted-foreground">{formatDate(h.withdrawn_at || h.consented_at, lang)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default ConsentModal;
