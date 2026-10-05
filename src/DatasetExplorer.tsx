import { useEffect, useState } from 'react'
import { ChevronDown, ExternalLink, Search } from 'lucide-react'
import { MathText } from './MathText'
import { SiteHeader } from './SiteChrome'
import './design.css'
import './dataset.css'

type SourceStats = { kind: 'informal' | 'formal'; dataset: string; count: number }
type Stats = { sources: SourceStats[]; total: number }
type Item = { id: string; kind: 'informal' | 'formal'; dataset: string; title: string | null; statement: string; n_proofs: number }
type Listing = { items: Item[]; total: number; page: number; page_size: number }
type InformalProof = { proof_id: string; text: string; content_type: string; origin: string; source_url: string | null; technique?: string | null; method_cluster?: { id: string; name: string; defining_approach: string }; method_fingerprint?: { primary_approach: string | null; secondary_techniques: string[] } }
type InformalDetail = { id: string; dataset: string; statement: string; source_id: string; source_url: string | null; answer: string | null; proofs: InformalProof[]; source_metadata?: { method_clustering?: { status: string; cluster_count: number | null; judge: string | null } } }
type FormalProof = { code: string; main_theorem_proof_code: string | null; main_theorem_split_valid: boolean; validation_status: string }
type FormalDetail = { id: string; dataset: string; problem: string; formal_statement: string; source_id: string; human_proof: FormalProof; prover_proof: FormalProof }
type Detail = InformalDetail | FormalDetail

