import type { Objective, Policy } from './domain'

const LEAN_NAME = /^[A-Za-z_][A-Za-z0-9_'.]*(?:\.[A-Za-z_][A-Za-z0-9_']*)*$/

export const SUGGESTIONS = [
  { label: 'Axiome du choix', value: 'axiome du choix', caption: 'Chemin vers Classical.choice' },
  { label: 'Récurrence', value: 'récurrence', caption: 'Non déterminable en V1' },
  { label: 'Analyse par cas', value: 'analyse par cas', caption: 'Non déterminable en V1' },
  { label: 'Raisonnement par l’absurde', value: 'raisonnement par l’absurde', caption: 'Non déterminable' },
]

function make(original: string, kind: Objective['kind'], interpretation: string, capability: Objective['capability'], target?: string, policy?: Policy): Objective {
  return { id: crypto.randomUUID(), original, kind, target, policy, interpretation, capability }
}

export function interpretObjective(raw: string): Objective | null {
  const original = raw.trim()
  if (!original) return null
  const normalized = original.toLocaleLowerCase('fr').replace(/[’']/g, "'")

  if (/\b(axiome du choix|axiom of choice|classical\.choice)\b/i.test(normalized)) {
    return make(original, 'named', 'Chercher Classical.choice dans les références de preuve et les corps de définitions.', 'exact', 'Classical.choice', 'body')
  }
  if (/\b(récurrence|recurrence|induction|récursi\w*|recursi\w*)\b/i.test(normalized)) {
    return make(original, 'induction', 'Le graphe TheoremGraph ne permet pas d’attribuer de façon fiable une récurrence au théorème.', 'unavailable')
  }
  if (/\b(analyse par cas|disjonction de cas|case split|cases?)\b/i.test(normalized)) {
    return make(original, 'cases', 'Les dépendances ne révèlent pas de façon fiable une analyse par cas dans la preuve.', 'unavailable')
  }
  if (/\b(absurde|contraposition|contradiction|by_contra)\b/i.test(normalized)) {
    return make(original, 'absurd', 'La présence d’une constante comme False.elim ne prouve pas que l’auteur a raisonné par l’absurde.', 'unavailable')
  }

  const bodyMatch = original.match(/^(?:définitions? (?:vers|jusqu['’]à)|corps (?:vers|jusqu['’]à)|proof\s*\+\s*def\s*:?)\s+([A-Za-z_][A-Za-z0-9_'.]*)$/i)
  if (bodyMatch) {
    return make(original, 'named', `Chercher ${bodyMatch[1]} en suivant les arêtes proof et def.`, 'exact', bodyMatch[1], 'body')
  }
  const named = original.match(/^(?:(?:dépend(?:ance)?\s+(?:de|à)|utilise|cherche(?:r)?|référence(?:r)?)\s+)?(?:la\s+déclaration\s+)?`?([A-Za-z_][A-Za-z0-9_'.]*)`?\??$/i)
  if (named && LEAN_NAME.test(named[1]) && (named[1].includes('.') || /^(propext|Quot\.sound|False\.elim)$/.test(named[1]))) {
    return make(original, 'named', `Chercher une référence exacte à ${named[1]} dans la chaîne des preuves.`, 'exact', named[1], 'proof')
  }
  return make(original, 'unknown', 'Aucun détecteur V1 fiable ne correspond à cette formulation. Précisez un nom Lean complet, par exemple Nat.zero_add.', 'unavailable')
}

export function objectiveKey(objective: Objective): string {
  return [objective.kind, objective.target ?? '', objective.policy ?? '', objective.original.toLocaleLowerCase('fr')].join('|')
}
