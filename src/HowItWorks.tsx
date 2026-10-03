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
        <p>Ouliproof follows a theorem’s dependencies to find observable traces of a method in its proof chain.</p>
        <a className="guide-cta" href="/">Search for a result <ArrowRight size={16} /></a>
      </div>
      <div className="guide-sections">
        <section>
          <span className="guide-index">01 / READ A FINDING</span>
          <div><h2>What counts as evidence?</h2><p>Each path follows references returned by TheoremGraph, including through other lemmas. A <code>proof</code> edge points into a proof term; a <code>def</code> edge points into a definition body.</p><div className="guide-chain"><span>Selected theorem</span><span>→</span><span>Referenced lemma</span><span>→</span><span>Method signal</span></div><p>An exact reference to <code>Nat.recAux</code> is a <strong>graph witness</strong> for structural induction, but does not show that the author wrote the <code>induction</code> tactic. Recorded tactics from MathlibGraph are <strong>possible signals</strong>: their proof revision has not been matched to TheoremGraph’s. Names such as <code>False.elim</code> or <code>rcases</code> alone are weaker, related signals.</p></div>
        </section>
        <section>
          <span className="guide-index">02 / KNOW THE LIMIT</span>
          <div><h2>What can a result tell us?</h2><p>Analysis stops at the first usable graph witness for each question; the graph remains available for further exploration. A finding is an observation, not a reconstruction of the Lean proof.</p><p><strong>No marker observed</strong> means none appeared in the checked dependencies. It does not prove the method is absent. API errors and traversal limits can leave dependencies unchecked.</p></div>
        </section>
      </div>
      <div className="guide-source"><p>Sources: live TheoremGraph dependencies and a compact tactic index derived from MathlibGraph.</p><a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">TheoremGraph API <ExternalLink size={14} /></a><a href={MARKER_SOURCE_URL} target="_blank" rel="noreferrer">MathlibGraph dataset <ExternalLink size={14} /></a></div>
    </main>
    <SiteFooter />
  </div>
}
