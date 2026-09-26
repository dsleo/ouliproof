# Ouliproof — plan d'implémentation actualisé

> **Remplacé le 26 septembre 2026 par [SOLUTION_API_VERCEL.md](SOLUTION_API_VERCEL.md).** La préparation hors ligne et GitHub Pages ne sont plus l'architecture retenue après validation d'une réécriture Vercel vers l'API TheoremGraph dans un navigateur. Conserver ce document uniquement comme historique des exigences et des observations sur le graphe.

**Statut :** proposition à valider avant développement produit. Le premier lot est une décision technique mesurée, pas le lancement automatique de la V1.  
**Date :** 25 septembre 2026.  
**Références locales :** [spécification fonctionnelle initialement révisée](SPECIFICATION_REVISEE.md) et [étude de faisabilité TheoremGraph](ETUDE_FAISABILITE_THEOREMGRAPH.md).  
**Ce document fait foi pour l'ordre d'implémentation et remplace les règles de parcours `proof` seul de la spécification antérieure.**

## 1. Décision proposée

Construire une application statique sur GitHub Pages à partir d'un **instantané TheoremGraph préparé hors ligne**. Le navigateur ne dépend pas de l'API TheoremGraph pendant une analyse. Cette décision répond au rejet CORS constaté depuis une origine GitHub Pages et permet de figer le jeu de données consulté. Elle reste subordonnée aux seuils du lot 0 : taille des fichiers, temps de consultation et qualité de recherche par description.

Conserver deux interprétations distinctes du graphe :

1. **Chaîne de références de preuve (`proof`).** Suit les arêtes `proof` pour dire quels lemmes ou constantes sont référencés dans les termes de preuve atteints.
2. **Chaîne des corps de déclarations (`proof + def`).** Suit `proof` depuis une preuve et `def` depuis une définition pour chercher, notamment, des axiomes utilisés par les définitions rencontrées. Le chemin affiche le type de chaque arête. Ce mode a retrouvé `Classical.choice` pour `Classical.em` et `Nat.add_eq_zero` dans l'étude, mais **n'est pas présenté comme équivalent à `#print axioms`**.

L'induction reste une question à **indices limités en V1**. La V2 évalue MathlibGraph, dont le jeu brut contient des nœuds tels que `Nat.rec`, pour améliorer spécifiquement cette détection. La V2 garde sa propre provenance et sa propre sémantique.

### Ce qui est acquis et ce qui reste à démontrer

| Point | État |
| --- | --- |
| Chemins dans l'API TheoremGraph | Démontrés sur six exemples ; fixtures conservées. |
| Nécessité de `def` pour chercher le choix | Démontrée sur deux exemples. |
| Recherche exacte dans les données publiées | `decl_name → UUID` vérifié sur sept noms ; index expérimental de 11,4 Mo gzip pour `Mathlib_v427`. |
| API directe depuis GitHub Pages | Origine testée rejetée : `Disallowed CORS origin`. |
| Jeu statique complet sous les limites Pages | **Non mesuré.** |
| Recherche libre en français et en anglais depuis les fichiers statiques | **Non validée.** |
| Équivalence avec `#print axioms` | **Non établie.** |
| Détection d'induction par MathlibGraph | Présence de récursseurs vérifiée ; utilité des arêtes **non testée**. |

## 2. Contrat produit de la V1

### 2.1 Entrée et sélection

L'utilisateur saisit ensemble un résultat et une ou plusieurs questions. Le résultat peut être un nom Lean exact ou une description mathématique. La recherche exacte doit toujours être prioritaire quand un nom complet correspond. La recherche par description présente plusieurs candidates, avec nom Lean, module, résumé ou énoncé disponible, et version du jeu ; l'utilisateur confirme la bonne déclaration.

Le nom Lean complet et l'UUID sont issus du **même instantané** que les arêtes. L'index de noms ne fusionne jamais automatiquement des déclarations issues de plusieurs instantanés. Si la signature Lean est absente du jeu statique, l'interface l'indique au lieu d'inventer un énoncé à partir du résumé.

### 2.2 Questions disponibles

