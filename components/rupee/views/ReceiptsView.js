'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ScanLine, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useApp } from '@/app/providers';
import { formatINR, formatDate } from '@/lib/format';
import { Loading, EmptyState } from '@/components/rupee/common';
import { ReceiptUploader } from '@/components/rupee/ReceiptUploader';
import { ReceiptVerificationForm } from '@/components/rupee/ReceiptVerificationForm';
import { SecurityAlertBanner } from '@/components/rupee/SecurityAlertBanner';

export function ReceiptsView() {
  const { lang } = useApp();
  const [mode, setMode] = useState('list');
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [sensitive, setSensitive] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api('/receipts'); setReceipts(d.receipts || []); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onScan = async (dataUrl) => {
    setScanning(true);
    try {
      const d = await api('/ocr/receipt', { method: 'POST', body: { image: dataUrl } });
      setExtraction(d.extraction);
      setPendingImage(dataUrl);
      setSensitive(d.sensitive_found || []);
      setMode('verify');
      if (d.mode === 'demo') toast.message('Demo OCR: sample data extracted. Please verify before saving.');
    } catch (e) { toast.error(e.message); } finally { setScanning(false); }
  };

  const onConfirm = async (verified) => {
    setSaving(true);
    try {
      await api('/receipts', { method: 'POST', body: { ...verified, image: pendingImage } });
      toast.success('Receipt saved privately.');
      setExtraction(null); setPendingImage(null); setSensitive([]);
      setMode('list'); load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const del = async (id) => {
    try { await api(`/receipts/${id}`, { method: 'DELETE' }); toast.success('Receipt deleted.'); load(); }
    catch (e) { toast.error(e.message); }
  };

  if (mode === 'upload') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <button onClick={() => setMode('list')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to receipts</button>
        <h1 className="text-2xl font-bold">Scan a receipt</h1>
        <ReceiptUploader onScan={onScan} scanning={scanning} />
      </div>
    );
  }

  if (mode === 'verify') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <button onClick={() => setMode('upload')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Rescan</button>
        <h1 className="text-2xl font-bold">Verify the details</h1>
        {sensitive.length > 0 && <SecurityAlertBanner variant="mask">This receipt contains a {sensitive.join(', ')}. It will be masked before saving.</SecurityAlertBanner>}
        <ReceiptVerificationForm initial={extraction} onConfirm={onConfirm} saving={saving} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Receipts</h1><p className="text-muted-foreground text-sm">Scan, verify and store receipts privately.</p></div>
        <Button onClick={() => setMode('upload')}><ScanLine className="h-4 w-4 mr-1" /> Scan new receipt</Button>
      </div>
      <SecurityAlertBanner variant="info"><span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Your receipts stay private and can be deleted anytime from here or My Data.</span></SecurityAlertBanner>

      {loading ? <Loading /> : receipts.length === 0 ? (
        <EmptyState icon={ScanLine} title="No receipts yet" hint="Scan your first receipt to see spending insights and safe-saving nudges." action={<Button onClick={() => setMode('upload')}>Scan a receipt</Button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {receipts.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.merchant || 'Receipt'}</div>
                  <div className="text-xs text-muted-foreground">{r.receipt_date ? formatDate(r.receipt_date, lang) : 'No date'}</div>
                </div>
                <Button size="icon" variant="ghost" className="text-rose-500" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Badge variant="secondary">{r.category}</Badge>
                <span className="font-bold">{formatINR(r.total)}</span>
              </div>
              {r.user_verified && <span className="text-[11px] text-emerald-600 mt-2 inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Verified</span>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReceiptsView;
