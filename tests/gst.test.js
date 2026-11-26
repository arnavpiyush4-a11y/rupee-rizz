import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GST_STATE_CODES,
  classifyJurisdiction,
  componentAmount,
  evidenceGrade,
  gstinChecksumValid,
  reconcileGst,
  toPaise,
  validateGstin,
} from '../lib/gst.js';
import { reviewedBusiness } from '../lib/ocr/review.js';
import { extractDocument } from '../lib/ocr/structure.js';
import { summarize } from '../lib/business.js';
import { passportFor, comparePassport } from '../lib/evidencePassport.js';

// Fixtures with valid GSTIN check digits, computed with the GSTN modulus-36 rule.
const MH = '27AAPFU0939F1ZV'; // state 27, Maharashtra
const KA = '29ABCDE1234F1ZW'; // state 29, Karnataka
const DL = '07AAACR5055K1Z9'; // state 07, Delhi

const codes = (report) => report.issues.map((i) => i.code);

// --- 4. Decimal rounding ---------------------------------------------------
test('money is carried as integer paise and rounds half-up on the third decimal', () => {
  assert.equal(toPaise('102.09'), 10209);
  assert.equal(toPaise('0.145'), 15); // Math.round(0.145 * 100) is 14
  assert.equal(toPaise(1.005), 101); // binary-float naive conversion gives 100
  assert.equal(toPaise(8.02), 802);
  assert.equal(toPaise(0), 0);
  assert.equal(toPaise(0.1 + 0.2), 30); // 0.30000000000000004 -> 30, not 3
  for (const absent of [null, undefined, '', '   ']) assert.equal(toPaise(absent), null);
  for (const junk of ['abc', '1.2.3', '1,00', '₹5']) assert.equal(toPaise(junk), null);
  // Derived amounts stay whole paise.
  assert.equal(componentAmount(12345, 9), 1111);
  assert.ok(Number.isInteger(componentAmount(33333, 18)));
});

// --- 1. Intra-state CGST + SGST -------------------------------------------
test('an intra-state supply splits the rate equally into CGST and SGST', () => {
  const report = reconcileGst({
    taxable: 1000,
    discount: 0,
    tax: 180,
    taxes: { cgst: { amount: 90, rate: 9 }, sgst: { amount: 90, rate: 9 } },
    total: 1180,
    gstin: MH,
    supplierState: '27',
    placeOfSupply: '27',
  });
  assert.equal(report.jurisdiction.kind, 'intra-state');
  // CGST = taxable * rate / 2 and SGST = taxable * rate / 2
  assert.equal(report.computedPaise.cgst, 9000);
  assert.equal(report.computedPaise.sgst, 9000);
  assert.equal(report.declaredPaise.cgst + report.declaredPaise.sgst, report.declaredPaise.tax);
  assert.equal(report.status, 'consistent');
  assert.deepEqual(report.issues, []);
});

// --- 2. Interstate IGST ----------------------------------------------------
test('an inter-state supply uses IGST and does not also carry CGST or SGST', () => {
  const report = reconcileGst({
    taxable: 1000,
    tax: 180,
    taxes: { igst: { amount: 180, rate: 18 } },
    total: 1180,
    gstin: KA,
    supplierState: '27',
    placeOfSupply: '29',
  });
  assert.equal(report.jurisdiction.kind, 'inter-state');
  // IGST = taxable * rate (not half of it)
  assert.equal(report.computedPaise.igst, 18000);
  assert.equal(report.declaredPaise.cgst, null);
  assert.equal(report.declaredPaise.sgst, null);
  assert.equal(report.status, 'consistent');
  assert.ok(!codes(report).includes('gst_double_count'));
});

