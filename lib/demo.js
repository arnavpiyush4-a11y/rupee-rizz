// RupeeRizz — Demo profiles, deterministic demo OCR, sensitive-data masking, and the SIH story.

// ---- Sensitive data masking (used before long-term storage) ----
// Masks phone numbers, UPI IDs and long card-like number runs. Returns cleaned text + flags.
export function maskSensitive(input) {
  let text = String(input || '');
  const found = [];
  // Indian mobile numbers (optionally with +91 / spaces)
  const phoneRe = /(\+?91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}/g;
  if (phoneRe.test(text)) { found.push('phone'); text = text.replace(phoneRe, '\u2022\u2022\u2022\u2022\u2022 masked'); }
  // UPI IDs like name@okhdfcbank / 98xxxx@ybl
  const upiRe = /\b[\w.\-]{2,}@[a-zA-Z]{2,}\b/g;
  text = text.replace(upiRe, (m) => { if (/@(gmail|yahoo|outlook|hotmail|live|proton)/i.test(m)) return m; found.push('upi'); return 'masked@upi'; });
  // Card-like runs of 12-16 digits
  const cardRe = /\b\d{12,16}\b/g;
  if (cardRe.test(text)) { found.push('card'); text = text.replace(cardRe, (m) => '**** **** **** ' + m.slice(-4)); }
  return { text: text.trim(), found: [...new Set(found)] };
}

// ---- Deterministic demo OCR templates (no real vision call in demo mode) ----
const OCR_TEMPLATES = [
  {
    merchant: 'Brew & Bites Cafe (Call 98765 43210)',
    date: '2025-06-14',
    total: 240,
    total_confidence: 0.96,
    items: [
      { name: 'Cold Coffee', price: 120, category: 'Food & Drinks', confidence: 0.94 },
      { name: 'Veg Sandwich', price: 120, category: 'Food & Drinks', confidence: 0.9 },
    ],
    needs_user_verification: [],
  },
  {
    merchant: 'Sharma Stationery Mart',
    date: null,
    total: 560,
    total_confidence: 0.71,
    items: [
      { name: 'Notebooks (pack)', price: 300, category: 'Education', confidence: 0.88 },
      { name: 'Printer Paper', price: 260, category: 'Education', confidence: 0.6 },
    ],
    needs_user_verification: ['date', 'item:Printer Paper price'],
  },
  {
    merchant: 'FreshMart Grocery, UPI freshmart@okaxis',
    date: '2025-06-10',
    total: 1180,
    total_confidence: 0.83,
    items: [
      { name: 'Vegetables & Fruits', price: 680, category: 'Food & Drinks', confidence: 0.79 },
      { name: 'Household Supplies', price: 500, category: 'Bills', confidence: 0.7 },
    ],
    needs_user_verification: ['item:Household Supplies category'],
  },
  {
    merchant: 'Metro Wholesale (Inventory)',
    date: '2025-06-08',
    total: 4200,
    total_confidence: 0.9,
    items: [
      { name: 'Flour & Packaging Bags', price: 2600, category: 'Inventory', confidence: 0.86 },
      { name: 'Cooking Oil (bulk)', price: 1600, category: 'Inventory', confidence: 0.83 },
    ],
    needs_user_verification: [],
  },
];

// Returns a copy so callers can safely mutate.
export function demoOcrExtract(seedIndex = 0) {
  const tpl = OCR_TEMPLATES[Math.abs(seedIndex) % OCR_TEMPLATES.length];
  return {
    merchant: tpl.merchant,
    date: tpl.date,
    currency: 'INR',
    total: tpl.total,
    total_confidence: tpl.total_confidence,
    items: tpl.items.map((i) => ({ ...i })),
    needs_user_verification: [...tpl.needs_user_verification],
    _demo: true,
  };
}

// ---- Demo/seed profiles ----
export const DEMO_PROFILES = {
  student: {
    full_name: 'Arnav',
    user_type: 'student',
    preferred_language: 'en',
    state: 'Maharashtra',
    pathway: 'plan_my_money',
    finance: {
      income_type: 'regular',
      reliable_monthly_income: 8000,
      essential_expenses: 4500,
      non_essential_expenses: 1800,
      compulsory_emi: 0,
      business_operating_costs: 0,
      current_savings: 2000,
      emergency_fund_amount: 1000,
      goal_purpose: 'laptop',
    },
    goals: [
      { goal_name: 'Laptop Fund', goal_amount: 15000, current_saved_amount: 2000, target_date: monthsFromNow(7), priority: 1 },
    ],
    receipts: [
      { merchant: 'Brew & Bites Cafe', receipt_date: '2025-06-14', total: 240, category: 'Food & Drinks', overall_confidence: 0.96, user_verified: true,
        items: [ { item_name: 'Cold Coffee', price: 120, category: 'Food & Drinks', confidence: 0.94 }, { item_name: 'Veg Sandwich', price: 120, category: 'Food & Drinks', confidence: 0.9 } ] },
      { merchant: 'Sharma Stationery Mart', receipt_date: '2025-06-09', total: 560, category: 'Education', overall_confidence: 0.82, user_verified: true,
        items: [ { item_name: 'Notebooks (pack)', price: 300, category: 'Education', confidence: 0.88 }, { item_name: 'Printer Paper', price: 260, category: 'Education', confidence: 0.75 } ] },
    ],
  },
  entrepreneur: {
    full_name: 'Priya',
    user_type: 'micro_entrepreneur',
    preferred_language: 'en',
    state: 'Karnataka',
    pathway: 'grow_my_business',
    business_type: 'Home food business',
    finance: {
      income_type: 'regular',
      reliable_monthly_income: 30000,
      essential_expenses: 6000,
      non_essential_expenses: 2500,
      compulsory_emi: 0,
      business_operating_costs: 18000,
      current_savings: 5000,
      emergency_fund_amount: 3000,
      goal_purpose: 'equipment',
    },
    goals: [
      { goal_name: 'Mixer & Packaging Equipment', goal_amount: 10000, current_saved_amount: 3000, target_date: monthsFromNow(5), priority: 1 },
    ],
    receipts: [
      { merchant: 'Metro Wholesale', receipt_date: '2025-06-08', total: 4200, category: 'Inventory', overall_confidence: 0.9, user_verified: true,
        items: [ { item_name: 'Flour & Packaging Bags', price: 2600, category: 'Inventory', confidence: 0.86 }, { item_name: 'Cooking Oil (bulk)', price: 1600, category: 'Inventory', confidence: 0.83 } ] },
      { merchant: 'City Auto Transport', receipt_date: '2025-06-11', total: 900, category: 'Travel', overall_confidence: 0.8, user_verified: true,
        items: [ { item_name: 'Delivery transport', price: 900, category: 'Travel', confidence: 0.8 } ] },
    ],
  },
};

function monthsFromNow(m) {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}

// ---- SIH demo story (Aman) ----
export const AMAN_STORY = {
  name: 'Aman',
  business: 'Tailoring business',
  income_range: '\u20b918,000 \u2013 \u20b925,000 (varies month to month)',
  goal: 'Buy a new sewing machine (\u20b920,000)',
  steps: [
    'RupeeRizz spots uneven cash flow and estimates income conservatively.',
    'Financial-readiness score shows around 58/100 \u2014 \u201cImproving\u201d.',
    'Aman corrects one wrongly-categorised expense.',
    'The score and safe savings plan recalculate instantly.',
    'The app suggests an emergency buffer and trimming non-essential spend first.',
    'It surfaces PM Vishwakarma, MUDRA and PMEGP as potentially relevant \u2014 before any borrowing.',
  ],
};
