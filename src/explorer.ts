import { TheoremGraphClient } from './api'
import type { Declaration, Objective, PathStep, Policy, TraversalState } from './domain'

export const LIMITS = { nodes: 180, requests: 180, milliseconds: 100000, concurrency: 2 }

export function freshState(policy: Policy, root: Declaration): TraversalState {
  return {
    policy, status: 'idle', visited: new Set(), discovered: new Set([root.id]),
    names: new Map([[root.id, root]]), parents: new Map([[root.id, null]]),
    frontier: [root.id], requests: 0, elapsedMs: 0,
  }
}

export function pathTo(state: TraversalState, id: string): PathStep[] {
  if (!state.parents.has(id)) return []
  const steps: PathStep[] = []
  let cursor: string | null = id
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const node: Declaration | undefined = state.names.get(cursor)
    const parent: { from: string; edge: string } | null | undefined = state.parents.get(cursor)
    steps.push({ id: cursor, name: node?.name ?? cursor, via: parent?.edge })
    cursor = parent?.from ?? null
  }
  return steps.reverse()
}

export function findWitness(state: TraversalState | undefined, objective: Objective): PathStep[] | null {
  if (!state || objective.kind !== 'named' || !objective.target) return null
  let best: PathStep[] | null = null
  for (const id of state.discovered) {
    if (id === state.frontier[0] && state.parents.get(id) === null) continue
    if (state.names.get(id)?.name !== objective.target) continue
    const path = pathTo(state, id)
    if (path.length > 1 && (!best || path.length < best.length)) best = path
  }
  return best
}

export class Explorer {
  states = new Map<Policy, TraversalState>()
  private active = false
  private cancelled = false
  private pauseRequested = false
  private controllers = new Set<AbortController>()
  private generation = 0

  constructor(private client: TheoremGraphClient, private onUpdate: (states: Map<Policy, TraversalState>) => void) {}

  setup(root: Declaration, policies: Policy[]) {
    this.cancel()
    this.generation++
    this.active = false
    this.cancelled = false
    this.pauseRequested = false
    this.states = new Map(policies.map((policy) => [policy, freshState(policy, root)]))
    this.emit()
  }

  start() {
    if (this.active) return
    this.cancelled = false
    this.pauseRequested = false
    this.active = true
    const generation = this.generation
    void Promise.all(Array.from(this.states.values()).map((state) => this.runPolicy(state, generation)))
      .finally(() => { if (generation === this.generation) { this.active = false; this.emit() } })
  }

  pause() { this.pauseRequested = true; this.emit() }
  resume() { if (!this.active) this.start() }
  cancel() {
    this.cancelled = true
    this.pauseRequested = false
    for (const controller of this.controllers) controller.abort()
    this.controllers.clear()
  }

  private emit() { this.onUpdate(new Map(this.states)) }

  private async runPolicy(state: TraversalState, generation: number) {
    if (!state.frontier.length || state.status === 'complete') return
    state.status = 'running'
    state.error = undefined
    const started = performance.now()
    const elapsedBefore = state.elapsedMs
    this.emit()

    while (state.frontier.length && !this.cancelled && generation === this.generation) {
      if (this.pauseRequested) { state.status = 'paused'; break }
      if (state.visited.size >= LIMITS.nodes || state.requests >= LIMITS.requests || state.elapsedMs >= LIMITS.milliseconds) {
        state.status = 'limited'; break
      }

      const remaining = Math.min(LIMITS.nodes - state.visited.size, LIMITS.requests - state.requests)
      const batch = state.frontier.slice(0, Math.min(remaining, 12))
      if (!batch.length) { state.status = 'limited'; break }
      const results = await this.fetchBatch(batch, state, generation)
      if (this.cancelled || generation !== this.generation) return
      const failure = results.find((item) => item.status === 'rejected')
      if (failure?.status === 'rejected') {
        state.status = 'error'
        state.error = failure.reason instanceof Error ? failure.reason.message : 'Impossible de charger une dépendance.'
        break
      }

      const next: string[] = []
      for (let index = 0; index < batch.length; index++) {
        const result = results[index]
        if (result.status !== 'fulfilled') continue
        const neighborhood = result.value
        const id = batch[index]
        state.visited.add(id)
        state.names.set(id, neighborhood.root)
        for (const [nodeId, declaration] of neighborhood.nodes) {
          if (!state.names.has(nodeId) || nodeId === id) state.names.set(nodeId, declaration)
        }
        for (const edge of neighborhood.outgoing) {
          if (edge.type !== 'proof' && !(state.policy === 'body' && edge.type === 'def')) continue
          if (!state.discovered.has(edge.to)) {
            state.discovered.add(edge.to)
            state.parents.set(edge.to, { from: id, edge: edge.type })
            next.push(edge.to)
          }
        }
      }
      state.frontier = [...state.frontier.slice(batch.length), ...next]
      state.elapsedMs = elapsedBefore + performance.now() - started
      this.emit()
      if (state.frontier.length && (state.visited.size >= LIMITS.nodes || state.requests >= LIMITS.requests || state.elapsedMs >= LIMITS.milliseconds)) {
        state.status = 'limited'; break
      }
    }
    if (!this.cancelled && generation === this.generation) {
      if (state.status === 'running') state.status = state.frontier.length ? 'paused' : 'complete'
      this.emit()
    }
  }

  private async fetchBatch(ids: string[], state: TraversalState, generation: number) {
    const outcomes: PromiseSettledResult<Awaited<ReturnType<TheoremGraphClient['neighborhood']>>>[] = []
    for (let offset = 0; offset < ids.length; offset += LIMITS.concurrency) {
      if (this.cancelled || generation !== this.generation) break
      const chunk = ids.slice(offset, offset + LIMITS.concurrency)
      const chunkResults = await Promise.allSettled(chunk.map(async (id) => {
        const controller = new AbortController()
        this.controllers.add(controller)
        state.requests++
        try { return await this.client.neighborhood(id, controller.signal) }
        finally { this.controllers.delete(controller) }
      }))
      outcomes.push(...chunkResults)
      if (chunkResults.some((item) => item.status === 'rejected')) break
    }
    return outcomes
  }
}
