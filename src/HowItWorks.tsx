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
        <p>Follow a theorem’s dependencies to find observable traces of a method in its proof chain.</p>
        <a className="guide-cta" href="/">Search for a result <ArrowRight size={16} /></a>
      </div>
      <div className="guide-sections">
        <section>
          <span className="guide-index">01 / READ A FINDING</span>
          <div><h2>What counts as evidence?</h2><p>We inspect the selected theorem and, when needed, the lemmas it relies on. A <code>proof</code> edge points into a proof term; a <code>def</code> edge points into a definition body.</p><div className="guide-chain"><span>Selected theorem</span><span>→</span><span>Referenced lemma</span><span>→</span><span>Method signal</span></div><p>MathlibGraph’s tactic labels are useful hints, but they may describe a slightly different version of a proof from the one used here. Some names, such as <code>False.elim</code> and <code>rcases</code>, can appear in many proof approaches, so they are not enough on their own to identify a method.</p></div>
        </section>
        <section>
          <span className="guide-index">02 / KNOW THE LIMIT</span>
          <div><h2>What can a result tell us?</h2><p>Analysis stops at the first usable graph witness for each question; the graph remains available for further exploration. A finding is an observation, not a reconstruction of the Lean proof.</p><p><strong>No marker observed</strong> means none appeared in the checked dependencies. It does not prove the method is absent. API errors and traversal limits can leave dependencies unchecked. For a definition with no proof edges, you can choose to explore its definition-body dependencies.</p></div>
        </section>
      </div>
      <div className="guide-source"><p>Sources: live <a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">TheoremGraph dependencies <ExternalLink size={14} /></a> and a compact tactic index derived from <a href={MARKER_SOURCE_URL} target="_blank" rel="noreferrer">MathlibGraph <ExternalLink size={14} /></a>.</p></div>
    </main>
    <SiteFooter />
  </div>
}
