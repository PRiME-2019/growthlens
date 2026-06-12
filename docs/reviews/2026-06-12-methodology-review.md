# Methodology review — shrinkage, weeks-of-learning, and everything else the app computes

**Date:** 2026-06-12
**Purpose:** internal pre-flight before external methodological review. Everything
displayed to a user must be justifiable; this review checks the code against the
claims, and the claims against simulation.
**Method:** full read of `engine/stats.js`, `engine/units.js`, `engine/compute.js`,
`engine/insights.js`, `engine/resources.js`, `engine/prime.js`,
`data-prep/scripts/01_build_conversion_factors.R`, and `methods.html`; Monte-Carlo
validation of the estimators against simulated truth (scripts preserved in
`tools/validate-stats-*.cjs`, runnable with plain `node`).

---

## Verdict in one paragraph

The estimator implementations are textbook-correct (DerSimonian–Laird, REML by
golden-section on the correct restricted likelihood, standard empirical-Bayes
posterior mean/SD, Tukey boxes), the engineering safeguards are real, and most
displayed claims check out against the code. The serious exposure is
**interval calibration at the app's actual operating point** — districts with
5–10 schools: (1) when τ̂² estimates exactly zero, which happens in roughly a
third of realistic small-district datasets, every school's shrunken "95%
credible interval" collapses to a zero-width point at the district mean; and
(2) even away from that boundary, the μ-known credible intervals cover the true
school effect at ~84–86% (k=7) to ~92% (k=30), not 95% — and `methods.html`
currently claims the fuller version "runs about 1–2% larger," which materially
understates the gap. Both are fixable with known, citable corrections. The
weeks-of-learning conversion is internally consistent and clearly caveated, but
two assumptions (cross-grade scale comparability; the averaging convention)
need explicit documentation before a psychometrician reads it.

---

## A. Validated as sound

| Component | Check | Result |
|---|---|---|
| `cellSE = √(max(S², ms²)/n)` | formula + n=1 branch + zero-variance cells | Correct; the measurement-variance floor never double-counts (it replaces, not adds). Matches methods §3. |
| `gapSE = √(SE_A² + SE_B²)` | independence assumption | Holds — every comparison's two groups are disjoint student sets. |
| DerSimonian–Laird τ² | code vs. the standard estimator | Exact (Q, c = Σw − Σw²/Σw, truncation at 0). |
| REML τ² | objective function; optimizer | The profiled restricted log-likelihood is the standard −½[Σln(v) + ln(Σw) + Q]. Golden-section is appropriate (profile is unimodal). **Simulation:** mean τ̂² = 0.0411 against true 0.04 at k=30 (400 reps) — effectively unbiased. The `[0, max(10·DL, 1)]` search bracket never pinned in 400 noisy small-k reps. The DL≤0 → return 0 shortcut would have missed a meaningfully positive REML mode in 5 of 394 cases — negligible. |
| EB shrinkage | posterior mean `B·y + (1−B)·μ̂`, posterior SD `√B·se` | Standard normal-normal results, correctly implemented (the μ-known, τ-known form — see Finding B2). |
| Raw CIs | `gap ± 1.96·se` | 94.8% simulated coverage of true effects — nominal. |
| Min-n design | n ≥ 10 per cell; below-threshold schools excluded from τ²/μ̂ fits but still displayed shrunken | Sound, and the τ²-attenuation limitation is already disclosed in methods §3. |
| `canShrink` guard | < 2 reliable schools → fall back to raw (B=1) | Correct; prevents the B=0 collapse for the k<2 case (but not the τ̂²=0 case — Finding B1). |
| Resources gating | findings fire only when the pooled CI is wholly below zero (gaps) or the n-weighted band mean ≤ −0.05 (low growth) | Conservative and consistent with what the heatmap displays (rs-preferred). |
| Box plots | Tukey 1.5·IQR whiskers, real median/quantiles (type-7 interpolation) | Standard. Unshrunken by design — these are observed student distributions, not estimates, and n is large. |
| Heatmap cell shrinkage | each school×grade cell shrinks toward its **grade's** pooled mean (exchangeability within grade); Overall column reuses the exact school-level machinery Status & Growth uses (locked by test) | Coherent choice; document the exchangeability assumption (B9). |
| Statewide (PRiME) page | ranks quoted within level × year (verified: max rank = pool size per level); histogram bins are value-true; level follows the displayed year | Sound. The trend line is an **unweighted** mean of school z's — disclosed in the spec, should also be disclosed on-page/methods (B7). |

