import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assessDeadlineFeasibility,
  buildEarningPlan,
  calculateOpportunityMatch,
  inferPayoutTiming,
  parseAdvertisedCompensation,
  screenOpportunityText,
} from '../lib/earnRadarRules.js'
import { searchEarnRadarOpportunities, validateEarnRadarRequest, normalizePublicHttpUrl, buildEarnRadarQueries, classifyOpportunityCandidate } from '../lib/earnRadarService.js'
import { classifyEarnRadarStorageError, isEarnRadarDuplicateError, isSaveableEarnRadarOpportunity, sanitizeSavedCompensation } from '../lib/earnRadarPersistence.js'
import { readFileSync } from 'node:fs'

const goodRequest = {
  goalAmount: 5000,
  deadline: (() => { const d = new Date(); d.setDate(d.getDate() + 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })(),
  skills: ['Java', 'tutoring'],
  timePerDay: 2,
  location: 'Bhubaneswar',
  workPreference: 'remote',
  categories: ['freelance', 'tutoring'],
  minCompensation: null,
}

test('compensation parsing returns structured, evidence-backed monthly pay', () => {
  const result = parseAdvertisedCompensation('Stipend: ₹8,000 per month for the internship.')
  assert.equal(result.minAmount, 8000)
  assert.equal(result.maxAmount, 8000)
  assert.equal(result.currencyCode, 'INR')
  assert.equal(result.basis, 'monthly')
  assert.match(result.display, /₹8,000 per month/i)
  assert.match(result.evidence, /Stipend: ₹8,000 per month/i)
  assert.equal(result.confidence, 'high')
  assert.equal(parseAdvertisedCompensation('A student needs ₹5,000 by Friday.'), null)
})

test('compensation parser handles supported units, ranges and explicit foreign currencies', () => {
  const hourly = parseAdvertisedCompensation('Rate: ₹500/hour')
  assert.equal(hourly.minAmount, 500)
  assert.equal(hourly.maxAmount, 500)
  assert.equal(hourly.basis, 'hourly')
  const monthly = parseAdvertisedCompensation('INR 5,000 per month')
  assert.equal(monthly.minAmount, 5000)
  assert.equal(monthly.basis, 'monthly')
  const annual = parseAdvertisedCompensation('Salary: ₹6,00,000 p.a.')
  assert.equal(annual.minAmount, 600000)
  assert.equal(annual.basis, 'annual')
  const project = parseAdvertisedCompensation('Project budget: ₹2,000–₹5,000 per project')
  assert.equal(project.minAmount, 2000)
  assert.equal(project.maxAmount, 5000)
  assert.equal(project.basis, 'project_or_task')
  const foreign = parseAdvertisedCompensation('Budget: USD 50-200 per hour')
  assert.equal(foreign.currencyCode, 'USD')
  assert.equal(foreign.minAmount, 50)
  assert.equal(foreign.maxAmount, 200)
  assert.equal(foreign.basis, 'hourly')
  const ambiguousDollar = parseAdvertisedCompensation('The client will pay $300 for this project')
  assert.equal(ambiguousDollar.currencyCode, null)
  assert.match(ambiguousDollar.display, /\$300/)
})

test('compensation parser rejects rating, job-count, review-count and unrelated amounts', () => {
  assert.equal(parseAdvertisedCompensation('Platform rating: Rs 4.9'), null)
  assert.equal(parseAdvertisedCompensation('Rated 4.9 stars by users. No pay details available.'), null)
  assert.equal(parseAdvertisedCompensation('39,000 job vacancies on this website.'), null)
  assert.equal(parseAdvertisedCompensation('12,400 reviews and 3 million page views.'), null)
  assert.equal(parseAdvertisedCompensation('An article says freelancers may earn ₹50,000, but this is not an advertised role.'), null)
  assert.equal(parseAdvertisedCompensation('Rs 4.9'), null)
})

test('compensation parser does not combine unrelated numbers across sentence boundaries', () => {
  const result = parseAdvertisedCompensation('Rating is Rs 4.9. The stipend is INR 12,000 per month.')
  assert.equal(result.minAmount, 12000)
  assert.equal(result.basis, 'monthly')
  assert.match(result.evidence, /stipend is INR 12,000/i)
})

test('payout timing distinguishes explicit terms from missing details', () => {
  assert.equal(inferPayoutTiming('Payment released within 3 business days').days, 3)
  assert.equal(inferPayoutTiming('The salary is paid within 24 hours.').days, 1)
  assert.equal(inferPayoutTiming('Stipend paid monthly').confidence, 'explicit')
  assert.equal(inferPayoutTiming('Apply now and join our team').confidence, 'unknown')
  assert.equal(inferPayoutTiming('Apply within 7 days to be considered for this paid role.').confidence, 'unknown')
  assert.equal(inferPayoutTiming('Payments are released within 5 business days. Apply by Friday.').days, 5)
})

test('fraud screening returns specific warning reasons and a limitation note', () => {
  const result = screenOpportunityText('Pay a registration fee before you start. Send your UPI PIN to confirm your account.')
  assert.equal(result.level, 'caution')
  assert.ok(result.flags.length >= 2)
  assert.match(result.note, /not proof of legitimacy/i)
})

test('match score is deterministic and rewards relevant skill / remote evidence', () => {
  const request = { skills: ['Java', 'tutoring'], workPreference: 'remote', daysUntilDeadline: 12 }
  const opportunity = { title: 'Remote Java Tutor - paid hourly', description: 'Teach Java online', advertisedCompensation: '₹500/hour', postingDate: '2026-10-10', requirements: 'Java skills required', payoutTiming: { days: 3, confidence: 'explicit' } }
  const first = calculateOpportunityMatch({ opportunity, request })
  const second = calculateOpportunityMatch({ opportunity, request })
  assert.deepEqual(first, second)
  assert.ok(first.score >= 60)
  assert.ok(first.reasons.some((reason) => /Java/i.test(reason)))
})

test('explicit beginner experience receives an explainable penalty for senior roles', () => {
  const base = { description: 'Remote role. Paid hourly. Requirements: Python.' }
  const opportunity = { ...base, title: 'Senior Python Developer', advertisedCompensation: '₹500/hour', requirements: '5+ years of experience required' }
  const beginner = calculateOpportunityMatch({ opportunity, request: { skills: ['Python'], experience: 'beginner, class projects', workPreference: 'remote', daysUntilDeadline: 12 } })
  const experienced = calculateOpportunityMatch({ opportunity, request: { skills: ['Python'], experience: '5 years of Python development', workPreference: 'remote', daysUntilDeadline: 12 } })
  assert.ok(beginner.score < experienced.score)
  assert.ok(beginner.reasons.some((reason) => /may not fit the beginner experience/i.test(reason)))
})

test('old listing dates receive a lower freshness contribution than recent dates', () => {
  const request = { skills: ['Java'], workPreference: 'remote', daysUntilDeadline: 12 }
  const base = { title: 'Remote Java tutor', description: 'Paid flexible tutoring', advertisedCompensation: '₹500/hour', requirements: 'Java' }
  const recent = calculateOpportunityMatch({ opportunity: { ...base, postingDate: new Date(Date.now() - 2 * 86400000).toISOString() }, request })
  const old = calculateOpportunityMatch({ opportunity: { ...base, postingDate: new Date(Date.now() - 120 * 86400000).toISOString() }, request })
  assert.ok(recent.score > old.score)
})

test('expired application deadlines reduce the match and warn that a listing may be closed', () => {
  const request = { skills: ['Java'], workPreference: 'remote', daysUntilDeadline: 12 }
  const base = { title: 'Remote Java tutor', description: 'Paid flexible tutoring', advertisedCompensation: '₹500/hour', requirements: 'Java', payoutTiming: { days: 3, confidence: 'explicit' } }
  const expired = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10)
  const fresh = calculateOpportunityMatch({ opportunity: { ...base, applicationDeadline: expired }, request })
  const current = calculateOpportunityMatch({ opportunity: base, request })
  assert.ok(fresh.score < current.score)
  assert.ok(fresh.reasons.some((reason) => /deadline appears to have passed/i.test(reason)))
  assert.equal(assessDeadlineFeasibility({ request, opportunity: { ...base, applicationDeadline: expired } }).status, 'unlikely')
})

