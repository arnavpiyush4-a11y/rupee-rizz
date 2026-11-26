// Financial Evidence Passport.
//
// The passport is an export of what the owner recorded, together with the
// strength of the evidence behind it. It reports; it never adjudicates. It must
// be reproducible from the ledger it describes, which is what makes the
// comparison in `comparePassport` meaningful.
import { summarize, today, gstForEntry } from './business.js';
import { evidenceGrade } from './gst.js';

export const PASSPORT_VERSION = 1;

const ENTRY_KEYS = [
  'id',
  'created_at',
  'day',
  'kind',
  'method',
  'amount',
  'tax',
  'category',
  'party',
  'item',
  'stock_lines',
  'units',
  'reorder',
  'invoice',
  'gstin',
  'receipt_id',
  'paid_on',
  'paid_by',
];

const text = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};
const component = (entry) =>
  entry == null
    ? null
    : {
        amount: entry.amount == null ? null : Number(entry.amount),
        rate: entry.rate == null ? null : Number(entry.rate),
      };

// A flat projection of the stored review: exactly the fields the GST
// reconciliation reads, so the passport can be re-derived from itself.
export function taxEvidence(review) {
  if (!review) return null;
  return {
    invoice: text(review.invoice),
    gstin: text(review.gstin),
    docType: review.docType ?? 'unclassified',
    taxable: review.taxable ?? null,
    discount: review.discount ?? null,
    tax: review.tax ?? null,
    taxes: {
      cgst: component(review.taxes?.cgst),
      sgst: component(review.taxes?.sgst),
      igst: component(review.taxes?.igst),
    },
    supplierGstin: text(review.supplierGstin),
    recipientGstin: text(review.recipientGstin),
    placeOfSupply: text(review.placeOfSupply),
    supplierState: text(review.supplierState),
    recipientState: text(review.recipientState),
  };
}

function evidenceReceipt(doc) {
  const evidence = taxEvidence(doc.reviewed_business);
  // Re-reconcile from the projection rather than copying a stored verdict, so a
  // hand-edited export cannot assert a status its own numbers do not support.
  const gst = gstForEntry({ ...doc, reviewed_business: evidence });
  return {
    id: doc.id,
    receipt_date: doc.receipt_date,
    total: doc.total,
    currency: doc.currency,
    user_verified: doc.user_verified,
    has_source: doc.has_source,
    source_sha256: doc.source_sha256 || null,
    provenance: doc.ocr_origin
      ? {
          engine: doc.ocr_origin.meta?.engine,
          confidence: doc.ocr_origin.meta?.overall_confidence,
          warnings: doc.ocr_origin.meta?.warnings,
          extracted_total: doc.ocr_origin.total,
          extracted_date: doc.ocr_origin.date,
          corrected_fields: [
            ...(doc.ocr_origin.total !== Number(doc.total) ? ['total'] : []),
            ...(doc.ocr_origin.date !== doc.receipt_date ? ['date'] : []),
          ],
          reviewed_tax: doc.reviewed_business?.tax,
        }
      : null,
    totalUnit: 'rupees',
    reviewed_business: evidence,
    gst,
    gst_status: gst
      ? evidenceGrade(gst, {
          hasSourceDocument: !!doc.source_sha256,
          userVerified: !!doc.user_verified,
        })
      : 'unverified',
  };
}

export function passportFor({
  entries = [],
  receipts = [],
  summary = null,
  demo = false,
  asOf = today(),
} = {}) {
  const info = summary || summarize(entries, receipts, asOf);
  const used = new Set(entries.map((e) => e.receipt_id));
  const rows = entries.map((r) =>
    Object.fromEntries(ENTRY_KEYS.map((k) => [k, r[k] ?? null])),
  );
  return {
    version: PASSPORT_VERSION,
    demo,
    asOf,
    currency: 'INR',
    moneyUnit: 'paise',
    rule: 'Coverage = reviewed INR receipts matching entry date and gross amount / all entries. GST evidence is graded verified, partially-verified or unverified per document; arithmetic that balances is not by itself verification. Owner-entered records; no independent authentication or credit decision.',
    summary: info,
    gst: info.gst,
    entries: rows,
    receipts: receipts.filter((d) => used.has(d.id)).map(evidenceReceipt),
  };
}

// Compare an exported passport against the workspace it claims to describe.
// Every reason is reported, not just the first, so a user can see what moved.
export function comparePassport(saved, current) {
  const reasons = [];
  if (!saved || !Array.isArray(saved.entries) || !Array.isArray(saved.receipts)) {
    reasons.push('The report is not a readable passport.');
    return { same: false, reasons };
  }
  const lookup = new Map(current.entries.map((r) => [r.id, r]));
  const entriesMatch =
    saved.entries.length === lookup.size &&
    new Set(saved.entries.map((r) => r.id)).size === lookup.size &&
    saved.entries.every(
      (r) => JSON.stringify(r) === JSON.stringify(lookup.get(r.id)),
    );
  if (!entriesMatch)
    reasons.push('Ledger entries differ from this workspace.');

  const receiptOrder = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const receiptsMatch =
    JSON.stringify(receiptOrder(saved.receipts)) ===
    JSON.stringify(receiptOrder(current.receipts));
  if (!receiptsMatch)
    reasons.push('Receipt evidence or its tax breakdown differs from this workspace.');

  const recalculated = summarize(
    current.entries,
    current.receipts,
    saved.asOf || current.asOf,
  );
  if (JSON.stringify(saved.summary) !== JSON.stringify(recalculated))
    reasons.push('The reported totals do not recalculate from the current ledger.');

  return { same: reasons.length === 0, reasons };
}