| Question V1 | Politique de parcours | Conclusion autorisée |
| --- | --- | --- |
| « La preuve référence-t-elle X, directement ou via des lemmes ? » | `proof` | « Le graphe atteint X par les arêtes `proof` suivantes ». |
| « Les corps des dépendances atteignent-ils X ? » | `proof + def` | « Le graphe atteint X par ce chemin typé ». |
| « Atteint-on l'axiome nommé `Classical.choice`, `propext`, etc. ? » | `proof + def` | Témoin nommé et chemin typé ; aucune équivalence annoncée avec `#print axioms`. |
| « Un principe classique nommé est-il référencé ? » | Registre de constantes exactes, avec politique propre à chaque règle | Présence d'une constante répertoriée ; la liste n'est pas exhaustive. |
| « Y a-t-il une induction ou une analyse par cas ? » | Détecteurs d'indices, uniquement si validés | « Indice observé » ou « non déterminable en V1 » ; jamais « absence d'induction ». |
| « L'auteur a-t-il utilisé `induction`, `simp`, l'absurde ou la contraposition ? » | Aucun verdict automatique V1 | « Non déterminable avec cette source ». |

Pour une déclaration exacte X, l'interface peut proposer les deux questions de parcours, mais ne mélange pas leurs réponses. Le libellé par défaut indique toujours quel parcours a été utilisé. Une carte montre le nom exact du témoin, son chemin, la source, la règle de classification et ses limites.

### 2.3 États et formulation des réponses

Séparer l'**observation** (`témoin exact`, `indice`, `aucun témoin dans le graphe choisi`, `non déterminable`) de l'**état d'exploration** (`en cours`, `terminée`, `interrompue`, `limitée`, `en erreur`). Un témoin déjà trouvé peut donc rester visible lorsque le budget est ensuite épuisé.

L'absence de témoin n'est affichée que si tous les voisinages de la politique concernée ont été traités, que toutes les cibles d'arêtes sont résolues, que la file est vide et que la version n'a pas changé. Le libellé complet est : **« Aucun témoin observé dans le graphe TheoremGraph de cet instantané, selon le parcours [proof / proof + def]. »** Il ne signifie ni « aucun axiome Lean » ni « preuve constructive ».

Un résultat positif peut être annoncé avant la fin. Le qualificatif « témoin le plus proche » attend la fin de la couche précédente du parcours concerné ; avant cela, afficher « témoin provisoire ».

## 3. Architecture recommandée

```text
CSV TheoremGraph épinglés + métadonnées de provenance
       │
       ▼
Constructeur hors ligne : contrôle → normalisation → indexation → manifestes
       │
       ├── index des noms et des déclarations
       ├── index de recherche par description
       └── voisinages statiques, partitionnés et compressés
       │
       ▼
GitHub Pages : application + fichiers versionnés
       │
       ▼
Navigateur : recherche → confirmation → parcours(s) → cartes et chemins
```

La génération peut se faire localement ou dans CI ; elle n'est pas un serveur de consultation. Le déploiement sert uniquement des fichiers statiques. Les CSV complets ne font pas partie des fichiers téléchargés par le navigateur.

### 3.1 Source et instantané

- Épingler **une révision immuable du jeu Math-Graph**, avec URL et SHA256 des fichiers d'entrée. Conserver le `paper_id`, le `statement_id`, le `decl_name`, le type de déclaration, le module et le type d'arête.
- Partir de la partition `Mathlib_v427`, utilisée dans l'étude, **seulement si** un audit du CSV des arêtes établit comment les dépendances vers les autres partitions sont représentées. Ne pas supposer que les partitions `v427`, `v428` et `v429` sont des snapshots indépendants ou un cumul : la sémantique doit être documentée par comptage et vérification des cibles.
- Le manifeste doit distinguer `datasetRevision` (identifiant immuable vérifiable), `sourceLabel` (par exemple `Mathlib_v427`) et `mathlibGitCommit` (valeur nulle tant qu'elle n'est pas prouvée). La colonne `lean_toolchain` observée ne suffit pas à dater précisément Mathlib ; ne pas afficher une révision supposée.
- Toute arête retenue a une source et une cible présentes dans l'ensemble de nœuds exporté. Les cibles manquantes sont comptées et expliquées. Si elles empêchent une clôture, l'interface marque l'exploration incomplète ; le constructeur ne les supprime pas silencieusement.
- Conserver les licences et attributions des données redistribuées. Documenter la procédure reproductible de construction, sans committer les CSV bruts volumineux.

### 3.2 Artefacts et interfaces

Le constructeur produit un manifeste versionné et des fichiers contrôlés par schéma :

