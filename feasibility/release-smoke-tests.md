# Ouliproof release smoke tests

Use the links below on the [local app](http://127.0.0.1:5187/). Each linked declaration must still be explicitly selected by the user before analysis begins. On a Vercel preview, replace `http://127.0.0.1:5187` with the preview origin and run the same checks.

The results below describe the current TheoremGraph graph snapshot and detector rules. Network timings and the number of extra nodes loaded can vary. A missing marker is never a conclusion that a proof does not use the method.

| # | Open and confirm | Ask | Expected observation |
| --- | --- | --- | --- |
| 1 | [`Submodule.pow_toAddSubmonoid`](http://127.0.0.1:5187/?id=f7861071-9a2b-4b77-a637-d1abb314430c&detect=induction) | Induction | `Graph witness`: direct `proof` edge to `Nat.recAux`, with a verified successor induction-hypothesis argument. A MathlibGraph `induction` record is separately labelled a cross-version lead. The graph highlights the path. |
| 2 | [`Submodule.pow_toAddSubmonoid`](http://127.0.0.1:5187/?id=f7861071-9a2b-4b77-a637-d1abb314430c&detect=case%20analysis) | Case analysis | `Graph witness`: direct `proof` edge to `Nat.casesAuxOn`, whose signature has zero and successor branches. MathlibGraph's `cases` record remains a separate lead. |
| 3 | [`Nat.add_eq_zero`](http://127.0.0.1:5187/?id=66b1e8d2-0ca6-4d33-bea6-e1463dc26ff8&detect=proof%20by%20contradiction) | Proof by contradiction | `Graph witness`: exact `Decidable.byContradiction` reference. The copy must not claim that the author wrote `by_contra`. |
| 4 | [`Submonoid.closure_irreducible`](http://127.0.0.1:5187/?id=063505ea-5719-4ed7-9f0e-1c5005e08728&detect=proof%20by%20contradiction) | Proof by contradiction | Direct graph witness and separate MathlibGraph `by_contra` lead. `False.elim` is related ex falso evidence, not independently a contradiction witness. |
| 5 | [`Classical.em`](http://127.0.0.1:5187/?id=46f9bdf2-6f17-43d0-9009-8485b2479ea2&detect=axiom%20of%20choice) | Axiom of choice | Exact path to `Classical.choice`, with `proof → proof → def` edges. Inspecting the path should focus the graph node. This takes more requests than the direct cases. |
| 6 | [`Nat.add_comm`](http://127.0.0.1:5187/?id=5546ccb4-5beb-4176-807a-cc42f622aa33&detect=depends%20on%20Nat.zero_add) | Named dependency | Exact `Nat.zero_add` dependency; path edges and graph highlight must agree. |
| 7 | [`Ideal.IsMaximal.isPrime'`](http://127.0.0.1:5187/?id=9514e3d4-a03f-456a-b23e-204e00966662&detect=induction) | Induction | `No marker observed` after the available proof-edge traversal is exhausted. The card must explicitly say that this does **not** establish absence. The live response has no outgoing `proof` edge from this root; its other returned edges must not be traversed as root dependencies. |
| 8 | [`CategoryTheory.Yoneda.fullyFaithful`](http://127.0.0.1:5187/?id=4ea4d1c7-f4f2-4373-a4c8-3b4642ec2875&detect=case%20analysis) | Case analysis | Another graph-coverage control: no root `proof` edge and no marker, with honest no-hit wording. |
| 9 | [Home](http://127.0.0.1:5187/) | Enter `does this use a spectral sequence?` | `No detector` is shown; no invented positive or negative method claim. |

## Preview deployment checks

1. Open the preview root, `/how-it-works`, and `/principle` directly. All should serve the app, including after a reload. Confirm that `/method-markers.json` returns the committed index and that the browser only loads it when a method question is analysed.
2. Run cases 1, 3, 5 and 7 in the preview browser. Verify candidate confirmation, result status, the path, graph inspection, and JSON export.
3. Request `/tg/graph/statement/66b1e8d2-0ca6-4d33-bea6-e1463dc26ff8?direction=src&formality=formal` through the preview host. Expect HTTP 200 JSON; inspect `x-vercel-cache` on two identical requests to verify the configured CDN behavior. Request `/tg/graph/embedding` with a mathematical query and verify the semantic search flow.
4. Simulate a failed `/method-markers.json` request and a failed or rate-limited `/tg` request. The UI should show incomplete evidence or an API error, not `No marker observed` as a definitive answer.
5. At a 390 px viewport, verify that the page has no horizontal document scroll and that the graph can still be panned or switched to list view.

The checked [validation report](method-validation.md) has the source audit, broader mathematical probes, and known scientific limits. Automated unit and traversal tests run with `npm test`; the production bundle runs with `npm run build`.