// --- 3. Zero-rated and exempt transactions ---------------------------------
test('an explicit zero-rated supply is recorded as evidence, not as missing tax', () => {
  const report = reconcileGst({
    taxable: 1000,
    tax: 0,
    taxes: { igst: { amount: 0, rate: 0 } },
    total: 1000,
    gstin: KA,
    supplierState: '27',
    placeOfSupply: '29',
  });
  assert.equal(report.zeroRated, true);
  assert.equal(report.status, 'consistent');
  assert.equal(report.computedPaise.tax, 0);
  assert.ok(!codes(report).includes('gst_components_missing'));

  // Absent evidence is different from a declared nil and stays unverified.
  const absent = reconcileGst({ taxable: 1000, total: 1000, gstin: KA });
  assert.equal(absent.zeroRated, false);
  assert.ok(codes(absent).includes('gst_components_missing'));
});

// --- 5. Invalid GST rates --------------------------------------------------
test('impossible and non-notified GST rates are separated from valid ones', () => {
  assert.throws(
    () => reviewedBusiness({ taxes: { igst: { amount: 10, rate: 120 } } }, 100),
    /Check the GST percentage/,
  );
  assert.throws(
    () => reviewedBusiness({ taxes: { igst: { rate: 'abc' } } }, 100),
    /Enter a GST percentage/,
  );
  // A non-notified but arithmetically possible rate is flagged, not silently kept.
  const odd = reconcileGst({
    taxable: 100,
    tax: 74,
    taxes: { cgst: { amount: 37, rate: 37 }, sgst: { amount: 37, rate: 37 } },
    total: 174,
    gstin: MH,
    supplierState: '27',
    placeOfSupply: '27',
  });
  assert.ok(codes(odd).includes('gst_rate_unusual'));
  assert.equal(odd.status, 'partial');
  // The 0.25% slab halves to 0.125%, which two decimals cannot express.
  const fine = reconcileGst({
    taxable: 800,
    taxes: { cgst: { rate: 0.125 }, sgst: { rate: 0.125 } },
    total: 802,
    gstin: MH,
    supplierState: '27',
    placeOfSupply: '27',
  });
  assert.ok(!codes(fine).includes('gst_rate_unusual'));
  assert.equal(fine.computedPaise.cgst, 100); // 800 * 0.125%
});

// --- 6. Missing GSTIN ------------------------------------------------------
test('a missing GSTIN is reported and never fabricated', () => {
  const saved = reviewedBusiness(
    { taxable: 1000, tax: 180, taxes: { cgst: { amount: 90, rate: 9 }, sgst: { amount: 90, rate: 9 } } },
    1180,
  );
  assert.equal(saved.gstin, null);
  assert.equal(saved.gst.registration.present, false);
  assert.ok(saved.gst_issues.some((i) => i.code === 'gst_gstin_missing'));
  assert.ok(!codes(saved.gst).includes('gstin_checksum')); // nothing to check
  assert.equal(validateGstin('').present, false);
  assert.equal(validateGstin('').value, null);
});

test('GSTIN validation checks format, jurisdiction and check digit', () => {
  assert.equal(validateGstin(MH).valid, true);
  assert.equal(validateGstin(MH).state, '27');
  assert.ok(gstinChecksumValid(MH));
  assert.equal(gstinChecksumValid(DL), true);
  // A single transposed character breaks the modulus-36 check digit.
  assert.equal(gstinChecksumValid('27AAPFU0939F1ZX'), false);
  assert.equal(validateGstin('27AAPFU0939F1ZX').valid, true); // format ok
  assert.ok(codes(validateGstin('27AAPFU0939F1ZX')).includes('gstin_checksum'));
  // 00 is not a jurisdiction at all.
  assert.equal(validateGstin('00ABCDE1234F1Z5').valid, false);
  assert.ok(GST_STATE_CODES.has('27') && GST_STATE_CODES.has('38') && GST_STATE_CODES.has('97'));
  assert.ok(!GST_STATE_CODES.has('00') && !GST_STATE_CODES.has('39'));
  assert.throws(
    () => reviewedBusiness({ gstin: '00ABCDE1234F1Z5' }, 100),
    /not a registered GST jurisdiction/,
  );
});

