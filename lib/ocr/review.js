import { maskSensitive } from '../demo.js';
import { reconcileGst } from '../gst.js';

function money(value) {
  if (value == null || value === '') return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(String(value)))
    throw Error(
      'Use a nonnegative rupee amount with up to two decimal places.',
    );
  return Number(value);
}

// A GST percentage is not a rupee amount: the 0.25% slab splits into 0.125%,
// so three decimals are meaningful here and two are not enough.
function percent(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(s))
    throw Error('Enter a GST percentage between 0 and 100.');
  return Number(s);
}
export function reviewedBusiness(raw = {}, total) {
  const taxes = {};
  for (const k of ['cgst', 'sgst', 'igst']) {
    const v = raw.taxes?.[k];
    const amount = money(v?.amount),
      rate = percent(v?.rate);
    if (rate > 100) throw Error('Check the GST percentage.');
    taxes[k] = amount == null && rate == null ? null : { amount, rate };
  }
  const tax = money(raw.tax),
    outstanding = money(raw.outstanding);
  if (tax > total || outstanding > total)
    throw Error('Check tax and outstanding amounts against the invoice total.');
  const gstin = raw.gstin?.trim().toUpperCase() || null;
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstin))
    throw Error('Check the GSTIN format.');
  const method = raw.method || null;
  if (method && !['cash', 'digital', 'udhaar'].includes(method))
    throw Error('Choose a payment method or unknown.');

  const taxable = money(raw.taxable),
    discount = money(raw.discount);
  const gst = reconcileGst({
    taxable,
    discount,
    tax,
    taxes,
    total,
    gstin,
    supplierGstin: raw.supplierGstin || null,
    recipientGstin: raw.recipientGstin || null,
    placeOfSupply: raw.placeOfSupply || null,
    supplierState: raw.supplierState || null,
    recipientState: raw.recipientState || null,
  });
  // Blocking evidence problems are refused rather than stored: silently keeping
  // a double-counted or impossible tax structure would corrupt every total that
  // is derived from this document. Everything else is recorded as an issue and
  // graded in the passport.
  const blocking = gst.issues.filter((issue) => issue.severity === 'error');
  if (blocking.length) throw Error(blocking[0].message);

  return {
    invoice: maskSensitive(raw.invoice || '').text || null,
    gstin,
    tax,
    taxes,
    outstanding,
    taxable,
    discount,
    method,
    docType: raw.docType || 'unclassified',
    repayment_reference:
      maskSensitive(raw.repayment_reference || '').text || null,
    payment_detail: raw.payment_detail || null,
    gst,
    gst_issues: gst.issues,
  };
}
