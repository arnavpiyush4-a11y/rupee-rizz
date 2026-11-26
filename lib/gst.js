// GST arithmetic and reconciliation.
//
// Two rules govern this module:
//   1. Money is carried as integer paise. Rupee values are only ever an output
//      rendering, never an intermediate accumulator.
//   2. An absent value stays absent. Reconciliation reports what the source did
//      not say instead of substituting a plausible number.
//
// CGST = taxable * rate / 2, SGST = taxable * rate / 2 (intra-state),
// IGST = taxable * rate (inter-state). A supply is one or the other, never both.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// GSTIN state codes: 01-38 for states and union territories, 97 for OIDAR,
// 99 for other territory. Anything else cannot name a place of supply.
export const GST_STATE_CODES = (() => {
  const codes = new Set(['97', '99']);
  for (let i = 1; i <= 38; i++) codes.add(String(i).padStart(2, '0'));
  return codes;
})();

// Legal GST rate slabs, in percent.
export const GST_RATE_SLABS = [0, 0.25, 3, 5, 12, 18, 28];

// A CGST/SGST component carries half a slab, so both halves and full slabs are
// accepted as component rates.
export const GST_COMPONENT_RATE_SLABS = [
  ...new Set(GST_RATE_SLABS.flatMap((rate) => [rate, rate / 2])),
].sort((a, b) => a - b);

const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

// Convert a rupee figure (number or string) to integer paise.
// Returns null for absent or unusable input rather than guessing.
export function toPaise(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  // Up to 17 decimals so a binary-float artefact such as 0.1 + 0.2
  // (0.30000000000000004) still rounds to the 30 paise it means.
  const m = /^(-?)(\d{1,12})(?:\.(\d{1,17}))?$/.exec(s);
  if (!m) return null;
  const sign = m[1] === '-' ? -1n : 1n;
  const whole = BigInt(m[2]) * 100n;
  const fraction = (m[3] || '').padEnd(3, '0');
  const hundredths = BigInt(fraction.slice(0, 2));
  // Round half-up on the third decimal so 0.145 rupees is 15 paise, not 14.
  const roundUp = Number(fraction[2]) >= 5 ? 1n : 0n;
  return Number(sign * (whole + hundredths + roundUp));
}

// GST percentages are not money: the 0.25% slab halves to 0.125%, so a
// percentage must keep its third decimal instead of being rounded to paise.
export function toPercent(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(s)) return null;
  return Number(s);
}

// Render integer paise as a rupee number, only at the boundary.
export function fromPaise(value) {
  return value == null ? null : value / 100;
}

// taxable value * rate% , in paise. Exact integer arithmetic on paise.
export function componentAmount(taxablePaise, ratePercent) {
  if (taxablePaise == null || ratePercent == null) return null;
  return Math.round((taxablePaise * ratePercent) / 100);
}

export function gstinStateCode(gstin) {
  const s = String(gstin || '').trim().toUpperCase();
  return GSTIN_FORMAT.test(s) ? s.slice(0, 2) : null;
}

// The 15th character of a GSTIN is a modulus-36 check digit.
export function gstinChecksumValid(gstin) {
  const s = String(gstin || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{15}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = ALPHABET.indexOf(s[i]);
    if (value < 0) return false;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36] === s[14];
}

// Validate a GSTIN without inventing one. `present:false` means the source
// carried no GSTIN, which is a different fact from a malformed one.
export function validateGstin(raw) {
  const value = String(raw ?? '').trim().toUpperCase();
  if (!value)
    return { value: null, state: null, present: false, valid: false, issues: [] };
  const issues = [];
  if (!GSTIN_FORMAT.test(value)) {
    issues.push({
      code: 'gstin_format',
      severity: 'error',
      field: 'gstin',
      message: 'Check the GSTIN format.',
    });
    return { value, state: null, present: true, valid: false, issues };
  }
  const state = value.slice(0, 2);
  if (!GST_STATE_CODES.has(state))
    issues.push({
      code: 'gstin_invalid_state',
      severity: 'error',
      field: 'gstin',
      message: `GSTIN state code ${state} is not a registered GST jurisdiction. Check the GSTIN.`,
    });
  if (!gstinChecksumValid(value))
    issues.push({
      code: 'gstin_checksum',
      severity: 'warning',
      field: 'gstin',
      message:
        'The GSTIN check digit does not match. Re-read the registration number from the source.',
    });
  return {
    value,
    state,
    present: true,
    valid: !issues.some((i) => i.severity === 'error'),
    issues,
  };
}

