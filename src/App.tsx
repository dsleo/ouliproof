import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Check, CircleHelp, Copy, Download, LoaderCircle, Pause, Play, Plus, Search, X } from 'lucide-react'
import { ApiError, TheoremGraphClient } from './api'
import type { Candidate, Declaration, Objective, Policy, TraversalState } from './domain'
import { POLICY_LABEL } from './domain'
import { Explorer, findWitness, LIMITS } from './explorer'
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

function QuestionCard({ objective, state, theorem }: { objective: Objective; state?: TraversalState; theorem: Declaration }) {
  const witness = findWitness(state, objective)
  const unsupported = objective.capability === 'unavailable'
  const badge = unsupported ? 'Undetermined' : witness ? 'Witness found' : state?.status === 'complete' && state.completionReason === 'exhausted' ? 'No witness observed' : state?.status === 'limited' ? 'Limit reached' : state?.status === 'error' ? 'API error' : state?.status === 'paused' ? 'Paused' : 'Searching'
  const kind = unsupported ? 'muted' : witness ? 'positive' : state?.status === 'complete' && state.completionReason === 'exhausted' ? 'neutral' : state?.status === 'error' ? 'negative' : 'pending'
  return (
    <article className="answer-card">
      <div className="answer-head">
        <div>
          <p className="eyebrow">Your question</p>
          <h3>{objective.original}</h3>
        </div>
        <span className={`status-pill ${kind}`}>{!unsupported && !witness && state?.status === 'running' && <LoaderCircle size={13} className="spin" />}{badge}</span>
      </div>
      <p className="interpretation">{objective.interpretation}</p>
      {unsupported ? (
        <p className="answer-note">TheoremGraph dependencies cannot reliably establish whether the author used this proof method. Try asking about a specific Lean declaration instead.</p>
      ) : witness ? (
        <div className="witness">
          <div className="witness-title"><Check size={16} /><strong>{objective.target}</strong><span>{witness.length - 1} {witness.length === 2 ? 'edge' : 'edges'}</span></div>
          <ol className="path" aria-label={`Path from ${theorem.name} to ${objective.target}`}>
            {witness.map((step, index) => <li key={`${step.id}-${index}`}>
              {index > 0 && <span className="edge-type">{step.via}</span>}
              <span className="path-node" title={step.id}>{step.name}</span>
            </li>)}
          </ol>
          {state?.completionReason === 'witnesses' ? <p className="fine-print">The search stopped when all requested witnesses were found. The graph shows the portion explored so far.</p> : state?.status !== 'complete' && <p className="fine-print">A witness was found; exploration is still incomplete.</p>}
        </div>
      ) : state?.status === 'complete' && state.completionReason === 'exhausted' ? (
        <p className="answer-note">No declaration named <code>{objective.target}</code> appeared in the dependency closure returned by this API consultation. This does not prove its absence in Lean.</p>
      ) : state?.status === 'limited' ? (
        <p className="answer-note">The exploration limit was reached. Remaining dependencies were not checked, so no negative conclusion is possible.</p>
      ) : state?.status === 'error' ? (
        <p className="answer-note">{state.error} Remaining dependencies were not checked.</p>
      ) : <p className="answer-note">The graph is explored layer by layer. A verified path will appear here when found.</p>}
      {!unsupported && <div className="answer-footer"><span>{policyName(objective.policy)}</span><span>{state?.visited.size ?? 0} checked · {state?.frontier.length ?? 0} pending</span></div>}
    </article>
  )
}