// --- 7. Taxable-value discrepancies ---------------------------------------
test('GST amounts that do not match taxable value and rate are flagged', () => {
  const report = reconcileGst({
    taxable: 100,
    taxes: { cgst: { amount: 12, rate: 9 }, sgst: { amount: 9, rate: 9 } },
    total: 121,
    gstin: MH,
    supplierState: '27',
    placeOfSupply: '27',
  });
  // 9% of 100 is 9, so CGST 12 is inconsistent with its own declared base.
  assert.ok(codes(report).includes('gst_component_mismatch'));
  assert.equal(report.computedPaise.cgst, 900);
  assert.equal(report.status, 'partial');
  // A taxable base larger than the invoice total cannot be right.
  const inverted = reconcileGst({ taxable: 1000, total: 900, gstin: MH });
  assert.ok(codes(inverted).includes('gst_taxable_exceeds_total'));
});

// --- 8. Invoice-total discrepancies ---------------------------------------
test('taxable value plus GST less discount must reconcile to the invoice total', () => {
  const mismatch = reconcileGst({
    taxable: 100,
    discount: 0,
    tax: 18,
    total: 130,
    gstin: MH,
    supplierState: '27',
    placeOfSupply: '27',
  });
  assert.ok(codes(mismatch).includes('gst_total_mismatch'));
  // The same figures reconcile when the discount explains the difference.
  const discounted = reconcileGst({
    taxable: 100,
    discount: 0,
    tax: 18,
    total: 118,
    gstin: MH,
    supplierState: '27',
    placeOfSupply: '27',
  });
  assert.ok(!codes(discounted).includes('gst_total_mismatch'));
  assert.equal(discounted.status, 'consistent');
  // A discount larger than the invoice is reported.
  const oversized = reconcileGst({ taxable: 50, discount: 999, total: 100, gstin: MH });
  assert.ok(codes(oversized).includes('gst_discount_exceeds_total'));
});

test('an included GST figure that disagrees with its own components is flagged', () => {
  const report = reconcileGst({
    taxable: 100,
    tax: 18,
    taxes: { cgst: { amount: 4.5, rate: 9 }, sgst: { amount: 4.5, rate: 9 } },
    total: 118,
    gstin: MH,
    supplierState: '27',
    placeOfSupply: '27',
  });
  assert.ok(codes(report).includes('gst_tax_mismatch'));
});

// --- 9. OCR versus invoice conflicts --------------------------------------
test('OCR never double counts when a document prints both IGST and CGST/SGST', () => {
  const r = extractDocument(
    'Shop\nTax Invoice\nTaxable value 100.00\nCGST 9%: 9.00\nSGST 9%: 9.00\nIGST 18%: 18.00\nGrand Total 136.00\nPayment: cash',
    0.9,
  );
  // 9 + 9 + 18 = 36 would be a double count; the reading abstains instead.
  assert.equal(r.business.tax, null);
  assert.equal(r.business.tax_paise, null);
  assert.ok(
    r.extraction_meta.warnings.some((w) => w.includes('Both IGST and CGST/SGST')),
  );
});

test('OCR sums an intra-state tax breakdown in paise and reconciles it to the total', () => {
  const r = extractDocument(
    'Janata Grocery\nTAX INVOICE\nInvoice No: JG-99\nGSTIN: 29ABCDE1234F1ZW\nTaxable value 100.00\nCGST 9%: 9.00\nSGST 9%: 9.00\nGrand Total 118.00\nPayment: cash',
    0.9,
  );
  assert.equal(r.total, 118);
  assert.equal(r.business.tax_paise, 1800);
  assert.equal(r.business.tax, 18);
  assert.equal(r.business.gst.computedPaise.cgst, 900);
  // OCR cannot know the shop's own state, so the supply direction stays open
  // and the draft is graded partial rather than being silently assumed.
  assert.equal(r.business.gst.jurisdiction.kind, 'unknown');
  assert.ok(r.business.gst.issues.some((i) => i.code === 'gst_jurisdiction_unknown'));
  assert.equal(r.business.gst.status, 'partial');
});

