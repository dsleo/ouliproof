# Study protocol: mathematicians' judgments of proof diversity

## Aim

Measure three constructs that AI-for-mathematics evaluations often merge:

1. whether mathematicians accept a proof under stated prerequisites;
2. whether they judge two proofs to use the same, related, or different strategies; and
3. which acceptable proof they prefer for a stated purpose.

The primary outcome is preference **conditional on acceptance**. A proof regarded as invalid, incomplete, or inapplicable is not evidence about preference between valid strategies.

## Phase I: five controlled anchors

Start with the five entries in [`featured-results.json`](featured-results.json): Pythagoras's theorem, irrationality of \(\sqrt2\), Fermat's little theorem, the fundamental theorem of algebra, and unique prime factorization. Each has multiple source proofs and together they span geometry, elementary number theory, algebra, and complex analysis.

Select three packets per theorem with clearly different candidate strategy families: 15 proof packets and 15 within-theorem pairs. The current labels are hypotheses to test, not ground truth.

Keep these five anchors for the preregistered primary analysis. Expand only after the instrument works: sample 20–30 results across fields, prerequisite levels, proof lengths, source tracks, and candidate method relations. Build a separate historical-text track only from sources whose edition, translation, and reuse terms are documented; modern ProofWiki presentations are not historical originals.

## Materials

### Subject-matter screening

Two independent mathematicians with relevant expertise screen every packet before recruitment: `accepted`, `accepted with an explicitly stated missing lemma`, `not accepted`, or `cannot judge`. Retain jointly accepted proofs, or retain disagreement as a deliberate validity-disagreement condition. Publication or dataset inclusion is not a correctness certificate.

### Standardized packets

Give every packet the theorem statement, definitions and admissible background lemmas, and one proof. Normalize typography, remove source navigation and proof-number labels, and render diagrams consistently. Preserve mathematical content. Reveal source, author, model status, and curated label only after the main tasks, unless source effects are the experimental question.

Preregister theorem selection, packets, exclusions, outcome order, and analysis. Run a 15–20 mathematician pilot to establish reading time, prerequisite gaps, wording of “strategy,” and the `cannot judge` rate; then freeze the materials for the main study.

## Three separate tasks

### A. Acceptance: individual proof

> Given the stated prerequisites, would you accept this as a proof of the theorem?

Responses: `yes`, `yes, with a minor gap`, `no`, `cannot judge`, plus an optional pinpointed concern.

### B. Strategy relation: paired proof

Show two proofs of the same theorem:

> Do these proofs rely on the same central strategy, related strategies, or different strategies?

Responses: `same`, `related`, `different`, `cannot judge`, followed by a brief rationale. Curated labels remain hidden. This is the human target for evaluating text, Lean, and model-based diversity measures.

### C. Conditional preference: paired proof

For a pair accepted by the participant:

> If you wanted to communicate why this theorem is true to a mathematically trained peer at your level, which proof would you choose?

Responses: `left`, `right`, `no preference`. Follow with reasons: explanatory insight, conceptual economy, transparent assumptions, rigor or checkability, generalizability, pedagogical value, familiarity, or other. Then collect separate 1–7 ratings for clarity, explanatory power, economy, and confidence in correctness. Never collapse them into one “quality” score.

Randomize left/right placement, pair and theorem order, and task order within counterbalanced blocks. Collect field, career stage, proof-style experience, and theorem familiarity after the initial judgments.

## Sample and assignment

Recruit 60–80 research-active mathematicians or advanced doctoral students. With 15 primary pairs and 10 comparisons per participant, the study has 600–800 pair judgments, roughly 40–53 observations per pair before conditioning on acceptance. The pilot determines whether low acceptance requires a larger sample.

Use a balanced incomplete-block assignment: every participant sees each theorem but not every pair, and no theorem appears in consecutive comparisons. Target 30–40 minutes per session.

## Analysis

Model acceptance with a multilevel ordinal or binary model including proof, theorem, participant, and expertise effects. Report disagreement explicitly.

For strategy relation, report the full `same`/`related`/`different` distribution, judge uncertainty, and agreement with curated labels. Blindly dual-code rationales with a preregistered codebook.

For preference, fit a hierarchical Bradley–Terry model within theorem with an explicit tie component. Estimate proof utilities and participant-by-feature variation rather than ranking proofs from unrelated theorems globally. Regress pairwise choices on independently coded strategy relation and on features such as length and prerequisite load, with partial pooling.

Primary estimand: the probability that a participant prefers a proof with a strategy judged `different` over one judged `same` or `related`, conditional on accepting both. Secondary estimands concern clarity, explanatory power, economy, and preference heterogeneity by field.

## Validity safeguards

- Keep correctness, diversity, and preference distinct in interface, data model, and analysis.
- Do not infer semantic diversity from string distance alone.
- Predefine treatment of diagrams, background theorems, and incomplete proofs.
- Blind source and AI/human provenance during the main tasks to avoid reputation effects.
- Release anonymized judgments, packets, source links, curation version, codebook, and model code where consent and licenses allow.

Comparative judgment suits this task because it asks for a concrete within-theorem choice without requiring a universal scalar definition of proof quality. It has been used for mathematicians' views of proof and for proof comprehension, including Bradley–Terry analysis of pairwise choices: [Mejía-Ramos et al.](https://www.sciencedirect.com/science/article/pii/S0732312320300882) and [Davies et al.](https://link.springer.com/article/10.1007/s10649-020-09984-x). Proof-appraisal research also cautions against equating beauty with simplicity; preference dimensions should remain separate: [Inglis and Aberdein](https://academic.oup.com/philmat/article-abstract/23/1/87/1432455?login=true).

## Decision after Phase I

Advance to 20–30 theorems only if the pilot shows that the three tasks are understood, packet acceptance is high enough for conditional comparisons, and strategy-relation judgments are interpretable. Otherwise refine prerequisites and prompts before expanding the corpus.
