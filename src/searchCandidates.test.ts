import { describe, expect, it } from 'vitest'
import type { Candidate } from './domain'
import { displayedCandidates, isLeanNameQuery } from './searchCandidates'

describe('exact Lean-name search display', () => {
  it('promotes a resolved exact match without losing the first visible results', () => {
    const candidates: Candidate[] = Array.from({ length: 10 }, (_, index) => ({ id: String(index), name: `Other.${index}`, score: 1, loading: false }))
    candidates[8].name = 'Nat.add_comm'
    expect(isLeanNameQuery('Nat.add_comm')).toBe(true)
    expect(displayedCandidates(candidates, 5, 'Nat.add_comm').map((item) => item.id)).toEqual(['8', '0', '1', '2', '3', '4'])
    expect(displayedCandidates(candidates, 10, 'Nat.add_comm').filter((item) => item.id === '8')).toHaveLength(1)
  })
})