`methods.html` line-by-line against the code: every formula and behavioral claim
verified accurate **except** the empirical-Bayes interval claim in §2 (Finding B2).

---

## B. Findings, in order of severity

### B1 — HIGH: τ̂² = 0 collapses all shrunken intervals to zero-width points

**What happens.** `remlTau2` returns exactly 0 whenever DL ≤ 0 (and whenever the
restricted likelihood peaks at the boundary). Then `B = 0/(0+se²) = 0` for every
school, so `shrunkGap = μ̂` and `shrunkSe = √0·se = 0`: the forest plot draws
every school as a zero-length bar sitting exactly on the district mean, the
tooltip reads "95% credible interval [x, x]", and the takeaway generator's
"intervals clear of zero" count treats every school as significant whenever
μ̂ ≠ 0.

**How often.** Simulation at the app's realistic operating point (7 schools,
per-school gap SEs 0.07–0.15, i.e. group sizes of 250–900): with true
τ² = 0.005, **τ̂² = 0 in 33% of datasets**; τ² = 0.02 → 9%; 15 schools,
τ² = 0.005 → 20%. Conditional on τ̂² = 0, coverage of the true school effect is
**0%** by construction. (`tools/validate-stats-3-tauzero.cjs`.)

**Why it matters to a reviewer.** "Your method reports, with displayed
certainty, that every school is exactly at the district average" is the kind of
sentence that ends a review. The guard comment in `compute.js` (about k<2)
shows the failure mode was understood — the τ̂²=0 path just wasn't covered.

