# GrowthLens — Real Data Ingestion Engine (DuckDB-WASM)

**Status:** Design approved (brainstorming complete) — pending implementation plan
**Date:** 2026-06-08
**Author:** Andrew Camp (with Claude)
**Supersedes:** the README "Data wiring" TODO that names PapaParse — we use DuckDB-WASM instead.

> This is a **prospective design document**. None of the `engine/*` modules exist yet; the codebase
> today is entirely mock-data-driven (static fixtures + a synthetic-Math transform). This spec defines
> the v1 architecture to build.

---

## 1 · Purpose & scope

GrowthLens v0.4 is a design prototype whose entire data layer is mocked: the Upload page never reads
files, no parser exists, "DuckDB-WASM" is named in user-facing copy but absent from the code, and every
figure renders hand-authored static fixtures (`data.js`, `heatmap-data.js`, `demo-data.js`). Math is a
synthetic affine transform of ELA.

This project replaces that façade with a **real, in-browser ingestion + computation engine** built on a
**vendored DuckDB-WASM**, so a district can upload its own files and the privacy promise ("nothing leaves
the browser") becomes literally true and verifiable.

### In scope (v1)

- Parse, validate, and compute on real **Missouri DESE / MOSIS** subject files.
- Single **district**, **latest year**, the **five** subgroup comparisons already in the UI.
- **Both subjects supported equally in the upload pathway** (Math + Communication Arts/ELA). The
  **bundled demo shows Math only**; ELA is greyed out until a real ELA file is uploaded (see §6).
- Compute all figure data (heatmap, gap forest, demographics box plots, status/growth scatter) from real
  per-student residuals via DuckDB SQL aggregation + a pure-JS statistics layer.
- Make the DuckDB-WASM privacy/methods copy true and accurate.

### Explicitly out of scope (v1) — seams left, not built

- **Multi-year UI** — the compute unit is parameterized by year (`computeSlice(year, subject)`) so
  multi-year is an additive memoized-lazy extension later. v1 computes the latest year per subject only.
- **Settings / configurable min-n UI** — min-n stays at the default (10); Settings remains stubbed.
- **Expanded subgroups** — the subgroup config is data-driven so new groups are a config-only change, but
  v1 ships the existing five.
- **Shrunken heatmap / shrunken demographics variants** — deferred (see §6).
- **Regenerating the bundled demo through the engine** — v1 keeps the existing demo fixtures as-is
  (illustrative; see §3.6 note); a later task may regenerate them for full model-consistency.
- **Production build (Vite), CI, sample CSV files** — unchanged from today.

### Success criteria

1. A user drops two real DESE files (Math + ELA); within ~1s of engine warm-up every page shows real
   computed values, no fixtures.
2. `stats.js` correctness is verified two ways (see §8): the **downstream EB formulas** reproduce the
   fixture's derived columns *given the fixture's inputs*, and **REML τ² + pooled mean** match an
   **independent** oracle (hand-computed case / R `metafor`). The engine is *not* expected to reproduce
   the fixture's hand-set τ²/districtGap (see §3.6).
3. No student data is transmitted off-device; no third-party network request occurs (engine is vendored
   same-origin). Verifiable in devtools, as the methods note invites.
4. Every user-facing claim (DuckDB-WASM, "schema validated", residual definition) is true and matches
   `methods.html`.

---

## 2 · Input data contract (DESE / MOSIS)

Files are **subject-specific** (one file per subject). Residuals are **pre-computed upstream by the
Missouri DESE growth model** — GrowthLens does **not** fit a residual model; it ingests the standardized
residual and aggregates/shrinks it.

### 2.1 Columns

Let `{P}` be the subject prefix (`MATH` or `COMM_ARTS`). The prefix is **detected dynamically** from the
column matching `^(.*)_Z_RESIDUAL$` (case-insensitive), then mapped to a subject key via a small map
(`MATH → math`, `COMM_ARTS → ela`). Detection-by-suffix tolerates a near-miss prefix; the map must list
the real string (see §9).

**Required — absent ⇒ blocking error:**

| Canonical field | Raw column | Notes |
|---|---|---|
| `residual` | `{P}_Z_RESIDUAL` | standardized growth residual (already in SD units) |
| `residual_se` | `{P}_Z_RESIDUAL_SE` | per-student measurement SE of the residual |
| `status` | `{P}_Z_T` | same-year standardized score → the "status" axis of Status & Growth |
| `school` | `SCHOOL_CODE` | school identity (single district); `school_id = SCHOOL_CODE` |
| `grade` | `GRADE` | integer grade (3–8 expected) |
| `year` | `GROWTH_YEAR` | latest is selected (per subject) |
| FRL flag | `FREE_OR_REDUCED_LUNCH` | required (always present in DESE files) |
| IEP flag | `IEP_DISABILITY` | required |
| EL flag | `ENGLISH_LANGUAGE_LEARNER` | required |
| race one-hots | `BLACK`, `WHITE`, `HISPANIC` | required (for the two race comparisons) |

The five subgroup comparisons (§1) are a v1 promise, so the six flag columns above are **required**;
absence is a blocking error listing exactly which are missing. (This resolves what an earlier draft left
ambiguous between "required" and "warn + grey out".)

**Optional / tolerated but ignored in v1:** `MOSIS_STATE_ID`, `REPORT_YEAR`, `COUNTY_DISTRICT_CODE`
(display only), `{P}_Z_PREDICTED`, `{P}_Z_PREDICTED_SE`, and all other subgroup columns (`GENDER`,
`GIFTED`, `HOMELESS`, `MILITARY`, `FOSTER`, `DIRECT_CERT`, `IN_BLDG_LESS_THAN_FAY`, `STUDENT_GROUP`,
`AMERICAN_INDIAN`, `ASIAN_PACIFIC_ISLANDER`, `MULTI_RACE`, `Neglected_delinquent`).

### 2.2 Parsing rules

- **Case-insensitive** for every column name (the source mixes case, e.g. `Neglected_delinquent`,
  `IN_BLDG_LESS_THAN_FAY`). Headers are normalized to an uppercase canonical form for matching.
- **Flag values parsed tolerantly and case-insensitively:** `Y`/`N`, `1`/`0`, `T`/`F`, `true`/`false`,
  `Yes`/`No`. Unrecognized/empty → treated as "not in group" (false), and counted.
- **Latest year is per subject, independent.** Each file filters to its own `max(GROWTH_YEAR)`. If the
  user uploads Math(2024) + ELA(2023), each subject renders at its own latest year; `DatasetStrip` shows
  the year per subject. (No cross-subject year constraint in v1.)
- **Row drops:** rows with null/non-numeric `residual` are dropped and counted (surfaced as a warning).
- **Below-min-n cells are flagged, not dropped** — district statistics still include them per the
  threshold mode (§6); they are excluded only from the τ² fit and pooled mean (§3.4).

### 2.3 Subgroup configuration (data-driven, extensible)

Each comparison is a config entry; adding a subgroup later is a config-only change. Each defines a key,
label, and the predicate selecting each group's rows, with the sign convention `groupA − groupB`:

| key | label | groupA (focal) | groupB (reference) |
|---|---|---|---|
| `frl` | FRL · economically disadvantaged | `FREE_OR_REDUCED_LUNCH` = true | = false |
| `iep` | IEP · students with disabilities | `IEP_DISABILITY` = true | = false |
| `el` | EL · English learners | `ENGLISH_LANGUAGE_LEARNER` = true | = false |
| `race_bw` | Race · Black vs. White | `BLACK` = 1 | `WHITE` = 1 |
| `race_hw` | Race · Hispanic vs. White | `HISPANIC` = 1 | `WHITE` = 1 |

**Sign convention (uniform across all five):** `gap = mean_residual(groupA) − mean_residual(groupB)` =
**focal − reference**, so a **negative gap always means the focal group (A) has the lower mean residual** —
the sign is directly informative about the focal/marginalized group. Group membership uses the flag/one-hot
columns directly; rows matching neither side of a comparison are excluded from that comparison only.

> **Convention change from the legacy fixture.** The existing `data.js` was authored advantaged − focal
> (`groupA = "non-FRL"`, `groupB = "FRL"`, `districtGap = +0.18`). v1 flips to focal − reference, so the
> demo fixture's `groupA`/`groupB` are swapped and every gap/CI/`districtGap` sign is negated
> (`+0.18 → −0.18`). `methods.html` and any "positive gap" figure copy are updated to match (§7).

---

## 3 · Statistics (methodology — documented for audit)

All estimates are built from one primitive — the **cell** (a set of students sharing a grouping:
school×grade, school×subgroup, or school-overall). This section is the load-bearing math; it lives in the
pure module `engine/stats.js` and is unit-tested in Node.

### 3.1 Cell point estimate

For a cell of `n` students with residuals `rᵢ`:

```
r̄ = (1/n) Σ rᵢ          (simple, unweighted mean of standardized residuals)
```

We use the simple mean (not inverse-variance weighted) so "mean residual" is consistent across every
figure and matches `methods.html`. (The §3.2 floor logic below is derived for the simple mean and would
not carry over unchanged to a weighted mean.)

### 3.2 Cell standard error — measurement-error aware

The state supplies a per-student residual SE `sᵢ`, which most pipelines lack. We use it as a **precision
floor** without double-counting. Model each observed residual as `rᵢ = θᵢ + εᵢ` where:

- `θᵢ` is student i's *true* residual, `θᵢ ~ (μ_cell, σ²_b)` iid within the cell;
- `εᵢ` is measurement error, `εᵢ ~ (0, sᵢ²)`, independent of `θᵢ`; `sᵢ` treated as a known constant.

Let `S² = (1/(n−1)) Σ (rᵢ − r̄)²` (sample variance) and `ms2 = (1/n) Σ sᵢ²` (mean measurement variance).
Then (both exact under the model above, **no equal-variance assumption needed** even with heteroskedastic
`sᵢ`):

```
Var(r̄) = σ²_b / n  +  (1/n²) Σ sᵢ²  =  σ²_b / n  +  ms2 / n      ... (i)
E[S²]   = σ²_b + ms2   ⇒   estimate  σ̂²_b = max(0, S² − ms2)      ... (ii)  (truncated moment estimator)
```

Substituting (ii) into (i):

```
Var(r̄) ≈ max(0, S² − ms2)/n + ms2/n
        = (S² − ms2 + ms2)/n = S²/n            when S² ≥ ms2   (the common case)
        = ms2/n                                 when ms2 > S²   (measurement variance dominates)
        = max(S², ms2) / n

⇒  SE_cell = √( max(S², ms2) / n )
```

**Interpretation.** When there is real between-student heterogeneity (`S² ≥ ms2`, common) this reduces
exactly to the classic `√(S²/n)`. When a cell is small/homogeneous and the sample variance *understates*
the true noise, the state's measurement variance acts as a floor, so we never claim more precision than
the measurements support — no double counting (measurement error already in `S²` is not added twice). The
`max(0, ·)` makes `σ̂²_b` a truncated moment estimator (slightly biased upward near the floor; acceptable).
This **extends `methods.html` §3** and will be documented there.

Edge cases: `n = 1` → `S²` undefined → `SE = √ms2 = s₁` (the single student's SE); `n = 0` → cell absent.

### 3.3 Gap (school × subgroup pair)

Within a school, for comparison `(A, B)`:

```
raw_gap         = r̄_A − r̄_B
raw_se          = √( SE_A² + SE_B² )
n_a, n_b        = cell counts
meets_min_cell  = (n_a ≥ minN) ∧ (n_b ≥ minN)        minN default 10
raw_ci95        = raw_gap ± 1.96 · raw_se
```

### 3.4 Between-school variance τ² (REML)

Per comparison, over the per-school raw gaps `rᵢ` with SEs `SEᵢ`, fit the random-effects model
(`methods.html` §3):

```
rᵢ = μ + uᵢ + eᵢ,   uᵢ ~ N(0, τ²),   eᵢ ~ N(0, SEᵢ²)
```

τ² is estimated by **REML**, implemented as a bounded 1-D maximization of the REML profile
log-likelihood over `τ² ≥ 0` (a single variance component needs no matrix algebra):

```
w(τ²)ᵢ      = 1 / (SEᵢ² + τ²)
μ̂(τ²)       = Σ wᵢ rᵢ / Σ wᵢ
ℓ_REML(τ²)  = −½ [ Σ ln(SEᵢ² + τ²) + ln(Σ wᵢ) + Σ wᵢ (rᵢ − μ̂)² ]
```

(The `+ln(Σwᵢ)` term is the REML correction `ln|XᵀV⁻¹X|` distinguishing it from ML; the omitted additive
constant `−½(k−1)ln2π` does not affect the argmax.)

**Solver specifics (so the implementation is unambiguous):**
- Search bracket `[0, τ²_max]` with `τ²_max = max(10 · τ̂²_DL, 1.0)`, where `τ̂²_DL` is the closed-form
  DerSimonian–Laird estimate (a cheap, reliable upper-scale anchor).
- Golden-section search; stop on relative change `< 1e-6` or 200 iterations.
- **Boundary handling:** the profile can be monotonically decreasing on `[0, ·]` (when `Q ≤ k−1`); detect
  this (e.g., `ℓ'(0) ≤ 0`, or DL estimate `= 0`) and return `τ² = 0` rather than an interior point. Also
  snap `τ² < 1e-8` to `0` to avoid numerical noise.

**Population for the fit:** below-min-n schools are **excluded** from the τ² fit and the pooled mean
(consistent with the current `districtMeanRE`), because their gaps are too noisy to inform the variance
component; they remain visible in the figure (shrunk toward μ̂) per the threshold mode. This is a known,
mild selection effect — excluding the high-SE tail can bias τ² slightly low when many schools are excluded.
Documented as a limitation; a future option may fit τ² on all schools (inverse-variance weighting already
down-weights noisy ones). The **inclusion rule is per-figure** and stated explicitly in §3.7/§6.

### 3.5 District-wide pooled gap

```
μ̂      = Σ wᵢ rᵢ / Σ wᵢ          (inverse-variance weighted, over meets-min-n schools, at the fitted τ²)
SE(μ̂)  = 1 / √( Σ wᵢ )
ci95   = μ̂ ± 1.96 · SE(μ̂)
```

This is the existing `districtMeanRE`; the only change is that τ² is now computed (§3.4). **`μ̂` is the
district-wide gap** reported everywhere (Overview card, forest reference line, PPTX) — consistent with
`methods.html` §1, which defines the district number as this pooled mean.

### 3.6 Empirical-Bayes shrinkage (per school)

Using the **same `μ̂` from §3.5 as the EB prior mean** (statistically consistent — the prior mean must be
the estimated population mean):

```
Bᵢ          = τ² / (τ² + SEᵢ²)                 shrinkage factor ∈ [0,1]
shrunk_gap  = Bᵢ · raw_gapᵢ + (1 − Bᵢ) · μ̂
shrunk_se   = √(Bᵢ) · SEᵢ   = √(Bᵢ · SEᵢ²)      posterior SD (treating μ̂ as known)
shrunk_ci95 = shrunk_gap ± 1.96 · shrunk_se
```

`shrunk_se` is the conditional posterior SD treating the district mean as **known**; the full EB SD that
accounts for `Var(μ̂)` is `√(Bᵢ·SEᵢ² + (1−Bᵢ)²·Var(μ̂))`, ~1–2 % larger at these sizes. We use the
μ-known form — the standard EB-caterpillar convention; documented in `methods.html` §2.

> **⚠ Fixture is NOT a model-consistent oracle (verified 2026-06-08).** The existing `data.js` τ²=0.0309
> and `districtGap=0.18` are **hand-assigned** and do not satisfy the model: REML on the 30 gaps yields
> **τ²≈0.0223** (DL 0.0232), and the inverse-variance pooled mean is **≈0.144**, not 0.18. The fixture's
> `shrinkage_factor`, `shrunk_gap`, `shrunk_se`, and CIs are internally derived **from** the hand-set
> 0.0309 and a shrinkage target of 0.18 (back-solving B gives 0.0309 uniformly; `shrunk_gap` reconstructs
> only with μ=0.18, error 2e-4 — with the model-correct μ=0.144 the error is 0.029). **Therefore the real
> engine intentionally will NOT reproduce the fixture's τ²/districtGap/shrunk_gap; it computes the
> model-correct values.** What the fixture *does* validate (see §8): given fixed (τ², μ), the downstream
> formulas `B`, `shrunk_gap`, `shrunk_se`, CI reproduce the fixture columns to ~1e-4 — confirming those
> formulas. REML and the pooled mean are tested against an independent oracle, not the fixture. The
> bundled demo keeps its current (slightly model-inconsistent) numbers for v1 — it is labeled
> illustrative "bundled demo data," not engine output; regeneration is a future task (§1 out of scope).
> (Magnitudes above use the legacy advantaged−focal sign; under the §2.3 focal−reference re-sign they
> negate — the validation logic and the divergence argument are unchanged.)

### 3.7 School-overall model (Status & Growth y-axis)

The scatter's school-level y-axis is the school's **overall** residual (all students, all grades), raw and
shrunken. This is a separate instance of §3.1–3.6 with grouping = school (no subgroup split): per-school
overall `r̄` and `SE_cell` (§3.2), a τ² across schools (§3.4), pooled mean (§3.5), per-school shrinkage
(§3.6). Same `stats.js` functions, different grouping. Heatmap cells (§3.1) and this school-overall model
include all cells regardless of min-n (subject only to the figure's display treatment); the min-n
*exclusion from the τ² fit* applies to the gap and school-overall variance fits, not to which cells render.

### 3.8 Demographics box plots

Over the distribution of student residuals in each subgroup (district-wide and per school), compute the
existing `summarize()` shape: `{n, mean, median, q1, q3, whiskerLo, whiskerHi, outliers, min, max}` with
**1.5×IQR** whisker fences. Outliers are capped to 8 sampled points for rendering (unchanged behavior).
**The §3.2 measurement-error SE applies only to cell *aggregates* (gaps, school-overall); the demographics
box plots are sample quantiles of the raw residual distribution — no SE floor or shrinkage is applied.**

### 3.9 Units

Residuals are already standardized (DESE Z), so 1 unit = 1 SD with no extra standardization. The
SD↔weeks-of-learning conversion is unchanged — it already reads the real `CONVERSION_FACTORS` JSON via
`window.WOL_OPTS`.

---

## 4 · Architecture & modules

No build step. New code loads via `<script>` in `index.html` like everything else; the DuckDB loader is
the one ES module (DuckDB-WASM ships ESM) and attaches its API to `window.GL`.

```
vendor/duckdb/              pinned DuckDB-WASM EH (single-thread) bundle + worker + ESM glue,
                           served same-origin; README records version + re-vendoring steps
engine/duckdb-loader.mjs    ES module: instantiate DuckDB-WASM from LOCAL bundle URLs,
                           lazy singleton (first upload only) → window.GL.getConnection()
engine/ingest.js            File → header sniff (JS) → validate → register DuckDB table →
                           {datasetMeta} | {errors}.  Pure helpers (prefix detect, header map,
                           flag parse, column validation) are separable for Node testing.
engine/stats.js             PURE JS, no DuckDB/DOM: cellSE, gapSE, tauSquaredREML, pooledMean,
                           shrink, summarize/quantiles, ols.  ← unit-tested in Node
engine/compute.js           computeSlice(year, subject): DuckDB GROUP BY aggregations + stats.js
                           → builds the 5 figure shapes (§4.5)
engine/store.js             dataset lifecycle + memo cache keyed (source, year, subject);
                           writes window.__DATA_ELA/__DATA_MATH; exposes active meta + active
                           subgroup; switches demo vs uploaded source
test/                       node --test specs for stats.js and ingest pure helpers
```

### 4.1 Module boundaries

- `stats.js` is **pure** — the correctness-critical math has zero DuckDB/DOM dependency and is fully
  testable in Node.
- `compute.js` is the only module that knows both DuckDB and the figure shapes.
- `ingest.js` owns parsing/validation/column-mapping; emits a clean handle or structured errors.
- `store.js` owns the `window.*` seam, the `(source, year, subject)` memo cache, demo/uploaded switching,
  and the active subgroup. **`app-shell` talks only to `store`** (`setActiveSubject`, `setActiveSubgroup`,
  `getActiveMeta`); figures keep reading `window.GAPS_DATA` etc. unchanged.

### 4.2 Engine delivery (vendored, header-free)

- Vendor the **EH (exception-handling, single-threaded)** DuckDB-WASM bundle — *not* the threaded COI
  bundle, which would require COOP/COEP headers that static hosts (GitHub Pages) don't provide.
  Single-thread is ample at district scale and works same-origin with no special headers.
- `duckdb-loader.mjs` instantiates from local bundle URLs (manual bundle map), as a lazy singleton.
- On-disk ~38 MB raw `.wasm`; hosts serve it gzipped (~13 MB over the wire). `vendor/duckdb/README.md`
  pins the **exact version (filled in at vendoring time)** and documents re-vendoring.

### 4.3 Data flow (Approach 1: eager precompute + computeSlice seam)

1. User drops file(s) into the subject dropzones → `ingest` validates + loads that subject's latest-year
   rows into DuckDB → registers table + meta in `store`.
2. `store.computeSlice(latestYear, subject)` runs per loaded subject → builds the §4.5 shapes into
   `window.__DATA_<subject>` → memoized by `(source, year, subject)`.
3. "Continue" → set active subject → existing `activateSubject` points `window.*` globals at the computed
   bag → figures render real data.
4. Toggles (subject / estimate / unit / subgroup) remain **synchronous global reads** — instant.

**Source resolution & lifecycle.** `store` holds two sources: `demo` (bundled, persistent, **Math only**)
and `uploaded` (per subject, cleared on reload). Resolution for a subject = `uploaded[subject] ??
demo[subject]`. Because demo is Math-only, `demo['ela']` is absent → ELA is **available only when an ELA
file is uploaded**; `setActiveSubject('ela')` is a no-op (and the ELA control is greyed) until then. New
upload for a subject clears that subject's memo entry and shadows its demo. Reload clears all `uploaded`;
demo (Math) reappears. No persistence/cookies/localStorage for student records (makes the FAQ literally
true).

**Why eager:** district-scale single-year data computes in well under a second; eager keeps the
synchronous read contract the whole app is built on, so figures/controls/export are untouched.
**Multi-year seam:** `computeSlice(year, subject)` is the unit; later, non-active years compute lazily and
memoize on first visit — an additive cache change, not a rearchitecture.

### 4.4 Lifecycle & privacy

DuckDB-WASM is instantiated **lazily on first real upload**; landing/demo pay zero WASM cost.

### 4.5 Data shape contract (what `computeSlice` writes into `window.__DATA_<subject>`)

These match the shapes the existing figures already read (verified against `data.js`, `heatmap-data.js`,
`demo-data.js`):

```
GAPS_DATA_BY_DEMO[comparisonKey] = {
  meta:    { subject, demographic, groupA, groupB, districtGap, tauSquared,
             nSchools, nMeetingThreshold, minCellSize },
  schools: [ { school_id, n_a, n_b,
               raw_gap, raw_se, raw_ci95:[lo,hi],
               shrunk_gap, shrunk_se, shrunk_ci95:[lo,hi],
               shrinkage_factor, meets_min_cell } ]
}
// window.GAPS_DATA points at the active comparison; store.setActiveSubgroup(key) repoints + re-renders.

HEATMAP_DATA = { meta:{subject}, schools:[ { school_id, grades:{ "3":{n,r,ok}, … "8":{…} } } ] }

DEMO_DATA[demoKey]            = { label, short, groups:[ { key,label,n,mean,median,q1,q3,
                                                          whiskerLo,whiskerHi,min,max,outliers:[…] } ] }
DEMO_DATA_BY_SCHOOL[demoKey][school_id] = { groups:[ …same shape… ] }

ACH_DATA = {
  student: { points:[ {school_id, school_idx, hue, x:status, y_raw:residual} ],  // raw only at student level
             reg_raw:{slope,intercept,r2} },
  school:  { points:[ {school_id, school_name, school_idx, hue, x:meanStatus,
                       y_raw:overallResidual, y_shrunk:shrunkOverall, n} ],
             reg_raw:{…}, reg_shrunk:{…} }
}
// school_name = SCHOOL_CODE (real files carry no friendly name).
```

---

## 5 · Ingest & validation UX

Two **subject-specific dropzones already exist** in the UI (ELA + Math). v1 wires them to real validation,
replacing the fake 600 ms timer and the false "schema validated" copy. This is where the privacy claim
becomes true (parsing happens in DuckDB-WASM; nothing is uploaded). Two-stage for fast feedback:

1. **JS header sniff (instant):** read the header row, detect the subject prefix, validate required
   columns, and confirm **≥1 row has a numeric `residual`**. Fail here → instant feedback, no WASM cost.
2. **DuckDB load (only if stage 1 passes):** register the file buffer, `CREATE TABLE … AS SELECT … FROM
   read_csv_auto(...)`, filter to the subject's `max(GROWTH_YEAR)`, compute dataset meta.

**Blocking errors** (shown inline in the dropzone; "Continue" disabled until ≥1 subject validates):
unparseable / not CSV · no recognizable `{P}_Z_RESIDUAL` prefix · missing required column(s) (lists which,
incl. any of the six subgroup flags) · **subject detected ≠ the dropzone it was dropped in** ("file
detected as {detected}; this is the {zone} slot") · all residuals null/non-numeric ("no valid residuals")
· zero rows remain after the latest-year filter ("all rows older than GROWTH_YEAR = {max}; file may be
stale").

**Non-blocking warnings:** N rows dropped (null/non-numeric residual) · only one subject loaded · file
spans multiple years → "using latest only ({year}); multi-year not available in v1".

**Dataset meta** (feeds a real `DatasetStrip`): `{subject, prefix, latestYear, yearsPresent, nSchools,
nRowsLatest, nDropped, subgroupsAvailable, districtCode}`.

---

## 6 · Figure-side changes

Figures stay visually identical; the only changes are removing fake-data code and gating the raw↔shrunken
toggle to where it is meaningful.

- **Delete** `__mathify` / `__transformInPlace` / the synthetic-Math path entirely (app-shell.jsx).
- **`DatasetStrip`** (app-shell.jsx:345–359) reads real meta from `store` (no more hardcoded "Riverside
  USD").
- **Subgroup selector wired live:** `store` holds `GAPS_DATA_BY_DEMO`; selecting a subgroup calls
  `store.setActiveSubgroup(key)`, which repoints `window.GAPS_DATA` and re-renders. (Today the selector is
  cosmetic — `GAPS_DATA` is hardcoded to FRL.) Driven by the §2.3 config, so new subgroups need no new
  wiring.
- **Demo = single subject (Math) for v1:** the bundled synthetic fixtures are presented as the Math demo
  (still labeled "bundled demo data"); ELA is greyed until a real ELA file is uploaded. No synthetic
  cross-subject data remains anywhere. The demo `GAPS_DATA` (data.js) is **re-signed to focal − reference**
  (groupA/groupB swapped; gap/CI/`districtGap` negated) per §2.3.
- **Estimate (raw↔shrunken) toggle visibility** — remove where it is a no-op:

| Page | v1 | Code to change |
|---|---|---|
| Gap Analysis | keep (real shrinkage) | — |
| Status & Growth — school | keep (real school-overall raw/shrunk) | — |
| Status & Growth — student | hide toggle (shrinkage undefined per-student; raw only) | achievement.jsx controls |
| System Scan (heatmap) | **remove toggle** | app-shell.jsx ScanControls (~1331–1337) |
| Demographics | **remove toggle** | demographics.jsx DemographicsControls (~54–57) |

Heatmap cells are **raw** residuals (§3.1); the shrinkage of §3.4–3.6 applies to gaps and school-overall,
**not** to cells — so removing the heatmap toggle is consistent with the math. A genuine **shrunken
residual heatmap** (EB-shrink each school×grade cell with its own τ²) is a **future feature**, not v1.

**Below-min-n rendering** reuses the **existing threshold modes** already in the app
(`section` / `inline` / `hide`, per `methods.html` §4 and `forest-final.jsx`) — not a new mechanism.

No SVG/layout changes otherwise.

---

## 7 · Methods & copy reconciliation

Making every claim true *and* accurate (also satisfies the "document it well" requirement):

1. **`methods.html` §1 rewrite** — the residual is **ingested**, pre-computed by the Missouri DESE growth
   model; GrowthLens aggregates and shrinks it. The current "GrowthLens computes a residual conditional on
   prior achievement and grade" is now inaccurate and must be corrected. **Also** flip the gap-direction
   example to **focal − reference** (e.g. "FRL minus non-FRL"; a *negative* gap = focal group lower),
   matching §2.3, and re-check the §2 counter-intuitive-shrinkage example's sign.
2. **`methods.html` §3 addition** — document the measurement-error-aware cell-SE formula `√(max(S²,ms2)/n)`
   with its derivation (mirrors §3.2 here), and note the REML solver + the below-min-n exclusion.
3. **`methods.html` §2 note** — the `shrunk_se` μ-known caveat (§3.6).
4. **`methods.html` §7** — now literally true; strengthen to note the engine is vendored, same-origin, and
   runs offline.
5. **FAQ copy (`app-shell.jsx`)** — "parsed and queried entirely in this browser tab via DuckDB-WASM" and
   "schema validated" become true. The "minimum-n configurable from Controls" claim is **not** true for v1
   (Settings stubbed) → soften that line.
6. **Sample-CSV `href="#"` links** — flag to remove or wire later (out of scope to build).

---

## 8 · Testing strategy

No-build ethos preserved — Node's built-in runner, zero dependencies (`node --test`).

- **`stats.js` (pure), split oracle** (see §3.6 — the fixture is *not* model-consistent):
  - **Downstream EB formulas:** feed the fixture's own inputs — for each of the 30 `data.js` rows, with
    the fixture's stored `τ²` and `districtGap` (`μ`) **as given constants**, assert `B`, `shrunk_gap`,
    `shrunk_se`, `shrunk_ci95` reproduce the fixture to ~1e-4. (Confirms `B`, `√(B)·SE`, the shrink
    combination, and CI — sign-robust, so it holds before or after the §2.3 re-sign.)
  - **REML τ² + pooled mean:** test against an **independent** oracle — a small hand-computed case (e.g.
    3 schools with worked-out τ² and μ̂) and/or R `metafor::rma(method="REML")` values embedded as
    constants. Assert the §3.4 solver recovers them (and recovers **|τ²|≈0.0223 / |μ̂|≈0.144 on the 30
    fixture gaps** — the *correct* values, documented as the expected divergence from the fixture's
    hand-set magnitudes 0.0309/0.18).
  - **`cellSE`:** known `(S², ms2, n)` → `√(max(S²,ms2)/n)`, both branches, plus `n=1 → s₁`, `n=0` absent.
  - **`summarize`/quantiles** and **`ols`:** against known arrays.
- **`ingest` pure helpers** — prefix detection from `_Z_RESIDUAL` (case-insensitive), header
  canonicalization, tolerant flag parsing, missing-column/subject-mismatch/no-numeric-residual errors —
  tested on small CSV strings, no DuckDB.
- **DuckDB / compute integration** — DuckDB-touching code stays thin; verified in-browser against the demo
  dataset and a small real sample as goldens (cross-check a couple of heatmap cells and one gap row against
  a Node recomputation).

---

## 9 · Risks & open items

- **Exact ELA prefix** — assumed `COMM_ARTS` (confirmed from a real ELA header sample). Detection keys off
  `_Z_RESIDUAL` so a near-miss is tolerated, but the prefix→subject map in `ingest.js` must list the real
  string; re-confirm before release.
- **Flag value encoding** — assumed `Y/N/1/0/T/F/true/false`; if DESE uses another sentinel it's a
  one-line config change.
- **Sign convention** — resolved (§2.3) to **focal − reference** uniformly: a negative gap means the focal
  group has the lower residual (Black − White, FRL − non-FRL, …). The legacy demo fixture is re-signed to
  match. Confirm this orientation matches PRiME's external reporting.
- **DuckDB-WASM repo weight** (~38 MB raw) — acceptable; git-LFS optional if clone size matters.
- **School labels** — real files carry only `SCHOOL_CODE`; the scatter shows codes, not friendly names,
  until a name-mapping feature is added.
- **Bundled demo is not model-consistent** (§3.6) — v1 ships it as-is, labeled illustrative; regenerating
  it through the engine is a future task.

---

## 10 · Implementation footprint (summary)

5 new `engine/` files + vendored DuckDB + a `test/` dir; deletion of the synthetic-Math block; `store`
seam wired into `app-shell`; subgroup selector + `DatasetStrip` made live; estimate-toggle visibility
gating (ScanControls, DemographicsControls, student-scatter); re-signing the demo `GAPS_DATA` to
focal − reference; `methods.html` + FAQ edits. **Figure render logic is untouched.**
