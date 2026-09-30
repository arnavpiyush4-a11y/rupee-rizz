import { z } from 'zod'

export const OCR_CATEGORIES = [
  'Food & Drinks', 'Travel', 'Shopping', 'Education', 'Bills', 'Health',
  'Business Supplies', 'Inventory', 'Rent', 'Marketing', 'Other',
]

export function normalizeCategory(c) {
  if (!c) return 'Other'
  const raw = String(c).trim().toLowerCase()
  const aliases = {
    food: 'Food & Drinks', restaurant: 'Food & Drinks', dining: 'Food & Drinks',
    transport: 'Travel', transportation: 'Travel', cab: 'Travel', taxi: 'Travel',
    grocery: 'Food & Drinks', groceries: 'Food & Drinks',
    medical: 'Health', medicine: 'Health', healthcare: 'Health',
    stationery: 'Education', books: 'Education', school: 'Education', college: 'Education',
    utility: 'Bills', utilities: 'Bills', telecom: 'Bills', electricity: 'Bills',
    office: 'Business Supplies', supplies: 'Business Supplies',
    stock: 'Inventory', goods: 'Inventory',
    advertising: 'Marketing', ads: 'Marketing',
  }
  if (aliases[raw]) return aliases[raw]
  return OCR_CATEGORIES.find((x) => x.toLowerCase() === raw) || 'Other'
}

export const OcrItemSchema = z.object({
  name: z.string().min(1).max(120),
  price: z.number().nonnegative().nullable().optional(),
  category: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
})

export const OcrSchema = z.object({
  merchant: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  currency: z.string().optional(),
  category: z.string().nullable().optional(),
  total: z.number().nonnegative().nullable().optional(),
  total_confidence: z.number().min(0).max(1).nullable().optional(),
  items: z.array(OcrItemSchema).max(60).optional(),
  needs_user_verification: z.array(z.string()).optional(),
  reasoning_notes: z.array(z.string()).max(8).optional(),
})

const INR_WORDS = [
  'grand total', 'total amount', 'net amount', 'amount payable', 'amount due',
  'bill total', 'payable', 'balance due', 'invoice total', 'net total', 'total',
]
const PAYMENT_WORDS = [
  'cash', 'upi', 'card', 'credit', 'debit', 'payment', 'paid', 'change', 'tender',
  'subtotal', 'tax', 'gst', 'cgst', 'sgst', 'round off', 'discount', 'amount received',
  'cashier', 'counter', 'credit card', 'debit card', 'no. of items', 'no of items',
  'number of items', 'items purchased', 'qty', 'quantity',
]

export function cleanOcrText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeMoneyToken(token) {
  if (token == null || token === '') return null
  let s = String(token)
    .replace(/₹/g, '')
    .replace(/rs\.?/ig, '')
    .replace(/inr/ig, '')
    .replace(/[oO]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[^0-9.,-]/g, '')
    .trim()
  if (!/[0-9]/.test(s)) return null

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) s = s.replace(/,/g, '')
    else s = s.replace(/\./g, '').replace(',', '.')
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '')
  } else if (lastComma >= 0 && s.length - lastComma - 1 === 2) {
    s = s.replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n < 100000000 ? n : null
}

const MONEY_RE = /(?:₹|rs\.?|inr\s*)?\s*([0-9][0-9OoIl|]{0,2}(?:[,\.][0-9OoIl|]{2,3})*|[0-9][0-9OoIl|]{0,7}(?:[\.,][0-9OoIl|]{1,2})?)/gi

export function getOcrMoneyValues(rawText) {
  const text = cleanOcrText(rawText)
  return [...text.matchAll(MONEY_RE)]
    .map((m) => normalizeMoneyToken(m[1]))
    .filter((n) => n != null)
}

export function valueAppearsInOcr(value, rawText) {
  const n = Number(value)
  if (!Number.isFinite(n)) return false
  return getOcrMoneyValues(rawText).some((x) => Math.abs(x - n) < 0.011)
}

function normalizeDateParts(m) {
  let y, mo, d
  if (m[1].length === 4) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3])
  } else {
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]); if (y < 100) y += 2000
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function extractDate(line) {
  const patterns = [
    /\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/,
    /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})\b/,
    /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2})\b/,
  ]
  for (const p of patterns) {
    const m = line.match(p)
    if (m) {
      const date = normalizeDateParts(m)
      if (date) return date
    }
  }
  return null
}