test('the save path refuses a double-counted tax structure', () => {
  assert.throws(
    () =>
      reviewedBusiness(
        {
          taxes: {
            cgst: { amount: 9, rate: 9 },
            sgst: { amount: 9, rate: 9 },
            igst: { amount: 18, rate: 18 },
          },
          tax: 36,
        },
        136,
      ),
    /Both IGST and CGST\/SGST/,
  );
});

test('CGST and SGST must agree on rate, and neither may appear alone', () => {
  const split = reconcileGst({
    taxable: 100,
    taxes: { cgst: { rate: 9 }, sgst: { rate: 18 } },
    total: 100,
    gstin: MH,
    supplierState: '27',
    placeOfSupply: '27',
  });
  assert.ok(codes(split).includes('gst_rate_split'));
  const orphan = reconcileGst({ taxable: 100, taxes: { cgst: { rate: 9 } }, total: 100, gstin: MH });
  assert.ok(codes(orphan).includes('gst_component_orphan'));
});

test('the place of supply is never silently assumed', () => {
  // Without both state codes the direction of the supply is genuinely unknown.
  const unknown = classifyJurisdiction({ supplierGstin: MH });
  assert.equal(unknown.kind, 'unknown');
  assert.ok(/required/.test(unknown.reason));
  assert.equal(classifyJurisdiction({ supplierGstin: MH, placeOfSupply: '27' }).kind, 'intra-state');
  assert.equal(classifyJurisdiction({ supplierGstin: MH, placeOfSupply: DL }).kind, 'inter-state');

  const report = reconcileGst({
    taxable: 100,
    tax: 18,
    taxes: { igst: { amount: 18, rate: 18 } },
    total: 118,
    gstin: MH,
  });
  assert.ok(codes(report).includes('gst_jurisdiction_unknown'));
  assert.equal(report.status, 'partial');
  // Knowing the direction contradicts IGST between two different states.
  const conflict = reconcileGst({
    taxable: 100,
    tax: 18,
    taxes: { igst: { amount: 18, rate: 18 } },
    total: 118,
    gstin: MH,
    supplierState: '27',
    placeOfSupply: '27',
  });
  assert.ok(codes(conflict).includes('gst_jurisdiction_conflict'));
});

// --- 10 & 11. Evidence passport -------------------------------------------
const review = {
  invoice: 'INV-1',
  gstin: MH,
  docType: 'GST invoice',
  taxable: 1000,
  discount: 0,
  tax: 180,
  taxes: { cgst: { amount: 90, rate: 9 }, sgst: { amount: 90, rate: 9 }, igst: null },
  supplierState: '27',
  placeOfSupply: '27',
};
const receipt = {
  id: 'doc',
  receipt_date: '2026-03-01',
  total: 1180,
  currency: 'INR',
  user_verified: true,
  has_source: true,
  source_sha256: 'sample-hash',
  reviewed_business: review,
};
const entry = {
  id: 'e1',
  created_at: '1',
  day: '2026-03-01',
  kind: 'purchase',
  method: 'cash',
  amount: 118000,
  tax: 18000,
  category: 'Stock',
  party: 'Vendor',
  item: 'Rice',
  units: 10,
  reorder: 0,
  receipt_id: 'doc',
  invoice: 'INV-1',
  gstin: MH,
};

test('the passport reports GST totals that match the underlying invoice', () => {
  const passport = passportFor({ entries: [entry], receipts: [receipt] });
  assert.equal(passport.currency, 'INR');
  assert.equal(passport.moneyUnit, 'paise');
  assert.equal(passport.gst.documents, 1);
  assert.equal(passport.gst.taxable_paise, 100000);
  assert.equal(passport.gst.cgst_paise, 9000);
  assert.equal(passport.gst.sgst_paise, 9000);
  assert.equal(passport.gst.igst_paise, null);
  assert.equal(passport.gst.component_total_paise, 18000);
  assert.equal(passport.gst.included_tax_paise, 18000);
  assert.equal(passport.gst.mismatched_entries, 0);
  // GST in the passport equals the sum of the receipts it describes.
  const [doc] = passport.receipts;
  assert.equal(
    doc.gst.declaredPaise.cgst + doc.gst.declaredPaise.sgst,
    passport.gst.component_total_paise,
  );
  assert.equal(doc.reviewed_business.gstin, MH);
  assert.equal(passport.entries[0].receipt_id, 'doc');
});

