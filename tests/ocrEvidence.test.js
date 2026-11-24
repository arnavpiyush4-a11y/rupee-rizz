import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocument } from '../lib/ocr/structure.js';
import { finalizeReadings, itemQuality } from '../lib/ocr/readings.js';

const receipt = 'Shop Ltd.\nDate: 2026-08-31\nCoffee 100.00\nTotal 100.00';

test('unreadable names are withheld even when card payment matches the total', () => {
  const bad = extractDocument('a: Trent Ltd. pee\nDate: 2026-08-31\neS BM Sioaiabioan 398.00\nCARRY BAG 10.00\nTotal 808.00\nCREDIT CARD INR 808.00\nNO. OF ITEMS: 3', 0.25);
  const result = finalizeReadings(bad, [bad]);
  assert.equal(result.merchant, null);
  assert.deepEqual(result.items, []);
  assert.equal(result.extraction_meta.items_complete, false);
  assert.ok(result.extraction_meta.warnings.some((w) => w.includes('withheld')));
});

test('low confidence descriptions cannot become reliable through arithmetic alone', () => {
  const r = extractDocument(receipt, 0.3);
  assert.equal(itemQuality(r).reconciled, true);
  assert.equal(itemQuality(r).reliable, false);
  assert.deepEqual(finalizeReadings(r, [r]).items, []);
});

test('a better merchant reading can repair a draft independently of items', () => {
  const low = extractDocument(receipt, 0.4);
  const high = extractDocument(receipt, 0.95);
  assert.equal(finalizeReadings(low, [low, high]).merchant, 'Shop Ltd.');
});

test('ambiguous product codes stay blank even when prices reconcile', () => {
  const r = extractDocument('Shop Ltd.\n12345678 100.00 1 PC 0.00 100.00\nCotton Shirt / 61099090 / 95.24\nTotal 100.00', 0.95);
  const final = finalizeReadings(r, [r]);
  assert.equal(final.items[0].price, 100);
  assert.equal(final.items[0].sku, null);
});

test('equally strong contradictory dates are withheld', () => {
  const a = extractDocument(receipt, 0.95);
  const b = extractDocument(receipt.replace('2026', '2028'), 0.95);
  assert.equal(finalizeReadings(a, [a, b]).date, null);
});

test('a damaged SKU row never substitutes the rate for an unreadable net price', () => {
  const r = extractDocument('Shop Ltd.\n12345678 399.00 1PG 0007 gog.oo7\nCotton Shirt / 61099090 / 380.00\nTotal 399.00', 0.9);
  assert.deepEqual(r.items, []);
});

test('OCR punctuation after a complete amount does not alter retail column values', () => {
  const r = extractDocument('Shop Ltd.\n12345678 399.00 1PG 0.00. 399.00\nCotton Shirt / 61099090 / 380.00\nTotal 399.00', 0.9);
  assert.deepEqual(r.items.map((i) => [i.quantity, i.unit_price, i.price]), [[1, 399, 399]]);
});
