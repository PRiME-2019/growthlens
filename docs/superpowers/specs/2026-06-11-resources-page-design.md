# Resources page — design

**Date:** 2026-06-11
**Status:** approved (design review in chat)

## Goal

A new "Resources" page that matches EdResearch-for-Action reports (and related
working papers, tools, and instruments) to patterns detected in the district's
own data, using the two reference CSVs as the single editable source of truth:

- `reference/evidence_resources.csv` — 22 resources with subject, grade band,
  population, evidence type, URL, and caveat notes.
- `reference/evidence_crosswalk.csv` — finding → resource rows with a
  `match_strength` tier (direct / adjacent / general) and a rationale line.

## Decisions (from design review)

| Question | Decision |
|---|---|
| Trigger | A subgroup gap fires when the pooled district gap's 95% CI is clear of zero with the focal group behind; a grade band fires when its n-weighted mean residual ≤ −0.05 SD. |
| Placement | New page only (nav between Demographics and Export); no inline links on analysis pages. |
| Tiers | Direct + adjacent under each finding with chips and rationales; the general tier pooled once in a closing "worth knowing regardless" section. |
| Data path | `fetch()` + parse the CSVs at runtime on first visit; no build step. |
| Subjects | **Not** responsive to the Subject toggle — the page shows findings for every available subject (math and ELA when both are loaded). Units still convert displayed magnitudes; Method doesn't apply (pooled gaps are method-independent). |

## Engine — `engine/resources.js` (UMD, Node-tested)

- `parseCsv(text)` — quoted-field CSV parser (the reference files quote every
  field; handle embedded commas and doubled quotes).
- `detectFindings({ bySubject })` — input from the new store accessor
  (`{ math: { gaps, heat }, ela: … }` for available subjects):
  - **subgroup_gap**: per subject, per comparison — fires on CI-clear-of-zero
    negative pooled gaps. App keys map to crosswalk keys: `el→mll`,
    `iep→swd`, `frl→frl`, `race_bw`/`race_hw→race`. The two race comparisons
    merge into one `race` finding listing both gaps.
  - **low_growth**: per subject, per grade band (elementary = grades 3–5,
    middle = 6–8) — n-weighted band mean ≤ −0.05 SD over reliable cells.
  - Each finding carries `bandsServed` (bands present in the subject's
    heatmap) so band-specific crosswalk rows can match pooled gaps.
- `matchResources({ findings, crosswalk, resources })`:
  - Row matches a finding when `finding_type` agrees, subgroup agrees (for
    gaps), subject is `any` or equal, and grade band is `any`, equal, or —
    for subgroup gaps — in `bandsServed`.
  - Output: per-finding sections with direct-then-adjacent matches (each with
    its rationale), plus a pooled, de-duplicated `general` list.
  - Crosswalk rows for `homeless` and the `high` band never match grades-3–8
    data — dormant by data, no special code.

## Store

`GLStore.allSubjectsData()` → `{ [subject]: { gaps: GAPS_DATA_BY_DEMO, heat: HEATMAP_DATA } }`
for every available subject (demo: math only; ELA appears once uploaded).

## Page — `resources.jsx`

- Nav: `resources: { label: 'Resources', hint: 'Evidence for next steps' }`.
- BriefHeader without a subject slice chip (the page spans subjects); blurb
  frames these as matched starting points, not prescriptions.
- CSVs fetched once (module-level cache); loading + fetch-failure states.
- **Finding cards** (one per finding, ordered: subgroup gaps by |gap| desc,
  then low-growth bands): a subject chip (MATH/ELA), the finding stated in
  the app's plain language with unit-aware magnitudes, then resource rows —
  linked title (new tab, `rel=noopener`), evidence-type badge (Synthesis /
  Single study / Tool / Measurement), match chip (Direct match / Related
  evidence), the crosswalk rationale, and the resource's caveat note when
  present.
- **"Worth knowing regardless"**: general-tier resources once.
- **Empty state**: explicit "none of the patterns this page watches for are
  clear of noise in your data" + the general section still shown.
- **Standing caveat card**: not endorsements, not causal claims; single
  studies labeled; links leave the app.

## Out of scope

Inline links from analysis pages; Export-deck integration; homeless /
high-band findings (dormant until uploads carry those fields/grades).

## Acceptance

1. Demo data: page shows the math findings (FRL/IEP/EL/race gaps that are
   CI-clear, any low-growth bands), each with direct/adjacent matches and
   rationales; generals once; zero console errors.
2. Subject toggle does NOT change the page; Units toggle converts magnitudes.
3. Node tests cover the parser, trigger gating, key mapping, wildcard and
   bandsServed joins, race merging, generals pooling, and the empty case.
4. Fetch failure shows a readable error, not a blank page.
