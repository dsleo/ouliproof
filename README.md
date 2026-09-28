# Ouliproof

A web app for exploring dependencies between Mathlib declarations through the TheoremGraph API.

## Run locally

```bash
npm install
npm run dev -- --port 5187 --strictPort
```

Open [http://127.0.0.1:5187/](http://127.0.0.1:5187/). The [How it works](http://127.0.0.1:5187/how-it-works) page explains how to interpret the graph. Vite proxies `/tg/*` to `https://api.theoremsearch.com`, so searches and neighborhood requests require an internet connection. The app does not build or store a complete offline graph.

The demo server runs as the local `com.ouliproof.dev` service on port `5187`. Stop it with `launchctl bootout gui/$(id -u) /tmp/com.ouliproof.dev.plist`.

```bash
npm test
npm run build
```

The [Vercel configuration](vercel.json) rewrites API requests and the guide route. It caches neighborhood responses at the CDN for one hour; semantic search remains uncached. The site has not been deployed permanently. After a deployment, verify the CDN with real responses and the `x-vercel-cache` header (`MISS`, then `HIT`).

## Use the app

1. Search for a Lean name or describe a mathematical result. TheoremGraph returns semantic matches, so confirm the exact declaration before continuing.
2. Ask one or more questions. You can enter a Lean name, such as `depends on Nat.zero_add`, or select a suggested question.
3. Explore the observed path and navigable graph. Pause, resume, share a link, or export JSON. A shared link loads its declaration as a candidate and still requires confirmation.

The first five candidate names are loaded initially. You can show five more on demand. Neighborhood responses supply the Lean names because search results may use a generic name.

For named declarations, each response is processed as it arrives. Once every requested target for a traversal policy is found, pending concurrent requests are cancelled; their nodes remain available if you continue exploring. A found witness does not mean the entire dependency closure was visited. Only an exhausted traversal supports “no witness observed” in the neighborhoods returned during that API consultation.

The app can follow `proof` references, or both `proof` and `def` edges when the question specifies definitions. It cannot reliably determine whether the author used induction, case analysis, or proof by contradiction from these edges alone. Such questions are marked **undetermined**.

Each traversal is limited to 180 declarations or 100 seconds. A limit, pause, or API error never becomes a negative finding. Even an exhausted API traversal is not a Lean proof certificate.

Validated neighborhoods are cached in memory and IndexedDB for one hour, with at most 120 entries per layer. Browser storage is optional. A `429` triggers at most two retries, respecting `Retry-After` up to five seconds. Local performance counters distinguish search, candidate name loading, traversal, memory/browser cache hits, and API calls; they are not sent to a telemetry service.

## Code and decisions

- [src/api.ts](src/api.ts): API validation, timeouts, request sharing, memory cache, and bounded `429` retries.
- [src/neighborhoodCache.ts](src/neighborhoodCache.ts): bounded IndexedDB cache with expiration.
- [src/objectives.ts](src/objectives.ts): conservative interpretation of detection questions, including existing French shared links.
- [src/explorer.ts](src/explorer.ts): layer-by-layer traversal, distinct policies, paths, cancellation, and budgets.
- [src/App.tsx](src/App.tsx): search, confirmation, questions, results, and sharing.
- [src/GraphExplorer.tsx](src/GraphExplorer.tsx): navigable graph, node details, and list view.
- [src/HowItWorks.tsx](src/HowItWorks.tsx): standalone interpretation guide.

The earlier [API/Vercel study](SOLUTION_API_VERCEL.md), [real-world test log](TESTS_REELS.md), and [graph hosting study](ETUDE_HEBERGEMENT_GRAPHE.md) preserve the original French feasibility notes and V2 options.
