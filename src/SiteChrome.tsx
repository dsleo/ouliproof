import { ExternalLink } from 'lucide-react'

export function SiteHeader() {
  return <header className="site-header">
    <a className="brand" href="/" aria-label="Ouliproof home"><span className="brand-mark">O<span>·</span></span><span>Ouliproof</span></a>
    <nav aria-label="Main navigation"><a href="/how-it-works">How it works</a><a href="https://www.theoremsearch.com/docs" target="_blank" rel="noreferrer">TheoremGraph API <ExternalLink size={12} /></a></nav>
  </header>
}

export function SiteFooter() {
  return <footer><span>Ouliproof</span><span>Explore Mathlib dependencies with care.</span><span>Data: TheoremGraph / TheoremSearch</span></footer>
}
