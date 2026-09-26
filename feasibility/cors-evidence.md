# Vérification CORS dans un navigateur

Date : 25 septembre 2026. Navigateur : Chromium via `agent-browser`.

Origine chargée : `https://tpdorsey.github.io/sample-docs-project/` (réponse HTTP 200, servie par GitHub Pages, sans en-tête `Content-Security-Policy`).

Dans la console de cette page, les deux appels suivants ont échoué :

```js
await fetch('https://api.theoremsearch.com/graph/embedding?query=Nat.add_comm&n_results=2&formality=formal')
await fetch('https://api.theoremsearch.com/graph/statement/3ed0f0c3-7f4d-4356-a1ad-9f60c1fbfd32?direction=src&formality=formal')
```

Résultat dans les deux cas : `TypeError: Failed to fetch` (environ 8,2 s pour la recherche et 0,85 s pour le voisinage lors de cet essai).

Vérification des en-têtes HTTP avec `Origin: https://tpdorsey.github.io` :

```text
GET /graph/statement/{id}             HTTP 200
Access-Control-Allow-Origin           absent

OPTIONS /graph/embedding?...          HTTP 400
Access-Control-Allow-Methods          GET
Body                                  Disallowed CORS origin
```

Un premier essai avec `https://jekyll.github.io/` avait aussi échoué, mais cette URL renvoyait une page GitHub Pages 404 avec `connect-src 'self'`. Son résultat n'a pas été utilisé pour établir la conclusion CORS.
