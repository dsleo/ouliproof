import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, Focus, Maximize2, Minus, Play, Plus, Search, X } from 'lucide-react'
import type { Declaration, Edge, PathStep, Policy, TraversalState } from './domain'
import { pathTo } from './explorer'
import { POLICY_LABEL } from './domain'
import { safeSourceUrl } from './api'
import './graph.css'

type Positioned = { id: string; declaration: Declaration; x: number; y: number; depth: number }
type EvidencePath = { policy: Policy; path: PathStep[] }
const NODE_WIDTH = 225
const NODE_HEIGHT = 32
const COLUMN_GAP = 92
const ROW_GAP = 22
const MARGIN = 54

function layout(state: TraversalState) {
  const depths = new Map<string, number>()
  const byDepth = new Map<number, string[]>()
  const root = [...state.parents.entries()].find(([, parent]) => parent === null)?.[0]
  if (root) depths.set(root, 0)
  const unresolved = [...state.discovered].filter((id) => id !== root)
  for (let iteration = 0; unresolved.length && iteration < state.discovered.size; iteration++) {
    let changed = false
    for (let index = unresolved.length - 1; index >= 0; index--) {
      const parent = state.parents.get(unresolved[index])
      if (parent && depths.has(parent.from)) {
        depths.set(unresolved[index], depths.get(parent.from)! + 1)
        unresolved.splice(index, 1)
        changed = true
      }
    }
    if (!changed) break
  }
  for (const id of unresolved) depths.set(id, 0)
  for (const [id, depth] of depths) {
    const group = byDepth.get(depth) ?? []
    group.push(id)
    byDepth.set(depth, group)
  }
  for (const group of byDepth.values()) group.sort((a, b) => (state.names.get(a)?.name ?? a).localeCompare(state.names.get(b)?.name ?? b))
  const maxRows = Math.max(1, ...[...byDepth.values()].map((group) => group.length))
  const maxDepth = Math.max(0, ...byDepth.keys())
  const height = Math.max(450, maxRows * (NODE_HEIGHT + ROW_GAP) + MARGIN * 2)
  const width = Math.max(660, (maxDepth + 1) * (NODE_WIDTH + COLUMN_GAP) + MARGIN * 2)
  const positions = new Map<string, Positioned>()
  for (const [depth, group] of byDepth) {
    const groupHeight = group.length * (NODE_HEIGHT + ROW_GAP) - ROW_GAP
    group.forEach((id, index) => positions.set(id, {
      id,
      declaration: state.names.get(id) ?? { id, name: id },
      depth,
      x: MARGIN + depth * (NODE_WIDTH + COLUMN_GAP),
      y: Math.max(MARGIN, (height - groupHeight) / 2) + index * (NODE_HEIGHT + ROW_GAP),
    }))
  }
  return { positions, width, height, root }
}

function layoutWitness(path: PathStep[], state: TraversalState, vertical: boolean) {
  const positions = new Map<string, Positioned>()
  path.forEach((step, depth) => positions.set(step.id, {
    id: step.id,
    declaration: state.names.get(step.id) ?? { id: step.id, name: step.name },
    depth,
    x: vertical ? (660 - NODE_WIDTH) / 2 : MARGIN + depth * (NODE_WIDTH + COLUMN_GAP),
    y: vertical ? 43 + depth * 72 : 112,
  }))
  return { positions, width: vertical ? 660 : Math.max(660, path.length * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP + MARGIN * 2), height: vertical ? Math.max(320, path.length * 72 + 28) : 260 }
}

function shortName(value: string) {
  return value.length > 32 ? `…${value.slice(-31)}` : value
}