```text
manifest.json
  schemaVersion, datasetRevision, sourceLabel, sourceHashes,
  detectorVersion, partitions, counts, missingTargets, artifactHashes

Declaration
  id, leanName, kind, module?, signature?, summary?, sourceReference?

Edge
  fromId, toId, type  // proof | def | sig | ...

Neighborhood
  rootId, outgoingEdges, complete, artifactVersion
```

Le format des fichiers de voisinage (par identifiant, par module ou par hachage) est choisi après comparaison de 2 ou 3 découpages sur un corpus fixe. Critères : taille publiée, nombre de requêtes, octets transférés et délai avant le premier témoin. Chaque partition est adressée sous un chemin de version immuable et son empreinte est vérifiée par le constructeur ; le navigateur refuse un mélange de versions.

L'adaptateur de données expose au moteur `findExactName`, `searchDescriptions`, `getDeclaration` et `getOutgoingEdges`. Le moteur n'interprète jamais directement une ligne CSV ou une réponse de l'API en ligne. Il valide `rootId`, types d'arêtes, intégrité des identifiants et version avant de mettre un voisinage en cache.

### 3.3 Recherche par description : décision préalable

Le jeu publié possède des noms Lean et des résumés générés, mais les signatures de certains résultats sont vides dans `statement_formal.csv`. Construire et mesurer d'abord un index local sur les noms, modules et résumés disponibles. Son classement peut combiner correspondance exacte, préfixe, sous-chaîne et recherche textuelle pondérée ; il doit être décrit comme **recherche textuelle**, pas comme recherche sémantique équivalente à l'API.

Préparer avant le réglage un jeu d'au moins **40 descriptions** pertinentes pour la partition retenue : 20 en français et 20 en anglais, avec une ou plusieurs déclarations cibles vérifiées. Critère de passage proposé : **au moins 16/20 dans le top 10 pour chaque langue**, après déduplication des UUID, et 100 % des noms Lean exacts du corpus au rang 1. Mesurer aussi latence et volume chargé dans un navigateur.

Si ce seuil échoue, ne pas masquer l'échec derrière une saisie libre qui ne marche qu'en anglais. Les choix suivants sont ordonnés : améliorer l'index local sur le même corpus, expérimenter un modèle de recherche local compatible avec le budget du site, ou obtenir une autorisation CORS et une garantie de version pour l'API TheoremGraph. **Le mode nom Lean seul ne remplace pas silencieusement le produit demandé.** Une modification du périmètre se décide explicitement après présentation des mesures.

### 3.4 Limites d'hébergement et de performance

- Le site publié doit rester sous [la limite GitHub Pages de 1 Go](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), code et données compris ; les sources CSV ne sont pas publiées telles quelles.
- Le premier chargement de l'interface ne télécharge pas le graphe complet. Les index sont chargés à la demande ou en partitions ; les voisinages sont chargés seulement pour les nœuds atteints.
- Le lot 0 mesure sur trois profils de clôture (petit, moyen, grand) : taille publiée, transfert de recherche, transfert d'analyse, temps avant la première candidate, le premier témoin et la fin ou limite. Les budgets navigateur par défaut sont fixés d'après ces mesures, puis écrits dans la configuration et l'interface.
- Toute limite de nœuds, de temps, de requêtes ou d'octets produit `limitée`, jamais une réponse négative. Une reprise augmente le budget et conserve le cache de la session.

## 4. Moteur de parcours

### 4.1 Deux politiques, un cache de voisinages

Le moteur prend une politique explicite :

```text
PROOF_CHAIN    = { proof }
BODY_CHAIN     = { proof, def }
```

Chaque politique possède `visited`, `frontier`, `parent`, `distance`, `hits` et `status`. Les deux partagent seulement le cache de voisinages déjà chargés et les métadonnées de nœuds. Pour chaque arête suivie, `parent` garde aussi son type : un export de témoin prouve le parcours utilisé. Une arête `sig` ne sert pas de raccourci implicite vers un principe ; une analyse des types serait un troisième mode, à spécifier et valider séparément.

Les parcours sont en largeur d'abord, par couches. La concurrence est bornée pour le chargement des partitions, mais l'ordre des réponses réseau ne change pas les distances ni le chemin annoncé comme le plus court. Les graphes cycliques sont dédupliqués par `(datasetRevision, id, policy)`.

### 4.2 Catalogue des règles

