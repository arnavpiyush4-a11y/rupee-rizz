import { reviewedBusiness } from '@/lib/ocr/review'
import { ownedRows } from '@/lib/businessStore'
import { today } from '@/lib/business'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { recognize } from '@/lib/ocr/recognize'
import { readFile } from 'node:fs/promises'
import pathModule from 'node:path'
import { digest, seal, unseal } from '@/lib/ocr/provenance'
import { createRequestClient } from '@/lib/supabase/request'
import {
  computeSnapshot, emergencyFundTarget, goalMetrics, requiredMonthly,
  allocateSavings, readinessScore, borrowGuard, scoreBandLabel,
} from '@/lib/finance'
import { formatINR } from '@/lib/format'
import { SCHEMES, matchSchemes } from '@/lib/schemes'
import { maskSensitive } from '@/lib/demo'
import { callOpenAIJson, getOpenAIInsightsConfig } from '@/lib/openaiVision'
import { searchEarnRadarOpportunities, normalizePublicHttpUrl } from '@/lib/earnRadarService.js'
import { classifyEarnRadarStorageError, isEarnRadarDuplicateError, isSaveableEarnRadarOpportunity, sanitizeSavedCompensation } from '@/lib/earnRadarPersistence.js'
import { EARN_RADAR_STATUSES } from '@/lib/earnRadarRules.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let sampleScan
const BUCKET = 'receipts'
function earnRadarStorageFailure(error) {
  // Log only machine-readable error code to avoid leaking DB detail into logs/responses.
  if (error?.code) console.warn('Earn Radar storage operation failed', { code: String(error.code).slice(0, 32) })
  const mapped = classifyEarnRadarStorageError(error)
  return json({ error: mapped.message, code: mapped.code }, mapped.code === 'earn_radar_storage_permission_denied' ? 403 : 503)
}

function cleanSavedOpportunity(raw) {
  if (!isSaveableEarnRadarOpportunity(raw)) return null
  const sourceUrl = normalizePublicHttpUrl(raw.url)
  if (!sourceUrl) return null
  const pick = (value, max = 400) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : ''
  return {
    title: pick(raw.title, 180) || 'Earning opportunity',
    url: sourceUrl,
    employer: pick(raw.employer, 100),
    source: pick(raw.source, 120),
    description: pick(raw.description, 800),
    listingType: raw.listingType === 'individual_opportunity' ? 'individual_opportunity' : 'unconfirmed',
    discoveryStatus: 'search_result_discovered',
    listingStatus: raw.listingStatus === 'individual_opportunity_identified' ? 'individual_opportunity_identified' : 'unconfirmed',
    pageExtractionStatus: ['page_text_extracted', 'extraction_unavailable_or_access_restricted'].includes(raw.pageExtractionStatus) ? raw.pageExtractionStatus : 'unknown',
    detailsStatus: ['details_extracted_from_source_not_independently_verified', 'search_snippet_evidence_only_not_independently_verified'].includes(raw.detailsStatus) ? raw.detailsStatus : 'unknown',
    independentlyVerified: false,
    listingClassificationReason: pick(raw.listingClassificationReason, 300) || null,
    advertisedCompensation: pick(raw.advertisedCompensation, 120) || null,
    compensation: sanitizeSavedCompensation(raw.compensation),
    location: pick(raw.location, 100),
    workArrangement: pick(raw.workArrangement, 24),
    requirements: pick(raw.requirements, 260) || null,
    postingDate: pick(raw.postingDate, 40) || null,
    applicationDeadline: pick(raw.applicationDeadline, 100) || null,
    payoutTiming: raw.payoutTiming && typeof raw.payoutTiming === 'object' ? {
      label: pick(raw.payoutTiming.label, 160),
      days: Number.isFinite(raw.payoutTiming.days) ? Math.max(0, Math.min(3650, Number(raw.payoutTiming.days))) : null,
      confidence: ['explicit', 'conditional', 'unknown'].includes(raw.payoutTiming.confidence) ? raw.payoutTiming.confidence : 'unknown',
    } : { label: 'Not stated in the available source text', days: null, confidence: 'unknown' },
    screening: raw.screening && typeof raw.screening === 'object' ? {
      level: raw.screening.level === 'caution' ? 'caution' : 'no_obvious_flags',
      flags: Array.isArray(raw.screening.flags) ? raw.screening.flags.slice(0, 8).map((v) => pick(v, 200)) : [],
      note: 'Automated red-flag screening only; check the original source and payment terms.',
    } : null,
    sourceExtracted: raw.sourceExtracted === true,
    sourceExcerpt: pick(raw.sourceExcerpt, 1500),
    fetchedAt: pick(raw.fetchedAt, 40) || null,
    match: raw.match && typeof raw.match === 'object' ? {
      score: Number.isFinite(raw.match.score) ? Math.max(0, Math.min(100, Number(raw.match.score))) : 0,
      reasons: Array.isArray(raw.match.reasons) ? raw.match.reasons.slice(0, 8).map((v) => pick(v, 220)) : [],
      skillMatches: Array.isArray(raw.match.skillMatches) ? raw.match.skillMatches.slice(0, 12).map((v) => pick(v, 60)) : [],
    } : { score: 0, reasons: [], skillMatches: [] },
    feasibility: raw.feasibility && typeof raw.feasibility === 'object' ? {
      status: ['possible_not_guaranteed', 'unlikely', 'unknown'].includes(raw.feasibility.status) ? raw.feasibility.status : 'unknown',
      label: pick(raw.feasibility.label, 100),
      explanation: pick(raw.feasibility.explanation, 500),
    } : { status: 'unknown', label: 'Payment timing unknown', explanation: 'The source does not state a reliable payout date.' },
  }
}

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}
const json = (data, status = 200) => cors(NextResponse.json(data, { status }))
export async function OPTIONS() { return cors(new NextResponse(null, { status: 200 })) }

// Verify the Supabase JWT and return a user-scoped client (RLS applies as this user).
async function getAuth(request) {
  const supabase = createRequestClient(request)
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return { supabase, user: data.user }
}

async function hasConsent(supabase, uid) {
  const { data } = await supabase.from('consents').select('id').eq('user_id', uid).eq('status', true).is('withdrawn_at', null).limit(1)
  return !!(data && data.length)
}

