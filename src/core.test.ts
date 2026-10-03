import { describe, expect, it, vi } from 'vitest'
import { normalizeNeighborhood, safeSourceUrl, TheoremGraphClient } from './api'
import type { Declaration, Neighborhood, Objective, TraversalState } from './domain'
import { Explorer, findWitness } from './explorer'
import { interpretObjective } from './objectives'

const IDS = {
  em: '46f9bdf2-6f17-43d0-9009-8485b2479ea2',
  spec: '24429694-bfba-471f-8323-65376ba97978',
  indefinite: '900586fb-f641-490a-88d5-e93467529e57',
  choice: '7b185410-dd7e-483a-b914-98d71aa2e23b',
}

describe('source links', () => {
  it('only accepts absolute HTTPS URLs', () => {
    expect(safeSourceUrl('Lean Repo')).toBeUndefined()
    expect(safeSourceUrl('/Lean Repo')).toBeUndefined()
    expect(safeSourceUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeSourceUrl('https://github.com/leanprover-community/mathlib4')).toBe('https://github.com/leanprover-community/mathlib4')
  })
})

const declarations: Declaration[] = [
  { id: IDS.em, name: 'Classical.em' },
  { id: IDS.spec, name: 'Classical.choose_spec' },
  { id: IDS.indefinite, name: 'Classical.indefiniteDescription' },
  { id: IDS.choice, name: 'Classical.choice' },
]

function neighborhood(index: number, next?: { index: number; type: string }): Neighborhood {
  const root = declarations[index]
  return { root, nodes: new Map(declarations.map((item) => [item.id, item])), outgoing: next ? [{ from: root.id, to: declarations[next.index].id, type: next.type }] : [] }
}

async function run(policy: 'proof' | 'body', failId?: string): Promise<TraversalState> {
  const neighborhoods = new Map([
    [IDS.em, neighborhood(0, { index: 1, type: 'proof' })],
    [IDS.spec, neighborhood(1, { index: 2, type: 'proof' })],
    [IDS.indefinite, neighborhood(2, { index: 3, type: 'def' })],
    [IDS.choice, neighborhood(3)],
  ])
  const client = { neighborhood: async (id: string) => {
    if (id === failId) throw new Error('HTTP 503')
    const value = neighborhoods.get(id)
    if (!value) throw new Error('Missing fixture')
    return value
  } } as TheoremGraphClient
  return await new Promise<TraversalState>((resolve) => {
    const explorer = new Explorer(client, (states) => {
      const state = states.get(policy)
      if (state && ['complete', 'error', 'limited'].includes(state.status)) resolve(state)
    })
    explorer.setup(declarations[0], [policy])
    explorer.start()
  })
}

describe('questions de l’utilisateur', () => {
  it('accepts the English prompts shown in the interface', () => {
    expect(interpretObjective('depends on Nat.zero_add')).toMatchObject({ kind: 'named', target: 'Nat.zero_add', policy: 'proof' })
    expect(interpretObjective('definitions to Classical.choice')).toMatchObject({ target: 'Classical.choice', policy: 'body' })
    expect(interpretObjective('axiom of choice')).toMatchObject({ target: 'Classical.choice', policy: 'body' })
    expect(interpretObjective('induction')).toMatchObject({ capability: 'hint', policy: 'proof' })
    expect(interpretObjective('case analysis')).toMatchObject({ capability: 'hint', policy: 'proof' })
    expect(interpretObjective('proof by contradiction')).toMatchObject({ capability: 'hint', policy: 'proof' })
  })
  it('traduit un nom Lean exact en recherche de référence de preuve', () => {
    expect(interpretObjective('dépend de Nat.zero_add')).toMatchObject({ kind: 'named', target: 'Nat.zero_add', policy: 'proof' })
  })
  it('sépare la recherche de choix des questions de tactique', () => {
    expect(interpretObjective('axiome du choix')).toMatchObject({ target: 'Classical.choice', policy: 'body' })
    expect(interpretObjective('raisonnement par l’absurde')).toMatchObject({ capability: 'hint' })
    expect(interpretObjective('récurrence')).toMatchObject({ capability: 'hint' })
  })
})

