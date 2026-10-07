import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuestionCard, storyHeadline } from './Findings'
import { freshState } from './explorer'
import { interpretObjective } from './objectives'
import type { MethodIndex } from './methods'
import type { Declaration } from './domain'

const root: Declaration = { id: 'root', name: 'Submodule.pow_toAddSubmonoid', kind: 'theorem', sourceLabel: 'Mathlib_v427' }
const index: MethodIndex = {
  schemaVersion: 1, detectorVersion: 'methods-1', source: 'MathNetwork/MathlibGraph/tactic_usage.ndjson',
  datasetRevision: '8c706461fe266802197b62af324de12a3f1aa7fb', mathlibCommit: '534cf0b8f5267c3f20bf52f932ad5f9834187c35', mathlibCommitStatus: 'resolved',
  sourceSha256: '3927807af5920b626b687565f415233219df017b5b1555a074a073809bff4f84', sourceRows: 235586,
  markers: { [root.name]: { kind: 'theorem', module: 'Mathlib.Algebra.Algebra.Operations', matches: { induction: ['induction'] } } },
}

describe('finding cards', () => {
  it('keeps the source revision and API interruption visible for a tactic lead', () => {
    const state = freshState('proof', root)
    state.visited.add(root.id)
    state.status = 'error'
    state.error = 'The API returned HTTP 503.'
    const onResume = vi.fn()
    render(<QuestionCard objective={interpretObjective('induction')!} state={state} theorem={root} index={index} indexStatus="ready" onInspect={() => {}} onIncludeDefinitions={() => {}} onResume={onResume} />)
    expect(screen.getByText('Cross-version lead')).toBeTruthy()
    expect(screen.getByText(index.mathlibCommit)).toBeTruthy()
    expect(screen.getByText(root.sourceLabel!)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('HTTP 503')
    fireEvent.click(screen.getByRole('button', { name: 'Resume exploration' }))
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('preserves the separate tactic signal behind a graph witness', () => {
    const state = freshState('proof', root)
    const recursor: Declaration = { id: 'recursor', name: 'Nat.recAux', body: 'Nat.recAux (zero : motive 0) (succ : (n : Nat) → motive n → motive (n + 1)) (t : Nat) : motive t' }
    state.visited.add(root.id)
    state.visited.add(recursor.id)
    state.discovered.add(recursor.id)
    state.names.set(recursor.id, recursor)
    state.parents.set(recursor.id, { from: root.id, edge: 'proof' })
    state.edges.push({ from: root.id, to: recursor.id, type: 'proof' })
    state.status = 'complete'
    state.completionReason = 'witnesses'
    render(<QuestionCard objective={interpretObjective('induction')!} state={state} theorem={root} index={index} indexStatus="ready" onInspect={() => {}} onIncludeDefinitions={() => {}} onResume={() => {}} />)
    expect(screen.getByText('Graph witness')).toBeTruthy()
    expect(screen.getByText('Other evidence (1)')).toBeTruthy()
    expect(screen.getByText('Possible tactic signal')).toBeTruthy()
  })

  it('leads with a one-sentence answer, hedged for tactic leads', () => {
    const path = [{ id: 'root', name: root.name }, { id: 'recursor', name: 'Nat.recAux', via: 'proof' }]
    const base = { id: 'e', category: 'induction', source: 'TheoremGraph', ruleId: 'r', matchedName: 'Nat.recAux', explanation: '', location: 'dependency', path } as const
    const objective = interpretObjective('induction')!
    expect(storyHeadline({ ...base, grade: 'observed' }, objective)).toBe('Induction enters through Nat.recAux, 1 step down.')
    expect(storyHeadline({ ...base, grade: 'lead' }, objective)).toContain('may be used')
  })
})
