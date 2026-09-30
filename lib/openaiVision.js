const OPENAI_URL = 'https://api.openai.com/v1/responses'

export const OPENAI_RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    currency: { type: 'string' },
    category: { type: ['string', 'null'] },
    total: { type: ['number', 'null'], minimum: 0 },
    total_confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    items: {
      type: 'array',
      maxItems: 60,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          price: { type: ['number', 'null'], minimum: 0 },
          category: { type: ['string', 'null'] },
          confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
        },
        required: ['name', 'price', 'category', 'confidence'],
      },
    },
    needs_user_verification: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    reasoning_notes: { type: 'array', items: { type: 'string' }, maxItems: 8 },
  },
  required: [
    'merchant', 'date', 'currency', 'category', 'total', 'total_confidence',
    'items', 'needs_user_verification', 'reasoning_notes',
  ],
}

function collectOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim()
  const chunks = []
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text)
    }
  }
  return chunks.join('\n').trim()
}

function parseJsonText(text) {
  if (!text) return null
  let cleaned = text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1)
  try { return JSON.parse(cleaned) } catch { return null }
}

export function getOpenAIReceiptConfig() {
  return {
    model: process.env.OPENAI_RECEIPT_MODEL || 'gpt-5.6-sol',
    fallbackModel: process.env.OPENAI_RECEIPT_FALLBACK_MODEL || 'gpt-5.6-luna',
    arbiterModel: process.env.OPENAI_RECEIPT_ARBITER_MODEL || 'gpt-5.6-sol',
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || 'high',
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 60000),
    maxOutputTokens: Number(process.env.OPENAI_RECEIPT_MAX_OUTPUT_TOKENS || 1800),
  }
}

export function getOpenAIInsightsConfig() {
  return {
    model: process.env.OPENAI_INSIGHTS_MODEL || 'gpt-5.6-luna',
    fallbackModel: process.env.OPENAI_INSIGHTS_FALLBACK_MODEL || 'gpt-5.6-luna',
    reasoningEffort: process.env.OPENAI_INSIGHTS_REASONING || 'low',
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 60000),
    maxOutputTokens: Number(process.env.OPENAI_INSIGHTS_MAX_OUTPUT_TOKENS || 700),
  }
}

export async function callOpenAIJson({
  system,
  text,
  images = [],
  model,
  schema = OPENAI_RECEIPT_SCHEMA,
  schemaName = 'rupeerizz_receipt_extraction',
  reasoningEffort,
  maxOutputTokens = 1800,
  signal,
  timeoutMs = 60000,
}) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null

  const content = [
    { type: 'input_text', text },
    ...images.filter(Boolean).map((imageUrl) => ({
      type: 'input_image',
      image_url: imageUrl,
      detail: 'high',
    })),
  ]

  const body = {
    model,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: system }],
      },
      {
        role: 'user',
        content,
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: schemaName,
        strict: true,
        schema,
      },
    },
    max_output_tokens: maxOutputTokens,
  }
  if (reasoningEffort) body.reasoning = { effort: reasoningEffort }

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: signal || AbortSignal.timeout(timeoutMs),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI HTTP ${response.status}`
    throw new Error(message)
  }
  if (data?.status === 'incomplete') {
    throw new Error(`OpenAI response incomplete: ${data?.incomplete_details?.reason || 'unknown reason'}`)
  }

  const outputText = collectOutputText(data)
  const parsed = parseJsonText(outputText)
  if (!parsed) throw new Error('OpenAI returned no valid JSON output')

  return {
    parsed,
    model,
    provider: 'openai-direct',
    response_id: data?.id || null,
  }
}