**Options (any is defensible; pick one and document it):**
1. *Display honesty (minimal):* when τ̂² = 0, present raw estimates with a note
   ("schools are statistically indistinguishable from the district average on
   this comparison; individual estimates shown unshrunken") — i.e. extend the
   existing `canShrink` fallback to the τ̂²=0 case.
2. *Fuller posterior SD (better):* `sd = √(B·se² + (1−B)²·se_μ̂²)` — at B = 0
   this degrades gracefully to the pooled-mean SE instead of zero. Simulated
   coverage improves from 56→82% (k=7, τ²=0.01) but stays under nominal (B2).
3. *Account for τ̂ uncertainty (best, citable):* Morris (1983)-style interval
   corrections or a weakly-informative prior on τ (half-normal) — standard in
   the small-k meta-analysis literature.

### B2 — HIGH: EB interval coverage is materially below nominal, and methods.html understates it

The displayed intervals use the μ-known, τ-known posterior SD `√B·se`.
Simulated coverage of true school effects (`tools/validate-stats-2-coverage.cjs`):

| Setting | Displayed "95%" actually covers | With μ̂-variance added |
|---|---|---|
| k=7, τ²=0.03 | 75.3% | 85.4% |
| k=7, τ²=0.01 | 56.2% | 82.4% |
| k=15, τ²=0.03 | 87.1% | 89.5% |
| k=30, τ²=0.03 | 91.7% | 92.2% |

`methods.html` §2 currently says the fuller EB version "runs about 1–2% larger
at typical district sizes." That is true only of the μ̂-variance term at large
k; the dominant omission at small k is **τ̂² uncertainty**, and the real gap at
k=7 is tens of percentage points, not 1–2. Two necessary changes regardless of
what is done about B1: (a) rewrite that sentence to reflect simulated coverage,
and (b) decide whether to adopt option B1-2/B1-3, which also closes most of
this gap. Note the *raw* intervals are calibrated (94.8%) — only the shrunken
ones, which are the default display, undercover.

### B3 — MEDIUM: district-wide CI uses z = 1.96 at any k

`pooledMean` builds μ̂ ± 1.96·SE. At k=7 simulated coverage is **89.7–91.1%**;
switching to the t quantile with k−1 df gives 94.0–95.7% (table in
`tools/validate-stats-2-coverage.cjs` output). The full Knapp–Hartung
adjustment is the literature-standard answer; the t-quantile alone captures
most of it and is a two-line change. This CI feeds the overview card, the gaps
table in the deck, the reliable-signal gate, and the Resources triggers — a
slightly anticonservative gate means occasionally flagging a gap/finding that
a calibrated interval would not.

### B4 — MEDIUM: weeks-of-learning — four documentation gaps, one display hazard

The arithmetic is implemented exactly as documented (magnitude form
`weeks = 38·z/es`; per-grade factors for cells; grade-4–8 average for pooled
displays; nearest-prior-year fallback; verified against
`conversion_factors.json`). Before a psychometrician reads it:

1. **Cross-grade scale comparability (the big one).** The synthetic-cohort
   effect size divides `mean(grade g, year t) − mean(grade g−1, year t−1)` by
   the prior grade's SD. MAP Grade-Level Assessment scale scores are reported
   on grade-specific scales; subtracting means across adjacent grades assumes
   the scales are articulated well enough for that difference to be meaningful.
   This is the same assumption behind the widely-cited national growth norms
   (Bloom, Hill, Black & Lipsey 2008, *JREE*), which is the citation to attach.
   State it explicitly in `data-prep/notes/methodology.md` and methods §5, or
   reviewers will assume it was overlooked.
2. **Averaging convention.** Pooled displays use `38 / mean(es)`, not
   `mean(38/es)`. For 2025 ELA those give **95.8 vs 116.0 weeks/SD** — a 20%
   difference. The implemented choice (convert after averaging) is the more
   conservative and arguably the right one (it weights grades by their growth
   on the score scale), but the convention must be documented because a
   reviewer recomputing "the average factor" the other way will get a
   different number.
3. **Extreme multipliers.** Small effect sizes make eye-catching conversions:
   grade-6 ELA 2024 (es = 0.1289) implies **295 weeks per SD**, so a +0.20
   heat cell renders as **+59 weeks ≈ 1.6 school years**. Methods §5 already
   carries the right caveat in words; consider adding this worked example, and
   decide whether the UI should flag (or cap) conversions in grades where a
   year of typical growth is below some floor (e.g. es < 0.2).
4. **The fallback constant.** `FALLBACK_WEEKS_PER_SD = 132 ≈ 38/0.29` —
   document where 0.29 comes from (a typical mid-grades annual-growth effect
   size consistent with the national norms above); right now it's a bare
   "typical MAP convention" comment.
5. **Factor plausibility (recommended appendix).** Our factors run higher than
   the national norms in early grades (e.g. ELA g4 ≈ 0.56–0.64 vs ≈ 0.40
   nationally) and show the familiar decline by grade. A half-page table
   comparing them to Bloom et al. would pre-empt the "are these numbers
   sane" question.

### B5 — LOW/MEDIUM: the scatter's x-axis is defined differently in app vs. deck, and in neither place documented

The app's Scores-vs-growth page re-standardizes school mean scores against the
district's own school-mean distribution; the export deck plots the raw state-z
school means. Both are internally fine (the quadrant split is at the district
mean either way), but the axis numbers differ between the two artifacts and
`methods.html` describes neither transformation. Align them (the deck's raw
state-z is simpler to defend) and add one sentence to methods §1/§5.

### B6 — LOW: fabricated zero when no school meets the threshold

`pooledMean(fitRows, τ²) || { mu: 0, ciLo: 0, ciHi: 0 }` — with zero reliable
schools, `meta.districtGap` is exactly 0 with CI [0,0]; the deck's gaps table
would print "+0.00 SD, 0.00 to 0.00" as if estimated (the reliable-gate
correctly suppresses the appendix slide). Display "—" instead when there are
no fit schools.

### B7 — LOW: statewide trend weighting

The statewide "district average" line is an unweighted mean of school-level
z's (the PRiME file carries no enrollment). Disclosed in the spec; add the
sentence to the District-Report page footer or methods so it's user-visible.

### B8 — LOW: editorial thresholds should be listed somewhere reviewable

The takeaway/finding generators use fixed constants: ±0.02 SD noise floor for
"reverses"/direction words, 0.05 SD for grade-spread mention, |r| ≥ 0.15 SD for
"standout cells", ⅔ for "pervasive", IQR > 2×gap for "overlap heavily",
−0.05 SD low-growth floor (Resources). These are editorial (which sentences get
written), not inferential (the CI-gated findings are), and the values are
reasonable — but list them in a short methods appendix so a reviewer can see
they're acknowledged choices.

### B9 — INFO: exchangeability choices worth one sentence each

Heatmap cells shrink toward their **grade's** pooled mean (schools exchangeable
within grade); school overalls and gaps shrink toward the **district** pool.
Both are sensible; say so. Demographics box plots are deliberately unshrunken
(observed distributions, large n) — also worth the sentence.

