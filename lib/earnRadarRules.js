// Pure, deterministic rules used by Earn Radar. No external content is trusted as code.

export const EARN_RADAR_STATUSES = [
  'saved', 'interested', 'applied', 'interview', 'accepted', 'rejected', 'completed',
]

export const EARN_RADAR_CATEGORIES = [
  { value: 'freelance', label: 'Freelance projects' },
  { value: 'tutoring', label: 'Tutoring & teaching' },
  { value: 'internships', label: 'Internships' },
  { value: 'part_time', label: 'Part-time work' },
  { value: 'gigs', label: 'Short-term gigs' },
  { value: 'business', label: 'Customers & business leads' },
]

const RED_FLAG_RULES = [
  [/\b(upfront|advance|registration|joining|security|training) fee\b/i, 'Requests an upfront, registration, joining, security, or training fee'],
  [/\b(pay|send|transfer|deposit|recharge) (?:first|to start|before|in advance)\b/i, 'Asks you to pay or transfer money before earning'],
  [/\b(upi pin|otp|one[- ]time password|bank password|net banking password|card pin|cvv)\b/i, 'Mentions sensitive banking or authentication credentials'],
  [/\bguaranteed (?:income|earning|salary|profit)s?\b/i, 'Promises guaranteed income or earnings'],
  [/\b(no experience required|work from home).{0,100}\b(earn|income|salary)\b.{0,50}\b(?:\d{2,3},?\d{3,}|lakhs?|lacs?)\b/i, 'Pairs unusually high earnings with vague or minimal requirements'],
  [/\b(buy|purchase) (?:our|the) (?:kit|course|package|software|equipment)\b/i, 'Requires buying a package, course, kit, or equipment'],
  [/\b(urgent|limited time|act now).{0,70}\b(pay|fee|deposit|transfer)\b/i, 'Uses urgency to pressure a payment'],
]

export function screenOpportunityText(text = '') {
  const safeText = String(text).slice(0, 30000)
  const flags = []
  for (const [pattern, reason] of RED_FLAG_RULES) {
    if (pattern.test(safeText)) flags.push(reason)
  }
  return {
    level: flags.length ? 'caution' : 'no_obvious_flags',
    flags,
    note: 'Automated red-flag screening only. A warning is not proof of fraud, and no detected warning is not proof of legitimacy.',
  }
}

const CURRENCY_TOKEN = String.raw`(?:₹|INR\b|Rs\.?(?=\s)|US\$|\bUSD\b|CA\$|\bCAD\b|A\$|\bAUD\b|£|\bGBP\b|€|\bEUR\b|\$)`
const AMOUNT_TOKEN = String.raw`(?:\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`
const MONEY_EXPRESSION = new RegExp(
  String.raw`(?<currency>${CURRENCY_TOKEN})\s*(?<first>${AMOUNT_TOKEN})(?:\s*(?:-|–|—|to)\s*(?<currency2>${CURRENCY_TOKEN})?\s*(?<second>${AMOUNT_TOKEN}))?(?<unit>\s*(?:\/\s*(?:hr|hour|day|week|month|year|project|task)|per\s+(?:hour|day|week|month|year|project|task)|p\.?a\.?|hourly|daily|weekly|monthly|annually|per annum))?`,
  'giu',
)

function normalizeCurrency(token = '') {
  const value = String(token).trim().toUpperCase()
  if (value === '₹' || value.startsWith('INR') || /^RS\.?$/i.test(value)) return { code: 'INR', label: 'INR' }
  if (value === 'US$' || value === 'USD') return { code: 'USD', label: 'USD' }
  if (value === 'CA$' || value === 'CAD') return { code: 'CAD', label: 'CAD' }
  if (value === 'A$' || value === 'AUD') return { code: 'AUD', label: 'AUD' }
  if (value === '£' || value === 'GBP') return { code: 'GBP', label: 'GBP' }
  if (value === '€' || value === 'EUR') return { code: 'EUR', label: 'EUR' }
  // A bare dollar symbol is ambiguous without a stated currency code.
  return { code: null, label: '$ (currency not specified)' }
}