function rateLimit(userId, key = 'ocr', max = 20, windowMs = 10 * 60 * 1000) {
  const store = globalThis.__rr_rl || (globalThis.__rr_rl = new Map())
  const k = `${key}:${userId}`
  const now = Date.now()
  const arr = (store.get(k) || []).filter((t) => now - t < windowMs)
  if (arr.length >= max) return false
  arr.push(now); store.set(k, arr); return true
}

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const b64 = m[2]
  const bytes = Math.floor((b64.length * 3) / 4)
  return { mime, b64, bytes }
}

async function loadUserContext(supabase, uid) {
  const [{ data: pr }, { data: goals }, { data: receipts }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', uid).limit(1),
    supabase.from('savings_goals').select('*').eq('user_id', uid).order('priority', { ascending: true }),
    supabase.from('receipts').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
  ])
  return { profile: pr?.[0] || null, goals: goals || [], receipts: (receipts || []).filter(r=>pr?.[0]?.user_type!=='micro_entrepreneur'||!r.ocr_origin) }
}

function spendingByCategory(receipts) {
  const map = {}
  for (const r of receipts) {
    const items = r.items || []
    if (items.length) {
      for (const it of items) {
        const c = it.category || r.category || 'Other'
        map[c] = (map[c] || 0) + (Number(it.price) || 0)
      }
    } else {
      const c = r.category || 'Other'
      map[c] = (map[c] || 0) + (Number(r.total) || 0)
    }
  }
  return Object.entries(map).map(([name, amount]) => ({ name, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount)
}

function buildDashboard(ctx) {
  const finance = ctx.profile?.finance || {}
  const snapshot = computeSnapshot(finance)
  const emergencyTarget = emergencyFundTarget(finance)
  const emergencyAmount = Math.round(finance.emergency_fund_amount || 0)
  const alloc = allocateSavings({ safe: snapshot.safe_monthly_saving, emergencyAmount, emergencyTarget, goals: ctx.goals })
  const goalsOut = ctx.goals.map((g) => ({ ...g, metrics: goalMetrics(g, alloc.goals[g.id] || 0), recommended_monthly: alloc.goals[g.id] || 0 }))
  const cats = spendingByCategory(ctx.receipts)
  const budget_breakdown = [
    { name: 'Essentials', amount: snapshot.essential_expenses },
    { name: 'Non-essentials', amount: snapshot.non_essential_expenses },
    { name: 'EMI / Loan', amount: snapshot.compulsory_emi },
    { name: 'Business costs', amount: snapshot.business_operating_costs },
  ].filter((b) => b.amount > 0)
  const totalExpense = snapshot.essential_expenses + snapshot.non_essential_expenses + snapshot.compulsory_emi + snapshot.business_operating_costs
  const topCat = cats[0] || budget_breakdown[0] || null
  const nudgeCat = cats.find((c) => ['Food & Drinks', 'Shopping', 'Travel'].includes(c.name)) || cats[0]
  const nudgeSave = nudgeCat ? Math.max(80, Math.round(nudgeCat.amount * 0.15)) : 0
  const nudge = nudgeCat
    ? { category: nudgeCat.name, save: nudgeSave, text: `Skip one ${nudgeCat.name.toLowerCase()} purchase this week` }
    : { category: null, save: 0, text: 'Scan a few receipts to unlock personalised nudges.' }
  const health = readinessScore({ snapshot, emergencyAmount, emergencyTarget })
  return {
    snapshot,
    emergency: { amount: emergencyAmount, target: emergencyTarget, started: emergencyAmount > 0, allocation: alloc.emergency },
    allocation: alloc,
    goals: goalsOut,
    spending_by_category: cats,
    budget_breakdown,
    income_vs_expenses: [{ name: 'Income', amount: snapshot.reliable_monthly_income }, { name: 'Expenses', amount: totalExpense }],
    top_category: topCat,
    nudge,
    health: { score: health.score, band: health.band },
    schemes_preview: matchSchemes(ctx.profile || {}).slice(0, 3),
    recent_receipts: ctx.receipts.slice(0, 50),
  }
}

// ================================================================
async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    if (route === '/root' && method === 'GET') return json({ message: 'RupeeRizz API (Supabase)', ok: true })
    if (route === '/schemes' && method === 'GET') return json({ schemes: SCHEMES })

    // The public judge demo processes only a bundled synthetic image. No upload is accepted.
    if(route==='/demo/document'&&method==='GET'){
      sampleScan??=readFile(pathModule.join(process.cwd(),'public','ocr','sample-supplier.png')).then(async bytes=>({extraction:await recognize(bytes),source_sha256:digest(bytes)})).catch(err=>{sampleScan=null;throw err})
      return json(await sampleScan)
    }
    const auth = await getAuth(request)
    if (!auth) return json({ error: 'Not authenticated', code: 'no_auth' }, 401)
    const { supabase, user } = auth
    const uid = user.id

    if (route === '/business') {
      if (!(await hasConsent(supabase,uid))) return json({error:'Active consent required.'},403)
      const {data:profile}=await supabase.from('profiles').select('user_type').eq('user_id',uid).maybeSingle()
      if (profile?.user_type!=='micro_entrepreneur') return json({error:'Business profile required.'},403)
      if (method==='GET') {
        const [entries,receipts]=await Promise.all([ownedRows(supabase,'business_entries',uid),ownedRows(supabase,'receipts',uid,'id,merchant,receipt_date,total,category,currency,user_verified,image_path,items,source_sha256,reviewed_business,ocr_origin')])
        return json({entries,receipts:receipts.map(({image_path,...r})=>({...r,has_source:!!image_path}))})
      }
      const body=await request.json()
      let query
      if (method==='POST') {
        const fields=['id','day','kind','amount','method','category','party','item','units','reorder','invoice','gstin','tax','receipt_id','stock_lines']
        if (!body.day || body.day>today()) return json({error:'Choose today or an earlier date.'},400)
        query=supabase.from('business_entries').insert(Object.fromEntries(fields.map(k=>[k,body[k]])))
      } else if(method==='PATCH') {
        const target=()=>supabase.from('business_entries')
        if(body.receipt_id) query=target().update({receipt_id:body.receipt_id}).is('receipt_id',null)
        else query=target().update({paid_on:today(),paid_by:body.paid_by}).eq('method','udhaar').is('paid_on',null)
        query=query.eq('id',body.id).eq('user_id',uid)
      } else return json({error:'Unsupported operation.'},405)
      const {data,error}=await query.select('*').single()
      if(error) return json({error:error.code==='23505'?'Entry or receipt already recorded. Refresh the ledger.':'Could not save. Check the fields and refresh the ledger.'},400)
      return json({entry:data})
    }

    // ---------- EARN RADAR: live search + saved opportunity tracking ----------
    if (route === '/earn-radar/search' && method === 'POST') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required before using Earn Radar.', code: 'consent_required' }, 403)
      if (!rateLimit(uid, 'earn-radar-search', 4, 10 * 60 * 1000)) return json({ error: 'You have run several searches recently. Please wait a few minutes before trying again.', code: 'rate_limited' }, 429)
      const body = await request.json().catch(() => null)
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Enter your goal details and try again.', code: 'invalid_earn_radar_request' }, 400)
      const { data: profileRows } = await supabase.from('profiles').select('user_type,state').eq('user_id', uid).limit(1)
      try {
        const result = await searchEarnRadarOpportunities({ rawRequest: body, profile: profileRows?.[0] || null })
        return json(result)
      } catch (error) {
        const status = [400, 429, 502, 503].includes(error?.status) ? error.status : 502
        const code = error?.code || (status === 429 ? 'tinyfish_rate_limited' : 'tinyfish_search_failed')
        return json({ error: error?.message || 'Earn Radar could not complete this search. Please retry.', code }, status)
      }
    }

    if (route === '/earn-radar/saved' && method === 'GET') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required before using Earn Radar.', code: 'consent_required' }, 403)
      const { data, error } = await supabase.from('earn_radar_saved').select('id,title,source_url,source,status,opportunity,notes,created_at,updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(100)
      if (error) return earnRadarStorageFailure(error)
      return json({ saved: data || [] })
    }

    if (route === '/earn-radar/saved' && method === 'POST') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required before using Earn Radar.', code: 'consent_required' }, 403)
      const body = await request.json().catch(() => ({}))
      const opportunity = cleanSavedOpportunity(body?.opportunity)
      if (!opportunity) return json({ error: 'That opportunity does not have a valid public source URL.', code: 'invalid_opportunity' }, 400)
      const { data: existing, error: lookupError } = await supabase.from('earn_radar_saved').select('id,title,source_url,source,status,opportunity,notes,created_at,updated_at').eq('user_id', uid).eq('source_url', opportunity.url).limit(1)
      if (lookupError) return earnRadarStorageFailure(lookupError)
      if (existing?.[0]) return json({ saved: existing[0], alreadySaved: true })
      const { data, error } = await supabase.from('earn_radar_saved').insert({
        user_id: uid,
        title: opportunity.title,
        source_url: opportunity.url,
        source: opportunity.source || null,
        status: 'saved',
        opportunity,
      }).select('id,title,source_url,source,status,opportunity,notes,created_at,updated_at').single()
      if (error) {
        // A simultaneous save from another tab can win the unique(user_id, source_url)
        // race. Return the existing record rather than treating a valid duplicate as failure.
        if (isEarnRadarDuplicateError(error)) {
          const { data: duplicate, error: duplicateError } = await supabase.from('earn_radar_saved')
            .select('id,title,source_url,source,status,opportunity,notes,created_at,updated_at')
            .eq('user_id', uid).eq('source_url', opportunity.url).limit(1)
          if (!duplicateError && duplicate?.[0]) return json({ saved: duplicate[0], alreadySaved: true })
          if (duplicateError) return earnRadarStorageFailure(duplicateError)
        }
        return earnRadarStorageFailure(error)
      }
      return json({ saved: data, alreadySaved: false }, 201)
    }

    if (path[0] === 'earn-radar' && path[1] === 'saved' && path.length === 3 && method === 'PUT') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required before using Earn Radar.', code: 'consent_required' }, 403)
      const body = await request.json().catch(() => ({}))
      const update = {}
      if (body?.status !== undefined) {
        if (!EARN_RADAR_STATUSES.includes(body.status)) return json({ error: 'Choose a valid opportunity status.', code: 'invalid_status' }, 400)
        update.status = body.status
      }
      if (body?.notes !== undefined) update.notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : null
      if (!Object.keys(update).length) return json({ error: 'There is nothing to update.', code: 'empty_update' }, 400)
      update.updated_at = new Date().toISOString()
      const { data, error } = await supabase.from('earn_radar_saved').update(update).eq('id', path[2]).eq('user_id', uid).select('id,title,source_url,source,status,opportunity,notes,created_at,updated_at').limit(1)
      if (error) return earnRadarStorageFailure(error)
      if (!data?.length) return json({ error: 'Saved opportunity not found.', code: 'not_found' }, 404)
      return json({ saved: data[0] })
    }

    if (path[0] === 'earn-radar' && path[1] === 'saved' && path.length === 3 && method === 'DELETE') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required before using Earn Radar.', code: 'consent_required' }, 403)
      const { data, error } = await supabase.from('earn_radar_saved').delete().eq('id', path[2]).eq('user_id', uid).select('id').limit(1)
      if (error) return earnRadarStorageFailure(error)
      if (!data?.length) return json({ error: 'Saved opportunity not found.', code: 'not_found' }, 404)
      return json({ ok: true })
    }

    // ---------- ME ----------
    if (route === '/me' && method === 'GET') {
      const { data: pr } = await supabase.from('profiles').select('*').eq('user_id', uid).limit(1)
      const { data: history } = await supabase.from('consents').select('*').eq('user_id', uid).order('consented_at', { ascending: false })
      const active = (history || []).some((c) => c.status && !c.withdrawn_at)
      return json({ user: { id: uid, email: user.email, name: user.user_metadata?.full_name || null }, profile: pr?.[0] || null, consent: { active, history: history || [] } })
    }

    // ---------- CONSENT ----------
    if (route === '/consent' && method === 'GET') {
      const { data: history } = await supabase.from('consents').select('*').eq('user_id', uid).order('consented_at', { ascending: false })
      return json({ active: (history || []).some((c) => c.status && !c.withdrawn_at), history: history || [] })
    }
    if (route === '/consent' && method === 'POST') {
      const { error } = await supabase.from('consents').insert({ user_id: uid, purpose: 'core', status: true })
      if (error) return json({ error: error.message }, 400)
      return json({ active: true })
    }
    if (route === '/consent/withdraw' && method === 'POST') {
      await supabase.from('consents').update({ status: false, withdrawn_at: new Date().toISOString() }).eq('user_id', uid).eq('status', true).is('withdrawn_at', null)
      return json({ active: false })
    }

    // ---------- PROFILE ----------
    if (route === '/profile' && method === 'GET') {
      const { data: pr } = await supabase.from('profiles').select('*').eq('user_id', uid).limit(1)
      return json({ profile: pr?.[0] || null })
    }
    if (route === '/profile' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { data: exRows } = await supabase.from('profiles').select('*').eq('user_id', uid).limit(1)
      const existing = exRows?.[0]
      const set = {
        full_name: body.full_name ?? existing?.full_name ?? user.user_metadata?.full_name ?? 'Friend',
        user_type: body.user_type || existing?.user_type || 'student',
        preferred_language: body.preferred_language || existing?.preferred_language || 'en',
        state: body.state ?? existing?.state ?? null,
        pathway: body.pathway ?? existing?.pathway ?? null,
        business_type: body.business_type ?? existing?.business_type ?? null,
        finance: { ...(existing?.finance || {}), ...(body.finance || {}) },
      }
      if (existing) {
        const { error } = await supabase.from('profiles').update(set).eq('user_id', uid)
        if (error) return json({ error: error.message }, 400)
      } else {
        const { error } = await supabase.from('profiles').insert({ user_id: uid, ...set })
        if (error) return json({ error: error.message }, 400)
      }
      if (body.initial_goal && body.initial_goal.goal_amount) {
        const g = body.initial_goal
        const { count } = await supabase.from('savings_goals').select('id', { count: 'exact', head: true }).eq('user_id', uid)
        await supabase.from('savings_goals').insert({ user_id: uid, goal_name: g.goal_name || 'My Goal', goal_amount: Number(g.goal_amount) || 0, current_saved_amount: Number(g.current_saved_amount) || 0, target_date: g.target_date || null, priority: (count || 0) + 1, recommended_monthly_saving: 0 })
      }
      const { data: pr } = await supabase.from('profiles').select('*').eq('user_id', uid).limit(1)
      return json({ profile: pr?.[0] || null })
    }

    // ---------- OCR ----------
    if (route === '/ocr/receipt' && method === 'POST') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required before scanning receipts.', code: 'consent_required' }, 403)
      if (!rateLimit(uid, 'ocr', 20)) return json({ error: 'Too many uploads. Please wait a bit.', code: 'rate_limited' }, 429)
      const body = await request.json().catch(() => ({}))
      const parsed = parseDataUrl(body.image)
      if (!parsed) return json({ error: 'A valid image is required.', code: 'bad_image' }, 400)
      if (!ALLOWED_MIME.includes(parsed.mime)) return json({ error: 'Only JPG, PNG or WebP images are allowed.', code: 'bad_mime' }, 400)
      if (parsed.bytes > 10 * 1024 * 1024) return json({ error: 'Image must be under 10 MB.', code: 'too_large' }, 400)

      const bytes=Buffer.from(parsed.b64,'base64')
      try {
        const extraction=await recognize(bytes,body.language||'en')
        return json({extraction:{...extraction,ticket:seal(extraction,bytes,uid)},mode:'local',sensitive_found:[]})
      } catch {
        return json({error:'Local scan unavailable. Check the installed language pack and signing key, or retry a smaller, clearer image.'},503)
      }
    }

    // ---------- RECEIPTS ----------
    if (route === '/receipts' && method === 'GET') {
      const { data } = await supabase.from('receipts').select('*').eq('user_id', uid).order('created_at', { ascending: false })
      return json({ receipts: data || [] })
    }
    if (route === '/receipts' && method === 'POST') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required.', code: 'consent_required' }, 403)
      const body = await request.json().catch(() => ({}))
      const rid = uuidv4()
      const mMerchant = maskSensitive(body.merchant || '')
      if(body.user_verified!==true || !Number.isFinite(body.total)||body.total<=0 || !body.receipt_date || !mMerchant.text) return json({error:'Confirm merchant, date and a positive total before saving.'},400)
      const parsed=parseDataUrl(body.image)
      if(!parsed || !ALLOWED_MIME.includes(parsed.mime)||parsed.bytes>10*1024*1024)return json({error:'A valid source image under 10 MB is required.'},400)
      const bytes=Buffer.from(parsed.b64,'base64')
      const origin=unseal(body.ticket,bytes,uid)
      if(!origin)return json({error:'Scan this source image again before confirming.'},400)
      const items=(body.items||[]).map(it=>({item_name:maskSensitive(it.item_name||'').text,price:it.price??null,quantity:it.quantity??null,unit_price:it.unit_price??null,unit:it.unit??null,sku:it.sku??null,category:it.category||'Other'}))
      let business
      try{business=reviewedBusiness(body.reviewed_business,body.total)}catch(e){return json({error:e.message},400)}
      const image_path=uid+'/'+rid+'/source.'+(parsed.mime.split('/')[1])
      const {error:upErr}=await supabase.storage.from(BUCKET).upload(image_path,bytes,{contentType:parsed.mime,upsert:false})
      if(upErr)return json({error:'Source image could not be stored privately. Retry.'},503)
      const row={id:rid,user_id:uid,merchant:mMerchant.text,receipt_date:body.receipt_date,total:body.total,currency:'INR',category:body.category||'Other',user_verified:true,items,image_path,source_sha256:digest(bytes),ocr_origin:origin,reviewed_business:business,overall_confidence:origin.meta.overall_confidence}
      const {data,error}=await supabase.from('receipts').insert(row).select().single()
      if(error){
        await supabase.storage.from(BUCKET).remove([image_path])
        return json({error:error.code==='23505'?'This image or supplier invoice is already recorded. Open the existing receipt.':'Receipt could not be saved.'},error.code==='23505'?409:400)
      }
      return json({ receipt: data, sensitive_masked: mMerchant.found })
    }
    if (path[0] === 'receipts' && path.length === 3 && path[2] === 'image' && method === 'GET') {
      const { data: r } = await supabase.from('receipts').select('image_path').eq('id', path[1]).limit(1)
      const p = r?.[0]?.image_path
      if (!p) return json({ error: 'Not found' }, 404)
      const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(p, 300)
      if (error) return json({ error: error.message }, 400)
      return json({ url: signed.signedUrl })
    }
    if (path[0] === 'receipts' && path.length === 2 && method === 'GET') {
      const { data } = await supabase.from('receipts').select('*').eq('id', path[1]).limit(1)
      if (!data?.[0]) return json({ error: 'Not found' }, 404)
      return json({ receipt: data[0] })
    }
    if(path[0]==='receipts'&&path[2]==='review'&&path.length===3&&method==='PUT'){
      if(!(await hasConsent(supabase,uid)))return json({error:'Active consent required.'},403)
      const doc=await request.json()
      if(!doc.user_verified||!Number.isFinite(doc.total)||doc.total<=0||!Array.isArray(doc.items))return json({error:'Confirm all receipt values.'},400)
      try{doc.reviewed_business=reviewedBusiness(doc.reviewed_business,doc.total)}catch(e){return json({error:e.message},400)}
      doc.merchant=maskSensitive(doc.merchant).text
      doc.items=doc.items.map(it=>({...it,item_name:maskSensitive(it.item_name||'').text}))
      const {error}=await supabase.rpc('correct_document',{p_id:path[1],p_revision:doc.revision,p_doc:doc})
      if(error)return json({error:'Correction conflicts with the current review, stock lines or payment history. Reload and check the fields.'},409)
      return json({ok:true})
    }
    if (path[0] === 'receipts' && path.length === 2 && method === 'PUT') {
      const body = await request.json().catch(() => ({}))
      const items = (body.items || []).map((it) => ({ item_name: maskSensitive(it.item_name || it.name || '').text, price: Number(it.price) || 0, category: it.category || 'Other', confidence: it.confidence ?? null }))
      const upd = { merchant: maskSensitive(body.merchant || '').text, receipt_date: body.receipt_date || null, total: body.total != null ? Number(body.total) : null, category: body.category || 'Other', items, user_verified: true }
      const { data, error } = await supabase.from('receipts').update(upd).eq('id', path[1]).is('ocr_origin',null).select()
      if (error) return json({ error: error.message }, 400)
      if (!data?.length) return json({ error: 'Not found' }, 404)
      return json({ receipt: data[0] })
    }
    if (path[0] === 'receipts' && path.length === 2 && method === 'DELETE') {
      const { data: r } = await supabase.from('receipts').select('image_path').eq('id', path[1]).limit(1)
      const p = r?.[0]?.image_path
      if (p) { try { await supabase.storage.from(BUCKET).remove([p]) } catch (e) {} }
      await supabase.from('receipts').delete().eq('id', path[1])
      return json({ ok: true })
    }

    // ---------- GOALS ----------
    if (route === '/goals' && method === 'GET') {
      const { data } = await supabase.from('savings_goals').select('*').eq('user_id', uid).order('priority', { ascending: true })
      return json({ goals: data || [] })
    }
    if (route === '/goals' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { count } = await supabase.from('savings_goals').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      const row = { user_id: uid, goal_name: body.goal_name || 'My Goal', goal_amount: Number(body.goal_amount) || 0, current_saved_amount: Number(body.current_saved_amount) || 0, target_date: body.target_date || null, priority: Number(body.priority) || (count || 0) + 1, recommended_monthly_saving: 0 }
      const { data, error } = await supabase.from('savings_goals').insert(row).select().single()
      if (error) return json({ error: error.message }, 400)
      return json({ goal: data })
    }
    if (path[0] === 'goals' && path.length === 3 && path[2] === 'contribute' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const amount = Number(body.amount) || 0
      const { data: gr } = await supabase.from('savings_goals').select('*').eq('id', path[1]).limit(1)
      const g = gr?.[0]
      if (!g) return json({ error: 'Not found' }, 404)
      const newSaved = (Number(g.current_saved_amount) || 0) + amount
      await supabase.from('savings_goals').update({ current_saved_amount: newSaved }).eq('id', path[1])
      await supabase.from('goal_contributions').insert({ user_id: uid, goal_id: path[1], amount, note: body.note || null })
      const { data } = await supabase.from('savings_goals').select('*').eq('id', path[1]).limit(1)
      return json({ goal: data?.[0] })
    }
    if (path[0] === 'goals' && path.length === 2 && method === 'PUT') {
      const body = await request.json().catch(() => ({}))
      const upd = {}
      ;['goal_name', 'target_date'].forEach((k) => { if (body[k] !== undefined) upd[k] = body[k] })
      ;['goal_amount', 'current_saved_amount', 'priority'].forEach((k) => { if (body[k] !== undefined) upd[k] = Number(body[k]) || 0 })
      const { data, error } = await supabase.from('savings_goals').update(upd).eq('id', path[1]).select()
      if (error) return json({ error: error.message }, 400)
      if (!data?.length) return json({ error: 'Not found' }, 404)
      return json({ goal: data[0] })
    }
    if (path[0] === 'goals' && path.length === 2 && method === 'DELETE') {
      await supabase.from('savings_goals').delete().eq('id', path[1])
      return json({ ok: true })
    }

    // ---------- DASHBOARD ----------
    if (route === '/dashboard' && method === 'GET') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required.', code: 'consent_required' }, 403)
      const ctx = await loadUserContext(supabase, uid)
      if (!ctx.profile) return json({ error: 'Profile not set', code: 'no_profile' }, 400)
      return json({ dashboard: buildDashboard(ctx), profile: ctx.profile })
    }

    // ---------- FINANCIAL HEALTH ----------
    if (route === '/financial-health' && method === 'GET') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required.', code: 'consent_required' }, 403)
      const ctx = await loadUserContext(supabase, uid)
      if (!ctx.profile) return json({ error: 'Profile not set', code: 'no_profile' }, 400)
      const finance = ctx.profile.finance || {}
      const snapshot = computeSnapshot(finance)
      const emergencyTarget = emergencyFundTarget(finance)
      const emergencyAmount = Math.round(finance.emergency_fund_amount || 0)
      const health = readinessScore({ snapshot, emergencyAmount, emergencyTarget })
      const guard = borrowGuard({ snapshot, emergencyAmount, emergencyTarget, estimatedNewEmi: 0 })
      const needsVerify = ctx.receipts.some((r) => r.user_verified === false)
      const emiRatio = snapshot.reliable_monthly_income > 0 ? snapshot.compulsory_emi / snapshot.reliable_monthly_income : 0
      const checklist = { emergency_fund_started: emergencyAmount > 0, estimated_monthly_saving: snapshot.safe_monthly_saving, non_essential_spending: snapshot.non_essential_expenses, emi_burden: snapshot.compulsory_emi, emi_burden_pct: Math.round(emiRatio * 100), data_correction_needed: needsVerify, emergency_target: emergencyTarget, emergency_amount: emergencyAmount }
      return json({ score: health.score, band: health.band, breakdown: health.breakdown, checklist, guard, snapshot })
    }

    // ---------- SCHEMES MATCH ----------
    if (route === '/schemes/match' && method === 'GET') {
      const { data: pr } = await supabase.from('profiles').select('*').eq('user_id', uid).limit(1)
      return json({ matches: matchSchemes(pr?.[0] || {}) })
    }

    // ---------- BEFORE YOU BORROW ----------
    if (route === '/before-you-borrow' && method === 'POST') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required.', code: 'consent_required' }, 403)
      const body = await request.json().catch(() => ({}))
      const ctx = await loadUserContext(supabase, uid)
      const finance = ctx.profile?.finance || {}
      const snapshot = computeSnapshot(finance)
      const emergencyTarget = emergencyFundTarget(finance)
      const emergencyAmount = Math.round(finance.emergency_fund_amount || 0)
      const goal = ctx.goals.find((g) => g.id === body.goalId) || ctx.goals[0] || null
      const goalAmount = goal ? goal.goal_amount : Number(body.amount) || 0
      const estMonthlyEmi = goalAmount ? Math.round((goalAmount * 1.14) / 12) : 0
      const guard = borrowGuard({ snapshot, emergencyAmount, emergencyTarget, estimatedNewEmi: estMonthlyEmi })
      const matches = matchSchemes(ctx.profile || {})
      const safe = snapshot.safe_monthly_saving
      const options = [
        { rank: 1, option: 'Budget action & savings plan', upfront: 0, monthly_impact: safe > 0 ? -safe : 0, benefit: 'No debt, full control; reach the goal by saving.', conditions: 'Requires monthly discipline; slower if surplus is small.', next_action: safe > 0 ? `Save ${formatINR(safe)}/mo toward your goal.` : 'Review spending to free up savings first.' },
        { rank: 2, option: 'Scholarship / grant / training / toolkit / community support', upfront: 0, monthly_impact: 0, benefit: 'Free or subsidised support; no repayment.', conditions: 'Eligibility & documents vary; application takes time.', next_action: 'Check the Options tab for matched support.' },
        { rank: 3, option: 'Government scheme or subsidy', upfront: 0, monthly_impact: 0, benefit: 'Lower cost via subsidy/benefit.', conditions: 'Scheme-specific eligibility; verify officially.', next_action: matches[0] ? `Explore ${matches[0].scheme_name}.` : 'Explore schemes in Options.' },
        { rank: 4, option: 'Interest subsidy / collateral support / credit guarantee / concessional public loan', upfront: 0, monthly_impact: -Math.round(estMonthlyEmi * 0.85), benefit: 'Cheaper, safer credit than ordinary loans.', conditions: 'Through eligible lender; verify official conditions.', next_action: 'Consider only after steps 1-3.' },
        { rank: 5, option: 'Normal credit (only if genuinely suitable)', upfront: 0, monthly_impact: -estMonthlyEmi, benefit: 'Immediate funds if truly needed.', conditions: 'Only if EMI stays within a safe share of income.', next_action: guard.canBorrow ? 'May be considered - verify lender conditions.' : 'Not recommended yet.' },
      ]
      if (!guard.canBorrow) options.push({ rank: 6, option: 'Do not borrow yet', upfront: 0, monthly_impact: 0, benefit: 'Protects you from stress and debt traps.', conditions: guard.reasons.join(', '), next_action: 'Build surplus & emergency buffer first.' })
      return json({ guard, options, goal, estimated_monthly_emi: estMonthlyEmi, safe_monthly_saving: safe })
    }

    // ---------- AI INSIGHT ----------
    if (route === '/insights/generate' && method === 'POST') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required.', code: 'consent_required' }, 403)
      const ctx = await loadUserContext(supabase, uid)
      if (!ctx.profile) return json({ error: 'Profile not set', code: 'no_profile' }, 400)
      const finance = ctx.profile.finance || {}
      const snapshot = computeSnapshot(finance)
      const emergencyTarget = emergencyFundTarget(finance)
      const emergencyAmount = Math.round(finance.emergency_fund_amount || 0)
      const alloc = allocateSavings({ safe: snapshot.safe_monthly_saving, emergencyAmount, emergencyTarget, goals: ctx.goals })
      const cats = spendingByCategory(ctx.receipts)
      const topNonEss = cats.find((c) => ['Food & Drinks', 'Shopping', 'Travel'].includes(c.name)) || cats[0] || null
      const activeGoal = ctx.goals[0] || null
      const verified = {
        user_type: ctx.profile.user_type, currency: 'INR',
        reliable_monthly_income: snapshot.reliable_monthly_income, essential_expenses: snapshot.essential_expenses,
        non_essential_expenses: snapshot.non_essential_expenses, monthly_surplus: snapshot.monthly_surplus,
        safe_monthly_saving: snapshot.safe_monthly_saving, top_non_essential_category: topNonEss,
        active_goal: activeGoal ? { id: activeGoal.id, name: activeGoal.goal_name, remaining: Math.max(0, (activeGoal.goal_amount || 0) - (activeGoal.current_saved_amount || 0)), recommended_monthly: alloc.goals[activeGoal.id] || 0 } : null,
      }
      const fallback = buildFallbackInsight(verified)
      let insight = fallback
      let source = 'fallback'
      try {
        if (process.env.OPENAI_API_KEY || process.env.EMERGENT_LLM_KEY) {
          const system = [
            'You are RupeeRizz, a supportive financial coach.',
            'Return STRICT JSON only with keys: insight, suggested_action, estimated_monthly_saving, related_goal_id, safety_note.',
            'Use only the supplied verified data. Never invent financial facts or numeric amounts.',
            'Do not shame the user. Do not recommend loans, investment products, trading, legal or tax actions.',
            'Keep the advice conservative, practical and specific.',
          ].join(' ')
          const parsed = await generateInsightWithLLM(system, `Verified data (INR):\n${JSON.stringify(verified)}`, uid)
          if (parsed && typeof parsed.insight === 'string') {
            const requestedSaving = Number(parsed.estimated_monthly_saving)
            const boundedSaving = Number.isFinite(requestedSaving)
              ? Math.max(0, Math.min(Math.round(verified.safe_monthly_saving || 0), Math.round(requestedSaving)))
              : fallback.estimated_monthly_saving
            insight = {
              insight: String(parsed.insight),
              suggested_action: String(parsed.suggested_action || fallback.suggested_action),
              estimated_monthly_saving: boundedSaving,
              related_goal_id: parsed.related_goal_id ?? (activeGoal ? activeGoal.id : null),
              safety_note: parsed.safety_note ?? null,
            }
            source = 'llm'
          }
        }
      } catch (e) { console.error('insight LLM error:', e?.message) }
      return json({ insight, source })
    }

    // ---------- READINESS REPORT ----------
    if (route === '/readiness-report' && method === 'GET') {
      if (!(await hasConsent(supabase, uid))) return json({ error: 'Consent required.', code: 'consent_required' }, 403)
      const ctx = await loadUserContext(supabase, uid)
      if (!ctx.profile) return json({ error: 'Profile not set', code: 'no_profile' }, 400)
      const finance = ctx.profile.finance || {}
      const snapshot = computeSnapshot(finance)
      const emergencyTarget = emergencyFundTarget(finance)
      const emergencyAmount = Math.round(finance.emergency_fund_amount || 0)
      const health = readinessScore({ snapshot, emergencyAmount, emergencyTarget })
      const guard = borrowGuard({ snapshot, emergencyAmount, emergencyTarget, estimatedNewEmi: 0 })
      const alloc = allocateSavings({ safe: snapshot.safe_monthly_saving, emergencyAmount, emergencyTarget, goals: ctx.goals })
      const cats = spendingByCategory(ctx.receipts)
      const goalsOut = ctx.goals.map((g) => ({ goal_name: g.goal_name, ...goalMetrics(g, alloc.goals[g.id] || 0), recommended_monthly: alloc.goals[g.id] || 0 }))
      const strengths = health.breakdown.filter((b) => b.points / b.max >= 0.7).map((b) => ({ label: b.label, note: b.note }))
      const improvements = health.breakdown.filter((b) => b.points / b.max < 0.5).map((b) => ({ label: b.label, note: b.note }))
      const suggestions = []
      if (emergencyAmount < emergencyTarget) suggestions.push(`Build a starter emergency buffer of ${formatINR(emergencyTarget)} (one month of essentials).`)
      if (snapshot.non_essential_expenses > 0) suggestions.push(`Trim non-essential spending (${formatINR(snapshot.non_essential_expenses)}/mo) to boost savings.`)
      if (snapshot.safe_monthly_saving > 0) suggestions.push(`Automate saving ${formatINR(snapshot.safe_monthly_saving)} each month toward your goals.`)
      if (!guard.canBorrow) suggestions.push('Strengthen cash flow and buffer before considering any borrowing.')
      if (snapshot.compulsory_emi > 0 && snapshot.reliable_monthly_income > 0 && (snapshot.compulsory_emi / snapshot.reliable_monthly_income) > 0.3) suggestions.push('Reduce EMI burden below 30% of reliable income.')
      return json({
        report: {
          name: ctx.profile.full_name, user_type: ctx.profile.user_type, state: ctx.profile.state, business_type: ctx.profile.business_type,
          generated_at: new Date().toISOString(),
          score: health.score, band: health.band, band_label: scoreBandLabel(health.band), breakdown: health.breakdown,
          snapshot, spending_by_category: cats, income_vs_expenses: [{ name: 'Income', amount: snapshot.reliable_monthly_income }, { name: 'Expenses', amount: snapshot.essential_expenses + snapshot.non_essential_expenses + snapshot.compulsory_emi + snapshot.business_operating_costs }],
          emergency: { amount: emergencyAmount, target: emergencyTarget }, goals: goalsOut, guard, strengths, improvements, suggestions,
        },
      })
    }

    // ---------- MY DATA ----------
    if (route === '/my-data/export' && method === 'GET') {
      const [{ data: profile }, { data: consents }, { data: receipts }, { data: goals }, { data: contributions }, { data: earnRadarSaved }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', uid),
        supabase.from('consents').select('*').eq('user_id', uid),
        supabase.from('receipts').select('*').eq('user_id', uid),
        supabase.from('savings_goals').select('*').eq('user_id', uid),
        supabase.from('goal_contributions').select('*').eq('user_id', uid),
        supabase.from('earn_radar_saved').select('*').eq('user_id', uid),
      ])
      const business_entries=await ownedRows(supabase,'business_entries',uid)
      return json({ export: { business_entries, user: { id: uid, email: user.email }, profile: profile?.[0] || null, consents: consents || [], receipts: receipts || [], goals: goals || [], contributions: contributions || [], earn_radar_saved: earnRadarSaved || [], exported_at: new Date().toISOString() } })
    }
    if (route === '/my-data/delete' && method === 'POST') {
      const {error:eraseError}=await supabase.rpc('erase_own_business_entries')
      if(eraseError) throw eraseError
      const { data: receipts } = await supabase.from('receipts').select('image_path').eq('user_id', uid)
      const paths = (receipts || []).map((r) => r.image_path).filter(Boolean)
      if (paths.length) { try { await supabase.storage.from(BUCKET).remove(paths) } catch (e) {} }
      await supabase.from('earn_radar_saved').delete().eq('user_id', uid)
      await supabase.from('goal_contributions').delete().eq('user_id', uid)
      await supabase.from('savings_goals').delete().eq('user_id', uid)
      await supabase.from('receipts').delete().eq('user_id', uid)
      await supabase.from('consents').update({ status: false, withdrawn_at: new Date().toISOString() }).eq('user_id', uid).eq('status', true)
      await supabase.from('profiles').update({ user_type: null, finance: {}, full_name: null, state: null, pathway: null, business_type: null }).eq('user_id', uid)
      await supabase.from('deletion_requests').insert({ user_id: uid, request_type: 'all_data', completed_at: new Date().toISOString() })
      return json({ ok: true, deleted_at: new Date().toISOString() })
    }

    return json({ error: `Route ${route} not found` }, 404)
  } catch (error) {
    console.error('API Error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

function buildFallbackInsight(v) {
  const cat = v.top_non_essential_category
  const goal = v.active_goal
  if (cat && cat.amount > 0) {
    const est = Math.max(80, Math.round(cat.amount * 0.2))
    return { insight: `You spent ${formatINR(cat.amount)} on ${cat.name} recently. Small, steady trims here add up fast.`, suggested_action: `Skip one ${cat.name.toLowerCase()} purchase each week.`, estimated_monthly_saving: est, related_goal_id: goal ? goal.id : null, safety_note: goal ? `Redirecting this could speed up your ${goal.name}.` : null }
  }
  return { insight: v.safe_monthly_saving > 0 ? `You can safely set aside ${formatINR(v.safe_monthly_saving)} this month.` : 'Your essentials use up your income right now - let us review spending together before any borrowing.', suggested_action: v.safe_monthly_saving > 0 ? 'Move your safe saving to your goal at the start of the month.' : 'List non-essential expenses and pick one to reduce.', estimated_monthly_saving: Math.max(0, Math.round(v.safe_monthly_saving * 0.5)), related_goal_id: goal ? goal.id : null, safety_note: null }
}

function parseModelJson(raw) {
  if (typeof raw !== 'string') return null
  let s = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
  const first = s.indexOf('{'); const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  try { return JSON.parse(s) } catch (e) { return null }
}

// ---------------- Live OCR (OCR.space) + multimodal LLM ----------------
function emergentLlmConfig() {
  return {
    provider: process.env.EMERGENT_INSIGHTS_LLM_PROVIDER || process.env.INSIGHTS_LLM_PROVIDER || 'openai',
    model: process.env.EMERGENT_INSIGHTS_LLM_MODEL || process.env.INSIGHTS_LLM_MODEL || 'gpt-4o-mini',
    fallbackModel: process.env.EMERGENT_INSIGHTS_LLM_FALLBACK_MODEL || process.env.INSIGHTS_LLM_FALLBACK_MODEL || 'gpt-4o-mini',
  }
}

const INSIGHT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    insight: { type: 'string' },
    suggested_action: { type: 'string' },
    estimated_monthly_saving: { type: 'number', minimum: 0 },
    related_goal_id: { type: ['string', 'null'] },
    safety_note: { type: ['string', 'null'] },
  },
  required: ['insight', 'suggested_action', 'estimated_monthly_saving', 'related_goal_id', 'safety_note'],
}

