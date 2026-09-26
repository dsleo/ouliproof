# Essais de l’application avec l’API réelle

**Date :** 26 septembre 2026  
**Environnement :** serveur local Vite, navigateur Chromium automatisé, API TheoremGraph en direct via `/tg/*`.

| Recherche formulée | Déclaration confirmée | Question | Résultat observé |
| --- | --- | --- | --- |
| `Nat.add_comm` | `Nat.add_comm`, cinquième candidate lors de l’essai | Dépend de `Nat.zero_add` ? | Témoin direct `proof` ; clôture `proof` terminée à 17 déclarations. |
| « For every proposition p, either p or not p » | `Classical.em`, sixième candidate parmi d’autres versions du tiers exclu | Axiome du choix ? | Chemin `Classical.em → Classical.choose_spec → Classical.indefiniteDescription → Classical.choice` avec arêtes `proof → proof → def` ; clôture terminée à 55 déclarations. |
| « if a prime number divides a product then it divides one of the factors » | `Nat.Prime.dvd_mul`, quatrième candidate | Dépend de `Nat.Coprime.dvd_of_dvd_mul_left` ? + « récurrence » | Témoin direct `proof` ; récurrence « non déterminable ». Pause/reprise fonctionnelles ; limite à 180 déclarations atteinte ensuite avec 131 en attente sans masquer le témoin. |
| « A continuous real-valued function on a compact interval attains a maximum » | `ContinuousOn.exists_isMaxOn'`, première candidate | Dépend de `ContinuousOn.exists_isMinOn'` ? | Témoin direct `proof` affiché pendant l’exploration. Export JSON vérifié avec le chemin. |
| « Si un nombre premier divise un produit, il divise l’un des deux facteurs » | Liste de candidats contrôlée | Recherche en français | `Nat.Prime.dvd_mul` présent parmi les dix candidats. |
| Lien vers l’UUID de `Nat.add_comm` | Confirmation redemandée | Axiome du choix ? | Clôture `proof + def` terminée à 18 déclarations ; aucun témoin observé, avec réserve explicite sur la portée de ce résultat. |

**Limite de recherche constatée :** la requête littérale `Classical.em` n’a pas ramené cette déclaration parmi les 24 premiers résultats de l’API et a dépassé une fois l’ancien délai client de 45 secondes. Une formulation mathématique l’a ramenée au rang 6. Le délai client est passé à 90 secondes, et l’interface avertit lorsqu’un nom Lean demandé manque à la liste. Cela reste une limite de la recherche sémantique de l’API, pas une recherche exacte.

**Contrôles complémentaires :** affichage mobile iPhone 14 sans débordement horizontal (`scrollWidth = innerWidth = 400` CSS px), lien partagé chargeant le bon UUID et les questions avant confirmation, téléchargement JSON, pause/reprise, tests du moteur, compilation de production et audit des dépendances. Les essais ont porté sur des déclarations de théorie des nombres, de logique classique et d’analyse.

**Nouvelle carte et arrêt anticipé :** sur `Nat.add_comm → Nat.zero_add`, l’arrêt au témoin a laissé 1 voisinage chargé et 12 arêtes observées. L’action « Poursuivre l’exploration » a ensuite atteint la clôture `proof` avec 17 voisinages chargés et 34 arêtes. Recherche de nœud, sélection, vue liste, plein écran et affichage mobile à 400 px ont été contrôlés dans le navigateur.
