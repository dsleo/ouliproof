import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, Focus, Maximize2, Minus, Play, Plus, Search, X } from 'lucide-react'
import type { Declaration, Edge, PathStep, Policy, TraversalState } from './domain'
import { pathTo } from './explorer'
import { POLICY_LABEL } from './domain'
import './graph.css'

type Positioned = { id: string; declaration: Declaration; x: number; y: number; depth: number }
type EvidencePath = { policy: Policy; path: PathStep[] }
const NODE_WIDTH = 190
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

function shortName(value: string) {
  return value.length > 25 ? `…${value.slice(-24)}` : value
}

function GraphView({ state, root, expanded, onExpand, focusRequest, evidencePaths }: { state: TraversalState; root: Declaration; expanded: boolean; onExpand: () => void; focusRequest?: { id: string; serial: number }; evidencePaths: PathStep[][] }) {
  const [selectedId, setSelectedId] = useState(root.id)
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState(1)
  const [showList, setShowList] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const graph = layout(state)
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

  useEffect(() => { setSelectedId(root.id); setQuery(''); setZoom(1) }, [root.id, state.policy])

  function focus(id: string) {
    setSelectedId(id)
    const node = graph.positions.get(id)
    const area = viewport.current
    if (!node || !area) return
    area.scrollTo({ left: (node.x + NODE_WIDTH / 2) * zoom - area.clientWidth / 2, top: (node.y + NODE_HEIGHT / 2) * zoom - area.clientHeight / 2, behavior: 'smooth' })
  }

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

  return <div className={`graph-explorer ${expanded ? 'expanded' : ''}`}>
    <div className="graph-toolbar">
      <div className="graph-toolbar-title"><span className="eyebrow">DEPENDENCY GRAPH</span><strong>{graph.positions.size} nodes <span aria-hidden="true">·</span> {state.edges.length} observed edges</strong></div>
      <div className="graph-toolbar-actions">
        <button type="button" onClick={() => setShowList((value) => !value)} aria-pressed={showList}>{showList ? 'Show graph' : 'Show list'}</button>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.55, Math.round((value - .15) * 100) / 100))}><Minus size={16} /></button>
        <span className="graph-zoom">{Math.round(zoom * 100)} %</span>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.7, Math.round((value + .15) * 100) / 100))}><Plus size={16} /></button>
        <button type="button" aria-label="Center on the theorem" onClick={() => focus(root.id)}><Focus size={16} /></button>
        <button type="button" aria-label={expanded ? 'Exit full screen' : 'View graph full screen'} onClick={onExpand}>{expanded ? <X size={16} /> : <Maximize2 size={16} />}</button>
      </div>
    </div>
    <div className="graph-utility">
      <label className="graph-search"><Search size={15} /><span className="sr-only">Search declarations in the graph</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search observed nodes…" /></label>
      <span className="graph-coverage">{state.completionReason === 'exhausted' ? 'Traversal complete' : state.completionReason === 'witnesses' ? 'Stopped at witness' : state.status === 'running' ? 'Exploring' : state.status === 'limited' ? 'Exploration limited' : state.status === 'error' ? 'Loading interrupted' : 'Partial graph'}</span>
    </div>
    {query && <div className="graph-matches" aria-live="polite">{matches.length ? <>{matches.slice(0, 12).map((node) => <button key={node.id} type="button" onClick={() => focus(node.id)}>{node.declaration.name}</button>)}{matches.length > 12 && <span>+ {matches.length - 12} more</span>}</> : <span>No observed declaration matches.</span>}</div>}
    <div className="graph-layout">
      {showList ? <div className="graph-list" aria-label="Observed graph declarations">{[...graph.positions.values()].sort((a, b) => a.depth - b.depth || a.declaration.name.localeCompare(b.declaration.name)).map((node) => <button type="button" key={node.id} className={node.id === selected?.id ? 'selected' : ''} onClick={() => focus(node.id)}><span>{String(node.depth).padStart(2, '0')}</span><strong>{node.declaration.name}</strong><small>{state.visited.has(node.id) ? 'neighborhood loaded' : 'pending'}</small></button>)}</div> : <div className="graph-viewport" ref={viewport} aria-label="Observed dependency graph, scroll to navigate"><svg width={graph.width * zoom} height={graph.height * zoom} viewBox={`0 0 ${graph.width} ${graph.height}`} onPointerDown={panStart} onPointerMove={panMove} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <g className="graph-edges">{state.edges.map((edge: Edge, index) => {
          const from = graph.positions.get(edge.from)
          const to = graph.positions.get(edge.to)
          if (!from || !to) return null
          const highlighted = pathEdges.has(`${edge.from}>${edge.to}`) || evidenceEdges.has(`${edge.from}>${edge.to}`)
          const startX = from.x + NODE_WIDTH
          const endX = to.x
          const startY = from.y + NODE_HEIGHT / 2
          const endY = to.y + NODE_HEIGHT / 2
          const delta = Math.max(32, (endX - startX) / 2)
          return <path key={`${edge.from}-${edge.to}-${edge.type}-${index}`} className={`${edge.type === 'def' ? 'definition' : ''} ${highlighted ? 'highlight' : ''}`} d={`M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}`}><title>{from.declaration.name} → {to.declaration.name} · {edge.type}</title></path>
        })}</g>
        <g className="graph-nodes">{[...graph.positions.values()].map((node) => <g key={node.id} role="button" tabIndex={0} aria-label={`${node.declaration.name}, depth ${node.depth}, ${state.visited.has(node.id) ? 'neighborhood loaded' : 'neighborhood pending'}`} className={`${node.id === selected?.id ? 'selected' : ''} ${pathNodes.has(node.id) || evidenceNodes.has(node.id) ? 'on-path' : ''} ${evidenceTargets.has(node.id) ? 'evidence-target' : ''} ${!state.visited.has(node.id) ? 'unexpanded' : ''} ${query && node.declaration.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? 'match' : ''}`} transform={`translate(${node.x}, ${node.y})`} onClick={() => focus(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focus(node.id) } }}><rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="3" /><circle cx="13" cy={NODE_HEIGHT / 2} r="3" /><text x="23" y="20">{shortName(node.declaration.name)}</text><title>{node.declaration.name}</title></g>)}</g>
      </svg></div>}
      <aside className="graph-inspector" aria-label="Selected declaration"><p className="eyebrow">SELECTED NODE</p><h3>{selectedName}</h3><div className="graph-node-meta"><span>Depth {selected?.depth ?? 0}</span><span>{selected && state.visited.has(selected.id) ? 'Neighborhood loaded' : 'Neighborhood not loaded'}</span></div>{selected?.declaration.body && <pre>{selected.declaration.body}</pre>}{selected?.declaration.slogan && <p className="graph-slogan">{selected.declaration.slogan}</p>}<div className="graph-relations"><strong>{incoming.length} incoming</strong>{incoming.slice(0, 9).map((edge, index) => <button key={`${edge.from}-${index}`} onClick={() => focus(edge.from)}><ArrowDownLeft size={12} /><span>{state.names.get(edge.from)?.name ?? edge.from}</span><code>{edge.type}</code></button>)}{incoming.length > 9 && <small>+ {incoming.length - 9} in the list</small>}</div><div className="graph-relations"><strong>{outgoing.length} outgoing</strong>{outgoing.slice(0, 9).map((edge, index) => <button key={`${edge.to}-${index}`} onClick={() => focus(edge.to)}><span>↗</span><span>{state.names.get(edge.to)?.name ?? edge.to}</span><code>{edge.type}</code></button>)}{outgoing.length > 9 && <small>+ {outgoing.length - 9} in the list</small>}</div>{path.length > 1 && <div className="graph-path"><strong>Path from the theorem</strong><ol>{path.map((step) => <li key={step.id}><button onClick={() => focus(step.id)}>{step.name}</button>{step.via && <code>{step.via}</code>}</li>)}</ol></div>}{selected?.declaration.source && <a href={selected.declaration.source} target="_blank" rel="noreferrer">View source ↗</a>}</aside>
    </div>
    <p className="graph-caption">All <code>proof</code>{state.policy === 'body' ? ' and def' : ''} edges returned for loaded neighborhoods are shown. A pending node may have more dependencies. Drag the background to pan; select a node to inspect its links.</p>
  </div>
}