async function runLlmJson({ system, text, kind = 'insight', session }) {
  // Primary provider: direct OpenAI API. This is independent of Emergent credits.
  if (process.env.OPENAI_API_KEY) {
    const cfg = getOpenAIInsightsConfig()
    const candidates = [cfg.model,cfg.fallbackModel]
    let lastError = null
    for (const model of candidates.filter((m, i, a) => m && a.indexOf(m) === i)) {
      try {
        const result = await callOpenAIJson({
          system,
          text,

          model,
          schema: INSIGHT_JSON_SCHEMA,
          schemaName: 'rupeerizz_financial_insight',
          reasoningEffort: cfg.reasoningEffort,
          maxOutputTokens: cfg.maxOutputTokens,
          timeoutMs: cfg.timeoutMs,
        })
        if (result?.parsed) return result
      } catch (e) {
        lastError = e
        console.error(`OpenAI ${kind} attempt failed (${model}):`, e?.message)
      }
    }
    // Do not hide an OpenAI failure when Emergent is not configured. The receipt UI can then
    // truthfully tell the user that the direct provider failed instead of silently pretending AI ran.
    if (!process.env.EMERGENT_LLM_KEY) {
      return { error: lastError?.message || 'OpenAI request failed' }
    }
  }

  // Secondary provider: Emergent, retained as a fallback for users who still have credits.
  if (!process.env.EMERGENT_LLM_KEY) return null
  const { LlmChat, UserMessage } = await import('emergentintegrations')
  const cfg = emergentLlmConfig(kind)
  const candidates = [cfg.model, cfg.fallbackModel].filter((m, i, arr) => m && arr.indexOf(m) === i)
  let lastError = null

  for (const model of candidates) {
    try {
      const params = { max_completion_tokens: 700 }
      if (cfg.provider === 'openai') params.response_format = { type: 'json_object' }
      const chat = new LlmChat(process.env.EMERGENT_LLM_KEY, session || `${kind}-${Date.now()}`, system)
        .withModel(cfg.provider, model)
        .withParams(params)

      const reply = await chat.sendMessage(new UserMessage({ text }))
      const parsed = parseModelJson(reply)
      if (parsed) return { parsed, model, provider: 'emergent' }
      throw new Error('LLM returned non-JSON output')
    } catch (e) {
      lastError = e
      console.error(`Emergent ${kind} attempt failed (${cfg.provider}/${model}):`, e?.message)
    }
  }
  return { error: lastError?.message || 'LLM request failed' }
}

async function generateInsightWithLLM(system, prompt, uid) {
  const result = await runLlmJson({ system, text: prompt, kind: 'insight', session: `insight-${uid}-${Date.now()}` })
  return result?.parsed || null
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
