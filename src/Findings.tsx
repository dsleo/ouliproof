import { ArrowRight, Check, LoaderCircle } from 'lucide-react'
import type { Declaration, Objective, Policy, TraversalState } from './domain'
import { findEvidence, type Evidence, type MethodIndex } from './methods'

function isDefinition(kind?: string) { return /^def(?:inition)?$/i.test(kind ?? '') }

function EvidenceItem({ evidence, theorem, onInspect }: { evidence: Evidence; theorem: Declaration; onInspect: (id: string) => void }) {
  return <div className={`witness evidence-${evidence.grade}`}>
    <div className="witness-title">{evidence.grade === 'observed' ? <Check size={16} aria-hidden="true" /> : <span className="lead-mark" aria-hidden="true" />}<strong>{evidence.matchedName}</strong><span>{evidence.path.length - 1} {evidence.path.length === 2 ? 'edge' : 'edges'} · {evidence.location === 'root' ? 'selected proof' : evidence.location === 'definition' ? 'reached definition' : 'proof dependency'}</span></div>
    <p className="evidence-description">{evidence.explanation}</p>
    <ol className="path" aria-label={`Path from ${theorem.name} to ${evidence.matchedName}`}>
      {evidence.path.map((step, index) => <li key={`${step.id}-${index}`}>
        {index > 0 && <span className="edge-type">{step.via}</span>}
        <span className="path-node" title={step.id}>{step.name}</span>
      </li>)}
    </ol>
    <details className="evidence-details">
      <summary>Evidence details</summary>
      <dl>
        <div><dt>Source</dt><dd>{evidence.source}</dd></div>
        {evidence.matchedToken && <div><dt>Recorded tactic</dt><dd><code>{evidence.matchedToken}</code></dd></div>}
        {evidence.sourceRevision && <div><dt>MathlibGraph revision</dt><dd><code>{evidence.sourceRevision}</code></dd></div>}
        {(evidence.graphSourceLabel || evidence.source === 'MathlibGraph') && <div><dt>TheoremGraph snapshot</dt><dd><code>{evidence.graphSourceLabel ?? 'Not provided'}</code></dd></div>}
        {evidence.joinStatus && <div><dt>Proof-version match</dt><dd>{evidence.joinStatus === 'different-version' ? 'Different labelled versions; this tactic remains a lead.' : 'Not verified; this tactic remains a lead.'}</dd></div>}
        <div><dt>Detector rule</dt><dd><code>{evidence.ruleId}</code></dd></div>
      </dl>
    </details>
    <button type="button" className="evidence-inspect" onClick={() => onInspect(evidence.path[evidence.path.length - 1].id)}>Inspect in graph <ArrowRight size={13} /></button>
  </div>
}

