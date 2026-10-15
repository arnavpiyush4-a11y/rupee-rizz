import { isIP } from 'node:net'
import {
  calculateOpportunityMatch,
  assessDeadlineFeasibility,
  buildEarningPlan,
  inferPayoutTiming,
  parseAdvertisedCompensation,
  screenOpportunityText,
} from './earnRadarRules.js'

const SEARCH_ENDPOINT = 'https://api.search.tinyfish.ai'
const FETCH_ENDPOINT = 'https://api.fetch.tinyfish.ai'
const MAX_SKILLS = 12
const MAX_SEARCH_RESULTS_TO_FETCH = 8
const MAX_SEARCH_QUERIES = 6
const MAX_DISCOVERY_PAGES = 3
const MAX_DISCOVERED_LISTING_URLS = 8
const FETCH_TIMEOUT_MS = 25000
const SEARCH_TIMEOUT_MS = 15000

function cleanString(value, max = 120) {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : ''
}

export function validateEarnRadarRequest(body, profile = {}) {
  const errors = []
  const goalAmount = Number(body?.goalAmount)
  if (!Number.isFinite(goalAmount) || goalAmount < 100 || goalAmount > 10000000) errors.push('Enter a goal between ₹100 and ₹1,00,00,000.')

  const deadline = cleanString(body?.deadline, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? new Date(`${deadline}T23:59:59.999Z`) : null
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== deadline) errors.push('Choose a valid goal deadline.')
  // This feature targets INR earning opportunities, so evaluate date-only deadlines
  // against the Indian calendar day rather than the server's UTC date.
  const todayIndia = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)
  if (deadline && deadline < todayIndia) errors.push('The goal deadline must be today or later in India.')
  const deadlineDay = date ? Date.parse(`${deadline}T00:00:00.000Z`) : NaN
  const todayDay = Date.parse(`${todayIndia}T00:00:00.000Z`)
  if (Number.isFinite(deadlineDay) && deadlineDay - todayDay > 366 * 24 * 60 * 60 * 1000) errors.push('Choose a deadline within the next 12 months.')

  const rawSkills = Array.isArray(body?.skills) ? body.skills.slice(0, 100) : typeof body?.skills === 'string' ? body.skills.split(/[\n,;]+/).slice(0, 100) : []
  const skills = [...new Set(rawSkills.map((s) => cleanString(s, 60)).filter(Boolean))].slice(0, MAX_SKILLS)
  const timePerDay = Number(body?.timePerDay)
  if (!Number.isFinite(timePerDay) || timePerDay < 0.5 || timePerDay > 16) errors.push('Choose daily availability between 0.5 and 16 hours.')
  const workPreference = ['remote', 'onsite', 'hybrid', 'any'].includes(body?.workPreference) ? body.workPreference : 'remote'
  const categoriesAllowed = new Set(['freelance', 'tutoring', 'internships', 'part_time', 'gigs', 'business'])
  const categories = Array.isArray(body?.categories) ? [...new Set(body.categories.slice(0, 20).filter((c) => categoriesAllowed.has(c)))] : []
  const minCompensation = body?.minCompensation === '' || body?.minCompensation == null ? null : Number(body.minCompensation)
  if (minCompensation !== null && (!Number.isFinite(minCompensation) || minCompensation < 0 || minCompensation > 100000000)) errors.push('Minimum compensation must be a valid non-negative amount.')

  if (errors.length) return { ok: false, errors }
  const daysUntilDeadline = Math.max(0, Math.round((Date.parse(`${deadline}T00:00:00.000Z`) - Date.parse(`${todayIndia}T00:00:00.000Z`)) / (24 * 60 * 60 * 1000)))
  return {
    ok: true,
    value: {
      goalAmount: Math.round(goalAmount),
      deadline,
      daysUntilDeadline,
      skills,
      experience: cleanString(body?.experience, 240),
      timePerDay,
      location: cleanString(body?.location, 100),
      workPreference,
      categories: categories.length ? categories : ['freelance', 'tutoring', 'internships'],
      minCompensation: minCompensation === null ? null : Math.round(minCompensation),
      profileType: ['student', 'micro_entrepreneur'].includes(profile?.user_type) ? profile.user_type : (body?.profileType === 'micro_entrepreneur' ? 'micro_entrepreneur' : 'student'),
    },
  }
}

export function buildEarnRadarQueries(request) {
  const skills = (Array.isArray(request?.skills) ? request.skills : [])
    .map((skill) => cleanString(skill, 45))
    .filter(Boolean)
    .slice(0, 4)
  // Keep the query itself short and discoverable. Put the user's wider context
  // into TinyFish's purpose field instead of requiring every constraint to match
  // the same search-result snippet.
  const skillText = skills.length ? skills.join(' ') : 'beginner entry-level skills'
  const remote = request?.workPreference === 'remote'
  const location = cleanString(request?.location, 70)
  const locationText = remote ? 'remote India' : location || 'India'
  const categorySearches = {
    freelance: 'individual freelance project client brief fixed price budget apply',
    tutoring: 'individual tutor wanted teaching assignment paid hourly apply',
    internships: 'individual paid internship opening stipend fresher apply',
    part_time: 'individual part-time job flexible paid hours employer apply',
    gigs: 'individual short-term paid gig task assignment payment apply',
    business: 'individual customer seeking service provider paid contract lead',
  }
  const categories = [...new Set(Array.isArray(request?.categories) ? request.categories : [])]
    .filter((category) => categorySearches[category])
    .slice(0, MAX_SEARCH_QUERIES)
  const selected = categories.length ? categories : ['freelance', 'tutoring', 'internships']
  const queries = selected.map((category) => cleanString(
    `${skillText} ${categorySearches[category]} ${locationText}`,
    260,
  ))
  return [...new Set(queries.filter(Boolean))].slice(0, MAX_SEARCH_QUERIES)
}

