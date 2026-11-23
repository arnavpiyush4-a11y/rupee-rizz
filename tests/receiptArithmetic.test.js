import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReceiptArithmetic } from '../lib/receiptEngine.js';

const items = (prices) => prices.map((price, index) => ({ name: `Product ${index + 1}`, price }));

test('matching card payment cannot validate an inconsistent product list', () => {
  const r = validateReceiptArithmetic({ total: 808, items: items([398, 10]), rawText: 'CREDIT CARD INR 808.00' });
  assert.equal(r.status, 'unreconciled');
  assert.equal(r.item_sum, 408);
  assert.equal(r.payment, 808);
});

test('small OCR digit errors are not hidden by a percentage tolerance', () => {
  const r = validateReceiptArithmetic({ total: 808, items: items([398, 398, 10]), rawText: 'CREDIT CARD INR 808.00' });
  assert.equal(r.status, 'unreconciled');
  assert.equal(r.item_sum, 806);
});

test('matching products and card payment retain corroborating evidence', () => {
  const r = validateReceiptArithmetic({ total: 808, items: items([399, 399, 10]), rawText: 'CREDIT CARD INR 808.00' });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.payment, 808);
  assert.equal(r.item_sum, 808);
  assert.equal(r.confidence, 0.99);
});

test('labelled amounts never consume table headers or a following SKU prefix', () => {
  const r = validateReceiptArithmetic({
    total: 808,
    items: items([399, 399, 10]),
    rawText: 'Disc.Amt\n301056752003 399.00 1 PC 0.00 399.00\nCGST@2.50% SGST@2.50%\nCREDIT CARD\nINR 808.00',
  });
  assert.equal(r.discount, null);
  assert.equal(r.tax, null);
  assert.equal(r.payment, 808);
});

test('single-amount continuations are accepted but other labels stop reading', () => {
  assert.equal(validateReceiptArithmetic({ total: 100, rawText: 'Amount paid:\nRs. 100.00' }).payment, 100);
  assert.equal(validateReceiptArithmetic({ total: 100, rawText: 'Amount paid:\nCard number 123456789012\n100.00' }).payment, null);
  assert.equal(validateReceiptArithmetic({ total: 100, rawText: 'Discount\n301056752003' }).discount, null);
});

test('amounts require a complete token and valid digit grouping', () => {
  for (const rawText of ['CREDIT CARD 808.00 912.00', 'CREDIT CARD 808.001', 'CREDIT CARD 808.00abc', 'CREDIT CARD 1,23.45', 'CREDIT CARD 301056752003']) {
    assert.equal(validateReceiptArithmetic({ total: 808, rawText }).payment, null, rawText);
  }
  assert.equal(validateReceiptArithmetic({ total: 123456.78, rawText: 'CREDIT CARD INR 1,23,456.78' }).payment, 123456.78);
});

test('printed tax rates alone never become tax amounts', () => {
  const r = validateReceiptArithmetic({ total: 105, items: items([100]), rawText: 'CGST 2.50%\nSGST 2.50%\nCREDIT CARD 105.00' });
  assert.equal(r.tax, null);
  assert.equal(r.status, 'unreconciled');
});

test('separately printed GST components are summed without treating their rates as rupees', () => {
  const r = validateReceiptArithmetic({ total: 118, items: items([100]), rawText: 'CGST 9%: 9.00\nSGST 9%: 9.00\nCREDIT CARD 118.00' });
  assert.equal(r.tax, 18);
  assert.equal(r.status, 'reconciled');
});

test('missing product amounts stay uncertain even if known prices or payment match', () => {
  const r = validateReceiptArithmetic({ total: 808, items: items([808, null]), rawText: 'CREDIT CARD 808.00' });
  assert.equal(r.item_sum, 808);
  assert.equal(r.status, 'insufficient-evidence');
});

test('payment evidence remains usable when no product list was extracted', () => {
  assert.equal(validateReceiptArithmetic({ total: 808, rawText: 'CREDIT CARD 808.00' }).status, 'reconciled');
});

test('conflicting repeated payment amounts are withheld', () => {
  assert.equal(validateReceiptArithmetic({ total: 808, rawText: 'CREDIT CARD 808.00\nCREDIT CARD 898.00' }).payment, null);
});
