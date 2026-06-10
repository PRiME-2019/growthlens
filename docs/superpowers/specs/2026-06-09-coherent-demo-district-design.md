# Coherent small-district demo

**Goal:** Replace the 30-school illustrative demo with one coherent ~7-school small district, so every figure agrees and the bundled demo feels like a real small Missouri district.

## District profile (approved)

- **7 schools, grade-banded:** 5 elementary (grades 3–5) + 2 middle (grades 6–8).
- **~1,950 students, Math.**
- One **tiny elementary (~21 students)** sits below the 10-student cutoff → **6 of 7** schools meet threshold, and its heatmap cells render as "too few."
- Each school has a distinct overall growth tilt and FRL gap (FRL students growing somewhat less, varying by school); **district FRL gap ≈ −0.16 SD**.
- Grade-banding leaves some heatmap cells blank (elementary rows empty in grades 6–8, middle rows empty in 3–5) — realistic, and exercises the blank-cell handling.

## Approach (approved: "coherent small district", static fixtures)

A committed Node generator (`tools/build-demo.js`) builds **one deterministic synthetic student dataset** for the 7 schools, then computes the forest gaps and the heatmap from it using the **real `engine/stats.js`** — cell SE (with the measurement-error floor), gap SE, REML τ², inverse-variance pooled mean, and empirical-Bayes shrinkage — i.e. the same math real uploads use. It mirrors `engine/compute.js`'s `buildGaps`/`buildHeatmap` exactly, doing the GROUP BYs in plain JS (no DuckDB needed for a synthetic table).

Output is **static fixtures** — `data.js` (forest/gap) and `heatmap-data.js`. The app still loads static fixtures; nothing changes about how it loads.

`demo-data.js` stays procedural, with targeted edits:
- Demographic totals scaled to the ~2k district (each variable's groups sum to ~2,000).
- FRL group means aligned to the forest's computed district gap.
- Achievement scatter + per-school boxes auto-rederive from the new 7-school `HEATMAP_DATA`.
- School names derive **Elementary/Middle** from the grades present.
- Outlier tooltips reference **real** school IDs (was a random `Sch-10xx` from the old 30-ID range).

## Meta / UI

`GAPS_DATA.meta.nSchools = 7` flows to the dataset strip via `store.js` (which already reads it); `year` stays `2024–25`. The strip then reads "sample data · 7 schools · 2024–25".

## Verification

- `node --test` stays 34/34 (engine + its own fixtures are untouched).
- Generated `data.js` / `heatmap-data.js` pass `node --check`.
- A node harness loads all three fixtures under a `window` mock and asserts: 7 schools, 6 meeting threshold, grade-banded heatmap, and populated `DEMO_DATA` / `ACH_DATA` for 7 schools.

## Residual distribution — first-stage VAM residuals (revision)

Growth residuals are simulated as proper first-stage OLS VAM residuals rather than a raw `N(0, ~0.9)` draw. Per the "simulate student-level first-stage VAM residuals" spec, for each subject × grade cell (pooled across schools):

- `y = score_z − mean(score_z)`, `s = sd(y)` (within-cell `s ≈ 0.85–0.95`).
- `u` = school component (8% of variance, one draw per school, reused across grades) + student noise (92%), math-shaped (left-skewed, heavy-tailed, skew ≈ −0.5, t(8) tails).
- `z` = residuals of `u` regressed on `y`, rescaled to sd 1 (orthogonal to `y`).
- `resid = 0.30·y + 0.458·s·z` (R² = 0.70). `|resid| > 2.2` is redrawn, not clamped.

This yields, per cell: `mean(resid)=0`, `sd(resid)=0.548·s`, `cor(resid, score_z)=0.548`, `cor(fitted, resid)=0`. The FRL gap and school tilts emerge mechanically (FRL students score ~0.45 SD lower; schools differ in mean score), so the residual FRL gap ≈ −0.30 × score gap ≈ −0.145. Verified moments (`node tools/build-demo.js`): sd/s = 0.548 and cor(resid, score) = 0.548 every cell; cor(fitted, resid) = 0; school-mean-residual SD = 0.105 (target 0.10–0.13); sign-persistence 7/7; per-grade district mean residual ~0.

`demo-data.js` (demographics box-plots + achievement scatter) is retuned to the same distribution: residual SD ≈ 0.5, math left-skew via a calibrated two-piece-t(8) draw, subgroup means at residual scale, and prior↔growth correlation ≈ 0.

Net effect: residuals are tighter and more realistic — heatmap school×grade cells span ≈ ±0.10–0.22 (each grade column averages ~0) instead of up to ±0.44.
