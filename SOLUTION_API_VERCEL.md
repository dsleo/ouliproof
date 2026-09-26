# Ouliproof — solution TheoremGraph par API

**Date :** 26 septembre 2026  
**Décision technique recommandée :** héberger l'application statique sur Vercel et réécrire deux routes vers l'API TheoremGraph. Aucun export, constructeur de graphe ou serveur applicatif n'est nécessaire pour la V1.  
**Statut :** faisabilité réseau démontrée ; V1 développée et testée localement (voir [README](README.md) et [essais réels](TESTS_REELS.md)). Déploiement permanent et limites de service à mesurer avant ouverture publique.

## 1. Pourquoi ce choix

L'appel direct `fetch` depuis une origine GitHub Pages a été refusé par CORS lors de [l'étude](ETUDE_FAISABILITE_THEOREMGRAPH.md). Vercel permet une **réécriture vers une origine externe** : le navigateur demande `/tg/...` sur le domaine du site, et Vercel transmet la requête à `api.theoremsearch.com`. Cette fonction de routage est déclarative dans `vercel.json` ; aucune fonction Vercel ni base de données n'est requise.

```text
Navigateur → même origine Vercel /tg/graph/…
                       │ réécriture Vercel
                       ▼
             api.theoremsearch.com/graph/…
```

L'application et son accès API doivent être publiés **sur le même domaine Vercel**. Héberger l'interface sur GitHub Pages et seulement le relais sur Vercel réintroduirait un appel entre origines et demanderait de gérer CORS sur le relais. GitHub peut rester le dépôt de code ; Vercel sert le site.

## 2. Preuve de faisabilité exécutée

Prototype reproductible : [`feasibility/vercel-api-poc`](feasibility/vercel-api-poc). Déployé avec `vercel deploy --temporary --yes` sans session Vercel connectée ; l'URL provisoire expire au bout d'une heure. Aucun accès permanent à un compte Vercel n'a été utilisé.

| Test depuis l'URL Vercel temporaire | Résultat observé |
| --- | --- |
| Navigateur : recherche `/tg/graph/embedding?query=Nat.add_comm&n_results=2&formality=formal` | HTTP 200, `application/json`, clé `results`, 7,9 s au premier essai. |
| Navigateur : voisinage `/tg/graph/statement/{id}?direction=src&formality=formal` | HTTP 200, `application/json`, clés `root`, `nodes`, `edges`, 0,7 s. |
| `curl` via Vercel, racines `Nat.add_comm` et `Classical.em` | HTTP 200 ; 14 396 et 22 908 octets ; 0,8 et 1,2 s pendant cette mesure. |

Contrôle complémentaire le 26 septembre sur un second déploiement temporaire, avec [`check_live.py`](feasibility/vercel-api-poc/check_live.py) : **6 requêtes, 6 arêtes vérifiées**. Les chemins `Classical.em → Classical.choice` (`proof`, `proof`, `def`), `Nat.add_eq_zero → Classical.choice` (`proof`, `def`) et `Nat.add_comm → Nat.zero_add` (`proof`) sont tous retournés par l'API à travers Vercel, avec les noms et types d'arêtes attendus. L'URL du premier déploiement avait expiré avant ce second contrôle, conformément à sa durée de vie annoncée.

Les temps sont des observations ponctuelles, pas un engagement de performance. La recherche sémantique avait aussi pris jusqu'à environ 25 s dans l'étude préalable ; l'interface doit donc prévoir un état d'attente et un délai d'expiration distinct du parcours du graphe.