// Intra-state (CGST+SGST) versus inter-state (IGST) is decided by comparing the
// supplier's state with the place of supply. When either is unknown the answer is
// 'unknown' — never a silent default.
export function classifyJurisdiction({
  supplierGstin = null,
  recipientGstin = null,
  placeOfSupply = null,
  supplierState = null,
  recipientState = null,
} = {}) {
  const supplier =
    (supplierState && String(supplierState).padStart(2, '0')) ||
    gstinStateCode(supplierGstin);
  const recipient =
    (recipientState && String(recipientState).padStart(2, '0')) ||
    gstinStateCode(recipientGstin) ||
    (placeOfSupply ? String(placeOfSupply).padStart(2, '0') : null);
  if (!supplier || !recipient)
    return {
      kind: 'unknown',
      supplierState: supplier,
      recipientState: recipient,
      reason:
        'Supplier and place-of-supply state codes are both required to tell an intra-state supply from an inter-state one.',
    };
  return {
    kind: supplier === recipient ? 'intra-state' : 'inter-state',
    supplierState: supplier,
    recipientState: recipient,
    reason: null,
  };
}

const COMPONENTS = [
  ['cgst', 'CGST'],
  ['sgst', 'SGST'],
  ['igst', 'IGST'],
];

function readComponent(taxes, key) {
  const entry = taxes?.[key];
  if (!entry) return { amount: null, rate: null, present: false };
  const amount = toPaise(entry.amount);
  const rate = toPercent(entry.rate);
  return {
    amount,
    rate,
    present: amount != null || rate != null,
  };
}

