# Ouliproof: implementation plan for reasoning signals in dependency closures

Status: implementation baseline approved on 1 October 2026. This supersedes the category-detection parts of `PLAN_IMPLEMENTATION_ACTUALISE.md`, whose full offline TheoremGraph export is no longer the chosen architecture. The implementation is documented in `README.md`; the validation record identifies any remaining gaps.

## 1. Product question and exact meaning

Given a mathematician's description or Lean name, the app finds Mathlib candidates through TheoremGraph. The user **confirms the declaration** `T`. The user then chooses one or more things to look for anywhere in the dependency chain: a named constant, induction, case splitting, contradiction, classical choice, and eventually other clearly defined methods. The answer must show a **witness path**, its source, and the precise observation that triggered the category.

The question is existential: “Is there evidence of method M in the proof of `T` or in a proof/body reached from it?” It is **not** “Did the author write tactic M in the source of `T`?”, “Was M logically necessary?”, or “Is the entire mathematical result impossible without M?”. A dependency can have several proofs over time; this app studies the represented proof and dataset versions.

Two graph scopes must remain explicit:

- **Proof chain**: follow `proof` edges from `T`; this captures proof-term references to other declarations. The root itself is also inspected for source-level method metadata, but is labeled “in the selected proof”, not “in a dependency”.
- **Proofs and definition bodies**: follow `proof` and `def` edges, preserving the edge type in every path. This scope is useful for named primitives, especially `Classical.choice`. It has a broader interpretation: a proof can call a definition whose body contains a marker.

Never traverse `sig`, `field`, `extends`, or `docref` as if they were proof use. A positive answer is a witnessed observation; an exhausted search means “no matching marker observed in the scanned graph and detector coverage”, never “no induction/contradiction/choice in Lean”.

## 2. Evidence from existing sources

