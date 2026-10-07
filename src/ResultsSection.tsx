import { LoaderCircle, Pause, Play } from 'lucide-react'
import type { Declaration, Objective, Policy, TraversalState } from './domain'
import { findEvidence, type MethodIndex } from './methods'
import { GraphExplorer } from './GraphExplorer'
import { QuestionCard } from './Findings'

interface Props {
  theorem: Declaration
  objectives: Objective[]
  states: Map<Policy, TraversalState>
  methodIndex?: MethodIndex
  indexStatus: 'idle' | 'loading' | 'ready' | 'error'
  indexError: string
  isRunning: boolean
  canResume: boolean
  pauseRequested: boolean
  onPause: () => void
  onResume: () => void
  onRetryIndex: () => void
  onIncludeDefinitions: () => void
  onContinue: (policy: Policy) => void
}

export function ResultsSection({ theorem, objectives, states, methodIndex, indexStatus, indexError, isRunning, canResume, pauseRequested, onPause, onResume, onRetryIndex, onIncludeDefinitions, onContinue }: Props) {
  return <section className="results" aria-labelledby="results-title">
    <div className="section-label"><span>04 / FINDINGS</span></div>
    <div className="results-heading">
      <div><h2 id="results-title" tabIndex={-1}>What the dependencies show</h2><p>A path confirms a reference. It does not reconstruct the Lean proof script.</p></div>
      <div className="result-actions">
        {isRunning && <button type="button" className="secondary-button" onClick={onPause}><Pause size={15} /> {pauseRequested ? 'Pausing' : 'Pause'}</button>}
        {!isRunning && canResume && <button type="button" className="secondary-button" onClick={onResume}><Play size={15} /> Resume</button>}
      </div>
    </div>
    {indexStatus === 'loading' && <div className="inline-state" role="status"><LoaderCircle size={16} className="spin" /> Loading the compact MathlibGraph method index…</div>}
    {indexStatus === 'error' && <div className="inline-state error" role="alert">Recorded tactic evidence is unavailable: {indexError} Graph-reference detectors can still run. <button type="button" onClick={onRetryIndex}>Retry index</button></div>}
    <div className="answers">{objectives.map((objective) => <QuestionCard key={objective.id} objective={objective} state={objective.policy ? states.get(objective.policy) : undefined} theorem={theorem} index={methodIndex} indexStatus={indexStatus} onIncludeDefinitions={onIncludeDefinitions} onResume={onResume} />)}</div>
    {[...states.values()].some((state) => state.visited.size > 0) && <GraphExplorer states={states} root={theorem} onContinue={onContinue} canContinue={!isRunning} evidencePaths={objectives.flatMap((objective) => objective.policy ? findEvidence(states.get(objective.policy), objective, methodIndex).slice(0, 7).map((evidence) => ({ policy: objective.policy!, path: evidence.path })) : [])} />}
  </section>
}
