'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowUpRight, Bookmark, BriefcaseBusiness, Check, ChevronDown,
  Clock3, ExternalLink, Filter, MapPin, Radar, RefreshCw, Search, ShieldCheck,
  Sparkles, Target, Trash2, TrendingUp, X,
} from 'lucide-react'
import { api } from '@/lib/apiClient'
import { useApp } from '@/app/providers'
import { EARN_RADAR_CATEGORIES, EARN_RADAR_STATUSES } from '@/lib/earnRadarRules.js'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0)
const statusLabel = (status) => ({ saved: 'Saved', interested: 'Interested', applied: 'Applied', interview: 'Interview', accepted: 'Accepted', rejected: 'Rejected', completed: 'Completed' }[status] || 'Saved')

function trackingErrorMessage(error, action = 'accessed') {
  if (error?.code === 'no_auth') return 'Sign in to your RupeeRizz account to access saved opportunities.'
  if (error?.code === 'consent_required') return 'Complete the RupeeRizz consent step before searching or tracking opportunities.'
  if (error?.code === 'earn_radar_migration_required') {
    return 'Earn Radar saved-opportunity storage is missing from this Supabase project. Apply supabase/migrations/0002_earn_radar.sql in the correct project, then retry. If you already ran it, refresh the Supabase API schema cache and check the table name.'
  }
  if (error?.code === 'earn_radar_storage_permission_denied') {
    return `Supabase denied access while ${action} saved opportunities. Check that you are signed in and that the Earn Radar row-level security policies are installed correctly.`
  }
  if (error?.code === 'earn_radar_storage_unavailable') {
    return `Saved opportunities could not be ${action}. Check Supabase project configuration, database connectivity, and permissions. No change was reported as successful.`
  }
  return error?.message || `Saved opportunities could not be ${action}. Please retry.`
}

