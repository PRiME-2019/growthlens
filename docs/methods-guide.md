# GrowthLens: the complete methods guide

**Audience:** you, plus anyone who knows what a student-level growth residual is and nothing
else. Everything beyond that — standard errors, variance components, shrinkage, meta-analysis
machinery, the weeks-of-learning translation — is built up from scratch, with derivations.

**Status:** internal review document, 2026-06-13. Not linked from the app. The public-facing
summary is [methods.html](../methods.html); the pre-flight audit that shaped the current
estimators is [docs/reviews/2026-06-12-methodology-review.md](reviews/2026-06-12-methodology-review.md).

**A promise about the numbers:** every number in the running example below was computed by the
*actual engine code* (`engine/stats.js`, `engine/units.js`, `reference/conversion_factors.json`),
not by hand. The script that produces them is reprinted in [Appendix C](#appendix-c--reproducing-every-number),
so you can re-run it and diff.

---

## Contents

- [Part I — The raw material](#part-i--the-raw-material)
- [Part II — From students to cells to gaps](#part-ii--from-students-to-cells-to-gaps)
- [Part III — The two-level model: τ², pooling, shrinkage](#part-iii--the-two-level-model)
- [Part IV — Calibration: how we know the intervals are honest](#part-iv--calibration)
- [Part V — The displays and their choices](#part-v--the-displays-and-their-choices)
- [Part VI — Weeks of learning, from the ground up](#part-vi--weeks-of-learning)
- [Part VII — Guardrails, editorial thresholds, and what the numbers can't say](#part-vii--guardrails)
- [Appendix A — The running example, end to end](#appendix-a--the-running-example-end-to-end)
- [Appendix B — Where every formula lives in the code](#appendix-b--where-every-formula-lives)
- [Appendix C — Reproducing every number](#appendix-c--reproducing-every-number)
- [Appendix D — Known open items](#appendix-d--known-open-items)
- [Appendix E — References](#appendix-e--references)

### Notation, once

| Symbol | Meaning |
|---|---|
| `r` | a standardized growth residual (state-computed, SD units) |
| `s_i` | the state's measurement SE for student *i*'s residual |
| `n` | number of students in a cell |
| `S²` | sample variance of the residuals in a cell (the `n−1` version) |
| `ms²` | mean measurement variance in a cell, `(1/n)·Σ s_i²` |
| `SE` | standard error — the SD of an *estimate*, not of students |
| `g_i` | school *i*'s raw gap (focal mean − reference mean) |
| `se_i` | the SE of school *i*'s raw gap |
| `k` | number of schools that meet the minimum-n threshold |
| `μ` | the district-wide true mean gap (the thing we estimate) |
| `τ²` | between-school variance — how much schools *truly* differ |
| `B_i` | school *i*'s shrinkage factor, between 0 and 1 |
| `w_i` | a precision weight, `1/variance` |

One notational simplification, same as the public methods note: estimates that statisticians
would write with a hat (μ̂, τ̂²) are mostly written plain. Where the hat matters to the argument
— and in a few places it really does — it is written out as "the *estimate* of μ."

### The running example: Maplewood R-X

A fictional district, used in every section. Seven schools, math, 2025, comparing **FRL vs.
non-FRL** students (sign convention: focal − reference, so negative = FRL students grew less).
For each school we have the per-side cell summaries the engine actually consumes — student
count `n`, mean residual `r̄`, sample variance `S²`, and mean measurement variance `ms²`:

| School | FRL n | FRL r̄ | FRL S² | FRL ms² | non-FRL n | non-FRL r̄ | non-FRL S² | non-FRL ms² |
|---|---|---|---|---|---|---|---|---|
| Aspen | 58 | −0.262 | 0.81 | 0.16 | 214 | +0.088 | 0.84 | 0.16 |
| Birch | 102 | −0.205 | 0.78 | 0.16 | 331 | +0.045 | 0.82 | 0.16 |
| Cedar | 45 | −0.118 | 0.85 | 0.16 | 168 | +0.062 | 0.80 | 0.16 |
| Dogwood | 210 | −0.041 | 0.79 | 0.16 | 540 | +0.039 | 0.81 | 0.16 |
| Elm | 150 | +0.052 | 0.83 | 0.16 | 420 | +0.032 | 0.80 | 0.16 |
| Fir | 12 | +0.205 | **0.20** | **0.36** | 96 | +0.085 | 0.82 | 0.16 |
| Ginkgo | **7** | −0.355 | 0.74 | 0.16 | 88 | +0.045 | 0.83 | 0.16 |

Three things are planted deliberately: Fir's FRL side has *lower* sample variance than
measurement variance (watch §3), Ginkgo's FRL side has only 7 students (below the threshold of
10), and Elm's raw gap is slightly *positive* (watch what shrinkage does to it).

Two different fictional datasets, kept distinct on purpose. **Maplewood** is a hand-built
teaching fixture: I chose its cell summaries to expose specific behaviors, then ran them
through the real engine, so every Maplewood number below is genuinely engine-computed (see
[Appendix C](#appendix-c--reproducing-every-number)). Separately, the **bundled sample
district** a user sees in the app *before uploading anything* (the seven "Sch-100x" schools)
is also synthetic, but built differently: `tools/build-demo.js` simulates student-level
residuals as first-stage value-added residuals (R² ≈ 0.70, an ~8% between-school variance
component, math noise deliberately left-skewed and heavy-tailed with |resid| > 2.2 redrawn),
then pushes them through `engine/stats.js` *exactly as a real upload would* — so the demo
exercises every estimator in this guide on coherent data, but is not real Missouri data. The
moment a real file is uploaded, the demo is suppressed entirely (`engine/store.js`). Neither
fixture is a real district.

---

## Part I — The raw material

### 1. What the state hands us

For each student × subject, the Missouri DESE/MOSIS growth file carries three numbers
GrowthLens uses ([engine/ingest.js](../engine/ingest.js)):

- **`{SUBJECT}_Z_RESIDUAL`** — the growth residual you already know: observed score minus the
  score the state's growth model predicted from prior achievement and grade, standardized to
  SD units. Zero means "grew exactly as expected"; +0.10 means a tenth of a standard deviation
  more than expected.
- **`{SUBJECT}_Z_RESIDUAL_SE`** — a per-student *measurement* standard error for that residual.
  Tests are noisy instruments; even if a student's true growth were knowable, the residual we
  observe wobbles around it. The state quantifies that wobble per student, and GrowthLens is
  unusual in actually using it (§3).
- **`{SUBJECT}_Z_T`** — the standardized *current-year score* ("status"), used only as the
  x-axis of the Scores vs. growth page.

The crucial division of labor: **GrowthLens fits no growth model.** The state already
regressed out prior achievement and grade. Everything in this guide is *aggregation of, and
inference on, residuals the state supplied* — means, variances, and a hierarchical model over
schools. If the state's residual model is misspecified for a district (wild nonlinearity,
heavy mid-year mobility), GrowthLens inherits the problem; it cannot detect it.

### 2. Housekeeping that quietly shapes the statistics

Five ingestion decisions ([engine/ingest.js](../engine/ingest.js), `loadSubjectFile`) matter
to interpretation:

1. **Latest year only.** The canonical table keeps rows where `GROWTH_YEAR` equals the file's
   maximum. Multi-year analysis is a planned seam, not a current feature.
2. **Grades 3–8 only.** Rows outside that band are dropped and the count of dropped rows is
   surfaced on the upload card (never a silent cut).
3. **Flag normalization.** Subgroup flags accept `y/1/t/true/yes` (case-insensitive) as true.
   A **NULL flag is NULL, not false**: a student with a missing FRL flag is excluded from
   *both* sides of the FRL comparison rather than silently counted as non-FRL. This is easy to
   get wrong and quietly biases gaps if you get it wrong.
4. **Race comparisons are one-hots, not complements.** Black vs. White compares
   `BLACK = true` against `WHITE = true` — not "Black vs. everyone else." A wrinkle the §4
   independence argument leans on: for FRL/IEP/EL the two sides are disjoint *by construction*
   (focal = flag true, reference = the same flag false, NULL excluded from both — so no
   student can land on both sides). For the two race comparisons that is **not** code-enforced:
   `black`, `white`, `hispanic` are three independent one-hot booleans, and the SQL predicate
   for each side is a lone `dbCol = TRUE` with no mutual-exclusion clause
   ([engine/compute.js](../engine/compute.js) `predicate`; [engine/ingest.js](../engine/ingest.js)
   `SUBGROUPS`). A student coded both `BLACK=Y` and `WHITE=Y` (or `HISPANIC=Y` and `WHITE=Y`,
   not rare under multiracial / ethnicity-vs-race coding) is counted on *both* sides. So
   disjointness there is an assumption about the source data's coding, not something the engine
   guarantees — which §4 has to qualify.
5. **Sign convention, everywhere: focal − reference.** FRL − non-FRL, IEP − non-IEP,
   EL − non-EL, Black − White, Hispanic − White. Negative = the focal group has the lower mean
   residual. The 2026-06-12 review traced this end-to-end (ingest → compute → display) and
   found no inconsistency.

One constant to keep in mind throughout: **`MIN_N = 10`**
([engine/compute.js](../engine/compute.js)). A cell with fewer than 10 students is flagged
unreliable; what that gates, precisely, is covered in §7 and §12. It is a triage threshold,
*not* a privacy/suppression rule — the public methods note says so explicitly.

---

## Part II — From students to cells to gaps

### 3. The cell mean and its standard error

A **cell** is a group of students whose residuals get averaged: a school's FRL students, a
school × grade, a whole school. The cell estimate is just the mean residual r̄. The work is in
its standard error.

**Step 1: the SE of a mean, derived.** Suppose the residuals in a cell are draws from some
distribution with variance σ². The variance of the mean of n independent draws is

```
Var(r̄) = Var( (1/n) Σ rᵢ ) = (1/n²) Σ Var(rᵢ) = (1/n²)(n·σ²) = σ²/n
```

so `SE(r̄) = σ/√n`. We don't know σ², so we estimate it with the sample variance S² (the
`n−1` version — DuckDB's `var_samp`). That gives the familiar `SE = √(S²/n)`. So far,
textbook.

**Step 2: what measurement error does to S².** Each observed residual is really

```
r_observed = r_true + ε,      ε ~ (0, s_i²)
```

where ε is test-measurement noise with the per-student SE the state supplied. If ε is
independent of the true residual, the law of total variance gives

```
Var(r_observed) = Var(r_true) + E[s_i²]
```

Read that carefully: the *observed* spread already **contains** the measurement variance. S²,
computed from observed residuals, estimates the whole right-hand side. So the naive `√(S²/n)`
already accounts for measurement error on average — *adding* a measurement term on top would
double-count it.

**Step 3: the floor.** Then why use the `s_i` at all? Because S² is itself an estimate, and a
noisy one in small cells (its sampling error scales like 1/(n−1)). A small cell whose students
happened to land close together can produce an S² *below* the average measurement variance
`ms² = (1/n)Σ s_i²` — which the model says is impossible for the *true* total variance, since
`Var(r_true) ≥ 0` forces `Var(r_observed) ≥ E[s_i²]`. When that happens, S² is understating
the noise, and an SE built from it would claim precision the instruments cannot deliver. So
the engine clamps ([engine/stats.js](../engine/stats.js), `cellSE`):

```
SE_cell = √( max(S², ms²) / n )        n ≥ 2
SE_cell = √( ms² )                     n = 1   (one student: the SE is that student's own s)
```

The `max` is a **floor, not an addition** — in the common case (S² ≥ ms²) it changes nothing,
and it never double-counts. The 2026-06-12 review verified this against simulation.

**Running example.** Most cells have S² ≈ 0.8 and ms² = 0.16, so the floor is dormant —
e.g. Aspen's FRL side: `SE = √(0.81/58) = 0.118176`. The plant is **Fir's FRL side**:
12 students whose residuals happened to cluster (S² = 0.20) but whose tests are only precise
to about ±0.6 each (ms² = 0.36). The floor fires:

```
SE_Fir,FRL = √( max(0.20, 0.36) / 12 ) = √0.03 = 0.173205
```

Without the floor it would have been √(0.20/12) = 0.129 — a 25% overstatement of precision,
exactly in the kind of small cell where overstatement does the most damage.

One caveat the floor quietly depends on: the state has to actually supply those per-student
SEs. `residual_se` is `TRY_CAST` at ingest and is **not** required by the WHERE clause (only
`residual` is — [engine/ingest.js](../engine/ingest.js)), and the cell SQL computes
`ms² = avg(residual_se · residual_se)`, which DuckDB returns as NULL when every student in a
cell has a missing/unparseable SE. `compute.js` then reads it as `Number(ms²)`, and
`Number(null) === 0` — with no null-guard (unlike `S²`, which is guarded). So a cell whose
students all lack a state SE gets ms² = 0, which makes `max(S², 0) = S²` and silently turns the
floor off: SE reverts to plain `√(S²/n)` (for n = 1 it collapses to √0 = 0). The protection is
real only where the per-student SEs are present.

### 4. Gaps and their standard errors

A school's **gap** is the difference of its two cell means: `g = r̄_A − r̄_B`
(focal − reference). For the variance of a difference of *independent* estimates:

```
Var(Ā − B̄) = Var(Ā) + Var(B̄)        ⇒        SE_gap = √(SE_A² + SE_B²)
```

(the cross term −2·Cov(Ā,B̄) vanishes only if the two means are independent). For FRL/IEP/EL
that independence holds *by construction* — the two sides are disjoint student sets (§2, item
4), so no student contributes to both means and the covariance is exactly zero. For the two
race comparisons it holds only if the source coding happens to be disjoint: a student flagged
both Black and White (or Hispanic and White) sits in both cells, the means then share students,
and the dropped cross term is not strictly zero — a mild understatement of `SE_gap` in
districts with much multiracial double-coding. The engine does not cross-check the flags
(§2, item 4); it computes `SE_gap = √(SE_A² + SE_B²)` regardless (`gapSE` in
[engine/stats.js](../engine/stats.js)).

**Running example** — full table the rest of the guide builds on:

| School | SE_FRL | SE_nonFRL | raw gap g | SE_gap | meets n ≥ 10? |
|---|---|---|---|---|---|
| Aspen | 0.118176 | 0.062652 | −0.350 | 0.133756 | yes |
| Birch | 0.087447 | 0.049773 | −0.250 | 0.100620 | yes |
| Cedar | 0.137437 | 0.069007 | −0.180 | 0.153788 | yes |
| Dogwood | 0.061334 | 0.038730 | −0.080 | 0.072539 | yes |
| Elm | 0.074386 | 0.043644 | +0.020 | 0.086244 | yes |
| Fir | 0.173205 | 0.092421 | +0.120 | 0.196320 | yes |
| Ginkgo | 0.325137 | 0.097118 | −0.400 | 0.339332 | **no** (FRL n = 7) |

Ginkgo's raw gap (−0.400) is the largest in the district — and its SE (0.34) says we know
almost nothing about it. That tension is the whole motivation for Part III.

The **raw** 95% confidence interval per school is the classical `g ± 1.96·SE_gap`. Simulation
(§9) puts its actual *coverage* — the fraction of such intervals that contain the true value,
across many repeated datasets; this is what "95%" is supposed to mean, and §9 makes it precise
— at 94.8%, right on the nominal target. Everything fancier below exists because raw intervals,
while honest, are *wide*, and because a district wants one number, not seven.

---

## Part III — The two-level model

### 5. The model, and what τ² means

Here is the single most important conceptual step in GrowthLens. The seven school gaps differ
for **two distinct reasons**:

1. **Sampling noise** — finite students per school. Even if every school's *true* gap were
   identical, the observed gaps would scatter with SDs equal to their SE_gap.
2. **Real differences** — schools genuinely differ in their true gaps.

Write it as a two-level (random-effects) model:

```
g_i = μ + u_i + e_i
u_i ~ N(0, τ²)        between-school: how much true gaps vary across schools
e_i ~ N(0, se_i²)     within-school: sampling noise, with KNOWN variance se_i²
```

Equivalently: school *i*'s true gap is `θ_i = μ + u_i`, and we observe `g_i ~ N(θ_i, se_i²)`.
Marginally (integrating out the school effect):

```
g_i ~ N(μ, se_i² + τ²)
```

τ² is **between-school variance**: the variance of the *true* gaps. τ = √τ² is the
between-school SD shown on the overview card. Two things τ is *not*: it is not the SD of the
observed raw gaps (that runs larger — it includes sampling noise), and not the SD of the
shrunken estimates (that runs smaller — shrinkage compresses). If τ² ≈ 0, schools are
statistically indistinguishable on this comparison and the apparent spread is mostly noise; if
τ² is large relative to typical se², the differences are real.

Why this model and not something fancier? It is exactly the **random-effects meta-analysis**
model: each school is a "study" with an effect estimate and a known standard error. That buys
us fifty years of well-understood machinery — and well-documented small-k failure modes, which
Part IV confronts.

### 6. Estimating τ²: DerSimonian–Laird, then REML

τ² is the hinge: it sets the pooled mean's weights (§7) and every shrinkage factor (§8). The
engine computes the classic closed-form **DerSimonian–Laird (DL)** estimate, then refines it
by **REML**. Both are in [engine/stats.js](../engine/stats.js) (`dlTau2`, `remlTau2`); only
the REML value is used downstream (DL anchors the search).

#### 6a. DerSimonian–Laird, derived from scratch

Work with **fixed-effect weights** `w_i = 1/se_i²` (precision weights as if τ² were zero), the
weighted mean `μ_FE = Σw_i g_i / Σw_i`, and Cochran's heterogeneity statistic

```
Q = Σ w_i (g_i − μ_FE)²
```

Q measures how much the gaps scatter relative to what their SEs alone would predict. The DL
idea is *method of moments*: compute E[Q] under the model, set the observed Q equal to it,
solve for τ². Abbreviate `S₁ = Σw_i`, `S₂ = Σw_i²`.

**Step 1 — decompose around the true μ.** Write each deviation through the fitted mean,
`g_i − μ = (g_i − μ_FE) + (μ_FE − μ)`, and expand the weighted sum of squares:

```
Σ w_i (g_i − μ)² = Σ w_i (g_i − μ_FE)²  +  2(μ_FE − μ)·Σ w_i (g_i − μ_FE)  +  (μ_FE − μ)²·Σ w_i
```

The middle (cross) term vanishes because μ_FE is *defined* as the w-weighted mean:
`Σ w_i (g_i − μ_FE) = Σ w_i g_i − μ_FE·Σ w_i = 0`. With `S₁ = Σ w_i`, the first term is just Q,
so `Σ w_i (g_i − μ)² = Q + S₁·(μ_FE − μ)²`. Rearranging to isolate Q gives the identity we
need (this is the weighted ANOVA decomposition — hence the minus sign):

```
Q = Σ w_i (g_i − μ)² − S₁·(μ_FE − μ)²
```

**Step 2 — expectation of the first term.** Marginally `Var(g_i) = se_i² + τ²`, so

```
E[ Σ w_i (g_i − μ)² ] = Σ w_i (se_i² + τ²) = Σ (w_i·se_i²) + τ²·S₁ = k + τ²·S₁
```

using `w_i·se_i² = 1` — that's why fixed-effect weights make the algebra clean.

**Step 3 — expectation of the second term.** μ_FE is a linear combination `Σ(w_i/S₁)·g_i` of
independent g_i's, so

```
Var(μ_FE) = Σ (w_i/S₁)² (se_i² + τ²) = (1/S₁²)·(Σ w_i + τ²·Σ w_i²) = 1/S₁ + τ²·S₂/S₁²
E[ S₁·(μ_FE − μ)² ] = S₁·Var(μ_FE) = 1 + τ²·S₂/S₁
```

**Step 4 — combine and solve.**

```
E[Q] = (k + τ²S₁) − (1 + τ²S₂/S₁) = (k − 1) + τ²·( S₁ − S₂/S₁ )
                                              └────── call this c ──────┘
τ²_DL = max( 0 , (Q − (k−1)) / c )
```

The truncation at zero matters: Q is a noisy statistic, and with little true heterogeneity it
lands below its null expectation (k−1) **more than half the time** — about 58% at the
six-school size here — because the distribution Q follows is right-skewed (its median sits
below its mean, k−1). When it lands low, the raw estimate goes negative; variance can't be
negative, so we clamp at zero — and that clamp, fired more often than a coin flip at small k,
is the root of the τ̂² = 0 degeneracy that §8's Correction 3 handles.

Intuition for each piece: `Q − (k−1)` is "excess scatter beyond pure sampling noise," and `c`
converts that excess from the weighted scale back to variance units. The "(k−1)" is exact, not
a fudge: under §5's model (normal errors, *known* per-school variances se_i²), if τ² = 0 then
Q is **exactly** a chi-square with k−1 *degrees of freedom* — a chi-square(df) being the
distribution of a sum of df squared standard-normal draws, with mean df. So E[Q] = k−1 there,
which is also what Steps 1–4 derived from moments alone, with no normality needed.

**Running example.** With the six fit schools (Ginkgo excluded — §7):

```
S₁ = Σw = 547.382      S₂ = Σw² = 69,533.068      μ_FE = −0.111929
Q = 9.1763             c = 547.382 − 69,533.068/547.382 = 420.354
τ²_DL = (9.1763 − 5) / 420.354 = 0.009935
```

Q = 9.18 against an expectation of 5 under homogeneity: there *is* excess scatter, but not a
lot. τ_DL ≈ 0.0997 — true school gaps spread with an SD around 0.10.

#### 6b. REML: why, and what the code maximizes

DL is a moment estimator — fine, fast, but it ignores distributional shape and can be
inefficient. The natural next step is maximum likelihood: write the marginal likelihood of the
data as a function of (μ, τ²) and maximize. But plain ML has a known bias: **it estimates
variances too small, because it pretends μ is known when it was actually estimated.**

You have seen the simplest case of this bias. For an i.i.d. sample, the ML variance estimate is
`(1/n)Σ(x − x̄)²`, and

```
E[ (1/n) Σ (xᵢ − x̄)² ] = σ²·(n−1)/n
```

— biased low by exactly one degree of freedom, the one x̄ consumed. Dividing by n−1 instead
of n is the fix everyone learns; **REML (restricted maximum likelihood) is the principled
generalization of that fix**. Instead of the likelihood of the data, REML maximizes the
likelihood of *error contrasts* — linear combinations of the data chosen to be invariant to μ
(in the simple case: the deviations from the mean). The mean parameter is integrated out of
the problem before the variance is estimated, so it cannot eat a degree of freedom.

For our heteroscedastic model, with `v_i(τ²) = se_i² + τ²`, `w_i = 1/v_i`, and the τ²-dependent
weighted mean `μ(τ²) = Σw_i g_i / Σw_i`, the restricted log-likelihood is (constants dropped):

```
ℓ_R(τ²) = −½ [ Σ log v_i  +  log Σ w_i  +  Σ w_i (g_i − μ(τ²))² ]
```

Term by term: `Σ log v_i` is the usual normal-density log-determinant; the weighted sum of
squares is the usual fit term, with μ profiled out at its optimum; and **`log Σ w_i` is the
REML correction** — the extra penalty that accounts for μ having been estimated (formally,
the log-determinant of the information about μ; it is precisely the term plain profiled ML
omits). This is the standard expression — Harville (1977); in the meta-analysis notation,
Viechtbauer (2005).

**How the code maximizes it.** For the SE configurations GrowthLens actually meets — per-school
gap SEs differing by at most a few-fold across schools — ℓ_R is a smooth, effectively unimodal
function of τ² ≥ 0, so `remlTau2` uses a **golden-section search**: keep a bracket [lo, hi]
guaranteed to contain the peak, evaluate at two interior points placed at the golden ratio
φ = (√5−1)/2 ≈ 0.618 of the bracket, discard the end beyond the lower of the two, repeat.

A caveat worth stating honestly: unimodality is *not* guaranteed in general for this
heteroscedastic, known-variance REML profile. With wildly unequal per-school SEs (a constructed
~14× spread produces two interior modes), golden-section can converge to the lower one. The
defenses are that GrowthLens's realistic SE range is narrow (in tens of thousands of simulated
small-k districts at gap-SEs 0.07–0.15, none produced a multimodal profile; the first
multimodal cases appear only near a 30× spread, ≈0.01% of draws) and that the DL anchor below
keeps the bracket sensible. Treat the search as a reliable practical method here, not a
theorem. Each iteration shrinks the
bracket by a factor 0.618 and, thanks to the golden ratio, reuses one of the two interior
points, costing only one new function evaluation per step. No derivatives needed; immune to
the step-size pathologies of Newton's method at the τ² = 0 boundary.

Operational details that matter:

- **Bracket:** `[0, max(10·τ²_DL, 1)]` — DL anchors the scale of the search. The review's
  simulations (400 noisy small-k replicates) never saw the optimum pin against the bracket.
- **Stopping:** 200 iterations or bracket width < 1e-7, whichever first. (0.618²⁰⁰ is
  astronomically small; the width test is what actually stops it.)
- **Shortcuts:** k < 2 → return 0 (no heterogeneity is estimable from one school);
  DL ≤ 0 → return 0 *without searching*. The second is a deliberate cheap-out: in simulation
  it would have missed a meaningfully positive REML mode in 5 of 394 such cases — accepted as
  negligible and documented in the review. Results below 1e-8 are snapped to exactly 0 so the
  degeneracy guard (§9) can test `τ² > 0` cleanly.
- **Bias check:** at k = 30 with true τ² = 0.04, the simulated mean REML estimate was 0.0411
  over 400 replicates — effectively unbiased.

**Running example.** The profile is a gentle hump; values from the engine:

```
ℓ_R(0)        = 5.1418
ℓ_R(0.004968) = 5.5826      (DL/2)
ℓ_R(0.009935) = 5.6611      (DL)
ℓ_R(0.019870) = 5.5303      (2·DL)
ℓ_R(0.039741) = 5.0606      (4·DL)

τ²_REML = 0.009934          τ = 0.099669
```

Here REML lands within rounding of DL (0.009934 vs 0.009935) — common when the weights are
not too unequal. They can diverge more in lopsided districts; REML is the one the app uses.

### 7. The pooled district mean

One number for the district: the **random-effects pooled mean**. Which weighted average of
the school gaps should it be?

**Derivation (minimum-variance unbiased combination).** Consider any linear combination
`μ̂ = Σ a_i g_i` with `Σ a_i = 1` (unbiasedness, since each `E[g_i] = μ`). The g_i are
independent with marginal variances `v_i = se_i² + τ²`, so `Var(μ̂) = Σ a_i² v_i`. Minimize
with a Lagrange multiplier:

```
∂/∂a_i [ Σ a_j² v_j − λ(Σ a_j − 1) ] = 2 a_i v_i − λ = 0    ⇒    a_i ∝ 1/v_i
```

The best weights are **inverse-variance weights** — and crucially they are inverse *marginal*
variance, `w_i = 1/(se_i² + τ²)`, not 1/se_i². Plugging the optimal weights back in:

```
μ̂ = Σ w_i g_i / Σ w_i           Var(μ̂) = 1/Σ w_i           SE(μ̂) = 1/√(Σ w_i)
```

(For the variance: `Var(μ̂) = Σ (w_i/Σw)² v_i = Σ (w_i²/ (Σw)²)·(1/w_i) = Σw_i/(Σw)² = 1/Σw`.)

Notice what τ² does to the weights. With τ² = 0, weights are pure precision — big schools
dominate. As τ² grows, the `+τ²` term flattens the weights toward equality: when schools truly
differ, each school is partly its own irreducible "study," and even a huge school is only one
draw of `u_i`. This is why the random-effects mean is *more democratic* than the fixed-effect
mean.

**The interval, and why t instead of 1.96.** The CI is `μ̂ ± t_{k−1} · SE(μ̂)`, with the
Student-t critical value at k−1 degrees of freedom (`tCrit95` carries a df 1–30 table; ≥ 30 ⇒
1.96). The normal quantile would be right if τ² were *known*; we plugged in an *estimate* of
τ² built from the same k schools, and that extra noise fattens the sampling distribution of
the standardized mean. With k = 7, simulation puts the z-interval's true coverage at
89.7–91.1% — not 95%. Switching to t(k−1) restores 94.0–95.7%. This is the cheap core of the
Knapp–Hartung small-k adjustment from the meta-analysis literature (the full version also
rescales the SE; the t-quantile alone captured most of the benefit in our simulations, and is
what shipped).

**Running example.**

```
RE weights w_i = 1/(se_i² + 0.009934):
  Aspen 35.94   Birch 49.85   Cedar 29.78   Dogwood 65.81   Elm 57.56   Fir 20.63

μ̂ = −0.123435      SE(μ̂) = 0.062069      t₅ = 2.571
95% CI: [−0.283, +0.036]
```

Two teaching points. First, compare μ̂ = −0.1234 with the fixed-effect mean −0.1119 from §6a:
the flatter RE weights let the smaller, more negative schools count for more. Second — and
worth dwelling on — **the district interval crosses zero.** Maplewood's FRL students trail by
about 0.12 SD as a point estimate, but with six fit schools, this much between-school spread,
and the honest t-correction, the data cannot rule out "no district-wide gap." In the app this
is exactly the condition that makes a comparison fail the *reliable-signal gate* (§14): the
export deck would print the row in the gaps-overview table but would **not** build the
school-by-school appendix slide for it. The machinery refusing to over-claim is the feature.

Bookkeeping: which schools are in the fit? `fitRows` = schools with **both** cells at
n ≥ MIN_N and a finite gap. Ginkgo (FRL n = 7) is excluded from the τ² fit and the pooled
mean — its SE is so large it mostly adds noise to the variance estimate — but it is *not*
dropped from the display (§8 shrinks it like everyone else, and the forest plot sets it apart
in a "too few to read reliably" section). With **zero** fit schools, the district gap is
`null` and renders as a dash — never a fabricated 0.00 (review finding B6). One disclosed
limitation: dropping the high-SE tail from the fit can pull τ̂² slightly low.

One implementation wrinkle the reader should know about. The engine stores this pooled mean
and CI in `meta.districtGap` / `meta.districtCi95`, and almost everything reads from there (the
forest reference line, the deck, the Resources triggers, the Overview card's distribution
strip). But the headline district number and its CI *on the Group-gaps Overview card* are
**recomputed live in the UI** by a second function, `districtMeanRE`
([app-shell.jsx](../app-shell.jsx)) — a structural duplicate of `pooledMean` that re-derives
the same inverse-marginal-variance mean and t(k−1) CI from the per-school **raw** gaps and the
stored τ² (it has no raw/shrunken mode; it always uses raw). On engine-computed data the two
paths agree to machine precision (the recompute reproduces `meta.districtGap` exactly). They
are *not* locked together by a test, though, so on stale or hand-edited metadata they can
visibly disagree on the interval — a maintenance hazard worth knowing, not a live bug.

### 8. Shrinkage: the empirical-Bayes posterior, derived

Now the per-school estimates. The raw gap is unbiased but noisy (Ginkgo: −0.40 ± 0.67!). The
model of §5 says school *i*'s true gap θ_i is itself a draw from N(μ, τ²) — so before seeing
school *i*'s own students, we already know something about it: it's probably within ±2τ of μ.
Bayes' theorem tells us exactly how to combine that prior knowledge with the school's own
data.

**The normal–normal posterior, from scratch.** Prior `θ ~ N(μ, τ²)`; data `g | θ ~ N(θ, se²)`.
The posterior density is proportional to prior × likelihood:

```
p(θ | g) ∝ exp( −(g−θ)²/(2se²) ) · exp( −(θ−μ)²/(2τ²) )
```

Collect the exponent as a quadratic in θ:

```
−½ [ θ²(1/se² + 1/τ²) − 2θ(g/se² + μ/τ²) ] + (terms without θ)
```

A quadratic exponent in θ is again a normal density, and there's a standard identity that
reads its mean and variance straight off the coefficients: any density proportional to
`exp(−½[a·θ² − 2b·θ])` is normal with **precision** (inverse variance) `a` and **mean** `b/a`.
Matching our exponent, `a = 1/se² + 1/τ²` and `b = g/se² + μ/τ²`, so the posterior is normal
with

```
precision:  1/se² + 1/τ²                       (precisions add)
mean:       (g/se² + μ/τ²) / (1/se² + 1/τ²)    (precision-weighted average of g and μ)
```

Multiply the mean's numerator and denominator by `se²τ²` and define the **shrinkage factor**:

```
B = τ² / (τ² + se²)

posterior mean      θ̂ = B·g + (1 − B)·μ
posterior variance  Var(θ | g) = se²τ²/(se² + τ²) = B·se²
```

That's the entire mechanism. B is a tug-of-war ratio between "signal" (τ², how much schools
truly differ — reasons to trust the school's own number) and "noise" (se², how badly measured
this school is — reasons to fall back on the district). B = 1: data fully trusted. B = 0:
data discarded for the prior. A school with se ≈ τ sits at B = ½, an even split. And note the
posterior variance `B·se² ≤ se²` — borrowing strength from the district genuinely tightens
the estimate; that's the payoff for accepting some pull toward μ.

**The "empirical" in empirical Bayes.** A real Bayesian would put priors on μ and τ² too.
Empirical Bayes instead *estimates them from the data* (μ̂ from §7, τ̂²_REML from §6) and plugs
them in. Cheap and effective — but it pretends the plugged-in values are exact, and they are
not. Two of the three corrections below exist precisely to pay that debt back.

**Correction 1 — propagate the uncertainty in μ̂.** The plug-in posterior mean
`B·g + (1−B)·μ̂` is linear in the *estimated* μ̂. Treat μ̂ as a second random input with its own
variance SE(μ̂)² and push it through that linear map to first order: since its coefficient is
(1−B), it contributes `(1−B)²·SE(μ̂)²`, which adds to the μ-known posterior variance `B·se²`:

```
Var(θ̂) ≈ B·se²              +  (1−B)²·SE(μ̂)²
         └ μ-known posterior    └ extra spread from having estimated μ̂
```

This is a first-order propagation (delta-method) argument, *not* an exact law of total
variance: μ̂ is itself computed from the same data that produced g, so the two are not the
independent strata an exact `Var = E[Var] + Var[E]` would require — which is exactly what the
honesty footnote below owns up to. The result is the posterior SD the engine ships
([engine/stats.js](../engine/stats.js), `shrink` with `muSe`):

```
SE(θ̂) = √( B·se² + (1−B)²·SE(μ̂)² )
```

Honesty footnote: this treats g and μ̂ as independent, though school *i* contributes to μ̂
(slightly conservative-or-not depending on weights; small at realistic k) and it still ignores
the uncertainty in τ̂² — which is why correction 2 exists and why Part IV measures actual
coverage rather than asserting it.

**Correction 2 — t intervals.** Shrunken 95% intervals use `θ̂ ± t_{k−1}·SE(θ̂)`, the same
small-k logic as §7: μ̂ and τ̂² came from only k schools.

**Correction 3 — the degeneracy guard.** If `k < 2` **or** `τ̂² = 0` (§6's truncation makes
exact zero common — a third of realistic 7-school datasets in simulation), then B = 0 for
every school: every estimate collapses onto μ̂ with `√(B·se²)` → a *zero-width interval at the
district mean*. "We are 95% sure every school is exactly average" is fabricated certainty —
conditional on τ̂² = 0, simulated coverage of the true school effect was literally 0%. So
[engine/compute.js](../engine/compute.js) refuses to shrink in that case (`canShrink =
fitRows.length ≥ 2 && tau2 > 0`) and **falls back to raw estimates with B = 1**, at every
grain. Statistically: when the data cannot distinguish the schools, the honest displays are
the noisy raw estimates with their wide raw intervals, plus the words "schools are
statistically indistinguishable here," not a confident pile of identical points. (This was
the review's headline finding, B1; the fallback was chosen over a Morris-style correction or
a prior on τ as the simplest *display-honest* remedy, and its calibration was then verified —
Part IV.)

**Running example.** With τ̂² = 0.009934, μ̂ = −0.123435, SE(μ̂) = 0.062069, t₅ = 2.571:

| School | SE_gap | B | raw gap [95% CI] | shrunken [95% CI] |
|---|---|---|---|---|
| Aspen | 0.134 | 0.357 | −0.350 [−0.612, −0.088] | −0.204 [−0.434, +0.025] |
| Birch | 0.101 | 0.495 | −0.250 [−0.447, −0.053] | −0.186 [−0.385, +0.013] |
| Cedar | 0.154 | 0.296 | −0.180 [−0.481, +0.121] | −0.140 [−0.383, +0.102] |
| Dogwood | 0.073 | 0.654 | −0.080 [−0.222, +0.062] | −0.095 [−0.256, +0.066] |
| Elm | 0.086 | 0.572 | +0.020 [−0.149, +0.189] | −0.041 [−0.223, +0.140] |
| Fir | 0.196 | 0.205 | +0.120 [−0.265, +0.505] | −0.073 [−0.335, +0.188] |
| Ginkgo | 0.339 | 0.079 | −0.400 [−1.065, +0.265] | −0.145 [−0.432, +0.141] |

Walk the table; it contains every behavior worth knowing:

- **B tracks measurement quality, not size of effect.** Dogwood (the biggest school,
  SE 0.073) keeps 65% of its own signal; Ginkgo (SE 0.339) keeps 8%.
- **Outliers with weak data get pulled hardest.** Fir's raw +0.120 (12 FRL students!)
  becomes −0.073: the model's honest best guess is that Fir is probably about average after
  all, maybe slightly favorable-to-FRL — not the district's one shining counterexample.
  Ginkgo's alarming −0.400 becomes −0.145.
- **The counterintuitive pull.** Elm's raw gap was *positive* (+0.020); its shrunken estimate
  is *negative* (−0.041). Shrinkage pulled it past zero, toward the district mean. This is
  mathematically correct — with Elm's data this noisy, our best single guess for any
  Maplewood school sits near the district norm — but it can look like the model "invented" a
  gap at Elm. This is why the UI shows B on hover and why the public methods note carries a
  dedicated warning aside. When a school is small, read the interval, not the point.
- **Intervals shrink but don't vanish.** Aspen's interval narrows from width 0.52 (raw) to
  0.46 (shrunken); Ginkgo's from 1.33 to 0.57. There is a hard floor on the width, and it's
  worth seeing where it comes from. As se → ∞ (B → 0), the two terms of
  `SE(θ̂) = √(B·se² + (1−B)²·SE(μ̂)²)` do **not** both vanish:
  `B·se² = τ²·se²/(τ²+se²) → τ²` (this term is the *larger* one in the limit, and people
  routinely misremember it as the small one), while `(1−B)²·SE(μ̂)² → SE(μ̂)²`. So the
  posterior SD bottoms out at `√(τ² + SE(μ̂)²)` — here √(0.009934 + 0.062069²) = 0.117, about
  89% wider than the district mean's own SE (0.062), and nowhere near zero.
- **Ginkgo is shrunk for display but was never in the fit.** Excluded from μ̂ and τ̂²
  (§7), still drawn — in the forest plot's set-apart section.

Terminology note: the app's tooltips say **"credible interval"** for the shrunken intervals —
Bayesian language, appropriate since they're posterior intervals — and the raw intervals are
ordinary confidence intervals. This guide says "interval" and reports both flavors' measured
frequentist coverage, which is what Part IV is about.

---

## Part IV — Calibration

### 9. What "95%" is supposed to mean, and how we checked

An interval procedure is **calibrated** if, across repeated datasets drawn from the model,
the "95%" interval contains the truth 95% of the time. Every approximation in Part III
(plug-in τ̂², plug-in μ̂, ignored τ̂² uncertainty, t-heuristics) threatens calibration — so
instead of asserting it, the project measures it by Monte Carlo. The scripts live in
`tools/validate-stats-*.cjs` (plain `node`, no dependencies; the temp-dir policy simulations
were preserved there too).

**The recipe** (this is worth internalizing — it's how you audit any interval method):

1. Pick a truth: k schools, true μ, true τ², realistic per-school SEs (the suite uses gap-SEs
   ≈ 0.07–0.15, matching group sizes of roughly 250–900 students).
2. Simulate: draw true effects `θ_i ~ N(μ, τ²)`, then observed gaps `g_i ~ N(θ_i, se_i²)`.
3. Run *the actual shipped code path* on the simulated data — REML, pooling, guards,
   shrinkage, t-intervals.
4. Record whether each interval covered its true θ_i (and whether the district interval
   covered μ). Repeat hundreds of times; the coverage rate is the verdict.

**What it found before the fixes** (the review's B1/B2/B3): classic μ-known/τ-known intervals
`θ̂ ± 1.96·√(B·se²)` covered the true school effects only **56–87%** at k = 7–15 — far below
nominal — and collapsed to 0% conditional on τ̂² = 0; the z-based district interval covered
~90% at k = 7.

**What ships now, measured end-to-end** (`tools/validate-stats-4-policy.cjs`, the deployed
code path with all three corrections):

| Interval | Simulated coverage, k = 5–30, τ² = 0.005–0.06 |
|---|---|
| School-level shrunken 95% intervals | **91.6% – 98.3%** (conservative end = smallest districts) |
| District-wide pooled 95% interval | **94.6% – 98.4%** |
| Raw per-school intervals (`±1.96·se`) | **94.8%** |

The residual wobble around 95% is the honest price of plug-in empirical Bayes at small k; the
choice was to err conservative (wider intervals in the smallest districts) rather than
anticonservative. The public methods note states these numbers rather than a textbook claim —
if an external reviewer re-runs the scripts, they should reproduce them.

---

## Part V — The displays and their choices

### 10. The three grains, and the exchangeability question

The Part III machinery runs at three different grains, and each must answer the same modeling
question: **toward what pool does a given estimate shrink?** — equivalently, which units are
assumed *exchangeable* (draws from a common N(μ, τ²))?

| Grain | Page(s) | Unit | Shrinks toward | Rationale |
|---|---|---|---|---|
| School × subgroup **gaps** | Group gaps by school; deck forest slides | school | district-wide pooled gap (per comparison, per subject) | schools exchangeable in *how their gap deviates* |
| School **overall growth** | Scores vs. growth (school view); heatmap "Overall" column | school | district-wide pooled mean growth | schools exchangeable in overall growth |
| School × **grade** cells | Growth by school & grade heatmap | school, within one grade column | that **grade's** district pooled mean | within a grade column, schools are the exchangeable units — grade-4 cells should not borrow strength from grade-8 patterns |

Each grain runs the same **point-estimate** path: fit rows = cells with n ≥ 10 and finite SE →
REML τ² → pooled mean → shrunken point estimate, with the §8 Correction-3 degeneracy guard
(k < 2 or τ̂² = 0 → raw, B = 1) applied identically. One thing is *not* shared: only the **gaps** grain carries shrunken *intervals*.
`buildGaps` calls `shrink` with `muSe` and forms `θ̂ ± t(k−1)·SE(θ̂)`, so Correction 1's
`(1−B)²·SE(μ̂)²` inflation and Correction 2's t-quantile appear there alone. The heatmap
per-grade cells, the heatmap Overall column, and the Scores-vs-growth school points all call
`shrink` *without* `muSe` and keep only the shrunken point (`rs` / `y_shrunk`) — no shrunken SE,
no interval is ever built or displayed. So the Part IV shrunken-interval coverage numbers
(91.6–98.3%) describe the **gaps page only**; the heatmap and scatter show shrunken points with
no stated interval. Two locked invariants worth knowing:

- The **heatmap's Overall column and the Scores-vs-growth school view share one computation**
  (`cellsOverall` + the same pooling), enforced by a test — the two pages can never disagree
  about a school's overall growth.
- In the heatmap's per-grade shrinkage, a grade column that can't shrink (k < 2 or τ̂² = 0)
  stores `rs = null` and the UI displays the raw value — same fallback philosophy, expressed
  per column.

And one deliberate **non**-use of the machinery: the demographics box plots are *unshrunken*.
They display observed distributions of actual student residuals — hundreds of students per
group, no estimation step, nothing to stabilize. Shrinking them would blur real data to
solve a problem (noise in small estimates) those plots don't have.

**The heatmap's color is its own kind of choice.** The school × grade grid shows a number per
cell, but the eye reads the *fill*, and the fill is governed by two decisions worth stating.
First, the diverging scale saturates at **±0.3 SD** (`SCALE_MAX` in
[heatmap-variants.jsx](../heatmap-variants.jsx)): positive cells run white → blue, negative
white → rust, and any cell at or beyond ±0.3 SD renders at full strength — a +0.30, +0.60, and
+2.50 cell are pixel-identical. The color encodes a *clamped* magnitude, so for an extreme cell
read the number, not the fill. Second, under weeks mode only the cell *numbers* convert to
weeks; the color encoding and its legend **stay in SD** (the legend keeps showing
−0.3 ··· 0 ··· +0.3 SD, with a caption saying so), deliberately, so colors stay comparable
across the unit toggle. A reader will see week counts on cells whose colors are still on the SD
scale — that's intended.

### 11. Box plots: exactly what's drawn

[engine/stats.js](../engine/stats.js) `summarize` is a plain Tukey box plot:

- **Quantiles** use linear interpolation between order statistics ("type 7," the R default):
  the q-quantile sits at position `(n−1)·q` in the sorted values (0-indexed); a fractional
  position interpolates linearly between its two neighbors.
- **Box** = q1 to q3, with the **median** marked. The page's hover reports the median as "the
  typical student" — the mean was removed from the hover deliberately (outlier-sensitivity).
- **Whiskers** = the most extreme observations still within `[q1 − 1.5·IQR, q3 + 1.5·IQR]` —
  the innermost-point convention, so a whisker always lands on a real student.
- **Outliers** = everything beyond the fences. Display honesty detail: when there are many,
  the figure down-samples them *evenly across the sorted list* (every ⌈m/8⌉-th), so both tails
  stay visible — a naive "first 8" would show only the most-negative tail. Hover-popups on
  individual outlier dots were removed; outliers are context, not items to inspect.

Two clarifications so the description matches the code exactly. `summarize` still **computes
and emits the per-group mean** — it rides along in the box-plot data; it is just deliberately
*not drawn* (a few outliers can drag it, the exact misread the box plot exists to avoid, so the
figure marks the median diamond instead). And the figure carries a dashed vertical line labeled
**"District average"**: that line is the whole-table mean residual, `avg(residual)` over every
student in the dataset ([engine/compute.js](../engine/compute.js) `buildDemo`), which sits
≈ 0 by construction for state-standardized residuals — it is *not* a per-group statistic.

**Worked check** (12 residuals: −1.9, −0.8, −0.55, −0.3, −0.2, −0.05, 0.05, 0.2, 0.3, 0.5,
0.7, 2.4): q1 sits at position (12−1)·0.25 = 2.75, i.e. 75% of the way from the 3rd to the
4th sorted value: −0.55 + 0.75·(−0.30 − (−0.55)) = **−0.3625**. Engine output: q1 = −0.3625,
median = 0.0, q3 = 0.35, IQR = 0.7125, fences at −1.43 and +1.42, whiskers at −0.8 and +0.7,
outliers {−1.9, +2.4}. ✓

### 12. Scores vs. growth (the scatter)

- **y-axis**: overall growth residual per school — raw or shrunken per the estimate setting
  (shrunken is the default; the student-level view is always raw, since individual students
  aren't shrunk — there's no "cell" to stabilize).
- **x-axis**: mean standardized current-year score (status). A single `toZ` helper
  re-standardizes the x-axis against *whatever points are being plotted*, so the basis is
  **view-dependent**. In the **school view** the points are the school mean-status values, so
  it subtracts the mean of school means and divides by their SD — "where this school's scores
  sit within this district." In the **student view** it standardizes against the per-student
  status distribution instead, computed over the *stride-sampled* points actually drawn
  (≤ 2,000), so for a large district the x-axis origin and scale shift slightly with the
  sample. (The export deck's scatter, by contrast, plots the raw state-z school means — so the
  axis *numbers* differ between app and deck. This is the one open methodology item: review
  B5, Appendix D.)
- The student view stride-samples to ≤ 2,000 dots (shape-preserving) so large districts don't
  melt the SVG; the x-standardization above runs *after* that sampling.
- Quadrant labels split at the *district-mean cross*, not at zero — and that cross is computed
  over the displayed points too: an n-weighted mean of the school means in the school view, and
  an *unweighted* mean over the plotted (sampled) student points in the student view, since
  individual student points carry no enrollment weight.

### 13. The statewide page (PRiME database)

A different data source with different rules — worth keeping cleanly separate in your head
from Parts II–III, which are about *within-district* computation on student rows.

**What the file is.** `reference/prime_growth_database.csv`: one row per school × year, with
the PRiME school-level growth score (`growth_zscore_all_{ela,math}`) and a statewide rank
(`prime_rank_all_1yr_{ela,math}`). The score is a school-level summary on the same
standardized-residual scale the rest of the app lives on — 0 = a typical year of growth; the
statewide school distribution spans roughly ±0.4 — which is what licenses both the shared
"typical year of growth" reference line and the shared weeks-per-SD translation (Part VI).
These are the state's numbers; GrowthLens computes no statewide statistics of its own.

**The District Report's takeaway card** ([engine/prime.js](../engine/prime.js)
`primeTakeaways`) generates up to three plain-language insights — how many of the district's
schools reached typical growth per subject, the standout school with its statewide rank, and
the year-over-year direction — and then *always* appends a fixed scale caveat telling the user
these are statewide PRiME scores, "a different scale from the rest of this tool ... not
comparable to the SD or weeks numbers on other pages." That caveat is narrower than it sounds
and does **not** contradict the commensurability claim above: what is shared is the *units and
the zero* (a PRiME score of 0 is a typical year, and the same weeks-per-SD factors apply),
which is what licenses the reference line and the unit toggle; what is *not* comparable is a
statewide school-level PRiME value read point-against a within-district student-level residual —
different populations, so the two pages' point values shouldn't be set side by side. (See
Appendix D, item 5, on tightening this in print.)

**The rules the page follows** ([engine/prime.js](../engine/prime.js)):

- **Identity is composite** (lea_id, school_id) — school codes repeat across districts; codes
  are strings with leading zeros (016090, not 16090).
- **Ranks are within level × year × subject.** "33rd of 1,008" means among elementary schools
  that year in that subject; a school is never ranked against a different school type. The
  pool size is the count of *ranked* schools in that cell (verified: max rank = pool size).
- **Levels can change across years**; the displayed year's classification wins, so a
  reclassified school moves pools when you move the year picker.
- **Histogram binning** uses bin edges at integer multiples of the bin width — **0.05** for
  the displayed figures, supplied by the *callers* (`RPT_BIN_W` in
  [district-report.jsx](../district-report.jsx) and the deck's `statewideSlides` in
  [engine/deck.js](../engine/deck.js)); the `histogram` helper itself defaults to 0.1 but is
  always invoked with 0.05, so don't be thrown reading 0.1 in the engine. Edges are computed in
  integer bin indices with an epsilon — so the dashed zero line always falls exactly on a bin
  edge and boundary values like z = 0.20 don't fall into floating-point limbo. Gold tiles
  (your schools) get a fixed visible height — with a 1,000-school pool, an area-true tile
  would be invisible; position carries the meaning, and rank lives in the hover/caption.
- **The trend line is an unweighted mean** of the district's school z's per year — the file
  carries no enrollment to weight by. Disclosed on the page and in the deck footer
  ("weighting schools equally").
- **2020 simply doesn't exist** (statewide testing cancelled). Trend lines bridge the gap
  with a *dashed* segment between the adjacent measured years — the series visibly continues,
  the dashes admit nothing was measured — and the '20 axis label is ghosted.
- **Units toggle** (added 2026-06-13): weeks mode converts through the same machinery as
  every other page — each chart's own year × subject grade-average factor; the multi-year
  trend uses **one factor per subject** (the latest year's) for *every* year, so switching
  units is a pure axis relabel that can never reshape the line. Footnotes name the factors.

---

## Part VI — Weeks of learning

### 14. The whole construction

SD units are the honest native scale and mean nothing to most audiences. The translation:
**how many weeks of typical learning does a difference of this size represent?**

#### 14a. Building the conversion factors (the data-prep pipeline)

Source: DESE's published statewide MAP grade-level summaries — mean and SD of scale scores
per year × grade × subject ([data-prep/scripts/01_build_conversion_factors.R](../data-prep/scripts/01_build_conversion_factors.R);
methodology note: [data-prep/notes/methodology.md](../data-prep/notes/methodology.md)).

**The synthetic cohort.** We want "how much does a typical Missouri student grow in one
year," in SD units. Without longitudinal student data, pair adjacent statewide snapshots:
this spring's grade-g population is, to a first approximation, last spring's grade-(g−1)
population one year later. Define, per (year t, grade g, subject):

```
annual_growth_effect_size  es(g,t) = ( mean[g, t] − mean[g−1, t−1] ) / sd[g−1, t−1]
```

— the one-year rise in the statewide mean, measured in *starting-cohort* SDs.

Three deliberate choices inside that formula:

- **Baseline SD, not pooled SD.** The denominator is the prior-year, prior-grade SD: the
  question is "how many SDs of where the cohort *started* is a year of growth," so the
  starting dispersion is the natural unit. It also keeps each factor self-contained (one pair
  of published rows). Cost: a single SD estimate is noisier than an average of several —
  negligible at statewide n's.
- **Vertical-scale assumption (the big one).** Subtracting a grade-(g−1) mean from a grade-g
  mean is only meaningful if MAP's grade scales are articulated well enough for cross-grade
  score differences to carry meaning. This is exactly the assumption behind the widely cited
  national growth norms (Bloom, Hill, Black & Lipsey 2008), built from the identical
  adjacent-grade design — that citation is the methodological anchor. Where vertical
  equating is imperfect, the artifact flows into the factor (inflated cross-grade gap ⇒
  "more growth per year" ⇒ *smaller* weeks-per-SD for that grade), which the grade-averaging
  below damps.
- **Skip, never impute.** Spring 2020 was cancelled: no 2020 factors (no outcome data) and no
  2021 factors (outcome exists, baseline doesn't). The deployed table covers 2019 and
  2022–2025, grades 4–8 (grade 3 has no grade-2 MAP baseline), both subjects. 2022's factors
  carry a flag in the notes: their "annual growth" partially measures pandemic *rebound*.

**From effect size to weeks.** A Missouri school year ≈ **38 instructional weeks** of
learning, worth es SDs of growth. So one SD is worth `38/es` weeks, and a residual converts as

```
weeks = 38 · z / es
```

This is the **magnitude form** — it converts the *gap from expectations*. (The level form,
`38·(1 + z/es)`, would add back the typical year itself: a student at z = 0 "learned 38
weeks' worth." GrowthLens displays differences, so the magnitude form is the right one, and
the JSON's `formula` field documents both.)

#### 14b. How the app applies the factors

[engine/units.js](../engine/units.js) (`weeksPerSD`, `resolveFactorYear`):

- **Per-grade where a grade exists**: heatmap cells convert with their own grade's factor —
  a year of growth is worth very different amounts in grade 4 and grade 8.
- **Grade-average elsewhere**: school-level gaps, box plots, overview numbers, and the
  statewide page span grades, so they use the year × subject **average across grades 4–8**.
  Grade-3 cells also fall back to this average.
- **The averaging convention — average first, convert second.** The pooled factor is
  `38 / mean(es)`, *not* `mean(38/es)`. These differ by Jensen's inequality (1/x is convex,
  so the mean of reciprocals exceeds the reciprocal of the mean — the small-es grades blow up
  the naive average). With the real 2025 ELA factors (es by grade 4–8: 0.6072, 0.3352,
  0.1881, 0.5718, 0.2808):

  ```
  38 / mean(es) = 95.8 weeks/SD        mean(38/es) = 116.0 weeks/SD
  ```

  A 20% difference from convention alone. The implemented form (95.8) weights grades by
  their growth on the score scale and is the more conservative; it's documented precisely so
  a reviewer recomputing "the average factor" the other way understands the discrepancy.
- **Where the year and subject come from**: every non-statewide conversion reads the active
  subject and year from `window.WOL_OPTS`, which the app shell sets on each render
  ([forest-shared.jsx](../forest-shared.jsx), [app-shell.jsx](../app-shell.jsx)). The subject
  is the globally selected one; the year is the *loaded dataset's own latest growth year*
  (`meta.latestYear`) for a real upload, falling back to 2025 only for the bundled demo
  (whose year is a label, not a number) or before the shell has mounted — `DEFAULT_WOL_YEAR`.
  Call sites can override year/subject/grade per call; the per-call *grade* override is the one
  thing that switches a heatmap cell onto its own-grade factor.
- **Year fallback**: a requested year with no factors resolves to the nearest *prior* year
  with factors, else the earliest available (2021 → 2019; 2018 → 2019; post-2025 → 2025).
  Footnotes name the factor year actually used — the fallback is never silent.
- **Total failure fallback**: if the factor table doesn't load, a crude constant keeps the
  toggle working: `132 ≈ 38/0.29`, where 0.29 is a typical mid-grades annual-growth effect
  size consistent with the national norms. Footnotes disclose it.
- **Rounding and sign**: displayed weeks are rounded to whole weeks; factors are stored at 4
  decimals; SD values show two decimals. One presentation contract, since it surprises people
  who copy values out: every signed number in the UI uses a typographic Unicode minus
  (−, U+2212), *not* an ASCII hyphen, and forces an explicit `+` on positives — with one
  intentional inconsistency at exactly zero (the heatmap prints an unsigned `0`, while the
  SD/weeks text formatters print `+0.00`). This changes no computed value, only the glyphs.

#### 14c. The hazard: small effect sizes make loud weeks

Because es sits in the denominator, a grade where typical annual growth is small converts
modest SD differences into eye-catching week counts. The canonical extreme, from the real
table: **2024 grade-6 ELA, es = 0.1289 ⇒ 294.8 weeks per SD** — so a +0.20 SD cell renders
as **+59 weeks ≈ 1.6 school years**. That is the grade's *small typical growth* doing the
talking, not a bigger underlying difference. The methods note carries this worked example;
when a weeks number looks theatrical, read the SD value next to it.

And the standing caveat: weeks are a **translation, not a second measurement**. "About 10
weeks ahead" means "this gap is the size of what a typical Missouri student learns in ~10
weeks" — nobody observed extra instructional time. The statewide factor also calibrates to
the *state's* growth rate: a district whose true growth runs faster or slower than Missouri's
gets internally consistent weeks numbers scaled to the state's metabolism, not its own. The
arithmetic assumes learning accrues linearly across the 38 weeks (it doesn't, exactly —
treat sub-month precision as false precision), and the synthetic cohort assumes year-over-year
enrollment shifts roughly cancel statewide.

**Running example.** 2025 math grade-average factor: `38/mean(es) = 90.94` weeks/SD (es by
grade: 0.5882, 0.3887, 0.3193, 0.3343, 0.4589). Maplewood's district gap −0.123 SD ⇒ **about
−11 weeks**: FRL students grew about 11 weeks of typical math learning less than their
non-FRL schoolmates. Aspen's shrunken −0.204 ⇒ **−19 weeks**. A grade-5 heatmap cell would
instead use the grade-5 factor, 97.76.

---

## Part VII — Guardrails

### 15. Two different kinds of gates (don't conflate them)

**Inferential gates** decide whether an estimate is *trustworthy enough to act on*:

- **min-n (10)**: cells below it are flagged, excluded from fits, set apart in figures.
- **The reliable-signal gate**: a comparison is "reliable" iff the district-wide 95% interval
  lies entirely on one side of zero (`ciLo > 0 || ciHi < 0`). This single predicate gates the
  export deck's school-by-school appendix slides (no reliable district signal → no per-school
  slide) and the Resources page's evidence matching (a finding only fires when the pooled
  interval is wholly below zero, or — for the low-growth trigger — the n-weighted band mean
  is ≤ −0.05). Maplewood's FRL comparison, CI [−0.283, +0.036], fails this gate.

**Editorial thresholds** decide which *sentences* the takeaway generators bother writing —
emphasis, not significance (listed in methods §8; engine/insights.js):

| Constant | Role |
|---|---|
| ±0.02 SD | noise floor for direction words ("ahead"/"behind") and reversal mentions |
| 0.05 SD | minimum grade-spread before the fastest-vs-slowest-grade sentence appears |
| 0.15 SD | a school × grade cell is a "standout" at or beyond this |
| ⅔ | share of reliable schools leaning the district's way before a gap is called district-wide |
| 2 × gap | within-group IQR must exceed twice the gap before "groups overlap heavily" appears |
| −0.05 SD | Resources flags a grade band as below expectations at or under this n-weighted mean |

A reviewer should be able to disagree with these numbers; they're choices, and they're
disclosed as such.

**Takeaways are generated, not hand-written.** Those thresholds feed a small machine that
emits the prose on every overview card and deck slide, so its output contract is worth stating.
Each page's generator ([engine/insights.js](../engine/insights.js)) returns at most three
ranked insights, most- to least-important, plus an optional muted caveat — four items at most
(`select`). The export deck reuses the same generators but drops the caveat and caps at three
([engine/deck.js](../engine/deck.js) `pickTakeaways`). The deck also derives two counts the app
itself never shows, and they don't use the gates above: the gaps-overview table's **"leaning"**
column is a plain "X of Y" — the min-n-reliable schools whose displayed gap shares the *sign*
of the shrunken district gap, with **no ⅔ gate** (distinct from the ⅔ "pervasive" rule in the
table, which governs an insights *sentence*); and the **glance tile "Growing faster than
expected = N/M"** counts schools whose shrunken Overall growth is ≥ 0 (`cellVal ≥ 0`, i.e. raw
only where no shrunken value exists). Same data, two different framings — know which one you're
reading.

### 16. What the numbers can't say

Unchanged from the public note, but the *reasons* deserve a sentence each:

- **Not a value-added model.** The state's residuals condition on prior score and grade —
  nothing else. No teacher, classroom, or program effect is identified anywhere in this
  pipeline, so using these numbers to evaluate individual teachers is statistically
  unsupported, full stop.
- **Not causal.** Every estimate is descriptive: *where* gaps and residuals appear, never
  *why*. The FRL gap conflates everything correlated with FRL status that the state model
  doesn't condition on.
- **Not a suppression-compliant report.** min-n = 10 is triage; public reporting rules
  (often n ≥ 30) are stricter and vary.
- **Model-mismatch fragility.** All of Part III assumes the state's residuals mean what they
  claim. Normality assumptions enter at two levels (u_i and e_i); means are reasonably robust
  to that, but the τ²/shrinkage machinery leans on it more than the raw estimates do.

---

## Appendix A — The running example, end to end

One block, every number, in pipeline order (all engine-computed):

```
INPUTS                      7 schools' cell summaries (Part 0 table)

CELL SEs                    SE = √(max(S², ms²)/n)
                            Fir FRL: √(max(0.20, 0.36)/12) = 0.173205   ← floor active
GAPS (focal − reference)    Aspen −0.350 … Fir +0.120, Ginkgo −0.400
GAP SEs                     √(SE_A² + SE_B²): 0.0725 … 0.3393
THRESHOLD                   Ginkgo FRL n = 7 < 10 → excluded from fits, still displayed

FIT (k = 6)                 Σw = 547.382   Σw² = 69,533.068   μ_FE = −0.111929
                            Q = 9.1763     c = 420.354
DL                          τ² = (9.1763 − 5)/420.354 = 0.009935
REML                        τ² = 0.009934  (τ = 0.0997); profile: ℓ_R(0)=5.142 < ℓ_R(τ̂²)=5.661 > ℓ_R(2τ̂²)=5.530

POOLED MEAN                 weights 1/(se² + τ²): 35.9, 49.9, 29.8, 65.8, 57.6, 20.6
                            μ̂ = −0.123435   SE(μ̂) = 0.062069
                            t₅ = 2.571 → CI [−0.283, +0.036]   → crosses 0 ⇒ fails reliable gate

SHRINKAGE                   B = τ²/(τ² + se²); θ̂ = B·g + (1−B)·μ̂
                            SE(θ̂) = √(B·se² + (1−B)²·SE(μ̂)²); CI = θ̂ ± 2.571·SE(θ̂)
                            Aspen  B=0.357  −0.350 → −0.204  [−0.434, +0.025]
                            Birch  B=0.495  −0.250 → −0.186  [−0.385, +0.013]
                            Cedar  B=0.296  −0.180 → −0.140  [−0.383, +0.102]
                            Dogwood B=0.654 −0.080 → −0.095  [−0.256, +0.066]
                            Elm    B=0.572  +0.020 → −0.041  [−0.223, +0.140]   ← sign flip
                            Fir    B=0.205  +0.120 → −0.073  [−0.335, +0.188]   ← outlier reined in
                            Ginkgo B=0.079  −0.400 → −0.145  [−0.432, +0.141]   ← shrunk hardest

DEGENERATE COUNTERFACTUAL   identical gaps → DL = REML = 0 → canShrink = false → raw, B = 1

WEEKS (2025 math, grade-avg 90.94/SD)
                            district −0.123 SD ≈ −11 weeks;  Aspen −0.204 SD ≈ −19 weeks
```

## Appendix B — Where every formula lives

| Computation | File | Function / site |
|---|---|---|
| Cell SE floor `√(max(S²,ms²)/n)` | [engine/stats.js](../engine/stats.js) | `cellSE` |
| Gap SE `√(SE_A²+SE_B²)` | engine/stats.js | `gapSE` |
| DerSimonian–Laird τ² | engine/stats.js | `dlTau2` |
| REML τ² (golden-section) | engine/stats.js | `remlTau2` |
| Pooled mean + t(k−1) CI | engine/stats.js | `pooledMean`, `tCrit95` |
| On-page recompute of district mean+CI (Overview card only; raw gaps) | [app-shell.jsx](../app-shell.jsx) | `districtMeanRE` |
| Shrinkage `B`, posterior mean/SD (interval only at the gaps grain, via `muSe`) | engine/stats.js | `shrink` |
| Box plot (type-7 quantiles, Tukey whiskers) | engine/stats.js | `summarize` |
| OLS (present; not behind any current figure) | engine/stats.js | `ols` |
| Cell aggregation SQL (n, r̄, S², ms²) | [engine/compute.js](../engine/compute.js) | `cells`, `cellsOverall` |
| Gaps pipeline, guards, t intervals | engine/compute.js | `buildGaps` |
| Heatmap per-grade shrinkage; shared Overall | engine/compute.js | `buildHeatmap` |
| Box-plot data; outlier even-sampling | engine/compute.js | `buildDemo`, `sampleOutliers` |
| Scatter (x re-standardized per view, post-sampling) | [achievement.jsx](../achievement.jsx) | `toZ` |
| Heatmap diverging color scale (SD-space, saturates ±0.3) | [heatmap-variants.jsx](../heatmap-variants.jsx) | `divColor`, `SCALE_MAX` |
| Active year/subject for non-statewide weeks | [forest-shared.jsx](../forest-shared.jsx) | `WOL_OPTS`, `wolDefaults` |
| Display formatting (Unicode minus, forced sign, CIs) | forest-shared.jsx, heatmap-variants.jsx | `fmt2`, `fmtVal`, `fmtCI`, `formatUnit` |
| min-n constant | engine/compute.js | `MIN_N = 10` |
| Ingestion rules (latest year, grades 3–8, flags) | [engine/ingest.js](../engine/ingest.js) | `loadSubjectFile`, `SUBGROUPS` |
| weeks-per-SD, factor-year fallback | [engine/units.js](../engine/units.js) | `weeksPerSD`, `resolveFactorYear` |
| Factor construction (synthetic cohort) | [data-prep/scripts/01_build_conversion_factors.R](../data-prep/scripts/01_build_conversion_factors.R) | |
| PRiME ranks/pools/histograms/trend | [engine/prime.js](../engine/prime.js) | `poolCounts`, `histogram`, `districtMeanSeries` |
| Reliable-signal gate | [engine/deck.js](../engine/deck.js) | `isReliable` |
| Editorial thresholds | [engine/insights.js](../engine/insights.js) | constants |
| Calibration suite | `tools/validate-stats-*.cjs` | |

## Appendix C — Reproducing every number

The example script (also preserved at `%TEMP%\gl-verify\guide-example.cjs` on the dev
machine) — paste into `tools/`, adjust `ROOT`, and run with `node`:

```js
const S = require('../engine/stats.js');
const U = require('../engine/units.js');
const CF = require('../reference/conversion_factors.json');

const CELLS = [
  { name: 'Aspen',   A: { n: 58,  rbar: -0.262, s2: 0.81, ms2: 0.16 }, B: { n: 214, rbar: 0.088, s2: 0.84, ms2: 0.16 } },
  { name: 'Birch',   A: { n: 102, rbar: -0.205, s2: 0.78, ms2: 0.16 }, B: { n: 331, rbar: 0.045, s2: 0.82, ms2: 0.16 } },
  { name: 'Cedar',   A: { n: 45,  rbar: -0.118, s2: 0.85, ms2: 0.16 }, B: { n: 168, rbar: 0.062, s2: 0.80, ms2: 0.16 } },
  { name: 'Dogwood', A: { n: 210, rbar: -0.041, s2: 0.79, ms2: 0.16 }, B: { n: 540, rbar: 0.039, s2: 0.81, ms2: 0.16 } },
  { name: 'Elm',     A: { n: 150, rbar: 0.052,  s2: 0.83, ms2: 0.16 }, B: { n: 420, rbar: 0.032, s2: 0.80, ms2: 0.16 } },
  { name: 'Fir',     A: { n: 12,  rbar: 0.205,  s2: 0.20, ms2: 0.36 }, B: { n: 96,  rbar: 0.085, s2: 0.82, ms2: 0.16 } },
  { name: 'Ginkgo',  A: { n: 7,   rbar: -0.355, s2: 0.74, ms2: 0.16 }, B: { n: 88,  rbar: 0.045, s2: 0.83, ms2: 0.16 } },
];
const MIN_N = 10;
const schools = CELLS.map((c) => {
  const seA = S.cellSE(c.A), seB = S.cellSE(c.B);
  return { name: c.name, rawGap: c.A.rbar - c.B.rbar, rawSe: S.gapSE(seA, seB),
           meets: c.A.n >= MIN_N && c.B.n >= MIN_N };
});
const fit = schools.filter((s) => s.meets).map((s) => ({ gap: s.rawGap, se: s.rawSe }));
const tau2 = S.remlTau2(fit);                       // 0.009934  (dlTau2: 0.009935)
const pooled = S.pooledMean(fit, tau2);             // mu -0.123435, se 0.062069, CI [-0.283, +0.036]
const q = S.tCrit95(fit.length - 1);                // 2.571
for (const s of schools) {
  const sh = S.shrink({ rawGap: s.rawGap, rawSe: s.rawSe, tau2, mu: pooled.mu, muSe: pooled.se });
  console.log(s.name, sh.B, sh.shrunkGap, [sh.shrunkGap - q * sh.shrunkSe, sh.shrunkGap + q * sh.shrunkSe]);
}
console.log(U.weeksPerSD(CF, { year: 2025, subject: 'math' }));            // 90.94
console.log(U.weeksPerSD(CF, { year: 2024, subject: 'ela', grade: 6 }));   // 294.80
console.log(U.resolveFactorYear(CF, 2021, 'math'));                        // 2019
```

Calibration: `node tools/validate-stats-4-policy.cjs` re-measures the shipped policy's
coverage table from Part IV.

## Appendix D — Known open items

Carried forward from the 2026-06-12 review, so this guide doesn't overstate:

1. **B5 (open):** the scatter's x-axis is district-re-standardized in the app but raw state-z
   in the export deck. Internally consistent each, mutually inconsistent, undocumented in the
   public note. Decide and align.
2. **τ̂² uncertainty is not in the intervals.** The t(k−1) quantile and the calibration suite
   are the mitigation, and measured coverage is acceptable (91.6–98.3%) — but a Morris-style
   correction or a weakly-informative prior on τ remains the more principled upgrade if an
   external reviewer pushes.
3. **τ² attenuation from the threshold.** Excluding below-min-n schools from the fit can pull
   τ̂² slightly low (the excluded tail is the high-SE one). Disclosed in the public note.
4. **2022 factors partially measure pandemic rebound** — flagged in data-prep notes; prefer
   2023+ factors in public communication.
5. **PRiME-scale commensurability** is asserted (school-level scores on the student-residual
   SD scale; spread ≈ ±0.4 is consistent) rather than derived from PRiME's own construction
   docs in this repo. Worth one citation/sentence from the PRiME side before external review.

## Appendix E — References

- DerSimonian, R. & Laird, N. (1986). Meta-analysis in clinical trials. *Controlled Clinical
  Trials*, 7(3), 177–188. — the τ² moment estimator (§6a).
- Harville, D. A. (1977). Maximum likelihood approaches to variance component estimation and
  to related problems. *JASA*, 72(358), 320–338. — REML and the restricted likelihood (§6b).
- Viechtbauer, W. (2005). Bias and efficiency of meta-analytic variance estimators in the
  random-effects model. *Journal of Educational and Behavioral Statistics*, 30(3), 261–293.
  — comparison of τ² estimators, REML recommendation (§6b).
- Knapp, G. & Hartung, J. (2003). Improved tests for a random effects meta-regression with a
  single covariate. *Statistics in Medicine*, 22(17), 2693–2710. — small-k interval
  correction motivating t(k−1) (§7, §8).
- Efron, B. & Morris, C. (1975). Data analysis using Stein's estimator and its
  generalizations. *JASA*, 70(350), 311–319. — the canonical shrinkage exposition (§8).
- Morris, C. N. (1983). Parametric empirical Bayes inference: theory and applications.
  *JASA*, 78(381), 47–55. — accounting for hyperparameter uncertainty in EB intervals
  (§8, Appendix D).
- Bloom, H. S., Hill, C. J., Black, A. R. & Lipsey, M. W. (2008). Performance trajectories
  and performance gaps as achievement effect-size benchmarks for educational interventions.
  *Journal of Research on Educational Effectiveness*, 1(4), 289–328. — adjacent-grade growth
  norms; the scale-comparability anchor (§14).
- Tukey, J. W. (1977). *Exploratory Data Analysis*. — box plots and the 1.5·IQR fences (§11).
- Hyndman, R. J. & Fan, Y. (1996). Sample quantiles in statistical packages. *The American
  Statistician*, 50(4), 361–365. — quantile "type 7" (§11).