export function GraphExplorer({ states, root, onContinue, canContinue, focusRequest, evidencePaths }: { states: Map<Policy, TraversalState>; root: Declaration; onContinue: (policy: Policy) => void; canContinue: boolean; focusRequest?: { id: string; policy: Policy; serial: number }; evidencePaths: EvidencePath[] }) {
  const [policy, setPolicy] = useState<Policy>('proof')
  const [expanded, setExpanded] = useState(false)
  const available = [...states.keys()]
  const effectivePolicy = states.has(policy) ? policy : available[0]
  const state = states.get(effectivePolicy)
  useEffect(() => { if (focusRequest && states.has(focusRequest.policy)) setPolicy(focusRequest.policy) }, [focusRequest?.serial, states])
  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded])
  if (!state) return null
  return <section className="graph-section" aria-labelledby="graph-title"><div className="graph-section-head"><div><p className="eyebrow">04 / GRAPH EXPLORER</p><h3 id="graph-title">The explored graph</h3><p>Explore observed dependencies, including links between branches.</p></div>{available.length > 1 && <div className="graph-policy" role="group" aria-label="Dependency type">{available.map((option) => <button type="button" key={option} className={effectivePolicy === option ? 'active' : ''} aria-pressed={effectivePolicy === option} onClick={() => setPolicy(option)}>{POLICY_LABEL[option]}</button>)}</div>}</div>{state.completionReason === 'witnesses' && state.frontier.length > 0 && <div className="graph-continue"><p>The first signals were found. Continue to expand the graph within the local request limit.</p><button type="button" disabled={!canContinue} onClick={() => onContinue(effectivePolicy)}><Play size={14} /> Continue exploring</button></div>}<GraphView key={`${root.id}-${effectivePolicy}`} state={state} root={root} expanded={expanded} onExpand={() => setExpanded((value) => !value)} focusRequest={focusRequest?.policy === effectivePolicy ? focusRequest : undefined} evidencePaths={evidencePaths.filter((item) => item.policy === effectivePolicy).map((item) => item.path)} /></section>
}
