# Étude de faisabilité — TheoremGraph pour Ouliproof

**Date :** 25 septembre 2026  
**Décision :** le graphe TheoremGraph est utile comme source de références vérifiables, mais **la V1 décrite dans `SPECIFICATION_REVISEE.md` ne doit pas être implémentée telle quelle**. L'API testée rejette l'origine GitHub Pages utilisée, et la traversée des seules arêtes `proof` manque un axiome que deux théorèmes testés utilisent effectivement.

## 1. Questions examinées

1. La recherche trouve-t-elle des déclarations Mathlib à partir d'un nom exact ou d'une phrase mathématique ?
2. Les voisinages permettent-ils de reconstruire des chemins de dépendances concrets ?
3. La règle « suivre uniquement `proof` » répond-elle correctement aux questions sur le choix, les principes classiques et l'induction ?
4. Une page statique GitHub Pages peut-elle appeler l'API directement ?
5. Les données sont-elles assez identifiées et stables pour une conclusion négative reproductible ?

## 2. Méthode et périmètre de l'essai

- API interrogée : `https://api.theoremsearch.com`, `GET /graph/embedding` et `GET /graph/statement/{id}?direction=src&formality=formal`.
- Six déclarations ont été parcourues sur les arêtes `proof`, par couches, avec cache partagé, 3 requêtes au maximum en parallèle, 80 nœuds traités au maximum par départ. Trois d'entre elles ont aussi été parcourues sur `proof + def`, avec une limite de 120 nœuds.
- Un nœud est identifié par son UUID. Pour chaque voisinage, seules les arêtes dont `src_id` est l'UUID demandé ont été retenues ; la réponse peut contenir aussi des arêtes entre d'autres nœuds.
- Le test d'axiomes indépendant a utilisé `lean 4.28.0` et `#print axioms` sur les noms correspondants. **La révision exacte Mathlib de l'API n'étant pas établie**, cette comparaison est une calibration de la sémantique, pas une égalité vérifiée entre deux instantanés.
- Les scripts, réponses normalisées et résultats bruts sont dans [feasibility](feasibility/). Les clôtures indiquées comme « terminées » le sont **dans les voisinages renvoyés par l'API**, sans garantie externe que ces voisinages exposent toutes les dépendances Lean.

Commandes de reproduction :

```sh
python3 feasibility/probe_theoremgraph.py
python3 feasibility/probe_body_edges.py
python3 feasibility/probe_search.py
lean feasibility/axioms.lean
```

Le premier script nécessite `requests`. Il n'explore qu'un échantillon et ne doit pas être pris pour le moteur de l'application.

## 3. Accès depuis GitHub Pages : échec confirmé pour l'origine testée

Un navigateur Chromium a chargé une page GitHub Pages existante, `https://tpdorsey.github.io/sample-docs-project/` (HTTP 200). La réponse de cette page ne portait pas de politique CSP qui limite `connect-src`. Depuis son origine `https://tpdorsey.github.io`, des appels JavaScript `fetch` vers la recherche et vers un voisinage TheoremGraph ont tous deux levé `TypeError: Failed to fetch`.

Le contrôle HTTP explique cet échec : un `GET` avec `Origin: https://tpdorsey.github.io` recevait `200` sans `Access-Control-Allow-Origin` ; une prérequête `OPTIONS` recevait `400` avec le texte `Disallowed CORS origin`. Le premier essai depuis `https://jekyll.github.io` n'était pas probant, car il utilisait une page 404 qui imposait `connect-src 'self'` ; il a été écarté de la conclusion.

**Conséquence :** une page GitHub Pages ordinaire ne peut pas compter sur l'accès direct à cette API dans la configuration observée. Le fournisseur pourrait autoriser l'origine finale du projet ou une politique plus large ; cela exige une modification côté API, pas un changement de code côté navigateur. Le test établit le rejet de l'origine utilisée, pas une liste exhaustive de toutes les origines autorisées. [Protocole et résultats](feasibility/cors-evidence.md).

## 4. Recherche : utile pour suggérer, insuffisante pour un nom exact