export function QuestionCard({ objective, state, theorem, index, indexStatus, onInspect, onIncludeDefinitions, onResume }: { objective: Objective; state?: TraversalState; theorem: Declaration; index?: MethodIndex; indexStatus: 'idle' | 'loading' | 'ready' | 'error'; onInspect: (id: string, policy: Policy) => void; onIncludeDefinitions: () => void; onResume: () => void }) {
  const evidence = findEvidence(state, objective, index)
  const primary = evidence.find((item) => item.grade !== 'related')
  const related = evidence.find((item) => item.grade === 'related')
  const displayed = primary ?? related
  const secondaryAll = evidence.filter((item) => item.id !== displayed?.id && (item.source !== displayed?.source || item.grade !== displayed?.grade))
  const secondary = secondaryAll.slice(0, 6)
  const unsupported = objective.capability === 'unavailable'
  const exhausted = state?.status === 'complete' && state.completionReason === 'exhausted'
  const definitionScopeNeeded = exhausted && state.policy === 'proof' && isDefinition(theorem.kind) && state.visited.size === 1 && state.edges.length === 0 && state.rootDefinitionEdges > 0
  const indexMissing = objective.kind !== 'named' && indexStatus === 'error'
  const badge = unsupported ? 'Undetermined' : primary?.grade === 'observed' ? 'Graph witness' : primary ? primary.joinStatus === 'different-version' ? 'Cross-version lead' : 'Possible method signal' : related ? 'Related evidence' : definitionScopeNeeded ? 'Definition scope needed' : exhausted && indexMissing ? 'Partial evidence' : exhausted ? 'No marker observed' : state?.status === 'limited' ? 'Limit reached' : state?.status === 'error' ? 'API error' : state?.status === 'paused' ? 'Paused' : 'Searching'
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
      {state?.policy === 'body' && isDefinition(theorem.kind) && <p className="answer-note">This scan includes definition-body references. A method found through them may belong to a referenced definition, so inspect its path.</p>}
      {unsupported ? (
        <p className="answer-note">This request has no reviewed detector. Enter a full Lean declaration name or choose one of the method questions.</p>
      ) : displayed ? (
        <>
          <EvidenceItem evidence={displayed} theorem={theorem} onInspect={(id) => onInspect(id, objective.policy ?? 'proof')} />
          {secondary.length > 0 && <details className="secondary-evidence"><summary>Other evidence ({secondaryAll.length}{secondaryAll.length > secondary.length ? ', first 6 shown' : ''})</summary>{secondary.map((item) => <div key={item.id} className="secondary-evidence-item"><strong>{item.grade === 'lead' ? 'Possible tactic signal' : item.grade === 'related' ? 'Related signal' : 'Graph witness'}</strong><EvidenceItem evidence={item} theorem={theorem} onInspect={(id) => onInspect(id, objective.policy ?? 'proof')} /></div>)}</details>}
          {state?.completionReason === 'witnesses' && <p className="fine-print">Exploration stopped at the first match. More paths may exist.</p>}
        </>
      ) : definitionScopeNeeded ? (
        <><p className="answer-note">This result is a definition. The proof-only scan has no proof edges to follow and excluded {state.rootDefinitionEdges} definition-body references. It cannot assess this question through those dependencies.</p><button type="button" className="evidence-inspect" onClick={onIncludeDefinitions}>Explore definition dependencies <ArrowRight size={13} /></button></>
      ) : exhausted ? (
        <p className="answer-note">{indexMissing ? 'Recorded tactics could not be checked. ' : ''}No matching graph marker appeared in {state.visited.size} checked declarations. The detector and source coverage cannot establish that this method is absent.</p>
      ) : state?.status === 'limited' ? (
        <p className="answer-note">The exploration limit was reached. Remaining dependencies were not checked, so no negative conclusion is possible.</p>
      ) : state?.status === 'error' ? (
        <p className="answer-note">{state.error} Remaining dependencies were not checked.</p>
      ) : <p className="answer-note">The graph is explored layer by layer. A verified path will appear here when found.</p>}
      {!unsupported && displayed && state?.status === 'error' && <div className="scan-state-note error" role="alert">Exploration stopped: {state.error} Remaining dependencies were not checked. <button type="button" onClick={onResume}>Resume exploration</button></div>}
      {!unsupported && displayed && state?.status === 'limited' && <p className="scan-state-note">Exploration reached its limit. Remaining dependencies were not checked.</p>}
      {!unsupported && displayed && state?.status === 'paused' && <div className="scan-state-note">Exploration is paused. Remaining dependencies were not checked. <button type="button" onClick={onResume}>Resume exploration</button></div>}
      {!unsupported && displayed && state?.status === 'running' && <p className="scan-state-note" role="status">Exploration continues; more dependencies remain unchecked.</p>}
      {!unsupported && !primary && !related && !definitionScopeNeeded && state && state.visited.size > 0 && (state.edges.length > 0 || state.status !== 'running') && <button type="button" className="evidence-inspect" onClick={() => onInspect(theorem.id, objective.policy ?? 'proof')}>Inspect in graph <ArrowRight size={13} /></button>}
    </article>
  )
}