function buildSearchPurpose(request) {
  const skills = (Array.isArray(request?.skills) ? request.skills : []).slice(0, 8).join(', ') || 'entry-level skills'
  const categories = (Array.isArray(request?.categories) ? request.categories : []).join(', ') || 'freelance, tutoring, internships'
  const place = cleanString(request?.location, 70) || 'India'
  const work = request?.workPreference || 'any arrangement'
  const experience = cleanString(request?.experience, 100) || 'not specified'
  return cleanString(
    `Find current public earning opportunities for a user with skills: ${skills}. Experience: ${experience}. ` +
    `Preferred categories: ${categories}. Location: ${place}; work preference: ${work}; availability: ${request?.timePerDay || 'not stated'} hours per day. ` +
    `Goal: INR ${request?.goalAmount || 'not stated'} by ${request?.deadline || 'not stated'} (${request?.daysUntilDeadline ?? 'unknown'} days). ` +
    `Prefer original individual job, internship, tutoring, freelance project, or paid gig detail pages. If search surfaces a relevant directory/category page that contains individual opportunities, it may be inspected for direct listing links, but never count the directory itself as a job. Do not infer pay, eligibility, availability, or payout timing absent from source evidence.`,
    1800,
  )
}

export function normalizePublicHttpUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  const value = raw.trim()
  if (!value) return null
  // Accept plain hostnames from search results, but never reinterpret another
  // scheme (for example ftp:, javascript:, or file:) as an HTTPS hostname.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return null
  const candidate = /^https?:\/\//i.test(value) ? value : value.startsWith('//') ? `https:${value}` : `https://${value}`
  let parsed
  try { parsed = new URL(candidate) } catch { return null }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
  if (parsed.port && !((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443'))) return null
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null
  if (hostname === '0.0.0.0' || hostname === '::' || hostname === '::1' || hostname.startsWith('127.') || hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('169.254.') || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return null
  if (isIP(hostname)) return null
  parsed.hash = ''
  parsed.hostname = parsed.hostname.toLowerCase()
  const trackingKeys = [...parsed.searchParams.keys()].filter((key) => /^(?:utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid|ref_src|trk|trackingid)$/i.test(key))
  for (const key of trackingKeys) parsed.searchParams.delete(key)
  parsed.searchParams.sort()
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString()
}

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch {
    if (!response.ok) return {} // Preserve the upstream HTTP status even when its error body is not JSON.
    throw new Error('TinyFish returned a malformed JSON response.')
  }
}

async function tinyfishSearch(query, apiKey, signal, purpose = 'Find individual public earning opportunities and original listing detail pages.') {
  const url = new URL(SEARCH_ENDPOINT)
  url.searchParams.set('query', query)
  url.searchParams.set('location', 'IN')
  url.searchParams.set('language', 'en')
  url.searchParams.set('purpose', purpose)
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const error = new Error(response.status === 429 ? 'TinyFish search is rate limited. Wait a minute and retry.' : `TinyFish search returned HTTP ${response.status}.`)
    error.upstreamStatus = response.status
    error.status = response.status === 429 ? 429 : 502
    error.code = response.status === 429 ? 'tinyfish_rate_limited' : 'tinyfish_search_failed'
    throw error
  }
  if (!Array.isArray(payload?.results)) throw new Error('TinyFish search response did not contain a results array.')
  return payload
}

async function tinyfishFetch(urls, apiKey, signal, { includeLinks = false } = {}) {
  const response = await fetch(FETCH_ENDPOINT, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ urls: urls.slice(0, 10), format: 'markdown', links: includeLinks, purpose: includeLinks ? 'Inspect this job or freelance directory for direct links to individual public job, internship, tutoring, or paid project detail pages. Return extracted page text and links; do not treat the directory itself as a job.' : 'Extract evidence for the individual job or project at these public URLs: title, employer/client, stated compensation and payment basis, requirements, posting date, application deadline, and payout timing. Return only details stated on the page.', per_url_timeout_ms: 20000 }),
    cache: 'no-store',
    signal,
  })
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const error = new Error(response.status === 429 ? 'TinyFish fetch is rate limited. Wait a minute and retry.' : `TinyFish fetch returned HTTP ${response.status}.`)
    error.upstreamStatus = response.status
    error.status = response.status === 429 ? 429 : 502
    error.code = response.status === 429 ? 'tinyfish_rate_limited' : 'tinyfish_fetch_failed'
    throw error
  }
  if (!Array.isArray(payload?.results) && !Array.isArray(payload?.errors)) throw new Error('TinyFish fetch response had an unexpected shape.')
  return payload
}

