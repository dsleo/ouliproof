# Method detection validation — 2 October 2026

## What is implemented

Ouliproof searches TheoremGraph, asks the user to confirm a declaration, and traverses typed `proof` or `proof+def` edges with bounded, cached API requests. Reviewed graph constants can yield inspectable witnesses. A static, lazily loaded MathlibGraph index supplies exact tactic tokens for reached declaration names. A token is a **lead** because TheoremGraph does not expose the exact Mathlib source commit for its graph snapshot. The app records the path, source, rule, versions, and scan status; it never interprets an exhausted detector as mathematical absence. A confirmed graph witness ends an ordinary scan early. A cross-source tactic lead alone does not.

## Source and version audit

- [MathlibGraph's dataset card](https://huggingface.co/datasets/MathNetwork/MathlibGraph) reports Mathlib SHA `534cf0b` and Lean `v4.28.0-rc1`. GitHub's direct commit endpoint did not resolve the abbreviated SHA, but [commit search](https://github.com/leanprover-community/mathlib4/commit/534cf0b8f5267c3f20bf52f932ad5f9834187c35) resolved it to full SHA `534cf0b8f5267c3f20bf52f932ad5f9834187c35`, committed on 2 February 2026.
- The marker builder pins Hugging Face dataset revision `8c706461fe266802197b62af324de12a3f1aa7fb` and checks the tactic file SHA256 `3927807af5920b626b687565f415233219df017b5b1555a074a073809bff4f84`. It processed 235,586 rows and selected 13,243 declarations. The generated JSON is 1,892,108 bytes, about 198 KB with gzip. This file is a tactic lookup, not a hosted dependency graph.
- [TheoremGraph's API](https://www.theoremsearch.com/docs) returns labels such as `Mathlib_v427` and a declaration's name, kind, body, and edges. Our sampled live responses have no Mathlib commit or source module field. The public [paper-to-Lean-repository table](https://huggingface.co/datasets/uw-math-ai/math-graph/blob/main/paper_lean_repo.csv) also lacks a filled Mathlib revision for these labels. Exact proof identity with MathlibGraph is therefore unestablished. No tactic record is presented as a graph witness.

## Mathlib source checks

Run `python3 feasibility/audit_mathlib_source.py`. The checked [sample file](method-source-sample.json) contains ten induction, ten case-splitting, and ten contradiction declarations. For each, a declaration header and its recorded exact tactic token occur in the corresponding `.lean` file at the pinned full Mathlib commit. This checks source text around selected positive records; it does not measure detector recall, tactic expansion, or false-positive rate. The selection needed 15, 12, and 16 candidate records respectively to find ten source-text matches per category. For example, [`Submodule.pow_toAddSubmonoid`](https://github.com/leanprover-community/mathlib4/blob/534cf0b8f5267c3f20bf52f932ad5f9834187c35/Mathlib/Algebra/Algebra/Operations.lean#L327) directly uses both `induction` and `cases`.

Run `python3 feasibility/audit_cross_source.py`. Among those 30 source-matched names, 28 were exact-name results in the first 24 live TheoremGraph search results, and all 28 had compatible theorem kinds after normalizing TheoremGraph's `thm` to MathlibGraph's `theorem`. One search timed out and one did not surface the exact name in the first 24 results. This audit exposed and fixed an earlier adapter error that rejected `thm`/`theorem` matches. Neither matching names nor compatible kinds proves equal proof bodies; the TheoremGraph responses had no module or exact Mathlib commit.

## Live proof-chain examples

The browser flow was exercised from a linked candidate through explicit user confirmation, analysis, graph inspection, and mobile layout:

| Confirmed result | Question | Observed result |
| --- | --- | --- |
| `Submodule.pow_toAddSubmonoid` | induction | Direct `proof` edge to `Nat.recAux`; the fetched recursor signature has a successor induction-hypothesis argument. 2 neighborhoods checked, then early stop. The pinned source also records `induction` as a separate cross-version lead. |
| `Submodule.pow_toAddSubmonoid` | case analysis | Direct `proof` edge to `Nat.casesAuxOn`; the fetched signature has zero/successor branches without an induction-hypothesis argument. 3 neighborhoods checked, then early stop. |
| `Nat.add_eq_zero` | contradiction | Direct `proof` reference to `Decidable.byContradiction`. It is labeled as a named principle, not as a claim that the author wrote `by_contra`. |
| `Submonoid.closure_irreducible` | contradiction | Direct `proof` reference to `Decidable.byContradiction`, plus a separate MathlibGraph `by_contra` lead and related `False.elim` evidence. |
| `Classical.em` | axiom of choice | The previous live path to `Classical.choice` includes a `def` edge and appears only in the broader `proof+def` scope. |

The graph's “Inspect in graph” action selected `Nat.recAux` and highlighted the two witness nodes and one witness edge. At a 390 px mobile viewport, the analysis card and graph fit the available width; a decorative hero glyph caused 10 px of horizontal overflow, which was clipped.

## Broader mathematical searches

Run `python3 feasibility/probe_method_searches.py`; [raw results](method-search-results.json) are checked in. These are bounded, first-30-node live probes, not complete closure scans:

| Mathematical query | User-confirmed TheoremGraph result | Checked / pending | Time | Signal |
| --- | --- | ---: | ---: | --- |
| Compact maximum | `ContinuousOn.exists_isMaxOn'` | 30 / 45 | 15.23 s | None in scanned portion |
| Maximal ideal is prime | `Ideal.IsMaximal.isPrime'` | 1 / 0 | 0.92 s | None reported by this graph snapshot |
| Group of prime order is cyclic | `isCyclic_of_prime_card` | 30 / 26 | 14.61 s | None in scanned portion |
| Yoneda embedding is fully faithful | `CategoryTheory.Yoneda.fullyFaithful` | 1 / 0 | 1.18 s | None reported by this graph snapshot |
| Euclid's lemma | `Nat.Prime.dvd_or_dvd` | 30 / 39 | 14.01 s | `Decidable.byContradiction` at depth 4 |

The one-node topology/algebra/category-theory cases illustrate a proof-scope limit: some TheoremGraph declarations have no outgoing `proof` edges. `CategoryTheory.Yoneda.fullyFaithful` is a definition with 15 outgoing `def` references, which a proof-only scan excludes. The app now identifies this case and offers a broader definition-body scan. This broader scope can reach generic library definitions, so its paths must be inspected before attributing a method to the selected result. The benchmark is a Python proof-edge probe; its timings are remote-API observations and should not be interpreted as browser performance guarantees.

## Verification and remaining limits

- `npm test -- --reporter=dot`: 22 tests pass, including exact paths, `proof`/`def` scope, signature-edge exclusion, cycles, API failures, root metadata, kind normalization, recursor signatures, early stop and lead-only continuation.
- `npm run build`: production TypeScript and Vite build pass. The app remains local at `http://127.0.0.1:5187/`; no production Vercel deployment was requested in this phase.
- The detector catalog is intentionally narrow. Term proofs, tactics hidden by macros, and filtered/generated recursors can escape it. `False.elim` means ex falso, and `rcases` means destructuring; neither is upgraded to a stronger category without another witness.
- A same-source tactic claim would need a published TheoremGraph-label-to-Mathlib-commit map or independently established equal proof hashes. A source-aligned Lean extractor would also be needed for measured recall across proof methods.