Chaque détecteur versionné définit : identifiant de question, formulation utilisateur, politique de parcours, noms Lean cibles, niveau (`exact` / `indice` / `non déterminable`), justification, limites, références et cas de validation. Les noms sont résolus en UUID au moment de la construction de l'instantané. Une cible requise absente bloque le build du catalogue ; une cible facultative absente est signalée et désactivée. Pas de détection positive par simple sous-chaîne d'un nom.

La V1 livre d'abord : déclaration X en `PROOF_CHAIN`, déclaration X en `BODY_CHAIN`, `Classical.choice` et `propext` comme axiomes nommés en `BODY_CHAIN`. D'autres principes ne sont ajoutés qu'avec une règle et des exemples revus. Une carte « induction » peut expliquer les indices limités de V1, mais n'émet aucune conclusion négative sur l'induction.

### 4.3 Reprise, export et qualité des erreurs

- Persister au minimum la file, les parents, les distances et les partitions chargées pendant la session. Si IndexedDB est utilisé pour survivre à un rechargement, ses clés incluent la version et la politique ; un cache ancien est invalidé explicitement.
- L'utilisateur peut interrompre puis reprendre. Une erreur de fichier, un hachage invalide ou une cible absente reste visible et empêche `terminée`.
- Export JSON et texte : déclaration de départ, question, politique, snapshot, version du catalogue, chemin ordonné avec UUID, noms, types d'arêtes et état de complétude. L'export n'est pas un certificat Lean.
- Les textes de source sont traités comme non fiables et rendus sans HTML injecté.

## 5. Interface V1

L'écran initial conserve les deux champs simultanés. Après confirmation du résultat, afficher une carte par question, un compteur de nœuds traités et en attente **sans pourcentage global trompeur**, ainsi que les actions arrêter/reprendre. Le résultat positif le plus proche apparaît dès qu'il est établi ; la vue par défaut privilégie la réponse et le chemin textuel. Une vue graphe facultative n'affiche que le chemin choisi et des voisins demandés explicitement.

Le lien partageable contient la version des données, la déclaration et les questions. Il relance l'analyse plutôt que de prétendre partager un calcul déjà achevé. Si les fichiers d'une ancienne version ne sont plus hébergés, prévenir avant toute relance sur une nouvelle version. Les cartes restent compréhensibles sans couleur ; les changements importants utilisent une annonce accessible et le chemin est utilisable au clavier.

## 6. Tests et critères d'acceptation

### 6.1 Données et construction

