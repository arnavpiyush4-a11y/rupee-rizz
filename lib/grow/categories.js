/**
 * Educational investment categories. Not product recommendations.
 */

export const CATEGORIES = [
  {
    id: 'debt',
    name: 'Debt / lower-volatility categories',
    shortLabel: 'Debt-oriented',
    description: 'These categories typically invest more in bonds and money-market instruments. Values can still change; they are not risk-free and are not guaranteed.',
    volatilityNote: 'Usually lower day-to-day swings than equity, but inflation and interest-rate changes still matter.',
    sebiRiskometerHint: 'Often discussed alongside Low to Moderate on the SEBI Riskometer — always check the specific scheme’s latest label.',
  },
  {
    id: 'hybrid',
    name: 'Hybrid categories',
    shortLabel: 'Hybrid',
    description: 'Hybrid categories mix debt-oriented and equity-oriented holdings. They can still fall in value, especially when markets are unsettled.',
    volatilityNote: 'A blend of market and interest-rate movement — neither “safe” nor purely equity-like.',
    sebiRiskometerHint: 'Scheme labels often sit around Moderate to Moderately High. Verify the current Riskometer on the official factsheet.',
  },
  {
    id: 'index',
    name: 'Index categories',
    shortLabel: 'Index-oriented',
    description: 'Index-oriented funds aim to follow a market index rather than pick individual stocks. They still move with the market and can be volatile.',
    volatilityNote: 'Returns track the index (minus costs) and can be negative over short periods.',
    sebiRiskometerHint: 'Many broad equity indices are labelled High or Very High. Check the scheme document.',
  },
  {
    id: 'diversified_equity',
    name: 'Diversified equity categories',
    shortLabel: 'Diversified equity',
    description: 'Equity-oriented categories invest mainly in shares. They are generally discussed in a long-term context because prices can swing sharply.',
    volatilityNote: 'Higher potential fluctuation. Past performance is not a guide to future results.',
    sebiRiskometerHint: 'Typically High or Very High on the SEBI Riskometer. This app does not assign an official score.',
  },
]

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))
