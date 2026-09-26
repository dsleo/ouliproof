import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, BookOpenText, Check, ChevronDown, CircleHelp, Clock3, Copy, Download, ExternalLink, FlaskConical, LoaderCircle, Pause, Play, Plus, Search, X } from 'lucide-react'
import { ApiError, TheoremGraphClient } from './api'
import type { Candidate, Declaration, Objective, Policy, TraversalState } from './domain'
import { POLICY_LABEL } from './domain'
import { Explorer, findWitness, LIMITS } from './explorer'
import { interpretObjective, objectiveKey, SUGGESTIONS } from './objectives'
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
  if (error instanceof DOMException && error.name === 'AbortError') return 'Recherche interrompue.'
  if (error instanceof Error) return error.message
  return 'Une erreur inattendue est survenue.'
}

function policyName(policy?: Policy) { return policy ? POLICY_LABEL[policy] : 'Question hors périmètre V1' }

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
  const badge = unsupported ? 'Non déterminable' : witness ? 'Témoin observé' : state?.status === 'complete' ? 'Aucun témoin observé' : state?.status === 'limited' ? 'Exploration limitée' : state?.status === 'error' ? 'Erreur API' : state?.status === 'paused' ? 'En pause' : 'Recherche en cours'
  const kind = unsupported ? 'muted' : witness ? 'positive' : state?.status === 'complete' ? 'neutral' : state?.status === 'error' ? 'negative' : 'pending'
  return (
    <article className="answer-card">
      <div className="answer-head">
        <div>
          <p className="eyebrow">Question posée</p>
          <h3>{objective.original}</h3>
        </div>
        <span className={`status-pill ${kind}`}>{!unsupported && !witness && state?.status === 'running' && <LoaderCircle size={13} className="spin" />}{badge}</span>
      </div>
      <p className="interpretation">{objective.interpretation}</p>
      {unsupported ? (
        <p className="answer-note">Les dépendances connues de TheoremGraph ne suffisent pas à attribuer ce procédé à l’auteur de la preuve. Vous pouvez chercher une déclaration Lean précise à la place.</p>
      ) : witness ? (
        <div className="witness">
          <div className="witness-title"><Check size={16} /><strong>{objective.target}</strong><span>{witness.length - 1} {witness.length === 2 ? 'arête' : 'arêtes'}</span></div>
          <ol className="path" aria-label={`Chemin de ${theorem.name} vers ${objective.target}`}>
            {witness.map((step, index) => <li key={`${step.id}-${index}`}>
              {index > 0 && <span className="edge-type">{step.via}</span>}
              <span className="path-node" title={step.id}>{step.name}</span>
            </li>)}
          </ol>
          {state?.status !== 'complete' && <p className="fine-print">Témoin trouvé ; l’exploration de cette politique n’est pas terminée.</p>}
        </div>
      ) : state?.status === 'complete' ? (
        <p className="answer-note">Aucune déclaration nommée <code>{objective.target}</code> n’a été observée dans la clôture retournée par cette consultation de l’API. Cela ne prouve pas une absence dans Lean.</p>
      ) : state?.status === 'limited' ? (
        <p className="answer-note">Le budget local est atteint. Les dépendances restantes n’ont pas été vérifiées ; aucun verdict négatif n’est possible.</p>
      ) : state?.status === 'error' ? (
        <p className="answer-note">{state.error} Les dépendances restantes n’ont pas été vérifiées.</p>
      ) : <p className="answer-note">Le graphe est parcouru par couches. Un chemin vérifié apparaîtra ici dès qu’il sera trouvé.</p>}
      {!unsupported && <div className="answer-footer"><span>{policyName(objective.policy)}</span><span>{state?.visited.size ?? 0} déclarations vérifiées · {state?.frontier.length ?? 0} en attente</span></div>}
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
  const [confirmed, setConfirmed] = useState<Declaration | null>(null)
  const [analysisStarted, setAnalysisStarted] = useState(false)
  const [states, setStates] = useState<Map<Policy, TraversalState>>(new Map())
  const [copied, setCopied] = useState(false)
  const [pauseRequested, setPauseRequested] = useState(false)
  const searchController = useRef<AbortController | null>(null)
  const searchSerial = useRef(0)
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
      setSearchError(`Le théorème du lien n’a pas pu être chargé : ${formatError(error)}`)
    })
    return () => { live = false }
  }, [])

  function resetAnalysis(nextObjectives = objectives) {
    if (!confirmed) return
    const policies = Array.from(new Set(nextObjectives.map((objective) => objective.policy).filter((value): value is Policy => Boolean(value))))
    explorer.current.setup(confirmed, policies)
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

  async function search() {
    if (!query.trim()) return
    searchController.current?.abort()
    explorer.current.cancel()
    setConfirmed(null)
    setAnalysisStarted(false)
    setStates(new Map())
    setCandidates([])
    setSearchError('')
    setSearchStatus('searching')
    const controller = new AbortController()
    searchController.current = controller
    const serial = ++searchSerial.current
    try {
      const found = await client.search(query.trim(), controller.signal)
      if (serial !== searchSerial.current) return
      if (!found.length) { setSearchStatus('empty'); return }
      setCandidates(found)
      setSearchStatus('ready')
      for (let offset = 0; offset < found.length; offset += 3) {
        if (controller.signal.aborted || serial !== searchSerial.current) break
        const chunk = found.slice(offset, offset + 3)
        await Promise.allSettled(chunk.map(async (item) => {
          try {
            const neighborhood = await client.neighborhood(item.id, controller.signal)
            if (controller.signal.aborted || serial !== searchSerial.current) return
            setCandidates((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...neighborhood.root, slogan: candidate.slogan, score: candidate.score, loading: false } : candidate))
          } catch (error) {
            if (controller.signal.aborted || serial !== searchSerial.current) return
            setCandidates((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, loading: false, error: formatError(error) } : candidate))
          }
        }))
      }
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function begin() {
    if (!confirmed || !objectives.length) return
    setAnalysisStarted(true)
    resetAnalysis()
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
      note: 'Observation du graphe fourni par l’API, pas un certificat de preuve Lean.',
    })
  }

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="Ouliproof, accueil"><span className="brand-mark">O<span>·</span></span><span>Ouliproof</span></a>
      <nav aria-label="Navigation"><a href="#method">Méthode</a><a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">Source <ExternalLink size={12} /></a></nav>
    </header>

    <main>
      <section className="intro" aria-labelledby="page-title">
        <div className="intro-kicker"><span className="line" /> Enquête sur les preuves formalisées</div>
        <h1 id="page-title">Suivez le fil <em>des dépendances.</em></h1>
        <p>Choisissez un résultat Mathlib, posez une question précise, puis inspectez le chemin qui relie sa preuve à une déclaration ou à un principe.</p>
        <div className="intro-meta"><span><span className="tiny-dot" /> TheoremGraph · Mathlib</span><span>Un témoin, un chemin, une limite explicite.</span></div>
      </section>

      <section className="workspace" aria-label="Analyse d’un théorème">
        <div className="step-rail" aria-label="Étapes">
          <span className={pageStep === 1 ? 'current' : 'done'}><b>01</b> Chercher</span><span className={pageStep === 2 ? 'current' : pageStep === 3 ? 'done' : ''}><b>02</b> Confirmer</span><span className={pageStep === 3 ? 'current' : ''}><b>03</b> Examiner</span>
        </div>

        <div className="workspace-grid">
          <div className="main-column">
            <section className="form-section" aria-labelledby="query-title">
              <div className="section-label"><span>01 / LA DÉCLARATION</span><span>Recherche sémantique</span></div>
              <h2 id="query-title">Quel résultat étudier&nbsp;?</h2>
              <p className="section-intro">Entrez un nom Lean ou décrivez le résultat en langage mathématique. Vous choisirez ensuite la déclaration exacte.</p>
              <form className="search-form" onSubmit={(event) => { event.preventDefault(); void search() }}>
                <Search size={19} aria-hidden="true" />
                <input aria-label="Théorème ou description mathématique" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. Nat.add_comm, ou « tout nombre premier divisant un produit… »" />
                <button type="submit" aria-label="Rechercher" disabled={!query.trim() || searchStatus === 'searching'}>{searchStatus === 'searching' ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}<span>Rechercher</span></button>
              </form>
              <div className="example-line">Pour essayer <button type="button" onClick={() => setQuery('Nat.add_comm')}>Nat.add_comm</button><button type="button" onClick={() => setQuery('if a prime number divides a product then it divides one of the factors')}>lemme d’Euclide</button><button type="button" onClick={() => setQuery('continuous function on a compact interval attains its maximum')}>maximum sur un compact</button></div>
              {searchStatus === 'searching' && <div className="inline-state" role="status"><LoaderCircle size={16} className="spin" /> Recherche dans TheoremGraph. Elle peut prendre plusieurs secondes.</div>}
              {searchStatus === 'empty' && <div className="inline-state">Aucune déclaration Mathlib dans les premiers résultats. Essayez un autre nom ou une description plus précise.</div>}
              {searchStatus === 'error' && <div className="inline-state error" role="alert">{searchError} <button onClick={() => void search()}>Réessayer</button></div>}
            </section>

            <section className="form-section objective-section" aria-labelledby="objective-title">
              <div className="section-label"><span>02 / LA QUESTION</span><span>Plusieurs questions possibles</span></div>
              <h2 id="objective-title">Que souhaitez-vous détecter&nbsp;?</h2>
              <p className="section-intro">Choisissez une suggestion ou nommez une déclaration Lean. Chaque question montrera ce que les données permettent réellement de conclure.</p>
              <div className="suggestions" aria-label="Questions suggérées">{SUGGESTIONS.map((item) => <button type="button" key={item.value} onClick={() => addAndRefresh(item.value)}><Plus size={14} /><span>{item.label}</span><small>{item.caption}</small></button>)}</div>
              <form className="objective-form" onSubmit={(event) => { event.preventDefault(); addAndRefresh(draft) }}>
                <label htmlFor="objective-input">Autre question ou nom Lean précis</label>
                <div><input id="objective-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ex. dépend de Nat.zero_add" /><button type="submit" disabled={!draft.trim()} aria-label="Ajouter la question"><Plus size={18} /></button></div>
              </form>
              {objectives.length > 0 && <div className="selected-questions"><h3>Questions retenues <span>{objectives.length}</span></h3>{objectives.map((objective) => <div className="selected-item" key={objective.id}><div><strong>{objective.original}</strong><p>{objective.interpretation}</p><span className={objective.capability === 'unavailable' ? 'capability no' : 'capability'}>{objective.capability === 'unavailable' ? 'Non déterminable' : policyName(objective.policy)}</span></div><button type="button" onClick={() => removeObjective(objective.id)} aria-label={`Retirer ${objective.original}`}><X size={16} /></button></div>)}</div>}
            </section>

            {searchStatus === 'ready' && !confirmed && <section className="candidate-section" aria-labelledby="candidate-title"><div className="section-label"><span>03 / CONFIRMATION</span><span>Choix obligatoire</span></div><h2 id="candidate-title">Quelle déclaration vouliez-vous&nbsp;?</h2><p className="section-intro">Les résultats sont classés par similarité, pas par correspondance exacte du nom. Vérifiez le nom et le résumé avant de continuer.</p>{/^[A-Za-z_][A-Za-z0-9_'.]*\.[A-Za-z_][A-Za-z0-9_'.]*$/.test(query.trim()) && !candidates.some((candidate) => candidate.name === query.trim()) && candidates.every((candidate) => !candidate.loading) && <p className="search-advice">Le nom <code>{query.trim()}</code> n’apparaît pas parmi ces résultats. La recherche sémantique peut manquer un nom exact ; essayez une description mathématique du résultat.</p>}<div className="candidate-list">{candidates.map((candidate, index) => <article className="candidate" key={candidate.id}><div className="candidate-index">{String(index + 1).padStart(2, '0')}</div><div className="candidate-body"><div className="candidate-top"><h3>{candidate.loading ? 'Identification…' : candidate.name}</h3><span>{candidate.sourceLabel}</span></div>{candidate.body && <p className="formal-body">{candidate.body}</p>}{candidate.slogan && <p>{candidate.slogan}</p>}{candidate.error && <p className="candidate-error">Nom indisponible : {candidate.error}</p>}<small>{candidate.id}</small></div><button className="candidate-select" type="button" disabled={candidate.loading || Boolean(candidate.error)} onClick={() => confirm(candidate)}>{candidate.loading ? <LoaderCircle className="spin" size={15} /> : <>Choisir <ArrowRight size={15} /></>}</button></article>)}</div></section>}

            {confirmed && <section className="confirmed-section" aria-labelledby="confirmed-title"><div className="section-label"><span>03 / DÉCLARATION CONFIRMÉE</span><button type="button" className="text-action" onClick={() => { explorer.current.cancel(); setConfirmed(null); setAnalysisStarted(false); setStates(new Map()) }}><ArrowLeft size={14} /> Changer</button></div><div className="confirmed-heading"><div><p className="eyebrow">Votre choix</p><h2 id="confirmed-title">{confirmed.name}</h2></div><span className="check-seal"><Check size={19} /></span></div>{confirmed.body && <p className="confirmed-statement">{confirmed.body}</p>}{confirmed.slogan && <p className="confirmed-slogan">{confirmed.slogan}</p>}<div className="source-row"><span>Source : {confirmed.sourceLabel ?? 'TheoremGraph'}</span><span>Identifiant : {confirmed.id}</span></div>{!analysisStarted && <div className="confirm-actions"><p>{objectives.length ? `${objectives.length} question${objectives.length > 1 ? 's' : ''} prête${objectives.length > 1 ? 's' : ''} pour l’analyse.` : 'Ajoutez au moins une question ci-dessus pour commencer.'}</p><button className="primary-button" disabled={!objectives.length} onClick={begin}>Examiner les dépendances <ArrowRight size={17} /></button></div>}</section>}

            {analysisStarted && confirmed && <section className="results" aria-labelledby="results-title"><div className="section-label"><span>04 / OBSERVATIONS</span><span>API TheoremGraph en direct</span></div><div className="results-heading"><div><h2 id="results-title">Ce que révèle le graphe</h2><p>Un chemin montre une référence observée. Il ne reconstitue pas le script de preuve Lean.</p></div><div className="result-actions">{isRunning && <button type="button" className="secondary-button" onClick={() => { explorer.current.pause(); setPauseRequested(true) }}><Pause size={15} /> {pauseRequested ? 'Pause demandée' : 'Pause'}</button>}{!isRunning && canResume && <button type="button" className="secondary-button" onClick={() => { explorer.current.resume(); setPauseRequested(false) }}><Play size={15} /> Reprendre</button>}<button type="button" className="icon-button" title="Copier le lien" aria-label="Copier le lien" onClick={share}>{copied ? <Check size={17} /> : <Copy size={17} />}</button><button type="button" className="icon-button" title="Exporter en JSON" aria-label="Exporter en JSON" onClick={exportResult}><Download size={17} /></button></div></div>
              {activeStates.length > 0 && <div className="progress-strip" role="status">{activeStates.map((state) => <div key={state.policy}><span className={`tiny-dot ${state.status}`} /><strong>{POLICY_LABEL[state.policy]}</strong><span>{state.visited.size} traitées · {state.frontier.length} en attente</span><em>{state.status === 'complete' ? 'Terminé' : state.status === 'running' ? 'En cours' : state.status === 'paused' ? 'En pause' : state.status === 'limited' ? 'Limite atteinte' : state.status === 'error' ? 'Erreur' : 'Prêt'}</em></div>)}</div>}
              <div className="answers">{objectives.map((objective) => <QuestionCard key={objective.id} objective={objective} state={objective.policy ? states.get(objective.policy) : undefined} theorem={confirmed} />)}</div>
              <div className="results-footnote"><CircleHelp size={16} /><p>Une réponse « aucun témoin » porte seulement sur les voisinages renvoyés par l’API pendant cette consultation. La source ne garantit pas un instantané immuable ni une équivalence avec <code>#print axioms</code>.</p></div>
            </section>}
          </div>

          <aside className="side-column" aria-label="Repères"><div className="side-panel"><div className="side-icon"><FlaskConical size={20} /></div><h2>Lire une dépendance</h2><p>Une arête <code>proof</code> indique qu’un terme de preuve référence une autre déclaration. Une arête <code>def</code> vient d’un corps de définition.</p><div className="mini-path"><span>Théorème</span><ArrowDown size={16} /><span>Lemme cité</span><ArrowDown size={16} /><span>Principe recherché</span></div><a href="#method">Comment interpréter les résultats <ArrowRight size={14} /></a></div><div className="side-note"><BookOpenText size={18} /><p>« Utilise une récurrence » ou « raisonne par l’absurde » décrit la preuve écrite. Un graphe de références ne suffit pas toujours à le démontrer.</p></div><div className="side-meta"><span><Clock3 size={14} /> Recherche parfois lente</span><span><ChevronDown size={14} /> Exploration bornée à {LIMITS.nodes} déclarations</span></div></aside>
        </div>
      </section>

      <section className="method" id="method" aria-labelledby="method-title"><div className="method-number">Note de méthode / 01</div><div><h2 id="method-title">Une réponse que l’on peut vérifier.</h2><p>Ouliproof suit les dépendances exposées par TheoremGraph. Il distingue les références de preuve (<code>proof</code>) de la traversée des définitions (<code>proof + def</code>) et affiche le chemin exact vers tout témoin. Les catégories de raisonnement qui ne peuvent pas être déduites de ce graphe restent explicitement sans verdict.</p><a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">Documentation de l’API <ExternalLink size={14} /></a></div></section>
    </main>
    <footer><span>Ouliproof</span><span>Une lecture prudente des dépendances Mathlib.</span><span>Données : TheoremGraph / TheoremSearch</span></footer>
  </div>
}

export default App
