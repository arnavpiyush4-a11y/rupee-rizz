import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { createRequestClient } from '@/lib/supabase/request'
import {
  computeSnapshot, emergencyFundTarget, goalMetrics, requiredMonthly,
  allocateSavings, readinessScore, borrowGuard, scoreBandLabel,
} from '@/lib/finance'
import { formatINR } from '@/lib/format'
import { SCHEMES, matchSchemes } from '@/lib/schemes'
import { demoOcrExtract, maskSensitive } from '@/lib/demo'
import {
  cleanOcrText, mergeVisionWithEvidence, reconcileOcrPasses, validateVisionResult,
} from '@/lib/receiptEngine'
import { callOpenAIJson, getOpenAIReceiptConfig, getOpenAIInsightsConfig } from '@/lib/openaiVision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'receipts'

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
  return { profile: pr?.[0] || null, goals: goals || [], receipts: receipts || [] }
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

    const auth = await getAuth(request)
    if (!auth) return json({ error: 'Not authenticated', code: 'no_auth' }, 401)
    const { supabase, user } = auth
    const uid = user.id

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
      if (!rateLimit(uid, 'receipt-ai', 8)) return json({ error: 'AI receipt analysis is rate-limited. Please try again shortly.', code: 'ai_rate_limited' }, 429)

      const body = await request.json().catch(() => ({}))
      const parsed = parseDataUrl(body.image)
      if (!parsed) return json({ error: 'A valid image is required.', code: 'bad_image' }, 400)
      if (!ALLOWED_MIME.includes(parsed.mime)) return json({ error: 'Only JPG, PNG or WebP images are allowed.', code: 'bad_mime' }, 400)
      if (parsed.bytes > 10 * 1024 * 1024) return json({ error: 'Image must be under 10 MB.', code: 'too_large' }, 400)

      const ocrConfigured = !!process.env.OCR_API_KEY && (process.env.OCR_PROVIDER || 'ocrspace') === 'ocrspace'
      const llmConfigured = !!(process.env.OPENAI_API_KEY || process.env.EMERGENT_LLM_KEY)
      const requestedMode = (process.env.OCR_MODE || 'live').toLowerCase()
      const mode = requestedMode === 'demo' ? 'demo' : 'live'
      const { count } = await supabase.from('receipts').select('id', { count: 'exact', head: true }).eq('user_id', uid)

      let extraction = null
      let usedMode = 'demo'

      if (mode === 'live' && !ocrConfigured && !llmConfigured) {
        return json({ error: 'Live receipt AI is not configured. Add OPENAI_API_KEY for direct OpenAI vision, optionally OCR_API_KEY for OCR.space corroboration, or set OCR_MODE=demo intentionally.', code: 'ai_not_configured' }, 503)
      }

      if (mode === 'live' && (ocrConfigured || llmConfigured)) {
        try {
          const quality = await assessReceiptImageQuality(body.image)
          const enhanced = await preprocessReceiptImage(body.image)
          const ocr = ocrConfigured
            ? await ocrSpaceExtractMultiPass(body.image, process.env.OCR_API_KEY)
            : { pass1: { text: '', ok: false }, pass2: { text: '', ok: false }, pass_count: 0, enhanced }
          const rawText = [ocr.pass1?.text, ocr.pass2?.text].filter(Boolean).join('\n\n--- OCR PASS ---\n\n')
          const evidence = reconcileOcrPasses(ocr.pass1?.text || '', ocr.pass2?.text || '')
          let vision = llmConfigured
            ? await structureReceiptWithVisionLLM({ originalDataUrl: body.image, enhancedDataUrl: ocr.enhanced || enhanced, ocr })
            : null

          const visionValid = vision && !vision.__llm_error ? vision : null
          const visionTotal = visionValid?.total != null ? Number(visionValid.total) : null
          const ocrTotal = evidence?.total != null ? Number(evidence.total) : null
          const needsArbitration = !!visionValid && (
            !!evidence?.evidence?.ocr_conflict ||
            (visionTotal != null && ocrTotal != null && Math.abs(visionTotal - ocrTotal) >= 0.011) ||
            (visionValid.needs_user_verification || []).includes('total')
          )

          if (needsArbitration) {
            const arbiter = await arbitrateReceiptWithVisionLLM({
              originalDataUrl: body.image,
              enhancedDataUrl: ocr.enhanced || enhanced,
              ocr: evidence,
              firstVision: visionValid,
            })
            if (arbiter && !arbiter.__llm_error) vision = arbiter
          }

          extraction = mergeVisionWithEvidence(vision?.__llm_error ? null : vision, evidence, rawText, quality)
          extraction.extraction_meta = {
            ...extraction.extraction_meta,
            llm_configured: llmConfigured,
            llm_used: !!vision && !vision.__llm_error,
            llm_provider: vision?.llm_meta?.provider || null,
            llm_model: vision?.llm_meta?.model || null,
            llm_role: vision?.llm_meta?.role || 'primary',
            llm_error: vision?.__llm_error || null,
            llm_status: vision?.__llm_error ? 'failed' : (vision ? 'used' : (llmConfigured ? 'not_used' : 'not_configured')),
            ocr_provider_configured: ocrConfigured,
            ocr_passes_completed: ocr.pass_count,
            provider: ocrConfigured ? (process.env.OCR_PROVIDER || 'ocrspace') : 'openai-vision-only',
            image_quality: quality,
          }
          usedMode = vision
            ? (ocrConfigured ? 'live_openai_vision_ocr_hybrid' : 'live_openai_vision')
            : (ocrConfigured ? 'live_ocr_hybrid' : 'live_needs_verification')
        } catch (e) {
          console.error('live receipt analysis failed:', e?.message)
        }
      }

      if (!extraction) {
        if (mode === 'live') {
          extraction = {
            merchant: null,
            date: null,
            currency: 'INR',
            total: null,
            total_confidence: 0,
            items: [],
            needs_user_verification: ['merchant', 'date', 'total'],
            extraction_meta: {
              version: '3.0',
              verified: false,
              llm_configured: llmConfigured,
              llm_used: false,
              failure: true,
            },
          }
          usedMode = 'live_needs_verification'
        } else {
          extraction = demoOcrExtract(count || 0)
          usedMode = 'demo'
        }
      }

      const merchantScan = maskSensitive(extraction.merchant || '')
      return json({
        extraction,
        mode: usedMode,
        sensitive_found: merchantScan.found,
        pipeline: {
          ocr: ocrConfigured ? 'OCR.space Engine 2 · dual-pass · original + enhanced' : 'OpenAI vision OCR · image-aware',
          llm: llmConfigured ? `${extraction.extraction_meta?.llm_provider || 'openai-direct'} / ${extraction.extraction_meta?.llm_model || process.env.OPENAI_RECEIPT_MODEL || 'gpt-5.6-sol'} · multimodal` : 'not configured',
          verification_required: (extraction.needs_user_verification || []).length > 0,
          direct_openai: !!process.env.OPENAI_API_KEY,
          emergent_fallback: !!process.env.EMERGENT_LLM_KEY,
          image_quality: extraction.extraction_meta?.image_quality || null,
          arithmetic: extraction.evidence?.arithmetic || null,
        },
      })
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
      const items = (body.items || []).map((it) => ({ item_name: maskSensitive(it.item_name || it.name || '').text, price: Number(it.price) || 0, category: it.category || 'Other', confidence: it.confidence ?? null }))
      let image_path = null
      const parsed = parseDataUrl(body.image)
      if (parsed && ALLOWED_MIME.includes(parsed.mime) && parsed.bytes <= 8 * 1024 * 1024) {
        try {
          image_path = `${uid}/${rid}/original_receipt.jpg`
          const buffer = Buffer.from(parsed.b64, 'base64')
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(image_path, buffer, { contentType: parsed.mime, upsert: false })
          if (upErr) { console.error('storage upload:', upErr.message); image_path = null }
        } catch (e) { console.error('storage err', e?.message); image_path = null }
      }
      const row = { id: rid, user_id: uid, merchant: mMerchant.text, receipt_date: body.receipt_date || null, currency: body.currency || 'INR', total: body.total != null ? Number(body.total) : null, category: body.category || (items[0]?.category) || 'Other', image_path, overall_confidence: body.overall_confidence ?? null, user_verified: body.user_verified !== false, items }
      const { data, error } = await supabase.from('receipts').insert(row).select().single()
      if (error) return json({ error: error.message }, 400)
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
    if (path[0] === 'receipts' && path.length === 2 && method === 'PUT') {
      const body = await request.json().catch(() => ({}))
      const items = (body.items || []).map((it) => ({ item_name: maskSensitive(it.item_name || it.name || '').text, price: Number(it.price) || 0, category: it.category || 'Other', confidence: it.confidence ?? null }))
      const upd = { merchant: maskSensitive(body.merchant || '').text, receipt_date: body.receipt_date || null, total: body.total != null ? Number(body.total) : null, category: body.category || 'Other', items, user_verified: true }
      const { data, error } = await supabase.from('receipts').update(upd).eq('id', path[1]).select()
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
      const [{ data: profile }, { data: consents }, { data: receipts }, { data: goals }, { data: contributions }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', uid),
        supabase.from('consents').select('*').eq('user_id', uid),
        supabase.from('receipts').select('*').eq('user_id', uid),
        supabase.from('savings_goals').select('*').eq('user_id', uid),
        supabase.from('goal_contributions').select('*').eq('user_id', uid),
      ])
      return json({ export: { user: { id: uid, email: user.email }, profile: profile?.[0] || null, consents: consents || [], receipts: receipts || [], goals: goals || [], contributions: contributions || [], exported_at: new Date().toISOString() } })
    }
    if (route === '/my-data/delete' && method === 'POST') {
      const { data: receipts } = await supabase.from('receipts').select('image_path').eq('user_id', uid)
      const paths = (receipts || []).map((r) => r.image_path).filter(Boolean)
      if (paths.length) { try { await supabase.storage.from(BUCKET).remove(paths) } catch (e) {} }
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
function dataUrlToBuffer(dataUrl) {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return null
  return Buffer.from(parsed.b64, 'base64')
}

function bufferToDataUrl(buffer, mime = 'image/jpeg') {
  return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`
}


async function assessReceiptImageQuality(dataUrl) {
  const input = dataUrlToBuffer(dataUrl)
  if (!input) return { score: 0, level: 'low', warnings: ['Invalid image data.'] }
  const base = sharp(input, { failOn: 'none' }).rotate()
  const meta = await base.metadata()
  const sample = await base.clone().resize({ width: 256, height: 256, fit: 'inside' }).grayscale().raw().toBuffer({ resolveWithObject: true })
  const data = sample.data
  const width = sample.info.width
  const height = sample.info.height
  let sum = 0
  let sum2 = 0
  let bright = 0
  for (const px of data) {
    sum += px
    sum2 += px * px
    if (px >= 250) bright++
  }
  const count = Math.max(1, data.length)
  const mean = sum / count
  const variance = Math.max(0, sum2 / count - mean * mean)
  let lapSum = 0
  let lapSum2 = 0
  let lapCount = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap = data[i - width] + data[i - 1] + data[i + 1] + data[i + width] - 4 * data[i]
      lapSum += lap
      lapSum2 += lap * lap
      lapCount++
    }
  }
  const lapMean = lapCount ? lapSum / lapCount : 0
  const lapVariance = lapCount ? Math.max(0, lapSum2 / lapCount - lapMean * lapMean) : 0
  const glareRatio = bright / count
  const widthPx = meta.width || width
  const heightPx = meta.height || height
  const longest = Math.max(widthPx, heightPx)
  const shortest = Math.min(widthPx, heightPx)
  const aspect = shortest ? longest / shortest : 0

  const warnings = []
  let score = 100
  if (longest < 1200) { score -= 25; warnings.push('Image resolution is low for small receipt text.') }
  if (variance < 900) { score -= 20; warnings.push('Image contrast is low.') }
  if (lapVariance < 40) { score -= 25; warnings.push('Image may be blurry or out of focus.') }
  if (glareRatio > 0.10) { score -= 15; warnings.push('Bright glare/washed-out areas may hide text.') }
  if (aspect > 8) { score -= 10; warnings.push('Receipt is extremely narrow; capture the full page if possible.') }
  score = Math.max(0, Math.min(100, Math.round(score)))
  return {
    score,
    level: score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low',
    warnings: [...new Set(warnings)],
    metrics: { width: widthPx, height: heightPx, mean_brightness: Math.round(mean), contrast: Math.round(Math.sqrt(variance)), sharpness: Math.round(lapVariance), glare_ratio: Number(glareRatio.toFixed(3)) },
  }
}

async function preprocessReceiptImage(dataUrl) {
  const input = dataUrlToBuffer(dataUrl)
  if (!input) throw new Error('Invalid receipt image')
  const image = sharp(input, { failOn: 'none' }).rotate()
  const meta = await image.metadata()
  const longest = Math.max(meta.width || 0, meta.height || 0)
  const target = Math.min(2600, Math.max(1800, longest || 2200))
  const enhanced = await image
    .flatten({ background: '#ffffff' })
    .resize({ width: target, height: target, fit: 'inside', withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize({ lower: 1, upper: 99 })
    .sharpen({ sigma: 1.05, m1: 0.8, m2: 2.2 })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer()
  return bufferToDataUrl(enhanced)
}

async function ocrSpaceExtractText(dataUrl, apiKey, engine = '2', isTable = true) {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return ''
  const ftMap = { 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/jpg': 'JPG', 'image/webp': 'JPG' }
  const form = new FormData()
  form.append('base64Image', dataUrl)
  form.append('language', 'auto')
  form.append('isTable', isTable ? 'true' : 'false')
  form.append('OCREngine', engine)
  form.append('scale', 'true')
  form.append('detectOrientation', 'true')
  form.append('isOverlayRequired', 'false')
  if (ftMap[parsed.mime]) form.append('filetype', ftMap[parsed.mime])
  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: apiKey },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`OCR provider HTTP ${res.status}`)
  const data = await res.json()
  if (data?.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join('; ') : (data.ErrorMessage || 'OCR error')
    throw new Error(msg)
  }
  const results = Array.isArray(data.ParsedResults) ? data.ParsedResults : []
  return results.map((r) => r?.ParsedText || '').join('\n').trim()
}

async function ocrSpaceExtractMultiPass(dataUrl, apiKey) {
  const enhanced = await preprocessReceiptImage(dataUrl)
  const results = await Promise.allSettled([
    ocrSpaceExtractText(dataUrl, apiKey, '2', true),
    ocrSpaceExtractText(enhanced, apiKey, '2', true),
  ])
  const pass1 = results[0]?.status === 'fulfilled' ? cleanOcrText(results[0].value) : ''
  const pass2 = results[1]?.status === 'fulfilled' ? cleanOcrText(results[1].value) : ''
  return {
    pass1: { text: pass1, ok: !!pass1 },
    pass2: { text: pass2, ok: !!pass2 },
    pass_count: [pass1, pass2].filter(Boolean).length,
    enhanced,
  }
}

function emergentLlmConfig(kind = 'receipt') {
  if (kind === 'receipt') {
    return {
      provider: process.env.EMERGENT_RECEIPT_LLM_PROVIDER || process.env.RECEIPT_LLM_PROVIDER || 'openai',
      model: process.env.EMERGENT_RECEIPT_LLM_MODEL || process.env.RECEIPT_LLM_MODEL || 'gpt-4o',
      fallbackModel: process.env.EMERGENT_RECEIPT_LLM_FALLBACK_MODEL || process.env.RECEIPT_LLM_FALLBACK_MODEL || 'gpt-4o-mini',
    }
  }
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

async function runLlmJson({ system, text, images = [], kind = 'receipt', session }) {
  // Primary provider: direct OpenAI API. This is independent of Emergent credits.
  if (process.env.OPENAI_API_KEY) {
    const cfg = kind === 'receipt' ? getOpenAIReceiptConfig() : getOpenAIInsightsConfig()
    const candidates = kind === 'receipt'
      ? [cfg.model, cfg.fallbackModel]
      : [cfg.model, cfg.fallbackModel]
    let lastError = null
    for (const model of candidates.filter((m, i, a) => m && a.indexOf(m) === i)) {
      try {
        const result = await callOpenAIJson({
          system,
          text,
          images,
          model,
          schema: kind === 'receipt' ? undefined : INSIGHT_JSON_SCHEMA,
          schemaName: kind === 'receipt' ? 'rupeerizz_receipt_extraction' : 'rupeerizz_financial_insight',
          reasoningEffort: cfg.reasoningEffort,
          maxOutputTokens: kind === 'receipt' ? cfg.maxOutputTokens : cfg.maxOutputTokens,
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
  const { LlmChat, UserMessage, ImageContent } = await import('emergentintegrations')
  const cfg = emergentLlmConfig(kind)
  const candidates = [cfg.model, cfg.fallbackModel].filter((m, i, arr) => m && arr.indexOf(m) === i)
  let lastError = null

  for (const model of candidates) {
    try {
      const params = { max_completion_tokens: kind === 'receipt' ? 1600 : 700 }
      if (cfg.provider === 'openai') params.response_format = { type: 'json_object' }
      const chat = new LlmChat(process.env.EMERGENT_LLM_KEY, session || `${kind}-${Date.now()}`, system)
        .withModel(cfg.provider, model)
        .withParams(params)

      const fileContents = images
        .filter(Boolean)
        .map((dataUrl) => {
          const p = parseDataUrl(dataUrl)
          return p ? new ImageContent(p.b64) : null
        })
        .filter(Boolean)

      const reply = await chat.sendMessage(new UserMessage({ text, file_contents: fileContents }))
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

async function structureReceiptWithVisionLLM({ originalDataUrl, enhancedDataUrl, ocr }) {
  if (!process.env.OPENAI_API_KEY && !process.env.EMERGENT_LLM_KEY) return null
  const system = [
    'You are RupeeRizz Receipt Vision, a strict financial-document extraction engine.',
    'The receipt image is the primary evidence. OCR text is supporting evidence and may be wrong.',
    'Read the printed document layout, not just isolated numbers. Distinguish totals from item counts, quantities, tax, tender/payment amounts, cashier IDs, invoice numbers and barcode values.',
    'The grand/net/payable invoice total is the amount the customer owes for the receipt. Never use NO. OF ITEMS or TOTAL QTY as the receipt total.',
    'For an item, use the printed line item description and the line amount in the receipt table. Do not create items from tax, payment, cashier, counter, tender, subtotal or metadata lines.',
    'Return ONLY valid JSON. Never invent a value. If the image is ambiguous, return null and add the field to needs_user_verification.',
    'Use YYYY-MM-DD for dates. Default currency to INR unless another currency is clearly printed.',
    'Return an overall receipt category based on the purchased items and merchant.',
    `Allowed categories: ${['Food & Drinks', 'Travel', 'Shopping', 'Education', 'Bills', 'Health', 'Business Supplies', 'Inventory', 'Rent', 'Marketing', 'Other'].join(', ')}.`,
    'If item prices are readable, check whether their arithmetic supports the final invoice amount. Treat arithmetic as a validation signal, not a reason to invent missing values.',
  ].join('\n')

  const p1 = ocr?.pass1?.text || '(OCR pass 1 unavailable)'
  const p2 = ocr?.pass2?.text || '(OCR pass 2 unavailable)'
  const prompt = [
    'Analyze the attached receipt image(s). Use the original image as the source of truth and the enhanced image for faint text.',
    'OCR PASS 1:', p1.slice(0, 3500),
    'OCR PASS 2:', p2.slice(0, 3500),
    'Produce the final structured receipt fields. Focus especially on the printed TOTAL/GRAND TOTAL/AMOUNT PAYABLE and line-item table.',
  ].join('\n\n')

  const images = [originalDataUrl]
  if (enhancedDataUrl && enhancedDataUrl !== originalDataUrl) images.push(enhancedDataUrl)
  const result = await runLlmJson({ system, text: prompt, images, kind: 'receipt', session: `receipt-${Date.now()}` })
  if (!result || result.error) return result ? { __llm_error: result.error } : null
  const validated = validateVisionResult(result.parsed)
  if (!validated) return { __llm_error: 'LLM returned invalid structured output' }
  validated.llm_meta = { model: result.model, provider: result.provider, response_id: result.response_id || null }
  return validated
}

async function arbitrateReceiptWithVisionLLM({ originalDataUrl, enhancedDataUrl, ocr, firstVision }) {
  if (!process.env.OPENAI_API_KEY && !process.env.EMERGENT_LLM_KEY) return null
  const cfg = getOpenAIReceiptConfig()
  const system = [
    'You are the final RupeeRizz receipt adjudicator.',
    'Resolve disagreements between OCR and a first vision extraction by re-reading the receipt image.',
    'Never guess. For every disputed field, select a value only when the printed receipt clearly supports it; otherwise return null and request verification.',
    'The field total means the final amount payable on the receipt, not item count, total quantity, tax, subtotal, cash tendered or a payment authorization value unless it is explicitly the final payable amount.',
    'Do not create metadata such as cashier IDs or invoice numbers as line items.',
  ].join('\n')
  const prompt = [
    'OCR evidence:', JSON.stringify(ocr?.evidence || null),
    'First vision extraction:', JSON.stringify(firstVision || null),
    'Re-read the attached image and return the best-supported structured extraction.',
  ].join('\n\n')
  const result = await runLlmJson({ system, text: prompt, images: [originalDataUrl, enhancedDataUrl], kind: 'receipt', session: `receipt-arbiter-${Date.now()}` })
  if (!result || result.error) return result ? { __llm_error: result.error } : null
  const validated = validateVisionResult(result.parsed)
  if (!validated) return { __llm_error: 'Arbiter returned invalid structured output' }
  validated.llm_meta = { model: result.model, provider: result.provider, response_id: result.response_id || null, role: 'arbiter' }
  return validated
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