describe('voisinage TheoremGraph', () => {
  it('ne suit que les arêtes sortant de la racine et refuse une cible sans nom', () => {
    const raw = {
      root: { statement_id: IDS.em, name: 'Classical.em', statement: { kind: 'theorem', body: 'Classical.em (p : Prop) : p ∨ ¬p', paper_external_id: 'Mathlib_v427' } },
      nodes: [{ statement_id: IDS.em, name: 'Classical.em' }, { statement_id: IDS.spec, name: 'Classical.choose_spec' }, { statement_id: IDS.indefinite, name: 'Classical.indefiniteDescription' }],
      edges: [{ src_id: IDS.em, dep_id: IDS.spec, edge_type: 'proof' }, { src_id: IDS.spec, dep_id: IDS.indefinite, edge_type: 'proof' }],
    }
    const parsed = normalizeNeighborhood(raw, IDS.em)
    expect(parsed.outgoing).toEqual([{ from: IDS.em, to: IDS.spec, type: 'proof' }])
    expect(parsed.root.sourceLabel).toBe('Mathlib_v427')
    expect(parsed.nodes.get(IDS.em)?.body).toBe('Classical.em (p : Prop) : p ∨ ¬p')
    expect(() => normalizeNeighborhood({ ...raw, nodes: [] }, IDS.em)).toThrow(/omits the name/)
  })
})

