import { reconcileGst, evidenceGrade } from './gst.js';

export const money = (p) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    p / 100,
  );
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  export function isValidBusinessDate(value, asOf = today()) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return false;
  }

  return value <= asOf;
}
export function paise(value) {
  const s = String(value).trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s))
    throw Error('Enter rupees with up to two decimal places.');
  const [whole, fraction = ''] = s.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
// Reconcile one ledger entry against the tax evidence recorded on the document
// it cites. The report describes the source; it never fills a gap with a guess.
export function gstForEntry(doc) {
  const review = doc?.reviewed_business || null;
  if (!review) return null;
  return reconcileGst({
    taxable: review.taxable,
    discount: review.discount,
    tax: review.tax,
    taxes: review.taxes || {},
    total: doc.total,
    gstin: review.gstin,
    supplierGstin: review.supplierGstin ?? null,
    recipientGstin: review.recipientGstin ?? null,
    placeOfSupply: review.placeOfSupply ?? null,
    supplierState: review.supplierState ?? null,
    recipientState: review.recipientState ?? null,
  });
}
export function summarize(entries, receipts = [], asOf = today()) {
  let sales = 0,
    expenses = 0,
    costs = 0,
    cash = 0,
    recent = 0,
    owed = 0,
    payable = 0,
    supported = 0,
    costKnown = true;
  const stock = new Map(),
    suppliers = new Map();
  const docs = new Map(receipts.map((r) => [r.id, r]));
  const rows = [...entries].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
  const evidence = [];
  // GST aggregation. A missing component stays null rather than becoming zero,
  // so an unrecorded tax breakdown cannot read as a declared nil return.
  const gstSum = { included_tax: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, component_total: 0 };
  const gstKnown = { taxable: 0, cgst: 0, sgst: 0, igst: 0, component_total: 0 };
  const grades = { verified: 0, 'partially-verified': 0, unverified: 0 };
  const issueCounts = new Map();
  let gstDocuments = 0;
  let taxMismatches = 0;
  for (const r of rows) {
    const sign = r.kind === 'sale' ? 1 : -1;
    const net = r.amount - r.tax;
    const lines = r.stock_lines?.length ? r.stock_lines : r.item ? [{item:r.item,units:r.units,net,reorder:r.reorder}] : [];
    if (sign === 1) sales += net;
    else if (r.kind === 'expense' || !lines.length) expenses += net;
    if (r.kind === 'purchase' && r.party)
      suppliers.set(r.party, (suppliers.get(r.party) || 0) + r.amount);
    for (const line of lines) {
      const key = line.item.trim().toLowerCase();
      const s = stock.get(key) || {
        name: line.item,
        units: 0,
        cost: 0,
        reorder: 0,
      };
      if (sign === 1) {
        if (s.units < line.units) costKnown = false;
        const unitsToCost = Math.min(line.units, s.units);
  const used =
    s.units > 0 && unitsToCost > 0
      ? Number(
          (BigInt(Math.max(0, s.cost)) *
            BigInt(unitsToCost) *
            2n +
            BigInt(s.units)) /
            (2n * BigInt(s.units)),
        )
      : 0;
  costs += used;
  s.cost = Math.max(0, s.cost - used);
  s.units -= line.units;
      } else {
        s.cost += line.net;
        s.units += line.units;
        s.reorder = line.reorder ?? s.reorder;
      }
      stock.set(key, s);
    }
    const paid = r.method === 'udhaar' ? r.paid_on : r.day;
    if (paid) {
      cash += sign * r.amount;
      const age = (Date.parse(asOf) - Date.parse(paid)) / 86400000;
      if (age >= 0 && age < 30) recent += sign * r.amount;
    } else if (sign === 1) owed += r.amount;
    else payable += r.amount;
    const doc = docs.get(r.receipt_id);
    const matches = !!(
      doc?.user_verified && doc.has_source!==false &&
      doc.currency === 'INR' &&
      Number(doc.total) > 0 &&
      Math.round(Number(doc.total) * 100) === r.amount &&
      doc.receipt_date === r.day
    );
    if (matches) supported++;

    const gst = gstForEntry(doc);
    const gstStatus = gst
      ? evidenceGrade(gst, {
          // A source document and an owner confirmation are both required before
          // tax evidence is called verified; balancing arithmetic is not enough.
          hasSourceDocument: !!doc?.source_sha256,
          userVerified: !!doc?.user_verified,
        })
      : 'unverified';
    grades[gstStatus] += 1;
    for (const issue of gst?.issues || []) {
      const seen = issueCounts.get(issue.code) || {
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        count: 0,
      };
      seen.count += 1;
      issueCounts.set(issue.code, seen);
    }
    gstSum.included_tax += r.tax;
    if (gst) {
      gstDocuments += 1;
      const d = gst.declaredPaise;
      if (d.taxable != null) { gstSum.taxable += d.taxable; gstKnown.taxable += 1; }
      for (const k of ['cgst', 'sgst', 'igst'])
        if (d[k] != null) { gstSum[k] += d[k]; gstKnown[k] += 1; }
      if (gst.componentTotalPaise != null) {
        gstSum.component_total += gst.componentTotalPaise;
        gstKnown.component_total += 1;
        // Does the GST the ledger deducted agree with the document's own components?
        if (Math.abs(r.tax - gst.componentTotalPaise) > 1) taxMismatches += 1;
      }
    }

    evidence.push({
      entry: r.id,
      receipt: r.receipt_id || null,
      origin: doc?.source_sha256 ? 'Source image with owner review' : doc ? 'Legacy owner-reviewed record' : 'Self-reported',
      source_sha256:doc?.source_sha256||null,
      independently_verified:false,
      classification:!doc?'self-reported':doc.ocr_origin||doc.provenance?'OCR extracted, owner confirmed':'owner confirmed',

      status: matches
        ? 'Reviewed receipt matches date and amount'
        : doc
          ? 'Review receipt date, currency and amount'
          : 'Attach a receipt when available',
      gst_status: gstStatus,
      gst_evidence: gst ? 'Tax breakdown recorded on the document' : 'No tax breakdown recorded',
      gst_issues: gst ? gst.issues.map((i) => i.code) : [],
      gst_component_total_paise: gst?.componentTotalPaise ?? null,
    });
  }
  const days = new Set(rows.map((r) => r.day)).size;
  return {
    sales,
    expenses,
    costs,
    profit: costKnown ? sales - expenses - costs : null,
    cash,
    owed,
    payable,
    forecast:
      rows.length && Date.parse(asOf) - Date.parse(rows[0].day) >= 29 * 86400000
        ? recent
        : null,
    stock: [...stock.values()],
    suppliers: [...suppliers],
    supported,
    days,
    evidence,
    coverage: rows.length ? Math.round((100 * supported) / rows.length) : null,
    gst: {
      documents: gstDocuments,
      included_tax_paise: gstSum.included_tax,
      taxable_paise: gstKnown.taxable ? gstSum.taxable : null,
      cgst_paise: gstKnown.cgst ? gstSum.cgst : null,
      sgst_paise: gstKnown.sgst ? gstSum.sgst : null,
      igst_paise: gstKnown.igst ? gstSum.igst : null,
      component_total_paise: gstKnown.component_total ? gstSum.component_total : null,
      mismatched_entries: taxMismatches,
      evidence: {
        verified: grades.verified,
        'partially-verified': grades['partially-verified'],
        unverified: grades.unverified,
      },
      issues: [...issueCounts.values()],
    },
  };
}
export function voiceDraft(text) {
  const s = text
    .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 2406))
    .replace(/[୦-୯]/g, (c) => String(c.charCodeAt(0) - 2918));
  const amounts = s.match(/\d+(?:[,.]\d+)*/g) || [];
  const kind = /sale|sold|बिक्री|बेचा|ବିକ୍ରି|ବିକ୍ରୟ/i.test(s)
    ? 'sale'
    : /purchase|bought|खरीद|କିଣ/i.test(s)
      ? 'purchase'
      : /expense|spent|खर्च|ଖର୍ଚ୍ଚ/i.test(s)
        ? 'expense'
        : null;
  const method = /cash|नकद|नगद|ନଗଦ/i.test(s)
    ? 'cash'
    : /upi|digital|डिजिटल|ୟୁପିଆଇ|ଡିଜିଟାଲ/i.test(s)
      ? 'digital'
      : /credit|udhaar|उधार|ଉଧାର/i.test(s)
        ? 'udhaar'
        : null;
  return {
    ...(kind && { kind }),
    ...(method && { method }),
    ...(amounts.length === 1 && { rupees: amounts[0].replaceAll(',', '') }),
  };
}
