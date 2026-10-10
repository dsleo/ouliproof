export function SiteHeader() {
  return <header className="site-header">
    <a className="brand" href="/" aria-label="Leanage home"><svg className="brand-mark" viewBox="0 0 32 34" fill="none" aria-hidden="true">
      <path className="lineage-branch" d="M5 17h10m0 0 10-10M15 17l10 10" />
      <path className="lineage-route" d="M5 17h10l10-10" />
      <circle className="lineage-root" cx="5" cy="17" r="2.4" />
      <circle className="lineage-junction" cx="15" cy="17" r="2.4" />
      <circle className="lineage-leaf-selected" cx="25" cy="7" r="2.7" />
      <circle className="lineage-leaf" cx="25" cy="27" r="2.4" />
    </svg><span>Leanage</span></a>
    <nav aria-label="Main navigation"><a href="/how-it-works" aria-current={window.location.pathname === '/how-it-works' ? 'page' : undefined}>How it works</a></nav>
  </header>
}

export function SiteFooter() {
  return <footer><span>Leanage</span></footer>
}
