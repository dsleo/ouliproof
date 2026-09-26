import type { Candidate, Declaration, Edge, Neighborhood } from './domain'

const API_ROOT = '/tg'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ApiError extends Error {
  constructor(message: string, public status?: number) { super(message) }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

async function getJson(path: string, signal?: AbortSignal, timeout = 30000): Promise<unknown> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const response = await fetch(`${API_ROOT}${path}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new ApiError(response.status === 429 ? 'L’API limite les requêtes. Réessayez dans un moment.' : `L’API a répondu HTTP ${response.status}.`, response.status)
    const value: unknown = await response.json()
    if (!object(value)) throw new ApiError('Réponse API invalide.')
    return value
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new ApiError('Délai de réponse de l’API dépassé.')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

interface SharedRequest<T> {
  promise: Promise<T>
  controller: AbortController
  consumers: number
}

function subscribe<T>(entry: SharedRequest<T>, signal: AbortSignal | undefined, onUnused: () => void): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  entry.consumers++
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = () => {
      if (settled) return false
      settled = true
      signal?.removeEventListener('abort', onAbort)
      entry.consumers--
      if (!entry.consumers) onUnused()
      return true
    }
    const onAbort = () => { if (finish()) reject(new DOMException('Aborted', 'AbortError')) }
    signal?.addEventListener('abort', onAbort, { once: true })
    entry.promise.then(
      (value) => { if (finish()) resolve(value) },
      (error) => { if (finish()) reject(error) },
    )
  })
}

export function normalizeNeighborhood(value: unknown, expectedId: string): Neighborhood {
  const data = object(value)
  const rootRaw = object(data?.root)
  const statement = object(rootRaw?.statement)
  const paper = object(rootRaw?.paper)
  if (!data || !rootRaw || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || rootRaw.statement_id !== expectedId || !string(rootRaw.name)) {
    throw new ApiError('Le format du voisinage TheoremGraph a changé ou la déclaration ne correspond pas.')
  }
  const sourceLabel = string(statement?.paper_external_id) ?? string(paper?.external_id) ?? string(statement?.paper_title)
  const root: Declaration = { id: expectedId, name: rootRaw.name as string, kind: string(statement?.kind), body: string(statement?.body), source: string(paper?.source), sourceLabel }
  const nodes = new Map<string, Declaration>([[expectedId, root]])
  for (const raw of data.nodes) {
    const node = object(raw)
    const id = string(node?.statement_id)
    const name = string(node?.name)
    if (id && name) nodes.set(id, { id, name, slogan: string(node?.slogan) })
  }
  const outgoing: Edge[] = []
  for (const raw of data.edges) {
    const edge = object(raw)
    const from = string(edge?.src_id)
    const to = string(edge?.dep_id)
    const type = string(edge?.edge_type)
    if (from === expectedId && to && type) {
      if (!nodes.has(to)) throw new ApiError(`La réponse omet le nom d’une dépendance (${to}).`)
      outgoing.push({ from, to, type })
    }
  }
  return { root, nodes, outgoing }
}

export class TheoremGraphClient {
  private cache = new Map<string, Neighborhood>()
  private inflight = new Map<string, SharedRequest<Neighborhood>>()

  async search(query: string, signal?: AbortSignal): Promise<Candidate[]> {
    const params = new URLSearchParams({ query, n_results: '24', formality: 'formal' })
    const value = object(await getJson(`/graph/embedding?${params}`, signal, 90000))
    if (!Array.isArray(value?.results)) throw new ApiError('Le format de recherche TheoremGraph a changé.')
    const found = new Map<string, Candidate>()
    for (const item of value.results) {
      const row = object(item)
      const id = string(row?.statement_id)
      const sourceLabel = string(row?.external_id) ?? string(row?.title)
      if (!id || !UUID.test(id) || !sourceLabel || !/^Mathlib/i.test(sourceLabel) || found.has(id)) continue
      found.set(id, { id, name: string(row?.name) ?? 'Déclaration', body: string(row?.body), slogan: string(row?.slogan), source: string(row?.source), sourceLabel, score: typeof row?.score === 'number' ? row.score : 0, loading: true })
      if (found.size === 10) break
    }
    return Array.from(found.values())
  }

  async neighborhood(id: string, signal?: AbortSignal): Promise<Neighborhood> {
    if (!UUID.test(id)) throw new ApiError('Identifiant de déclaration invalide.')
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const cached = this.cache.get(id)
    if (cached) return cached
    let entry = this.inflight.get(id)
    if (!entry) {
      const controller = new AbortController()
      entry = { controller, consumers: 0, promise: Promise.resolve(undefined as never) }
      const request = entry
      request.promise = getJson(`/graph/statement/${encodeURIComponent(id)}?direction=src&formality=formal`, controller.signal, 25000)
        .then((value) => normalizeNeighborhood(value, id))
        .then((value) => { this.cache.set(id, value); return value })
        .finally(() => { if (this.inflight.get(id) === request) this.inflight.delete(id) })
      this.inflight.set(id, request)
    }
    const request = entry
    return subscribe(request, signal, () => {
      if (this.inflight.get(id) === request) this.inflight.delete(id)
      request.controller.abort()
    })
  }

  cachedCount(): number { return this.cache.size }
}