function App() {
  const [query, setQuery] = useState(initial.query)
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
  const [pauseRequested, setPauseRequested] = useState(false)
  const searchController = useRef<AbortController | null>(null)
  const searchSerial = useRef(0)
  const hydrationTail = useRef<Promise<void>>(Promise.resolve())
  const explorer = useRef(new Explorer(client, setStates))

  const activeStates = Array.from(states.values())
  const isRunning = activeStates.some((state) => state.status === 'running')
  const canResume = activeStates.some((state) => state.status === 'paused' || state.status === 'error')
  const pageStep = analysisStarted ? 3 : confirmed || searchStatus === 'ready' ? 2 : 1

  useEffect(() => () => { searchController.current?.abort(); explorer.current.cancel() }, [])

  useEffect(() => {
    const id = initial.linkedId
    if (!id) return
    let live = true
    setSearchStatus('searching')
    void client.neighborhood(id).then(({ root }) => {
      if (!live) return
      setCandidates([{ ...root, score: 0, loading: false }])
      setSearchStatus('ready')
    }).catch((error) => {
      if (!live) return
      setSearchStatus('error')
      setSearchError(`The linked declaration could not be loaded: ${formatError(error)}`)
    })
    return () => { live = false }
  }, [])

  function resetAnalysis(nextObjectives = objectives) {
    if (!confirmed) return
    const policies = Array.from(new Set(nextObjectives.map((objective) => objective.policy).filter((value): value is Policy => Boolean(value))))
    explorer.current.setup(confirmed, policies, nextObjectives)
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

  function confirm(candidate: Candidate) {
    if (candidate.loading || candidate.error) return
    const declaration: Declaration = { id: candidate.id, name: candidate.name, kind: candidate.kind, body: candidate.body, slogan: candidate.slogan, source: candidate.source, sourceLabel: candidate.sourceLabel }
    setConfirmed(declaration)
    setAnalysisStarted(false)
    setStates(new Map())
    explorer.current.cancel()
    window.setTimeout(() => document.getElementById('confirmed-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  function begin() {
    if (!confirmed || !objectives.length) return
    setAnalysisStarted(true)
    resetAnalysis()
    window.setTimeout(() => document.getElementById('results-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  function share() {
    if (!confirmed) return
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('q', query)
    url.searchParams.set('id', confirmed.id)
    for (const objective of objectives) url.searchParams.append('detect', objective.original)
    void navigator.clipboard.writeText(url.toString()).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2500) })
  }

  function exportResult() {
    if (!confirmed) return
    downloadJson(`ouliproof-${confirmed.name.replace(/[^A-Za-z0-9_-]+/g, '-')}.json`, {
      generatedAt: new Date().toISOString(), source: 'TheoremGraph API', sourceLabel: confirmed.sourceLabel,
      theorem: confirmed, limits: LIMITS,
      questions: objectives.map((objective) => {
        const state = objective.policy ? states.get(objective.policy) : undefined
        return { original: objective.original, interpretation: objective.interpretation, policy: objective.policy, capability: objective.capability, status: state?.status ?? 'not_applicable', visited: state?.visited.size ?? 0, pending: state?.frontier.length ?? 0, witness: findWitness(state, objective) }
      }),
      note: 'Observation of the graph returned by the API, not a Lean proof certificate.',
    })
  }

  return <div className="app-shell">
    <SiteHeader />

    <main>
      <section className="intro" aria-labelledby="page-title">
        <div className="intro-kicker"><span className="line" /> Mathlib dependency explorer</div>
        <h1 id="page-title">Follow the <em>proof trail.</em></h1>
        <p>Find a Mathlib result, ask about a dependency, and inspect the path connecting them.</p>
      </section>

      <section className="workspace" aria-label="Theorem analysis">
        <div className="step-rail" aria-label="Steps">
          <span className={pageStep === 1 ? 'current' : 'done'}><b>01</b> Search</span><span className={pageStep === 2 ? 'current' : pageStep === 3 ? 'done' : ''}><b>02</b> Confirm</span><span className={pageStep === 3 ? 'current' : ''}><b>03</b> Explore</span>
        </div>

        <div className="workspace-grid">
          <div className="main-column">
            <section className="form-section" aria-labelledby="query-title">
              <div className="section-label"><span>01 / SEARCH</span><span>Semantic search</span></div>
              <h2 id="query-title">Result of interest</h2>
              <p className="section-intro">Enter a Lean name or describe the mathematical result. You will confirm the exact declaration before exploring it.</p>
              <form className="search-form" onSubmit={(event) => { event.preventDefault(); void search() }}>
                <Search size={19} aria-hidden="true" />
                <input aria-label="Lean name or mathematical description" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Nat.add_comm or a prime dividing a product" />
                <button type="submit" aria-label="Search" disabled={!query.trim() || searchStatus === 'searching'}>{searchStatus === 'searching' ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}<span>Search</span></button>
              </form>
              <div className="example-line">Try <button type="button" onClick={() => setQuery('Nat.add_comm')}>Nat.add_comm</button><button type="button" onClick={() => setQuery('if a prime number divides a product then it divides one of the factors')}>Euclid’s lemma</button><button type="button" onClick={() => setQuery('continuous function on a compact interval attains its maximum')}>maximum on a compact interval</button></div>
              {searchStatus === 'searching' && <div className="inline-state" role="status"><LoaderCircle size={16} className="spin" /> Searching TheoremGraph. This may take a few seconds.</div>}
              {searchStatus === 'empty' && <div className="inline-state">No Mathlib declarations appeared among the first results. Try a different name or a more precise description.</div>}
              {searchStatus === 'error' && <div className="inline-state error" role="alert">{searchError} <button onClick={() => void search()}>Try again</button></div>}
            </section>

            <section className="form-section objective-section" aria-labelledby="objective-title">
              <div className="section-label"><span>02 / QUESTION</span><span>Ask one or more</span></div>
              <h2 id="objective-title">What would you like to detect?</h2>
              <p className="section-intro">Choose a prompt or enter a precise Lean declaration. Each answer states what the graph can establish.</p>
              <div className="suggestions" aria-label="Suggested questions">{SUGGESTIONS.map((item) => <button type="button" key={item.value} onClick={() => addAndRefresh(item.value)}><Plus size={14} /><span>{item.label}</span><small>{item.caption}</small></button>)}</div>
              <form className="objective-form" onSubmit={(event) => { event.preventDefault(); addAndRefresh(draft) }}>
                <label htmlFor="objective-input">Another question or Lean declaration</label>
                <div><input id="objective-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. depends on Nat.zero_add" /><button type="submit" disabled={!draft.trim()} aria-label="Add question"><Plus size={18} /></button></div>
              </form>
              {objectives.length > 0 && <div className="selected-questions"><h3>Selected questions <span>{objectives.length}</span></h3>{objectives.map((objective) => <div className="selected-item" key={objective.id}><div><strong>{objective.original}</strong><p>{objective.interpretation}</p><span className={objective.capability === 'unavailable' ? 'capability no' : 'capability'}>{objective.capability === 'unavailable' ? 'Undetermined' : policyName(objective.policy)}</span></div><button type="button" onClick={() => removeObjective(objective.id)} aria-label={`Remove ${objective.original}`}><X size={16} /></button></div>)}</div>}
            </section>

            {searchStatus === 'ready' && !confirmed && <section className="candidate-section" aria-labelledby="candidate-title"><div className="section-label"><span>03 / CONFIRMATION</span><span>Choose a declaration</span></div><h2 id="candidate-title">Which declaration did you mean?</h2><p className="section-intro">Results are ranked by similarity, not exact name matching. Check the Lean name and summary before continuing.</p>{/^[A-Za-z_][A-Za-z0-9_'.]*\.[A-Za-z_][A-Za-z0-9_'.]*$/.test(query.trim()) && !candidates.some((candidate) => candidate.name === query.trim()) && visibleCandidates >= candidates.length && candidates.every((candidate) => !candidate.loading) && <p className="search-advice"><code>{query.trim()}</code> did not appear in these results. Semantic search can miss an exact Lean name; try describing the mathematics instead.</p>}<div className="candidate-list">{candidates.slice(0, visibleCandidates).map((candidate, index) => <article className="candidate" key={candidate.id}><div className="candidate-index">{String(index + 1).padStart(2, '0')}</div><div className="candidate-body"><div className="candidate-top"><h3>{candidate.loading ? 'Loading name…' : candidate.name}</h3><span>{candidate.sourceLabel}</span></div>{candidate.body && <p className="formal-body">{candidate.body}</p>}{candidate.slogan && <p>{candidate.slogan}</p>}{candidate.error && <p className="candidate-error">Name unavailable: {candidate.error}</p>}<small>{candidate.id}</small></div><button className="candidate-select" type="button" disabled={candidate.loading || Boolean(candidate.error)} onClick={() => confirm(candidate)}>{candidate.loading ? <LoaderCircle className="spin" size={15} /> : <>Select <ArrowRight size={15} /></>}</button></article>)}</div>{visibleCandidates < candidates.length && <button type="button" className="candidate-more" onClick={showMoreCandidates}>Show {candidates.length - visibleCandidates} more results <ArrowDown size={15} /></button>}<p className="candidate-metrics">Search: {searchMilliseconds ?? '—'} ms · Name loading: {hydrationMilliseconds} ms · Neighborhoods: {client.cacheStats().memoryHits} memory, {client.cacheStats().browserHits} browser, {client.cacheStats().networkRequests} API calls{client.cacheStats().rateLimits > 0 ? ` · ${client.cacheStats().rateLimits} rate limits` : ''}</p></section>}

            {confirmed && <section className="confirmed-section" aria-labelledby="confirmed-title"><div className="section-label"><span>03 / CONFIRMED DECLARATION</span><button type="button" className="text-action" onClick={() => { explorer.current.cancel(); setConfirmed(null); setAnalysisStarted(false); setStates(new Map()) }}><ArrowLeft size={14} /> Change</button></div><div className="confirmed-heading"><div><p className="eyebrow">Your selection</p><h2 id="confirmed-title">{confirmed.name}</h2></div><span className="check-seal"><Check size={19} /></span></div>{confirmed.body && <p className="confirmed-statement">{confirmed.body}</p>}{confirmed.slogan && <p className="confirmed-slogan">{confirmed.slogan}</p>}<div className="source-row"><span>Source: {confirmed.sourceLabel ?? 'TheoremGraph'}</span><span>ID: {confirmed.id}</span></div>{!analysisStarted && <div className="confirm-actions"><p>{objectives.length ? `${objectives.length} question${objectives.length > 1 ? 's' : ''} ready to explore.` : 'Add at least one question above to get started.'}</p><button className="primary-button" disabled={!objectives.length} onClick={begin}>Explore dependencies <ArrowRight size={17} /></button></div>}</section>}

            {analysisStarted && confirmed && <section className="results" aria-labelledby="results-title"><div className="section-label"><span>04 / FINDINGS</span><span>Live TheoremGraph API</span></div><div className="results-heading"><div><h2 id="results-title">What the graph shows</h2><p>A path shows an observed reference. It does not reconstruct the Lean proof script.</p></div><div className="result-actions">{isRunning && <button type="button" className="secondary-button" onClick={() => { explorer.current.pause(); setPauseRequested(true) }}><Pause size={15} /> {pauseRequested ? 'Pausing' : 'Pause'}</button>}{!isRunning && canResume && <button type="button" className="secondary-button" onClick={() => { explorer.current.resume(); setPauseRequested(false) }}><Play size={15} /> Resume</button>}<button type="button" className="icon-button" title="Copy link" aria-label="Copy link" onClick={share}>{copied ? <Check size={17} /> : <Copy size={17} />}</button><button type="button" className="icon-button" title="Export JSON" aria-label="Export JSON" onClick={exportResult}><Download size={17} /></button></div></div>
              {activeStates.length > 0 && <div className="progress-strip" role="status">{activeStates.map((state) => <div key={state.policy}><span className={`tiny-dot ${state.status}`} /><strong>{POLICY_LABEL[state.policy]}</strong><span>{state.visited.size} checked · {state.frontier.length} pending</span><em>{state.status === 'complete' ? state.completionReason === 'witnesses' ? 'Witnesses found' : 'Traversal complete' : state.status === 'running' ? 'Running' : state.status === 'paused' ? 'Paused' : state.status === 'limited' ? 'Limit reached' : state.status === 'error' ? 'Error' : 'Ready'}</em></div>)}</div>}
              <p className="candidate-metrics">Search: {searchMilliseconds ?? '—'} ms · Name loading: {hydrationMilliseconds} ms · Traversal: {activeStates.map((state) => `${POLICY_LABEL[state.policy]} ${Math.round(state.elapsedMs)} ms / ${state.requests} requests`).join(' ; ') || '—'} · Cache: {client.cacheStats().memoryHits} memory, {client.cacheStats().browserHits} browser, {client.cacheStats().networkRequests} API calls</p>
              <div className="answers">{objectives.map((objective) => <QuestionCard key={objective.id} objective={objective} state={objective.policy ? states.get(objective.policy) : undefined} theorem={confirmed} />)}</div>
              <GraphExplorer states={states} root={confirmed} onContinue={(policy) => explorer.current.continueAfterWitness(policy)} canContinue={!isRunning} />
              <div className="results-footnote"><CircleHelp size={16} /><p>A “no witness observed” result covers only the neighborhoods returned by the API during this consultation. The source does not guarantee an immutable snapshot or equivalence with <code>#print axioms</code>.</p></div>
            </section>}
          </div>

        </div>
      </section>
    </main>
    <SiteFooter />
  </div>
}

export default App
