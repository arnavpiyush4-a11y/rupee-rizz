import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { recognize } from '../lib/ocr/recognize.js';

// The owner's source image stays outside the repository. Set this environment
// variable to exercise the real photograph in addition to distributable fixtures.
const imagePath = process.env.RR_RECEIPT_REGRESSION_IMAGE;

test('private retail photograph preserves all paid products and receipt fields', {
  skip: imagePath ? false : 'Set RR_RECEIPT_REGRESSION_IMAGE to the private receipt photo.',
  timeout: 120000,
}, async () => {
  const r = await recognize(await fs.readFile(imagePath));
  assert.deepEqual({ merchant: r.merchant, date: r.date, total: r.total }, {
    merchant: 'Trent Ltd.', date: '2026-08-31', total: 808,
  });
  assert.deepEqual(r.items.map((item) => ({
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    unit_price: item.unit_price,
  })), [
    { name: 'MENS DENIM T-SHIRT STATEMENT', price: 399, quantity: 1, unit_price: 399 },
    { name: 'MENS DENIM T-SHIRT STATEMENT', price: 399, quantity: 1, unit_price: 399 },
    { name: 'CARRY BAG', price: 10, quantity: 1, unit_price: 10 },
  ]);
  const codes = ['301056752003', '301081227003', '600000404'];
  r.items.forEach((item, index) => assert.ok(item.sku == null || item.sku === codes[index], 'Uncertain codes must be blank, never wrong.'));
  assert.equal(r.evidence.arithmetic.status, 'reconciled');
  assert.ok(r.extraction_meta.expected_item_count == null || r.extraction_meta.expected_item_count === 3);
  assert.equal(r.extraction_meta.items_complete, true);
  const incomplete = (r.extraction_meta.warnings || []).filter((warning) =>
    /item count differs|no reliable item|item amounts do not reconcile|line sum differs/i.test(warning),
  );
  assert.deepEqual(incomplete, []);
});
