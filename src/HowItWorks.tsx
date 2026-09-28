import { useEffect } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
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
        <p>Ouliproof follows the dependencies that TheoremGraph exposes for Mathlib declarations. It shows the path behind a finding and makes the limits of the evidence visible.</p>
        <a className="guide-cta" href="/">Search for a result <ArrowRight size={16} /></a>
      </div>
      <div className="guide-sections">
        <section>
          <span className="guide-index">01 / FIND A DECLARATION</span>
          <div><h2>Start with a result of interest</h2><p>Enter a Lean name or describe a mathematical result. TheoremGraph returns semantically similar candidates, which may differ from an exact name match. Check the Lean declaration and confirm the one you mean before exploring it.</p></div>
        </section>
        <section>
          <span className="guide-index">02 / ASK A SPECIFIC QUESTION</span>
          <div><h2>Look for a named dependency</h2><p>Ask whether the dependency chain reaches a declaration such as <code>Nat.zero_add</code>. You can follow proof references alone or include definition bodies. A found declaration appears with a navigable path from your chosen result.</p><div className="guide-chain"><span>Selected theorem</span><span>→</span><span>Referenced lemma</span><span>→</span><span>Target declaration</span></div></div>
        </section>
        <section>
          <span className="guide-index">03 / READ THE EDGES</span>
          <div><h2>What a dependency means</h2><p>A <code>proof</code> edge says that a proof term references another declaration. A <code>def</code> edge comes from a definition body. The graph shows references between declarations; it does not reconstruct the Lean proof script or establish which tactic the author used.</p></div>
        </section>
        <section>
          <span className="guide-index">04 / INTERPRET THE RESULT</span>
          <div><h2>How to read a finding</h2><p>When Ouliproof finds every requested target, it stops and displays the observed path. You can continue exploring the graph. If the traversal exhausts the available neighborhoods without a match, the result means only that no witness appeared in the API responses for that consultation. A time limit, request limit, or API error leaves the question open.</p><p>Questions about induction, case analysis, or proof by contradiction cannot be answered reliably from dependency edges alone. Ouliproof marks them as undetermined rather than inferring a tactic from a referenced constant.</p></div>
        </section>
      </div>
      <div className="guide-source"><p>The graph is supplied by TheoremGraph. Its responses are not an immutable Mathlib snapshot or a Lean proof certificate.</p><a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">Read the API documentation <ExternalLink size={14} /></a></div>
    </main>
    <SiteFooter />
  </div>
}
