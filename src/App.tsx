import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Check, CircleHelp, Copy, Download, LoaderCircle, Pause, Play, Plus, Search, X } from 'lucide-react'
import { ApiError, TheoremGraphClient } from './api'
import type { Candidate, Declaration, Objective, Policy, TraversalState } from './domain'
import { POLICY_LABEL } from './domain'
import { Explorer, LIMITS } from './explorer'
import { DETECTOR_VERSION, findEvidence, loadMethodIndex, MARKER_SOURCE_URL, primaryEvidence, type MethodIndex, type Evidence } from './methods'
import { interpretObjective, objectiveKey, SUGGESTIONS } from './objectives'
import { GraphExplorer } from './GraphExplorer'
import { SiteFooter, SiteHeader } from './SiteChrome'
import './design.css'
import './styles.css'

type SearchStatus = 'idle' | 'searching' | 'ready' | 'empty' | 'error'
const client = new TheoremGraphClient()

function initialUrl() {
  const params = new URLSearchParams(window.location.search)
  const query = params.get('q') ?? ''
  const raw = params.getAll('detect')
  const objectives = raw.map(interpretObjective).filter((value): value is Objective => Boolean(value))
  return { query, objectives, linkedId: params.get('id') }
}

const initial = initialUrl()

function formatError(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof DOMException && error.name === 'AbortError') return 'Search cancelled.'
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}

function policyName(policy?: Policy) { return policy ? POLICY_LABEL[policy] : 'Outside the current scope' }

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function EvidenceItem({ evidence, theorem, onInspect }: { evidence: Evidence; theorem: Declaration; onInspect: (id: string) => void }) {
  return <div className={`witness evidence-${evidence.grade}`}>
    <div className="witness-title"><Check size={16} /><strong>{evidence.matchedName}</strong><span>{evidence.path.length - 1} {evidence.path.length === 2 ? 'edge' : 'edges'} · {evidence.location === 'root' ? 'selected proof' : evidence.location === 'definition' ? 'reached definition' : 'proof dependency'}</span></div>
    <p className="evidence-description">{evidence.explanation}</p>
    <ol className="path" aria-label={`Path from ${theorem.name} to ${evidence.matchedName}`}>
      {evidence.path.map((step, index) => <li key={`${step.id}-${index}`}>
        {index > 0 && <span className="edge-type">{step.via}</span>}
        <span className="path-node" title={step.id}>{step.name}</span>
      </li>)}
    </ol>
    <details className="evidence-details"><summary>Evidence details</summary><div className="evidence-meta"><span>{evidence.source} · {evidence.source === 'MathlibGraph' ? `Mathlib ${evidence.sourceRevision?.slice(0, 12)}` : evidence.graphSourceLabel ?? 'version unspecified'}</span><span>Rule: {evidence.ruleId}</span>{evidence.joinStatus && <span>Join: {evidence.joinStatus === 'different-version' ? 'different snapshot labels' : 'same proof unverified'}</span>}</div></details>
    <button type="button" className="evidence-inspect" onClick={() => onInspect(evidence.path[evidence.path.length - 1].id)}>Inspect in graph <ArrowRight size={13} /></button>
  </div>
}

