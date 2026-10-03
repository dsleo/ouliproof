# Oulipoof seed collection

Build locally with:

```bash
python3 -m pip install -r scripts/requirements-seed.txt
python3 scripts/build_seed_dataset.py
```

The extractor pins four Hugging Face repository revisions and checks every input file against its published SHA-256 before processing. It writes `informal.jsonl`, `formal.jsonl`, and `manifest.json` here. Generated JSONL files and temporary downloads are ignored by Git because they are large. `manifest.json` records input revisions, file hashes, licenses, and extraction counts.

The current pinned build contains 6,384 informal rows (119 ProofRank, 1,606 ProofWiki, 4,659 Nemotron) and 3,578 formal human/prover pairs. The Nemotron extractor scanned 82,737 source records, including 24,696 proof candidates. ProofWiki's maximum is 61 distinct texts for one theorem; Nemotron's maximum is 14 for one problem. These are text counts, not counts of distinct mathematical methods.

## Meaning of a row

`informal.jsonl` has one row per source statement, within each source. ProofRank contributes solution summaries; ProofWiki contributes published proof text; Nemotron contributes generated proof candidates. ProofWiki and Nemotron rows have at least two texts distinct after whitespace normalization. This is **text diversity**, not a claim that the arguments use different methods or are correct. ProofRank summaries describe human-written solutions; authorship of the summary text is unknown. For 114 of 119 ProofRank problems, the summaries align exactly with the separately released human-solution method clustering output; those proofs carry source model-assigned method group names and fingerprints. Three clustering outputs are unavailable and two have a summary-count mismatch, so those five problems remain unlabeled. The method groups are LLM judgments, not verified proof classifications. `validation_status` is null for all informal proofs. Publication and benchmark selection appear in separate fields.

`formal.jsonl` contains NuminaMath rows whose human and prover proof tracks were both marked `valid` by the source's Lean 4.15.0 validation. It excludes pairs with identical main-theorem proof bodies when both source splits are valid, and otherwise compares full code while preserving indentation. Every row retains the complete source code, the extracted main-theorem body and context, the source split-valid flags, tactics, and proof trees. A valid source track does not mean the two proofs use different ideas.

The collection does not match equivalent theorems across sources or attach competition problems to the app's Mathlib graph. Any such link requires a separate, version-aware matching step.

## Browse locally

The app has a dataset explorer at `http://127.0.0.1:5187/dataset`. Run `npm run dev -- --port 5187 --strictPort`; Vite starts and monitors the local dataset API automatically. `npm run data:serve` is available when running the API on its own. The API creates a small SQLite search index on first launch and reads a record from JSONL when needed for the formalized statement or proofs. It omits large tactic trees from the on-screen response; those remain in the local JSONL. The explorer requires the local files and is not a hosted dataset service.

## Provenance and redistribution

ProofWiki states CC BY-SA 3.0; Nemotron states CC BY 4.0; the NuminaMath artifact states Apache-2.0 with upstream attribution context. The published ProofRank base dataset card does not currently specify a license; its separate outputs dataset states CC BY-NC-SA 4.0. Check redistribution terms before publishing this collection. Keep source attribution and the manifest with any redistributed rows.

Sources: [ProofRank](https://huggingface.co/datasets/INSAIT-Institute/ProofRank), [ProofRank outputs](https://huggingface.co/datasets/Anon539823983/ProofRank-outputs), [ProofWiki Math](https://huggingface.co/datasets/avewright/proofwiki-math), [Nemotron Math Proofs v2](https://huggingface.co/datasets/nvidia/Nemotron-Math-Proofs-v2), [NuminaMath Lean Proof Artifacts](https://huggingface.co/datasets/iiis-lean/NuminaMath-LEAN-Proof-Artifacts).
