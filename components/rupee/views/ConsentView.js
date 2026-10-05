'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { ConsentModal } from '@/components/rupee/ConsentModal';

export function ConsentView({ onAgreed }) {
  const { consent, refresh, logout } = useApp();
  const [busy, setBusy] = useState(false);

  const agree = async () => {
    setBusy(true);
    try { await api('/consent', { method: 'POST' }); await refresh(); toast.success('Thanks — consent recorded.'); onAgreed?.(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const withdraw = async () => {
    setBusy(true);
    try { await api('/consent/withdraw', { method: 'POST' }); await refresh(); toast.message('Consent withdrawn. Analysis is paused.'); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const del = async () => {
    setBusy(true);
    try { await api('/my-data/delete', { method: 'POST' }); toast.success('All your data was deleted.'); logout(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-grid-soft p-4">
      <ConsentModal
        active={consent?.active}
        history={consent?.history || []}
        busy={busy}
        onAgree={agree}
        onWithdraw={withdraw}
        onDelete={del}
        onViewData={() => toast.info('We use only: income, expenses, verified receipt categories, goals, and any EMI you enter. Nothing sensitive is used for scoring.')}
      />
    </div>
  );
}

export default ConsentView;
