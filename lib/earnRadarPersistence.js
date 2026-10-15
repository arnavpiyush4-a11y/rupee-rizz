// Safe, user-facing classification for Supabase errors in Earn Radar persistence.
// This module contains no credentials and does not expose raw upstream error text.

export function classifyEarnRadarStorageError(error) {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()
  const combined = `${message} ${details}`

  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    /relation ["']?public\.earn_radar_saved["']? does not exist/.test(combined) ||
    /could not find the table ["']?public\.earn_radar_saved["']? in the schema cache/.test(combined) ||
    /table ["']?earn_radar_saved["']? does not exist/.test(combined)
  ) {
    return {
      code: 'earn_radar_migration_required',
      message: 'Earn Radar saved-opportunity storage is not available yet. Check that supabase/migrations/0002_earn_radar.sql has been applied to this Supabase project and that its schema cache has refreshed.',
    }
  }

  if (code === '42501' || /row-level security|permission denied|not authorized|violates.*policy/.test(combined)) {
    return {
      code: 'earn_radar_storage_permission_denied',
      message: 'Supabase denied access to saved opportunities. Check the authenticated session and Earn Radar row-level security policies; no changes were reported as successful.',
    }
  }

  return {
    code: 'earn_radar_storage_unavailable',
    message: 'Saved opportunities could not be accessed in Supabase. Check the project URL, public API key, database connectivity, and permissions, then retry.',
  }
}

export function isEarnRadarDuplicateError(error) {
  return String(error?.code || '') === '23505'
}

export function sanitizeSavedCompensation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const finite = (value) => Number.isFinite(value) && value >= 0 ? Number(value) : null
  const pick = (value, max = 220) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : ''
  const minAmount = finite(raw.minAmount)
  const maxAmount = finite(raw.maxAmount)
  if (minAmount === null || maxAmount === null || maxAmount < minAmount) return null
  const currencyCode = ['INR', 'USD', 'CAD', 'AUD', 'GBP', 'EUR'].includes(raw.currencyCode) ? raw.currencyCode : null
  const basis = ['hourly', 'daily', 'weekly', 'monthly', 'annual', 'project_or_task', 'commission', 'unspecified'].includes(raw.basis) ? raw.basis : 'unspecified'
  return {
    minAmount,
    maxAmount,
    currencyCode,
    currency: pick(raw.currency, 60) || (currencyCode || 'Currency not specified'),
    basis,
    unit: pick(raw.unit, 40) || null,
    display: pick(raw.display, 120) || null,
    evidence: pick(raw.evidence, 220) || null,
    confidence: ['high', 'medium'].includes(raw.confidence) ? raw.confidence : 'medium',
    validationStatus: 'stated_compensation_context',
  }
}

export function isSaveableEarnRadarOpportunity(raw) {
  return Boolean(
    raw && typeof raw === 'object' && !Array.isArray(raw) &&
    raw.listingType === 'individual_opportunity' &&
    raw.listingStatus === 'individual_opportunity_identified' &&
    raw.independentlyVerified === false &&
    typeof raw.url === 'string' && raw.url.trim()
  )
}
