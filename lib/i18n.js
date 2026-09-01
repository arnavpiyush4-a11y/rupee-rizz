// RupeeRizz — lightweight i18n (English + Hindi). t(lang, key, vars) with {var} interpolation.
// Falls back to English, then to the key itself.

const DICT = {
  en: {
    tagline: 'Your friendly money mate \u2014 save smarter, borrow responsibly.',
    app_name: 'RupeeRizz',
    try_demo: 'Try demo safely',
    continue_email: 'Continue with email (demo-safe)',
    get_started: 'Get started',
    sign_out: 'Sign out',
    // nav
    nav_dashboard: 'Dashboard', nav_scan: 'Scan', nav_plan: 'Plan', nav_goals: 'Goals', nav_options: 'Options', nav_mydata: 'My Data', nav_money_lab: 'Money Lab',
    // landing
    hero_title: 'Make every rupee count.',
    hero_sub: 'Scan receipts, plan safe savings, check your financial health, discover government support, and choose responsible options \u2014 before you ever borrow.',
    no_loan_push: 'We do not push loans. We help you become financially ready and choose responsible options.',
    trust_consent: 'Consent First', trust_consent_d: 'Nothing is analysed until you clearly agree.',
    trust_private: 'Private by Design', trust_private_d: 'Receipts stay private; sensitive details are masked.',
    trust_nopressure: 'No Loan Pressure', trust_nopressure_d: 'We suggest savings & support before any credit.',
    how_it_works: 'How it works',
    footer_note: 'For guidance only; verify scheme and lender conditions from official sources.',
    // consent
    consent_title: 'Your consent, in plain language',
    consent_agree: 'I Agree and Continue', consent_view: 'View Data Being Shared', consent_withdraw: 'Withdraw Consent', consent_delete: 'Delete My Data',
    consent_collected: 'Data we use', consent_never: 'Never collected or used for scoring',
    // onboarding
    who_are_you: 'Who are you?', student: 'Student', micro_ent: 'Micro-entrepreneur',
    choose_pathway: 'Choose your pathway',
    next: 'Next', back: 'Back', save: 'Save', cancel: 'Cancel', confirm_save: 'Confirm and save', edit: 'Edit', delete: 'Delete', recalculate: 'Edit and recalculate',
    // dashboard
    good_morning: 'Good morning', good_afternoon: 'Good afternoon', good_evening: 'Good evening',
    this_month_saved: 'This month: {amount} safe to save',
    reliable_income: 'Reliable monthly income', essential_spend: 'Essential spending', nonessential_spend: 'Non-essential spending',
    business_costs: 'Business operating costs', emi_payments: 'EMI / loan payments', monthly_surplus: 'Monthly surplus', safe_saving: 'Safe monthly saving',
    top_spending: 'Top spending', todays_nudge: "Today's nudge", spending_by_cat: 'Spending by category', income_vs_exp: 'Income vs expenses',
    recent_receipts: 'Recent receipts', scan_receipt: 'Scan Receipt', view_plan: 'View Savings Plan', explore_schemes: 'Explore Schemes',
    // goals
    goal: 'Goal', goal_amount: 'Goal amount', saved: 'Saved', remaining: 'Remaining', target_date: 'Target date',
    recommended_monthly: 'Recommended monthly', required_monthly: 'Required monthly', est_completion: 'Estimated completion', add_goal: 'Add goal', contribute: 'Add saving',
    // health
    fin_health: 'Financial Health', readiness_score: 'Financial Readiness Score', checklist: 'Financial Health Checklist',
    score_note: 'For self-improvement only. This is not a credit score and never means loan approval or rejection.',
    do_not_borrow: 'Do not borrow yet', // guard
    // options / byb
    options_title: 'Support & options', before_you_borrow: 'Before You Borrow',
    potentially_relevant: 'Potentially relevant',
    // my data
    mydata_title: 'My Data control centre', export_json: 'Download JSON', export_csv: 'Download CSV', delete_all: 'Delete all my data',
    demo_mode: 'Demo mode', loading: 'Loading\u2026', empty_receipts: 'No receipts yet. Scan your first one!',
  },
  hi: {
    tagline: '\u0906\u092a\u0915\u093e \u092a\u0948\u0938\u093e \u0926\u094b\u0938\u094d\u0924 \u2014 \u0938\u092e\u091d\u0926\u093e\u0930\u0940 \u0938\u0947 \u092c\u091a\u0924, \u091c\u093c\u093f\u092e\u094d\u092e\u0947\u0926\u093e\u0930\u0940 \u0938\u0947 \u0909\u0927\u093e\u0930\u0964',
    app_name: 'RupeeRizz',
    try_demo: '\u0921\u0947\u092e\u094b \u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924 \u0906\u095b\u092e\u093e\u090f\u0901',
    continue_email: '\u0908\u092e\u0947\u043b \u0938\u0947 \u091c\u093e\u0930\u0940 \u0930\u0916\u0947\u0902 (\u0921\u0947\u092e\u094b)',
    get_started: '\u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902',
    sign_out: '\u0938\u093e\u0907\u0928 \u0906\u0909\u091f',
    nav_dashboard: '\u0921\u0948\u0936\u092c\u094b\u0930\u094d\u0921', nav_scan: '\u0938\u094d\u0915\u0948\u0928', nav_plan: '\u092f\u094b\u091c\u0928\u093e', nav_goals: '\u0932\u0915\u094d\u0937\u094d\u092f', nav_options: '\u0935\u093f\u0915\u0932\u094d\u092a', nav_mydata: '\u092e\u0947\u0930\u093e \u0921\u0947\u091f\u093e', nav_money_lab: 'Money Lab',
    hero_title: '\u0939\u0930 \u0930\u0941\u092a\u092f\u093e \u092e\u093e\u092f\u0928\u0947 \u0930\u0916\u0924\u093e \u0939\u0948\u0964',
    hero_sub: '\u0930\u0938\u0940\u0926 \u0938\u094d\u0915\u0948\u0928 \u0915\u0930\u0947\u0902, \u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924 \u092c\u091a\u0924 \u0915\u0940 \u092f\u094b\u091c\u0928\u093e \u092c\u0928\u093e\u090f\u0901, \u0905\u092a\u0928\u0940 \u0935\u093f\u0924\u094d\u0924\u0940\u092f \u0938\u0947\u0939\u0924 \u091c\u093e\u0902\u091a\u0947\u0902, \u0938\u0930\u0915\u093e\u0930\u0940 \u092e\u0926\u0926 \u0916\u094b\u091c\u0947\u0902 \u2014 \u0909\u0927\u093e\u0930 \u0932\u0947\u0928\u0947 \u0938\u0947 \u092a\u0939\u0932\u0947\u0964',
    no_loan_push: '\u0939\u092e \u0932\u094b\u0928 \u0928\u0939\u0940\u0902 \u0925\u094b\u092a\u0924\u0947\u0964 \u0939\u092e \u0906\u092a\u0915\u094b \u0935\u093f\u0924\u094d\u0924\u0940\u092f \u0930\u0942\u092a \u0938\u0947 \u0924\u0948\u092f\u093e\u0930 \u0939\u094b\u0928\u0947 \u092e\u0947\u0902 \u092e\u0926\u0926 \u0915\u0930\u0924\u0947 \u0939\u0948\u0902\u0964',
    trust_consent: '\u092a\u0939\u0932\u0947 \u0938\u0939\u092e\u0924\u093f', trust_consent_d: '\u0906\u092a\u0915\u0940 \u0938\u094d\u092a\u0937\u094d\u091f \u0938\u0939\u092e\u0924\u093f \u0915\u0947 \u092c\u093f\u0928\u093e \u0915\u0941\u091b \u0928\u0939\u0940\u0902\u0964',
    trust_private: '\u0928\u093f\u091c\u0924\u093e \u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924', trust_private_d: '\u0930\u0938\u0940\u0926\u0947\u0902 \u0928\u093f\u091c\u0940 \u0930\u0939\u0924\u0940 \u0939\u0948\u0902; \u0938\u0902\u0935\u0947\u0926\u0928\u0936\u0940\u0932 \u091c\u093e\u0928\u0915\u093e\u0930\u0940 \u091b\u093f\u092a\u093e\u0908 \u091c\u093e\u0924\u0940 \u0939\u0948\u0964',
    trust_nopressure: '\u0915\u094b\u0908 \u0932\u094b\u0928 \u0926\u092c\u093e\u0935 \u0928\u0939\u0940\u0902', trust_nopressure_d: '\u0915\u094d\u0930\u0947\u0921\u093f\u091f \u0938\u0947 \u092a\u0939\u0932\u0947 \u092c\u091a\u0924 \u0914\u0930 \u092e\u0926\u0926\u0964',
    how_it_works: '\u092f\u0939 \u0915\u0948\u0938\u0947 \u0915\u093e\u092e \u0915\u0930\u0924\u093e \u0939\u0948',
    footer_note: '\u0915\u0947\u0935\u0932 \u092e\u093e\u0930\u094d\u0917\u0926\u0930\u094d\u0936\u0928 \u0939\u0947\u0924\u0941; \u092f\u094b\u091c\u0928\u093e \u0914\u0930 \u0932\u0947\u0902\u0921\u0930 \u0915\u0940 \u0936\u0930\u094d\u0924\u0947\u0902 \u0906\u0927\u093f\u0915\u093e\u0930\u093f\u0915 \u0938\u094d\u0930\u094b\u0924\u094b\u0902 \u0938\u0947 \u091c\u093e\u0902\u091a\u0947\u0902\u0964',
    consent_title: '\u0906\u092a\u0915\u0940 \u0938\u0939\u092e\u0924\u093f, \u0906\u0938\u093e\u0928 \u092d\u093e\u0937\u093e \u092e\u0947\u0902',
    consent_agree: '\u092e\u0948\u0902 \u0938\u0939\u092e\u0924 \u0939\u0942\u0901 \u0914\u0930 \u091c\u093e\u0930\u0940 \u0930\u0916\u0942\u0901', consent_view: '\u0938\u093e\u091d\u093e \u0921\u0947\u091f\u093e \u0926\u0947\u0916\u0947\u0902', consent_withdraw: '\u0938\u0939\u092e\u0924\u093f \u0935\u093e\u092a\u0938 \u0932\u0947\u0902', consent_delete: '\u092e\u0947\u0930\u093e \u0921\u0947\u091f\u093e \u0939\u091f\u093e\u090f\u0901',
    consent_collected: '\u0939\u092e \u091c\u094b \u0921\u0947\u091f\u093e \u0909\u092a\u092f\u094b\u0917 \u0915\u0930\u0924\u0947 \u0939\u0948\u0902', consent_never: '\u0938\u094d\u0915\u094b\u0930 \u0915\u0947 \u0932\u093f\u090f \u0915\u092d\u0940 \u0928\u0939\u0940\u0902',
    who_are_you: '\u0906\u092a \u0915\u094c\u0928 \u0939\u0948\u0902?', student: '\u0935\u093f\u0926\u094d\u092f\u093e\u0930\u094d\u0925\u0940', micro_ent: '\u0938\u0942\u0915\u094d\u0937\u094d\u092e-\u0909\u0926\u094d\u092f\u092e\u0940',
    choose_pathway: '\u0905\u092a\u0928\u093e \u0930\u093e\u0938\u094d\u0924\u093e \u091a\u0941\u0928\u0947\u0902',
    next: '\u0906\u0917\u0947', back: '\u092a\u0940\u091b\u0947', save: '\u0938\u0939\u0947\u091c\u0947\u0902', cancel: '\u0930\u0926\u094d\u0926 \u0915\u0930\u0947\u0902', confirm_save: '\u092a\u0941\u0937\u094d\u091f\u093f \u0915\u0930\u0915\u0947 \u0938\u0939\u0947\u091c\u0947\u0902', edit: '\u0938\u0902\u092a\u093e\u0926\u093f\u0924', delete: '\u0939\u091f\u093e\u090f\u0901', recalculate: '\u092c\u0926\u0932\u0947\u0902 \u0914\u0930 \u092a\u0941\u0928: \u0917\u0923\u0928\u093e',
    good_morning: '\u0938\u0941\u092a\u094d\u0930\u092d\u093e\u0924', good_afternoon: '\u0928\u092e\u0938\u094d\u0915\u093e\u0930', good_evening: '\u0936\u0941\u092d \u0938\u0902\u0927\u094d\u092f\u093e',
    this_month_saved: '\u0907\u0938 \u092e\u0939\u0940\u0928\u0947: {amount} \u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924 \u092c\u091a\u0924',
    reliable_income: '\u092d\u0930\u094b\u0938\u0947\u092e\u0902\u0926 \u092e\u093e\u0938\u093f\u0915 \u0906\u092f', essential_spend: '\u091c\u093c\u0930\u0942\u0930\u0940 \u0916\u0930\u094d\u091a', nonessential_spend: '\u0917\u0948\u0930-\u091c\u093c\u0930\u0942\u0930\u0940 \u0916\u0930\u094d\u091a',
    business_costs: '\u0935\u094d\u092f\u093e\u092a\u093e\u0930 \u0932\u093e\u0917\u0924', emi_payments: 'EMI / \u0932\u094b\u0928', monthly_surplus: '\u092e\u093e\u0938\u093f\u0915 \u092c\u091a\u0924', safe_saving: '\u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924 \u092e\u093e\u0938\u093f\u0915 \u092c\u091a\u0924',
    top_spending: '\u0938\u092c\u0938\u0947 \u095b\u094d\u092f\u093e\u0926\u093e \u0916\u0930\u094d\u091a', todays_nudge: '\u0906\u091c \u0915\u093e \u0938\u0941\u091d\u093e\u0935', spending_by_cat: '\u0936\u094d\u0930\u0947\u0923\u0940 \u0905\u0928\u0941\u0938\u093e\u0930 \u0916\u0930\u094d\u091a', income_vs_exp: '\u0906\u092f \u092c\u0928\u093e\u092e \u0916\u0930\u094d\u091a',
    recent_receipts: '\u0939\u093e\u0932\u093f\u092f\u093e \u0930\u0938\u0940\u0926\u0947\u0902', scan_receipt: '\u0930\u0938\u0940\u0926 \u0938\u094d\u0915\u0948\u0928 \u0915\u0930\u0947\u0902', view_plan: '\u092c\u091a\u0924 \u092f\u094b\u091c\u0928\u093e', explore_schemes: '\u092f\u094b\u091c\u0928\u093e\u090f\u0901 \u0926\u0947\u0916\u0947\u0902',
    goal: '\u0932\u0915\u094d\u0937\u094d\u092f', goal_amount: '\u0932\u0915\u094d\u0937\u094d\u092f \u0930\u093e\u0936\u093f', saved: '\u092c\u091a\u093e\u092f\u093e', remaining: '\u0936\u0947\u0937', target_date: '\u0932\u0915\u094d\u0937\u094d\u092f \u0924\u093f\u0925\u093f',
    recommended_monthly: '\u0905\u0928\u0941\u0936\u0902\u0938\u093f\u0924 \u092e\u093e\u0938\u093f\u0915', required_monthly: '\u0906\u0935\u0936\u094d\u092f\u0915 \u092e\u093e\u0938\u093f\u0915', est_completion: '\u0905\u0928\u0941\u092e\u093e\u0928\u093f\u0924 \u092a\u0942\u0930\u094d\u0923\u0924\u093e', add_goal: '\u0932\u0915\u094d\u0937\u094d\u092f \u091c\u094b\u0921\u093c\u0947\u0902', contribute: '\u092c\u091a\u0924 \u091c\u094b\u0921\u093c\u0947\u0902',
    fin_health: '\u0935\u093f\u0924\u094d\u0924\u0940\u092f \u0938\u0947\u0939\u0924', readiness_score: '\u0935\u093f\u0924\u094d\u0924\u0940\u092f \u0924\u0948\u092f\u093e\u0930\u0940 \u0938\u094d\u0915\u094b\u0930', checklist: '\u0935\u093f\u0924\u094d\u0924\u0940\u092f \u0938\u0947\u0939\u0924 \u091a\u0947\u0915\u0932\u093f\u0938\u094d\u091f',
    score_note: '\u0915\u0947\u0935\u0932 \u0906\u0924\u094d\u092e-\u0938\u0941\u0927\u093e\u0930 \u0939\u0947\u0924\u0941\u0964 \u092f\u0939 \u0915\u094d\u0930\u0947\u0921\u093f\u091f \u0938\u094d\u0915\u094b\u0930 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964',
    do_not_borrow: '\u0905\u092d\u0940 \u0909\u0927\u093e\u0930 \u0928 \u0932\u0947\u0902',
    options_title: '\u092e\u0926\u0926 \u0914\u0930 \u0935\u093f\u0915\u0932\u094d\u092a', before_you_borrow: '\u0909\u0927\u093e\u0930 \u0932\u0947\u0928\u0947 \u0938\u0947 \u092a\u0939\u0932\u0947',
    potentially_relevant: '\u0938\u0902\u092d\u0935\u0924: \u092a\u094d\u0930\u093e\u0938\u0902\u0917\u093f\u0915',
    mydata_title: '\u092e\u0947\u0930\u093e \u0921\u0947\u091f\u093e \u0928\u093f\u092f\u0902\u0924\u094d\u0930\u0923', export_json: 'JSON \u0921\u093e\u0909\u0928\u043b\u094b\u0921', export_csv: 'CSV \u0921\u093e\u0909\u0928\u043b\u094b\u0921', delete_all: '\u0938\u092d\u0940 \u0921\u0947\u091f\u093e \u0939\u091f\u093e\u090f\u0901',
    demo_mode: '\u0921\u0947\u092e\u094b \u092e\u094b\u0921', loading: '\u0932\u094b\u0921 \u0939\u094b \u0930\u0939\u093e\u0939\u0948\u2026', empty_receipts: '\u0905\u092d\u0940 \u0915\u094b\u0908 \u0930\u0938\u0940\u0926 \u0928\u0939\u0940\u0902\u0964 \u092a\u0939\u0932\u0940 \u0938\u094d\u0915\u0948\u0928 \u0915\u0930\u0947\u0902!',
  },
};

export function t(lang, key, vars) {
  const l = lang === 'hi' ? 'hi' : 'en';
  let str = (DICT[l] && DICT[l][key]) ?? DICT.en[key] ?? key;
  if (vars) Object.keys(vars).forEach((k) => { str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]); });
  return str;
}

export const LANGS = [ { code: 'en', label: 'EN' }, { code: 'hi', label: '\u0939\u093f' } ];
