import { ArrowDown, ArrowRight, LoaderCircle } from 'lucide-react'
import type { Candidate } from './domain'
import { MathText } from './MathText'
import { isLeanNameQuery } from './searchCandidates'

interface Props {
  candidates: Candidate[]
  visible: Candidate[]
  visibleCount: number
  query: string
  onConfirm: (candidate: Candidate) => void
  onShowMore: () => void
}

export function CandidateCard({ candidate, index, exactMatch, onConfirm }: { candidate: Candidate; index?: number; exactMatch?: boolean; onConfirm: (candidate: Candidate) => void }) {
  return <article className={index === undefined ? 'candidate no-index' : 'candidate'}>
    {index !== undefined && <div className="candidate-index">{String(index).padStart(2, '0')}</div>}
    <div className="candidate-body">
      {exactMatch && <span className="candidate-exact">Exact name match</span>}
      {candidate.loading ? <h3>Loading…</h3> : candidate.slogan ? <h3 className="candidate-statement"><MathText text={candidate.slogan} /></h3> : <h3>{candidate.name}</h3>}
      {!candidate.loading && candidate.slogan && <p className="candidate-lean"><span>Lean</span> <code>{candidate.name}</code></p>}
      {candidate.body && <p className="formal-body">{candidate.body}</p>}
      {candidate.error && <p className="candidate-error">Statement unavailable: {candidate.error}</p>}
    </div>
    <button className="candidate-select" type="button" disabled={candidate.loading || Boolean(candidate.error)} onClick={() => onConfirm(candidate)}>{candidate.loading ? <LoaderCircle className="spin" size={15} /> : <>Confirm <ArrowRight size={15} /></>}</button>
  </article>
}

export function CandidateSection({ candidates, visible, visibleCount, query, onConfirm, onShowMore }: Props) {
  const exactQuery = isLeanNameQuery(query)
  const exact = exactQuery && candidates.some((candidate) => !candidate.loading && !candidate.error && candidate.name === query.trim())
  const checking = candidates.some((candidate) => candidate.loading)
  const failed = candidates.some((candidate) => candidate.error)

  return <section className="candidate-section" aria-labelledby="candidate-title">
    <div className="section-label"><span>02 / CONFIRM RESULT</span><span>Choose a statement</span></div>
    <h2 id="candidate-title" tabIndex={-1}>Is this your statement?</h2>
    <p className="section-intro">Confirm the statement you mean before choosing a question.</p>
    {exactQuery && !exact && <p className="search-advice" role="status">
      {checking ? <>Checking the matches for <code>{query.trim()}</code>…</> : failed ? <>Some matches could not be checked. <code>{query.trim()}</code> has not been confirmed; try a mathematical description.</> : <><code>{query.trim()}</code> did not appear among these {candidates.length} matches. Try describing the mathematics.</>}
    </p>}
    <div className="candidate-list">
      {visible.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} index={candidates.findIndex((item) => item.id === candidate.id) + 1} exactMatch={exactQuery && !candidate.loading && candidate.name === query.trim()} onConfirm={onConfirm} />)}
    </div>
    {visibleCount < candidates.length && <button type="button" className="candidate-more" onClick={onShowMore}>Show more results <ArrowDown size={15} /></button>}
  </section>
}