## 3. Configuration minimale validée

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "rewrites": [
    {
      "source": "/tg/graph/embedding",
      "destination": "https://api.theoremsearch.com/graph/embedding"
    },
    {
      "source": "/tg/graph/statement/:id",
      "destination": "https://api.theoremsearch.com/graph/statement/:id"
    }
  ]
}
```

Le code client appelle uniquement ces chemins relatifs avec `fetch`. Il construit les paramètres avec `URLSearchParams` et encode l'UUID dans le chemin. Pour une recherche, utiliser `formality=formal` et afficher plusieurs candidats. Pour explorer ce qu'une déclaration utilise, appeler le voisinage avec `direction=src&formality=formal`. Le prototype conserve volontairement deux routes précises plutôt qu'un proxy générique.

## 4. Parcours utilisateur et champ « Que détecter ? »

Le formulaire présente **simultanément deux champs** : « Quel théorème ou résultat ? » (nom Lean ou description mathématique) et « Que voulez-vous détecter dans ses dépendances ? ». Le second accepte plusieurs objectifs, choisis parmi des suggestions ou saisis par l'utilisateur. Exemples visibles : « l'axiome du choix », « une dépendance à `Nat.zero_add` », « une récurrence », « un raisonnement par l'absurde ». La saisie libre sert à formuler une demande ; elle ne transforme pas à elle seule la demande en détecteur fiable.

La recherche du théorème est sémantique. Après la réponse de l'API, afficher les candidats avec leur **nom Lean complet vérifié par le voisinage**, leur provenance et le résumé ou énoncé disponible. L'utilisateur doit **confirmer explicitement le théorème**, y compris si un seul candidat est affiché. Aucun parcours de clôture ne commence avant cette confirmation. Si les noms ou résumés ne permettent pas de distinguer les candidats, demander de reformuler la recherche ; ne jamais choisir automatiquement le premier résultat. Une fois le théorème confirmé, l'utilisateur peut ajouter ou retirer des objectifs sans perdre les voisinages déjà chargés pendant la session.

Avant de lancer l'analyse, chaque objectif est présenté sous sa **forme interprétée**, avec la politique de parcours et le niveau de réponse possible. L'utilisateur peut corriger cette interprétation. Catalogue V1 initial :

| Demande formulée | Interprétation V1 | Niveau affiché |
| --- | --- | --- |
| « Dépend-elle de la déclaration Lean `X` ? » | Correspondance exacte du nom Lean de `X` parmi les déclarations atteintes en suivant `proof`. Une saisie libre de nom complet est admise. | Référence observée et chemin `proof`, ou aucun témoin observé si exploration complète. |
| « Les définitions atteintes mènent-elles à `X` ? » | Correspondance exacte du nom Lean de `X` en suivant `proof + def`, avec types d'arêtes montrés. | Chemin observé, distinct du parcours `proof`. |
| « Utilise-t-elle l'axiome du choix ? » | Recherche de la constante nommée `Classical.choice` par `proof + def`. | Témoin nommé et chemin ; aucune équivalence avec `#print axioms`. |
| « Y a-t-il une récurrence / analyse par cas ? » | Question de raisonnement associée aux indices éventuellement validés dans le catalogue. | « Indice observé » ou « non déterminable » ; jamais preuve de la tactique ni conclusion négative générale. |
| « L'auteur a-t-il utilisé l'absurde, une tactique précise ou un autre procédé non relié à un détecteur validé ? » | Aucune règle fiable dans TheoremGraph V1. | « Non déterminable avec cette source », sans lancer de parcours inutile pour cette seule question. |

Les suggestions sont un petit catalogue local de règles et libellés, **pas une base de données du graphe**. Une demande libre reconnue comme nom Lean complet devient une recherche de constante nommée ; une formulation ambiguë ou hors catalogue reçoit « non déterminable » avec la raison. Le système ne doit ni convertir silencieusement « raisonnement par l'absurde » en simple présence de `False.elim`, ni faire passer un indice de récursion pour une preuve d'induction. Les questions reconnues de différentes politiques peuvent partager les réponses API en cache, tout en conservant **des parcours et des états de complétude distincts**.

Chaque carte de réponse rappelle la demande originale, l'interprétation retenue, le théorème confirmé, la politique de parcours, le témoin et son chemin, ainsi que l'état `en cours` / `terminée` / `limitée` / `en erreur`. Un témoin positif peut apparaître avant la fin ; un résultat négatif exige une exploration effectivement complète selon la politique concernée.

**Scénarios d'acceptation de ce parcours :**

1. L'utilisateur écrit « `Nat.add_comm` » et « dépend de `Nat.zero_add` » : le résultat pertinent peut apparaître plus bas dans la liste ; aucun voisinage transitif n'est parcouru avant sa confirmation, puis la carte affiche le chemin `proof`.
2. L'utilisateur choisit `Classical.em` et « axiome du choix » : la carte interprète la demande comme `Classical.choice` en `proof + def` et affiche le chemin typé observé.
3. L'utilisateur choisit « récurrence » : la carte annonce dès la saisie qu'un verdict fiable sur le raisonnement n'est pas disponible dans la V1 TheoremGraph. Une autre question détectable sélectionnée en même temps continue normalement.
4. L'utilisateur écrit « raisonnement par l'absurde » ou une demande libre non reconnue : aucune règle n'est inventée, la limite est expliquée et l'utilisateur peut préciser un nom Lean à rechercher.
5. Un échec API ou un budget atteint laisse chaque question concernée dans un état incomplet ; l'interface ne déduit pas une absence de témoin.

## 5. Contrat de développement à conserver

