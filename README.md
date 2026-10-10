# Leanage

**Leanage** is a focused explorer for the dependency graph behind Mathlib proofs. It helps researchers and Lean users identify a formal theorem, inspect what it depends on, and follow each graph path returned by TheoremGraph.

## Run locally

```sh
npm install
npm run dev -- --port 5187 --strictPort
```

Open [http://127.0.0.1:5187/](http://127.0.0.1:5187/). [How it works](http://127.0.0.1:5187/how-it-works) explains the workflow, evidence, and limits. Vite proxies `/tg/*` to `https://api.theoremsearch.com`, so searches and neighborhood requests need an internet connection. Leanage does not build or store a complete offline graph.

```sh
npm test
npm run build
```

Vercel serves the app at [https://leanage.vercel.app](https://leanage.vercel.app). The configuration rewrites the guide route. The site caches neighborhood responses at the CDN for one hour; semantic search remains uncached.

## Use Leanage

```mermaid
flowchart LR
    A[Search a theorem] --> B[Confirm its Mathlib declaration]
    B --> C[Ask about a method or dependency]
    C --> D[Explore the returned proof path]
```

Search is semantic, so confirm the exact declaration. A graph path is evidence from TheoremGraph, not a proof certificate or a complete dependency closure. Recorded tactic matches are possible signals; their source revisions may differ. See [How it works](https://leanage.vercel.app/how-it-works) for interpretation and limits, and the [method detection plan](PLAN_DETECTION_METHODS.md) for source details.

## Code and decisions

- [src/api.ts](src/api.ts): API validation, timeouts, request sharing, memory cache, and bounded `429` retries.
- [src/neighborhoodCache.ts](src/neighborhoodCache.ts): bounded IndexedDB cache with expiration.
- [src/objectives.ts](src/objectives.ts): interpretation of method and exact-name questions, including existing French shared links.
- [src/methods.ts](src/methods.ts): exact graph rules, tactic metadata, version-aware evidence, and source attribution.
- [scripts/build_method_index.py](scripts/build_method_index.py): pinned, reproducible compact index builder.
- [src/explorer.ts](src/explorer.ts): layer-by-layer traversal, distinct policies, paths, cancellation, and budgets.
- [src/App.tsx](src/App.tsx): search, declaration confirmation, and traversal coordination.
- [src/WorkflowSections.tsx](src/WorkflowSections.tsx), [src/CandidateSection.tsx](src/CandidateSection.tsx), [src/ResultsSection.tsx](src/ResultsSection.tsx), and [src/Findings.tsx](src/Findings.tsx): candidate search, questions, and evidence presentation.
- [src/GraphExplorer.tsx](src/GraphExplorer.tsx): navigable graph, node details, and list view.
- [src/HowItWorks.tsx](src/HowItWorks.tsx): standalone interpretation guide.

The earlier [API/Vercel study](SOLUTION_API_VERCEL.md), [real-world test log](TESTS_REELS.md), and [graph hosting study](ETUDE_HEBERGEMENT_GRAPHE.md) preserve the original French feasibility notes and V2 options.

The [method validation record](feasibility/method-validation.md) contains source checks and live results on mathematical examples.
