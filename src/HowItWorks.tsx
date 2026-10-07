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
        <h1>How it works</h1>
        <p>You describe a result in plain mathematics. We find its formal counterpart in Mathlib, follow its proof, and report what it relies on, in plain mathematics again.</p>
        <a className="guide-cta" href="/">Search for a result <ArrowRight size={16} /></a>
      </div>
      <div className="guide-sections">
        <section>
          <div><span className="guide-index">THE JOURNEY</span><h2>From your words to Lean and back</h2></div>
          <div>
            <div className="guide-chain"><span>Your statement</span><span>→</span><span>Mathlib match</span><span>→</span><span>Proof dependencies</span><span>→</span><span>Plain-language reading</span></div>
            <p>Everything is built on <strong>Mathlib</strong>, the library of formalized mathematics written in the Lean proof assistant. The proof we look at is the Lean proof, so a result has to exist there to be analysed.</p>
          </div>
        </section>
        <section>
          <div><span className="guide-index">01 · SAY IT</span><h2>State a result your way</h2></div>
          <div>
            <p>Write the statement informally, for example “a prime dividing a product divides one of the factors”, or enter a Lean name such as <code>Nat.prime_mul_iff</code>. Both work everywhere in the app, including when you name a result the proof should depend on.</p>
          </div>
        </section>
        <section>
          <div><span className="guide-index">02 · MATCH IT</span><h2>We look for it in Mathlib</h2></div>
          <div>
            <p>We search Mathlib for formal statements close to yours and show each one as an informal statement with its Lean name beneath. <strong>You confirm</strong> which one you mean. We never choose for you, because a close statement is not always the same statement: it may be stated for natural numbers only, or with extra hypotheses.</p>
            <p><strong>If it is not in Mathlib, we cannot do anything.</strong> A result that has not been formalized, or is not in the version we search, has no proof to follow. You will see no good match. Try rephrasing, or a more standard form of the statement, since the result may exist under a different formulation. A close match is not evidence that your exact statement is formalized.</p>
          </div>
        </section>
        <section>
          <div><span className="guide-index">03 · FOLLOW IT</span><h2>We follow its proof</h2></div>
          <div>
            <p>We read the proof’s dependencies live, layer by layer: the lemmas it uses, then the lemmas those use. Ask about a method (axiom of choice, induction, case analysis, contradiction) or about a particular result. A result named in words goes through the same matching and confirmation step first.</p>
            <p><strong>Graph witnesses</strong> are exact references found in the dependency chain. <strong>Possible method signals</strong> come from recorded tactics and stay leads until they are tied to the same version of the proof. Each exploration is limited to 180 declarations or 100 seconds, and stops early once every question has a witness.</p>
          </div>
        </section>
        <section>
          <div><span className="guide-index">04 · READ IT</span><h2>We read it back in plain terms</h2></div>
          <div>
            <p>Each step is shown as an informal statement when one is available, with the Lean name beside it. A few well-known principles, such as the induction principle on ℕ, are named by hand. Steps without an informal statement appear under their Lean name.</p>
            <p>A path shows that a reference exists. It does not reconstruct the Lean proof script, and it is not the proof as you would write it on paper.</p>
          </div>
        </section>
        <section>
          <div><span className="guide-index">LIMITS</span><h2>What it cannot tell you</h2></div>
          <div>
            <p><strong>No marker observed</strong> means none appeared in the dependencies we checked. It does not prove the method is absent: detectors and source data are incomplete, and API errors or limits can leave dependencies unchecked.</p>
            <p>The Lean proof may use a different method from the proof in the literature, so what we report is about the formalization.</p>
          </div>
        </section>
      </div>
      <div className="guide-source"><p>Sources: live <a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">TheoremGraph dependencies <ExternalLink size={14} /></a> and a compact tactic index derived from <a href={MARKER_SOURCE_URL} target="_blank" rel="noreferrer">MathlibGraph <ExternalLink size={14} /></a>.</p></div>
    </main>
    <SiteFooter />
  </div>
}
