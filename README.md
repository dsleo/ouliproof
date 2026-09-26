# Ouliproof

Application web locale pour explorer les dépendances de déclarations Mathlib exposées par l’API TheoremGraph.

## Démarrer

```bash
npm install
npm run dev -- --port 5187 --strictPort
```

Ouvrir [http://127.0.0.1:5187/](http://127.0.0.1:5187/). Le serveur Vite relaie localement `/tg/*` vers `https://api.theoremsearch.com`. Une connexion Internet est nécessaire pour les recherches et les voisinages. Aucun jeu de données du graphe n’est construit ou stocké hors ligne.

Pour la session de démonstration, le serveur est lancé comme service local `com.ouliproof.dev` sur le port `5187` afin qu’il reste disponible après la fin de la tâche. Il peut être arrêté avec `launchctl bootout gui/$(id -u) /tmp/com.ouliproof.dev.plist`.

```bash
npm test
npm run build
```

La configuration [vercel.json](vercel.json) applique les deux mêmes réécritures lors d’un futur déploiement Vercel. Le site n’a pas été déployé de manière permanente.

## Parcours

1. Saisir un nom Lean ou une description mathématique et choisir une ou plusieurs questions.
2. Attendre la recherche sémantique, comparer les candidats, puis **confirmer** la déclaration voulue. Les noms Lean des candidats proviennent de leur voisinage API, car le champ `name` de la recherche peut être générique.
3. Lancer l’analyse. Les chemins apparaissent pendant l’exploration ; pause, reprise, copie du lien et export JSON sont disponibles. Un lien partagé recharge la déclaration comme candidate et demande une nouvelle confirmation.

Les questions V1 prises en charge sont une déclaration Lean nommée dans les arêtes `proof`, et `Classical.choice` ou une autre déclaration nommée dans `proof + def` si la question utilise la forme « définitions vers X ». Les demandes sur la récurrence, l’analyse par cas ou la tactique de l’absurde reçoivent une explication « non déterminable » : le graphe ne permet pas de les attribuer de façon fiable à la preuve écrite.

L’exploration s’arrête à 180 déclarations ou 100 secondes par politique. Une limite, une pause ou une erreur n’est jamais présentée comme une absence de témoin. Les résultats négatifs concernent uniquement les voisinages retournés par l’API pendant cette consultation ; ce ne sont pas des certificats Lean.

## Architecture

- [src/api.ts](src/api.ts) : adaptateur de l’API réelle `{root,nodes,edges}`, validation, délais, cache mémoire.
- [src/objectives.ts](src/objectives.ts) : interprétation prudente du champ « Que détecter ? ».
- [src/explorer.ts](src/explorer.ts) : parcours par couches, politiques distinctes, chemins et budgets.
- [src/App.tsx](src/App.tsx) : recherche, confirmation, questions, résultats et partage.
- [src/design.css](src/design.css) : interface responsive « carnet de recherche ».

La [solution et ses limites](SOLUTION_API_VERCEL.md) ainsi que le [journal des essais réels](TESTS_REELS.md) documentent les décisions de V1.
