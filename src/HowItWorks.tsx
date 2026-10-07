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
        <p>Follow a theorem’s dependencies to find observable traces of a method in its proof chain.</p>
        <a className="guide-cta" href="/">Search for a result <ArrowRight size={16} /></a>
      </div>
      <div className="guide-sections">
        <section>
          <div><p>We inspect the selected theorem and the lemmas it relies on.</p><div className="guide-chain"><span>Selected theorem</span><span>→</span><span>Referenced lemma</span><span>→</span><span>Method signal</span></div><p><strong>Built-in proof strategies</strong> are curated categories, such as induction or contradiction. Ouliproof labels a strategy only when its predefined evidence rule is met.</p><p><strong>User-entered signals</strong> let you search for a tactic, theorem, constant, or other marker. The result shows where it appears in the dependency chain, without classifying the overall proof strategy.</p><p><strong>No marker observed</strong> means none appeared in the dependencies checked by the app; it does not prove that the method is absent. API errors and traversal limits can leave some dependencies unchecked.</p></div>
        </section>
      </div>
      <div className="guide-source"><p>Sources: live <a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">TheoremGraph dependencies <ExternalLink size={14} /></a> and a compact tactic index derived from <a href={MARKER_SOURCE_URL} target="_blank" rel="noreferrer">MathlibGraph <ExternalLink size={14} /></a>.</p></div>
    </main>
    <SiteFooter />
  </div>
}
