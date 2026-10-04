export function SiteHeader() {
  return <header className="site-header">
    <a className="brand" href="/" aria-label="Ouliproof home"><span className="brand-mark">O<span>·</span></span><span>Ouliproof</span></a>
    <nav aria-label="Main navigation"><a href="/how-it-works" aria-current={window.location.pathname === '/how-it-works' ? 'page' : undefined}>How it works</a><a href="/dataset" aria-current={window.location.pathname === '/dataset' ? 'page' : undefined}>Proof collection</a></nav>
  </header>
}

export function SiteFooter() {
  return <footer><span>Ouliproof</span><span>Explore Mathlib dependencies with care.</span><span>Data: TheoremGraph / TheoremSearch</span></footer>
}
