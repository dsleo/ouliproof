import { useState, type RefObject } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, LoaderCircle, Plus, Search, X } from 'lucide-react'
import type { Candidate, Declaration, Objective, Policy } from './domain'
import { POLICY_LABEL } from './domain'
import { MathText } from './MathText'
import { CandidateCard } from './CandidateSection'
import { SUGGESTIONS } from './objectives'

export type SearchStatus = 'idle' | 'searching' | 'ready' | 'empty' | 'error'

interface SearchProps {
  query: string
  onQueryChange: (query: string) => void
  onSearch: () => void
  onCancel: () => void
  inputRef: RefObject<HTMLInputElement | null>
  status: SearchStatus
  seconds: number
  notice: string
  error: string
}

export function SearchSection({ query, onQueryChange, onSearch, onCancel, inputRef, status, seconds, notice, error }: SearchProps) {
  return <section className="form-section" aria-labelledby="query-title">
    <div className="section-label"><span>01 / SEARCH</span><span>In words or as a Lean name</span></div>
    <h2 id="query-title">Result of interest</h2>
    <p className="section-intro">Describe a result in your own words. You will confirm the exact statement before exploring it.</p>
    <form className="search-form" onSubmit={(event) => { event.preventDefault(); onSearch() }}>
      <Search size={19} aria-hidden="true" />
      <input ref={inputRef} aria-label="Lean name or mathematical description" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="e.g. a prime dividing a product, or Nat.add_comm" />
      <button type="submit" aria-label="Search" disabled={!query.trim() || status === 'searching'}>{status === 'searching' ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}<span>Search</span></button>
    </form>
    <div className="example-line">Try <button type="button" onClick={() => onQueryChange('if a prime number divides a product then it divides one of the factors')}>Euclid’s lemma</button><button type="button" onClick={() => onQueryChange('continuous function on a compact interval attains its maximum')}>maximum on a compact interval</button><button type="button" onClick={() => onQueryChange('Nat.add_comm')}>Nat.add_comm</button></div>
    {status === 'searching' && <div className="inline-state search-progress" role="status"><LoaderCircle size={16} className="spin" /><span>{seconds < 10 ? 'Searching for matching results…' : `Still searching (${Math.floor(seconds / 5) * 5}s). This can take a while.`}</span><button type="button" onClick={onCancel}>Cancel search</button></div>}
    {notice && status === 'idle' && <div className="inline-state" role="status">{notice}</div>}
    {status === 'empty' && <div className="inline-state">No matching results appeared. Try a different name or a more precise description.</div>}
    {status === 'error' && <div className="inline-state error" role="alert">{error} <button type="button" onClick={onSearch}>Try again</button></div>}
  </section>
}

function isDefinition(kind?: string) { return /^def(?:inition)?$/i.test(kind ?? '') }

export function ConfirmedSection({ declaration, onChange, onCopyLink, linkCopied }: { declaration: Declaration; onChange: () => void; onCopyLink: () => void; linkCopied: boolean }) {
  return <section className="confirmed-section" aria-labelledby="confirmed-title">
    <div className="section-label"><span>02 / SELECTED RESULT</span><div className="confirmed-actions"><button type="button" className="text-action" onClick={onCopyLink} aria-live="polite">{linkCopied ? <Check size={14} /> : <Copy size={14} />}{linkCopied ? 'Link copied' : 'Copy link'}</button><button type="button" className="text-action" onClick={onChange}><ArrowLeft size={14} /> Change result</button></div></div>
    <div className="confirmed-heading"><h2 id="confirmed-title" className={declaration.slogan ? 'confirmed-statement-title' : undefined}>{declaration.slogan ? <MathText text={declaration.slogan} /> : declaration.name}</h2><span className="check-seal"><Check size={19} /></span></div>
    {declaration.slogan && <p className="candidate-lean"><span>Lean</span> <code>{declaration.name}</code></p>}
    {isDefinition(declaration.kind) && <div className="declaration-kind-note"><strong>This is a definition, not a theorem</strong><p>Its body may contain proofs. If the proof-only scan stops here, you can choose to explore its definition dependencies.</p></div>}
  </section>
}

