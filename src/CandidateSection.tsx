import { ArrowDown, ArrowRight, LoaderCircle } from 'lucide-react'
import type { Candidate } from './domain'
import { isLeanNameQuery } from './searchCandidates'

interface Props {
  candidates: Candidate[]
  visible: Candidate[]
  visibleCount: number
  query: string
  onConfirm: (candidate: Candidate) => void
  onShowMore: () => void
}

export function CandidateSection({ candidates, visible, visibleCount, query, onConfirm, onShowMore }: Props) {
  const exactQuery = isLeanNameQuery(query)
  const exact = exactQuery && candidates.some((candidate) => !candidate.loading && !candidate.error && candidate.name === query.trim())
  const checking = candidates.some((candidate) => candidate.loading)
  const failed = candidates.some((candidate) => candidate.error)

  return <section className="candidate-section" aria-labelledby="candidate-title">
    <div className="section-label"><span>02 / CONFIRM RESULT</span><span>Choose a declaration</span></div>
    <h2 id="candidate-title" tabIndex={-1}>Which declaration did you mean?</h2>
    <p className="section-intro">Results are ranked by similarity. Confirm the Lean declaration before choosing a question.</p>
    {exactQuery && !exact && <p className="search-advice" role="status">
      {checking ? <>Checking the returned declarations for <code>{query.trim()}</code>…</> : failed ? <>Some declarations could not be checked. <code>{query.trim()}</code> has not been confirmed; try a mathematical description.</> : <><code>{query.trim()}</code> did not appear among these {candidates.length} semantic matches. Try a mathematical description.</>}
    </p>}
    <div className="candidate-list">
      {visible.map((candidate) => <article className="candidate" key={candidate.id}>
        <div className="candidate-index">{String(candidates.findIndex((item) => item.id === candidate.id) + 1).padStart(2, '0')}</div>
        <div className="candidate-body">
          <div className="candidate-top"><h3>{candidate.loading ? 'Loading name…' : candidate.name}</h3><span>{candidate.sourceLabel}</span></div>
          {exactQuery && !candidate.loading && candidate.name === query.trim() && <span className="candidate-exact">Exact Lean name</span>}
          {candidate.body && <p className="formal-body">{candidate.body}</p>}
          {candidate.slogan && <p>{candidate.slogan}</p>}
          {candidate.error && <p className="candidate-error">Name unavailable: {candidate.error}</p>}
          <small>{candidate.id}</small>
        </div>
        <button className="candidate-select" type="button" disabled={candidate.loading || Boolean(candidate.error)} onClick={() => onConfirm(candidate)}>{candidate.loading ? <LoaderCircle className="spin" size={15} /> : <>Select <ArrowRight size={15} /></>}</button>
      </article>)}
    </div>
    {visibleCount < candidates.length && <button type="button" className="candidate-more" onClick={onShowMore}>Show more results <ArrowDown size={15} /></button>}
  </section>
}