describe('parcours des dépendances', () => {
  const target = interpretObjective('axiome du choix')!
  it('identifies a definition root whose proof-only scan excludes its body edges', async () => {
    const root = { ...declarations[0], kind: 'def' }
    const client = { neighborhood: async (id: string) => id === root.id ? {
      root, nodes: new Map(declarations.map((item) => [item.id, item])),
      outgoing: [{ from: root.id, to: IDS.spec, type: 'def' }],
    } as Neighborhood : neighborhood(1) } as TheoremGraphClient
    const explorer = new Explorer(client, () => {})
    explorer.setup(root, ['proof'])
    explorer.start()
    await vi.waitFor(() => expect(explorer.states.get('proof')?.completionReason).toBe('exhausted'))
    const state = explorer.states.get('proof')!
    expect(state.visited.size).toBe(1)
    expect(state.rootDefinitionEdges).toBe(1)
    expect(state.edges).toHaveLength(0)

    explorer.setup(root, ['body'])
    explorer.start()
    await vi.waitFor(() => expect(explorer.states.get('body')?.completionReason).toBe('exhausted'))
    expect(explorer.states.get('body')?.discovered.has(IDS.spec)).toBe(true)
  })
  it('retrouve le chemin de Classical.em vers Classical.choice seulement avec def', async () => {
    const proof = await run('proof')
    expect(proof.status).toBe('complete')
    expect(proof.discovered.has(IDS.choice)).toBe(false)
    const body = await run('body')
    expect(body.status).toBe('complete')
    expect(findWitness(body, target)?.map((step) => [step.name, step.via])).toEqual([
      ['Classical.em', undefined],
      ['Classical.choose_spec', 'proof'],
      ['Classical.indefiniteDescription', 'proof'],
      ['Classical.choice', 'def'],
    ])
  })
  it('conserve un état incomplet sur erreur API', async () => {
    const state = await run('body', IDS.spec)
    expect(state.status).toBe('error')
    expect(state.frontier).toContain(IDS.spec)
    expect(findWitness(state, target)).toBeNull()
  })
  it('ignores signature edges and terminates on a proof cycle', async () => {
    const root = declarations[0]
    const proof = declarations[1]
    const signatureOnly = declarations[2]
    const fetched: string[] = []
    const client = { neighborhood: async (id: string) => {
      fetched.push(id)
      return id === root.id ? {
        root, nodes: new Map(declarations.map((item) => [item.id, item])),
        outgoing: [{ from: root.id, to: proof.id, type: 'proof' }, { from: root.id, to: signatureOnly.id, type: 'sig' }],
      } as Neighborhood : {
        root: proof, nodes: new Map(declarations.map((item) => [item.id, item])),
        outgoing: [{ from: proof.id, to: root.id, type: 'proof' }],
      } as Neighborhood
    } } as TheoremGraphClient
    const explorer = new Explorer(client, () => {})
    explorer.setup(root, ['proof'])
    explorer.start()
    await vi.waitFor(() => expect(explorer.states.get('proof')?.completionReason).toBe('exhausted'))
    const state = explorer.states.get('proof')!
    expect(fetched).toEqual([root.id, proof.id])
    expect(state.discovered.has(signatureOnly.id)).toBe(false)
    expect(state.edges).toHaveLength(2)
  })
  it('arrête les appels dès que tous les témoins demandés sont observés', async () => {
    const visited: string[] = []
    const client = { neighborhood: async (id: string) => {
      visited.push(id)
      if (id === IDS.em) return {
        root: declarations[0], nodes: new Map(declarations.map((item) => [item.id, item])),
        outgoing: [{ from: IDS.em, to: IDS.choice, type: 'proof' }, { from: IDS.em, to: IDS.spec, type: 'proof' }],
      }
      return neighborhood(1)
    } } as TheoremGraphClient
    const objective: Objective = { id: 'choice-proof-test', original: 'Classical.choice', kind: 'named', target: 'Classical.choice', policy: 'proof', interpretation: '', capability: 'exact' }
    const state = await new Promise<TraversalState>((resolve) => {
      const explorer = new Explorer(client, (states) => {
        const current = states.get('proof')
        if (current?.status === 'complete') resolve(current)
      })
      explorer.setup(declarations[0], ['proof'], [objective])
      explorer.start()
    })
    expect(state.completionReason).toBe('witnesses')
    expect(state.frontier).toContain(IDS.spec)
    expect(visited).toEqual([IDS.em])
    expect(state.edges).toHaveLength(2)
    expect(findWitness(state, objective)?.map((step) => step.name)).toEqual(['Classical.em', 'Classical.choice'])
  })
  it('ne déclare une absence que si la clôture a été épuisée', async () => {
    const state = await run('proof')
    expect(state.completionReason).toBe('exhausted')
  })
  it('attend tous les objectifs d’une même politique avant de s’arrêter', async () => {
    const calls: string[] = []
    const graph = new Map([
      [IDS.em, neighborhood(0, { index: 1, type: 'proof' })],
      [IDS.spec, neighborhood(1, { index: 2, type: 'proof' })],
      [IDS.indefinite, neighborhood(2)],
    ])
    const client = { neighborhood: async (id: string) => {
      calls.push(id)
      return graph.get(id)!
    } } as TheoremGraphClient
    const objectives: Objective[] = [IDS.spec, IDS.indefinite].map((id) => ({
      id, original: declarations.find((item) => item.id === id)!.name,
      kind: 'named', target: declarations.find((item) => item.id === id)!.name,
      policy: 'proof', interpretation: '', capability: 'exact',
    }))
    const state = await new Promise<TraversalState>((resolve) => {
      const explorer = new Explorer(client, (states) => {
        const current = states.get('proof')
        if (current?.completionReason === 'witnesses') resolve(current)
      })
      explorer.setup(declarations[0], ['proof'], objectives)
      explorer.start()
    })
    expect(calls).toEqual([IDS.em, IDS.spec])
    expect(state.frontier).toContain(IDS.indefinite)
  })
  it('permet de poursuivre le graphe après un arrêt sur témoin', async () => {
    const visited: string[] = []
    const client = { neighborhood: async (id: string) => {
      visited.push(id)
      return id === IDS.em ? neighborhood(0, { index: 1, type: 'proof' }) : neighborhood(1)
    } } as TheoremGraphClient
    const objective = interpretObjective('Classical.choose_spec')!
    let explorer!: Explorer
    let first!: TraversalState
    const finished = new Promise<TraversalState>((resolve) => {
      explorer = new Explorer(client, (states) => {
        const state = states.get('proof')
        if (state?.completionReason === 'witnesses' && !first) {
          first = state
          setTimeout(() => explorer.continueAfterWitness('proof'), 0)
        }
        if (state?.completionReason === 'exhausted') resolve(state)
      })
    })
    explorer.setup(declarations[0], ['proof'], [objective])
    explorer.start()
    const state = await finished
    expect(visited).toEqual([IDS.em, IDS.spec])
    expect(state.visited.size).toBe(2)
  })
  it('arrête un voisin lent dès que son concurrent révèle le témoin, puis peut le reprendre', async () => {
    const objective: Objective = { id: 'choice-proof-concurrent', original: 'Classical.choice', kind: 'named', target: 'Classical.choice', policy: 'proof', interpretation: '', capability: 'exact' }
    const started: string[] = []
    let slowAborted = false
    const client = { neighborhood: (id: string, signal?: AbortSignal) => {
      started.push(id)
      if (id === IDS.em) return Promise.resolve({
        root: declarations[0], nodes: new Map(declarations.map((item) => [item.id, item])),
        outgoing: [{ from: IDS.em, to: IDS.spec, type: 'proof' }, { from: IDS.em, to: IDS.indefinite, type: 'proof' }],
      } as Neighborhood)
      if (id === IDS.spec) return new Promise<Neighborhood>((resolve, reject) => {
        signal?.addEventListener('abort', () => { slowAborted = true; reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
        setTimeout(() => resolve(neighborhood(1)), 150)
      })
      return Promise.resolve(neighborhood(2, { index: 3, type: 'proof' }))
    } } as TheoremGraphClient
    const explorer = new Explorer(client, () => {})
    explorer.setup(declarations[0], ['proof'], [objective])
    explorer.start()
    await vi.waitFor(() => expect(explorer.states.get('proof')?.completionReason).toBe('witnesses'))
    const state = explorer.states.get('proof')!
    expect(started).toEqual([IDS.em, IDS.spec, IDS.indefinite])
    expect(slowAborted).toBe(true)
    expect(state.frontier).toContain(IDS.spec)
    expect(state.visited.has(IDS.spec)).toBe(false)
    explorer.cancel()
  })
})

describe('requêtes partagées et annulation', () => {
  it('garde une requête utile à un autre consommateur, puis annule la dernière', async () => {
    const originalFetch = globalThis.fetch
    let underlyingSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string, options: RequestInit) => {
      underlyingSignal = options.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => underlyingSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    try {
      const client = new TheoremGraphClient()
      const first = new AbortController()
      const second = new AbortController()
      const a = client.neighborhood(IDS.em, first.signal)
      const b = client.neighborhood(IDS.em, second.signal)
      first.abort()
      await expect(a).rejects.toMatchObject({ name: 'AbortError' })
      expect(underlyingSignal?.aborted).toBe(false)
      second.abort()
      await expect(b).rejects.toMatchObject({ name: 'AbortError' })
      expect(underlyingSignal?.aborted).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
  it('réessaie un HTTP 429 avec Retry-After borné', async () => {
    const originalFetch = globalThis.fetch
    const payload = { root: { statement_id: IDS.em, name: 'Classical.em' }, nodes: [], edges: [] }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const client = new TheoremGraphClient()
      expect((await client.neighborhood(IDS.em)).root.name).toBe('Classical.em')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(client.cacheStats().rateLimits).toBe(1)
    } finally { globalThis.fetch = originalFetch }
  })
})
