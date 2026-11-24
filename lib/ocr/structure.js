import {
  parseReceiptDeterministically,
  validateReceiptArithmetic,
} from '../receiptEngine.js';
import { maskSensitive } from '../demo.js';

const number = '([0-9][0-9,]*(?:\\.[0-9]{1,2})?)';
const amountEnd = new RegExp(
  '(?:^|[\\s:])(?:₹|Rs\\.?|INR)?\\s*' + number + '\\s*$',
  'i',
);
function terminal(line) {
  const m = line
    .replace(/(?<=\d)[ :|.]*[a-z|]{0,2}[ :|]*$/i, '')
    .match(amountEnd);
  return m ? Number(m[1].replaceAll(',', '')) : null;
}
function unique(values) {
  const set = [...new Set(values)];
  return set.length === 1 ? set[0] : null;
}
// A continuation must contain exactly one amount. Never read ahead across other labels.
const totalLabel =
  /^(?:(?:grand|net|invoice|bill)\s+total|total\s+invo[iIl]ce\s+amount|total(?:\s+amount)?|amount payable|कुल(?:\s+(?:देय राशि|देय|राशि|योग))?|ମୋଟ(?: ରାଶି)?)(?=\s|:|₹|$)\s*[:]?\s*/i;
const grouped = String.raw`(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})`;
const singleAmount = new RegExp(
  '^(?:₹|INR|Rs\\.?)?\\s*(' +
    grouped +
    '(?:\\.\\d{1,2})?)(?:\\s+(?:[:|]|[a-z]{1,2}))?$',
  'i',
);
function readGrandTotal(lines) {
  const values = [],
    rows = [];
  let blocked = false;
  for (const [i, line] of lines.entries()) {
    const label = line.match(totalLabel);
    if (!label) continue;
    const rest = line.slice(label[0].length).trim();
    if (rest && !/^(?:[-+\d₹(]|INR|Rs\.?)/i.test(rest)) continue;
    const m = (rest || lines[i + 1] || '').match(singleAmount);
    if (!m) {
      if (rest) blocked = true;
      continue;
    }
    values.push(Number(m[1].replaceAll(',', '')));
    rows.push(rest ? i : i + 1);
  }
  blocked ||= new Set(values).size > 1;
  return { value: blocked ? null : unique(values), blocked, rows };
}
export function extractDocument(raw, confidence = 0, lineScores = [], lineDetails = []) {
  const text = raw
    .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 2406))
    .replace(/[୦-୯]/g, (c) => String(c.charCodeAt(0) - 2918));
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed = parseReceiptDeterministically(text);
  const flags = [];
  function labelled(pattern, name) {
    const values = lines
      .map((l, i) =>
        pattern.test(l)
          ? (terminal(l) ??
            (singleAmount.test(lines[i + 1] || '')
              ? terminal(lines[i + 1])
              : null))
          : null,
      )
      .filter((n) => n !== null);
    if (new Set(values).size > 1) flags.push('Conflicting ' + name);
    return unique(values);
  }
  const amountEvidence = readGrandTotal(lines);
  let total = amountEvidence.value;
  if (amountEvidence.blocked)
    flags.push('Ambiguous or conflicting total. Check the printed amount.');
  const currency = /\b(?:USD|EUR|GBP|IDR)\b|[$€£]\s*\d/.test(text)
    ? 'other'
    : /₹|\b(?:INR|Rs\.)/i.test(text)
      ? 'INR'
      : null;
  if (currency === 'other') {
    total = null;
    flags.push('Check currency. Only INR documents can be posted.');
  }
  const taxes = {};
  for (const key of ['cgst', 'sgst', 'igst']) {
    const idx = lines.findIndex((l) =>
      new RegExp('^(?:[^\\w]*|[A-Z]\\s+)' + key + '\\b', 'i').test(l),
    );
    const row = lines[idx];
    const next = lines[idx + 1];
    const continuation = next?.match(singleAmount);
    const value = row
      ? (terminal(row) ??
        (continuation ? Number(continuation[1].replaceAll(',', '')) : null))
      : null;
    taxes[key] = row
      ? { amount: value, rate: row.match(/([\d.]+)\s*%/)?.[1] ?? null }
      : null;
  }
  const taxable = labelled(
    /^(taxable (?:amount|value)|subtotal|sub total)\b/i,
    'taxable value',
  );
  const discount = labelled(/^discount\b/i, 'discount');
  const taxValues = Object.values(taxes).filter((x) => x?.amount != null);
  const paired = (taxes.cgst?.amount != null) === (taxes.sgst?.amount != null);
  if (!paired)
    flags.push(
      'Incomplete GST components. Confirm included tax from the source.',
    );
  const tax =
    paired && taxValues.length
      ? taxValues.reduce((n, v) => n + Math.round(v.amount * 100), 0) / 100
      : null;
  if (
    taxable != null &&
    tax != null &&
    total != null &&
    Math.abs(
      Math.round(100 * taxable) +
        Math.round(100 * tax) -
        Math.round(100 * total),
    ) > 1
  )
    flags.push(
      'Taxable value plus GST differs from total; check discounts and rounding.',
    );
  const gstins = [
    ...text.matchAll(/\bGSTIN\s*[:.-]?\s*([A-Z0-9]{10,18})\b/gi),
  ].map((m) => m[1].toUpperCase());
  const gstin = unique(gstins);
  if (new Set(gstins).size > 1)
    flags.push('Multiple GSTINs. Confirm the counterparty registration.');
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin))
    flags.push('Check GSTIN format.');
  const invoiceLine = lines.find((line) => /\b(?:invoice|bill)\s*(?:no\.?|number|#)\s*[:.-]/i.test(line));
  const invoiceRaw = invoiceLine?.match(/\b(?:invoice|bill)\s*(?:no\.?|number|#)\s*[:.-]?\s*(.+)$/i)?.[1]
    .replace(/\s+(?:date\b|\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b).*/i, '').trim();
  const invoice = invoiceRaw && /^[\w/ -]{1,70}$/.test(invoiceRaw) ? invoiceRaw : null;
  const methods = [];
  const paid = lines
    .filter((l) =>
      /^(?:payment(?: mode| method)?|paid(?: by)?|mode of payment|भुगतान|भुगतान विधि|ଦେୟ ପଦ୍ଧତି)\s*[: -]/i.test(
        l,
      ) || (/^(?:credit|debit)\s*card\b/i.test(l) && terminal(l) != null),
    )
    .join(' ');
  for (const [name, pattern] of [
    ['digital', /\b(?:UPI|card)\b|यूपीआई|कार्ड|କାର୍ଡ/i],
    ['cash', /\bcash\b|नकद|नगद|ନଗଦ/i],
    ['udhaar', /\b(?:udhaar|unpaid|on credit)\b|उधार|ଉଧାର/i],
  ])
    if (pattern.test(paid)) methods.push(name);
  const outstanding = labelled(
    /^(?:balance due|outstanding|unpaid amount)\b/i,
    'outstanding',
  );
  if (outstanding > 0) methods.push('udhaar');
  const method = unique(methods);
  if (!method)
    flags.push(
      'Confirm payment from the source. No cash movement has been recorded.',
    );
  const docType = /\btax invoice\b/i.test(text)
    ? 'GST invoice'
    : /\b(?:supplier|purchase) invoice\b/i.test(text)
      ? 'supplier invoice'
      : /\bsales? (?:bill|invoice)\b/i.test(text)
        ? 'sales bill'
        : /receipt/i.test(text)
          ? 'receipt'
          : 'unclassified';
  const items = [];
  // Accept explicit quantity x rate = extension layouts. Treat ambiguous tables as review-only.
  for (const line of lines) {
    const m = line.match(
      /^(?:(?:SKU[: ]+)([\w-]+)\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s*(kg|g|pcs?|units?|bags?|ltr|l)?\s*[x×@]\s*(?:₹|Rs\.?)?\s*([\d,.]+)\s*(?:=|\s)\s*(?:₹|Rs\.?)?\s*([\d,.]+)$/i,
    );
    if (!m) continue;
    const [qty, rate, price] = [m[3], m[5], m[6]].map((v) =>
      Number(v.replaceAll(',', '')),
    );
    if (![qty, rate, price].every(Number.isFinite)) continue;
    if (Math.abs(Math.round(qty * rate * 100) - Math.round(price * 100)) > 1)
      flags.push('Line arithmetic mismatch: ' + maskSensitive(m[2]).text);
    items.push({
      name: maskSensitive(m[2]).text,
      sku: m[1] || null,
      quantity: qty,
      unit:
        { pc: 'pcs', unit: 'units', bags: 'bag', ltr: 'l' }[
          m[4]?.toLowerCase()
        ] ||
        m[4]?.toLowerCase() ||
        null,
      unit_price: rate,
      price,
    });
  }
  const finalItems = items.length
    ? items
    : parsed.items.map((i) => ({
        ...i,
        name: maskSensitive(i.name || i.item_name || '').text,
      }));
  const comparable = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (const item of finalItems) {
    const nameRow = lines.findIndex((l) => comparable(l).includes(comparable(item.name)));
    const priceRow = item.sku ? lines.findIndex((l) => l.startsWith(item.sku)) : nameRow;
    const nameConfidence = lineDetails[nameRow]?.text_confidence ?? confidence;
    const numericWords = lineDetails[priceRow]?.words.filter((w) => /\d+[.,]\d{2}/.test(w.text)) || [];
    const priceConfidence = numericWords.length ? numericWords.at(-1).confidence : lineScores[priceRow] ?? confidence;
    item.confidence = Math.min(nameConfidence, priceConfidence);
    item.name_confidence = nameConfidence;
    item.price_confidence = priceConfidence;
    item.source = item.sku ? 'retail-table' : items.length ? 'quantity-rate' : 'text-row';
    if (item.sku) item.sku_confidence = lineDetails[priceRow]?.words[0]?.confidence ?? confidence;
  }
  const counts = lines.map((line, index) => ({ index, match: line.match(/^(?:no\.?\s*of\s*items|number\s+of\s*items|total\s+items)\s*[:.-]?\s*(\d+)\s*$/i) }))
    .filter(({ index, match }) => match && (lineScores[index] == null || lineScores[index] >= 0.8))
    .map(({ match }) => Number(match[1]));
  const expectedItemCount = unique(counts);
  if (counts.length && (expectedItemCount == null || expectedItemCount !== finalItems.length))
    flags.push('Item count differs from the printed count. Check missing or unreadable rows.');
  if (
    items.length &&
    total != null &&
    Math.abs(
      items.reduce((s, i) => s + Math.round(i.price * 100), 0) +
        Math.round((tax || 0) * 100) -
        Math.round((discount || 0) * 100) -
        Math.round(total * 100),
    ) > 1
  )
    flags.push(
      'Line sum differs from total. Review inclusive tax, discounts or missing items.',
    );
  const inconsistent = flags.some(
    (w) =>
      w.startsWith('Taxable value plus GST differs') ||
      w.startsWith('Line sum differs'),
  );
  // Allow a damaged Indic total label only when the printed value independently
  // reconciles to the explicitly labelled taxable base and component taxes.
  if (
    total == null &&
    !amountEvidence.blocked &&
    currency !== 'other' &&
    taxable != null &&
    tax != null
  ) {
    const candidates = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /^ମୋଟ\s+\p{Script=Oriya}{1,8}\s+/u.test(line));
    if (candidates.length === 1) {
      const { line, i } = candidates[0];
      const m = line
        .replace(/^ମୋଟ\s+\p{Script=Oriya}{1,8}\s+/u, '')
        .match(singleAmount);
      if (m) {
        const v = Number(m[1].replaceAll(',', ''));
        if (
          Math.round(v * 100) ===
          Math.round(taxable * 100) + Math.round(tax * 100)
        ) {
          total = v;
          amountEvidence.rows.push(i);
        }
      }
    }
  }
  if (
    total == null &&
    !amountEvidence.blocked &&
    currency !== 'other' &&
    taxable != null &&
    tax != null
  ) {
    const componentTotal = labelled(/^food total\b/i, 'food total');
    const values = [];
    for (const [i, line] of lines.entries()) {
      if (!/^(?:grand total|total)\s*:?$/i.test(line)) continue;
      // An unruled thermal layout can yield short noise segments between the label and price.
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        if (
          /\p{L}/u.test(lines[j]) &&
          !(componentTotal != null && /^[a-z]{1,2}\s*[~.=|-]+$/i.test(lines[j]))
        )
          break;
        const m = lines[j].match(singleAmount);
        if (m) {
          const value = Number(m[1].replaceAll(',', ''));
          if (componentTotal == null || value === componentTotal)
            values.push({ value, row: j });
          break;
        }
      }
    }
    if (
      values.length === 1 &&
      Math.round(values[0].value * 100) ===
        Math.round(taxable * 100) + Math.round(tax * 100)
    ) {
      total = values[0].value;
      amountEvidence.rows.push(values[0].row);
    }
  }
  const scores = amountEvidence.rows
    .map((i) => lineScores[i])
    .filter(Number.isFinite);
  const amountConfidence = scores.length ? Math.min(...scores) : confidence;
  if (inconsistent) total = null;
  if (total == null) flags.push('Read the total from the source.');
  if (confidence < 0.65)
    flags.push(
      'Low recognition confidence. Check the image or transcribe manually.',
    );
  const arithmetic = validateReceiptArithmetic({
    total,
    items: finalItems,
    rawText: text,
  });
  // A matching card payment can corroborate the total while the product list
  // remains wrong. Check line sums separately rather than hiding that mismatch.
  if (finalItems.length && total != null) {
    const sum = finalItems.reduce((s, i) => s + Math.round(i.price * 100), 0);
    const target = Math.round(total * 100);
    const net = sum + Math.round((tax || 0) * 100) - Math.round((discount || 0) * 100);
    if (Math.abs(sum - target) > 1 && Math.abs(net - target) > 1)
      flags.push('Item amounts do not reconcile to the total. Check the item rows.');
  }
  if (!finalItems.length)
    flags.push(
      'No reliable item rows. Check quantities and prices before posting stock.',
    );
  const merchant = parsed.merchant ? maskSensitive(parsed.merchant).text : null;
  const merchantRow = lines.findIndex((l) => l === parsed.merchant);
  const merchantConfidence = lineDetails[merchantRow]?.text_confidence ?? confidence;
  const dateWord = lineDetails.flatMap((r) => r.words || []).find((w) => /\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/.test(w.text));
  return {
    merchant,
    merchant_confidence: merchantConfidence,
    date: parsed.date,
    date_confidence: dateWord?.confidence ?? confidence,
    total,
    currency,
    items: finalItems,
    total_confidence: total == null ? 0 : amountConfidence,
    needs_user_verification: ['merchant', 'date', 'total', 'items', 'payment'],
    evidence: { arithmetic },
    business: {
      docType,
      invoice,
      gstin,
      taxable,
      taxes,
      tax,
      discount,
      method,
      outstanding,
      payment_detail:
        paid.match(/\b(upi|card|cash)\b/i)?.[0]?.toLowerCase() || null,
      repayment_reference:
        text.match(/\brepayment ref(?:erence)?\s*[:#]\s*([\w-]+)/i)?.[1] ||
        null,
    },
    extraction_meta: {
      version: 'local-3',
      total_blocked:
        amountEvidence.blocked || inconsistent || currency === 'other',
      engine: 'Tesseract 5 LSTM',
      overall_confidence: confidence,
      expected_item_count: expectedItemCount,
      verified: false,
      warnings: flags,
    },
  };
}
