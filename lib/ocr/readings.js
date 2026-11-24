import { validateReceiptArithmetic } from '../receiptEngine.js';

export function itemQuality(result) {
  const items = result.items || [];
  const prices = items.map((i) => i.price);
  const complete = items.length > 0 && prices.every((p) => typeof p === 'number' && Number.isFinite(p));
  const sum = complete ? prices.reduce((s, p) => s + Math.round(p * 100), 0) : null;
  const total = result.total == null ? null : Math.round(result.total * 100);
  const tax = Math.round((result.business?.tax || 0) * 100);
  const discount = Math.round((result.business?.discount || 0) * 100);
  const reconciled = sum != null && total != null &&
    [sum, sum + tax - discount, sum - discount].some((v) => Math.abs(v - total) <= 1);
  const expected = result.extraction_meta?.expected_item_count;
  const countMatches = expected == null || expected === items.length;
  const namesReliable = items.length > 0 && items.every((i) => (i.name_confidence ?? i.confidence ?? 0) >= 0.75);
  const cells = result.evidence?.cells || [];
  const pricesReliable = items.every((i) => (i.price_confidence ?? i.confidence ?? 0) >= 0.7 ||
    cells.some((c) => c.net === i.price && c.rate === i.unit_price && c.quantity === i.quantity && c.confidence >= 0.5));
  return { reconciled, countMatches, namesReliable, pricesReliable, reliable: reconciled && countMatches && namesReliable && pricesReliable };
}

// A better item pass may replace a draft only when the total is corroborated.
// Do not combine lists: two identical purchases must remain two purchases.
export function selectReading(primary, alternate) {
  if (primary.extraction_meta.total_blocked) return primary;
  if (alternate.extraction_meta.total_blocked || alternate.total == null) return primary;
  if (primary.total != null && primary.total !== alternate.total) {
    primary.extraction_meta.warnings.push('Readings disagree on the total. Compare the source before confirming.');
    return primary;
  }
  const a = itemQuality(primary), b = itemQuality(alternate);
  if (b.reliable && !a.reliable && alternate.total_confidence >= 0.65) return alternate;
  return primary;
}

const nameKey = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function finalizeReadings(selected, readings) {
  const supported = readings.filter((r) => itemQuality(r).reliable && r.total_confidence >= 0.65 &&
    readings.filter((other) => other.total === r.total && other.total_confidence >= 0.65).length >= 2);
  const chosen = itemQuality(selected).reliable ? selected : supported.sort((a, b) =>
    b.items.reduce((s, i) => s + (i.confidence || 0), 0) - a.items.reduce((s, i) => s + (i.confidence || 0), 0))[0] || selected;
  const result = structuredClone(chosen);
  const warnings = new Set(result.extraction_meta.warnings);
  const totals = readings.filter((r) => r.total != null && r.total_confidence >= 0.8 && !r.extraction_meta.reused_header);
  if (result.total == null && totals.length >= 2 && totals.every((r) => r.total === totals[0].total)) {
    result.total = totals[0].total;
    result.total_confidence = Math.min(...totals.map((r) => r.total_confidence));
    result.extraction_meta.total_blocked = false;
    warnings.delete('Ambiguous or conflicting total. Check the printed amount.');
    warnings.delete('Read the total from the source.');
  }
  const merchants = readings.filter((r) => r.merchant && r.merchant_confidence >= 0.8)
    .sort((a, b) => b.merchant_confidence - a.merchant_confidence);
  if (merchants.length && (!result.merchant || result.merchant_confidence < 0.8)) {
    result.merchant = merchants[0].merchant;
    result.merchant_confidence = merchants[0].merchant_confidence;
  }
  if (result.merchant_confidence < 0.75) {
    result.merchant = null;
    warnings.add('The merchant name was not readable enough. Enter it from the source.');
  }
  for (const field of ['invoice', 'gstin']) {
    const values = new Set(readings.map((r) => r.business?.[field]).filter(Boolean));
    if (values.size > 1) {
      result.business[field] = null;
      warnings.add(`Readings disagree on the ${field === 'invoice' ? 'invoice number' : 'GSTIN'}. Enter it from the source.`);
    }
  }
  const dates = readings.filter((r) => r.date && !r.extraction_meta.reused_header && r.date_confidence >= 0.8)
    .sort((a, b) => b.date_confidence - a.date_confidence);
  if (dates.length) {
    const counts = new Map();
    for (const date of dates) counts.set(date.date, (counts.get(date.date) || 0) + 1);
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    const first = dates[0];
    const conflict = dates.find((r) => r.date !== first.date);
    result.date = ranked.length === 1 || (ranked[0][1] >= 2 && ranked[0][1] > ranked[1][1]) ? ranked[0][0]
      : !conflict || first.date_confidence - conflict.date_confidence >= 0.05 ? first.date : null;
    if (!result.date) warnings.add('Readings disagree on the date. Enter the printed date from the source.');
    else result.date_confidence = Math.max(...dates.filter((r) => r.date === result.date).map((r) => r.date_confidence));
  } else if (result.date_confidence < 0.8) result.date = null;
  const quality = itemQuality(result);
  const reliableItems = result.items.filter((item) => {
    const confidence = item.confidence ?? 0;
    const cell = result.evidence?.cells?.some((c) => c.net === item.price && c.rate === item.unit_price && c.quantity === item.quantity && c.confidence >= 0.5);
    if ((!cell && confidence < 0.7) || (item.name_confidence ?? confidence) < 0.75) return false;
    if (quality.reconciled && quality.countMatches) return true;
    if ((item.price_confidence ?? confidence) < 0.9) return false;
    // An isolated plausible amount is not evidence for a garbled product name.
    // Retain a partial text row only if a second layout reading agrees on both.
    return readings.filter((r) => r.items.some((other) =>
      nameKey(other.name) === nameKey(item.name) && other.price === item.price &&
      (other.name_confidence ?? other.confidence ?? 0) >= 0.75)).length >= 2;
  });
  if (reliableItems.length !== result.items.length) {
    warnings.add('Unreadable item rows were withheld. Review the source for missing items.');
    result.items = reliableItems;
  }
  for (const item of result.items) {
    if (!item.sku) continue;
    const agreement = readings.filter((r) => r.items.some((i) => i.sku === item.sku && (i.sku_confidence ?? 0) >= 0.8)).length;
    const maximum = Math.max(0, ...readings.flatMap((r) => r.items.filter((i) => i.sku === item.sku).map((i) => i.sku_confidence || 0)));
    if (maximum < 0.9 || agreement < 2) {
      item.sku = null;
      warnings.add('An uncertain product code was left blank. Check it before posting stock.');
    }
  }
  if (!quality.reconciled || !quality.countMatches) {
    warnings.add('The item list is incomplete or does not match the printed total.');
  }
  result.category = result.items.find((i) => i.category && i.category !== 'Other')?.category || 'Other';
  result.extraction_meta.warnings = [...warnings];
  result.extraction_meta.passes = readings.length;
  result.extraction_meta.items_complete = itemQuality(result).reliable;
  result.evidence.arithmetic = validateReceiptArithmetic({ total: result.total, items: result.items,
    rawText: `${result.business?.tax == null ? '' : `Tax ${result.business.tax}`}\n${result.business?.discount == null ? '' : `Discount ${result.business.discount}`}` });
  return result;
}

