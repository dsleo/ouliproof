import { describe, expect, it } from 'vitest'
import { Explorer, freshState } from './explorer'
import type { Neighborhood } from './domain'
import { TheoremGraphClient } from './api'
import { findEvidence, parseMethodIndex, primaryEvidence, type MethodIndex } from './methods'
import { interpretObjective } from './objectives'

const index: MethodIndex = {
  schemaVersion: 1, detectorVersion: 'methods-1', source: 'MathNetwork/MathlibGraph/tactic_usage.ndjson',
  datasetRevision: '8c706461fe266802197b62af324de12a3f1aa7fb', mathlibCommit: '534cf0b8f5267c3f20bf52f932ad5f9834187c35', mathlibCommitStatus: 'resolved',
  sourceSha256: '3927807af5920b626b687565f415233219df017b5b1555a074a073809bff4f84', sourceRows: 235586,
  markers: {
    'Submodule.pow_toAddSubmonoid': { kind: 'theorem', module: 'Mathlib.Algebra.Algebra.Operations', matches: { induction: ['induction'], cases: ['cases'] } },
    'Submonoid.closure_irreducible': { kind: 'theorem', module: 'Mathlib.Algebra.AffineMonoid.Irreducible', matches: { absurd: ['by_contra'] } },
    'Related.rcases': { kind: 'theorem', module: 'Mathlib.Test', matches: { cases: ['rcases'] } },
  },
}

function state(rootName: string, targetName: string, sourceLabel = 'Mathlib_v427', edgeType = 'proof') {
  const root = { id: 'root', name: rootName, kind: 'theorem', sourceLabel }
  const target = { id: 'target', name: targetName, kind: 'theorem', sourceLabel }
  const result = freshState(edgeType === 'def' ? 'body' : 'proof', root)
  result.discovered.add(target.id)
  result.visited.add(root.id)
  result.visited.add(target.id)
  result.names.set(target.id, target)
  result.parents.set(target.id, { from: root.id, edge: edgeType })
  result.edges.push({ from: root.id, to: target.id, type: edgeType })
  return result
}