function firstMatchingLine(text, labels) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*#>]+\s*)/, '').trim()).filter(Boolean)
  const wanted = new RegExp(`(?:${labels})`, 'i')
  const line = lines.find((item) => wanted.test(item) && item.length > 12 && item.length < 260)
  return line ? line.slice(0, 240) : null
}

function extractRequirements(text) {
  return firstMatchingLine(text, 'requirements?|qualifications?|eligibility|skills required|what you.?ll need|who can apply|must have|preferred skills')
}

function extractDeadline(text) {
  const match = /(?:apply by|application deadline|last date to apply|applications close|deadline\s*[:\-]?)\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(String(text || ''))
  return match?.[1] || null
}

function extractEmployer(text) {
  const explicit = /(?:company|employer|organisation|organization|client)\s*[:\-]\s*([^\n|]{2,80})/i.exec(String(text || ''))
  if (explicit?.[1]) return explicit[1].trim().replace(/[*_`]/g, '').slice(0, 80)
  return null
}

function extractLocation(text) {
  const explicit = /^(?:job\s+|work\s+)?location\s*[:\-]\s*([^\n|]{2,100})/im.exec(String(text || ''))
  if (explicit?.[1]) return explicit[1].trim().replace(/[*_`]/g, '').slice(0, 100)
  const based = /\b(?:based in|located in|work from)\s+([A-Z][A-Za-z .'-]{2,60})(?=[,.;\n]|$)/.exec(String(text || ''))
  return based?.[1]?.trim() || null
}

const GENERIC_TITLE_PATTERNS = [
  /^\s*\d[\d,]*\s+.*\b(?:job vacancies|vacancies|job listings|job openings|positions available)\b/i,
  /^\s*(?:best|top|how to|guide to|what is|review of|comparison of|ranked|ranking|career advice|salary guide)\b/i,
  /\b\d+\s+(?:ai\s+)?(?:freelance\s+)?platforms?\s+(?:ranked|reviewed|compared)\b/i,
  /\bfreelance jobs\s*(?:[:|–—-]|$)/i,
  /\bjobs?\s+for\s+(?:october|november|december|january|february|march|april|may|june|july|august|september)\b/i,
  /^\s*(?:all jobs|search jobs|browse jobs|find jobs|job search|job vacancies|job listings)\b/i,
  /\b(?:job market report|freelance platforms ranked|top earning platforms)\b/i,
]
const INDIVIDUAL_ROLE_OR_PROJECT = /\b(?:intern(?:ship)?|developer|engineer|tutor|teacher|instructor|assistant|associate|analyst|designer|writer|editor|manager|consultant|contractor|researcher|tester|technician|coach|executive|sales|support|data entry|virtual assistant|project|paid assignment|short[- ]term gig|part[- ]time|customer support|bookkeeper|accountant|translator|transcriber|photographer|video editor|web designer|mobile app|website|automation script|api integration|dashboard|excel automation|client brief|bug fix|landing page|build|create|develop|debug|translate|teach)\b/i
const LISTING_EVIDENCE = /\b(?:apply(?: now| by| here)?|application deadline|applications close|job type|posted\s+(?:on|\d|\d+\s)|stipend|salary|paid|payment terms|hourly rate|project budget|fixed[- ]price|contract|responsibilities|qualifications|requirements|eligibility|client is looking|hiring|we are looking for|looking for a|role overview|position summary|deliverables|proposal|per hour|per project|compensation)\b/i

function urlIsGenericResource(rawUrl) {
  try {
    const url = new URL(rawUrl)
    const path = url.pathname.toLowerCase().replace(/\/+$/, '') || '/'
    if (/(?:^|\/)(?:blog|articles?|career-advice|salary-guide|rankings?|login|signin|sign-in|auth|authwall|oauth)(?:\/|$)/i.test(path)) return true
    if (/^\/(?:search|browse|jobs?|careers?|opportunities|freelance-jobs|remote-jobs|job-vacancies|job-listings|category|categories)$/.test(path)) return true
    if (/^\/(?:jobs?|job-vacancies|job-listings)-in-[a-z0-9-]+$/.test(path)) return true
    if (/(?:^|\/)(?:[a-z0-9-]+-)?(?:jobs|vacancies|openings)(?:-in-[a-z0-9-]+)?(?:\.html)?$/.test(path)) return true
    if ([...url.searchParams.keys()].some((key) => /^(?:q|query|keywords|search|jobtitle)$/i.test(key)) && /\b(?:jobs?|search|browse|opportunities)\b/i.test(path)) return true
  } catch { return true }
  return false
}

function isGenericTitle(title) {
  const value = String(title || '').replace(/\s+/g, ' ').trim()
  return !value || GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(value))
}

// Fetch can return a short login wall, bot challenge, or HTTP error page as text.
// That is not a successful extraction of listing details, even if the result URL was public.
function pageLooksAccessRestricted(page) {
  if (!page || typeof page !== 'object') return false
  const title = String(page.title || '').slice(0, 300)
  const description = String(page.description || '').slice(0, 500)
  const text = String(page.text || '').slice(0, 2200)
  const titleSignals = /\b(?:access denied|403 forbidden|401 unauthorized|page not found|request blocked|security check|robot check|captcha|verify you are human|verify your identity|sign in to continue|log in to continue|login required|temporarily unavailable)\b/i
  if (titleSignals.test(title)) return true
  const contentSignals = /\b(?:access denied|403 forbidden|401 unauthorized|request blocked|unusual traffic detected|verify you are human|complete the captcha|robot check|enable javascript to continue|please sign in to continue|login required|automated requests are not allowed|too many requests)\b/i
  const head = `${title}\n${description}\n${text.slice(0, 650)}`
  // Do not treat a normal detail page as blocked merely because its footer says
  // users must sign in to apply. The body signal is only decisive for short walls.
  return text.trim().length < 1800 && contentSignals.test(head)
}

export function classifyOpportunityCandidate({ result = {}, page = null } = {}) {
  const url = normalizePublicHttpUrl(result?.url || page?.url || page?.final_url)
  const titles = [page?.title, result?.title].map((value) => String(value || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  const title = titles.find((value) => !isGenericTitle(value) && INDIVIDUAL_ROLE_OR_PROJECT.test(value)) || titles.find((value) => !isGenericTitle(value)) || titles[0] || ''
  if (!url) return { qualifies: false, type: 'unusable_result', reason: 'Missing or unsafe source URL.', title }
  if (urlIsGenericResource(url)) return { qualifies: false, type: 'resource_page', reason: 'The URL is a search, category, authentication, or resource page rather than an individual listing.', title }
  if (titles.some(isGenericTitle) && !titles.some((value) => !isGenericTitle(value) && INDIVIDUAL_ROLE_OR_PROJECT.test(value))) {
    return { qualifies: false, type: 'resource_page', reason: 'The title looks like a category page, job-count page, ranking, or informational article.', title }
  }
  if (!INDIVIDUAL_ROLE_OR_PROJECT.test(title)) {
    return { qualifies: false, type: 'unconfirmed_result', reason: 'No specific role, assignment, or service project was identifiable.', title }
  }
  const resultEvidence = `${result?.title || ''}\n${result?.snippet || ''}`
  const pageUrl = normalizePublicHttpUrl(page?.final_url || page?.url || '')
  const pageText = `${page?.title || ''}\n${page?.description || ''}\n${String(page?.text || '').slice(0, 12000)}`
  const pageIsExtracted = Boolean(page && typeof page.text === 'string' && page.text.trim().length > 40 && pageUrl && !urlIsGenericResource(pageUrl) && !pageLooksAccessRestricted(page))
  const pageHasListingEvidence = pageIsExtracted && LISTING_EVIDENCE.test(pageText)
  const snippetHasListingEvidence = LISTING_EVIDENCE.test(resultEvidence)
  if (!pageHasListingEvidence && !snippetHasListingEvidence) {
    return { qualifies: false, type: 'unconfirmed_result', reason: 'A specific role or project was not supported by listing-specific details.', title }
  }
  const evidenceSource = pageHasListingEvidence ? 'page' : 'snippet'
  return {
    qualifies: true,
    type: 'individual_opportunity',
    reason: pageHasListingEvidence
      ? 'A specific role or project and listing-specific details were found in extracted source text; the listing is not independently verified.'
      : 'A specific role or project is supported by listing-specific search-snippet evidence; page details were not confirmed.',
    title,
    pageIsExtracted,
    pageHasListingEvidence,
    evidenceSource,
    extractionStatus: pageHasListingEvidence ? 'page_text_extracted_not_independently_verified' : 'snippet_only_not_independently_verified',
  }
}

function candidatePriority(result) {
  const url = normalizePublicHttpUrl(result?.url)
  if (!url || urlIsGenericResource(url)) return -100
  const title = String(result?.title || '')
  if (isGenericTitle(title)) return -100
  let score = 0
  if (INDIVIDUAL_ROLE_OR_PROJECT.test(title)) score += 3
  if (LISTING_EVIDENCE.test(`${title}\n${result?.snippet || ''}`)) score += 4
  if (/\b(?:salary|stipend|paid|budget|per hour|fixed price|project brief|apply by)\b/i.test(`${title} ${result?.snippet || ''}`)) score += 2
  return score
}

function normalizeOpportunity(result, page, request) {
  const url = normalizePublicHttpUrl(result?.url || page?.url || page?.final_url)
  if (!url) return null
  const classification = classifyOpportunityCandidate({ result: { ...result, url }, page })
  if (!classification.qualifies) return null
  const pageText = classification.pageHasListingEvidence && typeof page?.text === 'string' ? page.text.slice(0, 18000) : ''
  const title = String(classification.title || page?.title || result?.title || 'Earning opportunity').replace(/\s+/g, ' ').trim().slice(0, 180)
  const descriptionSource = classification.pageHasListingEvidence ? (page?.description || result?.snippet || '') : (result?.snippet || '')
  const description = String(descriptionSource).replace(/\s+/g, ' ').trim().slice(0, 600)
  const evidenceText = [title, description, pageText].filter(Boolean).join('\n')
  const compensation = parseAdvertisedCompensation(evidenceText)
  const postingDate = page?.published_date || result?.date || null
  const requirements = extractRequirements(pageText) || extractRequirements(description) || null
  const payoutTiming = inferPayoutTiming(evidenceText)
  const screening = screenOpportunityText(evidenceText)
  const opportunity = {
    title,
    url,
    listingType: 'individual_opportunity',
    discoveryStatus: 'search_result_discovered',
    listingStatus: 'individual_opportunity_identified',
    pageExtractionStatus: classification.pageIsExtracted ? 'page_text_extracted' : 'extraction_unavailable_or_access_restricted',
    detailsStatus: classification.evidenceSource === 'page' ? 'details_extracted_from_source_not_independently_verified' : 'search_snippet_evidence_only_not_independently_verified',
    independentlyVerified: false,
    listingClassificationReason: classification.reason,
    extractionStatus: classification.extractionStatus,
    employer: extractEmployer(`${description}\n${pageText.slice(0, 4000)}`),
    source: String(result?.site_name || new URL(url).hostname.replace(/^www\./, '')).slice(0, 120),
    description: description || (pageText ? pageText.replace(/\s+/g, ' ').slice(0, 420) : 'Open the original listing for details; extraction did not return a useful summary.'),
    advertisedCompensation: compensation?.display || null,
    compensation,
    location: /\b(remote|work from home|WFH|anywhere)\b/i.test(evidenceText) ? 'Remote mentioned in source' : (extractLocation(`${description}\n${pageText}`) || 'Not stated in source'),
    workArrangement: /\b(remote|work from home|WFH|anywhere)\b/i.test(evidenceText) ? 'remote' : /\bhybrid\b/i.test(evidenceText) ? 'hybrid' : /\b(on[- ]site|in[- ]office|field work)\b/i.test(evidenceText) ? 'onsite' : 'not_stated',
    requirements,
    postingDate,
    applicationDeadline: extractDeadline(evidenceText),
    payoutTiming,
    screening,
    sourceExtracted: classification.pageHasListingEvidence,
    sourceExcerpt: pageText ? pageText.slice(0, 1200) : description,
    fetchedAt: pageText ? new Date().toISOString() : null,
  }
  opportunity.match = calculateOpportunityMatch({ opportunity, request })
  opportunity.feasibility = assessDeadlineFeasibility({ request, opportunity })
  return opportunity
}

function isEditorialDiscoveryResult(result) {
  const title = String(result?.title || '').trim()
  const url = normalizePublicHttpUrl(result?.url)
  if (!url) return true
  const path = new URL(url).pathname.toLowerCase()
  return /(?:^|\/)(?:blog|articles?|career-advice|salary-guide|rankings?|guides?)(?:\/|$)/i.test(path) ||
    /^\s*(?:best|top|how to|guide to|what is|review of|comparison of|ranked|ranking|career advice|salary guide)\b/i.test(title)
}

function discoveryPagePriority(result) {
  const url = normalizePublicHttpUrl(result?.url)
  if (!url || isEditorialDiscoveryResult(result)) return -100
  const title = String(result?.title || '')
  const snippet = String(result?.snippet || '')
  const path = new URL(url).pathname.toLowerCase()
  const jobLike = /(?:job|jobs|vacanc|opening|internship|tutor|teach|freelance|project|opportunit|gig|career)/i.test(`${title} ${path}`)
  if (!jobLike) return -100
  let score = 1
  if (urlIsGenericResource(url)) score += 2
  if (isGenericTitle(title)) score += 2
  if (LISTING_EVIDENCE.test(snippet)) score += 3
  if (/\b(?:required|looking for|seeking|₹|INR|fixed price|posted\s+\d|per hour|budget|deliverables|apply)\b/i.test(snippet)) score += 2
  return score
}

function likelyIndividualListingUrl(rawUrl) {
  const url = normalizePublicHttpUrl(rawUrl)
  if (!url || urlIsGenericResource(url)) return false
  const parsed = new URL(url)
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const path = parsed.pathname.toLowerCase()
  const full = `${host}${path}${parsed.search}`
  return (
    /(?:^|\.)upwork\.com$/.test(host) && /\/jobs\/[^/]*~[a-z0-9]+/i.test(full) ||
    /(?:^|\.)freelancer\.(?:com|in)$/.test(host) && /\/projects\/[^/]+\/\d+/i.test(full) ||
    /(?:^|\.)indeed\.[a-z.]+$/.test(host) && /(?:^|[?&])jk=[a-z0-9]+/i.test(full) ||
    /(?:^|\.)linkedin\.com$/.test(host) && /\/jobs\/view\/\d+/i.test(full) ||
    /(?:^|\.)internshala\.com$/.test(host) && /\/(?:internship|job)\/detail\//i.test(path) ||
    /(?:^|\.)truelancer\.com$/.test(host) && /\/(?:freelance-project|project|job)\/[^/]+(?:\/\d+)?/i.test(path) ||
    /(?:^|\.)peopleperhour\.com$/.test(host) && /\/(?:freelance-jobs|hourlie)\/[^/]+/i.test(path) ||
    /\/(?:job|project|task|gig|listing|opportunity|internship|position)\/[^/?#]+(?:\/\d{3,}|[-_]?\d{5,})(?:\/|$)/i.test(path)
  )
}

function extractLinkedListingCandidates(discoveryResults, pageMap, excludedUrls = new Set()) {
  const candidates = []
  const seen = new Set(excludedUrls)
  for (const result of discoveryResults) {
    const sourceUrl = normalizePublicHttpUrl(result?.url)
    const page = pageMap.get(sourceUrl) || null
    if (!page || pageLooksAccessRestricted(page)) continue
    const text = typeof page.text === 'string' ? page.text : ''
    const links = Array.isArray(page.links) ? page.links : []
    const matches = []
    const markdownLink = /\[([^\]]{1,220})\]\((https?:\/\/[^)\s]+)\)/g
    let match
    while ((match = markdownLink.exec(text))) {
      const rawUrl = match[2].replace(/[.,;]+$/, '')
      const label = match[1].replace(/\s+/g, ' ').trim()
      const start = Math.max(0, match.index - 260)
      const end = Math.min(text.length, match.index + match[0].length + 260)
      const context = text.slice(start, end).replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
      matches.push({ url: rawUrl, title: label, snippet: context })
    }
    // Some pages expose links[] but their cleaned markdown doesn't preserve anchor
    // labels. Only follow known listing-detail URL patterns from that field.
    for (const rawUrl of links) {
      if (likelyIndividualListingUrl(rawUrl)) matches.push({ url: rawUrl, title: '', snippet: '' })
    }
    for (const candidate of matches) {
      const url = normalizePublicHttpUrl(candidate.url)
      if (!url || url === sourceUrl || seen.has(url) || urlIsGenericResource(url)) continue
      const evidence = `${candidate.title}\n${candidate.snippet}`
      const hasRole = INDIVIDUAL_ROLE_OR_PROJECT.test(evidence)
      const hasListingEvidence = LISTING_EVIDENCE.test(evidence) || /\b(?:required|looking for|seeking|fixed price|posted\s+\d|₹|INR|per hour|project budget|apply)\b/i.test(evidence)
      if (!(hasRole && hasListingEvidence) && !likelyIndividualListingUrl(url)) continue
      seen.add(url)
      candidates.push({
        title: candidate.title,
        url,
        snippet: candidate.snippet.slice(0, 900),
        site_name: new URL(url).hostname.replace(/^www\./, ''),
        discoveredFrom: sourceUrl,
      })
      if (candidates.length >= MAX_DISCOVERED_LISTING_URLS) return candidates
    }
  }
  return candidates
}

function makePageMap(fetchPayload) {
  const map = new Map()
  for (const page of (Array.isArray(fetchPayload?.results) ? fetchPayload.results : [])) {
    const finalUrl = normalizePublicHttpUrl(page?.final_url || page?.url)
    const requestedUrl = normalizePublicHttpUrl(page?.url)
    if (finalUrl) map.set(finalUrl, page)
    if (requestedUrl) map.set(requestedUrl, page)
  }
  return map
}

export async function searchEarnRadarOpportunities({ rawRequest, profile, apiKey = process.env.TINYFISH_API_KEY, fetchImpl = fetch, searchTimeoutMs = SEARCH_TIMEOUT_MS, fetchTimeoutMs = FETCH_TIMEOUT_MS }) {
  if (!apiKey) {
    const error = new Error('Earn Radar is not configured yet. Add TINYFISH_API_KEY to the server environment and restart/redeploy the app.')
    error.code = 'tinyfish_not_configured'
    error.status = 503
    throw error
  }

  const validated = validateEarnRadarRequest(rawRequest, profile)
  if (!validated.ok) {
    const error = new Error(validated.errors.join(' '))
    error.code = 'invalid_earn_radar_request'
    error.status = 400
    throw error
  }

  const request = validated.value
  const queries = buildEarnRadarQueries(request)
  const purpose = buildSearchPurpose(request)
  const searchResults = []
  const searchWarnings = []
  const searchFailures = []
  const searchSettled = await Promise.allSettled(queries.map((query) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), searchTimeoutMs)
    return tinyfishSearchWith(fetchImpl, query, apiKey, controller, timeout, purpose)
  }))
  for (let i = 0; i < searchSettled.length; i++) {
    const result = searchSettled[i]
    if (result.status === 'fulfilled') searchResults.push(...result.value.results.map((item) => ({ ...item, query: queries[i] })))
    else {
      searchFailures.push(result.reason)
      searchWarnings.push(result.reason?.message || 'One search query failed.')
    }
  }

  const canonicalCandidates = searchResults
    .map((item) => {
      const url = normalizePublicHttpUrl(item?.url)
      return url ? { ...item, url } : null
    })
    .filter(Boolean)

  const unique = []
  const seen = new Set()
  for (const item of canonicalCandidates.slice().sort((a, b) => candidatePriority(b) - candidatePriority(a))) {
    if (candidatePriority(item) < 0 || seen.has(item.url)) continue
    seen.add(item.url)
    unique.push(item)
    if (unique.length >= MAX_SEARCH_RESULTS_TO_FETCH) break
  }

  // Search APIs often surface a relevant job-board directory even when its
  // snippet mentions a concrete job. Do not count that page as a job, but fetch
  // a small number of likely directories with links=true and extract direct
  // listing URLs for a second, stricter detail-page fetch.
  const discoveryPages = []
  for (const item of canonicalCandidates.slice().sort((a, b) => discoveryPagePriority(b) - discoveryPagePriority(a))) {
    if (discoveryPagePriority(item) < 0 || seen.has(item.url) || discoveryPages.some((entry) => entry.url === item.url)) continue
    discoveryPages.push(item)
    if (discoveryPages.length >= MAX_DISCOVERY_PAGES) break
  }

  const initialDirect = unique.slice(0, MAX_SEARCH_RESULTS_TO_FETCH)
  const discoveryCapacity = Math.max(0, 10 - initialDirect.length)
  const discoveryToFetch = discoveryPages.slice(0, discoveryCapacity)
  if (!initialDirect.length && !discoveryToFetch.length) {
    if (searchWarnings.length && searchResults.length === 0) {
      const primary = searchFailures.find((failure) => failure?.status === 429) || searchFailures[0]
      const error = new Error(primary?.message || searchWarnings[0])
      error.code = primary?.status === 429 ? 'tinyfish_rate_limited' : 'tinyfish_search_failed'
      error.status = primary?.status === 429 ? 429 : 502
      throw error
    }
    const warnings = searchResults.length
      ? [...searchWarnings, 'TinyFish returned results, but none had a usable public URL for listing discovery. No sample listings were substituted.']
      : [...searchWarnings, 'TinyFish search returned no usable public listing URLs. No sample or mock listings were substituted.']
    return {
      source: 'tinyfish', liveSearch: true, liveFetch: false, queryCount: queries.length,
      resultCount: 0, fetchedCount: 0, opportunities: [],
      diagnostics: { rawSearchResults: searchResults.length, directCandidates: 0, discoveryPagesFetched: 0, discoveredListingUrls: 0, fetchedListingPages: 0 },
      plan: buildEarningPlan({ request, opportunities: [] }), warnings,
      requestedGoal: { amount: request.goalAmount, deadline: request.deadline, daysRemaining: request.daysUntilDeadline },
    }
  }

  let firstFetch = { results: [], errors: [] }
  let firstFetchError = null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs)
    try {
      firstFetch = await tinyfishFetchWith(
        fetchImpl,
        [...initialDirect, ...discoveryToFetch].map((item) => item.url),
        apiKey,
        controller,
        timeout,
        { includeLinks: discoveryToFetch.length > 0 },
      )
    } finally { clearTimeout(timeout) }
  } catch (error) {
    firstFetchError = error?.message || 'TinyFish could not extract the selected source pages.'
  }

  const firstPageMap = makePageMap(firstFetch)
  const discoveryPageMap = new Map()
  for (const item of discoveryToFetch) {
    const page = firstPageMap.get(item.url)
    if (page) discoveryPageMap.set(item.url, page)
  }
  const directOpportunities = initialDirect.map((result) => normalizeOpportunity(result, firstPageMap.get(result.url) || null, request)).filter(Boolean)
  const discoveredCandidates = extractLinkedListingCandidates(discoveryToFetch, discoveryPageMap, new Set(initialDirect.map((item) => item.url)))

  let secondFetch = { results: [], errors: [] }
  let secondFetchError = null
  const discoveredToFetch = discoveredCandidates.slice(0, MAX_DISCOVERED_LISTING_URLS)
  if (discoveredToFetch.length) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs)
      try {
        secondFetch = await tinyfishFetchWith(fetchImpl, discoveredToFetch.map((item) => item.url), apiKey, controller, timeout)
      } finally { clearTimeout(timeout) }
    } catch (error) {
      secondFetchError = error?.message || 'TinyFish could not extract discovered listing pages.'
    }
  }

  const secondPageMap = makePageMap(secondFetch)
  const linkedOpportunities = discoveredToFetch.map((result) => normalizeOpportunity(result, secondPageMap.get(result.url) || null, request)).filter(Boolean)
  const combined = [...directOpportunities, ...linkedOpportunities]
  const distinctByUrl = new Map()
  for (const opportunity of combined) {
    const key = normalizePublicHttpUrl(opportunity.url) || opportunity.url
    const existing = distinctByUrl.get(key)
    if (!existing || (opportunity.match?.score || 0) > (existing.match?.score || 0)) distinctByUrl.set(key, opportunity)
  }
  const opportunities = [...distinctByUrl.values()]
    .filter((item) => {
      // The user supplies an INR threshold. Do not compare foreign currencies to INR
      // or reject a range that overlaps the threshold without currency conversion data.
      if (request.minCompensation == null || item.compensation?.currencyCode !== 'INR') return true
      const maximum = item.compensation?.maxAmount
      return !Number.isFinite(maximum) || maximum >= request.minCompensation
    })
    .sort((a, b) => b.match.score - a.match.score)

  const firstFetchErrors = Array.isArray(firstFetch.errors) ? firstFetch.errors.length : 0
  const secondFetchErrors = Array.isArray(secondFetch.errors) ? secondFetch.errors.length : 0
  const fetchError = firstFetchError || secondFetchError
  const warnings = [...searchWarnings]
  if (firstFetchError) warnings.push(`Initial page extraction could not complete: ${firstFetchError}`)
  if (secondFetchError) warnings.push(`Discovered listing extraction could not complete: ${secondFetchError}`)
  if (firstFetchErrors + secondFetchErrors) warnings.push(`${firstFetchErrors + secondFetchErrors} source page(s) could not be extracted. Search snippets and any extracted listing links were retained where available.`)
  if (opportunities.some((item) => !item.sourceExtracted)) warnings.push('Some candidates are supported by listing-specific search snippets only. They are not independently verified; open the original source to confirm the opportunity and terms.')
  if (!opportunities.length) {
    warnings.push(discoveryToFetch.length
      ? `No individual listings qualified after inspecting ${discoveryToFetch.length} discovery page(s); ${discoveredCandidates.length} direct listing link(s) were found. No sample or mock listings were substituted.`
      : 'No suitable listings met the selected filters. No sample or mock listings were substituted.')
  }

  const fetchedCount = (Array.isArray(firstFetch.results) ? firstFetch.results.length : 0) + (Array.isArray(secondFetch.results) ? secondFetch.results.length : 0)
  return {
    source: 'tinyfish',
    liveSearch: true,
    liveFetch: !fetchError && fetchedCount > 0,
    queryCount: queries.length,
    resultCount: opportunities.length,
    fetchedCount,
    opportunities,
    diagnostics: {
      rawSearchResults: searchResults.length,
      directCandidates: initialDirect.length,
      discoveryPagesFetched: discoveryToFetch.length,
      discoveredListingUrls: discoveredCandidates.length,
      fetchedListingPages: Array.isArray(secondFetch.results) ? secondFetch.results.length : 0,
    },
    plan: buildEarningPlan({ request, opportunities }),
    warnings,
    requestedGoal: { amount: request.goalAmount, deadline: request.deadline, daysRemaining: request.daysUntilDeadline },
  }
}

