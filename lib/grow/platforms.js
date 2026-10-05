/**
 * Central list of common investment routes. RupeeRizz is not affiliated
 * and does not open accounts or execute transactions.
 */

export const PLATFORMS = [
  {
    id: 'groww',
    name: 'Groww',
    kind: 'Investment app',
    description: 'A commonly used app where people explore mutual funds and SIPs. Check charges, KYC, and scheme documents there — not here.',
    url: 'https://groww.in/',
    unaffiliated: true,
  },
  {
    id: 'zerodha-coin',
    name: 'Zerodha Coin',
    kind: 'Direct mutual fund platform',
    description: 'Zerodha’s Coin platform is a well-known route for direct mutual fund investing. RupeeRizz does not process orders.',
    url: 'https://coin.zerodha.com/',
    unaffiliated: true,
  },
  {
    id: 'kuvera',
    name: 'Kuvera',
    kind: 'Investment app',
    description: 'Kuvera is another independent platform people use to study and place mutual fund orders on their own.',
    url: 'https://kuvera.in/',
    unaffiliated: true,
  },
  {
    id: 'amc-sites',
    name: 'AMC official websites',
    kind: 'Fund house',
    description: 'You can also invest directly on an Asset Management Company’s official site. Always use the issuer’s own pages for KYC and latest scheme information.',
    url: 'https://www.amfiindia.com/investor-corner/online-center/amc-websites-links',
    unaffiliated: true,
  },
]

export const PLATFORM_DISCLAIMER =
  'RupeeRizz is not affiliated with these services and does not open accounts, collect payments, or place orders. Links are for education only.'
