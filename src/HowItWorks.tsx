import { useEffect } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { MARKER_SOURCE_URL } from './methods'
import { SiteFooter, SiteHeader } from './SiteChrome'
import './design.css'
import './styles.css'

export default function HowItWorks() {
  useEffect(() => { document.title = 'How it works — Leanage' }, [])
  return <div className="app-shell">
    <SiteHeader />
    <main className="guide-page">
      <div className="guide-intro">
        <h1>How it works</h1>
        <p>Describe a result in plain mathematics. We find it in Mathlib, follow its Lean proof, and report what it relies on.</p>
        <a className="guide-cta" href="/">Search for a result <ArrowRight size={16} /></a>
      </div>
      <div className="guide-sections">
        <section>
          <div><h2>Your words, then Lean, then back</h2></div>
          <div>
            <div className="guide-chain"><span>Your statement</span><span>→</span><span>Mathlib match</span><span>→</span><span>Dependencies</span><span>→</span><span>Plain reading</span></div>
            <p><strong>Match.</strong> You write a statement, or a Lean name. We show close Mathlib results and you confirm the right one.</p>
            <p><strong>Follow.</strong> We read the proof’s dependencies live and look for the methods or results you ask about.</p>
            <p><strong>Read.</strong> Steps appear as informal statements, with the Lean name beside them.</p>
            <p><strong>Limits.</strong> Everything comes from Mathlib: if your result isn’t formalized there, we can’t analyse it. “No marker observed” never proves a method is absent.</p>
          </div>
        </section>
      </div>
      <div className="guide-source"><p>Sources: live <a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">TheoremGraph dependencies <ExternalLink size={14} /></a> and a compact tactic index derived from <a href={MARKER_SOURCE_URL} target="_blank" rel="noreferrer">MathlibGraph <ExternalLink size={14} /></a>.</p></div>
    </main>
    <SiteFooter />
  </div>
}