async function tinyfishSearchWith(fetchImpl, query, apiKey, controller, timeout, purpose) {
  try {
    // fetchImpl is injected only for test fixtures; live requests use the built-in fetch.
    if (fetchImpl === fetch) return await tinyfishSearch(query, apiKey, controller.signal, purpose)
    const url = new URL(SEARCH_ENDPOINT)
    url.searchParams.set('query', query)
    url.searchParams.set('location', 'IN')
    url.searchParams.set('language', 'en')
    url.searchParams.set('purpose', purpose || 'Find individual public earning opportunities and original listing detail pages.')
    const res = await fetchImpl(url, { headers: { 'X-API-Key': apiKey, Accept: 'application/json' }, signal: controller.signal })
    const payload = await readJsonResponse(res)
    if (!res.ok) {
      const error = new Error(res.status === 429 ? 'TinyFish search is rate limited. Wait a minute and retry.' : `TinyFish search returned HTTP ${res.status}.`)
      error.status = res.status === 429 ? 429 : 502
      error.code = res.status === 429 ? 'tinyfish_rate_limited' : 'tinyfish_search_failed'
      throw error
    }
    if (!Array.isArray(payload?.results)) throw new Error('TinyFish search response did not contain a results array.')
    return payload
  } finally { clearTimeout(timeout) }
}

