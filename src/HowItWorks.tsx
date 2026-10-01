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
        <section>
          <span className="guide-index">03 / READ THE EDGES</span>
          <div><h2>Two kinds of evidence</h2><p>A TheoremGraph <code>proof</code> edge says that a proof term references another declaration; a <code>def</code> edge comes from a definition body. Exact references such as <code>Or.elim</code> and <code>Decidable.byContradiction</code> can be shown directly on these paths.</p><p>A compact index derived from MathlibGraph records tactics for declarations in a pinned Mathlib snapshot. It can reveal an <code>induction</code>, <code>cases</code>, or <code>by_contra</code> tactic in a reached proof. Until the two sources' exact proof versions are matched, such a record is labelled a possible lead.</p></div>
        </section>
        <section>
          <span className="guide-index">04 / INTERPRET THE RESULT</span>
          <div><h2>How to read a finding</h2><p>A graph witness reports an exact named reference. A possible method signal reports a recorded tactic for a reached declaration name, with its separate source revision visible. <code>False.elim</code> is labelled ex falso; it does not alone establish proof by contradiction. <code>rcases</code> is labelled destructuring rather than a definite branch.</p><p>The search stops after its first usable signals for all selected questions. You can continue exploring. If no marker appears, the answer describes only the declarations scanned and the detector coverage; it does not prove a method absent. A time limit or API error leaves the scan incomplete.</p></div>
        </section>
      </div>
      <div className="guide-source"><p>Graph data: TheoremGraph. Recorded tactics: MathNetwork/MathlibGraph, Apache 2.0, Mathlib commit 534cf0b8f526. The exact Mathlib commit behind each TheoremGraph snapshot is not published in its API metadata, so tactic records are possible leads across sources. Findings are observations, not Lean proof certificates.</p><a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">TheoremGraph API <ExternalLink size={14} /></a><a href="https://huggingface.co/datasets/MathNetwork/MathlibGraph" target="_blank" rel="noreferrer">MathlibGraph dataset <ExternalLink size={14} /></a></div>
    </main>
    <SiteFooter />
  </div>
}
