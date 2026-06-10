# GrowthLens

A district-level analytics prototype for visualizing student growth residuals across schools, grades, and subgroups. Built for the PRiME Center at Saint Louis University.

GrowthLens ingests **Missouri DESE/MOSIS** growth files (which carry pre-computed standardized residuals), then aggregates and shrinks them **entirely in the browser** and renders every figure from the real numbers. Parsing and computation run in a **vendored, same-origin DuckDB-WASM** engine — no student data ever leaves the tab.

## What it does

Seven pages, navigated from the left rail:

1. **Overview** (landing) — value-prop blurb, three click-through cards, accordion explaining what GrowthLens is and isn't.
2. **Upload data** — drag-and-drop dropzones for Math + ELA DESE/MOSIS growth files. Each file is parsed, validated, and aggregated in-browser via DuckDB-WASM; nothing is uploaded. Validation errors (file dropped in the wrong subject slot, missing required columns, no `*_Z_RESIDUAL` column, etc.) surface inline.
3. **System Scan** — heatmap of grade × school residuals with an overall column; sortable by clicking any column header.
4. **Gap Analysis** — animated forest plot of within-school subgroup gaps; raw ↔ shrunken toggle, SD ↔ weeks-of-learning units, threshold modes for cells below the minimum cell size.
5. **Status & Growth** — achievement vs. growth scatter with quadrant labels and a district-mean cross; school-level (raw/shrunken) and student-level (raw only) views.
6. **Demographics** — side-by-side box plots of student residuals by subgroup. The bundled demo shows seven categories; an uploaded DESE file exposes the five engine comparisons (FRL, IEP, EL, Black vs White, Hispanic vs White).
7. **Export** — generates a PPTX deck of the current slice via PptxGenJS.

Methods documentation lives in [methods.html](methods.html), linked from the sidebar and the FAQ.

### Sign convention

Gaps are signed **focal − reference** (e.g. FRL − non-FRL): a **negative** gap means the focal group has the **lower** mean residual.

## Run it

There is no build step, but the app **must be served over HTTP** — it uses ES modules, an import map, and a WebAssembly worker, none of which load from a `file://` URL. Any static server works:

```
python -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`.

The app shell (React 18.3.1, Babel Standalone, PptxGenJS, Google Fonts) loads from CDN at page load. The **data engine** (DuckDB-WASM + Apache Arrow) is vendored under `vendor/duckdb/` and served **same-origin** — instantiated lazily on the first file upload, so the landing page and the bundled demo pay zero WASM cost and make no third-party request during analysis.

To analyze real data, drop a Missouri DESE/MOSIS **Math** and/or **ELA** growth CSV into the matching dropzone. Without a file, the app shows the bundled Math demo.

**Required columns** (matched case-insensitively; `{P}` = `MATH` or `COMM_ARTS`, detected from the residual prefix):

| Column | Meaning |
|---|---|
| `{P}_Z_RESIDUAL` | standardized growth residual (state-computed, SD units) |
| `{P}_Z_RESIDUAL_SE` | per-student SE of that residual |
| `{P}_Z_T` | standardized current-year score (status axis) |
| `SCHOOL_CODE`, `GRADE`, `GROWTH_YEAR` | identity / grade / year (latest year auto-selected) |
| `FREE_OR_REDUCED_LUNCH`, `IEP_DISABILITY`, `ENGLISH_LANGUAGE_LEARNER` | subgroup flags (Y/N or 1/0) |
| `BLACK`, `WHITE`, `HISPANIC` | race one-hots for the two race comparisons |

## Architecture — the ingestion engine

The correctness-critical math is a pure module unit-tested in Node; everything that touches DuckDB or the DOM is kept thin and verified in-browser.