describe('method evidence', () => {
  it('reads the pinned method-index manifest and rejects other revisions', () => {
    expect(parseMethodIndex(index).markers['Submodule.pow_toAddSubmonoid'].matches.induction).toEqual(['induction'])
    expect(() => parseMethodIndex({ ...index, datasetRevision: 'main' })).toThrow(/version/)
  })
  it('reports a tactic in the selected proof and an indirect dependency as separate locations', () => {
    const objective = interpretObjective('induction')!
    const root = state('Submodule.pow_toAddSubmonoid', 'Other')
    expect(findEvidence(root, objective, index)[0]).toMatchObject({ source: 'MathlibGraph', location: 'root', grade: 'lead', joinStatus: 'different-version' })
    const indirect = state('Other', 'Submodule.pow_toAddSubmonoid', 'Mathlib_v428')
    expect(findEvidence(indirect, objective, index)[0]).toMatchObject({ matchedToken: 'induction', location: 'dependency', joinStatus: 'unverified' })
    const unlabelled = state('Other', 'Submodule.pow_toAddSubmonoid', '')
    expect(findEvidence(unlabelled, objective, index)[0]).toMatchObject({ joinStatus: 'unverified', graphSourceLabel: '' })
  })
  it('keeps ex falso and destructuring as related evidence rather than satisfying stronger questions', () => {
    const absurd = interpretObjective('proof by contradiction')!
    const exfalso = state('Root', 'False.elim')
    expect(findEvidence(exfalso, absurd)[0]).toMatchObject({ grade: 'related', ruleId: 'false-elimination' })
    expect(primaryEvidence(exfalso, absurd)).toBeUndefined()
    const cases = interpretObjective('case analysis')!
    expect(findEvidence(state('Root', 'Related.rcases'), cases, index)[0].grade).toBe('related')
  })
  it('finds reviewed graph primitives without source-level tactic metadata', () => {
    expect(primaryEvidence(state('Root', 'Or.elim'), interpretObjective('case analysis')!)).toMatchObject({ grade: 'observed', source: 'TheoremGraph', ruleId: 'or-elimination' })
    const induction = state('Root', 'Nat.recAux')
    induction.names.set('target', { id: 'target', name: 'Nat.recAux', body: 'Nat.recAux (zero : motive 0) (succ : (n : Nat) → motive n → motive (n + 1)) (t : Nat) : motive t' })
    expect(primaryEvidence(induction, interpretObjective('induction')!)).toMatchObject({ grade: 'observed', source: 'TheoremGraph', ruleId: 'nat-rec-aux' })
    const cases = state('Root', 'Nat.casesAuxOn')
    cases.names.set('target', { id: 'target', name: 'Nat.casesAuxOn', body: 'Nat.casesAuxOn (zero : motive 0) (succ : (n : Nat) → motive (n + 1)) : motive t' })
    expect(primaryEvidence(cases, interpretObjective('case analysis')!)).toMatchObject({ grade: 'observed', source: 'TheoremGraph', ruleId: 'nat-cases-aux' })
    expect(primaryEvidence(state('Root', 'Decidable.byContradiction'), interpretObjective('proof by contradiction')!)).toMatchObject({ grade: 'observed', source: 'TheoremGraph' })
  })
  it('rejects a recorded tactic when the declaration kind conflicts', () => {
    const result = state('Root', 'Submodule.pow_toAddSubmonoid')
    result.names.set('target', { id: 'target', name: 'Submodule.pow_toAddSubmonoid', kind: 'definition' })
    expect(findEvidence(result, interpretObjective('induction')!, index)).toEqual([])
  })
  it('joins equivalent theorem kind labels used by the two APIs', () => {
    const result = state('Other', 'Submodule.pow_toAddSubmonoid')
    result.names.set('target', { id: 'target', name: 'Submodule.pow_toAddSubmonoid', kind: 'thm' })
    expect(findEvidence(result, interpretObjective('induction')!, index)).toMatchObject([{ source: 'MathlibGraph', matchedToken: 'induction' }])
  })
  it('checks a discovered recursor signature before stopping on a cross-version tactic lead', async () => {
    const root = { id: 'root', name: 'Submodule.pow_toAddSubmonoid', kind: 'theorem', sourceLabel: 'Mathlib_v427' }
    const recursor = { id: 'rec', name: 'Nat.recAux', kind: 'definition', sourceLabel: 'Mathlib_v427', body: 'Nat.recAux (zero : motive 0) (succ : (n : Nat) → motive n → motive (n + 1)) (t : Nat) : motive t' }
    const fetched: string[] = []
    const client = { neighborhood: async (id: string) => {
      fetched.push(id)
      return id === 'root' ? { root, nodes: new Map([['root', root], ['rec', recursor]]), outgoing: [{ from: 'root', to: 'rec', type: 'proof' }] } as Neighborhood
        : { root: recursor, nodes: new Map([['rec', recursor]]), outgoing: [] } as Neighborhood
    } } as TheoremGraphClient
    const objective = interpretObjective('induction')!
    const explorer = new Explorer(client, () => {})
    explorer.setup(root, ['proof'], [objective], index)
    explorer.start()
    await new Promise<void>((resolve) => {
      const check = () => explorer.states.get('proof')?.completionReason === 'witnesses' ? resolve() : setTimeout(check, 1)
      check()
    })
    expect(fetched).toEqual(['root', 'rec'])
    expect(primaryEvidence(explorer.states.get('proof'), objective, index)).toMatchObject({ source: 'TheoremGraph', ruleId: 'nat-rec-aux' })
  })
  it('does not stop merely because a cross-source tactic lead was found', async () => {
    const root = { id: 'root', name: 'Submodule.pow_toAddSubmonoid', kind: 'theorem', sourceLabel: 'Mathlib_v427' }
    const next = { id: 'next', name: 'Other', kind: 'theorem', sourceLabel: 'Mathlib_v427' }
    const fetched: string[] = []
    const client = { neighborhood: async (id: string) => {
      fetched.push(id)
      return id === 'root' ? { root, nodes: new Map([['root', root], ['next', next]]), outgoing: [{ from: 'root', to: 'next', type: 'proof' }] } as Neighborhood
        : { root: next, nodes: new Map([['next', next]]), outgoing: [] } as Neighborhood
    } } as TheoremGraphClient
    const explorer = new Explorer(client, () => {})
    explorer.setup(root, ['proof'], [interpretObjective('induction')!], index)
    explorer.start()
    await new Promise<void>((resolve) => {
      const check = () => explorer.states.get('proof')?.completionReason === 'exhausted' ? resolve() : setTimeout(check, 1)
      check()
    })
    expect(fetched).toEqual(['root', 'next'])
    expect(explorer.states.get('proof')?.completionReason).toBe('exhausted')
  })
})
