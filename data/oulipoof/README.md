# Oulipoof proof-diversity collection

This is a research resource for studying **how proofs of the same mathematical statement differ**. It aligns multiple informal proof texts, and human/prover Lean pairs, while preserving their source and validation provenance.

The question is broader than correctness. Do available proofs instantiate distinct mathematical ideas, present the same idea differently, or differ mainly in form, granularity, or proof language? 

## What the collection offers

The pinned build has 9,962 statement records:

| Track | Records | What each record brings together |
| --- | ---: | --- |
| Informal | 6,384 | Two or more proof texts for one statement |
| Formal Lean | 3,578 | A human Lean proof and a prover Lean proof for one problem |

The informal track combines 119 ProofRank problems, 1,606 ProofWiki theorems, and 4,659 Nemotron problems. The Nemotron proofs are synthetic model-generated candidates. 
The formal track consists of human/prover pairs from NuminaMath Lean Proof Artifacts.

There are two different levels of diversity in the data:

1. **Multiple proof artifacts.** ProofWiki and Nemotron texts differ after whitespace normalization. Lean records contain two distinct, source-validated implementations. This is a useful starting point for retrieval, clustering, and generation work, but it does not establish that two proofs use different mathematical ideas.
2. **Method labels, where available.** For 114 of 119 ProofRank problems, summaries align with group labels and method fingerprints released in ProofRank outputs. They offer useful weak supervision, but they are model-generated source annotations rather than expert-verified labels.

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


## Data layout and reproducibility

`informal.jsonl` has one row per source statement, with statement text, identifiers and URLs, proof texts, and source metadata. `formal.jsonl` contains the problem, formal statement, and human/prover Lean tracks.

```bash
python3 -m pip install -r scripts/requirements-seed.txt
python3 scripts/build_seed_dataset.py
python3 scripts/prune_collection_for_ui.py
```


## Provenance and redistribution

ProofWiki is CC BY-SA 3.0; Nemotron Math Proofs v2 is CC BY 4.0; NuminaMath Lean Proof Artifacts is Apache-2.0 with upstream attribution context. The public ProofRank base dataset card does not specify a license; its separate outputs dataset is CC BY-NC-SA 4.0. Preserve attribution and consult upstream terms before redistributing a derivative release.

Sources: [ProofRank](https://huggingface.co/datasets/INSAIT-Institute/ProofRank), [ProofRank outputs](https://huggingface.co/datasets/Anon539823983/ProofRank-outputs), [ProofWiki Math](https://huggingface.co/datasets/avewright/proofwiki-math), [Nemotron Math Proofs v2](https://huggingface.co/datasets/nvidia/Nemotron-Math-Proofs-v2), and [NuminaMath Lean Proof Artifacts](https://huggingface.co/datasets/iiis-lean/NuminaMath-LEAN-Proof-Artifacts).