```
engine/stats.js          PURE JS: measurement-error-aware cell SE √(max(S²,ms²)/n), gap SE,
                         DerSimonian–Laird + REML τ², inverse-variance pooled mean,
                         empirical-Bayes shrinkage, box-plot summarize, OLS.  ← node --test
engine/ingest.js         File → header sniff → validate → register in DuckDB → typed,
                         latest-year table. Subgroup config + pure helpers are Node-testable.
engine/compute.js        computeSlice(subject): DuckDB GROUP BY aggregation + stats.js → the
                         five window.* figure shapes.
engine/store.js          dataset registry + the window.* swap (demo vs uploaded; demo is
                         Math-only, ELA enables once its file uploads).
engine/duckdb-loader.mjs lazy DuckDB-WASM singleton from the vendored same-origin bundle.
vendor/duckdb/           pinned @duckdb/duckdb-wasm (EH single-thread) + apache-arrow,
                         served same-origin via an import map. See vendor/duckdb/README.md.
test/                    node --test specs for stats.js, the ingest helpers, and the store.
```

The pipeline is upload → `ingest.loadSubjectFile` → `compute.computeSlice` → `store.putUploaded`, which swaps the `window.GAPS_DATA` / `HEATMAP_DATA` / `DEMO_DATA` / `DEMO_DATA_BY_SCHOOL` / `ACH_DATA` globals the figures already read. Figure render logic is unchanged; only the data behind those globals is now real.

Run the tests:

```
node --test
```

## Status

The data layer is **real**: a district drops its own DESE files and every page renders computed values, with the "nothing leaves the browser" promise verifiable in DevTools (only same-origin requests during analysis). The bundled Math demo remains for stakeholder review without a file.

**Deliberately deferred** (the seams are in place):
- **Multi-year UI** — the compute unit is `computeSlice(year, subject)`; v1 renders each subject's latest year only.
- **Settings / configurable min-n** — the threshold stays at the default (10); the Settings page remains a placeholder.
- **Expanded subgroups** — the subgroup config is data-driven; v1 ships the five DESE comparisons.
- **Shrunken-heatmap / shrunken-demographics variants.**
- **Regenerating the bundled demo through the engine** — the demo fixtures are illustrative (hand-authored, not strictly model-consistent) and re-signed to focal − reference.

**Roadmap:**
- Production build (Vite + bundled production React) to replace in-browser Babel.
- Export-deck polish (name the threshold value on the headline slide; per-slide / per-subgroup selection).
- Accessibility: replace hover-only `title=` hints with real popovers; add a touch equivalent for the forest-row tooltip.

## File map

```
index.html              entry — import map + engine scripts + React/Babel/pptxgenjs (CDN)
favicon.svg             SLU measurement-bar brand glyph
app-shell.jsx           LeftNav, Controls/Overview cards, page router, ctx state, Upload wiring
forest-shared.jsx       SLU colors, fonts, scales, unit helpers (WEEKS_PER_SD, fmtVal, fmtCI)
forest-final.jsx        Gap Analysis — animated forest plot
heatmap-variants.jsx    System Scan — H1 diverging heatmap (sortable columns)
demographics.jsx        Demographics — box-and-whisker by subgroup
achievement.jsx         Status & Growth — achievement vs. growth scatter
export.jsx              Export page — PPTX generation via PptxGenJS

engine/                 real ingestion + computation engine (see Architecture)
vendor/duckdb/          vendored DuckDB-WASM + Apache Arrow, same-origin (has its own README)
test/                   node --test specs (stats, ingest helpers, store)

data.js                 bundled Math demo: 30 schools with raw/shrunken gaps, CIs, n, B
                        (focal − reference signs; illustrative, not engine-generated)
heatmap-data.js         demo school × grade residual cells with meets_min_cell flags
demo-data.js            demo student-level residuals by demographic category

methods.html            stand-alone methods note (linked from sidebar)
prime-logo.png          asset; not currently referenced (final lockup is text-only)
```

The conversion-factors pipeline (SD ↔ weeks-of-learning) lives separately under [data-prep/](data-prep/); see its README.

## Brand

Saint Louis University palette:
- **SLU Blue** `#003DA5` — primary
- **Gold** `#C8A84A` — used sparingly for figure-card top rules and the district-prior reference line

Fonts (all Google Fonts):
- **Mulish** — UI, headings (Brandon Grotesque analog per SLU brand)
- **Crimson Pro** — wordmark, prose body
- **Archivo Narrow** — all-caps eyebrows and labels
- **JetBrains Mono** — tabular numerics