interface QuestionProps {
  objectives: Objective[]
  draft: string
  onDraftChange: (draft: string) => void
  onAdd: (value: string) => void
  onRemove: (id: string) => void
  onBegin: () => void
  analysisStarted: boolean
  resolver: Resolver | null
  onPick: (candidate: Candidate) => void
  onDismissResolver: () => void
}

export interface Resolver { text: string; status: 'searching' | 'ready' | 'empty' | 'error'; candidates: Candidate[]; error?: string }

function policyName(policy?: Policy) { return policy ? POLICY_LABEL[policy] : 'Outside the current scope' }

export function QuestionSection({ objectives, draft, onDraftChange, onAdd, onRemove, onBegin, analysisStarted, resolver, onPick, onDismissResolver }: QuestionProps) {
  const [adding, setAdding] = useState(false)
  return <section className="form-section objective-section" aria-labelledby="objective-title">
    <div className="section-label"><span>03 / QUESTION</span><span>Ask one or more</span></div>
    <h2 id="objective-title">What would you like to detect?</h2>
    <p className="section-intro">Choose methods to look for across the dependency chain, or name a result the proof should depend on, in words or as a Lean name.</p>
    <div className="suggestions" aria-label="Suggested questions">{SUGGESTIONS.map((item) => <button type="button" key={item.value} onClick={() => onAdd(item.value)}><Plus size={14} /><span>{item.label}</span><small>{item.caption}</small></button>)}</div>
    {adding || resolver
      ? <form className="objective-form" onSubmit={(event) => { event.preventDefault(); onAdd(draft) }}>
        <label htmlFor="objective-input">Another question</label>
        <div><input id="objective-input" autoFocus value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="e.g. uses Zorn’s lemma, or depends on Nat.zero_add" /><button type="submit" disabled={!draft.trim()} aria-label="Add question"><Plus size={18} /></button></div>
      </form>
      : <button type="button" className="add-question" onClick={() => setAdding(true)} aria-label="Add another question" title="Add another question"><Plus size={16} /></button>}
    {resolver && <div className="resolver" role="region" aria-label={`Matches for ${resolver.text}`}>
      <div className="resolver-head"><h3>Is this the result you mean by “{resolver.text}”?</h3><button type="button" className="resolver-close" onClick={onDismissResolver} aria-label="Dismiss"><X size={16} /></button></div>
      {resolver.status === 'searching' && <div className="inline-state" role="status"><LoaderCircle size={16} className="spin" /> Searching for matching results…</div>}
      {resolver.status === 'empty' && <div className="inline-state">No matching results appeared. Try describing the result differently.</div>}
      {resolver.status === 'error' && <div className="inline-state error" role="alert">{resolver.error}</div>}
      {resolver.candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} onConfirm={onPick} />)}
    </div>}
    {objectives.length > 0 && <div className="selected-questions"><h3>Selected questions <span>{objectives.length}</span></h3>{objectives.map((objective) => <div className="selected-item" key={objective.id}><div><strong>{objective.original}</strong><p>{objective.interpretation}</p><span className={objective.capability === 'unavailable' ? 'capability no' : 'capability'}>{objective.capability === 'unavailable' ? 'No detector' : objective.capability === 'hint' ? 'Graph + source signal' : policyName(objective.policy)}</span></div><button type="button" onClick={() => onRemove(objective.id)} aria-label={`Remove ${objective.original}`}><X size={16} /></button></div>)}</div>}
    {!analysisStarted && <div className="confirm-actions"><p>{objectives.length ? `${objectives.length} question${objectives.length > 1 ? 's' : ''} ready to explore.` : 'Choose at least one question to continue.'}</p><button type="button" className="primary-button" disabled={!objectives.length} onClick={onBegin}>Explore dependencies <ArrowRight size={17} /></button></div>}
  </section>
}