L'API de recherche sémantique a répondu `200` sur six requêtes testées, dont cinq ont été répétées. Les temps observés allaient d'environ 1,8 à 25,4 secondes selon la requête et l'essai. Échantillon trop petit pour promettre une latence générale ; [les résultats du second passage](feasibility/search-results.json) sont conservés.

| Requête | Déclaration pertinente dans les résultats | Rang observé | Ce que montre l'essai |
| --- | --- | ---: | --- |
| `Nat.add_comm` | `Nat.add_comm` | 6 puis 7 | Un nom exact n'est pas priorisé comme tel ; le rang a varié entre deux essais. |
| « for all natural numbers a and b, a + b = b + a » | `Nat.add_comm` | 4 | La description retrouve le théorème, derrière des instances et un résultat sur les entiers. |
| « law of excluded middle… » | `Classical.em` | 3 | La recherche propose aussi `em` et `em'`, qu'il faut désambiguïser. |
| « zero plus a natural number… » | `Nat.zero_add` | 1 | L'API renvoie également `Nat.add_zero`, résultat voisin mais d'orientation différente. |
| « if the sum of two natural numbers is zero… » | `Nat.eq_zero_of_add_eq_zero` | 1 | Plusieurs résultats voisins et identifiants répétés sont renvoyés. |
| `Classical.choice` | `Classical.choice` | 1 | Un nom exact peut réussir, sans garantie systématique. |

Le champ `name` de `/graph/embedding` est souvent seulement `Thm`, `Theorem`, `Inst` ou `Axiom`. Le nom Lean complet n'est visible qu'après consultation du voisinage. Des identifiants identiques apparaissent plusieurs fois parmi les 10 premiers résultats, associés à des résumés différents. L'endpoint de voisinage est documenté pour les UUID ; appelé avec `Nat.add_comm` comme identifiant, il a renvoyé `500`, donc il ne constitue pas une recherche par nom.

Une solution partielle existe dans le jeu publié par le même projet : `statement_formal.csv` contient `decl_name` et l'UUID. Sur la partition `Mathlib_v427`, **330 409 noms**, sans doublon dans cette partition, ont produit lors de l'essai un index JSON `nom → UUID` d'environ **25,0 Mo brut / 11,4 Mo gzip**. Les UUID des sept déclarations contrôlées correspondent à ceux de l'API. Cela rend plausible une recherche exacte statique ; ce n'est pas une solution pour la recherche sémantique libre. Les champs `body` de ces sept lignes CSV étaient vides, alors que l'API a renvoyé un énoncé pour les théorèmes testés : une interface entièrement statique devra résoudre séparément l'affichage des énoncés.

## 5. Parcours du graphe : résultats des six exemples

| Déclaration | Arêtes directes `proof` / `sig` | Clôture `proof` observée | Signal trouvé | Comparaison Lean 4.28 |
| --- | ---: | --- | --- | --- |
| `Nat.add_zero` | 4 / 5 | 5 nœuds, terminée | Aucun des principes ciblés | Aucun axiome |
| `Nat.zero_add` | 11 / 5 | 12 nœuds, terminée | Aucun des principes ciblés | Aucun axiome |
| `Nat.add_comm` | 12 / 4 | 17 nœuds, terminée | `Nat.zero_add` et `Nat.succ_add` directs | Aucun axiome |
| `Nat.eq_zero_of_add_eq_zero` | 12 / 6 | 19 nœuds, terminée | `False.elim` direct | Aucun axiome |
| `Nat.add_eq_zero` | 39 / 7 | 80 traités, 14 en attente | `Classical.propDecidable` et `Decidable.byContradiction` directs | `propext`, `Classical.choice`, `Quot.sound` |
| `Classical.em` | 23 / 2 | 51 nœuds, terminée | `propext` direct ; **pas `Classical.choice`** | `propext`, `Classical.choice`, `Quot.sound` |

