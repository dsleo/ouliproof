import type { Objective, Policy } from './domain'

const LEAN_NAME = /^[A-Za-z_][A-Za-z0-9_'.]*(?:\.[A-Za-z_][A-Za-z0-9_']*)*$/

export const SUGGESTIONS = [
  { label: 'Axiom of choice', value: 'axiom of choice', caption: 'Path to Classical.choice' },
  { label: 'Induction', value: 'induction', caption: 'Cannot be determined' },
  { label: 'Case analysis', value: 'case analysis', caption: 'Cannot be determined' },
  { label: 'Proof by contradiction', value: 'proof by contradiction', caption: 'Cannot be determined' },
]

function make(original: string, kind: Objective['kind'], interpretation: string, capability: Objective['capability'], target?: string, policy?: Policy): Objective {
  return { id: crypto.randomUUID(), original, kind, target, policy, interpretation, capability }
}

export function interpretObjective(raw: string): Objective | null {
  const original = raw.trim()
  if (!original) return null
  const normalized = original.toLocaleLowerCase().replace(/[’']/g, "'")

  if (/\b(axiome du choix|axiom of choice|classical\.choice)\b/i.test(normalized)) {
    return make(original, 'named', 'Look for Classical.choice through proof references and definition bodies.', 'exact', 'Classical.choice', 'body')
  }
  if (/\b(récurrence|recurrence|induction|récursi\w*|recursi\w*)\b/i.test(normalized)) {
    return make(original, 'induction', 'TheoremGraph dependencies cannot reliably establish whether this proof uses induction.', 'unavailable')
  }
  if (/\b(analyse par cas|disjonction de cas|case analysis|case split|cases?)\b/i.test(normalized)) {
    return make(original, 'cases', 'Dependencies cannot reliably reveal case analysis in the proof.', 'unavailable')
  }
  if (/\b(absurde|contraposition|contradiction|by_contra)\b/i.test(normalized)) {
    return make(original, 'absurd', 'A reference to a constant such as False.elim does not establish that the author used proof by contradiction.', 'unavailable')
  }

  const bodyMatch = original.match(/^(?:définitions? (?:vers|jusqu['’]à)|corps (?:vers|jusqu['’]à)|definitions? (?:to|toward|towards)|proof\s*\+\s*def\s*:?)\s+([A-Za-z_][A-Za-z0-9_'.]*)$/i)
  if (bodyMatch) {
    return make(original, 'named', `Look for ${bodyMatch[1]} through proof and def edges.`, 'exact', bodyMatch[1], 'body')
  }
  const named = original.match(/^(?:(?:dépend(?:ance)?\s+(?:de|à)|utilise|cherche(?:r)?|référence(?:r)?|depends?\s+on|uses?|find|references?)\s+)?(?:(?:la|the)\s+(?:déclaration|declaration)\s+)?`?([A-Za-z_][A-Za-z0-9_'.]*)`?\??$/i)
  if (named && LEAN_NAME.test(named[1]) && (named[1].includes('.') || /^(propext|Quot\.sound|False\.elim)$/.test(named[1]))) {
    return make(original, 'named', `Look for an exact reference to ${named[1]} in the proof dependency chain.`, 'exact', named[1], 'proof')
  }
  return make(original, 'unknown', 'This request has no reliable detector yet. Enter a full Lean name, such as Nat.zero_add.', 'unavailable')
}

export function objectiveKey(objective: Objective): string {
  return [objective.kind, objective.target ?? '', objective.policy ?? '', objective.original.toLocaleLowerCase()].join('|')
}
