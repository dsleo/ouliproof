# Ouliproof UI, UX, and sharing review

Date: 2 October 2026.
Scope: read-only reviews by a mathematician-workflow reviewer, a hands-on browser tester, and an accessibility/deployment reviewer, followed by a synthesis and source-code check.

## Executive assessment

**The research workflow works, and the app is suitable for a small Vercel preview. It needs a focused UX and accessibility pass before broad public sharing with mathematicians.** The current visual direction is clear and scholarly. Explicit theorem confirmation, typed dependency paths, the separation of graph witnesses from cross-source tactic leads, and cautious no-hit language are strong foundations.

The project is already a local Git repository on `main`, with the prior application work committed and a clean working tree before this report. No Git remote is configured. No current full-app Vercel preview or production deployment was found; only the earlier external-rewrite proof of concept is recorded. The static deployment design remains simple: the small method index ships with the site; live search and neighborhoods are proxied to TheoremGraph. No separate graph database or dataset server is needed.

## Evidence and coverage

The reviewers exercised the app at desktop and 390 px mobile widths. Checked flows include a linked theorem and explicit confirmation, `Submodule.pow_toAddSubmonoid` induction, `Nat.add_eq_zero` contradiction, `Ideal.IsMaximal.isPrime'` no-hit, an unsupported method question, a live Euclid-lemma semantic search, graph/list mode, graph node inspection, JSON export, and `/how-it-works`. The [nine-case release suite](../../feasibility/release-smoke-tests.md) and [method validation](../../feasibility/method-validation.md) remain the reproducible baseline. The live semantic search took **33.3 seconds** once; this is one observation, not a latency distribution.

The image evidence is [home](screenshots/home.png), [induction result](screenshots/induction-result.png), and [mobile result](screenshots/mobile-result.png). Browser fault injection for API/index outages, clipboard contents, and a current Vercel preview were not verified in this review.

## What works

- **Theorem confirmation:** The selected Lean name and statement appear before analysis. This matters because semantic rank can be misleading; the intended `Nat.Prime.dvd_or_dvd` was fifth in the Euclid search.
- **Scientific provenance:** Exact TheoremGraph references are shown as graph witnesses; MathlibGraph tactics remain leads because proof-version identity is unverified. No-hit copy does not claim a method is absent.
- **Navigation:** Evidence paths are inspectable in a navigable graph; graph/list switching, node search, zoom, and continuation work. The induction witness focused `Nat.recAux` correctly.
- **Responsive base:** No horizontal document overflow was observed at 390 px. The mobile list view worked.
- **Reproducibility:** JSON export worked in browser testing. Source revisions, detector rules, paths, and scan limits are captured, even though much of this detail should be disclosed progressively in the UI.

## Prioritized findings

### P1 — Fix before broad public sharing

| Finding and evidence | User impact | Concrete change and acceptance criterion |
| --- | --- | --- |
| **Broken “View source” link.** TheoremGraph's `paper.source` value `Lean Repo` is treated as an href in `GraphExplorer.tsx`; browser inspection resolved it to local `/Lean%20Repo`. | A researcher trying to verify a finding is sent to a non-source page, damaging trust. | Only show the link for a validated absolute HTTPS URL, or construct a source link from verified repository metadata. Test every visible source action on at least three real declarations. |
| **Insufficient contrast on small labels.** Review measurements: step rail `2.35:1`, candidate IDs `2.36:1`, graph list metadata `2.96:1`. Relevant selectors are in `src/design.css` and `src/graph.css`. | Important state and evidence metadata are hard to read. | Darken muted tokens and raise tiny text sizes. Verify ordinary text reaches [WCAG AA's 4.5:1 threshold](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), with tested focus states. |
| **Full-screen graph is visually modal but not keyboard modal.** The expanded graph has no dialog semantics, initial/final focus, Escape handling, or focus containment; background links remain reachable. | Keyboard and screen-reader users can lose their place or interact with obscured content. | Implement the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) or make the expansion a non-modal dedicated route. Verify opening, Tab/Shift+Tab, Escape, and focus restoration. |
| **Slow semantic search has little control.** A real Euclid query showed “may take a few seconds” for 33.3 seconds with no cancellation. | The app can appear stalled before mathematicians reach their theorem. | Show elapsed-time feedback after roughly 10 seconds; provide Cancel and a retry that preserves the query. Keep the mandatory candidate confirmation. Measure a small set of real searches on the deployed preview. |
| **Findings and graph are too dense.** The induction result mixes witness, separate tactic lead, path, rule ID, source revision, counters, and diagnostics; its graph initially shows 31 nodes and many pending branches. | The main mathematical answer is difficult to locate and cite; the witness path is visually diluted. | Lead each card with the observed constant, its 1-edge or N-edge path, and the exact inference. Put secondary leads and technical metadata behind “Evidence details.” Initially fit and emphasize the witness path; offer “Show all observed nodes.” Preserve full graph access. |