test('a ledger entry whose GST disagrees with its document is counted', () => {
  const summary = summarize([{ ...entry, tax: 9000 }], [receipt]);
  assert.equal(summary.gst.mismatched_entries, 1);
  assert.equal(summary.gst.included_tax_paise, 9000);
});

test('verified evidence needs a source document and an owner confirmation', () => {
  const withSource = passportFor({ entries: [entry], receipts: [receipt] });
  assert.equal(withSource.receipts[0].gst.status, 'consistent');
  assert.equal(withSource.receipts[0].gst_status, 'verified');
  assert.equal(withSource.gst.evidence.verified, 1);

  // Arithmetic that balances is NOT verification on its own.
  const noSource = passportFor({
    entries: [entry],
    receipts: [{ ...receipt, source_sha256: null, has_source: false }],
  });
  assert.equal(noSource.receipts[0].gst.status, 'consistent');
  assert.equal(noSource.receipts[0].gst_status, 'partially-verified');
  assert.equal(noSource.gst.evidence.verified, 0);

  const unconfirmed = passportFor({
    entries: [entry],
    receipts: [{ ...receipt, user_verified: false }],
  });
  assert.equal(unconfirmed.receipts[0].gst_status, 'partially-verified');
  assert.equal(evidenceGrade(unconfirmed.receipts[0].gst, { hasSourceDocument: true }), 'partially-verified');
});

test('missing evidence stays missing in the passport', () => {
  const bare = { id: 'doc', receipt_date: '2026-03-01', total: 1180, currency: 'INR', user_verified: true, has_source: false };
  const passport = passportFor({
    entries: [{ ...entry, receipt_id: 'doc' }],
    receipts: [bare],
  });
  const [doc] = passport.receipts;
  assert.equal(doc.reviewed_business, null);
  assert.equal(doc.gst, null);
  assert.equal(doc.gst_status, 'unverified');
  assert.equal(passport.gst.documents, 0);
  assert.equal(passport.gst.taxable_paise, null);
  assert.equal(passport.gst.cgst_paise, null);

  // A partial breakdown keeps the unknowns null instead of inventing them.
  const partial = passportFor({
    entries: [{ ...entry, receipt_id: 'doc' }],
    receipts: [{ ...bare, reviewed_business: { tax: 180 } }],
  });
  const [p] = partial.receipts;
  assert.equal(p.reviewed_business.taxable, null);
  assert.equal(p.reviewed_business.taxes.cgst, null);
  assert.equal(p.gst.declared.taxable, null);
  assert.equal(p.gst.declaredPaise.cgst, null);
  assert.equal(p.gst.declaredPaise.tax, 18000);
  assert.equal(p.gst.declaredPaise.cgst, null);
  // Some tax evidence exists, so this is partial rather than absent.
  assert.equal(p.gst.status, 'partial');
  assert.equal(p.gst_status, 'partially-verified');
});

test('the passport preserves source provenance and corrected fields', () => {
  const passport = passportFor({
    entries: [entry],
    receipts: [
      {
        ...receipt,
        ocr_origin: {
          meta: { engine: 'Tesseract 5 LSTM', overall_confidence: 0.91, warnings: ['check total'] },
          total: 1180,
          date: '2026-03-02',
        },
      },
    ],
  });
  const [doc] = passport.receipts;
  assert.equal(doc.source_sha256, 'sample-hash');
  assert.equal(doc.provenance.engine, 'Tesseract 5 LSTM');
  assert.equal(doc.provenance.extracted_total, 1180);
  assert.deepEqual(doc.provenance.corrected_fields, ['date']);
  assert.equal(doc.provenance.reviewed_tax, 180);
});

