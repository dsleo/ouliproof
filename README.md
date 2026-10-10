# Leanage

**Leanage** is a focused explorer for the dependency graph behind Mathlib proofs. It helps researchers and Lean users identify a formal theorem, inspect what it depends on, and follow each graph path returned by TheoremGraph.

Leanage is one tool in the larger **Ouliproof** research project. The proof collection has moved to its own app and repository: [Proofscape](https://github.com/dsleo/proofscape).

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

1. Search for a Lean name or describe a mathematical result. TheoremGraph returns semantic matches, so confirm the exact declaration before continuing.
2. Ask one or more questions. Select induction, case analysis, proof by contradiction, or a dependency question such as `depends on Nat.zero_add`.
3. Inspect each graph witness or possible recorded-tactic signal and its dependency path. Open **Evidence details** for the source, rule, tactic token, and available revision labels. Pause or resume the traversal, and open the graph to explore the finding.

TheoremGraph offers semantic search, not a documented exact Lean-name endpoint. Leanage retains up to 20 Mathlib candidates from 48 formal search results. For natural-language queries, it loads the first five candidate names and loads more on demand. For a Lean-style name, it checks returned names in small batches until it finds an exact match or exhausts those candidates, and promotes a match to the top. A name that is absent from this semantic result set cannot be found by this workflow; try describing the mathematics instead. Neighborhood responses supply the Lean names because search results may use a generic name.

Each neighborhood is processed as it arrives. Once every selected question has a graph-backed witness, pending concurrent requests are cancelled; their nodes remain available if you continue exploring. A cross-source tactic lead alone does not stop the search. A found witness does not mean the entire dependency closure was visited. Even an exhausted traversal cannot establish the absence of a reasoning method, because the detector catalog and source metadata are incomplete.

The app follows `proof` references, or both `proof` and `def` edges for questions involving definition bodies. Exact, reviewed constants such as `Or.elim` and `Decidable.byContradiction` are graph witnesses. A compact [MathlibGraph](https://huggingface.co/datasets/MathNetwork/MathlibGraph) index adds per-declaration tactic records. A tactic record associated with a TheoremGraph path remains a **possible method signal** until both sources are tied to the same Mathlib proof revision. The two sources' versions and the exact token are shown in every such finding. `False.elim` is ex falso evidence, not proof of classical contradiction; `rcases` is related destructuring, not always a case split.

The compact static index is served with the app. Its source is pinned at MathlibGraph dataset revision `8c706461fe266802197b62af324de12a3f1aa7fb`, and its raw-file SHA256 is checked by the generator. The dataset card's abbreviated Mathlib commit `534cf0b` resolves to `534cf0b8f5267c3f20bf52f932ad5f9834187c35` in the public repository. Its tactic records remain leads because TheoremGraph has not published an exact Mathlib commit for the graph snapshots. To deliberately regenerate the index:

```sh
npm run build:method-index
```

This step streams the 45 MB raw tactic file during development or CI; users do not download it. The generated JSON is about 1.9 MB before compression and 198 KB with gzip. TheoremGraph remains a live API dependency. The source and limitations are detailed in [the method detection plan](PLAN_DETECTION_METHODS.md).

Each traversal is limited to 180 declarations or 100 seconds. A limit, pause, or API error never becomes a negative finding. Even an exhausted API traversal is not a Lean proof certificate.

Validated neighborhoods are cached in memory and IndexedDB for one hour, with at most 120 entries per layer. Browser storage is optional. A `429` triggers at most two retries, respecting `Retry-After` up to five seconds. Local performance counters distinguish search, candidate name loading, traversal, memory/browser cache hits, and API calls; they are not sent to a telemetry service.

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