test('deadline assessment never calls advertised pay guaranteed money', () => {
  const request = { daysUntilDeadline: 2 }
  const opportunity = { title: 'Full-time intern', payoutTiming: { days: null, confidence: 'unknown' } }
  const result = assessDeadlineFeasibility({ request, opportunity })
  assert.equal(result.status, 'unlikely')
  assert.match(result.explanation, /do not rely/i)
  const plan = buildEarningPlan({ request: { goalAmount: 5000 }, opportunities: [{ match: { score: 90 }, feasibility: { status: 'unknown' } }] })
  assert.equal(plan.remainingShortfall, 5000)
  assert.match(plan.note, /not guaranteed income/i)
})

test('request validation rejects invalid amounts and contradictory dates', () => {
  assert.equal(validateEarnRadarRequest({ ...goodRequest, goalAmount: -1 }).ok, false)
  assert.equal(validateEarnRadarRequest({ ...goodRequest, deadline: 'not-a-date' }).ok, false)
  assert.equal(validateEarnRadarRequest(goodRequest, { user_type: 'micro_entrepreneur' }).value.profileType, 'micro_entrepreneur')
})

test('queries stay concise while search purpose carries goal, deadline, availability, location and categories', () => {
  const validation = validateEarnRadarRequest({ ...goodRequest, experience: 'beginner, class projects' }, { user_type: 'student' })
  const queries = buildEarnRadarQueries(validation.value)
  assert.equal(queries.length, 2)
  assert.ok(queries.every((query) => query.length < 260))
  assert.ok(queries.every((query) => query.includes('Java')))
  assert.ok(queries.some((query) => /tutor wanted|teaching assignment/i.test(query)))
  assert.ok(queries.some((query) => /freelance project|client brief/i.test(query)))
  const allCategories = buildEarnRadarQueries({ ...validation.value, categories: ['freelance', 'tutoring', 'internships', 'part_time', 'gigs', 'business'] })
  assert.equal(allCategories.length, 6, 'all selected categories should be searched within the bounded request cap')
})