function merchantScore(line, index) {
  const cleaned = line.replace(/[^\p{L}\p{N}&.'()\- ]/gu, ' ').replace(/\s+/g, ' ').trim()
  const l = cleaned.toLowerCase()
  if (!cleaned || cleaned.length < 3 || cleaned.length > 90) return -Infinity
  if (!/[A-Za-z\p{L}]/u.test(cleaned)) return -Infinity
  const blocked = /invoice|invoice no|bill no|receipt|gstin|phone|mobile|date|time|cashier|table|address|www\.|@/.test(l)
  if (blocked) return -Infinity
  if (PAYMENT_WORDS.some((w) => l === w)) return -Infinity
  if (INR_WORDS.some((w) => l === w)) return -Infinity
  let score = 0
  if (index === 0) score += 0.45
  if (index === 1) score += 0.25
  if (/\b(pvt|ltd|limited|mart|store|cafe|restaurant|hotel|market|foods|food|bakery|supermart|pharmacy|clinic)\b/i.test(cleaned)) score += 0.35
  if (cleaned.split(/\s+/).length >= 2) score += 0.15
  if (/\d/.test(cleaned)) score -= 0.15
  return score
}

function isMetadataLikeLine(line) {
  const low = String(line || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!low) return true
  return /\b(?:invoice|bill|receipt|gstin|fssai|phone|mobile|email|www\.|http|cashier|counter|cust\s*id|customer|walk[- ]?in|table\s*no|order\s*type|date|time|registered office|store address|address|pin\s*:?\s*\d{5,6}|pincode|tender|credit\s*card|debit\s*card|upi|payment|paid|amount\s+(?:received|paid)|change|no\.?\s*of\s*items|number\s+of\s*items|total\s*qty|total\s+quantity|qty|quantity|subtotal|sub\s*total|total|grand total|amount due|amount payable|net amount|balance due|tax|gst|cgst|sgst|round off|discount)\b/i.test(low)
}

function cleanItemName(name) {
  return String(name || '')
    .replace(/^[\s\d.)-]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*\d{4,}\s*\/\s*\d+(?:[.,]\d{2})?\s*$/, '')
    .replace(/[\-:]+$/, '')
    .trim()
}

function inferItemCategory(name, merchant = '') {
  const s = `${name || ''} ${merchant || ''}`.toLowerCase()
  if (/coffee|tea|sandwich|food|meal|restaurant|cafe|bakery|pizza|burger|biryani|snack|juice|drink/.test(s)) return 'Food & Drinks'
  if (/shirt|t-?shirt|jeans|denim|dress|trouser|pant|shoe|sandal|bag|fashion|zudio|mart|clothing|apparel/.test(s)) return 'Shopping'
  if (/uber|ola|metro|bus|fuel|petrol|diesel|auto|cab|taxi|travel/.test(s)) return 'Travel'
  if (/book|stationery|pen|notebook|college|school|tuition|course/.test(s)) return 'Education'
  if (/medicine|pharmacy|hospital|clinic|doctor|health/.test(s)) return 'Health'
  if (/electricity|water|internet|mobile|broadband|utility/.test(s)) return 'Bills'
  return 'Other'
}

function amountTokensWithSpans(text) {
  const out = []
  const decimalRe = /(?:₹|rs\.?|inr\s*)?\s*([0-9][0-9OoIl|,]{0,8}\.[0-9OoIl|]{2})/gi
  for (const m of String(text || '').matchAll(decimalRe)) {
    const value = normalizeMoneyToken(m[1])
    if (value != null) out.push({ value, start: m.index, end: m.index + m[0].length })
  }
  return out
}

function parseLineItem(line, nextLine = '') {
  const cleaned = String(line || '').replace(/^[^\p{L}\p{N}]*/u, '').trim()
  if (!cleaned || isMetadataLikeLine(cleaned)) return null

  // Taxable-value / HSN continuation lines often look like item descriptions but are
  // not actual line-item amounts. Prefer the preceding SKU/product-code row instead.
  if (/\//.test(cleaned) && /\b\d{4,}\b/.test(cleaned) && !/^\d+[.)]?\s+[A-Za-z]/.test(cleaned)) return null

  const amounts = amountTokensWithSpans(cleaned)
  if (!amounts.length) return null
  const first = amounts[0]
  const before = cleaned.slice(0, first.start).trim()
  const sameLineName = cleanItemName(before.replace(/\s+\d+\s*$/, ''))

  let name = null
  let price = null
  if (/[A-Za-z\p{L}]{2,}/u.test(sameLineName) && !/^\d+$/.test(sameLineName)) {
    name = sameLineName
    price = amounts.at(-1)?.value ?? null
  } else if (/^\d{7,}(?:\s|$)/.test(cleaned) && nextLine && /[A-Za-z\p{L}]{3,}/u.test(nextLine) && !isMetadataLikeLine(nextLine)) {
    name = cleanItemName(nextLine)
    price = amounts.at(-1)?.value ?? null
  }

  if (!name || price == null || name.length < 2 || name.length > 120) return null
  const low = name.toLowerCase()
  if (/^(bengaluru|bangalore|bhubaneswar|mumbai|delhi|odisha|karnataka|maharashtra)$/i.test(low)) return null
  if (/\b(?:cashier|counter|credit\s*card|debit\s*card|payment|upi|tender|table\s*no|no\.?\s*of\s*items|number\s+of\s*items|total\s*qty|gstin|fssai|phone|mobile)\b/i.test(low)) return null
  const digits = (name.match(/\d/g) || []).length
  const letters = (name.match(/[A-Za-z\p{L}]/gu) || []).length
  if (digits >= 7 && digits > letters * 2) return null

  return { name, price, category: inferItemCategory(name), confidence: 0.62 }
}

function parseContextualOcrItems(lines, merchant = '') {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const item = parseLineItem(lines[i], lines[i + 1] || '')
    if (!item) continue
    if (merchant && tokenOverlap(item.name, merchant) >= 0.85) continue
    out.push(item)
    if (out.length >= 40) break
  }
  return out
}

export function parseReceiptDeterministically(rawText) {
  const text = cleanOcrText(rawText)
  const lines = text.split('\n').map((x) => x.trim()).filter(Boolean)
  const lower = lines.map((x) => x.toLowerCase())

  const candidates = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const l = lower[i]
    const nums = [...line.matchAll(MONEY_RE)].map((m) => normalizeMoneyToken(m[1])).filter((n) => n != null)
    if (!nums.length) continue

    // Never treat counters, item counts, cashier/payment lines or card numbers as a receipt total.
    if (/\b(?:no\.?\s*of\s*items|number\s+of\s+items|items\s+(?:purchased|count)|qty|quantity)\b/.test(l)) continue
    if (/\b(?:cashier|counter|credit\s*card|debit\s*card|upi\s*id|payment|tender|amount\s+received|change)\b/.test(l)) continue
    if (/\b(?:invoice\s*(?:no|number)|bill\s*(?:no|number)|phone|mobile|gstin)\b/.test(l) && !/\b(?:grand|net|amount|total|payable|due)\b/.test(l)) continue

    const keyword = INR_WORDS.find((w) => l.includes(w))
    if (keyword && !/subtotal|tax|gst|discount|change/.test(l)) {
      const score = keyword === 'grand total' ? 1.0 : keyword === 'total' ? 0.9 : /amount due|amount payable|net amount|balance due/.test(keyword) ? 0.86 : 0.82
      candidates.push({ value: nums.at(-1), score, line, keyword })
    } else if (!keyword && /\b(net|amount payable|amount due|payable|balance due)\b/.test(l) && !/subtotal|tax|gst/.test(l)) {
      candidates.push({ value: nums.at(-1), score: 0.76, line, keyword: 'amount' })
    }
  }

  // Never break ties by choosing the larger amount. That was a major source of false totals.
  candidates.sort((a, b) => (b.score - a.score) || (a.line.length - b.line.length))
  const primary = candidates[0] || null
  const totalCandidates = []
  for (const c of candidates) {
    if (!totalCandidates.some((x) => Math.abs(x.value - c.value) < 0.011)) totalCandidates.push(c)
  }

  let date = null
  const dateCandidates = []
  for (const line of lines) {
    const d = extractDate(line)
    if (d && !dateCandidates.includes(d)) dateCandidates.push(d)
  }
  if (dateCandidates.length === 1) date = dateCandidates[0]

  let merchant = null
  let merchantConfidence = 0
  const merchantCandidates = lines.slice(0, Math.min(lines.length, 10))
    .map((line, index) => ({ line: line.replace(/\s+/g, ' ').trim(), score: merchantScore(line, index) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => b.score - a.score)
  if (merchantCandidates[0]) {
    merchant = merchantCandidates[0].line
    merchantConfidence = Math.max(0.35, Math.min(0.82, 0.45 + merchantCandidates[0].score * 0.45))
  }

  const items = parseContextualOcrItems(lines, merchant)

  const needs = []
  if (!merchant) needs.push('merchant')
  if (!date) needs.push('date')
  if (!primary) needs.push('total')
  if (dateCandidates.length > 1) needs.push('date')
  if (totalCandidates.length > 1) needs.push('total')

  return {
    merchant,
    merchant_confidence: merchant ? merchantConfidence : 0,
    date,
    date_candidates: dateCandidates,
    currency: 'INR',
    total: primary?.value ?? null,
    total_confidence: primary ? Math.min(0.88, primary.score) : 0,
    total_candidates: totalCandidates.slice(0, 8).map((c) => ({ value: c.value, confidence: Math.min(0.88, c.score), line: c.line })),
    items,
    needs_user_verification: [...new Set(needs)],
  }
}

function normalizeComparable(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\p{L}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function tokenOverlap(a, b) {
  const A = new Set(normalizeComparable(a).split(' ').filter((x) => x.length >= 2))
  const B = new Set(normalizeComparable(b).split(' ').filter((x) => x.length >= 2))
  if (!A.size || !B.size) return 0
  let common = 0
  for (const x of A) if (B.has(x)) common++
  return common / Math.max(A.size, B.size)
}

function reconcileField(a, b, field) {
  if (a == null && b == null) return { value: null, confidence: 0, agreement: 'missing' }
  if (a == null) return { value: b, confidence: 0.62, agreement: 'one_pass' }
  if (b == null) return { value: a, confidence: 0.62, agreement: 'one_pass' }
  if (field === 'merchant') {
    const overlap = tokenOverlap(a, b)
    if (overlap >= 0.7) return { value: a, confidence: 0.9, agreement: 'consensus' }
    return { value: a, confidence: 0.48, agreement: 'conflict' }
  }
  if (field === 'number') {
    if (Math.abs(Number(a) - Number(b)) < 0.011) return { value: Number(a), confidence: 0.93, agreement: 'consensus' }
    return { value: Number(a), confidence: 0.45, agreement: 'conflict' }
  }
  if (a === b) return { value: a, confidence: 0.91, agreement: 'consensus' }
  return { value: a, confidence: 0.45, agreement: 'conflict' }
}

function dedupeItems(items = []) {
  return (items || []).filter((item) => item?.name && item.price != null).slice(0, 40)
}

function mergeItemEvidenceLists(pass1 = [], pass2 = []) {
  const key = (item) => `${normalizeComparable(item.name)}|${Number(item.price).toFixed(2)}`
  const buckets = new Map()
  for (const source of [pass1 || [], pass2 || []]) {
    const counts = new Map()
    for (const item of source) {
      if (!item?.name || item.price == null) continue
      const k = key(item)
      const entry = counts.get(k) || { item, count: 0 }
      entry.count += 1
      counts.set(k, entry)
    }
    for (const [k, entry] of counts) {
      const existing = buckets.get(k)
      buckets.set(k, { item: existing?.item || entry.item, count: Math.max(existing?.count || 0, entry.count) })
    }
  }
  return [...buckets.values()].flatMap(({ item, count }) => Array.from({ length: count }, () => ({ ...item }))).slice(0, 40)
}

export function reconcileOcrPasses(pass1Text, pass2Text) {
  const p1 = parseReceiptDeterministically(pass1Text)
  const p2 = parseReceiptDeterministically(pass2Text)
  const merchant = reconcileField(p1.merchant, p2.merchant, 'merchant')
  const total = reconcileField(p1.total, p2.total, 'number')
  const date = reconcileField(p1.date, p2.date, 'date')
  const items = mergeItemEvidenceLists(p1.items || [], p2.items || [])
  const needs = new Set([...(p1.needs_user_verification || []), ...(p2.needs_user_verification || [])])

  if (merchant.agreement === 'conflict') needs.add('merchant')
  if (total.agreement !== 'consensus') needs.add('total')
  if (date.agreement !== 'consensus') needs.add('date')
  if (!total.value) needs.add('total')
  if (!merchant.value) needs.add('merchant')
  if (!date.value) needs.add('date')

  return {
    merchant: merchant.value,
    merchant_confidence: merchant.confidence,
    date: date.value,
    date_confidence: date.confidence,
    currency: 'INR',
    total: total.value,
    total_confidence: total.confidence,
    items,
    needs_user_verification: [...needs],
    evidence: {
      pass_1: p1,
      pass_2: p2,
      total_agreement: total.agreement,
      merchant_agreement: merchant.agreement,
      date_agreement: date.agreement,
      total_candidates: [...(p1.total_candidates || []), ...(p2.total_candidates || [])].slice(0, 12),
      ocr_conflict: total.agreement === 'conflict' || merchant.agreement === 'conflict' || date.agreement === 'conflict',
    },
  }
}

export function validateVisionResult(modelOutput) {
  const parsed = OcrSchema.safeParse(modelOutput)
  if (!parsed.success) return null
  const d = parsed.data
  return {
    merchant: d.merchant ? String(d.merchant).trim() : null,
    date: d.date || null,
    currency: 'INR',
    category: normalizeCategory(d.category),
    total: d.total != null ? Number(d.total) : null,
    total_confidence: d.total_confidence ?? null,
    items: (d.items || []).map((i) => ({
      name: String(i.name || '').trim(),
      price: i.price != null ? Number(i.price) : null,
      category: normalizeCategory(i.category),
      confidence: i.confidence ?? null,
    })).filter((i) => i.name),
    needs_user_verification: d.needs_user_verification || [],
    reasoning_notes: d.reasoning_notes || [],
  }
}

function sumKnownItemPrices(items = []) {
  const values = items.map((i) => Number(i?.price)).filter((n) => Number.isFinite(n) && n >= 0)
  return values.length ? values.reduce((a, b) => a + b, 0) : null
}

function amountsAgree(a, b) {
  return a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.011
}


function labeledAmount(rawText, labels) {
  const text = cleanOcrText(rawText)
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\d₹]{0,30}(?:₹|rs\\.?|inr\\s*)?\\s*([0-9]{1,3}(?:[,\\.][0-9]{2,3})*|[0-9]{1,8}(?:[\\.,][0-9]{1,2})?)`, 'i')
    const m = text.match(re)
    if (m) {
      const value = normalizeMoneyToken(m[1])
      if (value != null) return value
    }
  }
  return null
}

export function validateReceiptArithmetic({ total, items = [], rawText = '' } = {}) {
  const finalTotal = Number(total)
  if (!Number.isFinite(finalTotal)) {
    return { status: 'missing_total', confidence: 0, item_sum: null, tax: null, discount: null, payment: null, notes: ['No numeric receipt total is available for arithmetic validation.'] }
  }

  const itemSum = sumKnownItemPrices(items)
  const tax = labeledAmount(rawText, ['(?:grand|total)?\\s*(?:tax|gst|cgst|sgst)', '(?:taxes|tax)'])
  const discount = labeledAmount(rawText, ['discount', 'disc\\.'])
  const payment = labeledAmount(rawText, ['credit\\s+card', 'debit\\s+card', 'upi', 'tender(?:\\s+detail)?', 'amount\\s+paid', 'paid'])
  const candidates = []
  if (itemSum != null) candidates.push({ label: 'items', value: itemSum })
  if (itemSum != null && tax != null) candidates.push({ label: 'items_plus_tax', value: itemSum + tax })
  if (itemSum != null && discount != null) candidates.push({ label: 'items_minus_discount', value: itemSum - discount })
  if (itemSum != null && tax != null && discount != null) candidates.push({ label: 'items_plus_tax_minus_discount', value: itemSum + tax - discount })

  const matchingCandidate = candidates.find((c) => Math.abs(c.value - finalTotal) <= Math.max(0.05, finalTotal * 0.0025))
  const paymentMatches = payment != null && Math.abs(payment - finalTotal) <= Math.max(0.05, finalTotal * 0.0025)

  if (matchingCandidate || paymentMatches) {
    const signals = [matchingCandidate ? matchingCandidate.label : null, paymentMatches ? 'payment' : null].filter(Boolean)
    return {
      status: 'reconciled',
      confidence: matchingCandidate && paymentMatches ? 0.99 : 0.96,
      item_sum: itemSum,
      tax,
      discount,
      payment,
      notes: [`Receipt arithmetic reconciled via ${signals.join(' + ')}.`],
    }
  }

  if (itemSum != null && Math.abs(itemSum - finalTotal) > Math.max(0.5, finalTotal * 0.02)) {
    return {
      status: 'unreconciled',
      confidence: 0.45,
      item_sum: itemSum,
      tax,
      discount,
      payment,
      notes: [`Known item prices sum to ${itemSum.toFixed(2)}, which does not reconcile to total ${finalTotal.toFixed(2)}.`],
    }
  }

  return { status: 'insufficient-evidence', confidence: 0.62, item_sum: itemSum, tax, discount, payment, notes: ['Arithmetic evidence is insufficient to independently confirm the total.'] }
}

export function mergeVisionWithEvidence(vision, ocrEvidence, rawText, imageQuality = null) {
  const v = vision || {}
  const e = ocrEvidence || {}
  const raw = cleanOcrText(rawText)
  const hasOcr = raw.length > 0
  const ocrTotal = e.total != null ? Number(e.total) : null
  const vTotal = v.total != null ? Number(v.total) : null
  const visionItemSum = sumKnownItemPrices(v.items || [])

  let total = null
  let totalConfidence = 0
  let totalSource = 'needs-verification'
  const needs = new Set([...(e.needs_user_verification || []), ...(v.needs_user_verification || [])])
  if (imageQuality?.level === 'low') needs.add('image_quality')
  const notes = [...(v.reasoning_notes || [])]

  if (amountsAgree(vTotal, ocrTotal)) {
    total = vTotal
    totalConfidence = Math.min(0.99, Math.max(0.94, Number(v.total_confidence) || 0.94, Number(e.total_confidence) || 0))
    totalSource = 'vision+ocr-consensus'
  } else if (e.evidence?.total_agreement === 'consensus' && ocrTotal != null) {
    total = ocrTotal
    totalConfidence = Math.min(0.97, Number(e.total_confidence) || 0.91)
    totalSource = 'ocr-consensus'
    if (vTotal != null && !amountsAgree(vTotal, ocrTotal)) needs.add('total')
  } else if (!hasOcr && vTotal != null) {
    total = vTotal
    totalConfidence = Math.min(0.88, Number(v.total_confidence) || 0.78)
    totalSource = 'vision-only'
    // A single vision source is useful, but the user should still confirm it.
    needs.add('total')
  } else if (vTotal != null) {
    total = vTotal
    totalConfidence = Math.min(0.78, Number(v.total_confidence) || 0.65)
    totalSource = 'vision-disagrees-with-ocr'
    needs.add('total')
  } else if (ocrTotal != null) {
    total = ocrTotal
    totalConfidence = Math.min(0.66, Number(e.total_confidence) || 0.6)
    totalSource = 'ocr-single-pass'
    needs.add('total')
  } else {
    needs.add('total')
  }

  // Arithmetic sanity check: if vision extracted item prices whose sum disagrees materially
  // with the proposed total, keep the field editable. If they agree, record the extra signal.
  if (vTotal != null && visionItemSum != null) {
    if (amountsAgree(vTotal, visionItemSum)) {
      notes.push('Item-price arithmetic agrees with the extracted total.')
      if (totalSource === 'vision-only') totalConfidence = Math.min(0.92, totalConfidence + 0.06)
    } else if (Math.abs(vTotal - visionItemSum) > 0.5) {
      needs.add('total')
      notes.push(`Item-price arithmetic (${visionItemSum.toFixed(2)}) does not match the proposed total (${vTotal.toFixed(2)}).`)
    }
  }


  let arithmetic = null

  const merchant = reconcileField(v.merchant, e.merchant, 'merchant')
  const date = reconcileField(v.date, e.date, 'date')
  if (merchant.agreement !== 'consensus' && hasOcr) needs.add('merchant')
  if (date.agreement !== 'consensus' && hasOcr) needs.add('date')

  if (hasOcr && total != null && !valueAppearsInOcr(total, raw)) needs.add('total')
  if (!merchant.value) needs.add('merchant')
  if (!date.value) needs.add('date')
  if (total == null || totalConfidence < 0.85) needs.add('total')

  const visionItems = (v.items || []).map((i) => {
    const grounded = !hasOcr || i.price == null || valueAppearsInOcr(i.price, raw)
    if (!grounded) needs.add('items')
    return { ...i, confidence: grounded ? i.confidence : Math.min(Number(i.confidence) || 0.55, 0.6) }
  })

  const ocrItems = (e.items || []).map((i) => ({ ...i, category: normalizeCategory(i.category) })).slice(0, 40)
  let items
  if (visionItems.length) {
    const visionArithmeticSum = sumKnownItemPrices(visionItems)
    const ocrArithmeticSum = sumKnownItemPrices(ocrItems)
    const visionLooksCoherent = visionArithmeticSum == null || total == null || Math.abs(visionArithmeticSum - total) <= Math.max(0.5, total * 0.02)
    const ocrLooksCoherent = ocrArithmeticSum == null || total == null || Math.abs(ocrArithmeticSum - total) <= Math.max(0.5, total * 0.02)
    if (hasOcr && ocrItems.length && !visionLooksCoherent && ocrLooksCoherent) {
      items = ocrItems
      needs.add('items')
      notes.push('Vision line items did not reconcile with the receipt total; structured OCR items were retained for verification.')
    } else {
      items = visionItems.slice(0, 40)
    }
  } else {
    items = ocrItems
    if (items.length) needs.add('items')
  }

  const category = normalizeCategory(v.category) !== 'Other'
    ? normalizeCategory(v.category)
    : (items.find((i) => i.category && i.category !== 'Other')?.category || 'Other')

  // Validate against the final selected line items. Do not let discarded/bad model
  // candidates poison the arithmetic status shown to the user.
  arithmetic = validateReceiptArithmetic({ total, items, rawText: raw })
  if (arithmetic.status === 'unreconciled') needs.add('total')
  if (arithmetic.notes?.length) notes.push(...arithmetic.notes)
  if (arithmetic.status === 'reconciled' && total != null) {
    totalConfidence = Math.min(0.99, Math.max(totalConfidence, arithmetic.confidence))
  }
  if (hasOcr && !v.llm_meta && items.length) needs.add('items')

  // Verification must reflect the weakest critical signal, not just a good total.
  const criticalArithmeticOk = !items.length || arithmetic.status === 'reconciled'
  const verified = needs.size === 0 && total != null && totalConfidence >= 0.85 && criticalArithmeticOk && !!vision
  const overall = verified
    ? 0.97
    : Math.max(0.40, Math.min(0.84, totalConfidence || merchant.confidence || date.confidence || 0.5))

  return {
    merchant: merchant.value,
    date: date.value,
    currency: 'INR',
    category,
    total,
    total_confidence: totalConfidence,
    items,
    needs_user_verification: [...needs],
    ocr_text_preview: raw.slice(0, 3000),
    reasoning_notes: notes.slice(0, 8),
    extraction_meta: {
      version: '6.0',
      source: totalSource,
      passes: e?.evidence ? 2 : 0,
      hybrid: hasOcr,
      multimodal: !!vision,
      verified,
      overall_confidence: overall,
      ocr_conflict: !!e.evidence?.ocr_conflict,
      image_quality: imageQuality || null,
      llm_model: v.llm_meta?.model || null,
      llm_provider: v.llm_meta?.provider || null,
      llm_error: v.__llm_error || null,
    },
    evidence: {
      total: { ocr: ocrTotal, vision: vTotal, source: totalSource, confidence: totalConfidence, item_sum: visionItemSum },
      arithmetic,
      ocr: e.evidence || null,
      llm_notes: notes,
      llm_model: v.llm_meta?.model || null,
      llm_provider: v.llm_meta?.provider || null,
      llm_error: v.__llm_error || null,
    },
  }
}