### P2 — Improve during the research preview

| Finding | Concrete change |
| --- | --- |
| **First-action placement:** at 1280×720 the search field is visible, but near the bottom (top 609 px, bottom 669 px), and examples fall below the fold. At shorter laptop heights the first action may be hidden. | Shorten the hero and step rail while keeping the notebook typography. Make the search field and one example visible at common laptop heights. |
| **Search results can have inconsistent summaries:** the Euclid query's first candidate summary describes divisibility while its displayed Lean proposition concerns primality of a product. | Emphasize exact Lean name and proposition; label any natural-language summary as source-provided search metadata. Keep user confirmation. Investigate an exact Lean-name refinement or lookup if TheoremGraph exposes one. |
| **Diagnostics compete with findings:** timings, cache hits, UUIDs, raw rule IDs and snapshot labels appear before or within the mathematical answer. A one-node graph says “1 nodes.” | Move technical data into a reproducibility disclosure and export; fix singular/plural copy. Make “Copy query link” and “Export evidence JSON” text actions, with visible copy confirmation. |
| **Graph and result focus:** new results are scrolled into view, but keyboard focus stayed on the page body after Explore. Graph toolbar targets are roughly 29–31 px and graph-list metadata is tiny. | Focus the new results heading programmatically, enlarge controls for touch, and bring the highlighted witness path to the top of graph/list views. |
| **Question selection and repeat use:** four explanation-heavy choices and a custom field precede theorem confirmation; completed analysis requires scrolling past earlier sections. | Use concise method chips with detail on selection, and keep selected questions beside the confirmed theorem. Provide a compact summary or sticky navigation for returning to search/questions/results. |
| **Public trust and sharing:** the copied URL reruns a live query, while JSON freezes current observations; the difference is not obvious. The public guide does not explain that queries go to TheoremGraph through `/tg` and neighborhoods are cached locally. | Label the action “Share this query,” explain live recomputation, and offer a compact dated evidence report. Add a brief data-use note to How it works. |

### P3 — Finishing details

- Add a favicon and Open Graph title/description/image for shared links.
- Fix singular/plural and repeated step numbering; keep technical terms readable at 200% zoom.
- Continue checking real mathematical prompts from algebra, analysis, category theory, and number theory during pilot use. Ask whether participants can distinguish a graph witness from a tactic lead without reading the guide.

**Rejected finding:** One audit suggested a missing reduced-motion override. `src/design.css` already has a `prefers-reduced-motion: reduce` rule that suppresses animation/transition duration and smooth scrolling. Preserve it and verify it in browser rather than treating it as an open defect.

## Deployment and sharing sequence

1. Fix the broken source action, low-contrast text, full-screen focus behavior, and slow-search control. Keep the careful scientific wording.
2. Rework the first finding and graph view for a mathematician's reading order. Confirm that the exact path and source are understandable without inspecting raw metadata.
3. Publish a **Vercel preview** and run the [release smoke tests](../../feasibility/release-smoke-tests.md) on its real origin: `/tg` semantic search and statement JSON, static `/method-markers.json`, direct `/how-it-works` reload, link sharing, export, error states, and repeated requests showing cache behavior. [Vercel recommends previews for testing external rewrites](https://vercel.com/docs/routing/rewrites).
4. Conduct a small pilot with mathematicians using both Lean-name and natural-language queries. Record search latency, misidentified candidates, interpretation of evidence grades, graph usability, and whether exported results are useful to cite. Fix misunderstandings before public promotion.
5. Configure a Git remote and permanent hosting project when ready to share. The repository is local only today. No additional always-on backend or hosted MathlibGraph dataset is required for the current architecture.

**Release decision:** technically ready for a private preview after the immediate source-link fix; defer broad public promotion until the P1 accessibility and comprehension issues are resolved and the full preview passes its smoke tests. This review does not change the underlying scientific limit: a detected reference is an observation in a particular graph snapshot, and a no-hit is not proof of absence.
