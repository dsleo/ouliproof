export function SiteHeader() {
  return <header className="site-header">
    <a className="brand" href="/" aria-label="Leanage home"><span className="brand-mark">L<span>·</span></span><span>Leanage</span></a>
    <nav aria-label="Main navigation"><a href="/how-it-works" aria-current={window.location.pathname === '/how-it-works' ? 'page' : undefined}>How it works</a></nav>
  </header>
}

export function SiteFooter() {
  return <footer><span>Leanage</span><span>Mathlib dependency explorer · an Ouliproof project</span></footer>
}
