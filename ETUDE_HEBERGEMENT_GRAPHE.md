# Faut-il héberger une copie interrogeable du graphe ?

État au 26 septembre 2026. Cette décision concerne une éventuelle V2 ; la V1 interroge directement l'API TheoremGraph via la réécriture Vercel déjà validée.

## Décision proposée

Garder l'API TheoremGraph comme source en V1. Le moteur s'arrête maintenant lorsque **tous les témoins nommés demandés pour une politique** ont été vus ; il ne développe plus les dizaines de voisins suivants pour confirmer un résultat positif. Il conserve la possibilité de poursuivre explicitement le graphe. Mesurer cette version sur des recherches réelles avant d'ajouter un second service : la recherche sémantique `/graph/embedding`, parfois lente, reste indépendante du coût de traversée.

Si ces mesures montrent encore une latence gênante ou si une recherche exacte par nom Lean devient prioritaire, le meilleur prototype de données hébergées serait **un sous-ensemble Mathlib du jeu TheoremGraph, figé et indexé dans Turso (SQLite hébergé), interrogé par une petite fonction Vercel**. Conserver `/graph/embedding` pour la découverte sémantique ; la base servirait au lookup exact et aux voisinages. Cette option nécessite une ingestion, des contrôles de version et un rapprochement des UUID avec l'API. Elle n'est pas un changement de fournisseur transparent.

## Données réutilisables

Le [jeu `jessteru/math-graph`](https://huggingface.co/datasets/jessteru/math-graph) publié sur Hugging Face contient `formal_dependency` (11,3 millions de lignes pour toutes les bibliothèques), des arêtes `src_id`, `dep_id`, `edge_type`, ainsi que les tables de déclarations et de provenance. Sa licence annoncée est CC BY 4.0. L'[étude locale](ETUDE_FAISABILITE_THEOREMGRAPH.md) a constaté 330 409 noms sur la partition `Mathlib_v427` et environ 1,05 Go de CSV brut pour *toutes* les arêtes formelles. La taille d'une base indexée limitée à Mathlib doit être mesurée ; on ne peut pas déduire qu'elle tiendra dans un quota à partir de la taille CSV.

Les UUID de sept déclarations ont coïncidé avec ceux de l'API lors de l'étude, mais l'API ne fournit pas d'identifiant d'instantané immuable pour une exploration. Il faut figer les tables de nœuds et d'arêtes sur le même export, vérifier les UUID et les types d'arêtes sur un corpus, puis afficher la version de ce jeu. Mélanger sans contrôle des arêtes locales et des voisins live peut fabriquer des chemins incohérents.

## Options de déploiement

| Option | Faisabilité pour Ouliproof | Exploitation et coût public actuel |
|---|---|---|
| API TheoremGraph + Vercel | **Retenue en V1.** Zéro base et zéro ingestion ; deux réécritures déjà testées. La latence et la disponibilité de l'API restent externes. | [Vercel Hobby](https://vercel.com/docs/plans/hobby) est gratuit pour un projet personnel et soumis à ses limites d'usage ; les réécritures n'exigent pas de fonction applicative. |
| Dataset Hugging Face seul | Bon dépôt public d'instantané ; **pas une API de traversée de graphe prête à l'emploi**. Le [Dataset Viewer](https://huggingface.co/docs/dataset-viewer/quick_start) expose lignes, recherche et filtres paginés à 100 lignes ; son [SQL Console](https://huggingface.co/docs/hub/datasets-viewer-sql-console) exécute DuckDB WASM dans le navigateur. Une clôture transitive avec chemins, budgets et pagination demanderait encore un moteur. | Pas de serveur à gérer, mais trafic, scans et assemblage côté client ; l'API documentée du Viewer n'est pas un endpoint de requête récursive arbitraire. |
| Hugging Face Space avec SQLite/FastAPI | Techniquement possible, mais ajoute un serveur et un démarrage après veille. Un dataset peut être attaché en lecture seule ; le disque ordinaire du Space est éphémère. | La [documentation Spaces](https://huggingface.co/docs/hub/spaces-overview) indique désormais qu'un nouveau Space Gradio ou Docker sur calcul requiert un plan payant ; les Static Spaces restent gratuits. Donc **pas le chemin gratuit le plus simple** pour un backend. |
| Turso + fonction Vercel | **Meilleur prototype si la V2 devient nécessaire.** Tables `nodes(id,name,source)` et `edges(src_id,dep_id,edge_type)` avec index sur `src_id`, et lookup exact par `name`. Une fonction Vercel garde le jeton Turso côté serveur. SQL récursif borné ou petits voisinages groupés. | Le [plan Turso Free](https://turso.tech/pricing) annonce 5 Go, 500 M de lignes lues et 10 M de lignes écrites par mois. L'import initial et les index comptent dans les écritures ; la partition Mathlib doit tenir dans ces quotas. La [fonction Vercel Hobby](https://vercel.com/docs/functions/limitations) a aussi un budget de durée et d'usage. |
| Cloudflare Worker + D1 | Faisable pour un sous-graphe, mais taille et import plus contraignants. Implique une seconde plate-forme si l'interface reste sur Vercel, donc CORS et deux déploiements. | [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) : 5 Go par compte, 5 M lignes lues/jour, 100 000 écrites/jour ; [500 Mo maximum par base](https://developers.cloudflare.com/d1/platform/limits/). Les quotas gratuits de lecture/écriture sont effectivement bloquants depuis [septembre 2026](https://developers.cloudflare.com/changelog/product/d1/). |
| Neo4j AuraDB Free | Les requêtes de chemin seraient naturelles, mais le palier gratuit est conçu pour apprendre/explorer et [limite les nœuds et relations](https://neo4j.com/pricing/). Rien ne prouve qu'il puisse contenir l'export Mathlib pertinent. | L'offre Professional commence à [65 USD/Go/mois](https://neo4j.com/pricing/) selon la page actuelle ; trop de coût et d'opérations pour le besoin V1. |

## Prototype discriminant avant toute migration

1. Mesurer sur 15 à 30 questions mathématiques confirmées : latence de `/embedding`, temps jusqu'au premier témoin, nombre de voisinages, taux d'erreurs et d'explorations limitées. Séparer les deux phases dans les mesures.
2. Si la traversée reste le facteur dominant, extraire **seulement** la partition Mathlib et les types `proof`/`def` du jeu publié. Construire localement un SQLite avec index `edges(src_id, edge_type)` et `nodes(name)` ; mesurer taille sur disque, temps de lookup, chemin et import.
3. Vérifier au moins les cas `Nat.add_comm → Nat.zero_add`, `Classical.em → Classical.choice` (via `def`) et plusieurs résultats d'analyse/topologie contre l'API live. Refuser la bascule si noms, UUID ou arêtes divergent sans explication de version.
4. Déployer un endpoint Turso/Vercel expérimental seulement si taille et quota d'import sont compatibles ; garder le routage TheoremGraph comme repli pendant l'essai. Ne mettre aucun jeton de base dans le navigateur.

Cette option hébergée réduit potentiellement les aller-retour pour les chemins et ajoute un lookup exact, mais elle introduit un instantané à maintenir. Elle ne résout pas à elle seule la recherche sémantique et ne révèle toujours pas les tactiques ou la structure interne des preuves.
