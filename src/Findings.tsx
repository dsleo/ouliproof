import { ArrowRight, Check, LoaderCircle } from 'lucide-react'
import type { Declaration, Objective, TraversalState } from './domain'
import { MathText } from './MathText'
import { findEvidence, type Evidence, type MethodIndex } from './methods'

function isDefinition(kind?: string) { return /^def(?:inition)?$/i.test(kind ?? '') }

// ponytail: small hand-written table for the principles users meet most; the rest fall back to the slogan, then the Lean name.
const INFORMAL_NAME: Record<string, string> = {
  'Nat.recAux': 'the induction principle on ℕ', 'Nat.rec': 'the induction principle on ℕ', 'Nat.le_induction': 'induction starting from a base case',
  'Classical.choice': 'the axiom of choice', 'Classical.em': 'the law of excluded middle', 'Classical.byContradiction': 'proof by contradiction',
  'Decidable.byContradiction': 'proof by contradiction', 'Classical.byCases': 'case analysis on a statement', 'Or.elim': 'case analysis on a disjunction',
  'propext': 'propositional extensionality', 'Quot.sound': 'quotient soundness', 'funext': 'function extensionality', 'False.elim': 'ex falso (from a contradiction, anything)',
}

const METHOD_PHRASE: Record<string, string> = { induction: 'Induction', cases: 'Case analysis', absurd: 'Proof by contradiction', choice: 'The axiom of choice' }

// ponytail: one fixed sentence per grade; richer prose (per-rule wording) only if users ask.
export function storyHeadline(evidence: Evidence, objective: Objective) {
  const via = INFORMAL_NAME[evidence.matchedName]
  const method = objective.kind === 'named' ? `A reference to ${objective.target ?? evidence.matchedName}` : METHOD_PHRASE[objective.kind] ?? 'This method'
  const steps = evidence.path.length - 1
  const where = steps === 0 ? 'in the selected proof itself' : `${steps} ${steps === 1 ? 'step' : 'steps'} down`
  return evidence.grade === 'observed' ? `${method} enters through ${via ?? evidence.matchedName}, ${where}.` : `${method} may be used ${where}: a recorded tactic suggests it, but the proof version is unconfirmed.`
}

function EvidenceItem({ evidence, objective, theorem, names }: { evidence: Evidence; objective: Objective; theorem: Declaration; names?: Map<string, Declaration> }) {
  return <div className={`witness evidence-${evidence.grade}`}>
    <p className="story-headline">{storyHeadline(evidence, objective)}</p>
    <div className="witness-title">{evidence.grade === 'observed' ? <Check size={16} aria-hidden="true" /> : <span className="lead-mark" aria-hidden="true" />}<strong>{evidence.matchedName}</strong><span>{evidence.path.length - 1} {evidence.path.length === 2 ? 'edge' : 'edges'} · {evidence.location === 'root' ? 'selected proof' : evidence.location === 'definition' ? 'reached definition' : 'proof dependency'}</span></div>
    <p className="evidence-description">{evidence.explanation}</p>
    <ol className="path" aria-label={`Path from ${theorem.name} to ${evidence.matchedName}`}>
      {evidence.path.map((step, index) => {
        const declaration = names?.get(step.id)
        const informal = declaration?.slogan ?? INFORMAL_NAME[step.name]
        const link = index > 0 && <span className="edge-type">{step.via === 'def' ? 'unfolds' : 'uses'}</span>
        return <li key={`${step.id}-${index}`}>
          <div className="story-step">
            {informal ? <>
              <span className="story-informal">{link}<MathText text={informal} /></span>
              <span className="story-lean">Lean · <code>{step.name}</code></span>
            </> : <>
              <span className="path-node" title={step.id}>{link}{step.name}</span>
              {declaration?.body && <span className="story-statement">{declaration.body}</span>}
            </>}
          </div>
        </li>
      })}
    </ol>
  </div>
}

export function QuestionCard({ objective, state, theorem, index, indexStatus, onIncludeDefinitions, onResume }: { objective: Objective; state?: TraversalState; theorem: Declaration; index?: MethodIndex; indexStatus: 'idle' | 'loading' | 'ready' | 'error'; onIncludeDefinitions: () => void; onResume: () => void }) {
  const evidence = findEvidence(state, objective, index)
  const primary = evidence.find((item) => item.grade !== 'related')
  const related = evidence.find((item) => item.grade === 'related')
  const displayed = primary ?? related
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
          <EvidenceItem evidence={displayed} objective={objective} names={state?.names} theorem={theorem} />
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
    </article>
  )
}