1. Le même ensemble de fichiers source épinglés produit les mêmes artefacts et le même manifeste, indépendamment de l'ordre de lecture.
2. Les comptes de nœuds/arêtes par type, les doublons, les cibles manquantes et les arêtes entre partitions sont publiés dans le rapport de build.
3. Les sept UUID contrôlés dans [l'étude](ETUDE_FAISABILITE_THEOREMGRAPH.md) retrouvent leurs noms ; `Nat.add_comm`, `Classical.em` et `Classical.choice` sont présents.
4. Le site statique respecte la limite de taille et sert effectivement les partitions depuis une origine GitHub Pages ou une prévisualisation équivalente. Aucun appel de consultation à `api.theoremsearch.com` n'est requis.
5. La recherche passe le corpus bilingue et les résultats sont enregistrés avant le développement de l'interface complète.

### 6.2 Graphe et sémantique

Les tests utilisent des graphes synthétiques pour les invariants, puis des fixtures réelles pour les contre-exemples :

- `Classical.em` : pas de chemin vers `Classical.choice` en `PROOF_CHAIN`, chemin `proof → proof → def` en `BODY_CHAIN`.
- `Nat.add_eq_zero` : chemin `proof → def` vers `Classical.choice` dans le graphe préparé, si la même partition et ses cibles sont conservées.
- `Nat.add_comm` : références directes à `Nat.zero_add` et `Nat.succ_add`, sans verdict automatique « induction prouvée ».
- `Nat.eq_zero_of_add_eq_zero` : `False.elim` apparaît, sans verdict « absurde classique ».
- Cycles, réponses hors ordre, arêtes `sig`, fichiers manquants, limite atteinte, pause et changement de version ne produisent jamais un faux verdict négatif ou un faux chemin court.

Comparer sur un corpus d'au moins 30 déclarations **de la même révision Lean que le graphe**, si cette révision peut être établie, les témoins d'axiomes du `BODY_CHAIN` et `#print axioms`. Relever séparément faux positifs, faux négatifs et cas non comparables. Si l'alignement des versions demeure impossible, ne pas présenter cette comparaison comme validation générale ; le libellé produit reste une observation du graphe.

### 6.3 Parcours utilisateur

La V1 est acceptée seulement si, depuis le site publié : recherche exacte et par description, sélection d'une déclaration, plusieurs questions sur une seule exploration, affichage des chemins typés, interruption/reprise, lien partageable, états de limite/erreur et usage au clavier fonctionnent. Les captures ou sorties de test conservent la version des données et les questions utilisées.

## 7. Lots pour les coding agents

| Lot | Travail autorisé et livrable | Porte de sortie |
| --- | --- | --- |
| **0 — Préparation statique** | Épingler les CSV, auditer les partitions et cibles, produire deux formats expérimentaux de voisinages et un index de recherche bilingue mesuré. | Manifeste provisoire, rapport de taille/latence/recherche ; décision explicite « voie statique viable » ou « échec avec chiffres ». Ne pas construire l'UI complète avant cette décision. |
| **1 — Chaîne de données** | Constructeur reproductible, validation de schéma, index de noms, partitions choisies, manifeste immuable, attribution des sources. | Comptes et empreintes vérifiés ; aucune cible perdue silencieusement. |
| **2 — Moteur** | `PROOF_CHAIN` et `BODY_CHAIN`, cache commun, BFS par couches, chemins typés, budget, pause/reprise, états. | Tests synthétiques et fixtures `Classical.em` / `Nat.add_eq_zero` réussis. |
| **3 — Catalogue** | Règles nommées résolues dans l'instantané, libellés et limites validés. | Aucun détecteur V1 n'infère une tactique ou un axiome Lean absolu. |
| **4 — Interface** | Formulaire à deux champs, confirmation, cartes, chemins, partage, accessibilité, erreurs. | Parcours navigateur sur les six exemples de l'étude et sur un mobile. |
| **5 — Publication** | Build GitHub Pages, test des fichiers statiques et de la taille, documentation des versions et limites. | Site publié avec scénarios d'acceptation enregistrés. |
| **6 — Recherche V2 MathlibGraph** | Apparier les versions, analyser les arêtes vers récursseurs et les métadonnées de tactiques, préparer un corpus comparatif. | Promotion d'une catégorie seulement après mesure des erreurs et provenance séparée. |

Un agent reçoit un seul lot avec ses entrées, sorties et tests ; les lots dépendants démarrent après validation de leur porte de sortie. Le lot 0 ne répète pas l'étude CORS déjà faite : il mesure ce qui manque pour décider de la voie statique. Si ce lot échoue, documenter l'échec et revoir la contrainte d'architecture ou la promesse de recherche avant d'implémenter le reste.

## 8. V2 MathlibGraph : objectif précis

V2 cherche à améliorer les questions d'induction et de cas par inspection d'un graphe plus brut. Le fichier de nœuds MathlibGraph contient `Nat.rec` ; cela ne prouve pas que l'arête pertinente survit ni qu'un chemin vers ce récursseur caractérise la stratégie du théorème. Le premier travail V2 est donc un test sur preuves Lean connues avec vrais positifs et vrais négatifs, en distinguant `Nat.rec`, induction structurelle, induction bien fondée et simple référence indirecte.

Les [données MathlibGraph](https://huggingface.co/datasets/MathNetwork/MathlibGraph/blob/main/README.md) comprennent aussi des profils d'usage de tactiques par déclaration. Une tactique rattachée à un lemme indirect ne devient pas une tactique attribuable au théorème de départ. Les deux jeux de données ne sont jamais fusionnés dans un chemin unique sans correspondance de version et d'énoncé vérifiée ; l'interface affiche des observations séparées par source.

## 9. Sources primaires

- [TheoremGraph : article et sémantique des arêtes](https://arxiv.org/html/2606.25363)
- [Math-Graph : schéma et fichiers publiés](https://huggingface.co/datasets/jessteru/math-graph)
- [TheoremSearch : documentation API](https://www.theoremsearch.com/docs)
- [MathlibGraph : instantané et métadonnées](https://huggingface.co/datasets/MathNetwork/MathlibGraph/blob/main/README.md)
- [Lean : axiomes et `Classical.choice`](https://lean-lang.org/theorem_proving_in_lean4/Axioms-and-Computation/)
- [GitHub Pages : limites](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