---

## C. What I did NOT find

No errors in: the shrinkage algebra, either τ² estimator, the REML optimizer,
the SE composition rules, quantile/whisker logic, the min-n bookkeeping, sign
conventions (focal − reference everywhere, verified through ingest → compute →
display), the weeks arithmetic, the PRiME rank/pool logic, or the consistency
between Status & Growth and the heatmap Overall column (test-locked). The
methods note is accurate against the code except as flagged in B2.

## E. Post-review fixes (landed same day — commit history for detail)

| Finding | Status | What shipped |
|---|---|---|
| B1 τ̂²=0 collapse | **Resolved** | `compute.js` extends the existing degeneracy guard: τ̂² = 0 (or k < 2) → raw estimates with B = 1, at every grain (gaps, heatmap cells via `rs = null`, school overalls). Test-locked with an identical-gaps fixture. |
| B2 interval undercoverage + overstated claim | **Resolved** | Posterior SD now `√(B·se² + (1−B)²·SE(μ̂)²)` (`shrink` gained `muSe`); shrunken intervals use t(k−1). methods §2 rewritten to state the actual policy and its simulated coverage; calibration published. |
| B3 district CI at z | **Resolved** | `pooledMean` and the on-page `districtMeanRE` use t(k−1). |
| B4 weeks documentation | **Resolved** | methods §5 gains "Assumptions worth knowing": adjacent-grade scale-comparability with the Bloom, Hill, Black & Lipsey (2008) citation; the `38/mean(es)` vs `mean(38/es)` convention (96 vs 116 weeks for 2025 ELA); the grade-6 ELA 2024 worked extreme (295 weeks/SD); fallback-constant provenance. Mirrored in `units.js` comments. |
| B5 scatter x-axis app/deck mismatch | **Open** | Documented here; alignment deferred (visual change requiring a design pass). |
| B6 fabricated zero district gap | **Resolved** | `meta.districtGap`/`districtCi95` are null with zero reliable schools; overview card and deck table render an explanation/dash. Test-locked. |
| B7 statewide trend weighting | **Resolved** | "weighting schools equally" added to the app trend legend and the deck footer. |
| B8 editorial thresholds | **Resolved** | methods §8 "Fixed editorial thresholds" table. |
| B9 exchangeability sentences | **Resolved** | methods §2 closing paragraph (three grains + unshrunken box plots). |
| (incidental) stale methods claim | **Resolved** | §2 aside no longer references the hidden Raw/Shrunken toggle. |

**Shipped-policy calibration** (`tools/validate-stats-4-policy.cjs`, the code path
as deployed): school-level 95% intervals cover the true effect **91.6–98.3%**
across k = 5–30 and τ² = 0.005–0.06 (vs 49–94% before the fix), conservative in
the smallest districts; district-wide t-CIs cover **94.6–98.4%** (vs 87–94%).

## D. Suggested order of operations before external review

1. Decide the B1 remedy (option 2 or 3 recommended; option 1 is the floor).
2. Rewrite the methods §2 interval claim to match simulated coverage (B2) —
   and consider publishing the `tools/validate-stats-*.cjs` results as a
   calibration appendix; reviewers respect a tool that reports its own
   coverage honestly.
3. Switch the district-wide CI to t(k−1) (B3) — two lines plus methods note.
4. Write the weeks-of-learning assumptions section with the Bloom et al.
   citation; pick and document the averaging-convention sentence (B4).
5. Align the scatter x-axis between app and deck; document (B5).
6. Sweep the small display fixes (B6, B7) and add the thresholds appendix (B8, B9).
