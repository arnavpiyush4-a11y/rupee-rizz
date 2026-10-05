/**
 * Illustrative example products — demo data only.
 * No NAVs, returns, rankings, ratings, or live performance.
 * Replace later with a verified feed that still omits fabricated market stats.
 */

export const EXAMPLE_PRODUCTS = [
  {
    id: 'ppfas-flexi-cap',
    fundName: 'Parag Parikh Flexi Cap Fund – Direct Growth',
    amc: 'PPFAS Mutual Fund',
    categoryId: 'diversified_equity',
    categoryName: 'Flexi Cap Fund',
    planType: 'Direct Growth',
    riskLevel: 'Very High',
    minimumSip: 1000,
    minimumLumpsum: 1000,
    historicalPerformance: {
      return1Y: '-0.32%',
      cagr3Y: '13.96%',
      cagr5Y: '12.46%',
      asOfDate: 'August 31, 2026',
    },
    description: 'An educational example of a flexi-cap equity scheme investing across large, mid, and small cap Indian equities as well as select international stocks.',
    officialWebsiteUrl: 'https://amc.ppfas.com/schemes/parag-parikh-flexi-cap-fund/',
    isIllustrative: true,
  },
  {
    id: 'uti-nifty-50-index',
    fundName: 'UTI Nifty 50 Index Fund – Direct Growth',
    amc: 'UTI Mutual Fund',
    categoryId: 'index',
    categoryName: 'Index Fund (Nifty 50)',
    planType: 'Direct Growth',
    riskLevel: 'Very High',
    minimumSip: 500,
    minimumLumpsum: 5000,
    historicalPerformance: {
      return1Y: '11.92%',
      cagr3Y: null,
      cagr5Y: null,
      asOfDate: 'July 31, 2026',
    },
    description: 'An educational example of an index fund designed to mirror the composition and performance of the Nifty 50 index.',
    officialWebsiteUrl: 'https://www.utimf.com/product/mutual-funds/uti-nifty-50-index-fund',
    isIllustrative: true,
  },
  {
    id: 'hdfc-balanced-advantage',
    fundName: 'HDFC Balanced Advantage Fund – Direct Growth',
    amc: 'HDFC Mutual Fund',
    categoryId: 'hybrid',
    categoryName: 'Balanced Advantage Fund',
    planType: 'Direct Growth',
    riskLevel: 'Very High',
    minimumSip: 100,
    minimumLumpsum: 100,
    historicalPerformance: {
      return1Y: null,
      cagr3Y: '12.36%',
      cagr5Y: '14.64%',
      asOfDate: 'August 31, 2026',
    },
    description: 'An educational example of a dynamic asset allocation hybrid fund that dynamically manages asset allocation between equity and debt based on market conditions.',
    officialWebsiteUrl: 'https://www.hdfcfund.com/our-funds/hybrid-funds/hdfc-balanced-advantage-fund',
    isIllustrative: true,
  },
  {
    id: 'icici-pru-liquid',
    fundName: 'ICICI Prudential Liquid Fund – Direct Growth',
    amc: 'ICICI Prudential Mutual Fund',
    categoryId: 'debt',
    categoryName: 'Liquid Fund (Debt)',
    planType: 'Direct Growth',
    riskLevel: 'Low to Moderate',
    minimumSip: 100,
    minimumLumpsum: 100,
    historicalPerformance: {
      return1Y: '7.28%',
      cagr3Y: '6.22%',
      cagr5Y: '5.68%',
      asOfDate: 'August 31, 2026',
    },
    description: 'An educational example of a debt-oriented liquid scheme holding short-term debt and money market instruments.',
    officialWebsiteUrl: 'https://www.icicipruamc.com/',
    isIllustrative: true,
  },
]

export const EXAMPLE_PRODUCTS_BANNER =
  'Real mutual fund examples for educational reference. Past performance does not guarantee future returns. Historical returns are shown for educational purposes.'

export function exampleProductsForCategories(categoryIds = []) {
  const set = new Set(categoryIds)
  return EXAMPLE_PRODUCTS.filter((p) => set.has(p.categoryId))
}


