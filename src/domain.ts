export type Policy = 'proof' | 'body'
export type ObjectiveKind = 'named' | 'induction' | 'cases' | 'absurd' | 'unknown'

export interface Objective {
  id: string
  original: string
  kind: ObjectiveKind
  target?: string
  policy?: Policy
  interpretation: string
  capability: 'exact' | 'hint' | 'unavailable'
}

export interface Declaration {
  id: string
  name: string
  kind?: string
  body?: string
  slogan?: string
  source?: string
  sourceLabel?: string
}

export interface Edge {
  from: string
  to: string
  type: string
}

export interface Neighborhood {
  root: Declaration
  nodes: Map<string, Declaration>
  outgoing: Edge[]
}

export interface Candidate extends Declaration {
  score: number
  loading?: boolean
  error?: string
}

export interface PathStep {
  id: string
  name: string
  via?: string
}

export interface TraversalState {
  policy: Policy
  status: 'idle' | 'running' | 'paused' | 'complete' | 'limited' | 'error'
  visited: Set<string>
  discovered: Set<string>
  names: Map<string, Declaration>
  parents: Map<string, { from: string; edge: string } | null>
  frontier: string[]
  requests: number
  elapsedMs: number
  error?: string
}

export const POLICY_LABEL: Record<Policy, string> = {
  proof: 'Références de preuve',
  body: 'Preuves et définitions',
}