test('category pages and articles are excluded, while a specific listing must have listing evidence', () => {
  const generic = classifyOpportunityCandidate({ result: { title: '39,000 Online Teaching Java Python Job Vacancies | Indeed', url: 'https://www.indeed.com/jobs?q=python', snippet: 'Search job openings by skill.' } })
  assert.equal(generic.qualifies, false)
  assert.equal(generic.type, 'resource_page')
  const article = classifyOpportunityCandidate({ result: { title: '9 AI Freelance Platforms Ranked: Where to Actually Earn $50–200/Hour', url: 'https://example.com/blog/platform-ranking', snippet: 'A comparison of websites.' } })
  assert.equal(article.qualifies, false)
  const weak = classifyOpportunityCandidate({ result: { title: 'Java Developer', url: 'https://example.com/listing/23', snippet: 'Java jobs and skills.' } })
  assert.equal(weak.qualifies, false)
  const individual = classifyOpportunityCandidate({ result: { title: 'Remote Java Tutor at Acme', url: 'https://example.com/listing/23', snippet: 'Paid listing. Apply by Friday. Teach beginner Java remotely.' } })
  assert.equal(individual.qualifies, true)
  assert.equal(individual.type, 'individual_opportunity')
  assert.match(individual.extractionStatus, /snippet_only_not_independently_verified/)
  const blockedPage = classifyOpportunityCandidate({
    result: { title: 'Remote Java Tutor at Acme', url: 'https://example.com/listing/23', snippet: 'Paid listing. Apply by Friday. Teach beginner Java remotely.' },
    page: { url: 'https://example.com/listing/23', final_url: 'https://example.com/listing/23', title: 'Access Denied', text: 'Access denied. Verify you are human before continuing.' },
  })
  assert.equal(blockedPage.qualifies, true, 'a specific listing snippet can still support discovery')
  assert.equal(blockedPage.pageIsExtracted, false, 'an access wall must not count as page extraction')
  assert.equal(blockedPage.pageHasListingEvidence, false)
  assert.equal(blockedPage.evidenceSource, 'snippet')
})

