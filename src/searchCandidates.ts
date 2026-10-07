import type { Candidate } from './domain'

const LEAN_NAME = /^[A-Za-z_][A-Za-z0-9_']*(?:\.[A-Za-z_][A-Za-z0-9_']*)+$/

export function isLeanNameQuery(query: string): boolean {
  return LEAN_NAME.test(query.trim())
}

export function displayedCandidates(candidates: Candidate[], count: number, query: string): Candidate[] {
  const visible = candidates.slice(0, count)
  if (!isLeanNameQuery(query)) return visible
  const exact = candidates.find((candidate) => !candidate.loading && !candidate.error && candidate.name === query.trim())
  const shown = exact && !visible.some((candidate) => candidate.id === exact.id) ? [exact, ...visible] : visible
  return shown.sort((a, b) => Number(b.id === exact?.id) - Number(a.id === exact?.id))
}
