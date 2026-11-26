'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/apiClient';
import { money, paise, summarize, today, voiceDraft } from '@/lib/business';
import {
  PASSPORT_VERSION,
  comparePassport,
  passportFor,
} from '@/lib/evidencePassport';
import { ReceiptVerificationForm } from '@/components/rupee/ReceiptVerificationForm';
import styles from './BusinessDesk.module.css';

const blank = () => ({
  id: crypto.randomUUID(),
  day: today(),
  kind: 'sale',
  method: 'cash',
  category: 'Sales',
  party: '',
  item: '',
  units: '',
  reorder: '',
  invoice: '',
  gstin: '',
  rupees: '',
  taxRupees: '0',
  receipt_id: '',
});
const tabs = ['Ledger', 'Stock & suppliers', 'Evidence Passport'];
const sampleDoc = {
  id: 'demo-receipt',
  merchant: 'Example wholesaler',
  receipt_date: today(),
  total: 500,
  currency: 'INR',
  user_verified: true,
  category: 'Stock',
};
const initialDemo = () =>
  [
    {
      ...blank(),
      kind: 'purchase',
      category: 'Stock',
      amount: 50000,
      item: 'Rice bag',
      units: 10,
      reorder: 3,
      party: sampleDoc.merchant,
      receipt_id: sampleDoc.id,
    },
    {
      ...blank(),
      amount: 16000,
      item: 'Rice bag',
      units: 2,
      method: 'udhaar',
      party: 'Example customer',
    },
  ].map((r, i) => ({
    ...r,
    tax: 0,
    created_at: new Date(Date.now() - 2000 + i).toISOString(),
  }));

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Field({ label, children }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function BusinessDesk({ demo = false, onNav }) {
  const [entries, setEntries] = useState(() => (demo ? initialDemo() : []));
  const [docs, setDocs] = useState(() =>
    demo
      ? [
          sampleDoc,
          {
            ...sampleDoc,
            id: 'demo-sale',
            merchant: 'Example customer',
            total: 160,
            category: 'Sales',
          },
        ]
      : [],
  );
  const [form, setForm] = useState(blank),
    [tab, setTab] = useState(tabs[0]);
  const [ready, setReady] = useState(demo),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [lang, setLang] = useState('en-IN'),
    [speech, setSpeech] = useState('');
  const lock = useRef(false),
    mic = useRef(null);
  useEffect(() => () => mic.current?.abort(), []);
  useEffect(() => {
    if (demo) return;
    let live = true;
    api('/business')
      .then((d) => {
        if (live) {
          setEntries(d.entries);
          setDocs(d.receipts);
          setReady(true);
        }
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [demo]);
  const info = summarize(entries, docs);
  const used = new Set(entries.map((e) => e.receipt_id));
  const available = docs.filter((d) => !used.has(d.id) && d.currency === 'INR');
  const [demoScan,setDemoScan]=useState(null);
  async function scanSample(){
    setBusy(true);
    try{const r=await fetch('/api/demo/document');if(!r.ok)throw Error('Local demo scanner unavailable. Check Tesseract installation.');setDemoScan(await r.json());}
    catch(e){setMessage(e.message);}finally{setBusy(false);}
  }
  const selectedDoc=docs.find(d=>d.id===form.receipt_id);
  const stockCandidates=(selectedDoc?.items||[]).map(i=>({item:i.item_name,units:i.quantity,net:i.price==null?null:Math.round(i.price*100)}));
  const patch = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key, label, attrs = {}) => (
    <Field label={label}>
      <input
        value={form[key]}
        onChange={(e) => patch(key, e.target.value)}
        {...attrs}
      />
    </Field>
  );
  async function change(method, body) {
    if (lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      let entry;
      if (demo)
        entry =
          method === 'POST'
            ? { ...body, created_at: new Date().toISOString() }
            : {
                ...entries.find((r) => r.id === body.id),
                ...body,
                ...(body.paid_by ? { paid_on: today() } : {}),
              };
      else ({ entry } = await api('/business', { method, body }));
      setEntries((prev) =>
        method === 'POST'
          ? [...prev, entry]
          : prev.map((r) => (r.id === entry.id ? entry : r)),
      );
      if (method === 'POST') setForm(blank());
      setMessage(
        method === 'POST' ? 'Transaction recorded.' : 'Ledger updated.',
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function save(e) {
    e.preventDefault();
    try {
      const { rupees, taxRupees, ...r } = form;
      const amount = paise(rupees),
        tax = paise(taxRupees || 0);
      if (!amount || tax > amount)
        throw Error('Enter a positive total and GST within that total.');
      if (!r.category.trim() || (r.method === 'udhaar' && !r.party.trim()))
        throw Error('Enter a category and a party for udhaar.');
      if(!r.kind||!r.method||!r.day)throw Error('Confirm transaction type, payment and date.');
      const due=selectedDoc?.reviewed_business?.outstanding;
      if(r.method==='udhaar' && due!=null && Math.round(due*100)!==amount)throw Error('This document has a partial or zero balance. Enter the paid and unpaid portions separately after checking the source.');
      if(r.receipt_id&&taxRupees==='')throw Error('Confirm included GST. Enter 0 only when appropriate.');
      const stock_lines=r.useLines&&r.kind!=='expense'?stockCandidates:[];
      if(stock_lines.length && (stock_lines.some(l=>!l.item||!Number.isInteger(l.units)||l.units<1||l.net==null)||stock_lines.reduce((n,l)=>n+l.net,0)!==amount-tax))throw Error('Check quantities and line totals. Stock lines must match the net invoice amount.');
      change('POST', {
        stock_lines,
        ...r,
        amount,
        tax,
        item: stock_lines.length || r.kind === 'expense' ? '' : r.item.trim(),
        units: !stock_lines.length && r.kind !== 'expense' && r.item.trim() ? Number(r.units) : 0,
        reorder: Number(r.reorder || 0),
        receipt_id: r.receipt_id || null,
      });
    } catch (error) {
      setMessage(error.message);
    }
  }
  function listen() {
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setMessage(
        'Voice recognition is unavailable here. Type a phrase below or use keyboard dictation.',
      );
      return;
    }
    mic.current?.abort();
    const rec = new Recognition();
    mic.current = rec;
    rec.lang = lang;
    rec.onresult = (e) => {
      const phrase = e.results[0][0].transcript;
      setSpeech(phrase);
      setForm((f) => ({ ...f, ...voiceDraft(phrase) }));
      setMessage('Review the interpreted fields before saving.');
    };
    rec.onerror = () =>
      setMessage('Voice input stopped. Try again or type the phrase.');
    try {
      rec.start();
      setMessage('Listening…');
    } catch {
      setMessage('Microphone unavailable.');
    }
  }
  function passport() {
    return passportFor({
      entries,
      receipts: docs,
      summary: info,
      demo,
      asOf: today(),
    });
  }
  async function verify(file) {
    if (!file) return;
    try {
      if (file.size > 10000000)
        throw Error('Report exceeds the 10 MB comparison limit.');
      const saved = JSON.parse(await file.text());
      if (
        saved.version !== PASSPORT_VERSION ||
        saved.demo !== demo ||
        !Array.isArray(saved.entries)
      )
        throw Error('Choose a passport exported from this workspace.');
      const { same, reasons } = comparePassport(saved, passport());
      setMessage(
        same
          ? 'Report entries and calculations match your current ledger.'
          : `Differences found. The ledger, receipt evidence or report has changed. ${reasons.join(' ')}`,
      );
    } catch (e) {
      setMessage(e.message);
    }
  }
  const csv = () => {
    const gstCols=['taxable','discount','cgst','sgst','igst'];
    const cols = [
      'day',
      'kind',
      'party',
      'category',
      'invoice',
      'gstin',
      'gross_INR',
      'included_GST_INR',...gstCols.map(k=>k+'_INR'),
      'method',
      'receipt_id',
    ];
    const quote = (v) =>
      '"' +
      String(v ?? '')
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    download(
      'business-register.csv',
      [
        cols,
        ...entries.map((r) => [
          r.day,
          r.kind,
          r.party,
          r.category,
          r.invoice,
          r.gstin,
          (r.amount / 100).toFixed(2),
          (r.tax / 100).toFixed(2),...gstCols.map(k=>{const b=docs.find(d=>d.id===r.receipt_id)?.reviewed_business;return b?.[k]??b?.taxes?.[k]?.amount??'';}),
          r.method,
          r.receipt_id,
        ]),
      ]
        .map((row) => row.map(quote).join(','))
        .join('\r\n'),
      'text/csv;charset=utf-8',
    );
  };
  return (
    <section data-business-desk className={styles.desk}>
      <header className={styles.hero}>
        <div>
          <small>
            {demo
              ? 'INTERACTIVE DEMO · SAMPLE RECORDS · SESSION ONLY'
              : 'RUPEERIZZ / BUSINESS'}
          </small>
          <h1>Business ledger</h1>
          <p>
            Follow each rupee from the counter to your financial evidence
            report.
          </p>
        </div>
        {demo && <button onClick={() => onNav('landing')}>Exit demo</button>}
      </header>
      <nav className={styles.tabs}>
        {tabs.map((t) => (
          <button key={t} aria-pressed={t === tab} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <p role="status">
        {message || (!ready ? 'Loading your private ledger…' : '')}
      </p>
      {ready && (
        <>
          <div className={styles.metrics}>
            {[
              ['Net sales', info.sales],
              ['Operating profit', info.profit],
              ['Cash movement', info.cash],
              ['Udhaar to collect', info.owed],
            ].map(([k, v]) => (
              <article key={k}>
                <small>{k}</small>
                <strong>
                  {v == null ? 'Incomplete stock history' : money(v)}
                </strong>
              </article>
            ))}
          </div>
          {tab === tabs[0] && (
            <>
              {demo&&<article className={styles.panel}><h2>Try a supplier invoice</h2><button disabled={busy} onClick={scanSample}>{busy?'Reading image…':'Scan sample with local OCR'}</button>{demoScan&&<><img src="/ocr/sample-supplier.png" width="360" alt="Synthetic supplier invoice used for local OCR"/><ReceiptVerificationForm initial={demoScan.extraction} onConfirm={v=>{if(docs.some(d=>d.source_sha256===demoScan.source_sha256)){setMessage('Sample already saved.');return;}const d={...v,id:crypto.randomUUID(),ocr_origin:{...demoScan.extraction,meta:demoScan.extraction.extraction_meta},source_sha256:demoScan.source_sha256};setDocs(prev=>[...prev,d]);setDemoScan(null);setMessage('Reviewed document available under Receipt evidence.');}}/></>}</article>}
              <form className={styles.panel} onSubmit={save}>
                <h2>Record a transaction</h2>
                <details>
                  <summary>Voice entry</summary>
                  <p>
                    Your browser may send audio to its speech service when you
                    start the microphone. Review all fields before saving.
                  </p>
                  <Field label="Speech language">
                    <select
                      value={lang}
                      onChange={(e) => setLang(e.target.value)}
                    >
                      {[
                        ['en-IN', 'English'],
                        ['hi-IN', 'हिन्दी'],
                        ['or-IN', 'ଓଡ଼ିଆ'],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="button" onClick={listen}>
                    Start microphone
                  </button>
                  <Field label="Spoken or typed phrase">
                    <input
                      placeholder="Cash sale 250 · नकद बिक्री २५० · ନଗଦ ବିକ୍ରି ୨୫୦"
                      value={speech}
                      onChange={(e) => setSpeech(e.target.value)}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, ...voiceDraft(speech) }))
                    }
                  >
                    Use phrase
                  </button>
                </details>
                <div className={styles.grid}>
                  <Field label="Receipt evidence">
                    <select
                      value={form.receipt_id}
                      onChange={(e) => {
                        const d = available.find(
                          (x) => x.id === e.target.value,
                        );
                        setForm((f) => ({
                          ...f,
                          receipt_id: d?.id || '',
                          ...(d
                            ? {
                                kind:'',method:d.reviewed_business?.method||'',useLines:false,item:'',units:'',invoice:d.reviewed_business?.invoice||'',gstin:d.reviewed_business?.gstin||'',taxRupees:d.reviewed_business?.tax==null?'':String(d.reviewed_business.tax),
                                day: d.receipt_date || '',
                                rupees: String(d.total ?? ''),
                                party: d.merchant || '',
                                category: d.category || f.category,
                              }
                            : {}),
                        }));
                      }}
                    >
                      <option value="">Manual entry</option>
                      {available.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.merchant} · {d.receipt_date} · ₹{d.total}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Transaction">
                    <select
                      value={form.kind}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          kind: e.target.value,
                          category: {
                            sale: 'Sales',
                            purchase: 'Stock',
                            expense: 'Operating expense',
                          }[e.target.value],
                        }))
                      }
                    >
                      <option value="">Confirm sale, purchase or expense</option>{['sale', 'purchase', 'expense'].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </Field>
                  {input('rupees', 'Total including GST (₹)', {
                    required: true,
                    inputMode: 'decimal',
                  })}
                  {input('day', 'Transaction date', {
                    type: 'date',
                    required: true,
                    max: today(),
                  })}
                  <Field label="Payment">
                    <select
                      value={form.method}
                      onChange={(e) => patch('method', e.target.value)}
                    >
                      <option value="">Confirm payment status</option>{['cash', 'digital', 'udhaar'].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </Field>
                  {input('category', 'Category', {
                    required: true,
                    maxLength: 80,
                  })}
                  {input('party', 'Customer or supplier', {
                    required: form.method === 'udhaar',
                    maxLength: 100,
                  })}
                </div>
                {stockCandidates.length>0&&form.kind!=='expense'&&<label><input type="checkbox" checked={!!form.useLines} onChange={e=>patch('useLines',e.target.checked)}/> Post reviewed inventory lines: {stockCandidates.map(l=>l.item+' × '+(l.units??'?')).join(', ')}</label>}
                <details open={form.item ? true : undefined}>
                  <summary>Stock and invoice details</summary>
                  <div className={styles.grid}>
                    {form.kind !== 'expense' && (
                      <>
                        {input('item', 'Stock item', {
                          maxLength: 80,
                          list: 'stock-names',
                        })}
                        <datalist id="stock-names">
                          {info.stock.map((s) => (
                            <option key={s.name}>{s.name}</option>
                          ))}
                        </datalist>
                        {input('units', 'Quantity', {
                          type: 'number',
                          min: 1,
                          max: 1000000,
                          required: !!form.item.trim(),
                        })}
                        {form.kind === 'purchase' &&
                          input('reorder', 'Reorder at quantity', {
                            type: 'number',
                            min: 0,
                            max: 1000000,
                          })}
                      </>
                    )}
                    {input('invoice', 'Invoice number', { maxLength: 80 })}
                    {input('gstin', 'Counterparty GSTIN', {
                      pattern: '[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]',
                      title: 'Enter a 15-character uppercase GSTIN',
                    })}
                    {input('taxRupees', 'GST included (₹)', {
                      inputMode: 'decimal',
                    })}
                  </div>
                </details>
                <button disabled={busy} className={styles.primary}>
                  Save transaction
                </button>{' '}
                {!demo && (
                  <button type="button" onClick={() => onNav('receipts')}>
                    Scan or manage receipts
                  </button>
                )}
              </form>
              <article className={styles.panel}>
                <h2>Transaction history</h2>
                {!entries.length && (
                  <p>Your first saved entry will appear here.</p>
                )}
                {[...entries]
                  .sort(
                    (a, b) =>
                      b.day.localeCompare(a.day) ||
                      b.created_at.localeCompare(a.created_at),
                  )
                  .map((r) => (
                    <div key={r.id} className={styles.row}>
                      <div>
                        <strong>
                          {r.party || r.category} · {money(r.amount)}
                        </strong>
                        <small>
                          {r.day} · {r.kind} · {r.category} · {r.method}
                          {r.paid_on
                            ? ' · settled ' + r.paid_on + ' by ' + r.paid_by
                            : ''}
                        </small>
                      </div>
                      {r.method === 'udhaar' &&
                        !r.paid_on &&
                        ['cash', 'digital'].map((m) => (
                          <button
                            disabled={busy}
                            key={m}
                            onClick={() =>
                              change('PATCH', { id: r.id, paid_by: m })
                            }
                          >
                            Settle by {m}
                          </button>
                        ))}
                      {!r.receipt_id && available.length > 0 && (
                        <Field label="Link receipt">
                          <select
                            disabled={busy}
                            value=""
                            onChange={(e) =>
                              change('PATCH', {
                                id: r.id,
                                receipt_id: e.target.value,
                              })
                            }
                          >
                            <option value="">Choose receipt</option>
                            {available.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.merchant} · ₹{d.total} · {d.receipt_date}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                    </div>
                  ))}
              </article>
            </>
          )}
          {tab === tabs[1] && (
            <article className={styles.panel}>
              <h2>Stock on hand</h2>
              <p>
                Record the same item name on purchases and sales to track
                quantities.
              </p>
              {info.stock.map((s) => (
                <div className={styles.row} key={s.name}>
                  <strong>{s.name}</strong>
                  <span>
                    {s.units} units ·{' '}
                    {s.units < 0
                      ? 'Check missing purchases'
                      : s.units <= s.reorder
                        ? 'Reorder now'
                        : 'In stock'}
                  </span>
                </div>
              ))}
              <h2>Supplier purchases</h2>
              {info.suppliers.length === 0 && (
                <p>Add a supplier to a purchase to see its history.</p>
              )}
              {info.suppliers.map(([name, amount]) => (
                <details key={name}>
                  <summary>
                    {name} · {money(amount)}
                  </summary>
                  {entries
                    .filter((r) => r.kind === 'purchase' && r.party === name)
                    .map((r) => (
                      <p key={r.id}>
                        {r.day} · {r.item || r.category} · {money(r.amount)} ·{' '}
                        {r.invoice || 'No invoice number'}
                      </p>
                    ))}
                </details>
              ))}
            </article>
          )}
          {tab === tabs[2] && (
            <article className={styles.panel}>
              <h2>Financial Evidence Passport</h2>
              <h3>
                {info.coverage == null
                  ? 'Awaiting first entry'
                  : info.coverage + '% receipt coverage'}
              </h3>
              <p>
                {info.supported} of {entries.length} entries have an
                owner-reviewed INR receipt matching the date and gross amount,
                across {info.days} recorded trading days. Coverage describes the
                evidence available for review. Lenders determine eligibility
                independently.
              </p>
              <p>
                Operating expenses {money(info.expenses)} · Stock cost sold{' '}
                {money(info.costs)} · Unpaid suppliers {money(info.payable)}
              </p>
              <p>
                Profit uses net sales less recorded expenses and moving-average
                stock cost. Purchases without stock items are expensed
                immediately. Cash movement includes actual settlements.
              </p>
              <h3>Next 30 days</h3>
              <p>
                {info.forecast == null
                  ? 'Forecast available once the ledger spans 30 days.'
                  : 'Projected net cash movement ' +
                    money(info.forecast) +
                    ' if the last 30 calendar days repeat.'}
              </p>
              <h3>Evidence to review</h3>
              {info.evidence.map((e) => (
                <p key={e.entry}>
                  {entries.find((r) => r.id === e.entry)?.day} ·{' '}
                  {e.entry.slice(0, 8)} · {e.status}
                </p>
              ))}
              <button
                onClick={() =>
                  download(
                    'RupeeRizz-passport.json',
                    JSON.stringify(passport(), null, 2),
                    'application/json',
                  )
                }
              >
                Download passport JSON
              </button>{' '}
              <button onClick={() => window.print()}>Print / save PDF</button>{' '}
              <button onClick={csv}>Export GST register</button>
              <Field label="Compare an exported passport with this ledger">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => verify(e.target.files?.[0])}
                />
              </Field>
              <p>
                The register contains the invoice details and tax amounts you
                entered. Review missing invoice numbers and GSTINs before
                preparing a return.
              </p>
              {!demo && (
                <div className={styles.tabs}>
                  {[
                    ['options', 'Government schemes'],
                    ['before-you-borrow', 'Before borrowing'],
                    ['grow', 'Grow savings'],
                  ].map(([k, l]) => (
                    <button key={k} onClick={() => onNav(k)}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </article>
          )}
        </>
      )}
    </section>
  );
}
