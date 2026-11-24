import { maskSensitive } from '../demo.js';

function money(value) {
  if (value == null || value === '') return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(String(value)))
    throw Error(
      'Use a nonnegative rupee amount with up to two decimal places.',
    );
  return Number(value);
}
export function reviewedBusiness(raw = {}, total) {
  const taxes = {};
  for (const k of ['cgst', 'sgst', 'igst']) {
    const v = raw.taxes?.[k];
    const amount = money(v?.amount),
      rate = money(v?.rate);
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
  return {
    invoice: maskSensitive(raw.invoice || '').text || null,
    gstin,
    tax,
    taxes,
    outstanding,
    taxable: money(raw.taxable),
    discount: money(raw.discount),
    method,
    docType: raw.docType || 'unclassified',
    repayment_reference:
      maskSensitive(raw.repayment_reference || '').text || null,
    payment_detail: raw.payment_detail || null,
  };
}