function GraphView({ state, root, expanded, onExpand, focusRequest, evidencePaths }: { state: TraversalState; root: Declaration; expanded: boolean; onExpand: () => void; focusRequest?: { id: string; serial: number }; evidencePaths: PathStep[][] }) {
  const [selectedId, setSelectedId] = useState(root.id)
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState(1)
  const [showList, setShowList] = useState(false)
  const [showFullGraph, setShowFullGraph] = useState(true)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 600px)').matches)
  const viewport = useRef<HTMLDivElement>(null)
  const lastFitTarget = useRef('')
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const firstWitness = evidencePaths.find((item) => item[item.length - 1]?.id === focusRequest?.id) ?? evidencePaths.find((item) => item.length > 0)
  const fullMode = showFullGraph || !firstWitness
  const verticalWitness = !fullMode && Boolean(firstWitness && (firstWitness.length > 2 || narrow))
  const fullGraph = layout(state)
  const graph = fullMode || !firstWitness ? fullGraph : layoutWitness(firstWitness, state, verticalWitness)
  const selected = graph.positions.get(selectedId) ?? graph.positions.get(root.id)
  const selectedName = selected?.declaration.name ?? root.name
  const matches = [...graph.positions.values()].filter((node) => node.declaration.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const path: PathStep[] = selected ? pathTo(state, selected.id) : []
  const pathEdges = new Set(path.slice(1).map((step, index) => `${path[index].id}>${step.id}`))
  const pathNodes = new Set(path.map((step) => step.id))
  const evidenceEdges = new Set(evidencePaths.flatMap((item) => item.slice(1).map((step, index) => `${item[index].id}>${step.id}`)))
  const evidenceNodes = new Set(evidencePaths.flatMap((item) => item.map((step) => step.id)))
  const evidenceTargets = new Set(evidencePaths.map((item) => item[item.length - 1]?.id))
  const incoming = state.edges.filter((edge) => edge.to === selected?.id)
  const outgoing = state.edges.filter((edge) => edge.from === selected?.id)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)')
    const update = () => setNarrow(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => { setSelectedId(root.id); setQuery(''); setZoom(1) }, [root.id, state.policy])

  function focus(id: string) {
    setSelectedId(id)
    const targetGraph = graph.positions.has(id) ? graph : fullGraph
    if (targetGraph !== graph) setShowFullGraph(true)
    const node = targetGraph.positions.get(id)
    const area = viewport.current
    if (!node || !area) return
    area.scrollTo({ left: (node.x + NODE_WIDTH / 2) * zoom - area.clientWidth / 2, top: (node.y + NODE_HEIGHT / 2) * zoom - area.clientHeight / 2, behavior: 'smooth' })
  }

  function fitWitness() {
    if (!firstWitness) return
    const nodes = firstWitness.map((step) => graph.positions.get(step.id)).filter((node): node is Positioned => Boolean(node))
    const area = viewport.current
    if (!nodes.length || !area) return
    const minX = Math.min(...nodes.map((node) => node.x))
    const maxX = Math.max(...nodes.map((node) => node.x + NODE_WIDTH))
    const minY = Math.min(...nodes.map((node) => node.y))
    const maxY = Math.max(...nodes.map((node) => node.y + NODE_HEIGHT))
    const nextZoom = 1
    setZoom(nextZoom)
    setSelectedId(firstWitness[firstWitness.length - 1].id)
    requestAnimationFrame(() => area.scrollTo({ left: (minX + maxX) / 2 * nextZoom - area.clientWidth / 2, top: (minY + maxY) / 2 * nextZoom - area.clientHeight / 2, behavior: 'smooth' }))
  }

  useEffect(() => {
    const target = firstWitness?.[firstWitness.length - 1]?.id
    if (!target || target === lastFitTarget.current || !graph.positions.has(target)) return
    lastFitTarget.current = target
    requestAnimationFrame(fitWitness)
  }, [firstWitness?.[firstWitness.length - 1]?.id, state.policy])

  useEffect(() => { requestAnimationFrame(() => { if (showFullGraph) focus(selectedId); else if (firstWitness) fitWitness() }) }, [showFullGraph])
  useEffect(() => { if (!fullMode && firstWitness) requestAnimationFrame(fitWitness) }, [narrow])

  useEffect(() => { if (focusRequest && graph.positions.has(focusRequest.id)) focus(focusRequest.id) }, [focusRequest?.serial, state.policy])

  function panStart(event: React.PointerEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) return
    const area = viewport.current
    if (!area) return
    drag.current = { x: event.clientX, y: event.clientY, left: area.scrollLeft, top: area.scrollTop }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function panMove(event: React.PointerEvent<SVGSVGElement>) {
    const area = viewport.current
    if (!drag.current || !area) return
    area.scrollLeft = drag.current.left - (event.clientX - drag.current.x)
    area.scrollTop = drag.current.top - (event.clientY - drag.current.y)
  }

  return <div className={`graph-explorer ${expanded ? 'expanded' : ''} ${fullMode ? 'full' : 'witness-mode'} ${verticalWitness ? 'witness-long' : ''}`}>
    <div className="graph-toolbar">
      <div className="graph-toolbar-title"><strong>{fullMode ? `Full observed graph · ${fullGraph.positions.size} node${fullGraph.positions.size === 1 ? '' : 's'}` : 'Witness path'}</strong></div>
      <div className="graph-toolbar-actions">
        {firstWitness && <button type="button" onClick={() => { setShowFullGraph((value) => !value); setShowList(false); setZoom(1) }}>{showFullGraph ? 'Show witness path' : 'Show full graph'}</button>}
        {fullMode && <button type="button" onClick={() => setShowList((value) => !value)} aria-pressed={showList}>{showList ? 'Show graph' : 'Show list'}</button>}
        {fullMode && <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.55, Math.round((value - .15) * 100) / 100))}><Minus size={16} /></button>}
        {fullMode && <span className="graph-zoom">{Math.round(zoom * 100)} %</span>}
        {fullMode && <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.7, Math.round((value + .15) * 100) / 100))}><Plus size={16} /></button>}
        {fullMode && <button type="button" aria-label="Center on the theorem" onClick={() => focus(root.id)}><Focus size={16} /></button>}
        <button type="button" aria-label={expanded ? 'Exit full screen' : 'View graph full screen'} onClick={onExpand}>{expanded ? <X size={16} /> : <Maximize2 size={16} />}</button>
      </div>
    </div>
    {fullMode && <div className="graph-utility">
      <label className="graph-search"><Search size={15} /><span className="sr-only">Search declarations in the graph</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search observed nodes…" /></label>
      <span className="graph-coverage">{state.completionReason === 'exhausted' ? 'Traversal complete' : state.completionReason === 'witnesses' ? 'Stopped at witness' : state.status === 'running' ? 'Exploring' : state.status === 'limited' ? 'Exploration limited' : state.status === 'error' ? 'Loading interrupted' : 'Partial graph'}</span>
    </div>}
    {query && <div className="graph-matches" aria-live="polite">{matches.length ? <>{matches.slice(0, 12).map((node) => <button key={node.id} type="button" onClick={() => focus(node.id)}>{node.declaration.name}</button>)}{matches.length > 12 && <span>+ {matches.length - 12} more</span>}</> : <span>No observed declaration matches.</span>}</div>}
    <div className="graph-layout">
      {showList ? <div className="graph-list" aria-label="Observed graph declarations">{[...graph.positions.values()].sort((a, b) => Number(evidenceNodes.has(b.id)) - Number(evidenceNodes.has(a.id)) || a.depth - b.depth || a.declaration.name.localeCompare(b.declaration.name)).map((node) => <button type="button" key={node.id} className={node.id === selected?.id ? 'selected' : ''} onClick={() => focus(node.id)}><span>{String(node.depth).padStart(2, '0')}</span><strong>{node.declaration.name}</strong><small>{evidenceNodes.has(node.id) ? 'witness path' : state.visited.has(node.id) ? 'neighborhood loaded' : 'pending'}</small></button>)}</div> : <div className="graph-viewport" ref={viewport} aria-label="Observed dependency graph, scroll to navigate"><svg width={graph.width * zoom} height={graph.height * zoom} viewBox={`0 0 ${graph.width} ${graph.height}`} onPointerDown={panStart} onPointerMove={panMove} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <defs><marker id="witness-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#30664a" /></marker></defs>
        <g className="graph-edges">{state.edges.map((edge: Edge, index) => {
          const from = graph.positions.get(edge.from)
          const to = graph.positions.get(edge.to)
          if (!from || !to) return null
          const highlighted = pathEdges.has(`${edge.from}>${edge.to}`) || evidenceEdges.has(`${edge.from}>${edge.to}`)
          const startX = verticalWitness ? from.x + NODE_WIDTH / 2 : from.x + NODE_WIDTH
          const endX = verticalWitness ? to.x + NODE_WIDTH / 2 : to.x
          const startY = verticalWitness ? from.y + NODE_HEIGHT : from.y + NODE_HEIGHT / 2
          const endY = verticalWitness ? to.y : to.y + NODE_HEIGHT / 2
          const delta = Math.max(20, (verticalWitness ? endY - startY : endX - startX) / 2)
          const curve = verticalWitness ? `M ${startX} ${startY} C ${startX} ${startY + delta}, ${endX} ${endY - delta}, ${endX} ${endY}` : `M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}`
          return <path key={`${edge.from}-${edge.to}-${edge.type}-${index}`} className={`${edge.type === 'def' ? 'definition' : ''} ${highlighted ? 'highlight' : ''}`} markerEnd={fullMode ? undefined : 'url(#witness-arrow)'} d={curve}><title>{from.declaration.name} → {to.declaration.name} · {edge.type}</title></path>
        })}</g>
        <g className="graph-nodes">{[...graph.positions.values()].map((node) => <g key={node.id} role="button" tabIndex={0} aria-label={`${node.declaration.name}, depth ${node.depth}, ${state.visited.has(node.id) ? 'neighborhood loaded' : 'neighborhood pending'}`} className={`${node.id === selected?.id ? 'selected' : ''} ${pathNodes.has(node.id) || evidenceNodes.has(node.id) ? 'on-path' : ''} ${evidenceTargets.has(node.id) ? 'evidence-target' : ''} ${!state.visited.has(node.id) ? 'unexpanded' : ''} ${query && node.declaration.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? 'match' : ''}`} transform={`translate(${node.x}, ${node.y})`} onClick={() => focus(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focus(node.id) } }}><rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="3" /><circle cx="13" cy={NODE_HEIGHT / 2} r="3" /><text x="23" y="20">{shortName(node.declaration.name)}</text><title>{node.declaration.name}</title></g>)}</g>
      </svg></div>}
      <aside className="graph-inspector" aria-label="Selected declaration">
        <p className="eyebrow">SELECTED DECLARATION</p>
        <h3>{selectedName}</h3>
        {selected?.declaration.body && <pre>{selected.declaration.body}</pre>}
        {selected?.declaration.slogan && <details className="graph-summary"><summary>Read declaration summary</summary><p className="graph-slogan">{selected.declaration.slogan}</p></details>}
        {fullMode && <>
          <div className="graph-node-meta"><span>Depth {selected?.depth ?? 0}</span><span>{selected && state.visited.has(selected.id) ? 'Neighborhood loaded' : 'Neighborhood not loaded'}</span></div>
          <div className="graph-relations"><strong>{incoming.length} incoming</strong>{incoming.slice(0, 9).map((edge, index) => <button key={`${edge.from}-${index}`} onClick={() => focus(edge.from)}><ArrowDownLeft size={12} /><span>{state.names.get(edge.from)?.name ?? edge.from}</span><code>{edge.type}</code></button>)}{incoming.length > 9 && <small>+ {incoming.length - 9} in the list</small>}</div>
          <div className="graph-relations"><strong>{outgoing.length} outgoing</strong>{outgoing.slice(0, 9).map((edge, index) => <button key={`${edge.to}-${index}`} onClick={() => focus(edge.to)}><span>↗</span><span>{state.names.get(edge.to)?.name ?? edge.to}</span><code>{edge.type}</code></button>)}{outgoing.length > 9 && <small>+ {outgoing.length - 9} in the list</small>}</div>
          {path.length > 1 && <div className="graph-path"><strong>Path from the theorem</strong><ol>{path.map((step) => <li key={step.id}><button onClick={() => focus(step.id)}>{step.name}</button>{step.via && <code>{step.via}</code>}</li>)}</ol></div>}
        </>}
        {safeSourceUrl(selected?.declaration.source) && <a href={safeSourceUrl(selected?.declaration.source)} target="_blank" rel="noreferrer">View source ↗</a>}
      </aside>
    </div>
    <p className="graph-caption">{fullMode ? <>Observed <code>proof</code>{state.policy === 'body' ? ' and def' : ''} edges from loaded neighborhoods. Pending nodes may have more dependencies.</> : <>Each arrow is a direct dependency. Select a node to read its declaration.</>}</p>
  </div>
}