test('an exported passport re-imports cleanly and detects tampering', () => {
  const current = passportFor({ entries: [entry], receipts: [receipt], demo: false });
  // Round-trip through JSON exactly as a downloaded file would.
  const saved = JSON.parse(JSON.stringify(current));
  assert.deepEqual(comparePassport(saved, current), { same: true, reasons: [] });

  const totals = JSON.parse(JSON.stringify(current));
  totals.summary.gst.cgst_paise = 1;
  const tamperedTotals = comparePassport(totals, current);
  assert.equal(tamperedTotals.same, false);
  assert.ok(tamperedTotals.reasons.some((r) => /do not recalculate/.test(r)));

  const evidence = JSON.parse(JSON.stringify(current));
  evidence.receipts[0].reviewed_business.tax = 90;
  const tamperedEvidence = comparePassport(evidence, current);
  assert.equal(tamperedEvidence.same, false);
  assert.ok(tamperedEvidence.reasons.some((r) => /differ|recalculate/.test(r)));

  const ledger = JSON.parse(JSON.stringify(current));
  ledger.entries[0].amount = 1;
  const tamperedLedger = comparePassport(ledger, current);
  assert.equal(tamperedLedger.same, false);
  assert.ok(tamperedLedger.reasons.some((r) => /Ledger entries differ/.test(r)));

  assert.equal(comparePassport({}, current).same, false);
  assert.equal(comparePassport(null, current).same, false);
});

// --- 12. Existing functionality regression --------------------------------
test('ledger arithmetic is unchanged and GST degrades to null without evidence', () => {
  const purchase = {
    id: 'a', created_at: '1', day: '2026-01-01', amount: 11000, tax: 1000,
    kind: 'purchase', method: 'cash', item: 'Tea', units: 10, reorder: 8,
    party: 'Shop', receipt_id: 'doc',
  };
  const sale = {
    ...purchase, id: 'b', day: '2026-01-02', amount: 5000, tax: 0,
    kind: 'sale', units: 2, method: 'udhaar', receipt_id: null,
  };
  const docs = [{ id: 'doc', user_verified: true, receipt_date: purchase.day, total: 110, currency: 'INR' }];
  const open = summarize([sale, purchase], docs, '2026-01-30');
  assert.deepEqual(
    [open.sales, open.profit, open.cash, open.owed, open.forecast, open.coverage],
    [5000, 3000, -11000, 5000, -11000, 50],
  );
  assert.equal(open.stock[0].units, 8);
  // No reviewed GST evidence on the document: report nulls, not zeros.
  assert.equal(open.gst.documents, 0);
  assert.equal(open.gst.taxable_paise, null);
  assert.equal(open.gst.cgst_paise, null);
  assert.equal(open.gst.included_tax_paise, 1000); // the ledger's own figure
  assert.equal(open.evidence[0].gst_status, 'unverified');
});

test('a valid reviewed invoice is still accepted and stored as before', () => {
  const saved = reviewedBusiness(
    {
      invoice: 'INV-7',
      gstin: MH,
      taxable: 1000,
      discount: 0,
      tax: 180,
      taxes: { cgst: { amount: 90, rate: 9 }, sgst: { amount: 90, rate: 9 }, igst: null },
      supplierState: '27',
      placeOfSupply: '27',
      method: 'cash',
      docType: 'GST invoice',
      outstanding: 0,
    },
    1180,
  );
  assert.equal(saved.invoice, 'INV-7');
  assert.equal(saved.gstin, MH);
  assert.equal(saved.tax, 180);
  assert.deepEqual(saved.taxes.cgst, { amount: 90, rate: 9 });
  assert.equal(saved.taxable, 1000);
  assert.equal(saved.docType, 'GST invoice');
  assert.equal(saved.gst.status, 'consistent');
  assert.deepEqual(saved.gst_issues, []);
});
