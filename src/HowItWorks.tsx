import { useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
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
        <p>Ouliproof follows Mathlib proof dependencies and looks for evidence of reasoning methods anywhere along the chain.</p>
        <a className="guide-cta" href="/">Search for a result <ArrowRight size={16} /></a>
      </div>
      <div className="guide-sections">
        <section>
          <span className="guide-index">01 / FIND A DECLARATION</span>
          <div><h2>Start with a result of interest</h2><p>Enter a Lean name or describe a mathematical result. TheoremGraph returns semantically similar candidates, which may differ from an exact name match. Check the Lean declaration and confirm the one you mean before exploring it.</p></div>
        </section>
        <section>
          <span className="guide-index">02 / ASK A SPECIFIC QUESTION</span>
          <div><h2>Choose what to detect</h2><p>Ask about induction, case analysis, proof by contradiction, or a named declaration such as <code>Nat.zero_add</code>. Every finding includes the observed signal and a navigable path from your selected result.</p><div className="guide-chain"><span>Selected theorem</span><span>→</span><span>Referenced lemma</span><span>→</span><span>Method signal</span></div></div>
        </section>
      </div>
      <div className="guide-source"><p>The principle behind the detector, the meaning of graph witnesses and tactic leads, and the limits of a no-match result are explained separately.</p><a href="/principle">Read the principle <ArrowRight size={14} /></a></div>
    </main>
    <SiteFooter />
  </div>
}
