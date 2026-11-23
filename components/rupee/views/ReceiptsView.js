'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Camera, ScanLine, ShieldCheck, Sparkles, Trash2, Upload, WandSparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  const [editing,setEditing]=useState(null);
  const [language,setLanguage]=useState('en');
  const onScan = async (dataUrl) => {
    setEditing(null);setScanning(true);
    try {
      const d = await api('/ocr/receipt', { method: 'POST', body: { image: dataUrl, language } });
      setExtraction(d.extraction); setPendingImage(dataUrl); setSensitive(d.sensitive_found || []); setMode('verify');
      toast.message('Local scan finished. Compare each field with the source.');
    } catch (e) { toast.error(e.message); } finally { setScanning(false); }
  };

  const onConfirm = async (verified) => {
    setSaving(true);
    try { await api(editing?'/receipts/'+editing.id+'/review':'/receipts', {method:editing?'PUT':'POST',body:editing?{...verified,revision:editing.review_revision}:{...verified,image:pendingImage}}); toast.success('Receipt saved privately.'); setEditing(null);setExtraction(null); setPendingImage(null); setSensitive([]); setMode('list'); load(); }
    catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  async function review(r){
    try{const {url}=await api('/receipts/'+r.id+'/image');setEditing(r);setPendingImage(url);
      setExtraction({merchant:r.merchant,date:r.receipt_date,total:r.total,category:r.category,items:r.items,business:r.reviewed_business,extraction_meta:r.ocr_origin.meta});setMode('verify');
    }catch(e){toast.error(e.message);}
  }
  const del = async (id) => {
    try { await api(`/receipts/${id}`, { method: 'DELETE' }); toast.success('Receipt deleted.'); load(); }
    catch (e) { toast.error(e.message); }
  };

  if (mode === 'upload') {
    return (
      <div className="rr-receipts-page max-w-3xl mx-auto space-y-5">
        <button onClick={() => setMode('list')} className="rr-back-link"><ArrowLeft size={14} /> Back to receipts</button>
        <section className="rr-scan-hero"><div><span className="rr-eyebrow"><WandSparkles size={13} /> receipt intelligence</span><h1>Give Rizz a receipt.<br /><em>Let it do the boring part.</em></h1><p>Snap or upload a clear receipt. We extract the merchant, total, date and category — then you verify everything before it becomes part of your money story.</p></div><motion.div className="rr-scan-hero-token" animate={{ y:[0,-8,0],rotate:[0,4,-3,0] }} transition={{ duration:4, repeat:Infinity }}><ScanLine size={29} /></motion.div></section>
        <Card className="rr-scan-card p-5"><label>Document language <select value={language} onChange={e=>setLanguage(e.target.value)} disabled={scanning}><option value="en">English</option><option value="hi">Hindi + English</option><option value="or">Odia + English (experimental)</option></select></label><ReceiptUploader onScan={onScan} scanning={scanning} /></Card>
        <div className="rr-scan-notes"><span><ShieldCheck size={14} /> verify before save</span><span><Sparkles size={14} /> private source image</span><span><Trash2 size={14} /> delete anytime</span></div>
      </div>
    );
  }

  if (mode === 'verify') {
    return (
      <div className="rr-receipts-page max-w-3xl mx-auto space-y-5">
        <button onClick={() => setMode('upload')} className="rr-back-link"><ArrowLeft size={14} /> Rescan</button>
        <section><span className="rr-mini-label">STEP 02 · HUMAN CHECK</span><h1 className="rr-page-title">Does this look right?</h1><p className="rr-page-sub">Compare the local OCR draft with the original before saving.</p></section>
        {sensitive.length > 0 && <SecurityAlertBanner variant="mask">Sensitive text is masked in extracted fields. The original image is stored privately.</SecurityAlertBanner>}
        {editing&&<p>Confirming a correction also updates linked ledger amounts and posted invoice lines. Existing udhaar settlements retain their payment history.</p>}<details><summary>View original document</summary><img src={pendingImage} alt="Original document for comparison" /></details><ReceiptVerificationForm initial={extraction} onConfirm={onConfirm} saving={saving} />
      </div>
    );
  }

  return (
    <div className="rr-receipts-page space-y-5">
      <section className="rr-page-head"><div><span className="rr-eyebrow"><ScanLine size={13} /> money moves</span><h1>Receipts</h1><p>Every scan becomes a small piece of context for your spending story.</p></div><Button onClick={() => setMode('upload')}><ScanLine size={15} /> Scan new receipt</Button></section>
      <SecurityAlertBanner variant="info"><span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Your receipts stay private and can be deleted anytime from here or My Data.</span></SecurityAlertBanner>

      {loading ? <Loading /> : receipts.length === 0 ? (
        <Card className="rr-empty-receipts p-5"><EmptyState icon={ScanLine} title="No receipts yet" hint="Scan your first receipt to create your first spending signal." action={<Button onClick={() => setMode('upload')}><Camera size={15} /> Scan a receipt</Button>} /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {receipts.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * .04 }}>
              <Card className="rr-receipt-card p-4 h-full">
                <div className="rr-receipt-top"><div className="rr-receipt-icon"><ScanLine size={15} /></div><Button size="icon" variant="ghost" className="text-rose-500" onClick={() => del(r.id)}><Trash2 size={14} /></Button></div>
                {r.ocr_origin&&<Button variant="outline" onClick={()=>review(r)}>Review source and correct</Button>}<div className="mt-3 font-semibold truncate">{r.merchant || 'Receipt'}</div>
                <div className="text-xs text-muted-foreground mt-1">{r.receipt_date ? formatDate(r.receipt_date, lang) : 'No date'}</div>
                <div className="mt-5 flex items-end justify-between gap-2"><div><Badge variant="secondary">{r.category}</Badge>{r.user_verified && <span className="rr-verified"><ShieldCheck size={11} /> Owner reviewed</span>}</div><span className="rr-receipt-amount">{formatINR(r.total)}</span></div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReceiptsView;
