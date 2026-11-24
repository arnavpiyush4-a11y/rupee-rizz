import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocument } from '../lib/ocr/structure.js';
import { parseTsv } from '../lib/ocr/tsv.js';
import { itemQuality, selectReading } from '../lib/ocr/readings.js';

const receipt = `Trent Ltd.
Store Address
Zudio - Bhubaneswar Janpath
INVOICE NO. : Z318 100528373 31/08/2026 15:55
COUNTER : 2 CASHIER : 113091
Item Rate Qty/Unit Disc.Amt NetAmt
Description / HSN-SAC / Taxable Value
A) CGST@2.50% SGST@2.50%
301056752003 399.00 1 PC 0.00 399.00
MENS DENIM T-SHIRT STATEMENT / 61099090 / 380.00
301081227003 399.00 1 PC 0.00 399.00
MENS DENIM T-SHIRT STATEMENT / 61099090 / 380.00
B) CGST@0.00% SGST@0.00%
6000000404 10.00 1 PC 0.00 10.00
CARRY BAG / 48194000 / 8.48.
Total Invoice Amount 808.00
Tender Detail
CREDIT CARD INR 808.00
TOTAL AMOUNT 808.00
NO. OF ITEMS : 3
TOTAL QTY : 3.000`;

test('retail receipt returns paid prices, repeated products and stock fields', () => {
  const r = extractDocument(receipt, 0.88);
  assert.equal(r.merchant, 'Trent Ltd.');
  assert.equal(r.date, '2026-08-31');
  assert.equal(r.total, 808);
  assert.deepEqual(r.items.map((i) => [i.name, i.sku, i.quantity, i.unit, i.unit_price, i.price, i.category]), [
    ['MENS DENIM T-SHIRT STATEMENT', '301056752003', 1, 'pcs', 399, 399, 'Shopping'],
    ['MENS DENIM T-SHIRT STATEMENT', '301081227003', 1, 'pcs', 399, 399, 'Shopping'],
    ['CARRY BAG', '6000000404', 1, 'pcs', 10, 10, 'Shopping'],
  ]);
  assert.equal(r.extraction_meta.expected_item_count, 3);
  assert.equal(itemQuality(r).reliable, true);
});

test('damaged tax headings, tiny fragments and HSN bases do not become purchases', () => {
  const damaged = receipt.replace('A) CGST@2.50% SGST@2.50%', 'Alccst@ 2.60')
    .replace('301056752003 399.00 1 PC 0.00 399.00', 'se900 pC 0.00')
    .replace('301081227003 399.00 1 PC 0.00 399.00', 'eS 398.00');
  const r = extractDocument(damaged, 0.8);
  assert.deepEqual(r.items.map((i) => [i.name, i.price]), [['CARRY BAG', 10]]);
  assert.equal(itemQuality(r).reliable, false);
  assert.ok(r.extraction_meta.warnings.some((w) => w.startsWith('Item count differs')));
  assert.ok(r.extraction_meta.warnings.some((w) => w.startsWith('Item amounts do not reconcile')));
});

test('retail net values account for quantities and discounts', () => {
  const r = extractDocument(`Clothes Shop
Item Rate Qty/Unit Disc.Amt NetAmt
12345678 100.00 2 PC 10.00 190.00
Cotton Shirt / 61099090 / 180.95
Total 190.00`, 0.9);
  assert.deepEqual(r.items.map((i) => [i.quantity, i.unit_price, i.price]), [[2, 100, 190]]);
  const bad = extractDocument(`Clothes Shop
12345678 100.00 2 PC 10.00 290.00
Cotton Shirt / 61099090 / 180.95
Total 290.00`, 0.9);
  assert.deepEqual(bad.items, []);
});

function tsvWord(block, line, x, y, text, conf = 95, width = 65) {
  return `5\t1\t${block}\t1\t${line}\t1\t${x}\t${y}\t${width}\t12\t${conf}\t${text}`;
}

test('sparse OCR reconstructs table cells in visual order across blocks', () => {
  const pass = parseTsv([
    tsvWord(4, 1, 350, 80, '399.00', 89),
    tsvWord(2, 1, 130, 80, '399.00', 92),
    tsvWord(3, 1, 220, 81, '1 PC 0.00', 86, 100),
    tsvWord(1, 1, 10, 80, '301056752003', 94, 100),
    tsvWord(5, 1, 10, 100, 'MENS DENIM T-SHIRT / 61099090 / 380.00', 90, 400),
    tsvWord(6, 1, 10, 130, 'TOTAL AMOUNT', 96, 130),
    tsvWord(7, 1, 350, 130, '399.00', 93),
  ].join('\n'));
  assert.equal(pass.text, '301056752003 399.00 1 PC 0.00 399.00\nMENS DENIM T-SHIRT / 61099090 / 380.00\nTOTAL AMOUNT 399.00');
  assert.deepEqual(pass.lineScores, [0.86, 0.9, 0.93]);
  assert.equal(extractDocument(pass.text, pass.confidence, pass.lineScores).items[0].price, 399);
});

test('TSV numeric confidence uses the weakest token and keeps neighboring rows separate', () => {
  const pass = parseTsv([
    tsvWord(1, 1, 10, 10, 'Total'),
    tsvWord(1, 1, 100, 10, '808.00', 30),
    tsvWord(1, 1, 200, 10, '|', 98),
    tsvWord(2, 1, 10, 25, 'NO. OF ITEMS 3', 96, 200),
  ].join('\n'));
  assert.equal(pass.text.split('\n').length, 2);
  assert.deepEqual(pass.lineScores, [0.3, 0.96]);
});

test('a readable total with a broken item list selects a complete second reading', () => {
  const good = extractDocument(receipt, 0.87);
  const bad = extractDocument(receipt.replaceAll('399.00 1 PC 0.00 399.00', '398.00 1 PC 0.00 398.00'), 0.95);
  assert.equal(bad.total, 808);
  assert.equal(bad.evidence.arithmetic.status, 'unreconciled'); // card payment cannot validate incorrect item prices
  assert.equal(itemQuality(bad).reliable, false);
  assert.equal(selectReading(bad, good), good);
  assert.equal(selectReading(good, bad), good);
});

test('matching arithmetic cannot hide a missing printed item', () => {
  const r = extractDocument(receipt.replace('NO. OF ITEMS : 3', 'NO. OF ITEMS : 4'), 0.9);
  assert.equal(itemQuality(r).reconciled, true);
  assert.equal(itemQuality(r).reliable, false);
});

test('an alternate pass cannot override blocked or conflicting totals', () => {
  const good = extractDocument(receipt, 0.9);
  const blocked = extractDocument(receipt + '\nTotal 908.00', 0.9);
  assert.equal(selectReading(blocked, good), blocked);
  const other = extractDocument(receipt.replaceAll('808.00', '908.00'), 0.9);
  assert.equal(selectReading(good, other), good);
  assert.ok(good.extraction_meta.warnings.some((w) => w.includes('Readings disagree')));
});