| Source | What it contributes | Material limit |
| --- | --- | --- |
| [TheoremGraph API and graph](https://www.theoremsearch.com/theorem-graph) | Semantic candidate search; per-declaration neighborhoods; typed `proof` and `def` paths; graph witness and selected Mathlib version. | No tactic script or method annotation. Its [formal extractor](https://arxiv.org/html/2606.25363) filters some generated recursors/matchers. A missing recursor is not evidence of no induction. |
| [MathlibGraph](https://huggingface.co/datasets/MathNetwork/MathlibGraph) | `tactic_usage.ndjson` records the tactics associated with named declarations. Its card reports Mathlib commit `534cf0b` (Lean `v4.28.0-rc1`), resolved to full SHA `534cf0b8f5267c3f20bf52f932ad5f9834187c35`. It can report that a reached lemma's recorded proof contains `induction`, `cases`, `by_contra`, etc. | Its graph is from a different extraction. A name match with TheoremGraph is **not** an established same-proof match. Tactic records are source metadata, not kernel witnesses or comprehensive proof-method classification. |
| [LeanDepViz](https://github.com/cameronfreer/LeanDepViz) | Useful later for a local, Lean-based validation harness and for ideas about graph display and policy checks. | Its published workflow builds/extracts a project graph with Lake and loads exported data; it does not supply a hosted, version-aligned tactic query service for arbitrary TheoremGraph IDs. |
| [Mathlib Initiative tactic and dependency datasets](https://huggingface.co/datasets/mathlib-initiative/mathlib-tactics) | Independent Lean extraction with tactic invocations, positions and goal states; a [companion dependency dataset](https://huggingface.co/datasets/mathlib-initiative/mathlib-const-dep) shares its Mathlib commit `d13f23b...`. Strong candidates for checking method-detector recall and a later same-source pipeline. | The tactic rows shown have module/position but no declaration name, and the published files are far larger than the compact index. Joining rows to declarations would require an additional pinned source-position map; they are not a drop-in live lookup. |

TheoremGraph's published API supports direct semantic search and outgoing neighborhoods, so we keep the existing Vercel external rewrite and browser cache. We do **not** export or host its complete graph. The Hugging Face dataset viewer currently reports a schema-configuration error; its raw file is accessible, but the viewer is not a dependable per-name query API. The app must not download the 45 MB raw tactic file during a user's analysis. The current Hugging Face repository revision observed for MathlibGraph is `8c706461fe266802197b62af324de12a3f1aa7fb`; the builder must pin a full immutable revision and verify the exact raw-file hash before publishing its index.

### Measured feasibility of a small supplement

On 29 September 2026, streaming the raw `tactic_usage.ndjson` file gave 235,586 records. Exact tactic-token filters for `induction` / `induction'` / `fun_induction`, `cases` / `cases'` / `by_cases` / `by_cases'` / `rcases`, and `by_contra` / `by_contra!` / `contradiction` / `exfalso` / `absurd` selected 13,243 distinct names. A straightforward map containing name, module, kind and matched tokens was 1,763,066 bytes of JSON and 177,469 bytes with gzip. The category counts before de-duplicating across categories were 3,389 induction, 9,959 case-analysis, and 991 contradiction records. These are **dataset coverage counts**, not detector accuracy or counts of validated cross-source joins. They justify one lazy-loaded, static marker index as the simplest candidate. `obtain` and `rintro` were deliberately excluded from case-split detection: these names alone do not establish a branch.

## 3. Detection rules and language

Keep three kinds of evidence separate. A card may show multiple kinds at once, with no unexplained aggregate confidence score.

| Signal | Initial rule | Allowed finding | Never infer |
| --- | --- | --- | --- |
| Named declaration | Exact Lean name on a typed TheoremGraph path, e.g. `Classical.choice`, `propext` | “The selected graph reaches `X` through this path.” | That `X` is a minimal axiom set or that the theorem cannot be proved without it. |
| Induction tactic record | Exact `induction`, `induction'`, or `fun_induction` token in a matched MathlibGraph declaration; root or a reached proof node. | “The MathlibGraph snapshot records `induction` in the proof of `A`; TheoremGraph reaches a declaration named `A`.” This is a *cross-source method signal* until versions are established. | That the selected TheoremGraph proof itself uses that tactic, that all induction forms are covered, or that induction is necessary. |
| Recursor reference | Curated exact names of structurally inductive recursors on a `proof` or `def` edge, **only after testing each name and type**. | “This proof/body references recursor `R`.” Secondary structural hint for induction/recursion. | That the author wrote `induction`; a mere name substring `rec` must never trigger a result. |
| Case-split tactic record | Exact `cases`, `cases'`, `by_cases`, `by_cases'`; show `rcases` separately as destructuring because it need not branch. | “The pinned source records tactic `cases`/`by_cases` in `A`.” | That every `rcases` or `obtain` entails a genuine branch. |
| Elimination reference | Exact reviewed primitives such as `Or.elim` on a proof path. | “Proof references disjunction elimination” or another explicitly named elimination. | That this came from a specific source tactic or that every case split is visible this way. |
| Contradiction tactic record | Exact `by_contra`, `by_contra!`, or `contradiction` token. `exfalso` and `absurd` get separate labels. | “The pinned source records this tactic in `A`.” | That `False.elim` alone proves classical contradiction or `by_contra` specifically. |
| Contradiction principle reference | Curated exact names, e.g. `Decidable.byContradiction`, with a typed path. | “Proof references `Decidable.byContradiction`.” | That a reference to `False.elim` is a classical argument. |

The UI must distinguish **case splitting**, **destructuring**, **deriving False**, and **classical contradiction**. These should not be collapsed into a single vague “reasoning type”. Record the exact token or constant that matched and the detector rule version. Avoid generic substring, lemma-name, `top_tactic`, LLM-only, or `simp`/`omega` heuristics as positive evidence. Source tactics may be hidden in macros or term proofs, and `top_tactic` omits non-dominant tactics; a no-hit is therefore weak.

## 4. Version joining is the central correctness gate

TheoremGraph serves labeled sets such as `Mathlib_v427`, `Mathlib_v428`, and `Mathlib_v429`; a live `Nat.add_comm` response is labeled `Mathlib_v427`. MathlibGraph reports short Mathlib SHA `534cf0b`, resolved to full SHA `534cf0b8f5267c3f20bf52f932ad5f9834187c35`. A shared Lean major/minor label does **not** prove identical Mathlib source or proof bodies.

The join key for a method record is `Lean name + declaration kind + source module + source revision`. The first three can screen out obvious mismatches. The fourth needs independent validation. Adopt these statuses:

1. **Same-source verified**: the TheoremGraph graph/version is tied to the identical Mathlib git commit (or to a demonstrably identical declaration source/proof hash). The UI may say “This reached dependency's recorded proof uses tactic `t`.”
2. **Compatible but unverified**: version family, name, kind, module and, where available, statement agree; exact proof identity is not established. Show “possible method signal from another Mathlib snapshot”, with both versions and no categorical yes.
3. **Known mismatch or unknown**: version differs, declaration metadata conflicts, or information is missing. Show the external record in an optional “related source evidence” area, never as a confirmed witness in the chosen graph.

Before enabling any tactic category as a categorical result, inspect TheoremGraph dataset metadata/API for exact source revisions and compare a stratified sample of source declarations. If there is no reliable mapping, the first release still delivers useful **labeled heuristic leads** plus exact graph references. It must not silently combine snapshots. In particular, a graph path plus a name in the static tactic index is not a single-version proof witness by itself.

For direct proof-method checks, include the root's metadata. For “in a dependency” queries, require at least one `proof` edge before examining a reached proof; a `def` edge yields a separate “in a reached definition” result. Do not conflate these scopes.

## 5. Minimal deployment architecture

```text
TheoremGraph live REST API
  ├─ semantic search → user confirms T
  └─ neighborhoods → bounded typed traversal → witness paths + visible graph

Pinned MathlibGraph tactic_usage.ndjson (build/update time only)
  └─ validated filter → versioned static method-markers.json (about 177 KB gzip in probe)
                           ↓ lazy load and exact-name lookup

Vercel static site + current external /tg rewrites + CDN/browser caches
```

The marker index is a **tiny derived metadata artifact**, not an offline TheoremGraph snapshot or a second graph. It is generated with a pinned Hugging Face dataset commit and checked source SHA256; the resulting artifact and manifest are committed or otherwise published with the site, with source attribution and license. No additional always-on backend, graph database, Hugging Face Space, or raw 45 MB browser download is needed. Rebuild it only when intentionally updating the source/detector version; ordinary app deployments use the checked artifact. Hosting can stay on Vercel's static tier and current TheoremGraph rewrite. The current app's search, candidate confirmation, graph viewer, and neighborhood cache are reused.

If an aligned tactic source later becomes available, the same static index format can carry multiple revisions or replace the pinned file. A hosted graph database is justified only after measured API latency/cost or coverage makes this approach inadequate; it is not a prerequisite for these categories.

## 6. Traversal and answer algorithm

1. Keep a single shared neighborhood cache and a **single traversal for all selected detectors**, with explicit path policies (`proof` and `proof+def`). The current implementation runs one traversal per policy; reuse fetched neighborhoods and avoid competing requests. Do not let a broader path silently satisfy a proof-only question.
2. Use breadth-first layers and bounded concurrency (start from the current two requests; tune against live API limits). Evaluate every selected detector when the root or an outgoing node is discovered. A provisional witness can appear immediately. Claim “nearest” only after the preceding BFS layer is fully processed. Keep parent IDs and edge types for each policy; detect cycles.
3. In **find one witness per question** mode, stop issuing new requests as soon as all selected questions have suitable witnesses. Abort unused in-flight requests when safe. If a question has only a cross-version lead, it is not satisfied as a confirmed witness. Offer “continue exploration” to find more paths or inspect the graph.
4. Track `visited`, `frontier`, in-flight, source versions, request and time budgets, failed nodes, selected scopes, and match coverage. Pause/resume without losing the current graph. A limit, error, mixed version, or missing target yields `partial`, never a negative verdict.
5. Store a structured evidence record: `{category, detectorVersion, ruleId, source, sourceRevision, graphSourceLabel, joinStatus, matchedName, matchedToken, nodeId, path:[{from,to,edgeType}], distance, location:root|dependency|definition, scanStatus}`. Every displayed path must be reconstructible and locally validated from the graph edges actually received.
6. Persist only bounded, version-keyed neighborhood and marker caches. Measure requests, bytes and first-witness latency. Respect 429/retry headers and concurrency ceilings. The app should not hide a source outage behind a “no signal” result.

The proof closure is not guaranteed small. The existing budget of 180 nodes/100 seconds remains an initial guard, not a completeness promise. Expose its limit, scanned node count and resumable frontier. A negative category answer must say “no detector hit in N scanned declarations” even if that frontier empties: both source and rules are incomplete.

## 7. Interface and researcher workflow

- Main page: concise result search, candidate confirmation, and method selector with plain names and short scope notes. Preserve the dedicated How it works page for methodological details.
- Analysis page: one row/card per selected question with **Observed / Possible lead / No marker observed / Partial / Source mismatch**. Show direct or indirect, proof or definition, exact token/constant, detector version, both data versions, and a readable shortest verified path. Keep “recorded tactic” distinct from “proof-term reference”.
- Graph: highlight the witness path in the navigable graph; allow opening the matched declaration and other observed witnesses. A large closure remains progressively loaded, with an accurate loaded/scanned count rather than a fictitious complete graph.
- Export/share: include root TheoremGraph ID, source label, query scopes, detector/index versions, path edges, join status and scan status. A shared URL reruns the analysis; an explicit JSON export freezes observed evidence.
- Error copy: tell the user when the API is slow or rate-limited, the tactic index is unavailable, or the snapshot cannot be joined. Do not downgrade such states to “none”.

Example copy:

> **Induction — possible lead.** The TheoremGraph proof chain reaches `Submodule.pow_toAddSubmonoid`. MathlibGraph records `induction` for a declaration of that name at Mathlib revision `534cf0b8f526`. The graph snapshot's exact Mathlib commit has not been verified. The two records may describe different proofs.

When the exact source revision is verified, this changes to “Induction tactic recorded in this reached dependency's proof”, with the same path and source token.

## 8. Validation before release

### Data and join tests

- Generator uses an immutable Hugging Face revision, verifies SHA256/schema/counts, detects duplicate declaration names, writes deterministic JSON and a manifest, and checks output size in CI. A source format change fails loudly.
- Compare at least 30 real declarations across induction, cases, contradiction and no-record controls from the same Mathlib revision where possible. Verify the tactic token against Mathlib source. Separate tactic-extractor omissions, matching errors, and method-rule errors.
- For at least 10 declarations present in both sources, compare name, kind, module and statement; attempt to establish the exact TheoremGraph Mathlib commit. A discrepancy disables same-source status for that version. Report the join match and mismatch rates; do not estimate accuracy by looking only at positive hits.

### End-to-end examples

- `Nat.add_eq_zero` has a direct TheoremGraph `proof` reference to `Decidable.byContradiction`: show a named principle, not an unqualified source-tactic claim.
- `Nat.eq_zero_of_add_eq_zero` has `False.elim`: label deriving False / ex falso; do not label it `by_contra` from this edge alone.
- `Classical.em` reaches `Classical.choice` only under a path that includes a `def` edge in the previous API probe: verify the path policy and show the exact edge sequence.
- `Submodule.pow_toAddSubmonoid` has `induction` and `cases` in the MathlibGraph tactic file; `Submonoid.closure_irreducible` has `by_contra`. Exercise these as real source-level method records, and verify TheoremGraph reachability/version before presenting them as closure findings.
- Include advanced algebra, topology/analysis, category theory, number theory, and foundational examples chosen from actual mathematical searches. Record both successful and unsuccessful candidate retrieval and graph traversal timings. Avoid a benchmark made solely of `Nat.*` or synthetic fixtures.
- Synthetic graph tests cover out-of-order responses, cycles, `sig` exclusion, mixed `proof`/`def`, partial/failed responses, no false nearest witness, multi-question early stop, and resume.

Release gates: no cross-snapshot categorical claims; no uncited method hit; no “absence of induction” wording; search always asks for user confirmation; marker index remains small enough to load lazily; app operates on Vercel with TheoremGraph live; realistic benchmark logs are checked in. Where a gate fails, ship that detector as a clearly marked experimental lead or leave it disabled, without weakening the other validated detectors.

## 9. Work packages for coding agents

1. **Source and version audit** — pin dataset revision/hash, investigate TheoremGraph release-to-commit mapping, collect cross-source sample, publish a join-status report. No UI claims before this gate.
2. **Static marker builder** — deterministic raw-file parser, precise token catalog, compact artifact, manifest, provenance, size checks and attribution. Commit only the derived small artifact.
3. **Detection core** — typed evidence model, exact graph rules, tactic lookup, version gate, root/dependency/definition semantics, layer-correct multi-objective traversal and early stop.
4. **Research UI** — method selector, scoped status text, evidence paths, highlighted navigable graph, continue button, source details and export/share metadata. Keep the landing page short.
5. **Evaluation and release** — realistic mathematical corpus, Lean/source spot checks, live TheoremGraph runs, browser QA, performance numbers, failure-state tests and Vercel preview verification.

The first release after this work should support **positive, inspectable signals** for induction, case splitting and contradiction, with exact declaration references where TheoremGraph exposes them and tactic records where version joining permits. It should be honest when the joined sources only support a lead. That is already a useful Oulipo-of-math research tool; a definitive proof-method certificate would require a version-aligned Lean extractor and stronger semantics in a later phase.
