import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, voiceDraft, paise } from '../lib/business.js';
const purchase = {
  id: 'a',
  created_at: '1',
  day: '2026-01-01',
  amount: 11000,
  tax: 1000,
  kind: 'purchase',
  method: 'cash',
  item: 'Tea',
  units: 10,
  reorder: 8,
  party: 'Shop',
  receipt_id: 'doc',
};
const sale = {
  ...purchase,
  id: 'b',
  day: '2026-01-02',
  amount: 5000,
  tax: 0,
  kind: 'sale',
  units: 2,
  method: 'udhaar',
  receipt_id: null,
};
const docs = [
  {
    id: 'doc',
    user_verified: true,
    receipt_date: purchase.day,
    total: 110,
    currency: 'INR',
  },
];
test('credit sale updates stock and profit before settlement; settlement only moves cash', () => {
  const open = summarize([sale, purchase], docs, '2026-01-30');
  assert.deepEqual(
    [
      open.sales,
      open.profit,
      open.cash,
      open.owed,
      open.forecast,
      open.coverage,
    ],
    [5000, 3000, -11000, 5000, -11000, 50],
  );
  assert.equal(open.stock[0].units, 8);
  const paid = summarize(
    [purchase, { ...sale, paid_on: '2026-01-30' }],
    docs,
    '2026-01-31',
  );
  assert.deepEqual(
    [paid.profit, paid.owed, paid.cash, paid.forecast],
    [3000, 0, -6000, 5000],
  );
});
test('insufficient history, mismatched documents and missing stock remain explicit', () => {
  const r = summarize([sale], [], '2026-01-03');
  assert.equal(r.profit, null);
  assert.equal(r.forecast, null);
  assert.equal(
    summarize([purchase], [{ ...docs[0], total: 111 }]).supported,
    0,
  );
  assert.equal(summarize([]).coverage, null);
});
test('business entry uses integer paise and understands digit scripts', () => {
  assert.equal(paise('102.09'), 10209);
  assert.throws(() => paise('1.001'));
  for (const phrase of ['cash sale 250', 'नकद बिक्री २५०', 'ନଗଦ ବିକ୍ରି ୨୫୦'])
    assert.deepEqual(voiceDraft(phrase), {
      kind: 'sale',
      method: 'cash',
      rupees: '250',
    });
  assert.equal(voiceDraft('sold 2 bags for 50').rupees, undefined);
});