async function tinyfishFetchWith(fetchImpl, urls, apiKey, controller, timeout, { includeLinks = false } = {}) {
  try {
    if (fetchImpl === fetch) return await tinyfishFetch(urls, apiKey, controller.signal, { includeLinks })
    const res = await fetchImpl(FETCH_ENDPOINT, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ urls: urls.slice(0, 10), format: 'markdown', links: includeLinks, purpose: includeLinks ? 'Inspect this job or freelance directory for direct links to individual public job, internship, tutoring, or paid project detail pages. Return extracted page text and links; do not treat the directory itself as a job.' : 'Extract evidence for the individual job or project at these public URLs: title, employer/client, stated compensation and payment basis, requirements, posting date, application deadline, and payout timing. Return only details stated on the page.', per_url_timeout_ms: 20000 }),
      signal: controller.signal,
    })
    const payload = await readJsonResponse(res)
    if (!res.ok) {
      const error = new Error(res.status === 429 ? 'TinyFish fetch is rate limited. Wait a minute and retry.' : `TinyFish fetch returned HTTP ${res.status}.`)
      error.status = res.status === 429 ? 429 : 502
      error.code = res.status === 429 ? 'tinyfish_rate_limited' : 'tinyfish_fetch_failed'
      throw error
    }
    if (!Array.isArray(payload?.results) && !Array.isArray(payload?.errors)) throw new Error('TinyFish fetch response had an unexpected shape.')
    return payload
  } finally { clearTimeout(timeout) }
}