const names: Record<string, string> = {
  ProofRank: 'ProofRank',
  'proofwiki-math': 'ProofWiki',
  'Nemotron-Math-Proofs-v2': 'Nemotron',
  'NuminaMath-LEAN-Proof-Artifacts': 'NuminaMath Lean',
}
const sourcePages: Record<string, string> = {
  ProofRank: 'https://huggingface.co/datasets/INSAIT-Institute/ProofRank',
  'proofwiki-math': 'https://huggingface.co/datasets/avewright/proofwiki-math',
  'Nemotron-Math-Proofs-v2': 'https://huggingface.co/datasets/nvidia/Nemotron-Math-Proofs-v2',
  'NuminaMath-LEAN-Proof-Artifacts': 'https://huggingface.co/datasets/iiis-lean/NuminaMath-LEAN-Proof-Artifacts',
}
function sourceName(value: string) { return names[value] ?? value }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'The request failed.' }
function pageFromUrl() { return Math.max(1, Number(new URLSearchParams(window.location.search).get('page')) || 1) }
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Request failed (${response.status}).`)
  return response.json() as Promise<T>
}
function proofLabel(proof: InformalProof) {
  if (proof.method_cluster) return `${proof.method_cluster.id} · ${proof.method_cluster.name}`
  if (proof.content_type === 'proof_summary') return 'Human solution summary'
  if (proof.origin === 'synthetic') return 'Synthetic proof candidate'
  return 'Published proof text'
}
function ProofDisclosure({ id, number, label, openProof, setOpenProof, children }: {
  id: string; number: number; label: string; openProof: string | null;
  setOpenProof: (value: string | null) => void; children: React.ReactNode;
}) {
  const open = openProof === id
  return <section className="collection-proof">
    <button type="button" className="collection-proof-toggle" aria-expanded={open} onClick={() => setOpenProof(open ? null : id)}>
      <span className="collection-proof-number">{String(number).padStart(2, '0')}</span><span>{label}</span><ChevronDown size={17} aria-hidden="true" />
    </button>
    {open && <div className="collection-proof-body">{children}</div>}
  </section>
}
function FormalProofBody({ proof }: { proof: FormalProof }) {
  const code = proof.main_theorem_split_valid && proof.main_theorem_proof_code ? proof.main_theorem_proof_code : proof.code
  return <><p className="collection-proof-note">Source validation: {proof.validation_status}</p><pre><code>{code}</code></pre></>
}
function StatementProofs({ row, visibleCount, setVisibleCount, openProof, setOpenProof }: {
  row: Detail; visibleCount: number; setVisibleCount: (count: number) => void;
  openProof: string | null; setOpenProof: (value: string | null) => void;
}) {
  const informal = 'proofs' in row
  const count = informal ? row.proofs.length : 2
  return <div className="collection-expanded">
    {informal && row.answer && <p className="collection-answer"><span>Answer</span>{row.answer}</p>}
    <div className="collection-proofs-heading"><span>Associated proofs</span><span>{count} {count === 1 ? 'text' : 'texts'}</span></div>
    {informal && row.dataset === 'ProofRank' && <p className="collection-method-summary">{row.source_metadata?.method_clustering?.status === 'matched' ? `${row.source_metadata.method_clustering.cluster_count} method groups assigned by ${row.source_metadata.method_clustering.judge} from the human solution summaries.` : 'Method groups are unavailable for this problem; the solution summaries are still shown below.'}</p>}
    <div className="collection-proof-list">
      {informal ? row.proofs.slice(0, visibleCount).map((proof, index) => <ProofDisclosure key={proof.proof_id} id={proof.proof_id} number={index + 1} label={proofLabel(proof)} openProof={openProof} setOpenProof={setOpenProof}>
        {proof.method_cluster && <div className="collection-method-detail"><span>Method group {proof.method_cluster.id}</span><p>{proof.method_cluster.defining_approach}</p>{proof.method_fingerprint?.primary_approach && <p><strong>Approach:</strong> {proof.method_fingerprint.primary_approach}</p>}</div>}
        <div className="collection-proof-text"><MathText text={proof.text} /></div>
        {proof.source_url && <a className="collection-source-link" href={proof.source_url} target="_blank" rel="noreferrer">Original proof <ExternalLink size={13} /></a>}
      </ProofDisclosure>) : <>
        <ProofDisclosure id="human" number={1} label="Human Lean proof" openProof={openProof} setOpenProof={setOpenProof}><FormalProofBody proof={row.human_proof} /></ProofDisclosure>
        <ProofDisclosure id="prover" number={2} label="Prover Lean proof" openProof={openProof} setOpenProof={setOpenProof}><FormalProofBody proof={row.prover_proof} /></ProofDisclosure>
      </>}
    </div>
    {informal && count > 2 && <button className="collection-more-proofs" type="button" onClick={() => { setOpenProof(null); setVisibleCount(visibleCount < count ? Math.min(count, visibleCount + 2) : 2) }}>{visibleCount < count ? `Show ${Math.min(2, count - visibleCount)} more ${count - visibleCount === 1 ? 'solution' : 'solutions'} · ${count - visibleCount} remaining` : 'Show fewer solutions'}</button>}
    <div className="collection-provenance"><span>Source ID: <code>{row.source_id}</code></span><a href={informal && row.dataset === 'ProofRank' && row.source_metadata?.method_clustering?.status === 'matched' ? 'https://huggingface.co/datasets/Anon539823983/ProofRank-outputs' : informal ? row.source_url || sourcePages[row.dataset] : sourcePages[row.dataset]} target="_blank" rel="noreferrer">{informal && row.dataset === 'ProofRank' && row.source_metadata?.method_clustering?.status === 'matched' ? 'Method clustering source' : 'Source dataset'} <ExternalLink size={12} /></a></div>
  </div>
}

export default function DatasetExplorer() {
  const initialId = new URLSearchParams(window.location.search).get('id')
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsError, setStatsError] = useState('')
  const [positionError, setPositionError] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [dataset, setDataset] = useState('all')
  const [page, setPage] = useState(pageFromUrl)
  const [deepLinkId, setDeepLinkId] = useState(initialId)
  const [findingPosition, setFindingPosition] = useState(Boolean(initialId))
  const [listing, setListing] = useState<Listing | null>(null)
  const [listError, setListError] = useState('')
  const [statementOpen, setStatementOpen] = useState(false)
  const [proofsOpen, setProofsOpen] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [openProof, setOpenProof] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(2)

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query), 220); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => {
    if (!statsError && !listError && !positionError) return
    const timer = window.setTimeout(() => setRetryTick((value) => value + 1), 3000)
    return () => window.clearTimeout(timer)
  }, [statsError, listError, positionError, retryTick])
  useEffect(() => {
    const controller = new AbortController()
    getJson<Stats>('/seed-api/stats', controller.signal).then((value) => { setStats(value); setStatsError('') }).catch((error) => { if (!controller.signal.aborted) setStatsError(errorText(error)) })
    return () => controller.abort()
  }, [retryTick])
  useEffect(() => {
    if (!deepLinkId) { setFindingPosition(false); return }
    const controller = new AbortController()
    setFindingPosition(true)
    getJson<{ page: number }>(`/seed-api/position?id=${encodeURIComponent(deepLinkId)}`, controller.signal)
      .then(({ page: position }) => { setPage(position); setPositionError(''); setFindingPosition(false) })
      .catch((error) => { if (!controller.signal.aborted) { setPositionError(errorText(error)); setFindingPosition(false) } })
    return () => controller.abort()
  }, [deepLinkId, retryTick])
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ q: debouncedQuery, kind: 'all', dataset, page: String(page) })
    setListing(null); setListError('')
    getJson<Listing>(`/seed-api/items?${params}`, controller.signal).then((value) => { setListing(value); setListError('') }).catch((error) => { if (!controller.signal.aborted) setListError(errorText(error)) })
    return () => controller.abort()
  }, [debouncedQuery, dataset, page, retryTick])
  const item = findingPosition || positionError || listing?.page !== page ? null : listing?.items[0] ?? null
  useEffect(() => {
    if (!item || !statementOpen || (item.kind !== 'formal' && !proofsOpen)) { setDetail(null); return }
    const controller = new AbortController()
    setDetail(null); setDetailError('')
    getJson<Detail>(`/seed-api/item?id=${encodeURIComponent(item.id)}`, controller.signal).then(setDetail).catch((error) => { if (!controller.signal.aborted) setDetailError(errorText(error)) })
    return () => controller.abort()
  }, [item?.id, item?.kind, statementOpen, proofsOpen])
  useEffect(() => {
    const pop = () => {
      const params = new URLSearchParams(window.location.search)
      const id = params.get('id')
      setPositionError(''); setFindingPosition(Boolean(id)); setDeepLinkId(id); setPage(pageFromUrl())
      setStatementOpen(false); setProofsOpen(false); setOpenProof(null); setVisibleCount(2)
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
  function resetOpen() { setStatementOpen(false); setProofsOpen(false); setOpenProof(null); setVisibleCount(2) }
  function navigate(nextPage: number) {
    resetOpen(); setPositionError(''); setFindingPosition(false); setDeepLinkId(null); setPage(nextPage)
    const url = new URL(window.location.href)
    url.searchParams.delete('id'); url.searchParams.set('page', String(nextPage))
    window.history.pushState(null, '', url)
  }
  function resetSearchAndSource() {
    resetOpen(); setPositionError(''); setFindingPosition(false); setDeepLinkId(null); setPage(1)
    const url = new URL(window.location.href)
    url.searchParams.delete('id'); url.searchParams.delete('page')
    window.history.replaceState(null, '', url)
  }
  const totalPages = listing ? Math.max(1, Math.ceil(listing.total / listing.page_size)) : 1
  const showingDetail = detail?.id === item?.id ? detail : null

  return <div className="dataset-page"><SiteHeader /><main className="collection-main">
    <header className="collection-intro"><p className="collection-eyebrow">Oulipoof / seed collection</p><h1>Proof collection</h1><p className="collection-intro-copy">How can the same statement be proved in different ways? This collection is for studying proof diversity and the techniques used across human and AI solutions, in both informal explanations and formal Lean code.</p><p className="collection-intro-copy collection-intro-sources">It is built from the Hugging Face datasets <a href={sourcePages.ProofRank} target="_blank" rel="noreferrer">ProofRank</a>, <a href={sourcePages['proofwiki-math']} target="_blank" rel="noreferrer">ProofWiki Math</a>, <a href={sourcePages['Nemotron-Math-Proofs-v2']} target="_blank" rel="noreferrer">Nemotron Math Proofs v2</a>, and <a href={sourcePages['NuminaMath-LEAN-Proof-Artifacts']} target="_blank" rel="noreferrer">NuminaMath Lean Proof Artifacts</a>.</p></header>
    {(statsError || listError || positionError) && <div className="collection-offline" role="alert"><strong>Collection unavailable.</strong> Reconnecting… <small>{statsError || listError || positionError}</small></div>}
    <section className="collection-controls" aria-label="Collection filters">
      <label className="collection-search"><Search size={17} /><span className="sr-only">Search statements</span><input value={query} onChange={(event) => { resetSearchAndSource(); setQuery(event.target.value) }} placeholder="Search statements, Lean names, or IDs" /></label>
      <label className="collection-source-filter"><span>Source</span><select value={dataset} onChange={(event) => { resetSearchAndSource(); setDataset(event.target.value) }}><option value="all">All sources</option>{stats?.sources.map((source) => <option key={source.dataset} value={source.dataset}>{sourceName(source.dataset)} · {source.count.toLocaleString()}</option>)}</select></label>
    </section>
    <nav className="collection-pagination collection-pagination-top" aria-label="Browse statements"><button type="button" aria-label="Previous statement" disabled={page <= 1 || !listing || findingPosition} onClick={() => navigate(page - 1)}>←</button><span>{listing?.total ? `${page.toLocaleString()} / ${listing.total.toLocaleString()}` : '—'}</span><button type="button" aria-label="Next statement" disabled={page >= totalPages || !listing || findingPosition} onClick={() => navigate(page + 1)}>→</button></nav>
    <section className="collection-list" aria-label="Statement" aria-live="polite">
      {item && <article className="collection-item">
        <div className="collection-item-meta"><span>{sourceName(item.dataset)} · {item.kind === 'formal' ? 'Lean' : 'Informal'}</span><span>{item.n_proofs} {item.n_proofs === 1 ? 'text' : 'texts'}</span></div>
        {item.title && <p className="collection-item-title">{item.title}</p>}
        <button type="button" className={`collection-statement ${statementOpen ? '' : 'truncated'}`} aria-expanded={statementOpen} onClick={() => { setStatementOpen(!statementOpen); setProofsOpen(false); setOpenProof(null); setVisibleCount(2) }}><MathText text={item.statement} /></button>
        <p className="collection-statement-hint">{statementOpen ? 'Click statement to collapse' : 'Click statement to read in full'}</p>
        {statementOpen && item.kind === 'formal' && (showingDetail && !('proofs' in showingDetail) ? <div className="collection-formal-statement"><h2>Formalized statement</h2><pre><code>{showingDetail.formal_statement}</code></pre></div> : <div className="collection-loading" role="status">{detailError || 'Loading formalized statement…'}</div>)}
        {statementOpen && <button type="button" className="collection-show-proofs" aria-expanded={proofsOpen} onClick={() => { setProofsOpen(!proofsOpen); setOpenProof(null) }}>{proofsOpen ? 'Hide proofs' : `Show ${item.n_proofs} ${item.n_proofs === 1 ? 'proof' : 'proofs'}`}<ChevronDown className={proofsOpen ? 'up' : ''} size={16} /></button>}
        {statementOpen && proofsOpen && (showingDetail ? <StatementProofs row={showingDetail} visibleCount={visibleCount} setVisibleCount={setVisibleCount} openProof={openProof} setOpenProof={setOpenProof} /> : <div className="collection-loading" role="status">{detailError || 'Loading proofs…'}</div>)}
      </article>}
      {listing && !item && !findingPosition && <div className="collection-empty">No statements found. Try a shorter term or another source.</div>}
    </section>
    {statementOpen && <nav className="collection-pagination" aria-label="Browse statements after reading"><button type="button" aria-label="Previous statement" disabled={page <= 1 || !listing || findingPosition} onClick={() => navigate(page - 1)}>←</button><span>{listing?.total ? `${page.toLocaleString()} / ${listing.total.toLocaleString()}` : '—'}</span><button type="button" aria-label="Next statement" disabled={page >= totalPages || !listing || findingPosition} onClick={() => navigate(page + 1)}>→</button></nav>}
    <p className="collection-note">Informal texts are source records, not validated proofs. Aligned ProofRank records carry source model-assigned method groups; equivalent statements are not matched across datasets.</p>
  </main></div>
}
