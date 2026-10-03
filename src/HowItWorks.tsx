import { useEffect } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { MARKER_SOURCE_URL } from './methods'
import { SiteFooter, SiteHeader } from './SiteChrome'
import './design.css'
import './styles.css'

export default function HowItWorks() {
  useEffect(() => { document.title = 'How it works — Ouliproof' }, [])
  return <div className="app-shell">
    <SiteHeader />
    <main className="guide-page">
      <div className="guide-intro">
        <p className="intro-kicker"><span className="line" /> A GUIDE TO THE GRAPH</p>
        <h1>How it works</h1>
        <p>Choose a mathematical result and a method of interest. Ouliproof follows the result’s dependencies to find where that method leaves an observable trace.</p>
        <a className="guide-cta" href="/">Search for a result <ArrowRight size={16} /></a>
      </div>
      <div className="guide-sections">
        <section>
          <span className="guide-index">01 / FIND A DECLARATION</span>
          <div><h2>Start with a result of interest</h2><p>Enter a Lean name or describe a mathematical result. TheoremGraph returns semantically similar candidates, which may differ from an exact name match. Check the Lean declaration and confirm the one you mean before exploring it.</p></div>
        </section>
        <section>
          <span className="guide-index">02 / ASK A SPECIFIC QUESTION</span>
          <div><h2>Choose what to detect</h2><p>Ask about induction, case analysis, proof by contradiction, or a named declaration such as <code>Nat.zero_add</code>. Ouliproof explores references layer by layer, including those in lemmas used by your selected result. Each step in a displayed path is a dependency returned by TheoremGraph.</p><div className="guide-chain"><span>Selected theorem</span><span>→</span><span>Referenced lemma</span><span>→</span><span>Method signal</span></div><p>The question determines which edges are followed. A <code>proof</code> edge is a reference in a proof term; a <code>def</code> edge is a reference in a definition body.</p></div>
        </section>
        <section>
          <span className="guide-index">03 / READ THE FINDING</span>
          <div><h2>What counts as evidence?</h2><p>A <strong>graph witness</strong> is an exact named reference on a dependency path. For example, a path to <code>Nat.recAux</code> supports a structural induction finding. It does not show that the author wrote the <code>induction</code> tactic.</p><p>A <strong>possible method signal</strong> comes from MathlibGraph’s recorded tactics for a reached declaration name. Its Mathlib revision has not been proven identical to the TheoremGraph proof revision, so it remains a lead rather than a verified path to that tactic.</p><p>Related signals are weaker still: <code>False.elim</code> alone does not establish proof by contradiction, and <code>rcases</code> does not by itself establish a particular case split.</p></div>
        </section>
        <section>
          <span className="guide-index">04 / UNDERSTAND THE LIMIT</span>
          <div><h2>What a result can—and cannot—say</h2><p>Ouliproof stops after the first usable graph witness for each selected question. You can continue exploring from the graph. A finding reports what was observed in the sources, not a reconstruction of the Lean proof script or a proof certificate.</p><p><strong>No marker observed</strong> means the checked declarations did not produce a matching signal under the current detector and edge policy. It does not prove that the method is absent. An API error or traversal limit leaves some dependencies unchecked.</p></div>
        </section>
      </div>
      <div className="guide-source"><p>Graph references come from TheoremGraph. The compact tactic index is derived from MathNetwork/MathlibGraph’s pinned Mathlib snapshot. Their exact proof revisions cannot currently be joined from the available metadata.</p><a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">TheoremGraph API <ExternalLink size={14} /></a><a href={MARKER_SOURCE_URL} target="_blank" rel="noreferrer">MathlibGraph dataset <ExternalLink size={14} /></a></div>
    </main>
    <SiteFooter />
  </div>
}