function parseAmount(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const amount = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function compensationBasis(unit = '', context = '') {
  const value = `${unit} ${context}`.toLowerCase()
  if (/\b(?:per\s+hour|\/\s*(?:hr|hour)|hourly)\b/.test(value)) return 'hourly'
  if (/\b(?:per\s+day|\/\s*day|daily)\b/.test(value)) return 'daily'
  if (/\b(?:per\s+week|\/\s*week|weekly)\b/.test(value)) return 'weekly'
  if (/\b(?:per\s+month|\/\s*month|monthly)\b/.test(value)) return 'monthly'
  if (/\b(?:per\s+year|\/\s*year|annually|annual(?:ly)?|p\.?a\.?|per annum)\b/.test(value)) return 'annual'
  if (/\b(?:per\s+project|\/\s*project|project[- ]based|fixed[- ]price|project fee|per task)\b/.test(value)) return 'project_or_task'
  if (/\bcommission(?:[- ]based)?\b/.test(value)) return 'commission'
  return 'unspecified'
}

/**
 * Extract only stated compensation with payment-specific evidence. A currency-like
 * number is not enough: e.g. `Rs 4.9` next to a rating is not salary evidence.
 * The return value keeps the original evidence and does not convert currencies.
 */
export function parseAdvertisedCompensation(text = '') {
  const content = String(text).slice(0, 30000)
  if (!content.trim()) return null
  // Split on lines and sentence boundaries while not splitting decimals or `Rs. 5,000`.
  const segments = content
    .split(/\n+|;\s*|(?<=[!?])\s+|(?<=[.!?])\s+(?=[A-Z₹$£€])/u)
    .map((segment) => segment.replace(/^\s*(?:[-*#>]+\s*)/, '').trim())
    .filter(Boolean)
  const explicitPayCue = /\b(?:salary|stipend|pay(?:ment)?|paid|compensation|remuneration|wages?|rate|earnings?|earning|income|budget|fixed[- ]price|project fee|commission)\b/i
  const nonPayContext = /\b(?:rating|rated|stars?|reviews?|review count|vacanc(?:y|ies)|job count|job openings|open positions|applicants?|candidates?|followers|views|page views|employees|companies ranked|platforms ranked|years? of experience)\b/i
  const outputUnit = /(?:\/\s*(?:hr|hour|day|week|month|year|project|task)|\bper\s+(?:hour|day|week|month|year|project|task)\b|\bhourly\b|\bdaily\b|\bweekly\b|\bmonthly\b|\bannually\b|\bp\.?a\.?\b|\bper annum\b)/i

  for (const segment of segments) {
    MONEY_EXPRESSION.lastIndex = 0
    for (const match of segment.matchAll(MONEY_EXPRESSION)) {
      const first = parseAmount(match.groups?.first)
      const second = parseAmount(match.groups?.second)
      if (first === null || (match.groups?.second && second === null)) continue
      const unit = String(match.groups?.unit || '').trim()
      const aroundStart = Math.max(0, match.index - 90)
      const aroundEnd = Math.min(segment.length, match.index + match[0].length + 90)
      const evidence = segment.slice(aroundStart, aroundEnd).replace(/\s+/g, ' ').trim().slice(0, 220)
      const nearText = segment.slice(Math.max(0, match.index - 70), Math.min(segment.length, match.index + match[0].length + 70))
      const hasExplicitPayCue = explicitPayCue.test(nearText)
      const hasPaymentUnit = outputUnit.test(`${unit} ${nearText}`)
      if (!hasExplicitPayCue && !hasPaymentUnit) continue
      // Block likely ratings/counts unless this exact amount is tied to unmistakable
      // compensation wording or a payment basis. This prevents `Rs 4.9 rating` leakage.
      if (nonPayContext.test(nearText) && !/\b(?:salary|stipend|compensation|remuneration|wages?|pay(?:ment)?|paid)\b/i.test(nearText) && !outputUnit.test(unit)) continue
      // A range with two explicitly different currencies is ambiguous for matching.
      const currency = normalizeCurrency(match.groups?.currency)
      const currency2 = match.groups?.currency2 ? normalizeCurrency(match.groups.currency2) : currency
      if (currency2.code !== currency.code || currency2.label !== currency.label) continue
      const basis = compensationBasis(unit, nearText)
      const originalText = match[0].replace(/\s+/g, ' ').trim()
      const display = originalText
        .replace(/\bINR\b/i, 'INR ')
        .replace(/\bRs\.?\s*/i, 'Rs ')
        .replace(/\s*[-–—]\s*/, '–')
        .replace(/\s+/g, ' ')
        .trim()
      return {
        minAmount: second === null ? first : Math.min(first, second),
        maxAmount: second === null ? first : Math.max(first, second),
        currencyCode: currency.code,
        currency: currency.label,
        basis,
        unit: unit || null,
        display,
        evidence,
        confidence: hasExplicitPayCue ? 'high' : 'medium',
        validationStatus: 'stated_compensation_context',
      }
    }
  }
  return null
}

export function inferPayoutTiming(text = '') {
  const content = String(text).slice(0, 30000)
  const sentences = content.split(/[\n.!?;]+/).map((part) => part.trim()).filter(Boolean)
  const payoutCue = /\b(payment|payout|payroll|salary|stipend|wages?|funds|earnings?|withdraw(?:al)?|credited|transfer|invoice|remittance|disbursement|release|released|pay)\b/i

  // Only infer a concrete payout window where the wording connects it to payment.
  // A nearby phrase such as "apply within 7 days for this paid role" is not payout evidence.
  for (const sentence of sentences) {
    if (/\b(?:same day payment|payment (?:is )?same day|(?:payment|payout|payroll|salary|stipend|wages?|funds|earnings?|withdraw(?:al)?|credited|transfer|invoice|remittance|disbursement|release|released|pay)\b.{0,50}\b(?:within 24 hours|same day)|\bwithin 24 hours.{0,50}\b(?:payment|payout)|instant payout|instant payment|paid immediately|paid within 24 hours|paid the same day|credited immediately)\b/i.test(sentence)) {
      return { label: 'Same day / within 24 hours (stated)', days: 1, confidence: 'explicit' }
    }
    if (/\bweekly payment|paid weekly|weekly pay|payment weekly|salary paid weekly|every week\b/i.test(sentence)) {
      return { label: 'Weekly (stated)', days: 7, confidence: 'explicit' }
    }
    if (/\bmonthly payment|paid monthly|monthly pay|payment monthly|salary paid monthly|once a month\b/i.test(sentence)) {
      return { label: 'Monthly (stated)', days: 30, confidence: 'explicit' }
    }
    const m = /\b(?:within|in|net\s*)\s*(3|three|5|five|7|seven)\s*(?:business\s*)?days?\b/i.exec(sentence)
    if (m) {
      const before = sentence.slice(0, m.index)
      const after = sentence.slice(m.index + m[0].length)
      const connectedToPayment = payoutCue.test(before) || payoutCue.test(after)
      if (connectedToPayment) {
        const n = /^(?:3|three)$/i.test(m[1]) ? 3 : /^(?:5|five)$/i.test(m[1]) ? 5 : 7
        return { label: `Within about ${n} days (stated)`, days: n, confidence: 'explicit' }
      }
    }
    const net = /\b(?:net\s*)?(\d{1,2})\s*days after (?:completion|approval|acceptance|invoice)\b/i.exec(sentence)
    if (net && payoutCue.test(sentence)) return { label: `${net[1]} days after completion/approval (stated)`, days: Number(net[1]), confidence: 'explicit' }
  }
  if (/\bafter (?:project )?completion|upon acceptance|after approval|after selection|subject to selection|payment terms|payout schedule\b/i.test(content)) {
    return { label: 'Depends on completion, acceptance, selection, or payment terms', days: null, confidence: 'conditional' }
  }
  return { label: 'Not stated in the available source text', days: null, confidence: 'unknown' }
}

function postingFreshnessScore(postingDate) {
  if (!postingDate) return 3
  const timestamp = Date.parse(String(postingDate))
  if (!Number.isFinite(timestamp)) return 3
  const ageDays = (Date.now() - timestamp) / (24 * 60 * 60 * 1000)
  if (ageDays < -1) return 3 // Future or inconsistent source dates should not get a freshness bonus.
  if (ageDays <= 7) return 8
  if (ageDays <= 30) return 6
  if (ageDays <= 90) return 3
  return 0
}

function applicationDeadlineState(deadline) {
  if (!deadline) return { state: 'unknown', daysLeft: null }
  const timestamp = Date.parse(String(deadline))
  if (!Number.isFinite(timestamp)) return { state: 'unknown', daysLeft: null }
  const dateOnly = new Date(timestamp).toISOString().slice(0, 10)
  const todayIndia = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)
  const daysLeft = Math.round((Date.parse(`${dateOnly}T00:00:00Z`) - Date.parse(`${todayIndia}T00:00:00Z`)) / (24 * 60 * 60 * 1000))
  if (daysLeft < 0) return { state: 'past', daysLeft }
  if (daysLeft <= 2) return { state: 'soon', daysLeft }
  return { state: 'upcoming', daysLeft }
}

export function calculateOpportunityMatch({ opportunity, request }) {
  const title = String(opportunity?.title || '')
  const descriptionText = `${title} ${opportunity?.description || ''} ${opportunity?.requirements || ''} ${opportunity?.source || ''}`
  const text = descriptionText.toLowerCase()
  const skillMatches = (request?.skills || []).filter((skill) => {
    const clean = String(skill).trim().toLowerCase()
    return clean.length > 1 && (text.includes(clean) || clean.split(/\s+/).some((part) => part.length > 3 && text.includes(part)))
  })
  const hasSkillData = (request?.skills || []).length > 0
  const skillScore = hasSkillData ? Math.round((skillMatches.length / request.skills.length) * 35) : 12
  const remoteMention = /\b(remote|work from home|wfh|hybrid|anywhere)\b/i.test(descriptionText)
  const onSiteMention = /\b(on[- ]site|in[- ]office|field work|in person)\b/i.test(descriptionText)
  let arrangementScore = 10
  if (request?.workPreference === 'remote') arrangementScore = remoteMention ? 15 : (onSiteMention ? 0 : 7)
  if (request?.workPreference === 'onsite') arrangementScore = onSiteMention ? 15 : (remoteMention ? 3 : 8)
  if (request?.workPreference === 'hybrid') arrangementScore = /\bhybrid\b/i.test(descriptionText) ? 15 : 8

  const timePerDay = Number(request?.timePerDay)
  const fullTimeSignals = /\b(full[- ]time|8 hours? (?:a|per) day|40 hours? per week|standard office hours)\b/i.test(descriptionText)
  const flexibleSignals = /\b(part[- ]time|flexible hours?|freelance|gig|tutor|project[- ]based|choose your hours)\b/i.test(descriptionText)
  let availabilityScore = 7
  if (Number.isFinite(timePerDay) && fullTimeSignals && timePerDay < 6) availabilityScore = 0
  else if (flexibleSignals && Number.isFinite(timePerDay) && timePerDay <= 4) availabilityScore = 10
  else if (flexibleSignals) availabilityScore = 8
  else if (!Number.isFinite(timePerDay)) availabilityScore = 5

  const requestedLocation = String(request?.location || '').trim().toLowerCase()
  const statedLocation = String(opportunity?.location || '').toLowerCase()
  let locationScore = 5
  if (!requestedLocation || request?.workPreference === 'remote') locationScore = 7
  else if (statedLocation.includes(requestedLocation)) locationScore = 7
  else if (statedLocation.includes('not stated')) locationScore = 3
  else locationScore = 2

  const compensationScore = opportunity?.advertisedCompensation ? 10 : 3
  const freshnessScore = postingFreshnessScore(opportunity?.postingDate)
  const requirementsScore = opportunity?.requirements ? 5 : 2
  const userDescribesBeginnerExperience = /\b(?:beginner|entry[- ]level|no experience|little experience|fresher|junior|first[- ]year|0\s*(?:-|to)?\s*2 years?)\b/i.test(String(request?.experience || ''))
  const roleRequiresExtensiveExperience = /\b(?:senior|lead|principal|staff engineer|5\+\s*years?|minimum\s+(?:5|five|6|six)\s+years?|(?:five|six|seven|eight|nine|ten)\s+years? of experience)\b/i.test(descriptionText)
  const experienceMismatchPenalty = userDescribesBeginnerExperience && roleRequiresExtensiveExperience ? 18 : 0
  const payout = opportunity?.payoutTiming || { days: null, confidence: 'unknown' }
  const daysLeft = Number.isFinite(request?.daysUntilDeadline) ? request.daysUntilDeadline : null
  let timingScore = 4
  if (daysLeft !== null && payout.days !== null) timingScore = payout.days <= daysLeft ? 10 : 0
  else if (daysLeft !== null && daysLeft <= 3) timingScore = 0
  else if (/\b(tutor|freelance|gig|part.time|commission|project)\b/i.test(title)) timingScore = 7
  const applicationDeadline = applicationDeadlineState(opportunity?.applicationDeadline)
  const deadlinePenalty = applicationDeadline.state === 'past' ? 20 : applicationDeadline.state === 'soon' ? 4 : 0
  const score = Math.max(0, Math.min(100, skillScore + arrangementScore + availabilityScore + locationScore + compensationScore + freshnessScore + requirementsScore + timingScore - deadlinePenalty - experienceMismatchPenalty))
  const reasons = []
  if (skillMatches.length) reasons.push(`Mentions ${skillMatches.slice(0, 4).join(', ')}`)
  if (!hasSkillData) reasons.push('Add skills to improve matching')
  if (request?.workPreference === 'remote' && remoteMention) reasons.push('Explicitly mentions remote or work-from-home work')
  if (Number.isFinite(timePerDay) && flexibleSignals && timePerDay <= 4) reasons.push('Mentions flexible or part-time work that may fit limited daily availability')
  else if (fullTimeSignals && Number.isFinite(timePerDay) && timePerDay < 6) reasons.push('May require more time than your daily availability')
  if (requestedLocation && statedLocation.includes(requestedLocation)) reasons.push('Source location matches your stated area')
  if (opportunity?.advertisedCompensation) reasons.push('Advertised pay details were found in the source text')
  if (experienceMismatchPenalty) reasons.push('This role mentions senior-level or extensive experience; it may not fit the beginner experience you described')
  if (applicationDeadline.state === 'past') reasons.push('The application deadline appears to have passed; confirm the listing is still open')
  else if (applicationDeadline.state === 'soon') reasons.push('The application deadline appears to be within the next two days')
  if (payout.confidence === 'explicit' && daysLeft !== null && payout.days !== null) {
    reasons.push(payout.days <= daysLeft ? 'Stated payout window is within your goal deadline; selection and work completion are still uncertain' : 'Stated payout window appears later than your goal deadline')
  } else {
    reasons.push('Payout timing is not confirmed, so it cannot count as reliable money by your deadline')
  }
  return { score, reasons, skillMatches }
}

export function assessDeadlineFeasibility({ request, opportunity }) {
  const deadlineDays = Number(request?.daysUntilDeadline)
  const payout = opportunity?.payoutTiming || { days: null, confidence: 'unknown' }
  if (!Number.isFinite(deadlineDays)) return { status: 'unknown', label: 'Deadline not assessed', explanation: 'A goal deadline was not available.' }
  const shortDeadline = deadlineDays <= 2
  const applicationDeadline = applicationDeadlineState(opportunity?.applicationDeadline)
  if (applicationDeadline.state === 'past') {
    return { status: 'unlikely', label: 'Application deadline may have passed', explanation: 'The source lists an application deadline before today. Confirm the original page is still accepting applications before spending time on it.' }
  }
  if (payout.days !== null && payout.confidence === 'explicit') {
    if (payout.days <= deadlineDays && deadlineDays > 0 && !/\b(intern|full[- ]time|recruitment|graduate program)\b/i.test(opportunity?.title || '')) {
      return { status: 'possible_not_guaranteed', label: 'Could fit the timeline', explanation: `The source states a payout window of about ${payout.days} day(s), within the ${deadlineDays}-day goal window. Selection, completion and actual payment are not guaranteed.` }
    }
    const reasons = payout.days > deadlineDays
      ? `The stated payout window is about ${payout.days} day(s), longer than the ${deadlineDays}-day goal window.`
      : 'Although the stated payout window falls within the date range, this type of role may involve selection or recruitment stages before any payment.'
    return { status: 'unlikely', label: 'Unlikely before your deadline', explanation: reasons }
  }
  if (shortDeadline) return { status: 'unlikely', label: 'Unlikely before your deadline', explanation: 'With very little time left and no explicit fast payout terms, do not rely on this opportunity for the deadline.' }
  if (/\b(intern(ship)?|full[- ]time|graduate program|hiring process|recruitment)\b/i.test(opportunity?.title || '')) {
    return { status: 'unlikely', label: 'Unlikely before your deadline', explanation: 'Hiring steps and first payroll commonly take time; the source does not confirm payment before your deadline.' }
  }
  return { status: 'unknown', label: 'Payment timing unknown', explanation: 'The source does not state a reliable payout date. Treat this as an option to pursue, not income available by your deadline.' }
}

export function buildEarningPlan({ request, opportunities = [] }) {
  const goal = Number(request?.goalAmount) || 0
  const sorted = [...opportunities].sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0))
  const possible = sorted.filter((op) => op.feasibility?.status === 'possible_not_guaranteed')
  const unknown = sorted.filter((op) => op.feasibility?.status === 'unknown')
  const unlikely = sorted.filter((op) => op.feasibility?.status === 'unlikely')
  const shortfall = goal // live feature never counts advertised potential as money already received.
  const steps = []
  if (possible.length) steps.push('Prioritise the options with a stated payout window that falls within your deadline, while checking the original terms before committing.')
  if (unknown.length) steps.push('Ask each client/employer when payment is actually released and whether selection, acceptance, or a platform hold delays payout.')
  if (sorted.length > 1) steps.push('Pursue more than one suitable option so your plan does not depend on a single selection decision.')
  if (!sorted.length) steps.push('Broaden the skill keywords or work preferences, and try direct local tutoring/service leads or official employer career pages. No suitable live results were confirmed in this search.')
  return {
    goalAmount: goal,
    remainingShortfall: shortfall,
    possibleBeforeDeadline: possible.length,
    paymentTimingUnknown: unknown.length,
    unlikelyBeforeDeadline: unlikely.length,
    steps,
    note: 'Advertised compensation is not guaranteed income and is not subtracted from your goal shortfall. Only count money once it has actually been received.',
  }
}
