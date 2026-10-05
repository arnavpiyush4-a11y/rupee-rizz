import test from 'node:test'
import assert from 'node:assert/strict'
import { selectCategories, BASE_MAP } from '../lib/grow/rules.js'
import { EXAMPLE_PRODUCTS, exampleProductsForCategories } from '../lib/grow/exampleProducts.js'
import { PLATFORMS } from '../lib/grow/platforms.js'

test('short horizon emphasises debt and never lists diversified equity', () => {
  const low = selectCategories({ goal: 'long_term', horizon: 'under_3', riskComfort: 'low' })
  assert.deepEqual(low.categoryIds, ['debt'])
  const high = selectCategories({ goal: 'long_term', horizon: 'under_3', riskComfort: 'high' })
  assert.ok(high.categoryIds.includes('debt'))
  assert.ok(!high.categoryIds.includes('diversified_equity'))
  assert.ok(!high.categoryIds.includes('index'))
})

test('medium horizon includes hybrid for moderate risk', () => {
  const mid = selectCategories({ goal: 'long_term', horizon: 'y3_5', riskComfort: 'moderate' })
  assert.deepEqual(mid.categoryIds, ['debt', 'hybrid'])
})

test('long horizon and higher risk can include index and equity as educational options', () => {
  const long = selectCategories({ goal: 'long_term', horizon: 'y10_plus', riskComfort: 'high' })
  assert.ok(long.categoryIds.includes('index'))
  assert.ok(long.categoryIds.includes('diversified_equity'))
  assert.match(long.explanation, /educational/i)
  assert.match(long.disclaimer, /does not recommend/i)
})

test('low risk on long horizon keeps debt and may add hybrid, not equity', () => {
  const res = selectCategories({ goal: 'long_term', horizon: 'y5_10', riskComfort: 'low' })
  assert.deepEqual(res.categoryIds, ['debt', 'hybrid'])
})

test('emergency reserve always keeps debt and suppresses equity/index', () => {
  const res = selectCategories({ goal: 'emergency_reserve', horizon: 'y10_plus', riskComfort: 'very_high' })
  assert.ok(res.categoryIds.includes('debt'))
  assert.ok(!res.categoryIds.includes('diversified_equity'))
  assert.ok(!res.categoryIds.includes('index'))
})

test('wealth creation does not list equity on short horizons', () => {
  const res = selectCategories({ goal: 'wealth_creation', horizon: 'under_3', riskComfort: 'very_high' })
  assert.ok(!res.categoryIds.includes('diversified_equity'))
  assert.ok(!res.categoryIds.includes('index'))
})

test('education purchase on a short horizon keeps a preservation tilt', () => {
  const res = selectCategories({ goal: 'education_purchase', horizon: 'under_3', riskComfort: 'high' })
  assert.ok(res.categoryIds.includes('debt'))
  assert.ok(!res.categoryIds.includes('diversified_equity'))
})

test('each shown category includes a why-shown reason without buy language', () => {
  const res = selectCategories({ goal: 'retirement', horizon: 'y10_plus', riskComfort: 'moderate' })
  assert.ok(res.categories.length >= 1)
  res.categories.forEach((c) => {
    assert.ok(c.whyShown.length > 20)
    assert.doesNotMatch(c.whyShown, /you should buy/i)
    assert.doesNotMatch(c.whyShown, /best investment/i)
    assert.doesNotMatch(c.whyShown, /guaranteed returns/i)
  })
})

test('base map covers every horizon and risk pair', () => {
  ;['under_3', 'y3_5', 'y5_10', 'y10_plus'].forEach((h) => {
    ;['low', 'moderate', 'high', 'very_high'].forEach((r) => {
      assert.ok(Array.isArray(BASE_MAP[h][r]) && BASE_MAP[h][r].length)
    })
  })
})

test('example products include verified historical performance structure', () => {
  EXAMPLE_PRODUCTS.forEach((p) => {
    assert.equal(p.isIllustrative, true)
    assert.ok(p.historicalPerformance, 'must have historicalPerformance object')
    assert.ok(p.historicalPerformance.asOfDate, 'must have asOfDate')
    assert.equal(p.nav, undefined)
    assert.equal(p.returns, undefined)
    assert.equal(p.rating, undefined)
    assert.equal(p.rank, undefined)
    assert.ok(p.officialWebsiteUrl.startsWith('https://'))
  })
  const filtered = exampleProductsForCategories(['debt'])
  assert.ok(filtered.length >= 1)
  assert.ok(filtered.every((p) => p.categoryId === 'debt'))
})

test('missing historical performance periods are explicitly allowed', () => {
  const uti = EXAMPLE_PRODUCTS.find((p) => p.id === 'uti-nifty-50-index')
  assert.ok(uti)
  assert.equal(uti.historicalPerformance.return1Y, '11.92%')
  assert.equal(uti.historicalPerformance.cagr3Y, null)
  assert.equal(uti.historicalPerformance.cagr5Y, null)

  const hdfc = EXAMPLE_PRODUCTS.find((p) => p.id === 'hdfc-balanced-advantage')
  assert.ok(hdfc)
  assert.equal(hdfc.historicalPerformance.return1Y, null)
  assert.equal(hdfc.historicalPerformance.cagr3Y, '12.36%')
  assert.equal(hdfc.historicalPerformance.cagr5Y, '14.64%')
})

test('historical performance is educational and not treated as a forecast or recommendation', () => {
  EXAMPLE_PRODUCTS.forEach((p) => {
    assert.doesNotMatch(p.description, /buy|best|recommend/i)
    assert.doesNotMatch(p.fundName, /top pick|recommended/i)
  })
})

test('platforms are unaffiliated and centrally linked', () => {
  assert.ok(PLATFORMS.length >= 4)
  PLATFORMS.forEach((p) => {
    assert.equal(p.unaffiliated, true)
    assert.ok(p.url.startsWith('https://'))
  })
})

