import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeMoneyToken,
  parseReceiptDeterministically,
  reconcileOcrPasses,
  mergeVisionWithEvidence,
  validateReceiptArithmetic,
} from '../lib/receiptEngine.js'

test('normalizes common OCR money noise', () => {
  assert.equal(normalizeMoneyToken('₹1,234.50'), 1234.5)
  assert.equal(normalizeMoneyToken('Rs 405'), 405)
  assert.equal(normalizeMoneyToken('4O5'), 405)
})

test('does not choose the larger value when total candidates tie', () => {
  const r = parseReceiptDeterministically(`Store\nTotal 405\nAmount Due 495`)
  assert.equal(r.total, 405)
})

test('reconciles agreeing OCR passes as high confidence', () => {
  const r = reconcileOcrPasses(
    'Campus Cafe\nDate: 2026-09-26\nGrand Total 405.00',
    'Campus Cafe\nDate: 26/09/2026\nTOTAL ₹405.00',
  )
  assert.equal(r.total, 405)
  assert.equal(r.evidence.total_agreement, 'consensus')
  assert.ok(r.total_confidence >= 0.9)
})

test('flags conflicting OCR totals instead of silently selecting the larger value', () => {
  const r = reconcileOcrPasses(
    'Campus Cafe\nGrand Total 405.00',
    'Campus Cafe\nGrand Total 495.00',
  )
  assert.equal(r.total, 405)
  assert.equal(r.evidence.total_agreement, 'conflict')
  assert.ok(r.needs_user_verification.includes('total'))
})

test('vision + OCR agreement becomes verified', () => {
  const evidence = reconcileOcrPasses(
    'Campus Cafe\nDate: 2026-09-26\nGrand Total 405.00',
    'Campus Cafe\nDate: 26/09/2026\nTOTAL ₹405.00',
  )
  const merged = mergeVisionWithEvidence({
    merchant: 'Campus Cafe',
    date: '2026-09-26',
    total: 405,
    total_confidence: 0.98,
    items: [{ name: 'Coffee', price: 405, category: 'Food & Drinks', confidence: 0.98 }],
    needs_user_verification: [],
    reasoning_notes: [],
    llm_meta: { model: 'test-vision', provider: 'openai-direct' },
  }, evidence, 'Campus Cafe\nGrand Total 405.00')
  assert.equal(merged.total, 405)
  assert.equal(merged.extraction_meta.verified, true)
  assert.equal(merged.extraction_meta.source, 'vision+ocr-consensus')
})

test('vision disagreement remains editable and requires verification', () => {
  const evidence = reconcileOcrPasses(
    'Campus Cafe\nGrand Total 405.00',
    'Campus Cafe\nGrand Total 495.00',
  )
  const merged = mergeVisionWithEvidence({
    merchant: 'Campus Cafe',
    date: null,
    total: 450,
    total_confidence: 0.95,
    items: [],
    needs_user_verification: [],
    reasoning_notes: [],
  }, evidence, 'Campus Cafe\nGrand Total 405.00')
  assert.equal(merged.total, 450)
  assert.ok(merged.needs_user_verification.includes('total'))
  assert.equal(merged.extraction_meta.verified, false)
})
test("does not mistake item-count or payment lines for the receipt total", () => {
  const out = parseReceiptDeterministically(`TRENT LTD.\nMENS DENIM T-SHIRT STATEME 380\nTOTAL 808.00\nCREDIT CARD 808\nNO. OF ITEMS 3`)
  assert.equal(out.total, 808)
  assert.equal(out.items.some((i) => /credit card|no\.? of items/i.test(i.name)), false)
})


test('Zudio-style receipt keeps NO. OF ITEMS 3 separate from TOTAL AMOUNT 808', () => {
  const receipt = `
  Zudio
  Trent Ltd.
  Store Address
  Zudio - Bhubaneswar Janpath
  INVOICE NO. : Z318 100528373 31/08/2026 15:55
  COUNTER : 2 CASHIER : 113091
  301056752003 399.00 1 PC 0.00 399.00
  MENS DENIM T-SHIRT STATEMENT / 61099090 / 380.00
  301081227003 399.00 1 PC 0.00 399.00
  MENS DENIM T-SHIRT STATEMENT / 61099090 / 380.00
  6000000404 10.00 1 PC 0.00 10.00
  CARRY BAG / 48194000 / 8.48
  Total Invoice Amount 808.00
  TENDER DETAIL
  CREDIT CARD INR 808.00
  TOTAL AMOUNT 808.00
  NO. OF ITEMS : 3
  TOTAL QTY : 3.000
  `
  const out = parseReceiptDeterministically(receipt)
  assert.equal(out.total, 808)
  assert.equal(out.total_candidates.every((c) => c.value !== 3), true)
  assert.equal(out.needs_user_verification.includes('total'), false)
})

test('vision-only receipts remain explicitly verifiable when OCR evidence is absent', () => {
  const merged = mergeVisionWithEvidence({
    merchant: 'Test Store',
    date: '2026-09-28',
    total: 808,
    total_confidence: 0.99,
    items: [
      { name: 'Item A', price: 399, category: 'Shopping', confidence: 0.99 },
      { name: 'Item B', price: 399, category: 'Shopping', confidence: 0.99 },
      { name: 'Carry Bag', price: 10, category: 'Shopping', confidence: 0.99 },
    ],
    needs_user_verification: [],
    reasoning_notes: [],
    llm_meta: { model: 'gpt-5.6-sol', provider: 'openai-direct' },
  }, reconcileOcrPasses('', ''), '')
  assert.equal(merged.total, 808)
  assert.equal(merged.extraction_meta.source, 'vision-only')
  assert.ok(merged.reasoning_notes.some((x) => x.includes('arithmetic')))
  assert.ok(merged.needs_user_verification.includes('total'))
})


