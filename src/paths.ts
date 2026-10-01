import type { Declaration, PathStep, TraversalState } from './domain'

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
  if (cursor) return []
  const path = steps.reverse()
  for (let index = 1; index < path.length; index++) {
    const step = path[index]
    if (!state.edges.some((edge) => edge.from === path[index - 1].id && edge.to === step.id && edge.type === step.via)) return []
  }
  return path
}
