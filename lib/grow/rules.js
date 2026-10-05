/**
 * Rule-based educational category mapping.
 * Output is “shown because…”, never a buy recommendation.
 */

import { CATEGORIES, CATEGORY_BY_ID } from './categories.js'

const HORIZON_YEARS = {
  under_3: 0,
  y3_5: 4,
  y5_10: 7,
  y10_plus: 12,
}

/** Base eligible category IDs: horizon × risk. */
const BASE_MAP = {
  under_3: {
    low: ['debt'],
    moderate: ['debt'],
    high: ['debt', 'hybrid'],
    very_high: ['debt', 'hybrid'],
  },
  y3_5: {
    low: ['debt'],
    moderate: ['debt', 'hybrid'],
    high: ['debt', 'hybrid'],
    very_high: ['debt', 'hybrid'],
  },
  y5_10: {
    low: ['debt', 'hybrid'],
    moderate: ['debt', 'hybrid', 'index'],
    high: ['hybrid', 'index', 'diversified_equity'],
    very_high: ['hybrid', 'index', 'diversified_equity'],
  },
  y10_plus: {
    low: ['debt', 'hybrid'],
    moderate: ['debt', 'hybrid', 'index'],
    high: ['hybrid', 'index', 'diversified_equity'],
    very_high: ['hybrid', 'index', 'diversified_equity'],
  },
}

const HORIZON_REASONS = {
  under_3: 'Shorter horizons leave less time to recover from market swings, so lower-volatility categories are emphasised for learning.',
  y3_5: 'A 3–5 year window is often discussed with a mix that still includes lower-volatility and hybrid categories.',
  y5_10: 'A 5–10 year window can provide more time to live through market fluctuations, so a broader mix can be explored educationally.',
  y10_plus: 'Longer horizons can provide more time to tolerate market fluctuations. Equity-oriented categories can have higher volatility and are generally associated with long-term investing.',
}

const RISK_REASONS = {
  low: 'Low risk comfort keeps the focus on lower-volatility, debt-oriented categories. Hybrid may appear on longer horizons with a volatility reminder — not as a “safe” product.',
  moderate: 'Moderate risk comfort can include hybrid (and index on longer horizons) as educational options, not as a personal recommendation.',
  high: 'Higher risk comfort can include equity-oriented and index categories when the horizon is long enough. These can still fall in value.',
  very_high: 'Very high risk comfort still only shows educational categories. Volatility can be large; this is not a suitability score or SEBI Riskometer rating.',
}

const GOAL_REASONS = {
  emergency_reserve: 'An emergency reserve is usually discussed with easier access and lower volatility in mind, so diversified equity is not listed here.',
  education_purchase: 'Education or a major purchase often has a date attached, so shorter-horizon caution still applies when time is tight.',
  long_term: 'A long-term goal follows the horizon and risk mapping without extra product filters.',
  wealth_creation: 'Wealth-creation exploration still only lists equity or index categories when the time horizon is 5 years or more.',
  retirement: 'Retirement exploration still only lists equity or index categories when the time horizon is 5 years or more.',
}

function unique(ids) {
  return [...new Set(ids)]
}

function applyGoalFilter(goal, horizon, ids) {
  let next = [...ids]
  if (goal === 'emergency_reserve') {
    next = next.filter((id) => id !== 'diversified_equity' && id !== 'index')
    if (!next.includes('debt')) next.unshift('debt')
  }
  if ((goal === 'wealth_creation' || goal === 'retirement') && (horizon === 'under_3' || horizon === 'y3_5')) {
    next = next.filter((id) => id !== 'diversified_equity' && id !== 'index')
  }
  if (goal === 'education_purchase' && horizon === 'under_3') {
    next = next.filter((id) => id !== 'diversified_equity' && id !== 'index')
    if (!next.includes('debt')) next.unshift('debt')
  }
  return unique(next)
}

function categoryReason(id, { horizon, risk }) {
  if (id === 'debt') {
    return 'Shown as a lower-volatility educational starting point. Debt-oriented categories are not risk-free and are not guaranteed.'
  }
  if (id === 'hybrid') {
    return horizon === 'under_3' || horizon === 'y3_5'
      ? 'Shown as a mixed-allocation category to study — still capable of losses, especially over shorter periods.'
      : 'On a longer horizon, hybrid categories are shown so you can learn how blended portfolios behave — not as a buy list.'
  }
  if (id === 'index') {
    return 'Index-oriented categories are listed because a longer horizon is selected. They move with the market and can be volatile.'
  }
  if (id === 'diversified_equity') {
    return risk === 'very_high'
      ? 'Diversified equity is listed for study because both a longer horizon and higher risk comfort were selected. Swings can be sharp; this is not a recommendation.'
      : 'Diversified equity is listed as a long-horizon educational category. Higher volatility is typical; this is not a recommendation to buy.'
  }
  return ''
}

/**
 * @param {{ goal?: string, horizon?: string, riskComfort?: string }} prefs
 */
export function selectCategories({
  goal = 'long_term',
  horizon = 'y5_10',
  riskComfort = 'moderate',
} = {}) {
  const h = BASE_MAP[horizon] ? horizon : 'y5_10'
  const r = BASE_MAP[h][riskComfort] ? riskComfort : 'moderate'
  const g = GOAL_REASONS[goal] ? goal : 'long_term'
  const baseIds = [...BASE_MAP[h][r]]
  const ids = applyGoalFilter(g, h, baseIds)
  const categories = ids.map((id) => ({
    ...CATEGORY_BY_ID[id],
    whyShown: categoryReason(id, { horizon: h, risk: r }),
  })).filter(Boolean)

  const summaryParts = [HORIZON_REASONS[h], RISK_REASONS[r], GOAL_REASONS[g]]
  return {
    goal: g,
    horizon: h,
    riskComfort: r,
    categoryIds: ids,
    categories,
    explanation: `${summaryParts.join(' ')} This is educational context, not personalised investment advice.`,
    disclaimer: 'RupeeRizz does not recommend, rank, or execute investments. Verify every product on official sources.',
  }
}

export function allCategoryIds() {
  return CATEGORIES.map((c) => c.id)
}

export { HORIZON_YEARS, BASE_MAP }
