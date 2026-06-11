# Methodology

> **DRAFT — written from the behavior of `scripts/01_build_conversion_factors.R` and the
> deployed `reference/conversion_factors.json`. The mechanics below are faithful to the
> code; the *rationale* paragraphs are a first pass for PRiME review. Edit freely and
> remove this banner when the team owns the wording.**

## Synthetic cohort design

Pairing grade `g` in year `t` with grade `g−1` in year `t−1` approximates within-student
growth at the cohort level without requiring longitudinal student-level data: the students
who sat for the grade-5 MAP in spring 2024 are, to a first approximation, the same
population who sat for grade 4 in spring 2023. The annual-growth effect size for a
`(year, grade, subject)` cell is

```
annual_growth_effect_size = (mean[g, t] − mean[g−1, t−1]) / sd[g−1, t−1]
```

computed from DESE's published statewide grade × subject means and SDs.

**Assumptions.** (1) Cohort composition is stable enough year-over-year (in-/out-migration,
retention, and opt-outs roughly cancel at the state level); (2) the MAP vertical scale makes
the cross-grade mean difference meaningful (see below); (3) statewide growth is an
acceptable norm for converting a *district's* residuals — GrowthLens uses the factor only
as a translation constant, not as a benchmark a district is judged against.

**Known biases.** Cohort change (e.g., demographic shifts between t−1 and t) loads directly
into the numerator. Years adjacent to disrupted administrations inherit that disruption
(see the COVID note). Because the factors are statewide, any district whose true annual
growth differs systematically from the state's will see weeks-of-learning numbers that are
internally consistent but scaled by the state's growth rate, not its own.

## Choice of baseline SD vs. pooled SD

Effect sizes use the prior-year `(g−1, t−1)` SD as the denominator rather than a pooled
cross-year or cross-grade SD. The draft rationale: the question the factor answers is "how
many SDs of *where the cohort started* does a typical year of growth represent," so the
starting cohort's own dispersion is the natural unit. It also keeps each factor
self-contained — a single pair of published rows — rather than dependent on which other
years happen to be in `inputs/`. The cost is slightly noisier factors (one SD estimate
instead of an average of several); with statewide n's in the tens of thousands per cell,
that noise is negligible relative to the cohort-composition assumption above.

## Treatment of the COVID gap (2020)

The spring 2020 MAP administration was cancelled, so no 2020 workbook exists in `inputs/`.
Two kinds of cells are therefore unrecoverable, and the build script *skips* them rather
than imputing (each skip is listed in the script's run log):

- **2020 factors** — no 2020 outcome data at all.
- **2021 factors** — outcome data exists, but the prior-year (2020) baseline does not.

The deployed file consequently covers 2019 and 2022–2025. At runtime, GrowthLens maps a
requested year with no factors to the **nearest prior available year** (2021 → 2019;
anything after 2025 → 2025) and the figure footnotes name the factor year actually used,
so the fallback is never silent. 2022 factors deserve a flag in any serious use: their
baseline is the first post-disruption administration, and pandemic-era score declines make
the 2022 "annual growth" pairing (2022 minus 2021) unusually large in some cells — it
captures rebound, not typical growth.

## Sensitivity to vertical-scale assumptions

Missouri MAP scale scores are vertically equated across grades 3–8, and the synthetic
cohort design leans on that: the numerator subtracts a grade-(g−1) mean from a grade-g
mean, which is only meaningful if a scale-score point means the same thing in both grades.
Where vertical equating is imperfect (commonly believed to be worst at the ends of the
grade span), the factor absorbs the artefact: an inflated cross-grade scale gap reads as
"more growth per year," which *shrinks* the weeks-per-SD conversion for that grade.
GrowthLens mitigates this in display: per-grade conversions are used where a grade is
known (the heat map), and elsewhere the year × subject average across grades 4–8 is used,
which damps any single grade's equating artefact. A useful sensitivity check for a future
revision: recompute factors with each grade dropped in turn and report the spread of the
grade-average conversion.

## Known limitations

For anyone communicating weeks-of-learning numbers to non-technical audiences:

- **It is a translation, not a measurement.** Weeks of learning re-expresses an SD-scale
  residual using statewide average growth (`base_weeks = 38` instructional weeks per
  year). "About 10 weeks ahead" means "the size of the gap equals what the average
  Missouri student learns in ~10 weeks" — not that anyone was observed learning for 10
  extra weeks.
- **Grade 3 has no factor** (no grade-2 MAP baseline exists), and factors cover grades
  4–8 only; grade-3 cells fall back to the grade average. The figure footnotes say
  "grade 4–8 average" for this reason.
- **The linearity assumption.** Converting a residual of 0.5 SD to "half a year's growth
  in weeks" assumes learning accrues linearly across the school year. It doesn't,
  exactly; treat sub-month precision as false precision.
- **Statewide norms.** Factors are statewide; a district with atypical growth rates gets
  a conversion calibrated to the state, not to itself.
- **Disrupted years.** 2021 has no factor; 2022's factor partially reflects pandemic
  rebound. Prefer 2023+ factors when communicating publicly.
- **Rounding.** Published DESE means/SDs are used as-is; factors are rounded to 4
  decimals, raw growth to 2. This is far below the noise floor of everything above.
