import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveExploreAmount,
  projectSip,
  projectLumpsum,
  projectionSeries,
} from '../lib/grow/calculators.js'
import { SCENARIOS, getScenario } from '../lib/grow/scenarios.js'

test('amount presets are fractions of safe monthly saving', () => {
  assert.equal(resolveExploreAmount({ safeMonthlySaving: 2000, mode: 'pct25' }), 500)
  assert.equal(resolveExploreAmount({ safeMonthlySaving: 2000, mode: 'pct50' }), 1000)
  assert.equal(resolveExploreAmount({ safeMonthlySaving: 2000, mode: 'pct75' }), 1500)
  assert.equal(resolveExploreAmount({ safeMonthlySaving: 2000, mode: 'pct100' }), 2000)
})

test('custom amount is capped at safe monthly saving', () => {
  assert.equal(resolveExploreAmount({ safeMonthlySaving: 2000, mode: 'custom', customAmount: 5000 }), 2000)
  assert.equal(resolveExploreAmount({ safeMonthlySaving: 2000, mode: 'custom', customAmount: 750 }), 750)
  assert.equal(resolveExploreAmount({ safeMonthlySaving: 2000, mode: 'custom', customAmount: -10 }), 0)
})

test('zero safe saving yields zero explore amount', () => {
  assert.equal(resolveExploreAmount({ safeMonthlySaving: 0, mode: 'pct100' }), 0)
  assert.equal(resolveExploreAmount({ safeMonthlySaving: -50, mode: 'pct50' }), 0)
  assert.equal(resolveExploreAmount({ safeMonthlySaving: 0, mode: 'custom', customAmount: 100 }), 0)
})

test('SIP illustration uses ordinary annuity and zero-rate identity', () => {
  const zero = projectSip({ monthlyInvestment: 1000, annualReturnAssumption: 0, durationYears: 2 })
  assert.equal(zero.months, 24)
  assert.equal(zero.totalInvested, 24000)
  assert.equal(zero.estimatedValue, 24000)
  assert.equal(zero.growth, 0)

  const growth = projectSip({ monthlyInvestment: 1000, annualReturnAssumption: 0.12, durationYears: 1 })
  assert.equal(growth.totalInvested, 12000)
  assert.ok(growth.estimatedValue > growth.totalInvested)
  assert.equal(growth.growth, growth.estimatedValue - growth.totalInvested)
  assert.match(growth.disclaimer, /not guaranteed/i)
})

test('SIP with zero contribution or zero duration stays at zero', () => {
  assert.equal(projectSip({ monthlyInvestment: 0, annualReturnAssumption: 0.1, durationYears: 5 }).estimatedValue, 0)
  assert.equal(projectSip({ monthlyInvestment: 500, annualReturnAssumption: 0.1, durationYears: 0 }).estimatedValue, 0)
})

test('lumpsum illustration compounds monthly', () => {
  const zero = projectLumpsum({ initialInvestment: 10000, annualReturnAssumption: 0, durationYears: 3 })
  assert.equal(zero.estimatedValue, 10000)
  assert.equal(zero.growth, 0)

  const grown = projectLumpsum({ initialInvestment: 10000, annualReturnAssumption: 0.12, durationYears: 1 })
  const expected = Math.round(10000 * Math.pow(1 + 0.12 / 12, 12))
  assert.equal(grown.estimatedValue, expected)
  assert.equal(grown.totalInvested, 10000)
  assert.match(grown.disclaimer, /not guaranteed/i)
})

test('scenario series is strictly illustrative and ends at the duration', () => {
  const moderate = getScenario('moderate')
  assert.equal(moderate.annualReturnAssumption, 0.1)
  const series = projectionSeries({
    mode: 'sip',
    monthlyInvestment: 2000,
    annualReturnAssumption: moderate.annualReturnAssumption,
    durationYears: 5,
  })
  assert.equal(series[0].year, 0)
  assert.equal(series[series.length - 1].year, 5)
  assert.ok(series[series.length - 1].illustrativeValue >= series[series.length - 1].invested)
  const short = projectionSeries({
    mode: 'lumpsum',
    initialInvestment: 5000,
    annualReturnAssumption: 0,
    durationYears: 2,
  })
  assert.ok(short.length > 2)
  assert.equal(short[short.length - 1].illustrativeValue, 5000)
})

test('scenario config is centralized and not a forecast', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), ['conservative', 'moderate', 'higher_growth'])
  SCENARIOS.forEach((s) => {
    assert.ok(s.annualReturnAssumption > 0)
    assert.match(s.description, /not/i)
  })
})