Sur les 117 demandes de voisinage nécessaires à ces parcours avec cache partagé, aucune n'a échoué ; environ 746 Ko de réponses ont été transférés. Les temps de parcours observés vont d'environ 2 à 18 secondes, hors recherche et avec réutilisation des voisinages communs. La limite de 80 nœuds sur `Nat.add_eq_zero` interdit toute conclusion négative pour ce cas.

### 5.1 Contre-exemple décisif pour l'axiome du choix

Avec la règle initiale « suivre uniquement `proof` », `Classical.em` arrive au bout des 51 nœuds renvoyés sans rencontrer `Classical.choice`. Or l'enseignement officiel de Lean et `#print axioms Classical.em` confirment cette dépendance. Le graphe contient bien un chemin lorsqu'on suit aussi le corps d'une définition :

```text
Classical.em
  --proof--> Classical.choose_spec
  --proof--> Classical.indefiniteDescription
  --def----> Classical.choice  [axiom]
```

Le second parcours (`proof + def`) termine à 55 nœuds et trouve ce chemin. Pour `Nat.add_eq_zero`, le même mode trouve `Nat.add_eq_zero --proof--> Classical.propDecidable --def--> Classical.choice`, alors que le parcours `proof` seul ne trouve pas l'axiome dans les 80 premiers nœuds. Ces chemins illustrent exactement pourquoi une question sur les axiomes ne peut pas être définie par la clôture `proof` seule. [La documentation officielle de Lean](https://lean-lang.org/theorem_proving_in_lean4/Axioms-and-Computation/) relie également `Classical.indefiniteDescription` à `Classical.choice`.

Suivre `proof + def` est une **hypothèse améliorée pour les dépendances transitives des corps de déclarations**, pas une reproduction démontrée de `#print axioms`. Le parcours peut encore manquer des constantes filtrées, des aspects de réduction ou des références essentielles au typage. Une validation sur un corpus plus large et sur une même révision Lean est nécessaire avant de promettre un verdict d'axiomes.

### 5.2 Limites des catégories de méthodes

`Nat.add_comm` référence `Nat.zero_add` et `Nat.succ_add`, ce qui évoque une preuve par récurrence, mais aucun récursseur identifiable n'apparaît dans sa clôture testée. Le [papier TheoremGraph](https://arxiv.org/html/2606.25363) indique que des récursseurs auxiliaires et d'autres constantes générées par le noyau sont retirés des nœuds exposés. TheoremGraph ne permet donc pas de conclure à la présence ou à l'absence d'une induction à partir de cet exemple.

`Nat.eq_zero_of_add_eq_zero` référence directement `False.elim` tout en ne dépendant d'aucun axiome selon Lean 4.28. Cela constitue un fait du terme de preuve, mais ne suffit pas à qualifier toute la stratégie de « raisonnement par l'absurde classique ». De même, une référence indirecte à `Decidable.byContradiction` dans un autre cas ne renseigne pas, à elle seule, sur la tactique écrite pour le théorème initial.

