# Ouliproof — spécification révisée

**Statut :** document de cadrage historique. Pour l'exécution, utiliser la [solution API Vercel](SOLUTION_API_VERCEL.md). La [phase de faisabilité TheoremGraph](ETUDE_FAISABILITE_THEOREMGRAPH.md) a révélé le refus CORS depuis GitHub Pages et le faux négatif sur `Classical.choice` avec une traversée `proof` seule. **Ne pas implémenter cette V1 telle quelle.**  
**Date de vérification des sources :** 25 septembre 2026.  
**Produit visé :** application web publique, utilisable sur GitHub Pages, qui examine les dépendances de déclarations Mathlib sans serveur Lean au moment de la consultation.

## 1. Décisions et corrections apportées à la première version

| Sujet | Décision pour l'implémentation |
| --- | --- |
| Vérité de la réponse | La réponse porte sur **les arêtes présentes dans une source et un instantané identifiés**, jamais sur toute la preuve Lean ni sur la tactique écrite par l'auteur. |
| Source V1 | TheoremGraph est la source candidate, mais **son API navigateur n'est pas acquise**. Le développement de la traversée dépend d'un jalon de faisabilité. |
| Recherche par nom | Le point d'entrée sémantique `/graph/embedding` ne constitue pas une recherche exacte par nom Lean. Prévoir un index `nom Lean → identifiant` issu du même instantané que le graphe. |
| Réponse API | Isoler l'API derrière un adaptateur validé par des réponses réelles. L'exemple publié pour `/graph/statement/{id}` ne correspond pas à la réponse observée le 25 septembre 2026. |
| Chemin témoin | Un chemin court exige une exploration par couches ou une preuve que l'ordonnancement concurrent préserve les distances. La première réponse arrivée n'est pas nécessairement la plus proche. |
| Réponse négative | « Aucun témoin observé » n'est autorisé que si chaque nœud atteignable selon le contrat de graphe a été traité, sans trou, limite, erreur ni changement de version. |
| Catégories | Une catégorie comme « induction » désigne une **liste justifiée de constantes repérables**. Elle ne prouve pas que l'auteur a employé `induction`. |
| V2 | MathlibGraph apporte une autre source avec une autre sémantique. La présence utile de récursseurs et la séparation des références du type/de la preuve restent à vérifier expérimentalement. |

### Constat vérifié pour l'API candidate

