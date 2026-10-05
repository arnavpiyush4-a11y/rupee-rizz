/**
 * Educational definitions for investment terms used across RupeeRizz Grow Savings.
 * Short, beginner-friendly explanations — not advice or forecasts.
 */

export const FINANCIAL_DEFINITIONS = {
  cagr: {
    key: 'cagr',
    term: 'CAGR',
    definition: 'Compound Annual Growth Rate — the average yearly growth rate over a period, assuming compounding.',
  },
  return1Y: {
    key: 'return1Y',
    term: '1Y Return',
    definition: "The fund's historical return over the last 1 year.",
  },
  cagr3Y: {
    key: 'cagr3Y',
    term: '3Y CAGR',
    definition: 'The average annualized growth over the past 3 years, accounting for compounding.',
  },
  cagr5Y: {
    key: 'cagr5Y',
    term: '5Y CAGR',
    definition: 'The average annualized growth over the past 5 years, accounting for compounding.',
  },
  nav: {
    key: 'nav',
    term: 'NAV',
    definition: 'Net Asset Value — the per-unit value of a mutual fund.',
  },
  sip: {
    key: 'sip',
    term: 'SIP',
    definition: 'Systematic Investment Plan — investing a fixed amount at regular intervals, usually monthly.',
  },
  lumpsum: {
    key: 'lumpsum',
    term: 'Lumpsum',
    definition: 'A one-time investment instead of investing periodically.',
  },
  riskometer: {
    key: 'riskometer',
    term: 'Riskometer',
    definition: "SEBI's indicator showing the fund's assessed level of investment risk.",
  },
  directGrowth: {
    key: 'directGrowth',
    term: 'Direct Growth',
    definition: 'Direct means investing without a distributor. Growth means returns remain invested in the fund.',
  },
  minSip: {
    key: 'minSip',
    term: 'Min. SIP',
    definition: 'The minimum amount allowed for a SIP in this fund.',
  },
  minLumpsum: {
    key: 'minLumpsum',
    term: 'Min. Lumpsum',
    definition: 'The minimum amount required for a one-time investment.',
  },
  expenseRatio: {
    key: 'expenseRatio',
    term: 'Expense Ratio',
    definition: 'The annual fee charged by a mutual fund for managing the scheme, expressed as a percentage of assets.',
  },
  historicalReturn: {
    key: 'historicalReturn',
    term: 'Historical Return',
    definition: 'What the investment actually returned during a past period. It does not predict future returns.',
  },
};

export const GLOSSARY_LIST = Object.values(FINANCIAL_DEFINITIONS);
