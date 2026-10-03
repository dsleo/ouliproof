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
  rootId: string
  rootSourceLabel?: string
  status: 'idle' | 'running' | 'paused' | 'complete' | 'limited' | 'error'
  completionReason?: 'witnesses' | 'exhausted'
  visited: Set<string>
  discovered: Set<string>
  edges: Edge[]
  names: Map<string, Declaration>
  parents: Map<string, { from: string; edge: string } | null>
  frontier: string[]
  requests: number
  elapsedMs: number
  rootDefinitionEdges: number
  error?: string
}

export const POLICY_LABEL: Record<Policy, string> = {
  proof: 'Proof references',
  body: 'Proofs and definitions',
}
