/**
 * Illustrative projection assumptions only — not forecasts or expected returns.
 */

export const SCENARIOS = [
  {
    id: 'conservative',
    label: 'Conservative',
    annualReturnAssumption: 0.06,
    description: 'A lower modelling rate used only to illustrate slower compounding. Not a prediction.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    annualReturnAssumption: 0.1,
    description: 'A mid modelling rate used only to compare scenarios. Not an expected return.',
  },
  {
    id: 'higher_growth',
    label: 'Higher growth',
    annualReturnAssumption: 0.12,
    description: 'A higher modelling rate used only to show what faster compounding would look like on paper. Not guaranteed.',
  },
]

export const SCENARIO_DISCLAIMER =
  'These scenarios are illustrative assumptions, not predictions or guaranteed returns. Actual results vary and can be negative.'

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]))

export function getScenario(id) {
  return SCENARIO_BY_ID[id] || SCENARIO_BY_ID.moderate
}