// Reconcile declared GST evidence against the invoice arithmetic.
//
// `declared` echoes exactly what the source said (null where it said nothing);
// `computed` holds values derived from taxable value and rate. The two are kept
// apart so a computed figure is never mistaken for a printed one.
export function reconcileGst({
  taxable = null,
  discount = null,
  tax = null,
  taxes = {},
  total = null,
  gstin = null,
  supplierGstin = null,
  recipientGstin = null,
  placeOfSupply = null,
  supplierState = null,
  recipientState = null,
} = {}) {
  const issues = [];
  const add = (code, severity, field, message) =>
    issues.push({ code, severity, field, message });

  const taxableP = toPaise(taxable);
  const discountP = toPaise(discount);
  const taxP = toPaise(tax);
  const totalP = toPaise(total);

  const component = Object.fromEntries(
    COMPONENTS.map(([key]) => [key, readComponent(taxes, key)]),
  );
  const cgst = component.cgst;
  const sgst = component.sgst;
  const igst = component.igst;

  // --- Registration -------------------------------------------------------
  const registration = validateGstin(gstin ?? supplierGstin);
  for (const issue of registration.issues) issues.push(issue);
  if (!registration.present && (taxableP != null || cgst.present || sgst.present || igst.present))
    add(
      'gst_gstin_missing',
      'warning',
      'gstin',
      'No counterparty GSTIN was recorded. The registration behind this tax evidence is unverified.',
    );

  // --- Rates --------------------------------------------------------------
  const declaredRates = {};
  for (const [key, label] of COMPONENTS) {
    const rate = component[key].rate;
    if (rate == null) continue;
    declaredRates[key] = rate;
    if (rate < 0 || rate > 100) {
      add(
        'gst_rate_invalid',
        'error',
        `taxes.${key}.rate`,
        `Check the ${label} percentage.`,
      );
      continue;
    }
    const slabs = key === 'igst' ? GST_RATE_SLABS : GST_COMPONENT_RATE_SLABS;
    if (!slabs.includes(rate))
      add(
        'gst_rate_unusual',
        'warning',
        `taxes.${key}.rate`,
        `${label} ${rate}% is not a notified GST slab. Confirm it against the source.`,
      );
  }

  // --- Component structure ------------------------------------------------
  // A supply is intra-state (CGST + SGST) or inter-state (IGST). Evidence that
  // says both would double count the tax, so it is rejected outright.
  const intraAmounts = cgst.amount != null || sgst.amount != null;
  if (intraAmounts && igst.amount != null)
    add(
      'gst_double_count',
      'error',
      'taxes',
      'Both IGST and CGST/SGST are recorded. An invoice is either intra-state (CGST + SGST) or inter-state (IGST); clear the components that do not apply.',
    );
  else if ((cgst.present || sgst.present) && igst.present)
    add(
      'gst_double_count_rates',
      'warning',
      'taxes',
      'IGST and CGST/SGST rates are both present. Confirm which applies to this supply.',
    );

  const cgstPresent = cgst.present;
  const sgstPresent = sgst.present;
  if (cgstPresent !== sgstPresent)
    add(
      'gst_component_orphan',
      'warning',
      'taxes',
      'Incomplete GST components. CGST and SGST must be recorded together, or IGST alone.',
    );

  if (cgst.rate != null && sgst.rate != null && cgst.rate !== sgst.rate)
    add(
      'gst_rate_split',
      'warning',
      'taxes',
      'CGST and SGST rates differ. An intra-state supply splits the rate equally.',
    );

  // --- CGST/SGST versus IGST consistency with jurisdiction -----------------
  const jurisdiction = classifyJurisdiction({
    supplierGstin,
    recipientGstin,
    placeOfSupply,
    supplierState,
    recipientState,
  });
  if (
    jurisdiction.kind === 'unknown' &&
    (cgst.present || sgst.present || igst.present)
  )
    add(
      'gst_jurisdiction_unknown',
      'warning',
      'jurisdiction',
      'The place of supply is not known, so this cannot be confirmed as intra-state (CGST + SGST) or inter-state (IGST). Record the supply state and the counterparty GSTIN.',
    );
  if (jurisdiction.kind === 'intra-state' && igst.amount != null)
    add(
      'gst_jurisdiction_conflict',
      'warning',
      'jurisdiction',
      'Supplier and place of supply are in the same state, so IGST does not apply.',
    );
  if (jurisdiction.kind === 'inter-state' && intraAmounts)
    add(
      'gst_jurisdiction_conflict',
      'warning',
      'jurisdiction',
      'Supplier and place of supply are in different states, so IGST applies rather than CGST/SGST.',
    );

  // --- Amounts against taxable value and rate ------------------------------
  const computedPaise = { cgst: null, sgst: null, igst: null, tax: null };
  if (taxableP != null) {
    for (const [key, label] of COMPONENTS) {
      const { amount, rate } = component[key];
      if (rate == null) continue;
      const expected = componentAmount(taxableP, rate);
      computedPaise[key] = expected;
      if (amount != null && Math.abs(amount - expected) > 1)
        add(
          'gst_component_mismatch',
          'warning',
          `taxes.${key}.amount`,
          `${label} ${amount / 100} does not match ${rate}% of the taxable value ${taxableP / 100}.`,
        );
    }
  } else if (taxP != null || cgst.present || sgst.present || igst.present)
    add(
      'gst_taxable_missing',
      'warning',
      'taxable',
      'No taxable value was recorded, so the tax split cannot be checked against a base.',
    );

  // Sum of the components that actually apply, in paise.
  let derivedPaise = null;
  if (cgst.amount != null || sgst.amount != null)
    derivedPaise = (cgst.amount ?? 0) + (sgst.amount ?? 0) + (igst.amount ?? 0);
  else if (igst.amount != null) derivedPaise = igst.amount;

  // --- Declared included GST versus its own components --------------------
  if (taxP != null && derivedPaise != null && Math.abs(taxP - derivedPaise) > 1)
    add(
      'gst_tax_mismatch',
      'warning',
      'tax',
      `Included GST ${taxP / 100} differs from the component total ${derivedPaise / 100}.`,
    );

  const effectiveTaxP = taxP ?? derivedPaise;
  computedPaise.tax = effectiveTaxP;

  // --- Invoice totals -----------------------------------------------------
  if (totalP != null) {
    if (taxableP != null) {
      if (taxableP > totalP)
        add(
          'gst_taxable_exceeds_total',
          'warning',
          'taxable',
          'The taxable value is larger than the invoice total.',
        );
      if (effectiveTaxP != null) {
        const discountApplied = taxableP + effectiveTaxP - (discountP ?? 0);
        const discountIncluded = taxableP + effectiveTaxP;
        const matches =
          Math.abs(discountApplied - totalP) <= 1 ||
          Math.abs(discountIncluded - totalP) <= 1;
        if (!matches)
          add(
            'gst_total_mismatch',
            'warning',
            'total',
            `Taxable value ${taxableP / 100} plus GST ${effectiveTaxP / 100} less discount ${(discountP ?? 0) / 100} does not reconcile to the invoice total ${totalP / 100}.`,
          );
      }
    }
    if (discountP != null && discountP > totalP)
      add(
        'gst_discount_exceeds_total',
        'warning',
        'discount',
        'The discount is larger than the invoice total.',
      );
  } else if (taxableP != null || effectiveTaxP != null)
    add(
      'gst_total_unverifiable',
      'warning',
      'total',
      'No invoice total was recorded, so the GST arithmetic cannot be closed.',
    );

  // --- Zero-rated and exempt supplies -------------------------------------
  // An explicit zero is evidence. A missing component is not.
  const zeroRated =
    totalP != null &&
    effectiveTaxP === 0 &&
    (cgst.amount === 0 || sgst.amount === 0 || igst.amount === 0 || taxP === 0);
  // A taxable value alone is not a tax breakdown: an invoice with no components
  // and no declared tax is unverified for GST, whatever its subtotal says.
  const noBreakdown =
    !cgst.present && !sgst.present && !igst.present && taxP == null;
  if (!zeroRated && totalP != null && noBreakdown)
    add(
      'gst_components_missing',
      'warning',
      'taxes',
      'No GST breakdown was recorded. This invoice is unverified for tax purposes.',
    );

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const hasEvidence =
    taxableP != null ||
    discountP != null ||
    taxP != null ||
    cgst.present ||
    sgst.present ||
    igst.present;

  const status = errors.length
    ? 'invalid'
    : !hasEvidence
      ? 'unverified'
      : warnings.length
        ? 'partial'
        : 'consistent';

  return {
    status,
    zeroRated,
    jurisdiction,
    registration: {
      present: registration.present,
      valid: registration.valid,
      state: registration.state,
      // The GSTIN itself is not echoed here; it lives on the document record.
    },
    rates: declaredRates,
    declared: {
      taxable: fromPaise(taxableP),
      discount: fromPaise(discountP),
      tax: fromPaise(taxP),
      cgst: fromPaise(cgst.amount),
      sgst: fromPaise(sgst.amount),
      igst: fromPaise(igst.amount),
    },
    declaredPaise: {
      taxable: taxableP,
      discount: discountP,
      tax: taxP,
      cgst: cgst.amount,
      sgst: sgst.amount,
      igst: igst.amount,
    },
    computedPaise,
    componentTotalPaise: derivedPaise,
    issues,
  };
}

// Turn a reconciliation into the passport's three-way evidence distinction.
// Balancing arithmetic is not verification: that needs a source document and an
// owner confirmation as well.
export function evidenceGrade(
  report,
  { hasSourceDocument = false, userVerified = false } = {},
) {
  if (!report || report.status === 'invalid') return 'unverified';
  if (report.status === 'unverified') return 'unverified';
  if (report.status === 'consistent' && hasSourceDocument && userVerified)
    return 'verified';
  return 'partially-verified';
}
