import type { Candidate, Declaration, Edge, Neighborhood } from './domain'
import { readNeighborhood, writeNeighborhood } from './neighborhoodCache'

const API_ROOT = '/tg'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ApiError extends Error {
  constructor(message: string, public status?: number, public retryAfterMs?: number) { super(message) }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function retryAfter(response: Response): number | undefined {
  const header = response.headers.get('Retry-After')
  if (!header) return undefined
  const seconds = Number(header)
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now()
  return Number.isFinite(milliseconds) ? Math.max(0, Math.min(milliseconds, 5000)) : undefined
}

async function getJson(path: string, signal?: AbortSignal, timeout = 30000, onRequest?: () => void): Promise<unknown> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    onRequest?.()
    const response = await fetch(`${API_ROOT}${path}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new ApiError(response.status === 429 ? 'The API is rate limiting requests. Try again shortly.' : `The API returned HTTP ${response.status}.`, response.status, retryAfter(response))
    const value: unknown = await response.json()
    if (!object(value)) throw new ApiError('Invalid API response.')
    return value
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new ApiError('The API request timed out.')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
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

export function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch { return undefined }
}

export function normalizeNeighborhood(value: unknown, expectedId: string): Neighborhood {
  const data = object(value)
  const rootRaw = object(data?.root)
  const statement = object(rootRaw?.statement)
  const paper = object(rootRaw?.paper)
  if (!data || !rootRaw || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || rootRaw.statement_id !== expectedId || !string(rootRaw.name)) {
    throw new ApiError('The TheoremGraph response format has changed or the declaration does not match.')
  }
  const sourceLabel = string(statement?.paper_external_id) ?? string(paper?.external_id) ?? string(statement?.paper_title)
  const root: Declaration = { id: expectedId, name: rootRaw.name as string, kind: string(statement?.kind), body: string(statement?.body), source: safeSourceUrl(paper?.source), sourceLabel }
  const nodes = new Map<string, Declaration>([[expectedId, root]])
  for (const raw of data.nodes) {
    const node = object(raw)
    const id = string(node?.statement_id)
    const name = string(node?.name)
    if (id && name && id !== expectedId) nodes.set(id, { id, name, slogan: string(node?.slogan) })
  }
  const outgoing: Edge[] = []
  for (const raw of data.edges) {
    const edge = object(raw)
    const from = string(edge?.src_id)
    const to = string(edge?.dep_id)
    const type = string(edge?.edge_type)
    if (from === expectedId && to && type) {
      if (!nodes.has(to)) throw new ApiError(`The response omits the name of a dependency (${to}).`)
      outgoing.push({ from, to, type })
    }
  }
  return { root, nodes, outgoing }
}

export class TheoremGraphClient {
  private cache = new Map<string, { value: Neighborhood; savedAt: number }>()
  private inflight = new Map<string, SharedRequest<Neighborhood>>()
  private stats = { memoryHits: 0, browserHits: 0, networkRequests: 0, rateLimits: 0 }
  private cooldownUntil = 0

  private remember(id: string, value: Neighborhood, savedAt = Date.now()) {
    this.cache.delete(id)
    this.cache.set(id, { value, savedAt })
    if (this.cache.size > 120) this.cache.delete(this.cache.keys().next().value!)
  }

  async search(query: string, signal?: AbortSignal): Promise<Candidate[]> {
    const params = new URLSearchParams({ query, n_results: '24', formality: 'formal' })
    const value = object(await getJson(`/graph/embedding?${params}`, signal, 90000))
    if (!Array.isArray(value?.results)) throw new ApiError('The TheoremGraph search response format has changed.')
    const found = new Map<string, Candidate>()
    for (const item of value.results) {
      const row = object(item)
      const id = string(row?.statement_id)
      const sourceLabel = string(row?.external_id) ?? string(row?.title)
      if (!id || !UUID.test(id) || !sourceLabel || !/^Mathlib/i.test(sourceLabel) || found.has(id)) continue
      found.set(id, { id, name: string(row?.name) ?? 'Declaration', body: string(row?.body), slogan: string(row?.slogan), source: safeSourceUrl(row?.source), sourceLabel, score: typeof row?.score === 'number' ? row.score : 0, loading: true })
      if (found.size === 10) break
    }
    return Array.from(found.values())
  }

  async neighborhood(id: string, signal?: AbortSignal): Promise<Neighborhood> {
    if (!UUID.test(id)) throw new ApiError('Invalid declaration ID.')
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const cached = this.cache.get(id)
    if (cached && Date.now() - cached.savedAt < 60 * 60 * 1000) {
      this.stats.memoryHits++
      this.remember(id, cached.value, cached.savedAt)
      return cached.value
    }
    if (cached) this.cache.delete(id)
    let entry = this.inflight.get(id)
    if (!entry) {
      const controller = new AbortController()
      entry = { controller, consumers: 0, promise: Promise.resolve(undefined as never) }
      const request = entry
      request.promise = (async () => {
        const stored = await readNeighborhood(id)
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (stored) {
          this.stats.browserHits++
          this.remember(id, stored)
          return stored
        }
        for (let attempt = 0; ; attempt++) {
          const cooldown = this.cooldownUntil - Date.now()
          if (cooldown > 0) await delay(cooldown, controller.signal)
          try {
            const raw = await getJson(`/graph/statement/${encodeURIComponent(id)}?direction=src&formality=formal`, controller.signal, 25000, () => this.stats.networkRequests++)
            const value = normalizeNeighborhood(raw, id)
            this.remember(id, value)
            void writeNeighborhood(id, value)
            return value
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 429 || attempt >= 2) throw error
            this.stats.rateLimits++
            this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + (error.retryAfterMs ?? 1000 * 2 ** attempt))
          }
        }
      })()
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
  cacheStats() { return { ...this.stats, cached: this.cache.size } }
}
