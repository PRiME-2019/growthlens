# District Report page + school-name crosswalk — design

**Date:** 2026-06-12
**Status:** approved (design review in chat)

## Goal

Two features sharing one bundled dataset, `reference/prime_growth_database.csv`
(11,753 rows; one per school × year; 2018–2025 minus 2020; 562 districts):

```
lea_id, school_id, lea_name, school_name, school_year, school_level,
growth_zscore_all_ela, growth_zscore_all_math,
prime_rank_all_1yr_ela, prime_rank_all_1yr_math
```

1. **Names crosswalk** — uploaded data carries only codes; figures should show
   school names.
2. **District Report page** — recreates the PRiME school-report visuals at
   district scale: tile histograms of statewide school-level value-added with
   the district's schools highlighted, plus growth-over-time.

## Decisions (from design review)

| Question | Decision |
|---|---|
| Identity | Schools are unique by **(lea_id, school_id)** — never school code alone. |
| District detection | `COUNTY_DISTRICT_CODE` from the upload (optional column; modal value among latest-year rows → `meta.districtCode`). No code → report page opens with the district picker. |
| Data path | Bundled, fetched same-origin, cached per session (privacy: no external request reveals the district). |
| Scale | Growth z-scores as-is; dashed typical-growth line at **0**. Ranks in plain language ("33rd of 1,008 elementary schools"). No PRiME-85 transformation. |
| Histogram pools | Per **level × subject**, level taken from the **displayed year's** classification. Verified: ranks in the DB are within level × year (max rank = pool size). |
| Trend | District average line + dashed 0 + a picker to overlay an individual school. |
| Nav | District Report is the **second** tab (after Overview). |
| Demo district | Sample data impersonates **Jackson R-II (016090)** — 7 schools, mirrors the demo's 7-school district, all years, both levels. |

## Engine — `engine/prime.js` (UMD, Node-tested)

Pure functions over pre-parsed rows (the page parses with `GLResources.parseCsv`):

- `nameLookup(rows)` → `{ district(lea), school(lea, school) }` keyed on the
  composite id; latest year's name wins.
- `detectLevel(rows, lea, school, year)` — the displayed year's
  `school_level`, falling back to the school's latest known level.
- `districtReport(rows, lea)` → district name, sorted years, and per-school
  series `{ ela: [{year, z, rank, poolN}], math: […] }`.
- `histogram(rows, { year, level, subject, binWidth })` → unit-tile bins with
  per-bin counts and the count of district schools per bin (district passed
  separately), plus pool size for rank language.
- `districtMeanSeries(report, subject)` — unweighted mean of available school
  z's per year (the DB carries no enrollment weights).
- `enrichShapes(shapes, districtCode, rows)` — stamps `school_name` onto
  GAPS_DATA schools, HEATMAP schools, and ACH school points, and returns the
  district name; composite-key lookups only, unknown codes left untouched.
- `primeTakeaways({ report, year, fmt })` — 2-3 generated insights + caveat in
  the established takeaway shape (counts at/above typical, standout school,
  direction vs. the prior year).

## Names crosswalk wiring

- **Ingest** ([engine/ingest.js]): if the upload has a `COUNTY_DISTRICT_CODE`
  column, `meta.districtCode` = modal value among latest-year rows (string,
  zero-padding preserved via all_varchar). Column stays optional — files
  without it load exactly as today.
- **Enrichment**: the PRiME DB fetch starts at app boot (idle, non-blocking,
  singleton promise). `UploadPage.onFile` awaits it (typically already
  resolved) and runs `enrichShapes` before `putUploaded`; `meta.districtName`
  set when the lea matches. If the fetch failed, upload proceeds un-enriched.
- **Figures prefer names**: forest school column, heatmap row headers, table
  rows, and the takeaway generators use `school_name || school_id`. Label
  columns widen (forest 86→150px, heatmap 80→150px) with ellipsis truncation;
  the full name + code stay in tooltips/aria. Achievement already prefers
  `school_name`. DatasetStrip shows the district name when known.
- Demo data is untouched (synthetic codes don't match; bundled names remain).

## District Report page — `district-report.jsx`

- Nav: `report: { label: 'District Report', hint: 'Your schools statewide' }`,
  second entry.
- District resolution: any uploaded subject's `meta.districtCode`, else the
  demo default (016090). A district select (562 districts, sorted by name)
  is always shown, initialized to the detected district — fallback and
  browse-any-district in one control.
- **Overview card** (standard scaffolding): headline stats for the latest year
  with data — schools at/above typical growth per subject, median statewide
  rank — plus `primeTakeaways`.
- **Tile histograms**: one panel per level the district serves in the
  displayed year × subject (Elementary / Middle / EleMiddle as present).
  Unit-tile bins over the statewide pool, district schools' tiles in gold,
  neutral elsewhere (the single-school blue/gray split doesn't generalize),
  dashed line at 0, plain-language rank caption per panel.
- **Growth over time**: per subject — district average line, dashed 0 line,
  year gaps (2020) shown as breaks, and a school picker overlaying one
  school's line. Hover for exact values.
- Page shows both subjects and ignores Subject/Units/Method (PRiME z-scores
  are a different scale; copy says so plainly).
- Loading / fetch-failure / no-match states mirror the Resources page.

## Out of scope

PRiME-85 scale, subgroup ranks (`_all_` columns only for now), export-deck
integration, multi-district uploads.

## Acceptance

1. Demo: District Report shows Jackson R-II — histograms per level × subject
   with 7 gold tiles total per subject, trend with district line, picker
   overlays a school. Picker can pull up any other district.
2. Upload with COUNTY_DISTRICT_CODE: figures show school names (forest,
   heatmap, scatter, tables, takeaways), the strip names the district, and
   the report page lands on the detected district.
3. Upload without the column or with unmatched codes: today's behavior
   (IDs everywhere), report page opens on the picker.
4. Node tests: name lookup composite keys, level-by-displayed-year, report
   series, histogram bins + pool sizes, mean series with missing years,
   enrichment (match + miss), takeaways.
5. Zero console errors across the sweep; 1.2MB CSV fetched once per session.