test('Supabase storage errors distinguish missing migration from permission and infrastructure errors', () => {
  assert.equal(classifyEarnRadarStorageError({ code: '42P01', message: 'relation public.earn_radar_saved does not exist' }).code, 'earn_radar_migration_required')
  assert.equal(classifyEarnRadarStorageError({ code: 'PGRST205', message: "Could not find the table 'public.earn_radar_saved' in the schema cache" }).code, 'earn_radar_migration_required')
  assert.equal(classifyEarnRadarStorageError({ code: '42501', message: 'new row violates row-level security policy' }).code, 'earn_radar_storage_permission_denied')
  assert.equal(classifyEarnRadarStorageError({ code: 'ECONNRESET', message: 'socket hang up' }).code, 'earn_radar_storage_unavailable')
  assert.equal(isEarnRadarDuplicateError({ code: '23505' }), true)
  assert.equal(isEarnRadarDuplicateError({ code: '42P01' }), false)
})

test('saved compensation is validated before being persisted', () => {
  const clean = sanitizeSavedCompensation({ minAmount: 2000, maxAmount: 5000, currencyCode: 'INR', currency: 'INR', basis: 'project_or_task', display: '₹2,000–₹5,000 per project', evidence: 'Budget: ₹2,000–₹5,000 per project', confidence: 'high' })
  assert.equal(clean.minAmount, 2000)
  assert.equal(clean.maxAmount, 5000)
  assert.equal(clean.validationStatus, 'stated_compensation_context')
  assert.equal(sanitizeSavedCompensation({ minAmount: -20, maxAmount: 10, currencyCode: 'INR' }), null)
})

test('persistence accepts only explicitly qualified individual listing candidates', () => {
  assert.equal(isSaveableEarnRadarOpportunity({ url: 'https://example.com/jobs', listingType: 'resource_page', listingStatus: 'unconfirmed', independentlyVerified: false }), false)
  assert.equal(isSaveableEarnRadarOpportunity({ url: 'https://example.com/job/1', listingType: 'individual_opportunity', listingStatus: 'individual_opportunity_identified', independentlyVerified: false }), true)
  assert.equal(isSaveableEarnRadarOpportunity({ url: 'https://example.com/job/1', listingType: 'individual_opportunity', listingStatus: 'individual_opportunity_identified', independentlyVerified: true }), false)
})

test('migration enforces per-user ownership and unique URL saves', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0002_earn_radar.sql', import.meta.url), 'utf8')
  assert.match(sql, /unique\s*\(user_id,\s*source_url\)/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /using \(user_id = \(select auth\.uid\(\)\)\)/i)
  assert.match(sql, /with check \(user_id = \(select auth\.uid\(\)\)\)/i)
  assert.match(sql, /revoke all on table public\.earn_radar_saved from anon, public/i)
})

test('public URL normalizer rejects localhost, unsafe ports and credentials', () => {
  assert.equal(normalizePublicHttpUrl('http://localhost:3000/admin'), null)
  assert.equal(normalizePublicHttpUrl('https://example.com:444/path'), null)
  assert.equal(normalizePublicHttpUrl('ftp://example.com/jobs/1'), null)
  assert.equal(normalizePublicHttpUrl('javascript:alert(1)'), null)
  assert.equal(normalizePublicHttpUrl(' HTTPS://Example.com/jobs/1 '), 'https://example.com/jobs/1')
  assert.equal(normalizePublicHttpUrl('https://user:pass@example.com'), null)
  assert.equal(normalizePublicHttpUrl('https://8.8.8.8/job'), null)
  assert.equal(normalizePublicHttpUrl('https://example.com/job#section'), 'https://example.com/job')
})