function QuestionCard({ objective, state, theorem, index, indexStatus, onInspect }: { objective: Objective; state?: TraversalState; theorem: Declaration; index?: MethodIndex; indexStatus: 'idle' | 'loading' | 'ready' | 'error'; onInspect: (id: string, policy: Policy) => void }) {
  const evidence = findEvidence(state, objective, index)
  const primary = primaryEvidence(state, objective, index)
  const related = evidence.find((item) => item.grade === 'related')
  const unsupported = objective.capability === 'unavailable'
  const exhausted = state?.status === 'complete' && state.completionReason === 'exhausted'
  const indexMissing = objective.kind !== 'named' && indexStatus === 'error'
  const badge = unsupported ? 'Undetermined' : primary?.grade === 'observed' ? 'Graph witness' : primary ? primary.joinStatus === 'different-version' ? 'Cross-version lead' : 'Possible method signal' : related ? 'Related evidence' : exhausted && indexMissing ? 'Partial evidence' : exhausted ? 'No marker observed' : state?.status === 'limited' ? 'Limit reached' : state?.status === 'error' ? 'API error' : state?.status === 'paused' ? 'Paused' : 'Searching'
  const kind = unsupported ? 'muted' : primary?.grade === 'observed' ? 'positive' : primary || related ? 'pending' : exhausted ? 'neutral' : state?.status === 'error' ? 'negative' : 'pending'
  return (
    <article className="answer-card">
      <div className="answer-head">
        <div>
          <p className="eyebrow">Your question</p>
          <h3>{objective.original}</h3>
        </div>
        <span className={`status-pill ${kind}`}>{!unsupported && !primary && !related && state?.status === 'running' && <LoaderCircle size={13} className="spin" />}{badge}</span>
      </div>
      <p className="interpretation">{objective.interpretation}</p>
      {unsupported ? (
        <p className="answer-note">This request has no reviewed detector. Enter a full Lean declaration name or choose one of the method questions.</p>
      ) : primary || related ? (
        <>{primary && <EvidenceItem evidence={primary} theorem={theorem} onInspect={(id) => onInspect(id, objective.policy ?? 'proof')} />}{!primary && related && <EvidenceItem evidence={related} theorem={theorem} onInspect={(id) => onInspect(id, objective.policy ?? 'proof')} />}{evidence.length > 1 && <details className="more-evidence"><summary>{evidence.length - 1} additional signal{evidence.length > 2 ? 's' : ''}</summary>{evidence.filter((item) => item.id !== (primary ?? related)?.id).map((item) => <EvidenceItem key={item.id} evidence={item} theorem={theorem} onInspect={(id) => onInspect(id, objective.policy ?? 'proof')} />)}</details>}{state?.completionReason === 'witnesses' ? <p className="fine-print">Stopped after the first signals for all selected questions. Continue exploring to see more of the graph.</p> : state?.status !== 'complete' && <p className="fine-print">Exploration is still incomplete.</p>}</>
      ) : exhausted ? (
        <p className="answer-note">{indexMissing ? 'Recorded tactics could not be checked. ' : ''}No matching graph marker appeared in {state.visited.size} checked declarations. The detector and source coverage cannot establish that this method is absent.</p>
      ) : state?.status === 'limited' ? (
        <p className="answer-note">The exploration limit was reached. Remaining dependencies were not checked, so no negative conclusion is possible.</p>
      ) : state?.status === 'error' ? (
        <p className="answer-note">{state.error} Remaining dependencies were not checked.</p>
      ) : <p className="answer-note">The graph is explored layer by layer. A verified path will appear here when found.</p>}
      {!unsupported && <div className="answer-footer"><span>{policyName(objective.policy)}</span><span>{state?.visited.size ?? 0} checked · {state?.frontier.length ?? 0} pending</span>{objective.kind !== 'named' && indexStatus !== 'ready' && <span>Recorded tactics: {indexStatus === 'error' ? 'unavailable' : 'loading'}</span>}</div>}
    </article>
  )
}