export function GraphExplorer({ states, root, onContinue, canContinue, focusRequest, evidencePaths }: { states: Map<Policy, TraversalState>; root: Declaration; onContinue: (policy: Policy) => void; canContinue: boolean; focusRequest?: { id: string; policy: Policy; serial: number }; evidencePaths: EvidencePath[] }) {
  const [policy, setPolicy] = useState<Policy>('proof')
  const [expanded, setExpanded] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const wasExpanded = useRef(false)
  const available = [...states.keys()]
  const effectivePolicy = states.has(policy) ? policy : available[0]
  const state = states.get(effectivePolicy)
  useEffect(() => { if (focusRequest && states.has(focusRequest.policy)) setPolicy(focusRequest.policy) }, [focusRequest?.serial, states])
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (dialog.open) dialog.close()
    if (expanded) dialog.showModal()
    else dialog.show()
    if (!expanded && wasExpanded.current) dialog.querySelector<HTMLButtonElement>('[aria-label="View graph full screen"]')?.focus({ preventScroll: true })
    wasExpanded.current = expanded
  }, [expanded, Boolean(state)])
  if (!state) return null
  return <section className="graph-section" aria-labelledby="graph-title">
    <div className="graph-section-head"><div><p className="eyebrow">05 / GRAPH</p><h2 id="graph-title" tabIndex={-1}>The explored graph</h2><p>Explore observed dependencies, including links between branches. Highlighted paths lead to a finding.</p></div></div>
    {available.length > 1 && <div className="graph-policy" role="group" aria-label="Dependency type">{available.map((option) => <button type="button" key={option} className={effectivePolicy === option ? 'active' : ''} aria-pressed={effectivePolicy === option} onClick={() => setPolicy(option)}>{POLICY_LABEL[option]}</button>)}</div>}
    <dialog ref={dialogRef} className={`graph-dialog ${expanded ? 'expanded' : ''}`} aria-label="Dependency graph explorer" onCancel={(event) => { event.preventDefault(); setExpanded(false) }}><GraphView key={`${root.id}-${effectivePolicy}`} state={state} root={root} expanded={expanded} onExpand={() => setExpanded((value) => !value)} focusRequest={focusRequest?.policy === effectivePolicy ? focusRequest : undefined} evidencePaths={evidencePaths.filter((item) => item.policy === effectivePolicy).map((item) => item.path)} /></dialog>
    {state.completionReason === 'witnesses' && state.frontier.length > 0 && <details className="graph-more"><summary>Explore beyond the first match</summary><div className="graph-continue"><p>More dependencies may reveal other paths.</p><button type="button" disabled={!canContinue} onClick={() => onContinue(effectivePolicy)}><Play size={14} /> Continue exploring</button></div></details>}
  </section>
}