function Field({ label, hint, children }) {
  return <label className="er-field"><span className="er-field-label">{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function MatchMeter({ score = 0 }) {
  return <div className="er-match-meter" aria-label={`${score} out of 100 match`}><span style={{ width: `${Math.min(100, Math.max(0, score))}%` }} /></div>
}

function DeadlinePill({ feasibility }) {
  const status = feasibility?.status || 'unknown'
  const Icon = status === 'possible_not_guaranteed' ? Check : status === 'unlikely' ? Clock3 : AlertTriangle
  return <span className={`er-feasibility er-feasibility--${status}`}><Icon size={12} />{feasibility?.label || 'Payment timing unknown'}</span>
}

function OpportunityCard({ opportunity, onSave, saving, compareSelected, onCompare, detailOpen, onToggleDetail, saved }) {
  const flags = opportunity.screening?.flags || []
  return (
    <article className="er-opportunity-card">
      <div className="er-opportunity-main">
        <div className="er-opportunity-source-row">
          <span className="er-source-mark"><BriefcaseBusiness size={15} /></span>
          <span className="er-source-name">{opportunity.source || 'Public listing'}</span>
          <span className="er-source-status er-source-status--muted">Individual listing candidate</span>
          {opportunity.pageExtractionStatus === 'page_text_extracted' && opportunity.sourceExtracted
            ? <span className="er-source-status" title="Listing-specific details were extracted from the page; the listing has not been independently verified."><Check size={11} /> Listing details extracted · not verified</span>
            : opportunity.pageExtractionStatus === 'page_text_extracted'
              ? <span className="er-source-status er-source-status--muted" title="The page returned text, but listing-specific details were not confirmed. Matching relies on the search snippet.">Page text extracted · details unconfirmed</span>
              : <span className="er-source-status er-source-status--muted" title="Page extraction was unavailable or access-restricted; this candidate relies on the search snippet.">Snippet only · not verified</span>}
        </div>
        <h3>{opportunity.title}</h3>
        <p className="er-opportunity-description">{opportunity.description || 'Open the original source for full details.'}</p>
        <div className="er-opportunity-meta">
          <span><BriefcaseBusiness size={13} />{opportunity.employer || opportunity.source || 'Employer not established'}</span>
          <span><MapPin size={13} />{opportunity.location || 'Location not stated'}</span>
          <span><Clock3 size={13} />{opportunity.payoutTiming?.label || 'Payment timing not stated'}</span>
        </div>
        <div className="er-comp-row">
          <div><small>Advertised compensation</small><strong>{opportunity.advertisedCompensation || 'Not found in source'}</strong></div>
          <div className="er-match-summary"><span>{opportunity.match?.score ?? 0}% match</span><MatchMeter score={opportunity.match?.score || 0} /></div>
        </div>
        <DeadlinePill feasibility={opportunity.feasibility} />
        {flags.length > 0 && <div className="er-warning-inline"><AlertTriangle size={14} /><span>{flags[0]}{flags.length > 1 ? ` (+${flags.length - 1} more flag${flags.length > 2 ? 's' : ''})` : ''}</span></div>}
      </div>
      <div className="er-opportunity-actions">
        <label className="er-compare-check"><input type="checkbox" checked={compareSelected} onChange={(e) => onCompare(opportunity, e.target.checked)} /><span>Compare</span></label>
        <button className="er-btn er-btn--ghost" type="button" onClick={() => onToggleDetail(opportunity.url)}>{detailOpen ? 'Hide details' : 'Details'}<ChevronDown size={14} className={detailOpen ? 'er-chevron-open' : ''} /></button>
        {saved
          ? <span className="er-saved-mark"><Check size={14} /> Saved</span>
          : <button className="er-btn er-btn--dark" type="button" onClick={() => onSave(opportunity)} disabled={saving}><Bookmark size={14} />{saving ? 'Saving…' : 'Save'}</button>}
        <a className="er-btn er-btn--link" href={opportunity.url} target="_blank" rel="noopener noreferrer">Original listing <ArrowUpRight size={14} /></a>
      </div>
      {detailOpen && (
        <div className="er-opportunity-detail">
          <div className="er-detail-grid">
            <div><small>Requirements / eligibility</small><p>{opportunity.requirements || 'Not captured. Review the original listing.'}</p></div>
            <div><small>Posting date</small><p>{opportunity.postingDate || 'Not stated'}</p></div>
            <div><small>Application deadline</small><p>{opportunity.applicationDeadline || 'Not captured'}</p></div>
            <div><small>Work arrangement</small><p>{({ remote: 'Remote mentioned', hybrid: 'Hybrid mentioned', onsite: 'On-site mentioned', not_stated: 'Not stated' })[opportunity.workArrangement] || 'Not stated'}</p></div>
            <div><small>Compensation evidence</small><p>{opportunity.compensation?.evidence || 'No salary-specific evidence found. Check the original source.'}</p></div>
          </div>
          <div className="er-detail-reasons"><strong>Why it matched</strong>{(opportunity.match?.reasons || []).map((reason, i) => <span key={`${reason}-${i}`}>• {reason}</span>)}</div>
          <div className="er-deadline-note"><strong>Deadline assessment:</strong> {opportunity.feasibility?.explanation || 'Payment timing has not been confirmed.'}</div>
          {flags.length > 0 && <div className="er-risk-panel"><strong><AlertTriangle size={14} /> Automated screening flagged</strong>{flags.map((flag, i) => <span key={`${flag}-${i}`}>{flag}</span>)}<small>{opportunity.screening?.note}</small></div>}
          {flags.length === 0 && <div className="er-screening-note"><ShieldCheck size={14} /> {opportunity.screening?.note || 'Automated screening only; review original terms before accepting.'}</div>}
          {opportunity.sourceExcerpt && <details className="er-source-excerpt"><summary>View extracted source text</summary><p>{opportunity.sourceExcerpt}</p></details>}
          <a className="er-original-link" href={opportunity.url} target="_blank" rel="noopener noreferrer">Review original source <ExternalLink size={13} /></a>
        </div>
      )}
    </article>
  )
}

function SavedOpportunityCard({ row, onStatus, onRemove, updatingId }) {
  const opportunity = row.opportunity || {}
  return (
    <article className="er-saved-card">
      <div className="er-saved-card-copy">
        <span className="er-source-name">{row.source || opportunity.source || 'Saved source'}</span>
        <h3>{row.title || opportunity.title || 'Earning opportunity'}</h3>
        <p>{opportunity.description || 'Open the source to review its current terms.'}</p>
        <p><strong>Advertised compensation:</strong> {opportunity.advertisedCompensation || 'Not found in source'}</p>
        <p className="er-saved-verification-note">{opportunity.detailsStatus === 'details_extracted_from_source_not_independently_verified' ? 'Page details extracted; listing not independently verified.' : 'Based on available search evidence; listing not independently verified.'}</p>
        <a href={row.source_url} target="_blank" rel="noopener noreferrer">Open original listing <ArrowUpRight size={13} /></a>
      </div>
      <div className="er-saved-card-controls">
        <label className="er-field er-field--compact"><span className="er-field-label">My status</span><select value={row.status || 'saved'} disabled={updatingId === row.id} onChange={(e) => onStatus(row, e.target.value)}>{EARN_RADAR_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        <button type="button" className="er-icon-action er-icon-action--danger" title="Remove saved opportunity" aria-label="Remove saved opportunity" onClick={() => onRemove(row)}><Trash2 size={15} /></button>
      </div>
    </article>
  )
}

export function EarnRadarView() {
  const { profile } = useApp()
  const [form, setForm] = useState(() => ({ goalAmount: '', deadline: '', skills: '', experience: '', timePerDay: '2', location: '', workPreference: 'remote', categories: ['freelance', 'tutoring', 'internships'], minCompensation: '' }))
  const [results, setResults] = useState(null)
  const [savedItems, setSavedItems] = useState([])
  const [tab, setTab] = useState('search')
  const [loading, setLoading] = useState(false)
  const [savedLoading, setSavedLoading] = useState(true)
  const [savedLoadFailed, setSavedLoadFailed] = useState(false)
  const [pageError, setPageError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savingUrl, setSavingUrl] = useState('')
  const [updatingId, setUpdatingId] = useState('')
  const [expandedUrl, setExpandedUrl] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('match')
  const [compareItems, setCompareItems] = useState([])

  useEffect(() => {
    if (profile?.state) setForm((current) => current.location ? current : ({ ...current, location: profile.state }))
  }, [profile?.state])

  const loadSaved = useCallback(async () => {
    setSavedLoading(true)
    try {
      const response = await api('/earn-radar/saved')
      setSavedItems(response.saved || [])
      setSavedLoadFailed(false)
      setSaveError('')
    } catch (error) {
      setSavedLoadFailed(true)
      setSaveError(trackingErrorMessage(error, 'loaded'))
    } finally {
      setSavedLoading(false)
    }
  }, [])

  useEffect(() => { loadSaved() }, [loadSaved])

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const toggleCategory = (category) => setForm((current) => ({ ...current, categories: current.categories.includes(category) ? current.categories.filter((c) => c !== category) : [...current.categories, category] }))

  const runSearch = async (event) => {
    event.preventDefault()
    setPageError('')
    if (!form.categories.length) {
      setPageError('Choose at least one opportunity category so the search has a clear direction.')
      return
    }
    setLoading(true)
    setResults(null)
    setCompareItems([])
    setExpandedUrl('')
    try {
      const response = await api('/earn-radar/search', { method: 'POST', body: {
        goalAmount: Number(form.goalAmount), deadline: form.deadline,
        skills: form.skills.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean), experience: form.experience,
        timePerDay: Number(form.timePerDay), location: form.location,
        workPreference: form.workPreference, categories: form.categories,
        minCompensation: form.minCompensation === '' ? null : Number(form.minCompensation),
      } })
      setResults(response)
    } catch (error) {
      if (error.code === 'tinyfish_not_configured') setPageError('TinyFish is not configured on this server yet. Add TINYFISH_API_KEY to .env.local locally and to your production environment, then restart/redeploy. No sample listings are shown in its place.')
      else if (['earn_radar_migration_required', 'earn_radar_storage_permission_denied', 'earn_radar_storage_unavailable'].includes(error.code)) setPageError(trackingErrorMessage(error, 'accessed'))
      else setPageError(error.message || 'Earn Radar could not complete the search. Please check your details and retry.')
    } finally { setLoading(false) }
  }

  const saveOpportunity = async (opportunity) => {
    setSavingUrl(opportunity.url)
    setSaveError('')
    try {
      const response = await api('/earn-radar/saved', { method: 'POST', body: { opportunity } })
      setSavedItems((current) => current.some((item) => item.id === response.saved.id) ? current : [response.saved, ...current])
    } catch (error) {
      setSaveError(trackingErrorMessage(error, 'saved'))
    } finally { setSavingUrl('') }
  }

  const updateStatus = async (row, status) => {
    setUpdatingId(row.id)
    setSaveError('')
    try {
      const response = await api(`/earn-radar/saved/${row.id}`, { method: 'PUT', body: { status } })
      setSavedItems((current) => current.map((item) => item.id === row.id ? response.saved : item))
    } catch (error) { setSaveError(error.message || 'The status could not be updated.') }
    finally { setUpdatingId('') }
  }

  const removeSaved = async (row) => {
    setUpdatingId(row.id)
    setSaveError('')
    try {
      await api(`/earn-radar/saved/${row.id}`, { method: 'DELETE' })
      setSavedItems((current) => current.filter((item) => item.id !== row.id))
    } catch (error) { setSaveError(error.message || 'The saved item could not be removed.') }
    finally { setUpdatingId('') }
  }

  const toggleCompare = (opportunity, checked) => {
    setCompareItems((current) => {
      if (checked) return current.length >= 3 ? current : [...current.filter((item) => item.url !== opportunity.url), opportunity]
      return current.filter((item) => item.url !== opportunity.url)
    })
  }

  const savedUrls = useMemo(() => new Set(savedItems.map((item) => item.source_url)), [savedItems])
  const visibleResults = useMemo(() => {
    const items = (results?.opportunities || []).filter((item) => {
      if (filter === 'possible') return item.feasibility?.status === 'possible_not_guaranteed'
      if (filter === 'unknown') return item.feasibility?.status === 'unknown'
      if (filter === 'caution') return (item.screening?.flags || []).length > 0
      return true
    })
    return items.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'pay' ? String(b.advertisedCompensation || '').localeCompare(String(a.advertisedCompensation || '')) : (b.match?.score || 0) - (a.match?.score || 0))
  }, [results, filter, sort])

  return (
    <section className="er-page">
      <div className="er-hero">
        <div className="er-hero-copy">
          <div className="er-eyebrow"><span className="er-eyebrow-dot" /> REAL-WORLD OPPORTUNITIES <span className="er-live-label"><Radar size={12} /> Earn Radar</span></div>
          <h1>Make your next<br /><em>earning move.</em></h1>
          <p>Find real earning opportunities that fit your goal, skills, time, and deadline — without relying on borrowing.</p>
          <div className="er-hero-proof"><span><Search size={13} /> Live web search</span><span><ShieldCheck size={13} /> Scam-awareness checks</span><span><Target size={13} /> Deadline-aware matching</span></div>
        </div>
        <div className="er-radar-visual" aria-hidden="true"><span className="er-radar-ring er-radar-ring--one" /><span className="er-radar-ring er-radar-ring--two" /><span className="er-radar-ring er-radar-ring--three" /><span className="er-radar-sweep" /><span className="er-radar-center"><Radar size={26} /></span><span className="er-radar-point er-radar-point--one" /><span className="er-radar-point er-radar-point--two" /><span className="er-radar-point er-radar-point--three" /></div>
      </div>

      <div className="er-tabs" role="tablist" aria-label="Earn Radar pages">
        <button type="button" role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'is-active' : ''} onClick={() => setTab('search')}><Radar size={15} /> Search opportunities</button>
        <button type="button" role="tab" aria-selected={tab === 'saved'} className={tab === 'saved' ? 'is-active' : ''} onClick={() => { setTab('saved'); loadSaved() }}><Bookmark size={15} /> Saved & tracked <span>{savedLoading ? '…' : savedLoadFailed ? '!' : savedItems.length}</span></button>
      </div>

      {saveError && <div className="er-alert er-alert--warning"><AlertTriangle size={16} /><span>{saveError}</span><button type="button" onClick={() => setSaveError('')} aria-label="Dismiss"><X size={14} /></button></div>}
      {pageError && <div className="er-alert er-alert--error"><AlertTriangle size={16} /><span>{pageError}</span><button type="button" onClick={() => setPageError('')} aria-label="Dismiss"><X size={14} /></button></div>}

      {tab === 'search' && <>
        <form className="er-search-form" onSubmit={runSearch}>
          <div className="er-form-title-row"><div><span className="er-section-kicker">01 / YOUR TARGET</span><h2>What are you working toward?</h2><p>Only share what helps us find a better fit. Your goal is never shown to employers.</p></div><div className="er-target-icon"><Target size={21} /></div></div>
          <div className="er-form-grid er-form-grid--top">
            <Field label="Amount still needed (₹)" hint="The remaining amount you need to earn."><input className="er-input" type="number" min="100" max="10000000" step="100" required value={form.goalAmount} onChange={(e) => setField('goalAmount', e.target.value)} placeholder="e.g. 5000" /></Field>
            <Field label="Money needed by" hint="We assess payout timing against this date."><input className="er-input" type="date" required min={new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)} value={form.deadline} onChange={(e) => setField('deadline', e.target.value)} /></Field>
            <Field label="Hours available per day"><select className="er-input" value={form.timePerDay} onChange={(e) => setField('timePerDay', e.target.value)}>{['0.5', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16'].map((hours) => <option value={hours} key={hours}>{hours} {hours === '1' ? 'hour' : 'hours'}</option>)}</select></Field>
          </div>
          <div className="er-form-grid er-form-grid--skills">
            <Field label="Skills & strengths" hint="Separate with commas. Add only skills you can genuinely offer."><textarea className="er-input er-textarea" rows={3} value={form.skills} onChange={(e) => setField('skills', e.target.value)} placeholder="e.g. Java, Python, tutoring, graphic design" /></Field>
            <div className="er-form-side-fields">
              <Field label="Experience / portfolio (optional)"><input className="er-input" value={form.experience} onChange={(e) => setField('experience', e.target.value)} placeholder="e.g. beginner, class projects, portfolio URL" /></Field>
              <Field label="Location (optional)" hint="Used in queries for location-dependent work."><input className="er-input" value={form.location} onChange={(e) => setField('location', e.target.value)} placeholder="City or area" /></Field>
            </div>
          </div>
          <div className="er-form-grid er-form-grid--preferences">
            <Field label="Work preference"><select className="er-input" value={form.workPreference} onChange={(e) => setField('workPreference', e.target.value)}><option value="remote">Remote / work from home</option><option value="onsite">On-site / local</option><option value="hybrid">Hybrid</option><option value="any">Any arrangement</option></select></Field>
            <Field label="Minimum advertised compensation (₹, optional)" hint="Compensation basis may differ by listing; this is a rough text filter."><input className="er-input" type="number" min="0" max="100000000" value={form.minCompensation} onChange={(e) => setField('minCompensation', e.target.value)} placeholder="No minimum" /></Field>
          </div>
          <div className="er-category-picker"><div className="er-field-label">What should we look for?</div><div className="er-category-grid">{EARN_RADAR_CATEGORIES.map((category) => <label key={category.value} className={`er-category-option ${form.categories.includes(category.value) ? 'is-selected' : ''}`}><input type="checkbox" checked={form.categories.includes(category.value)} onChange={() => toggleCategory(category.value)} /><span className="er-category-check">{form.categories.includes(category.value) && <Check size={12} />}</span>{category.label}</label>)}</div></div>
          <div className="er-form-footer"><span><ShieldCheck size={14} /> Never share your UPI PIN, OTP, passwords, or pay an upfront job fee.</span><button className="er-btn er-btn--dark er-search-submit" type="submit" disabled={loading}><Search size={16} />{loading ? 'Scanning live sources…' : results ? 'Search again' : 'Find opportunities'}{!loading && <ArrowUpRight size={15} />}</button></div>
        </form>

        {loading && <div className="er-loading-panel"><span className="er-loader"><Radar size={24} /></span><div><strong>Scanning for real opportunities</strong><p>Searching public listings, then extracting available details. Some sites may block access.</p><div className="er-loading-steps"><span>Searching web</span><span>Checking source pages</span><span>Matching your goal</span></div></div></div>}

        {results && !loading && <div className="er-results-section">
          <div className="er-result-summary"><div><span className="er-section-kicker">02 / YOUR RADAR</span><h2>{results.opportunities?.length ? `${results.opportunities.length} ${results.opportunities.length === 1 ? 'opportunity' : 'opportunities'} found` : 'No suitable listings found yet'}</h2><p>{results.liveSearch ? 'Live results from TinyFish Search' : 'Live search status unavailable'}{results.liveFetch ? ' · page extraction attempted' : results.resultCount === 0 ? ' · no qualifying pages needed extraction' : ' · page extraction unavailable'} · individual listings only; not independently verified</p></div><div className="er-result-goal"><span>Amount to cover</span><strong>{money(results.requestedGoal?.amount)}</strong><small>{results.requestedGoal?.daysRemaining} days left · payout is not guaranteed</small></div></div>
          {results.plan && <div className="er-plan-panel"><div className="er-plan-icon"><TrendingUp size={18} /></div><div className="er-plan-body"><span className="er-section-kicker">YOUR NEXT STEPS</span><h3>Keep the deadline realistic.</h3><div className="er-plan-stats"><span><strong>{results.plan.possibleBeforeDeadline}</strong> stated payout window could fit</span><span><strong>{results.plan.paymentTimingUnknown}</strong> with payout timing unknown</span><span><strong>{results.plan.unlikelyBeforeDeadline}</strong> unlikely before deadline</span></div><ul>{results.plan.steps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ul><p>{results.plan.note}</p></div></div>}
          {(results.warnings || []).map((warning, index) => <div className="er-result-warning" key={`${warning}-${index}`}><AlertTriangle size={14} /><span>{warning}</span></div>)}
          {visibleResults.length > 0 && <div className="er-results-tools"><div className="er-results-count"><Filter size={14} /> Filter results <span>{visibleResults.length}</span></div><select aria-label="Filter opportunities" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All results</option><option value="possible">Could fit deadline</option><option value="unknown">Payout unknown</option><option value="caution">Screening flags</option></select><select aria-label="Sort opportunities" value={sort} onChange={(e) => setSort(e.target.value)}><option value="match">Best match first</option><option value="title">Title A–Z</option><option value="pay">Compensation text</option></select></div>}
          {compareItems.length > 0 && <div className="er-compare-panel"><div className="er-compare-head"><strong>Compare selected ({compareItems.length}/3)</strong><button type="button" onClick={() => setCompareItems([])}><X size={13} /> Clear</button></div><div className="er-compare-grid">{compareItems.map((item) => <div key={item.url}><small>{item.source}</small><strong>{item.title}</strong><span>Pay: {item.advertisedCompensation || 'Not stated'}</span><span>Deadline: {item.feasibility?.label || 'Unknown'}</span><a href={item.url} target="_blank" rel="noopener noreferrer">Original <ArrowUpRight size={12} /></a></div>)}</div></div>}
          {visibleResults.length > 0 && <div className="er-opportunity-list">{visibleResults.map((opportunity) => <OpportunityCard key={opportunity.url} opportunity={opportunity} saved={savedUrls.has(opportunity.url)} onSave={saveOpportunity} saving={savingUrl === opportunity.url} compareSelected={compareItems.some((item) => item.url === opportunity.url)} onCompare={toggleCompare} detailOpen={expandedUrl === opportunity.url} onToggleDetail={(url) => setExpandedUrl((current) => current === url ? '' : url)} />)}</div>}
          {results.opportunities?.length > 0 && visibleResults.length === 0 && <div className="er-empty-state"><Filter size={22} /><strong>No listings in this filter</strong><p>Try another filter to review the remaining results.</p></div>}
          {results.opportunities?.length === 0 && <div className="er-empty-state"><Search size={22} /><strong>No individual listings qualified</strong><p>Search results may have been category pages, articles, inaccessible pages, or listings without enough evidence to identify a specific role or project. Try adding another skill, selecting another category, or widening your work preference above.</p></div>}
          <p className="er-disclaimer">{results.resultCount ? `Found ${results.resultCount} distinct qualifying individual listing candidate${results.resultCount === 1 ? '' : 's'} from ${results.queryCount} targeted search quer${results.queryCount === 1 ? 'y' : 'ies'}. Extracted pages are not independently verified.` : 'No qualifying individual opportunities were found; generic pages and fabricated listings were not counted.'} Listings can change or be inaccessible. Check requirements, deadlines, employer identity and payment terms on the original site before sharing information or accepting work.</p>
        </div>}
        {!results && !loading && <div className="er-first-search"><div className="er-first-icon"><Sparkles size={19} /></div><div><strong>Your next earning opportunity starts here.</strong><p>Fill in a few details and search the live web. Earn Radar will rank public listings, explain the match, and flag payout uncertainty.</p></div><div className="er-first-preview"><span>01 <small>Match</small></span><span>02 <small>Compare</small></span><span>03 <small>Act</small></span></div></div>}
      </>}

      {tab === 'saved' && <section className="er-saved-section"><div className="er-saved-heading"><div><span className="er-section-kicker">YOUR SHORTLIST</span><h2>Keep your next steps close.</h2><p>Track your own progress. Earn Radar never claims you applied or earned money.</p></div><button type="button" className="er-btn er-btn--ghost" onClick={loadSaved} disabled={savedLoading}><RefreshCw size={14} /> Refresh</button></div>
        {savedLoading ? <div className="er-empty-state"><span className="er-loader"><Radar size={21} /></span><strong>Loading saved opportunities…</strong></div> : savedLoadFailed ? <div className="er-empty-state"><AlertTriangle size={24} /><strong>Saved opportunities could not be loaded</strong><p>The count is unavailable until the database request succeeds. Review the error above and retry.</p><button className="er-btn er-btn--dark" type="button" onClick={loadSaved}><RefreshCw size={14} /> Retry loading</button></div> : savedItems.length ? <div className="er-saved-list">{savedItems.map((row) => <SavedOpportunityCard key={row.id} row={row} onStatus={updateStatus} onRemove={removeSaved} updatingId={updatingId} />)}</div> : <div className="er-empty-state"><Bookmark size={24} /><strong>No saved opportunities yet</strong><p>Run a live search and save opportunities worth following up on.</p><button className="er-btn er-btn--dark" type="button" onClick={() => setTab('search')}>Find opportunities <ArrowUpRight size={14} /></button></div>}
      </section>}
    </section>
  )
}
