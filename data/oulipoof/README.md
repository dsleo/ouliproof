# Oulipoof proof-diversity collection

This is a research resource for studying **how proofs of the same mathematical statement differ**. It aligns multiple informal proof texts, and human/prover Lean pairs, while preserving their source and validation provenance.

The question is broader than correctness: do available proofs instantiate distinct mathematical ideas, present the same idea differently, or differ mainly in form, granularity, or proof language? That distinction matters for proof generation, retrieval, theorem-prover training, mathematical explanation, and human evaluation of AI-produced proofs.

## What the collection offers

The pinned build has 9,962 statement records:

| Track | Records | Alignment | Source evidence |
| --- | ---: | --- | --- |
| Informal | 6,384 | Two or more natural-language proof texts for one source statement | Text-distinct candidates or published proof texts |
| Formal Lean | 3,578 | Human Lean proof and prover Lean proof for one problem | Both tracks marked valid by the NuminaMath source under Lean 4.15.0 |

The informal track combines 119 ProofRank problems, 1,606 ProofWiki theorems, and 4,659 Nemotron problems. The formal track consists of valid human/prover pairs from NuminaMath Lean Proof Artifacts. Pinned revisions and input hashes are in [`manifest.json`](manifest.json).

The collection separates three kinds of diversity evidence:

1. **Text diversity.** ProofWiki and Nemotron retain multiple texts distinct after whitespace normalization. This supports retrieval, clustering, and candidate-selection research. It does not establish distinct mathematical methods.
2. **Source-assigned method groups.** For 114 of 119 ProofRank problems, summaries align with group labels and method fingerprints released in ProofRank outputs. These model-generated source annotations are useful weak supervision, not expert-verified method labels.
3. **Formal proof divergence.** Lean pairs contain distinct retained code and were accepted by the source validation pipeline. They support analysis of syntax, tactic, and implementation differences without conflating them with an unverified proof. They do not by themselves prove a difference in mathematical idea.

The appropriate hierarchy of claims is therefore: *different strings*; *different source-assigned method groups*; and *different valid formal implementations*. The collection does **not** provide a universal gold standard for semantic proof-method diversity.

## Curated famous-result seed

[`featured-results.json`](featured-results.json) is a separate curation layer for experiment design. It connects 30 existing ProofWiki texts to manually written strategy descriptions for five familiar results:

- Pythagoras's theorem
- the irrationality of \(\sqrt{2}\)
- Fermat's little theorem
- the fundamental theorem of algebra
- unique prime factorization

These cases expose visibly different argument families: dissection, similarity, trigonometry, parity, descent, orbit counting, finite-group reasoning, complex analysis, and induction. Labels are research metadata, not correctness certificates; the underlying text remains the cited ProofWiki source. They are intentionally kept out of the production explorer while their use in an expert study is validated.

## Recommended uses

- Evaluate whether a retrieval system returns genuinely varied proof candidates for a fixed statement.
- Compare diversity estimators based on text embeddings, generated method labels, Lean syntax, tactic sequences, and expert judgments.
- Study when proof generators produce paraphrases of one idea versus several approaches.
- Measure whether formal proof differences correspond to differences mathematicians recognize as explanatory or strategic.
- Build human studies that measure correctness, distinctness, and preference separately.

## Limits researchers should preserve

- A record aligns proofs within one source-defined statement group; it does not match equivalent statements across datasets.
- Informal proof texts are source records, not newly verified proofs. Their validation field is `null`.
- The retained Lean profile omits proof trees and tactic traces; it retains full Lean source and the extracted main-theorem proof body.
- Method labels have different provenance across tracks. Model their source, annotator type, and confidence explicitly.
- Source selection differs substantially: published wiki material, competition-style problems, generated candidates, and formalization artifacts. Do not generalize across tracks without modeling provenance.

## Data layout and reproducibility

`informal.jsonl` has one row per source statement, with statement text, identifiers and URLs, proof texts, and source metadata. `formal.jsonl` contains the problem, formal statement, and human/prover Lean tracks. Both files are generated locally and ignored by Git; the manifest records their byte sizes and SHA-256 hashes.

```bash
python3 -m pip install -r scripts/requirements-seed.txt
python3 scripts/build_seed_dataset.py
python3 scripts/prune_collection_for_ui.py
```

Reproducible research should start from the JSONL files, this README, the manifest, and the pinned source revisions.

## Provenance and redistribution

ProofWiki is CC BY-SA 3.0; Nemotron Math Proofs v2 is CC BY 4.0; NuminaMath Lean Proof Artifacts is Apache-2.0 with upstream attribution context. The public ProofRank base dataset card does not specify a license; its separate outputs dataset is CC BY-NC-SA 4.0. Preserve attribution and consult upstream terms before redistributing a derivative release.

Sources: [ProofRank](https://huggingface.co/datasets/INSAIT-Institute/ProofRank), [ProofRank outputs](https://huggingface.co/datasets/Anon539823983/ProofRank-outputs), [ProofWiki Math](https://huggingface.co/datasets/avewright/proofwiki-math), [Nemotron Math Proofs v2](https://huggingface.co/datasets/nvidia/Nemotron-Math-Proofs-v2), and [NuminaMath Lean Proof Artifacts](https://huggingface.co/datasets/iiis-lean/NuminaMath-LEAN-Proof-Artifacts).