function App() {
  const [query, setQuery] = useState(initial.query)
  const [searchOpen, setSearchOpen] = useState(Boolean(initial.query || initial.linkedId || initial.objectives.length))
  const [draft, setDraft] = useState('')
  const [objectives, setObjectives] = useState<Objective[]>(initial.objectives)
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [searchError, setSearchError] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [visibleCandidates, setVisibleCandidates] = useState(5)
  const [searchMilliseconds, setSearchMilliseconds] = useState<number | null>(null)
  const [hydrationMilliseconds, setHydrationMilliseconds] = useState(0)
  const [confirmed, setConfirmed] = useState<Declaration | null>(null)
  const [analysisStarted, setAnalysisStarted] = useState(false)
  const [states, setStates] = useState<Map<Policy, TraversalState>>(new Map())
  const [copied, setCopied] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [shareFallback, setShareFallback] = useState('')
  const [searchSeconds, setSearchSeconds] = useState(0)
  const [searchNotice, setSearchNotice] = useState('')
  const [pauseRequested, setPauseRequested] = useState(false)
  const [methodIndex, setMethodIndex] = useState<MethodIndex | undefined>()
  const [indexStatus, setIndexStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [indexError, setIndexError] = useState('')
  const [graphFocus, setGraphFocus] = useState<{ id: string; policy: Policy; serial: number } | undefined>()
  const searchController = useRef<AbortController | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const searchSerial = useRef(0)
  const hydrationTail = useRef<Promise<void>>(Promise.resolve())
  const explorer = useRef(new Explorer(client, setStates))

  const activeStates = Array.from(states.values())
  const isRunning = activeStates.some((state) => state.status === 'running')
  const canResume = activeStates.some((state) => state.status === 'paused' || state.status === 'error')

  function openSearch() {
    setSearchOpen(true)
    window.setTimeout(() => { document.getElementById('query-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); searchInput.current?.focus({ preventScroll: true }) }, 30)
  }

  useEffect(() => () => { searchController.current?.abort(); explorer.current.cancel() }, [])

  useEffect(() => {
    if (searchStatus !== 'searching') return
    const started = Date.now()
    const timer = window.setInterval(() => setSearchSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [searchStatus])

  useEffect(() => {
    const id = initial.linkedId
    if (!id) return
    let live = true
    setSearchStatus('searching')
    const controller = new AbortController()
    searchController.current = controller
    void client.neighborhood(id, controller.signal).then(({ root }) => {
      if (!live || controller.signal.aborted) return
      setCandidates([{ ...root, score: 0, loading: false }])
      setSearchStatus('ready')
    }).catch((error) => {
      if (!live || controller.signal.aborted) return
      setSearchStatus('error')
      setSearchError(`The linked declaration could not be loaded: ${formatError(error)}`)
    })
    return () => { live = false; controller.abort() }
  }, [])

  function resetAnalysis(nextObjectives = objectives, index = methodIndex) {
    if (!confirmed) return
    const policies = Array.from(new Set(nextObjectives.map((objective) => objective.policy).filter((value): value is Policy => Boolean(value))))
    explorer.current.setup(confirmed, policies, nextObjectives, index)
    if (policies.length) explorer.current.start()
    setPauseRequested(false)
  }

  function removeObjective(id: string) {
    const next = objectives.filter((item) => item.id !== id)
    setObjectives(next)
    if (analysisStarted && confirmed) resetAnalysis(next)
  }

  function addAndRefresh(value: string) {
    const objective = interpretObjective(value)
    if (!objective || objectives.some((item) => objectiveKey(item) === objectiveKey(objective))) { setDraft(''); return }
    const next = [...objectives, objective]
    setObjectives(next)
    setDraft('')
    if (analysisStarted && confirmed) resetAnalysis(next)
  }

  async function hydrate(items: Candidate[], controller: AbortController, serial: number) {
    for (let offset = 0; offset < items.length; offset += 3) {
      if (controller.signal.aborted || serial !== searchSerial.current) return
      const started = performance.now()
      await Promise.allSettled(items.slice(offset, offset + 3).map(async (item) => {
        try {
          const neighborhood = await client.neighborhood(item.id, controller.signal)
          if (controller.signal.aborted || serial !== searchSerial.current) return
          setCandidates((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...neighborhood.root, slogan: candidate.slogan, score: candidate.score, loading: false } : candidate))
        } catch (error) {
          if (controller.signal.aborted || serial !== searchSerial.current) return
          setCandidates((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, loading: false, error: formatError(error) } : candidate))
        }
      }))
      if (!controller.signal.aborted && serial === searchSerial.current) setHydrationMilliseconds((current) => current + Math.round(performance.now() - started))
    }
  }

  function showMoreCandidates() {
    const next = Math.min(candidates.length, visibleCandidates + 5)
    const items = candidates.slice(visibleCandidates, next)
    setVisibleCandidates(next)
    if (searchController.current) {
      const controller = searchController.current
      const serial = searchSerial.current
      hydrationTail.current = hydrationTail.current.then(() => hydrate(items, controller, serial))
    }
  }

  async function search() {
    if (!query.trim()) return
    searchController.current?.abort()
    explorer.current.cancel()
    setConfirmed(null)
    setAnalysisStarted(false)
    setStates(new Map())
    setCandidates([])
    setVisibleCandidates(5)
    setSearchMilliseconds(null)
    setHydrationMilliseconds(0)
    setSearchError('')
    setSearchNotice('')
    setSearchSeconds(0)
    setSearchStatus('searching')
    const controller = new AbortController()
    searchController.current = controller
    const serial = ++searchSerial.current
    const started = performance.now()
    try {
      const found = await client.search(query.trim(), controller.signal)
      if (serial !== searchSerial.current) return
      setSearchMilliseconds(Math.round(performance.now() - started))
      if (!found.length) { setSearchStatus('empty'); return }
      setCandidates(found)
      setSearchStatus('ready')
      window.setTimeout(() => document.getElementById('candidate-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
      hydrationTail.current = hydrationTail.current.then(() => hydrate(found.slice(0, 5), controller, serial))
    } catch (error) {
      if (controller.signal.aborted || serial !== searchSerial.current) return
      setSearchStatus('error')
      setSearchError(formatError(error))
    }
  }

  function cancelSearch() {
    searchController.current?.abort()
    searchSerial.current++
    setSearchStatus('idle')
    setSearchNotice('Search cancelled. Your query is still here.')
  }

  function confirm(candidate: Candidate) {
    if (candidate.loading || candidate.error) return
    const declaration: Declaration = { id: candidate.id, name: candidate.name, kind: candidate.kind, body: candidate.body, slogan: candidate.slogan, source: candidate.source, sourceLabel: candidate.sourceLabel }
    setConfirmed(declaration)
    setAnalysisStarted(false)
    setStates(new Map())
    explorer.current.cancel()
    window.setTimeout(() => document.getElementById('confirmed-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  async function begin() {
    if (!confirmed || !objectives.length) return
    setAnalysisStarted(true)
    const needsIndex = objectives.some((item) => item.kind === 'induction' || item.kind === 'cases' || item.kind === 'absurd')
    let index = methodIndex
    if (needsIndex && !index) {
      setIndexStatus('loading')
      try {
        index = await loadMethodIndex()
        setMethodIndex(index)
        setIndexStatus('ready')
        setIndexError('')
      } catch (error) {
        setIndexStatus('error')
        setIndexError(formatError(error))
      }
    }
    resetAnalysis(objectives, index)
    window.setTimeout(() => { const title = document.getElementById('results-title'); title?.scrollIntoView({ behavior: 'smooth', block: 'start' }); title?.focus({ preventScroll: true }) }, 30)
  }

  async function share() {
    if (!confirmed) return
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('q', query)
    url.searchParams.set('id', confirmed.id)
    for (const objective of objectives) url.searchParams.append('detect', objective.original)
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      setShareFallback('')
      setShareMessage('Query link copied. Opening it loads live data; the recipient confirms the declaration before analysis.')
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setShareFallback(url.toString())
      setShareMessage('Clipboard access was unavailable. Copy the link from the field below.')
    }
  }

  function exportResult() {
    if (!confirmed) return
    downloadJson(`ouliproof-${confirmed.name.replace(/[^A-Za-z0-9_-]+/g, '-')}.json`, {
      generatedAt: new Date().toISOString(), source: 'TheoremGraph API', sourceLabel: confirmed.sourceLabel,
      detectorVersion: DETECTOR_VERSION, methodIndex: methodIndex && { datasetRevision: methodIndex.datasetRevision, mathlibCommit: methodIndex.mathlibCommit, mathlibCommitStatus: methodIndex.mathlibCommitStatus, sourceSha256: methodIndex.sourceSha256 }, indexStatus,
      theorem: confirmed, limits: LIMITS,
      questions: objectives.map((objective) => {
        const state = objective.policy ? states.get(objective.policy) : undefined
        return { original: objective.original, interpretation: objective.interpretation, policy: objective.policy, capability: objective.capability, status: state?.status ?? 'not_applicable', visited: state?.visited.size ?? 0, pending: state?.frontier.length ?? 0, evidence: findEvidence(state, objective, methodIndex) }
      }),
      note: 'Observation of the graph returned by the API, not a Lean proof certificate.',
    })
    setShareMessage('Evidence JSON downloaded. This file freezes the current findings and traversal status.')
  }

  return <div className={`app-shell ${searchOpen ? '' : 'intro-only'}`}>
    <SiteHeader />

    <main>
      <section className="intro" aria-labelledby="page-title">
        <h1 id="page-title">Mathlib <em>dependency explorer.</em></h1>
        {!searchOpen && <button type="button" className="intro-cta" onClick={openSearch}>Search a result <ArrowRight size={18} aria-hidden="true" /></button>}
      </section>

      {searchOpen && <section className="workspace" aria-label="Theorem analysis">
        <div className="workspace-grid">
          <div className="main-column">
            <section className="form-section" aria-labelledby="query-title">
              <div className="section-label"><span>01 / SEARCH</span><span>Semantic search</span></div>
              <h2 id="query-title">Result of interest</h2>
              <p className="section-intro">Enter a Lean name or describe the mathematical result. You will confirm the exact declaration before exploring it.</p>
              <form className="search-form" onSubmit={(event) => { event.preventDefault(); void search() }}>
                <Search size={19} aria-hidden="true" />
                <input ref={searchInput} aria-label="Lean name or mathematical description" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Nat.add_comm or a prime dividing a product" />
                <button type="submit" aria-label="Search" disabled={!query.trim() || searchStatus === 'searching'}>{searchStatus === 'searching' ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}<span>Search</span></button>
              </form>
              <div className="example-line">Try <button type="button" onClick={() => setQuery('Nat.add_comm')}>Nat.add_comm</button><button type="button" onClick={() => setQuery('if a prime number divides a product then it divides one of the factors')}>Euclid’s lemma</button><button type="button" onClick={() => setQuery('continuous function on a compact interval attains its maximum')}>maximum on a compact interval</button></div>
              {searchStatus === 'searching' && <div className="inline-state search-progress" role="status"><LoaderCircle size={16} className="spin" /><span>{searchSeconds < 10 ? 'Searching TheoremGraph…' : `Still searching TheoremGraph (${Math.floor(searchSeconds / 5) * 5}s). Semantic search can be slow.`}</span><button type="button" onClick={cancelSearch}>Cancel search</button></div>}
              {searchNotice && searchStatus === 'idle' && <div className="inline-state" role="status">{searchNotice}</div>}
              {searchStatus === 'empty' && <div className="inline-state">No Mathlib declarations appeared among the first results. Try a different name or a more precise description.</div>}
              {searchStatus === 'error' && <div className="inline-state error" role="alert">{searchError} <button onClick={() => void search()}>Try again</button></div>}
            </section>

            {searchStatus === 'ready' && !confirmed && <section className="candidate-section" aria-labelledby="candidate-title"><div className="section-label"><span>02 / CONFIRM RESULT</span><span>Choose a declaration</span></div><h2 id="candidate-title">Which declaration did you mean?</h2><p className="section-intro">Results are ranked by similarity. Confirm the Lean declaration before choosing a question.</p>{/^[A-Za-z_][A-Za-z0-9_'.]*\.[A-Za-z_][A-Za-z0-9_'.]*$/.test(query.trim()) && !candidates.some((candidate) => candidate.name === query.trim()) && visibleCandidates >= candidates.length && candidates.every((candidate) => !candidate.loading) && <p className="search-advice"><code>{query.trim()}</code> did not appear in these results. Semantic search can miss an exact Lean name; try describing the mathematics instead.</p>}<div className="candidate-list">{candidates.slice(0, visibleCandidates).map((candidate, index) => <article className="candidate" key={candidate.id}><div className="candidate-index">{String(index + 1).padStart(2, '0')}</div><div className="candidate-body"><div className="candidate-top"><h3>{candidate.loading ? 'Loading name…' : candidate.name}</h3><span>{candidate.sourceLabel}</span></div>{candidate.body && <p className="formal-body">{candidate.body}</p>}{candidate.slogan && <p>{candidate.slogan}</p>}{candidate.error && <p className="candidate-error">Name unavailable: {candidate.error}</p>}<small>{candidate.id}</small></div><button className="candidate-select" type="button" disabled={candidate.loading || Boolean(candidate.error)} onClick={() => confirm(candidate)}>{candidate.loading ? <LoaderCircle className="spin" size={15} /> : <>Select <ArrowRight size={15} /></>}</button></article>)}</div>{visibleCandidates < candidates.length && <button type="button" className="candidate-more" onClick={showMoreCandidates}>Show {candidates.length - visibleCandidates} more results <ArrowDown size={15} /></button>}<details className="diagnostics"><summary>Search diagnostics</summary><p className="candidate-metrics">Search: {searchMilliseconds ?? '—'} ms · Name loading: {hydrationMilliseconds} ms · Neighborhoods: {client.cacheStats().memoryHits} memory, {client.cacheStats().browserHits} browser, {client.cacheStats().networkRequests} API calls{client.cacheStats().rateLimits > 0 ? ` · ${client.cacheStats().rateLimits} rate limits` : ''}</p></details></section>}

            {confirmed && <section className="confirmed-section" aria-labelledby="confirmed-title"><div className="section-label"><span>02 / SELECTED RESULT</span><button type="button" className="text-action" onClick={() => { explorer.current.cancel(); setConfirmed(null); setAnalysisStarted(false); setStates(new Map()) }}><ArrowLeft size={14} /> Change result</button></div><div className="confirmed-heading"><h2 id="confirmed-title">{confirmed.name}</h2><span className="check-seal"><Check size={19} /></span></div>{confirmed.slogan && <p className="confirmed-slogan">{confirmed.slogan}</p>}<details className="selected-details"><summary>Declaration details</summary>{confirmed.body && <p className="confirmed-statement">{confirmed.body}</p>}<div className="source-row"><span>Source: {confirmed.sourceLabel ?? 'TheoremGraph'}</span><span>ID: {confirmed.id}</span></div></details></section>}

            {confirmed && <><section className="form-section objective-section" aria-labelledby="objective-title">
              <div className="section-label"><span>03 / QUESTION</span><span>Ask one or more</span></div>
              <h2 id="objective-title">What would you like to detect?</h2>
              <p className="section-intro">Choose methods to look for across the dependency chain, or enter a precise Lean declaration.</p>
              <div className="suggestions" aria-label="Suggested questions">{SUGGESTIONS.map((item) => <button type="button" key={item.value} onClick={() => addAndRefresh(item.value)}><Plus size={14} /><span>{item.label}</span><small>{item.caption}</small></button>)}</div>
              <form className="objective-form" onSubmit={(event) => { event.preventDefault(); addAndRefresh(draft) }}>
                <label htmlFor="objective-input">Another question or Lean declaration</label>
                <div><input id="objective-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. depends on Nat.zero_add" /><button type="submit" disabled={!draft.trim()} aria-label="Add question"><Plus size={18} /></button></div>
              </form>
              {objectives.length > 0 && <div className="selected-questions"><h3>Selected questions <span>{objectives.length}</span></h3>{objectives.map((objective) => <div className="selected-item" key={objective.id}><div><strong>{objective.original}</strong><p>{objective.interpretation}</p><span className={objective.capability === 'unavailable' ? 'capability no' : 'capability'}>{objective.capability === 'unavailable' ? 'No detector' : objective.capability === 'hint' ? 'Graph + source signal' : policyName(objective.policy)}</span></div><button type="button" onClick={() => removeObjective(objective.id)} aria-label={`Remove ${objective.original}`}><X size={16} /></button></div>)}</div>}
              {!analysisStarted && <div className="confirm-actions"><p>{objectives.length ? `${objectives.length} question${objectives.length > 1 ? 's' : ''} ready to explore.` : 'Choose at least one question to continue.'}</p><button type="button" className="primary-button" disabled={!objectives.length} onClick={() => void begin()}>Explore dependencies <ArrowRight size={17} /></button></div>}
            </section>

            </>}

            {analysisStarted && confirmed && <section className="results" aria-labelledby="results-title"><div className="section-label"><span>04 / FINDINGS</span><span>Live TheoremGraph API</span></div><div className="results-heading"><div><h2 id="results-title" tabIndex={-1}>What the graph shows</h2><p>A path shows an observed reference. It does not reconstruct the Lean proof script.</p></div><div className="result-actions">{isRunning && <button type="button" className="secondary-button" onClick={() => { explorer.current.pause(); setPauseRequested(true) }}><Pause size={15} /> {pauseRequested ? 'Pausing' : 'Pause'}</button>}{!isRunning && canResume && <button type="button" className="secondary-button" onClick={() => { explorer.current.resume(); setPauseRequested(false) }}><Play size={15} /> Resume</button>}<button type="button" className="secondary-button" onClick={() => void share()}>{copied ? <Check size={15} /> : <Copy size={15} />} Copy query link</button><button type="button" className="secondary-button" onClick={exportResult}><Download size={15} /> Export evidence JSON</button></div></div>
              <p className="sharing-help">A query link reruns against live sources. The JSON file records the evidence currently shown.</p>{shareMessage && <p className="share-message" role="status">{shareMessage}</p>}{shareFallback && <label className="share-fallback">Query link<input readOnly value={shareFallback} onFocus={(event) => event.currentTarget.select()} /></label>}
              {indexStatus === 'loading' && <div className="inline-state" role="status"><LoaderCircle size={16} className="spin" /> Loading the compact MathlibGraph method index…</div>}
              {indexStatus === 'error' && <div className="inline-state error" role="alert">Recorded tactic evidence is unavailable: {indexError} Graph-reference detectors can still run. <button type="button" onClick={() => { void loadMethodIndex().then((index) => { setMethodIndex(index); setIndexStatus('ready'); setIndexError(''); explorer.current.setMethodIndex(index) }).catch((error) => setIndexError(formatError(error))) }}>Retry index</button></div>}
              {activeStates.length > 0 && <div className="progress-strip" role="status">{activeStates.map((state) => <div key={state.policy}><span className={`tiny-dot ${state.status}`} /><strong>{POLICY_LABEL[state.policy]}</strong><span>{state.visited.size} checked · {state.frontier.length} pending</span><em>{state.status === 'complete' ? state.completionReason === 'witnesses' ? 'First signals found' : 'Traversal complete' : state.status === 'running' ? 'Running' : state.status === 'paused' ? 'Paused' : state.status === 'limited' ? 'Limit reached' : state.status === 'error' ? 'Error' : 'Ready'}</em></div>)}</div>}
              <div className="answers">{objectives.map((objective) => <QuestionCard key={objective.id} objective={objective} state={objective.policy ? states.get(objective.policy) : undefined} theorem={confirmed} index={methodIndex} indexStatus={indexStatus} onInspect={(id, policy) => { setGraphFocus({ id, policy, serial: Date.now() }); document.getElementById('graph-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />)}</div>
              <details className="diagnostics"><summary>Search and traversal diagnostics</summary><p className="candidate-metrics">Search: {searchMilliseconds ?? '—'} ms · Name loading: {hydrationMilliseconds} ms · Traversal: {activeStates.map((state) => `${POLICY_LABEL[state.policy]} ${Math.round(state.elapsedMs)} ms / ${state.requests} requests`).join(' ; ') || '—'} · Cache: {client.cacheStats().memoryHits} memory, {client.cacheStats().browserHits} browser, {client.cacheStats().networkRequests} API calls</p></details>
              <GraphExplorer states={states} root={confirmed} onContinue={(policy) => explorer.current.continueAfterWitness(policy)} canContinue={!isRunning} focusRequest={graphFocus} evidencePaths={objectives.flatMap((objective) => objective.policy ? findEvidence(states.get(objective.policy), objective, methodIndex).map((item) => ({ policy: objective.policy!, path: item.path })) : [])} />
              <div className="results-footnote"><CircleHelp size={16} /><p>Graph references and recorded tactics are different evidence. MathlibGraph tactic records remain possible leads until their proof revision can be matched to TheoremGraph. No marker observed does not establish absence of a method. <a href={MARKER_SOURCE_URL} target="_blank" rel="noreferrer">Method data source ↗</a></p></div>
            </section>}
          </div>

        </div>
      </section>}
    </main>
    <SiteFooter />
  </div>
}

export default App