test('URL canonicalization removes tracking but preserves potentially meaningful listing parameters', () => {
  const url = normalizePublicHttpUrl('https://example.com/job?id=123&source=employer&ref=job-123&utm_source=search#apply')
  assert.equal(url, 'https://example.com/job?id=123&ref=job-123&source=employer')
})

test('missing TinyFish API key returns a clear configuration error', async () => {
  await assert.rejects(
    () => searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: {}, apiKey: '' }),
    (error) => error.code === 'tinyfish_not_configured' && error.status === 503,
  )
})

test('live search inspects discovery-page links and fetches individual listing details', async () => {
  const calls = []
  let fetchBatches = 0
  const mockFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options })
    if (String(url).startsWith('https://api.search.tinyfish.ai')) {
      const parsed = new URL(String(url))
      assert.equal(parsed.searchParams.get('location'), 'IN')
      assert.ok(parsed.searchParams.get('purpose'))
      return new Response(JSON.stringify({ results: [
        { title: 'Remote Java Tutor', url: 'https://jobs.example.com/java-tutor?utm_source=one', snippet: 'Paid tutor listing with Java skills. Apply by Friday.' },
        { title: 'Remote Java Tutor', url: 'https://jobs.example.com/java-tutor?utm_source=two', snippet: 'Paid tutor listing with Java skills. Apply by Friday.' },
        { title: 'Intern role', url: 'https://company.example.org/intern', snippet: 'Student internship' },
        { title: '39,000 Online Teaching Java Python Job Vacancies | Indeed', url: 'https://www.indeed.com/jobs?q=python', snippet: 'Search job openings by skill.' },
        { title: 'Python Freelance Jobs: Work Remote & Earn Online', url: 'https://freelancer.com/freelance-jobs', snippet: 'Browse many projects.' },
        { title: '9 AI Freelance Platforms Ranked: Where to Actually Earn $50–200/Hour', url: 'https://example.com/blog/platform-ranking', snippet: 'A comparison of websites.' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (String(url) === 'https://api.fetch.tinyfish.ai') {
      fetchBatches += 1
      const body = JSON.parse(options.body)
      assert.equal(body.format, 'markdown')
      assert.equal(body.links, fetchBatches === 1, 'first fetch includes links for discovery pages')
      if (fetchBatches === 1) {
        assert.ok(body.urls.includes('https://jobs.example.com/java-tutor'))
        assert.ok(body.urls.includes('https://company.example.org/intern'))
        assert.ok(body.urls.some((value) => value.includes('freelance-jobs') || value.includes('jobs?q=python')))
        const results = body.urls.map((pageUrl) => {
          if (pageUrl.startsWith('https://jobs.example.com/')) return {
            url: pageUrl, final_url: pageUrl, title: 'Remote Java Tutor', description: 'Teach beginners remotely. Paid at ₹500 per hour.', published_date: '2026-10-10', text: '# Remote Java Tutor\n\nSalary: ₹500 per hour.\nPayment released within 3 days.\nRequirements: Java programming skills.'
          }
          if (pageUrl === 'https://company.example.org/intern') return {
            url: pageUrl, final_url: pageUrl, title: 'Intern role', description: 'Internship role', text: 'Full-time internship with hiring stages. Stipend paid monthly.'
          }
          if (pageUrl.includes('freelance-jobs')) return {
            url: pageUrl, final_url: pageUrl, title: 'Python Freelance Jobs: Work Remote & Earn Online',
            text: 'Python Automation Developer for AI Job Matching App. Fixed Price. Posted 19 days ago. We are seeking an expert Python developer. [View & Apply](https://truelancer.com/freelance-project/python-automation-123)',
            links: ['https://truelancer.com/freelance-project/python-automation-123']
          }
          return { url: pageUrl, final_url: pageUrl, title: '39,000 Online Teaching Java Python Job Vacancies | Indeed', text: 'Search job openings by skill.', links: [] }
        })
        return new Response(JSON.stringify({ results, errors: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      assert.deepEqual(body.urls, ['https://truelancer.com/freelance-project/python-automation-123'])
      return new Response(JSON.stringify({ results: [
        { url: body.urls[0], final_url: body.urls[0], title: 'Python Automation Developer for AI Job Matching App', description: 'Fixed price freelance project.', published_date: '2026-10-10', text: '# Python Automation Developer for AI Job Matching App\n\nFixed price project. Posted 19 days ago. We are seeking an expert Python developer. Budget: INR 2000 per project. Apply through the listing.' },
      ], errors: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('Unexpected upstream URL')
  }
  const result = await searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: { user_type: 'student' }, apiKey: 'test-key', fetchImpl: mockFetch })
  assert.equal(result.source, 'tinyfish')
  assert.equal(result.liveSearch, true)
  assert.equal(result.liveFetch, true)
  assert.equal(result.opportunities.length, 3)
  assert.equal(result.resultCount, 3)
  assert.equal(result.diagnostics.discoveredListingUrls, 1)
  assert.ok(result.opportunities.every((item) => item.listingType === 'individual_opportunity' && item.independentlyVerified === false))
  assert.ok(result.opportunities.some((item) => item.url === 'https://truelancer.com/freelance-project/python-automation-123'))
  assert.ok(calls.some((call) => call.url.startsWith('https://api.search.tinyfish.ai/?query=')))
  const fetchCalls = calls.filter((call) => call.url === 'https://api.fetch.tinyfish.ai')
  assert.equal(fetchCalls.length, 2)
  assert.equal(fetchCalls[0].options.headers['X-API-Key'], 'test-key')
  assert.match(JSON.stringify(result.opportunities), /Payment released within 3 days/)
})


test('default TinyFish code path requests links on discovery fetch and then fetches the direct listing', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    calls.push({ target, options })
    if (target.startsWith('https://api.search.tinyfish.ai')) {
      return new Response(JSON.stringify({ results: [
        { title: 'Python Freelance Jobs: Work Remote & Earn Online', url: 'https://freelancer.com/freelance-jobs', snippet: 'Browse Python projects and apply.' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (target === 'https://api.fetch.tinyfish.ai') {
      const body = JSON.parse(options.body)
      if (body.links) {
        return new Response(JSON.stringify({ results: [
          { url: body.urls[0], final_url: body.urls[0], title: 'Python Freelance Jobs', text: 'Python Automation Developer for an AI Job Matching App. Fixed price project. Posted 2 days ago. [View project](https://truelancer.com/freelance-project/python-automation-554)', links: ['https://truelancer.com/freelance-project/python-automation-554'] },
        ], errors: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      assert.deepEqual(body.urls, ['https://truelancer.com/freelance-project/python-automation-554'])
      return new Response(JSON.stringify({ results: [
        { url: body.urls[0], final_url: body.urls[0], title: 'Python Automation Developer for an AI Job Matching App', text: 'Fixed price project. Posted 2 days ago. We are seeking a Python developer. Budget: INR 1500 per project. Apply through this listing.' },
      ], errors: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`Unexpected URL: ${target}`)
  }
  try {
    const result = await searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: {}, apiKey: 'test-key' })
    const fetchCalls = calls.filter((call) => call.target === 'https://api.fetch.tinyfish.ai')
    assert.equal(fetchCalls.length, 2)
    assert.equal(JSON.parse(fetchCalls[0].options.body).links, true)
    assert.equal(JSON.parse(fetchCalls[1].options.body).links, false)
    assert.equal(result.resultCount, 1)
    assert.match(result.opportunities[0].title, /Python Automation Developer/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generic-only search results are inspected for links but not counted as individual opportunities', async () => {
  let fetchCount = 0
  const mockFetch = async (url) => {
    if (String(url).startsWith('https://api.search.tinyfish.ai')) {
      return new Response(JSON.stringify({ results: [
        { title: 'Python Freelance Jobs: Work Remote & Earn Online', url: 'https://freelancer.com/freelance-jobs', snippet: 'Browse available project categories.' },
        { title: '9 AI Freelance Platforms Ranked', url: 'https://example.com/blog/platform-ranking', snippet: 'Compare different platforms.' },
        { title: '39,000 Job Vacancies', url: 'https://indeed.com/jobs?q=python', snippet: 'Search roles by keyword.' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    fetchCount += 1
    return new Response(JSON.stringify({ results: [], errors: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const result = await searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: {}, apiKey: 'test-key', fetchImpl: mockFetch })
  assert.equal(result.resultCount, 0)
  assert.deepEqual(result.opportunities, [])
  assert.equal(fetchCount, 1, 'generic pages may be fetched for links, but never counted as opportunities')
  assert.ok(result.warnings.some((warning) => /No individual listings qualified after inspecting/i.test(warning)))
})

test('generic-only results preserve partial search failure warnings', async () => {
  let searchIndex = 0
  const mockFetch = async (url) => {
    if (String(url).startsWith('https://api.search.tinyfish.ai')) {
      searchIndex += 1
      if (searchIndex === 1) return new Response(JSON.stringify({ results: [
        { title: 'Python Freelance Jobs: Work Remote & Earn Online', url: 'https://freelancer.com/freelance-jobs', snippet: 'Browse project categories.' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } })
      return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ results: [], errors: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const result = await searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: {}, apiKey: 'test-key', fetchImpl: mockFetch })
  assert.equal(result.resultCount, 0)
  assert.ok(result.warnings.some((warning) => /rate limited/i.test(warning)))
  assert.ok(result.warnings.some((warning) => /No individual listings qualified after inspecting/i.test(warning)))
})

test('empty live search does not substitute mock opportunities', async () => {
  const mockFetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const result = await searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: {}, apiKey: 'test-key', fetchImpl: mockFetch })
  assert.equal(result.resultCount, 0)
  assert.deepEqual(result.opportunities, [])
  assert.ok(result.warnings.some((warning) => /No sample or mock/i.test(warning)))
})

test('malformed TinyFish responses fail clearly rather than inventing results', async () => {
  const mockFetch = async () => new Response('{ malformed', { status: 200 })
  await assert.rejects(
    () => searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: {}, apiKey: 'test-key', fetchImpl: mockFetch }),
    /malformed JSON response/i,
  )
})


test('TinyFish rate limits are surfaced as rate limits rather than empty fake results', async () => {
  const mockFetch = async () => new Response(JSON.stringify({ error: 'rate limited' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(
    () => searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: {}, apiKey: 'test-key', fetchImpl: mockFetch }),
    (error) => error.code === 'tinyfish_rate_limited' && error.status === 429 && /rate limited/i.test(error.message),
  )
})

test('search timeout fails clearly without inventing listings', async () => {
  const mockFetch = async (_url, options = {}) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      reject(error)
    }, { once: true })
  })
  await assert.rejects(
    () => searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: {}, apiKey: 'test-key', fetchImpl: mockFetch, searchTimeoutMs: 5 }),
    (error) => error.code === 'tinyfish_search_failed' && error.status === 502 && /abort/i.test(error.message),
  )
})

test('fetch timeout preserves search snippets and reports extraction unavailable', async () => {
  const mockFetch = async (url, options = {}) => {
    if (String(url).startsWith('https://api.search.tinyfish.ai')) {
      return new Response(JSON.stringify({ results: [{ title: 'Remote Java Tutor', url: 'https://jobs.example.com/java-tutor', snippet: 'Remote paid Java tutor listing' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    })
  }
  const result = await searchEarnRadarOpportunities({ rawRequest: goodRequest, profile: {}, apiKey: 'test-key', fetchImpl: mockFetch, fetchTimeoutMs: 5 })
  assert.equal(result.liveSearch, true)
  assert.equal(result.liveFetch, false)
  assert.equal(result.opportunities.length, 1)
  assert.equal(result.opportunities[0].sourceExtracted, false)
  assert.ok(result.warnings.some((warning) => /Page extraction could not complete/i.test(warning)))
})
