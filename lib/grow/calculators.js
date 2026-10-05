/**
 * SIP, lumpsum, and year-by-year illustration helpers.
 * Modelling only — never live market data.
 */

const round = (n) => Math.round(Number(n) || 0)
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0))

export const AMOUNT_PCT = {
  pct25: 0.25,
  pct50: 0.5,
  pct75: 0.75,
  pct100: 1,
}

/**
 * Educational “amount to explore” — a simulation input capped at safe monthly saving.
 * This is not extra cash and does not reallocate the savings plan.
 */
export function resolveExploreAmount({
  safeMonthlySaving = 0,
  mode = 'pct50',
  customAmount = 0,
} = {}) {
  const cap = Math.max(0, round(safeMonthlySaving))
  if (cap <= 0) return 0
  if (mode === 'custom') return clamp(round(customAmount), 0, cap)
  const pct = AMOUNT_PCT[mode] ?? AMOUNT_PCT.pct50
  return round(cap * pct)
}

export function monthlyRate(annualReturnAssumption) {
  return Number(annualReturnAssumption) / 12
}

export function monthsFromYears(years) {
  return Math.max(0, Math.round((Number(years) || 0) * 12))
}

/**
 * Ordinary (end-of-month) SIP illustration.
 * FV = P * [((1+i)^n - 1) / i] ; if i === 0, FV = P * n
 */
export function projectSip({
  monthlyInvestment = 0,
  annualReturnAssumption = 0,
  durationYears = 0,
} = {}) {
  const P = Math.max(0, Number(monthlyInvestment) || 0)
  const years = Math.max(0, Number(durationYears) || 0)
  const n = monthsFromYears(years)
  const i = monthlyRate(annualReturnAssumption)
  const totalInvested = round(P * n)
  let estimatedValue = 0
  if (n === 0 || P === 0) estimatedValue = 0
  else if (i === 0) estimatedValue = P * n
  else estimatedValue = P * ((Math.pow(1 + i, n) - 1) / i)
  const value = round(estimatedValue)
  return {
    monthlyInvestment: round(P),
    durationYears: years,
    months: n,
    annualReturnAssumption: Number(annualReturnAssumption) || 0,
    totalInvested,
    estimatedValue: value,
    growth: round(value - totalInvested),
    disclaimer: 'Illustrative projection — not guaranteed.',
  }
}

/**
 * Lumpsum with monthly compounding, consistent with SIP illustrations.
 * FV = L * (1+i)^n
 */
export function projectLumpsum({
  initialInvestment = 0,
  annualReturnAssumption = 0,
  durationYears = 0,
} = {}) {
  const L = Math.max(0, Number(initialInvestment) || 0)
  const years = Math.max(0, Number(durationYears) || 0)
  const n = monthsFromYears(years)
  const i = monthlyRate(annualReturnAssumption)
  const estimatedValue = n === 0 ? L : L * Math.pow(1 + i, n)
  const value = round(estimatedValue)
  const invested = round(L)
  return {
    initialInvestment: invested,
    durationYears: years,
    months: n,
    annualReturnAssumption: Number(annualReturnAssumption) || 0,
    totalInvested: invested,
    estimatedValue: value,
    growth: round(value - invested),
    disclaimer: 'Illustrative projection — not guaranteed.',
  }
}

function sipValueAtMonth(P, i, m) {
  if (m <= 0 || P <= 0) return 0
  if (i === 0) return P * m
  return P * ((Math.pow(1 + i, m) - 1) / i)
}

function lumpsumValueAtMonth(L, i, m) {
  if (m <= 0) return L
  return L * Math.pow(1 + i, m)
}

/**
 * Year-by-year series for charts. Uses yearly points; monthly if duration <= 3 years.
 */
export function projectionSeries({
  mode = 'sip',
  monthlyInvestment = 0,
  initialInvestment = 0,
  annualReturnAssumption = 0,
  durationYears = 0,
} = {}) {
  const years = Math.max(0, Number(durationYears) || 0)
  const n = monthsFromYears(years)
  const i = monthlyRate(annualReturnAssumption)
  const P = Math.max(0, Number(monthlyInvestment) || 0)
  const L = Math.max(0, Number(initialInvestment) || 0)
  const step = years > 0 && years <= 3 ? 1 : 12
  const points = []
  const startInvested = mode === 'lumpsum' ? L : 0
  points.push({
    year: 0,
    month: 0,
    label: 'Start',
    invested: round(startInvested),
    illustrativeValue: round(startInvested),
    growth: 0,
  })
  if (n <= 0) return points
  for (let m = step; m < n; m += step) {
    const invested = mode === 'sip' ? P * m : L
    const value = mode === 'sip' ? sipValueAtMonth(P, i, m) : lumpsumValueAtMonth(L, i, m)
    points.push({
      year: Math.round((m / 12) * 10) / 10,
      month: m,
      label: `${Math.round((m / 12) * 10) / 10}y`,
      invested: round(invested),
      illustrativeValue: round(value),
      growth: round(value - invested),
    })
  }
  const investedEnd = mode === 'sip' ? P * n : L
  const valueEnd = mode === 'sip' ? sipValueAtMonth(P, i, n) : lumpsumValueAtMonth(L, i, n)
  points.push({
    year: years,
    month: n,
    label: `${years}y`,
    invested: round(investedEnd),
    illustrativeValue: round(valueEnd),
    growth: round(valueEnd - investedEnd),
  })
  return points
}
