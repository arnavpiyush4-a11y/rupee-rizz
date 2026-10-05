/**
 * Grow Savings — shared IDs and JSDoc shapes.
 * Educational simulation only. Not investment advice.
 */

/** @typedef {'emergency_reserve' | 'education_purchase' | 'long_term' | 'wealth_creation' | 'retirement'} InvestmentGoalId */
/** @typedef {'under_3' | 'y3_5' | 'y5_10' | 'y10_plus'} HorizonId */
/** @typedef {'low' | 'moderate' | 'high' | 'very_high'} RiskComfortId */
/** @typedef {'debt' | 'hybrid' | 'index' | 'diversified_equity'} CategoryId */
/** @typedef {'pct25' | 'pct50' | 'pct75' | 'pct100' | 'custom'} AmountMode */
/** @typedef {'conservative' | 'moderate' | 'higher_growth'} ScenarioId */

export const INVESTMENT_GOALS = [
  { id: 'emergency_reserve', label: 'Emergency reserve', description: 'Money you may need to reach quickly.' },
  { id: 'education_purchase', label: 'Education / major purchase', description: 'A planned expense with a date in mind.' },
  { id: 'long_term', label: 'Long-term goal', description: 'A goal several years away.' },
  { id: 'wealth_creation', label: 'Wealth creation', description: 'Building a larger pool over time.' },
  { id: 'retirement', label: 'Retirement', description: 'Very long-term retirement savings exploration.' },
]

export const HORIZONS = [
  { id: 'under_3', label: 'Less than 3 years', defaultYears: 2 },
  { id: 'y3_5', label: '3–5 years', defaultYears: 4 },
  { id: 'y5_10', label: '5–10 years', defaultYears: 7 },
  { id: 'y10_plus', label: '10+ years', defaultYears: 12 },
]

export const RISK_COMFORT = [
  { id: 'low', label: 'Low', sebiHint: 'Aligned with lower-volatility / Low Riskometer language.' },
  { id: 'moderate', label: 'Moderate', sebiHint: 'Aligned with Moderate Riskometer language.' },
  { id: 'high', label: 'High', sebiHint: 'Aligned with High Riskometer language.' },
  { id: 'very_high', label: 'Very high', sebiHint: 'Aligned with Very High Riskometer language.' },
]

export const AMOUNT_PRESETS = [
  { id: 'pct25', pct: 0.25, label: '25%' },
  { id: 'pct50', pct: 0.5, label: '50%' },
  { id: 'pct75', pct: 0.75, label: '75%' },
  { id: 'pct100', pct: 1, label: '100%' },
]

export const DEFAULT_AMOUNT_MODE = 'pct50'
export const DEFAULT_GOAL = 'long_term'
export const DEFAULT_HORIZON = 'y5_10'
export const DEFAULT_RISK = 'moderate'
