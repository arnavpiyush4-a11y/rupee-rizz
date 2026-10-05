'use client';
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { t } from '@/lib/i18n';
import { Loading } from '@/components/rupee/common';
import { MyDataControlPanel } from '@/components/rupee/MyDataControlPanel';
import { SecurityAlertBanner } from '@/components/rupee/SecurityAlertBanner';

function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function MyDataView() {
  const { lang, consent, refresh, logout } = useApp();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api('/receipts'); setReceipts(d.receipts || []); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const deleteReceipt = async (id) => { try { await api(`/receipts/${id}`, { method: 'DELETE' }); toast.success('Receipt deleted.'); load(); } catch (e) { toast.error(e.message); } };
  const exportJson = async () => { try { const d = await api('/my-data/export'); download('rupeerizz-data.json', JSON.stringify(d.export, null, 2)); } catch (e) { toast.error(e.message); } };
  const exportCsv = async () => {
    try {
      const d = await api('/my-data/export');
      const rows = [['Type', 'Name', 'Date', 'Category', 'Amount']];
      (d.export.receipts || []).forEach((r) => rows.push(['receipt', r.merchant || '', r.receipt_date || '', r.category || '', r.total ?? '']));
      (d.export.goals || []).forEach((g) => rows.push(['goal', g.goal_name || '', g.target_date || '', 'goal', g.goal_amount ?? '']));
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      download('rupeerizz-data.csv', csv, 'text/csv');
    } catch (e) { toast.error(e.message); }
  };
  const withdrawConsent = async () => { setBusy(true); try { await api('/consent/withdraw', { method: 'POST' }); await refresh(); toast.message('Consent withdrawn. Analysis is paused.'); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const deleteAll = async () => { setBusy(true); try { await api('/my-data/delete', { method: 'POST' }); toast.success('All your data was deleted.'); logout(); } catch (e) { toast.error(e.message); setBusy(false); } };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">{t(lang, 'mydata_title')}</h1><p className="text-muted-foreground text-sm">You are in control. View, export, or delete your data anytime.</p></div>
      <div className="grid sm:grid-cols-2 gap-3">
        <SecurityAlertBanner variant="mask">Sensitive details like phone numbers and UPI IDs are masked before your receipts are saved.</SecurityAlertBanner>
        <SecurityAlertBanner variant="verify">AI-read totals are always shown for your verification before they update your savings plan.</SecurityAlertBanner>
      </div>
      {loading ? <Loading /> : (
        <MyDataControlPanel
          receipts={receipts} consent={consent} lang={lang} busy={busy}
          onDeleteReceipt={deleteReceipt} onExportJson={exportJson} onExportCsv={exportCsv}
          onWithdrawConsent={withdrawConsent} onDeleteAll={deleteAll}
        />
      )}
    </div>
  );
}

export default MyDataView;
