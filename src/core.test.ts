import { describe, expect, it } from 'vitest'
import { normalizeNeighborhood, TheoremGraphClient } from './api'
import type { Declaration, Neighborhood, TraversalState } from './domain'
import { Explorer, findWitness } from './explorer'
import { interpretObjective } from './objectives'

const IDS = {
  em: '46f9bdf2-6f17-43d0-9009-8485b2479ea2',
  spec: '24429694-bfba-471f-8323-65376ba97978',
  indefinite: '900586fb-f641-490a-88d5-e93467529e57',
  choice: '7b185410-dd7e-483a-b914-98d71aa2e23b',
}

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
  it('traduit un nom Lean exact en recherche de référence de preuve', () => {
    expect(interpretObjective('dépend de Nat.zero_add')).toMatchObject({ kind: 'named', target: 'Nat.zero_add', policy: 'proof' })
  })
  it('sépare la recherche de choix des questions de tactique', () => {
    expect(interpretObjective('axiome du choix')).toMatchObject({ target: 'Classical.choice', policy: 'body' })
    expect(interpretObjective('raisonnement par l’absurde')).toMatchObject({ capability: 'unavailable' })
    expect(interpretObjective('récurrence')).toMatchObject({ capability: 'unavailable' })
  })
})

describe('voisinage TheoremGraph', () => {
  it('ne suit que les arêtes sortant de la racine et refuse une cible sans nom', () => {
    const raw = {
      root: { statement_id: IDS.em, name: 'Classical.em', statement: { kind: 'theorem', paper_external_id: 'Mathlib_v427' } },
      nodes: [{ statement_id: IDS.spec, name: 'Classical.choose_spec' }, { statement_id: IDS.indefinite, name: 'Classical.indefiniteDescription' }],
      edges: [{ src_id: IDS.em, dep_id: IDS.spec, edge_type: 'proof' }, { src_id: IDS.spec, dep_id: IDS.indefinite, edge_type: 'proof' }],
    }
    const parsed = normalizeNeighborhood(raw, IDS.em)
    expect(parsed.outgoing).toEqual([{ from: IDS.em, to: IDS.spec, type: 'proof' }])
    expect(parsed.root.sourceLabel).toBe('Mathlib_v427')
    expect(() => normalizeNeighborhood({ ...raw, nodes: [] }, IDS.em)).toThrow(/omet le nom/)
  })
})

describe('parcours des dépendances', () => {
  const target = interpretObjective('axiome du choix')!
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
})
