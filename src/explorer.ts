import { TheoremGraphClient } from './api'
import type { Declaration, Objective, PathStep, Policy, TraversalState } from './domain'

export const LIMITS = { nodes: 180, requests: 180, milliseconds: 100000, concurrency: 2 }

export function freshState(policy: Policy, root: Declaration): TraversalState {
  return {
    policy, status: 'idle', visited: new Set(), discovered: new Set([root.id]),
    edges: [],
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
  private targets = new Map<Policy, Set<string>>()
  private edgeKeys = new Map<Policy, Set<string>>()
  private active = false
  private cancelled = false
  private pauseRequested = false
  private restartAfterCurrent: Policy[] = []
  private controllers = new Set<AbortController>()
  private generation = 0

  constructor(private client: TheoremGraphClient, private onUpdate: (states: Map<Policy, TraversalState>) => void) {}

  setup(root: Declaration, policies: Policy[], objectives: Objective[] = []) {
    this.cancel()
    this.generation++
    this.active = false
    this.cancelled = false
    this.pauseRequested = false
    this.restartAfterCurrent = []
    this.states = new Map(policies.map((policy) => [policy, freshState(policy, root)]))
    this.targets = new Map(policies.map((policy) => [policy, new Set(objectives.filter((objective) => objective.kind === 'named' && objective.capability === 'exact' && objective.policy === policy && objective.target).map((objective) => objective.target!))]))
    this.edgeKeys = new Map(policies.map((policy) => [policy, new Set<string>()]))
    this.emit()
  }

  start(policies?: Policy[]) {
    if (this.active) return
    this.cancelled = false
    this.pauseRequested = false
    this.active = true
    const generation = this.generation
    void Promise.all(Array.from(this.states.values()).filter((state) => !policies || policies.includes(state.policy)).map((state) => this.runPolicy(state, generation)))
      .finally(() => {
        if (generation !== this.generation) return
        this.active = false
        this.emit()
        if (this.restartAfterCurrent.length && !this.cancelled) {
          const policiesToRestart = this.restartAfterCurrent
          this.restartAfterCurrent = []
          this.start(policiesToRestart)
        }
      })
  }

  pause() { this.pauseRequested = true; this.emit() }
  resume() { if (!this.active) this.start() }
  continueAfterWitness(policy?: Policy) {
    const reopened: Policy[] = []
    for (const state of this.states.values()) {
      if (policy && state.policy !== policy) continue
      if (state.completionReason !== 'witnesses' || !state.frontier.length) continue
      this.targets.delete(state.policy)
      state.completionReason = undefined
      state.status = 'paused'
      reopened.push(state.policy)
    }
    if (reopened.length) {
      this.emit()
      if (this.active) this.restartAfterCurrent.push(...reopened)
      else this.start(reopened)
    }
  }
  cancel() {
    this.cancelled = true
    this.pauseRequested = false
    this.restartAfterCurrent = []
    for (const controller of this.controllers) controller.abort()
    this.controllers.clear()
  }

  private emit() { this.onUpdate(new Map(this.states)) }

  private async runPolicy(state: TraversalState, generation: number) {
    if (!state.frontier.length || state.status === 'complete') return
    state.status = 'running'
    state.completionReason = undefined
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
      // Expand only one concurrent chunk at a time. A witness in this chunk
      // can then prevent every later request in the (possibly huge) frontier.
      const batch = state.frontier.slice(0, Math.min(remaining, LIMITS.concurrency))
      if (!batch.length) { state.status = 'limited'; break }
      const pending = new Map(batch.map((id) => {
        const controller = new AbortController()
        this.controllers.add(controller)
        state.requests++
        const result = this.client.neighborhood(id, controller.signal)
          .then((value) => ({ id, value, error: null as unknown }))
          .catch((error: unknown) => ({ id, value: null as never, error }))
          .finally(() => this.controllers.delete(controller))
        return [id, { controller, result }] as const
      }))
      const edgeKeys = this.edgeKeys.get(state.policy)!
      const targets = this.targets.get(state.policy)
      let failure: unknown = null
      while (pending.size && !this.cancelled && generation === this.generation) {
        const { id, value: neighborhood, error } = await Promise.race([...pending.values()].map((entry) => entry.result))
        pending.delete(id)
        if (error) { failure ??= error; continue }
        state.visited.add(id)
        state.names.set(id, neighborhood.root)
        for (const [nodeId, declaration] of neighborhood.nodes) {
          if (!state.names.has(nodeId) || nodeId === id) state.names.set(nodeId, declaration)
        }
        for (const edge of neighborhood.outgoing) {
          if (edge.type !== 'proof' && !(state.policy === 'body' && edge.type === 'def')) continue
          const edgeKey = `${edge.from}\0${edge.to}\0${edge.type}`
          if (!edgeKeys.has(edgeKey)) { state.edges.push(edge); edgeKeys.add(edgeKey) }
          if (!state.discovered.has(edge.to)) {
            state.discovered.add(edge.to)
            state.parents.set(edge.to, { from: id, edge: edge.type })
            state.frontier.push(edge.to)
          }
        }
        state.frontier = state.frontier.filter((item) => item !== id)
        state.elapsedMs = elapsedBefore + performance.now() - started
        const foundNames = new Set([...state.discovered].filter((nodeId) => state.parents.get(nodeId) !== null).map((nodeId) => state.names.get(nodeId)?.name))
        if (targets?.size && [...targets].every((target) => foundNames.has(target))) {
          state.status = 'complete'
          state.completionReason = 'witnesses'
          for (const entry of pending.values()) entry.controller.abort()
          this.emit()
          break
        }
        this.emit()
      }
      if (this.cancelled || generation !== this.generation) return
      state.elapsedMs = elapsedBefore + performance.now() - started
      if (state.completionReason === 'witnesses') break
      if (failure) {
        state.status = 'error'
        state.error = failure instanceof Error ? failure.message : 'Could not load a dependency.'
        this.emit()
        break
      }
      if (state.frontier.length && (state.visited.size >= LIMITS.nodes || state.requests >= LIMITS.requests || state.elapsedMs >= LIMITS.milliseconds)) {
        state.status = 'limited'; break
      }
    }
    if (!this.cancelled && generation === this.generation) {
      if (state.status === 'running') {
        state.status = state.frontier.length ? 'paused' : 'complete'
        if (!state.frontier.length) state.completionReason = 'exhausted'
      }
      this.emit()
    }
  }

}