**Place de la V2 prévue :** cette limite sur l'induction était déjà identifiée dans la spécification initiale ; elle motive précisément l'examen de MathlibGraph. Dans son fichier public `nodes.csv` (environnement complet), `Nat.rec` apparaît comme `recursor` et `Nat.recOn` comme `abbrev`, alors que [TheoremGraph retire les récursseurs auxiliaires](https://arxiv.org/html/2606.25363). [Le contrôle des nœuds](feasibility/mathlibgraph-node-check.json) confirme que MathlibGraph expose au moins des nœuds supplémentaires pertinents. Cette étude n'a pas vérifié que ses arêtes permettent de reconnaître de façon fiable une induction dans la preuve de `Nat.add_comm` ou d'un autre théorème : c'est le test à mener pour la V2. La limitation d'induction **n'est donc pas, à elle seule, un motif d'abandon du plan en deux versions**.

## 6. Contrat API et provenance

- [La documentation API](https://www.theoremsearch.com/docs) illustre une réponse de voisinage `{statement, neighbors}`. Les réponses observées portaient `{root, nodes, edges}`. Un adaptateur devrait se fonder sur un contrat testé et échouer explicitement si ce contrat change.
- La réponse peut inclure des arêtes autres que celles du nœud demandé ; il faut filtrer par `src_id = root_id`.
- `root.statement.paper_external_id` vaut `Mathlib_v427` pour les exemples. Dans `paper_lean_repo.csv`, la ligne correspondante donne `lean_toolchain = v4.2.7`, mais `mathlib_rev` et `git_commit` sont vides. Cette métadonnée ne suffit pas à identifier une révision Mathlib contrôlable ; la différence de notation avec « v4.27 » dans le papier n'a pas été résolue ici.
- L'API n'a exposé dans les réponses testées ni indicateur de pagination, ni indicateur explicite d'exhaustivité du voisinage, ni identifiant immuable d'instantané. La fin de la file du client n'établit donc que « aucun autre témoin dans les réponses reçues ».
- Le jeu public `formal_dependency.csv` contient environ **11,3 millions d'arêtes** sur toutes les bibliothèques, pour environ **1,05 Go brut** ; une préparation statique demanderait un vrai prototype de découpage, de compression et de recherche, pas une simple copie du CSV vers GitHub Pages. [Schéma du jeu de données](https://huggingface.co/datasets/jessteru/math-graph).

## 7. Conclusion pour la décision produit

| Usage proposé | Verdict à ce stade | Motif |
| --- | --- | --- |
| Montrer qu'une déclaration nommée est référencée, avec chemin | **Prometteur** | Les six exemples ont fourni des arêtes et chemins reproductibles ; un index de noms exacts est réalisable hors ligne. |
| Détecter des axiomes par `proof` seul | **Non viable** | Faux négatif démontré sur `Classical.em`, malgré une clôture API terminée. |
| Détecter des axiomes avec `proof + def` | **À valider** | Deux chemins vers `Classical.choice` concordent avec Lean, mais pas de garantie générale ni de version alignée. |
| Détecter l'induction en V1 | **Limite attendue ; motivation de V2** | Les récursseurs filtrés par TheoremGraph figurent parmi les nœuds bruts de MathlibGraph, mais la qualité du signal dans ses arêtes reste à mesurer. |
| Détecter la tactique de l'auteur en V1 | **Non démontré par cette source** | L'API V1 ne donne pas la structure de preuve ni le script tactique. |
| Déployer la V1 sur GitHub Pages avec accès direct à l'API actuelle | **Bloqué pour l'origine testée** | Le serveur répond `Disallowed CORS origin`. |
| Répondre « aucun usage » de manière fiable | **Non acquis** | Risques de données filtrées, sémantique des arêtes et provenance/exhaustivité non garanties. |

**Recommandation :** ne pas commencer l'implémentation de la V1 actuelle à cause du CORS et du faux négatif sur le choix avec la règle `proof` seule. Si TheoremGraph reste la source retenue, la suite est un cadrage plus étroit : obtenir un accès navigateur autorisé **ou** préparer un instantané statique, définir des parcours différents pour « référence nommée » et « axiome », puis comparer ce dernier à `#print axioms` sur un corpus aligné en version. L'étude de l'induction avec MathlibGraph demeure le rôle prévu pour la V2 ; la contraposition et les tactiques exigent une validation distincte.

## 8. Artefacts de vérification

- [Parcours `proof` et mesures](feasibility/probe-results.json)
- [Parcours `proof + def`](feasibility/body-edge-results.json)
- [Recherche et mesures](feasibility/search-results.json)
- [Vérification CORS](feasibility/cors-evidence.md)
- [Contrôle des nœuds MathlibGraph](feasibility/mathlibgraph-node-check.json)
- [Fixture `Nat.add_comm`](feasibility/fixture-Nat.add_comm.json)
- [Fixture `Classical.em`](feasibility/fixture-Classical.em.json)
- [Commande Lean](feasibility/axioms.lean) et [sa sortie](feasibility/axioms-output.txt)
- [Script de parcours `proof`](feasibility/probe_theoremgraph.py) et [script `proof + def`](feasibility/probe_body_edges.py)
- [Script de recherche](feasibility/probe_search.py)
