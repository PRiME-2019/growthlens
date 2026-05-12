# data-prep

Build pipeline for GrowthLens reference data. Not part of the deployed app — these scripts produce JSON files that are manually copied into the webapp's static assets.

## Layout

- `inputs/` — raw data (CSV). Committed to source control; this is the source of truth.
- `scripts/` — R scripts that transform inputs into outputs.
- `outputs/` — generated JSON. Gitignored; regenerable from `inputs/` + `scripts/`.
- `notes/` — methodology documentation.

## Data flow

```
inputs/ + scripts/  →  outputs/  →  (manual copy)  →  ../reference/
```

The deployed app reads from `../reference/`. This folder never serves files at runtime.

## Pipelines

### Conversion factors

Translates standardized residuals (z-scores) into "weeks of learning" using Missouri MAP year-over-year mean changes via a synthetic-cohort design.

```
cd data-prep
Rscript scripts/01_build_conversion_factors.R
```

Requires R with `tidyverse`, `readxl`, and `jsonlite`. Input is one DESE statewide-assessment workbook per school year in `inputs/` (e.g., `2024 Statewide Assessments Mean-Min-Max-SD by Content and Grade.xlsx`); the parser locates the `YEAR` header row dynamically and tolerates the COVID preamble note that appears on 2021/2022 workbooks. The script fails loudly if `inputs/` is empty or a workbook has an unexpected shape.

## Deploying updated outputs

After running a script, copy the dated output to the canonical app path (drop the date stamp on copy — the deployed file always has a fixed name):

```
cp outputs/20260512_conversion_factors.json ../reference/conversion_factors.json
```

The date stamp in `outputs/` is for archival only; the app always reads `conversion_factors.json`.

## Notes

- The prior-VA pipeline lives elsewhere; this folder only handles conversion factors for now.
- `outputs/` is gitignored — inputs and scripts are the source of truth. To reproduce a deployed file, rerun the relevant script.