1. **Sélection du résultat.** `/graph/embedding` est une recherche *sémantique*. `Nat.add_comm` n'est pas garanti en première position et son `name` peut être générique (`Thm`, `Inst`). Le vrai nom de déclaration peut être récupéré dans `root.name` après un appel `/graph/statement/{id}`. Afficher les candidats et exiger une confirmation ; ne pas annoncer une recherche exacte fiable avec cette seule API.
2. **Exploration.** Consommer le schéma réellement observé `{root,nodes,edges}` ; normaliser les arêtes et vérifier leur sens sur les fixtures existantes. Dédupliquer les UUID et mettre en cache les voisinages pendant la session. Limiter la concurrence et le nombre de requêtes ; permettre l'arrêt et signaler toute exploration tronquée ou erreur HTTP.
3. **Interprétation.** Garder séparés `proof` et `proof + def`. `Classical.em` atteint `Classical.choice` seulement avec `def` dans les exemples déjà étudiés. Un chemin TheoremGraph n'est pas un certificat Lean `#print axioms`. Ne jamais inférer une tactique ou l'absence d'induction à partir d'une absence de chemin.
4. **Réponses.** Chaque réponse présente le nom et l'UUID du résultat, le type de chaque arête, la source TheoremGraph, le nombre de voisinages visités et l'état de complétude. Si le budget est atteint ou l'API échoue, le verdict négatif reste indisponible.
5. **Version des données.** Afficher la provenance renvoyée par l'API (`paper.external_id`/titre lorsqu'ils sont présents). L'API publique ne fournit pas, à ce jour dans notre test, de garantie de snapshot immuable pour toute une exploration. En cas de changement incohérent de métadonnées ou de graphe, signaler une exploration non comparable.

## 6. Lots courts pour coding agents

| Lot | Livrable | Acceptation |
| --- | --- | --- |
| A — Hébergement | Site statique Vercel et les deux réécritures validées ; configuration du dépôt GitHub relié à Vercel. | Sur une prévisualisation permanente, les deux appels sont HTTP 200 en JSON depuis le navigateur. |
| B — Adaptateur API | Types, validation légère, normalisation de `{root,nodes,edges}`, erreurs, annulation et cache de session. | Fixtures réelles `Nat.add_comm` et `Classical.em` ; 404/429/5xx/timeout visibles. |
| C — Parcours | BFS borné pour chaque politique `proof` et `proof + def`, réponses API en cache commun, parents, chemins et complétude séparés. | Les témoins étudiés sont retrouvés sans faux verdict négatif en exploration incomplète. |
| D — Interface et catalogue | Deux champs visibles dès l'entrée ; recherche et confirmation obligatoire du théorème ; suggestions, saisie de nom Lean et prévisualisation de chaque question interprétée ; cartes, progression, reprise/arrêt et partage. | Tests de confirmation explicite, questions multiples, demande libre non reconnue, récurrence non déterminable et navigateur mobile. |
| E — Validation | Tests sur prévisualisation et suivi des temps/erreurs sans données personnelles. | Budget de requêtes acceptable et textes de preuve relus avant publication. |

MathlibGraph reste un chantier V2 ciblé sur l'induction et les tactiques ; il ne conditionne pas la mise en place de l'API TheoremGraph en V1.

## 7. Limites et portes de décision

- **Recherche exacte par nom Lean :** pas démontrée par l'API actuelle. La V1 adopte la recherche sémantique avec confirmation explicite, y compris quand la requête ressemble à un nom Lean. Un éventuel endpoint de lookup exact reste une amélioration ultérieure.
- **Charge et disponibilité :** pas de contrat de quota ou de SLA vérifié pour l'API publique. Mesurer un corpus réaliste avant d'ouvrir largement le site ; traiter les 429, les erreurs transitoires et les délais élevés sans multiplier les appels agressivement.
- **Fidélité scientifique :** les données API peuvent changer. La provenance doit être visible ; une conclusion négative doit rester limitée au graphe et à l'exploration effectivement achevée.
- **Déploiement durable :** l'essai anonyme expire. Pour un site permanent, relier le dépôt à un projet Vercel sous le compte du propriétaire et déployer la même configuration. Le prototype ne constitue pas encore une mise en production.

## Sources

- [Documentation officielle Vercel : réécritures vers une origine externe](https://vercel.com/docs/routing/rewrites)
- [Documentation officielle TheoremSearch : recherche et voisinages](https://www.theoremsearch.com/docs)
- [Étude de faisabilité locale](ETUDE_FAISABILITE_THEOREMGRAPH.md)