Le 25 septembre 2026, `GET /graph/embedding?query=Nat.add_comm&formality=formal&n_results=5` a répondu `200`, mais les objets retournés portaient des noms génériques (`Inst`, `Thm`) et non des noms Lean complets. L'appel de voisinage pour un identifiant retourné a donné un objet `{root, nodes, edges}` avec `root.name = Nat.instAddCommSemigroup`, alors que [la documentation de l'API](https://www.theoremsearch.com/docs) illustre `{statement, neighbors}`. Ces deux contrats doivent être testés et normalisés dans l'adaptateur ; le code métier ne doit dépendre directement d'aucun des deux.

Ces réponses à des requêtes avec l'en-tête `Origin: https://example.github.io` ne contenaient pas `Access-Control-Allow-Origin`. La prérequête `OPTIONS` a répondu `400` pour cette origine. Cela indique un blocage CORS probable pour une page GitHub Pages ; un test `fetch` dans un navigateur réel reste le critère décisif. Aucun proxy CORS public ne doit être utilisé pour contourner ce point dans la V1.

## 2. Question produit et portée exacte

L'utilisateur fournit simultanément :

1. Un résultat Mathlib, par nom Lean exact ou description mathématique.
2. Une ou plusieurs choses à chercher dans ses dépendances.

Il choisit ensuite la déclaration voulue parmi les candidates. L'application parcourt le graphe, donne les premiers témoins dès qu'ils sont **validés**, puis poursuit ou interrompt l'exploration selon le choix de l'utilisateur et les limites de ressources.

### 2.1 Définition V1 de « dépend de »

Pour un instantané `S`, une déclaration de départ `T` et un graphe orienté `G_S` :

- L'arête `proof` `A → B` signifie que la source indique une référence à `B` dans le terme de preuve de `A`.
- La clôture V1 est l'ensemble des déclarations atteintes depuis `T` en suivant **seulement** des arêtes `proof`, dans le sens « ce que la déclaration utilise ».
- Les arêtes `sig`, `def`, `field`, `extends` et `docref` ne sont pas traversées en V1. Elles peuvent être conservées pour affichage ou investigation, sans changer silencieusement la réponse.
- `T` n'est pas son propre témoin : un chemin de longueur zéro ne répond pas à une question sur ses dépendances.
- Un « usage direct » correspond à une arête `proof` sortant de `T` ; un « usage indirect » correspond à un chemin de longueur supérieure à 1.

Cette définition est délibérément étroite. Une référence située dans le corps d'une définition atteinte par la preuve ne sera pas trouvée si le parcours s'arrête aux arêtes `proof`. Il faut afficher cette limite à proximité de toute réponse négative. Une future analyse de l'expansion des définitions sera un **mode distinct**, avec ses propres règles et sa provenance.

### 2.2 Ce que signifie un résultat

Chaque carte de question possède deux dimensions indépendantes :

| Dimension | Valeurs | Interprétation |
| --- | --- | --- |
| Observation | `aucun_témoin`, `témoin_exact`, `indice`, `non_déterminable` | Ce qui a été trouvé et ce qu'on peut en inférer. |
| Exploration | `en_cours`, `terminée`, `interrompue`, `limitée`, `en_erreur` | État de la traversée commune à toutes les questions. |

La combinaison évite qu'un témoin trouvé masque une exploration incomplète. Exemples : « témoin exact, exploration limitée » et « aucun témoin, exploration terminée ». Le libellé **« aucun témoin observé dans cet instantané »** n'est affichable que lorsque l'exploration est terminée. Pour une question non déterminable, l'interface explique immédiatement pourquoi la source ne peut pas y répondre ; la traversée d'autres questions peut continuer.

Une carte affiche : le résultat, la source et sa version, la règle appliquée, le nom Lean du témoin, sa distance, le chemin d'arêtes vérifiable, et le niveau de conclusion autorisé. Exemple : « La chaîne atteint `Classical.choice` en 4 arêtes `proof` » ; pas « l'auteur de ce théorème a utilisé l'axiome du choix ».

## 3. Périmètre fonctionnel

### 3.1 V1 obligatoire

- Saisir un nom Lean ou une description mathématique et choisir plusieurs questions avant de lancer l'analyse.
- Proposer des déclarations **du même instantané que le graphe inspecté**, avec nom Lean complet, provenance Mathlib et énoncé **si disponible**. Si l'énoncé est absent, afficher clairement « énoncé indisponible dans la source » et un autre élément permettant de désambiguïser (module, résumé, lien source vérifié).
- Prioriser une correspondance exacte de nom Lean ; ne jamais remplacer automatiquement un nom exact par le premier résultat sémantique.
- Faire confirmer explicitement la déclaration quand plusieurs candidates sont plausibles.
- Explorer une seule fois le graphe pour toutes les questions, afficher les progrès, témoins, chemins et limites.
- Arrêter et reprendre l'exploration sans perdre les données déjà chargées pendant la session. Un rechargement de page ne doit pas transformer une analyse interrompue en analyse terminée.
- Fournir un lien partageable avec au moins l'identifiant de l'instantané, le nom ou l'identifiant de la déclaration, les identifiants des questions et la version des détecteurs. Le lien déclenche une **nouvelle analyse** ; il ne prétend pas partager un résultat calculé, sauf si celui-ci est exporté explicitement.
- Fonctionner en lecture seule, sur mobile et sur ordinateur, avec clavier et lecteur d'écran.

### 3.2 Hors V1

- Reconstruction de l'arbre ou du script de preuve Lean.
- Détection des tactiques utilisées à partir des seules arêtes de dépendance.
- Verdict équivalent à `#print axioms`.
- Certificat de constructivité ou preuve de l'absence d'un principe dans Lean.
- Traversée par défaut de `sig` et `def`.
- Visualisation complète d'une clôture arbitrairement grande.
- Correspondance automatique non vérifiée entre instantanés TheoremGraph et MathlibGraph.

### 3.3 Parcours utilisateur

1. **Formulaire.** Deux champs visibles : « Quel résultat ? » et « Que chercher ? ». Les questions montrent leur niveau de détectabilité avant la soumission. Une déclaration Lean précise peut servir de question personnalisée.
2. **Résolution.** Si le texte correspond exactement à un nom de l'index, proposer ce résultat en premier. Sinon, afficher des candidates classées avec leurs métadonnées et permettre la correction de la recherche. Un résultat sémantique n'est jamais sélectionné implicitement.
3. **Analyse.** Les cartes et le compteur `nœuds traités / nœuds en attente` se mettent à jour par lots suffisamment petits pour rester fluides. Afficher aussi les requêtes en cours, les erreurs et le budget restant. Le compteur n'est pas présenté comme un pourcentage tant que la taille de la clôture est inconnue.
4. **Témoins.** Un résultat correspondant apparaît dès que la profondeur atteinte est stabilisée. Montrer le témoin le plus proche et un accès aux autres témoins déjà connus. Le chemin se lit de `T` vers le témoin ; chaque étape montre le nom Lean, l'identifiant de la source et `proof`.
5. **Pause ou limite.** Le bouton « Arrêter » suspend les nouvelles demandes ; la reprise traite la file restante. Toute limite automatique explique sa cause et propose une reprise avec un budget plus élevé dans la même session.
6. **Inspection.** Une vue secondaire peut afficher seulement le chemin d'un témoin et ses voisins immédiats. Elle ne charge pas le graphe entier.

## 4. Catalogue des détecteurs V1

Le registre des détecteurs est un fichier versionné, relu par un mathématicien connaissant Lean. Chaque règle est liée à un ou plusieurs **noms Lean exacts** résolus dans l'instantané actif ; des préfixes ou expressions régulières ne valent pas preuve sans revue explicite. Aucune liste de constantes n'est considérée comme complète par défaut.

| Question proposée | Verdict V1 autorisé | Mise en garde obligatoire |
| --- | --- | --- |
| « Cette chaîne atteint-elle la déclaration Lean X ? » | `témoin_exact` ou `aucun_témoin` si exploration terminée | La réponse ne concerne que les arêtes `proof` de l'instantané. |
| « Atteint-elle un principe classique nommé ? » | Témoin exact pour chaque déclaration de la liste contrôlée | Une liste de principes n'est pas une caractérisation exhaustive de la logique classique. |
| « Atteint-elle un axiome nommé, tel que `Classical.choice` ? » | Témoin exact si la déclaration est représentée et atteinte | Ne pas appeler cette réponse « axiomes requis par le théorème ». |
| « Y a-t-il un indice d'induction ? » | `indice` si une constante revue à cette fin est atteinte | Les récursseurs auxiliaires peuvent manquer ; leur présence indirecte ne caractérise pas la méthode de `T`. |
| « Y a-t-il un indice de raisonnement par cas ? » | `indice` pour certaines règles d'élimination revues | Beaucoup de cas ne sont pas identifiables par une seule constante. |
| « Par l'absurde ? », « par contraposition ? » | `non_déterminable` en V1, sauf question reformulée vers une **déclaration exacte** | Ne pas induire une méthode de preuve à partir d'un lemme indirect. |
| « Quelle tactique a été employée ? » | `non_déterminable` en V1 | Les arêtes du graphe n'encodent pas le script tactique. |

Pour chaque entrée du registre : `id`, `version`, `question`, `niveau` (`exact`/`indice`/`non_déterminable`), `cibles` (noms Lean), `justification`, `limites`, `références`, `instantanés_validés`. La compilation du registre échoue si un nom cible requis est absent de l'index choisi ; une règle facultative absente est désactivée avec motif affichable. Le registre ne classe jamais un nœud par simple sous-chaîne de son nom à l'exécution.

## 5. Source des données et décision d'architecture

### 5.1 Contrat de données normalisé

Le moteur reçoit uniquement ce modèle, quel que soit le fournisseur :

```text
Snapshot { source, snapshotId, mathlibRevision?, extractedAt?, detectorVersion }
Declaration { id, leanName, kind?, module?, statement?, summary?, sourceUrl? }
Edge { fromId, toId, type, source }
Neighborhood { rootId, declarations, edges, complete, snapshotId }
```

`complete` signifie que le fournisseur garantit que le voisinage demandé n'a pas été tronqué. En cas de pagination, l'adaptateur récupère toutes les pages avant de retourner `complete = true`. Si l'API ne précise ni complétude ni version, l'adaptateur ne les invente pas : il signale `unknown`, et le moteur n'émet pas de conclusion négative forte.

Identité : dédupliquer par `(source, snapshotId, id)`. Le nom Lean sert à chercher et à afficher, pas à fusionner des nœuds provenant de versions différentes. Les données externes sont du texte non fiable : aucun HTML fourni par la source n'est injecté dans le DOM.

### 5.2 Deux voies possibles pour V1

**Voie A — API TheoremGraph dans le navigateur.** Elle est acceptable seulement si le fournisseur autorise effectivement l'origine GitHub Pages, si les requêtes de recherche et de voisinage fonctionnent dans le navigateur, si un index exact de noms peut être relié sans ambiguïté aux identifiants de l'API, et si la stabilité et la complétude des réponses peuvent être qualifiées. Si l'API n'offre aucune garantie de version cohérente pendant une analyse, elle ne permet pas le verdict négatif V1 défini au § 2.2 ; la voie A exige alors une évolution du fournisseur ou une révision explicite du périmètre. L'adaptateur doit comprendre le schéma réel `{root,nodes,edges}` observé, mais rester capable de signaler un changement de schéma plutôt que de renvoyer un voisinage vide.

**Voie B — jeu statique dérivé d'un instantané TheoremGraph/LeanGraph.** Une tâche hors ligne prépare un index des noms, un index de recherche par description et des fichiers de voisinages ou de partitions consultables à la demande. GitHub Pages sert ces fichiers et l'application ; aucun gros CSV n'est téléchargé en bloc par le navigateur. La transformation enregistre la révision de Mathlib, les identifiants du jeu source, un manifeste de fichiers et leurs sommes de contrôle. Le choix de découpage et de compression résulte d'un prototype mesuré, pas d'un format fixé avant essai.

La voie B permet une version cohérente et une réponse négative mieux définie. Elle doit néanmoins démontrer qu'un index de recherche par description donne des candidates utiles. Un index lexical sur noms et résumés peut être un premier essai ; il ne doit pas être présenté comme recherche sémantique. Si la qualité minimale définie au § 9 n'est pas atteinte et que la voie A reste inaccessible, la promesse « recherche par description » n'est pas livrable en V1. Une édition limitée aux noms Lean peut être publiée sous un autre périmètre explicite.

GitHub Pages est un hébergement statique ; [sa limite publiée est de 1 Go par site](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). Le prototype statique doit mesurer taille publiée, taille transférée par requête et nombre de fichiers avant de retenir cette voie. Les CSV sources complets ne vont pas dans l'artefact du site.

### 5.3 Politique de version

- Afficher la source, son instantané ou sa révision Mathlib, la version des détecteurs et la date d'analyse.
- Pour un instantané statique, toutes les partitions utilisées par une analyse proviennent du même manifeste immuable.
- Pour une API sans identifiant d'instantané garanti, afficher « source en ligne, version non garantie » et ne pas réutiliser indéfiniment les voisinages mis en cache. Si deux réponses exposent des versions incompatibles, interrompre l'analyse.
- Un lien enregistré avec une ancienne version pointe vers cette version si elle reste disponible ; sinon il demande une relance explicite sur la nouvelle version et annonce le changement.

## 6. Algorithme d'exploration

### 6.1 Traversée

Entrées : déclaration `T`, instantané, détecteurs choisis et budget. État : `frontier` par profondeur, `visited`, `inFlight`, `parent`, `distance`, `matchingWitnesses`, `failed`, `metrics`.

1. Ajouter `T` à la profondeur 0 et l'exclure de la détection comme dépendance.
2. Charger les voisinages de tous les nœuds de la profondeur courante, avec concurrence bornée par l'adaptateur. Une réponse n'est « traitée » qu'une fois validée, complète et associée au bon instantané.
3. Garder uniquement les arêtes sortantes `proof` pour la traversée V1. Vérifier que leur `fromId` est le nœud demandé ; dédupliquer les cibles.
4. Pour chaque nouvelle cible, enregistrer `distance = profondeur + 1` et un parent. Évaluer tous les détecteurs choisis. Des témoins de distance `d` peuvent être annoncés comme « les plus proches » seulement lorsque **tous les voisinages de la couche `d-1`** sont complets ; une carte peut montrer avant cela un « témoin provisoire » sans promesse de distance minimale.
5. Continuer tant que la file contient des nœuds, que le budget le permet et qu'aucune erreur non résolue ne laisse de trou.
6. Reconstituer un chemin par `parent`, puis vérifier localement que chaque arête conservée est `proof`, dans le bon sens et du bon instantané, avant affichage ou export.

Une réponse peut être rapide sans que l'exploration soit complète. Trouver un témoin n'autorise pas automatiquement l'arrêt de la traversée, car d'autres questions restent ouvertes et d'autres témoins peuvent exister. Si le produit propose « arrêter après le premier témoin », l'état final doit être `interrompue`.

### 6.2 Budget, reprise et erreurs

- Un budget configurable borne au minimum le nombre de déclarations, le nombre de requêtes, la durée et les octets transférés. Les valeurs par défaut seront fixées après mesures sur le corpus de validation ; elles ne changent pas la sémantique du résultat.
- `Arrêter` annule ou laisse se terminer les requêtes en vol, puis sauvegarde une frontière cohérente. `Reprendre` ne redemande pas les voisinages complets déjà en cache.
- En cas de réseau instable : délai maximal par requête, nouvelle tentative bornée avec attente croissante, traitement explicite de `429` et d'un éventuel `Retry-After`. Après épuisement, garder les nœuds échoués dans `failed` ; ne jamais marquer l'exploration terminée.
- Mettre le cache en mémoire, puis dans IndexedDB si les mesures le justifient. Les clés incluent la source, l'instantané et l'identifiant du nœud. Une réponse incomplète ou invalide n'entre pas dans le cache des voisinages complets.
- Le moteur doit pouvoir recalculer les cartes à partir des nœuds déjà visités lorsque l'utilisateur ajoute ou retire un détecteur. L'ajout d'une question ne redémarre pas la collecte du graphe.

### 6.3 Invariants à tester

1. Une arête `sig` ou `def` seule ne produit jamais un témoin V1.
2. Un graphe cyclique finit grâce à la déduplication.
3. L'ordre des réponses concurrentes n'allonge pas le chemin affiché comme « le plus proche ».
4. Une erreur, une limite, une pagination manquante ou une pause empêche le verdict « aucun témoin observé ».
5. Deux instantanés aux identifiants de nœuds semblables ne se mélangent pas.
6. Un changement de schéma API échoue explicitement, sans être interprété comme « zéro dépendance ».
7. Un témoin trouvé conserve son état de résultat si la traversée est ensuite limitée ; l'état d'exploration indique la limite.

## 7. Contrats d'interface et d'accessibilité

- Toutes les cartes utilisent les mêmes libellés d'observation et d'exploration ; elles montrent séparément le **fait brut** (« arête vers X ») et son **interprétation** (« indice d'induction »).
- Les changements pendant l'exploration sont annoncés dans une zone `aria-live` non bavarde ; le graphe visuel possède une alternative textuelle sous forme de chemin ordonné.
- Les contrôles de pause, reprise, changement de question et copie du lien sont utilisables au clavier. Les couleurs ne sont pas l'unique moyen de distinguer les états.
- Les grands noms Lean et longs énoncés se replient sans masquer la partie décisive ; un clic donne la valeur complète et copiable.
- Le chargement, l'échec de recherche, le résultat vide, l'erreur réseau, la limite atteinte et la version introuvable ont chacun un message et une action de reprise adaptés.
- Un témoin est exportable au format texte ou JSON : source/version, déclaration de départ, question/règle, liste ordonnée des nœuds et arêtes, statut d'exploration. L'export ne se présente pas comme un certificat Lean.

## 8. V2 : seconde source MathlibGraph

[MathlibGraph](https://huggingface.co/datasets/MathNetwork/MathlibGraph/blob/main/README.md) publie notamment un graphe de déclarations Mathlib d'une révision datée du 2 février 2026 et des données d'usage de tactiques par déclaration. Ses arêtes brutes n'offrent pas, dans la documentation consultée, la séparation `proof`/`sig` de TheoremGraph. La V2 ne les fusionne donc jamais dans le même verdict.

Travail V2, après la V1 :

1. Préparer un index statique consultable par déclaration sans téléchargement des gros fichiers sources dans le navigateur.
2. Établir une table de correspondance **vérifiée** entre les noms Lean et versions des deux sources ; les homonymes, suppressions et changements d'énoncé restent non appariés.
3. Tester sur des preuves connues si les récursseurs, règles d'élimination et métadonnées de tactiques apportent des signaux utiles. Une amélioration supposée n'est pas un résultat produit.
4. Afficher deux colonnes de provenance si les sources diffèrent : « TheoremGraph, arêtes `proof` » et « MathlibGraph, prémisses/métadonnées ». Les conclusions négatives restent propres à chaque source.
5. Ne promouvoir une catégorie qu'après revue des faux positifs et cas manqués sur un corpus d'évaluation documenté.

Pour les tactiques, une métadonnée concernant la déclaration `T` peut appuyer « tactique enregistrée pour `T` ». Une métadonnée concernant seulement un lemme indirect doit être libellée « tactique enregistrée pour le lemme X », sans attribution à l'auteur de `T`.

## 9. Jalon de faisabilité et critères d'acceptation

### 9.1 Jalon 0 — obligatoire avant l'architecture V1

Créer un petit dossier de preuves reproductibles comprenant :

1. Un test `fetch` depuis une origine GitHub Pages réelle ou équivalente pour `/graph/embedding` et `/graph/statement/{id}` ; conserver code HTTP, en-têtes, réponse expurgée et capture de la console navigateur.
2. Des fixtures réelles pour recherche et voisinage, avec validation du sens des arêtes, de la pagination, de la gestion des nœuds absents, du schéma et du retour de noms Lean complets.
3. Un essai de résolution par nom Lean exact et par description sur au moins 20 requêtes fixées à l'avance ; mesurer rappel des candidates pertinentes dans les 10 premières, ambiguïtés et énoncés manquants. Objectifs initiaux : 100 % des noms exacts présents dans l'index et au moins 16 descriptions sur 20 avec une déclaration pertinente dans les 10 premières, sur un jeu de requêtes constitué avant l'essai. La liste et les résultats doivent être relisibles.
4. Trois traversées multi-niveaux de tailles différentes ; mesurer requêtes, temps, erreurs, volume transféré et temps avant le premier témoin. Vérifier si la source fournit une version et garantit l'exhaustivité du voisinage.
5. Si la voie A échoue, un prototype de voie B sur un instantané borné puis un chiffrage de l'ensemble Mathlib : taille publiée sous la limite GitHub Pages, transfert par requête, temps de recherche et temps de parcours. Vérifier la licence et les obligations d'attribution des jeux redistribués.

**Décision de sortie :** choisir une voie qui passe les essais navigateur et les budgets publiés. Si aucune voie ne permet la recherche par description et la consultation du graphe, arrêter la V1 complète et publier seulement un rapport de faisabilité ou un périmètre produit réduit explicitement accepté.

### 9.2 Corpus de validation sémantique

Constituer un corpus versionné d'au moins 30 déclarations : témoins directs, témoins indirects, induction, cas, choix, principes classiques, négations attendues, cycles, déclarations absentes et cas où l'énoncé est ambigu. Pour chaque cas : nom Lean, révision Mathlib, question, constat issu d'une inspection Lean ou d'une revue manuelle, verdict attendu **dans le graphe**, et limite d'interprétation. Les catégories « indice » sont évaluées séparément des déclarations exactes ; publier faux positifs, faux négatifs et cas non évaluables, sans choisir un seuil a posteriori.

### 9.3 V1 acceptée lorsque

- Le jalon 0 a retenu une source exploitable depuis le site statique et a archivé ses mesures.
- Un nom Lean exact retrouve la bonne déclaration dans l'instantané choisi ; la recherche par description satisfait le seuil de **16/20** fixé au § 9.1 sur le corpus préparé avant l'évaluation.
- Les questions sélectionnées ensemble reçoivent des états indépendants et vérifiables pendant une seule traversée.
- Chaque témoin possède un chemin court contrôlé, des arêtes `proof` dans le bon sens et une provenance versionnée.
- Une exploration limitée, interrompue ou en erreur n'est jamais présentée comme une absence de témoin.
- Les catégories non déterminables sont annoncées avant l'analyse ; aucun écran n'attribue une tactique ou une méthode à `T` sur la seule base d'un lemme indirect.
- Le site publié sur GitHub Pages passe les scénarios de navigation, de clavier, de pause/reprise et de partage sur un navigateur mobile et un navigateur de bureau.

## 10. Ordre de travail proposé aux coding agents

| Lot | Livrable vérifiable | Dépend de |
| --- | --- | --- |
| 0. Faisabilité | Rapport avec requêtes navigateur, fixtures, corpus de recherche, mesures, choix A/B | Aucun |
| 1. Contrats | Schémas normalisés, adaptateur de source choisi, validation de données et manifeste de version | 0 |
| 2. Registre | Catalogue de détecteurs documenté, résolu par identifiants dans l'instantané, cas de validation | 1 |
| 3. Moteur | Traversée par couches, reprise, budget, cache, export des chemins et tests d'invariants | 1–2 |
| 4. Interface | Recherche/confirmation, cartes, progression, chemin textuel, pause/reprise, états d'erreur | 1–3 |
| 5. Publication | Build GitHub Pages, tests navigateur finaux, documentation des sources et limites | 0–4 |
| 6. Recherche V2 | Prototype MathlibGraph et comparaison sémantique séparée | V1 validée |

Chaque lot doit fournir ses fixtures ou données d'essai minimales et une démonstration de son critère d'acceptation. Les agents ne doivent pas contourner un échec du lot 0 en ajoutant un backend, un proxy public ou une conclusion plus forte que ce que les données établissent.

## 11. Sources primaires à conserver avec le projet

- [Documentation API TheoremSearch](https://www.theoremsearch.com/docs) — points d'entrée de recherche et de voisinage ; les exemples de réponse doivent être vérifiés contre l'API réelle.
- [Article TheoremGraph](https://arxiv.org/html/2606.25363) — sens des arêtes `proof`/`sig`/`def` et filtrage de déclarations internes.
- [Jeu de données Math-Graph / LeanGraph](https://huggingface.co/datasets/jessteru/math-graph) — schéma, noms Lean complets et volumes de données.
- [Jeu de données MathlibGraph](https://huggingface.co/datasets/MathNetwork/MathlibGraph/blob/main/README.md) — instantané, schéma et métadonnées disponibles.
- [Documentation des limites GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) — contrainte de taille et de bande passante du site statique.