test('arithmetic validation reconciles Zudio item sum and payment with total', () => {
  const result = validateReceiptArithmetic({
    total: 808,
    items: [
      { name: 'MENS DENIM T-SHIRT', price: 399 },
      { name: 'MENS DENIM T-SHIRT', price: 399 },
      { name: 'CARRY BAG', price: 10 },
    ],
    rawText: 'Total Invoice Amount 808.00\nCREDIT CARD INR 808.00',
  })
  assert.equal(result.status, 'reconciled')
  assert.equal(result.item_sum, 808)
  assert.equal(result.payment, 808)
})

test('arithmetic validation flags a false total even when item OCR is strong', () => {
  const result = validateReceiptArithmetic({
    total: 3,
    items: [
      { name: 'MENS DENIM T-SHIRT', price: 399 },
      { name: 'MENS DENIM T-SHIRT', price: 399 },
      { name: 'CARRY BAG', price: 10 },
    ],
    rawText: 'Total Invoice Amount 3.00\nNO. OF ITEMS 3',
  })
  assert.equal(result.status, 'unreconciled')
})

test('Brew & Bites fallback never treats pincode or table number as items', () => {
  const out = parseReceiptDeterministically(`Brew & Bites Cafe
Shop No. 4, Ground Floor, Green Park Complex, MG Road, Bengaluru, Karnataka - 560001
Bill No. BB/25-26/0614/1245 Date : 14/06/2025
Table No : 5
1. Cold Coffee 1 120.00 120.00
2. Veg Sandwich 1 120.00 120.00
Total Items : 2 Sub Total : ₹240.00
Total : ₹240.00`)
  assert.equal(out.total, 240)
  assert.deepEqual(out.items.map((i) => [i.name, i.price]), [
    ['Cold Coffee', 120],
    ['Veg Sandwich', 120],
  ])
})

test('Zudio fallback pairs SKU rows with description rows and preserves repeated products', () => {
  const out = parseReceiptDeterministically(`Trent Ltd.
Zudio - Bhubaneswar Janpath
INVOICE NO. : Z318 100528373 31/08/2026 15:55
COUNTER : 2 CASHIER : 113091
301056752003 399.00 1 PC 0.00 399.00
MENS DENIM T-SHIRT STATEMENT / 61099090 / 380.00
301081227003 399.00 1 PC 0.00 399.00
MENS DENIM T-SHIRT STATEMENT / 61099090 / 380.00
6000000404 10.00 1 PC 0.00 10.00
CARRY BAG / 48194000 / 8.48
Total Invoice Amount 808.00
TOTAL AMOUNT 808.00
NO. OF ITEMS : 3
TOTAL QTY : 3.000`)
  assert.equal(out.total, 808)
  assert.deepEqual(out.items.map((i) => [i.name, i.price]), [
    ['MENS DENIM T-SHIRT STATEMENT', 399],
    ['MENS DENIM T-SHIRT STATEMENT', 399],
    ['CARRY BAG', 10],
  ])
})

test('OCR-only extraction cannot be marked verified just because the total is high confidence', () => {
  const evidence = reconcileOcrPasses(
    'Brew & Bites Cafe\nDate: 2025-06-14\n1. Cold Coffee 1 120.00 120.00\n2. Veg Sandwich 1 120.00 120.00\nTotal 240.00',
    'Brew & Bites Cafe\nDate: 14/06/2025\n1. Cold Coffee 1 120.00 120.00\n2. Veg Sandwich 1 120.00 120.00\nTotal 240.00',
  )
  const merged = mergeVisionWithEvidence(null, evidence, 'Brew & Bites Cafe\nTotal 240.00')
  assert.equal(merged.extraction_meta.verified, false)
  assert.ok(merged.needs_user_verification.includes('items'))
})

test('rejects incoherent vision line items when OCR items reconcile to the final total', () => {
  const zudioText = `Trent Ltd.\nZudio - Bhubaneswar Janpath\nINVOICE NO. : Z318 100528373 31/08/2026 15:55\n301056752003 399.00 1 PC 0.00 399.00\nMENS DENIM T-SHIRT STATEMENT / 61099090 / 380.00\n301081227003 399.00 1 PC 0.00 399.00\nMENS DENIM T-SHIRT STATEMENT / 61099090 / 380.00\n6000000404 10.00 1 PC 0.00 10.00\nCARRY BAG / 48194000 / 8.48\nTOTAL AMOUNT 808.00`;
  const evidence = reconcileOcrPasses(zudioText, zudioText);
  const merged = mergeVisionWithEvidence({
    merchant: 'Trent Ltd.',
    date: '2026-08-31',
    total: 808,
    total_confidence: 0.98,
    items: [
      { name: 'MENS DENIM T-SHIRT STATEMENT', price: 380, category: 'Shopping', confidence: 0.48 },
      { name: 'CARRY BAG', price: 8.48, category: 'Shopping', confidence: 0.48 },
    ],
    needs_user_verification: [],
    reasoning_notes: [],
    llm_meta: { model: 'test-vision', provider: 'openai-direct' },
  }, evidence, zudioText);
  assert.deepEqual(merged.items.map((i) => [i.name, i.price]), [
    ['MENS DENIM T-SHIRT STATEMENT', 399],
    ['MENS DENIM T-SHIRT STATEMENT', 399],
    ['CARRY BAG', 10],
  ]);
  assert.equal(merged.evidence.arithmetic.status, 'reconciled');
})
