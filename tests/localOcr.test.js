import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { extractDocument } from '../lib/ocr/structure.js';
import { recognize } from '../lib/ocr/recognize.js';
import { seal, unseal } from '../lib/ocr/provenance.js';
import { summarize } from '../lib/business.js';
const text =
  'Janata Grocery\nSUPPLIER INVOICE\nInvoice No: JG-99\nDate: 2026-02-10\nSKU:A1 Rice 4 pcs x 20.00 = 80.00\nTaxable value: 80.00\nCGST 5%: 4.00\nSGST 5%: 4.00\nGrand Total 88.00\nPayment: Unpaid';
test('structured tax, credit and stock data require human review', () => {
  const r = extractDocument(text, 0.89);
  assert.equal(r.business.method, 'udhaar');
  assert.equal(r.total, 88);
  assert.deepEqual(
    [
      r.business.tax,
      r.business.invoice,
      r.items[0].sku,
      r.items[0].quantity,
      r.items[0].price,
    ],
    [8, 'JG-99', 'A1', 4, 80],
  );
  assert.equal(r.extraction_meta.verified, false);
});
test('conflicting total, conflicting payment and missing prices remain uncertain', () => {
  const r = extractDocument(text + '\nGrand Total 85.00\nPaid by cash');
  assert.equal(r.total, null);
  assert.equal(r.business.method, null);
  assert.equal(
    extractDocument('Invoice No: 15200\nTotal quantity 42').total,
    null,
  );
  assert.ok(
    extractDocument(text.replace('88.00', '188.00')).extraction_meta.warnings
      .length,
  );
});
test('image recognition to reviewed posting, settlement and passport', async () => {
  const bytes = await fs.readFile(
    new URL('../public/ocr/sample-supplier.png', import.meta.url),
  );
  const r = await recognize(bytes);
  assert.deepEqual([r.total, r.business.tax, r.items[0].quantity], [44, 4, 2]);
  process.env.RR_OCR_SIGNING_KEY = 'fixture-only-test-key-32-characters-long';
  const t = seal(r, bytes, 'owner');
  assert.ok(unseal(t, bytes, 'owner'));
  assert.equal(unseal(t, bytes, 'other'), null);
  assert.equal(unseal(t, Buffer.from('other image'), 'owner'), null);
  const receipt = {
    id: 'doc',
    user_verified: true,
    currency: 'INR',
    receipt_date: r.date,
    total: r.total,
    source_sha256: 'sample-hash',
  };
  const posting = {
    id: 'purchase',
    day: r.date,
    created_at: '1',
    kind: 'purchase',
    amount: 4400,
    tax: 400,
    method: 'udhaar',
    party: r.merchant,
    receipt_id: 'doc',
    stock_lines: [{ item: 'Rice', units: 2, net: 4000 }],
  };
  const sale = {
    id: 'sale',
    day: r.date,
    created_at: '2',
    kind: 'sale',
    amount: 3000,
    tax: 0,
    method: 'udhaar',
    item: 'Rice',
    units: 1,
  };
  const open = summarize([posting, sale], [receipt], r.date);
  assert.deepEqual(
    [
      open.profit,
      open.stock[0].units,
      open.owed,
      open.payable,
      open.cash,
      open.coverage,
    ],
    [1000, 1, 3000, 4400, 0, 50],
  );
  assert.equal(open.evidence[0].independently_verified, false);
  const settled = summarize(
    [posting, { ...sale, paid_on: r.date, paid_by: 'cash' }],
    [receipt],
    r.date,
  );
  assert.equal(settled.profit, 1000);
  assert.equal(settled.cash, 3000);
  assert.equal(settled.owed, 0);
});

test('multiple GSTINs do not choose a buyer or supplier identity', () => {
  const r = extractDocument(
    text + '\nSeller GSTIN: 21ABCDE1234F1Z5\nBuyer GSTIN: 20ABCDE1234F1Z7',
  );
  assert.equal(r.business.gstin, null);
  assert.ok(
    r.extraction_meta.warnings.some((x) => x.includes('Multiple GSTINs')),
  );
});

test('accepts a split Indian-grouped total and Hindi payable label',()=>{
  assert.equal(extractDocument('Grand Total:\nINR 1,23,456.78').total,123456.78);
  assert.equal(extractDocument('कुल देय राशि २५०.००').total,250);
});
test('abstains on malformed grouping, an extra amount, or conflicting GST arithmetic',()=>{
  for(const s of ['Total 1,23.45','Total 120.00 9120.00','Taxable value 100\nCGST 9% 9\nSGST 9% 9\nGrand Total 198','Grand total\nPayment: cash\n900.00']) assert.equal(extractDocument(s).total,null);
});

test('small retail receipt image reads net columns and both repeated products', async () => {
  // Original synthetic fixture: narrow thermal paper with separate SKU and HSN
  // rows, like the reported layout. No private receipt image is stored here.
  const bytes = await fs.readFile(new URL('./fixtures/retail-323.png', import.meta.url));
  const r = await recognize(bytes);
  assert.deepEqual([r.merchant, r.date, r.total], ['Trent Ltd.', '2026-08-31', 808]);
  assert.deepEqual(r.items.map((i) => [i.name, i.price]), [
    ['MENS DENIM T-SHIRT', 399],
    ['MENS DENIM T-SHIRT', 399],
    ['CARRY BAG', 10],
  ]);
  assert.deepEqual(r.items.map((i) => [i.sku, i.quantity, i.unit_price]), [
    ['301056752003', 1, 399],
    ['301081227003', 1, 399],
    ['6000000404', 1, 10],
  ]);
});
