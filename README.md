# GrowthLens

See where your students are growing — privately, in your browser. Built for the PRiME Center at Saint Louis University.

Upload one file from your assessment system and GrowthLens turns it into a clear picture of how each school and student group is doing — where growth is strong, where groups are falling behind, and which results rest on too few students to lean on. Everything is figured right here in your browser tab; not one student record is ever uploaded to a server, and you can confirm that yourself in your browser's developer tools.

## What it does

GrowthLens shows how each school is doing compared with the district as a whole, steadies the numbers for smaller schools so a few students can't swing the picture, and measures the gap between student groups school by school. The numbers describe what's happening, not why — use them to ask sharper questions, not to assign blame. There are eight pages, reached from the left rail:

1. **Home** — the pitch, the upload zones (one file per subject, read and checked entirely in your browser — nothing is uploaded), where to go next, and a short file/privacy reference. If something's off — a file dropped in the wrong subject slot, or a missing column — GrowthLens tells you on the spot so you can fix it.
2. **Statewide comparison** — where each of your schools lands in the statewide distribution of school-level growth (PRiME database bundled with the app), as tile histograms per school type and subject, plus growth over time with a school overlay picker.
3. **Growth by school & grade** — a district-wide heat map of how each grade is doing at each school, with an overall column. Click any column header to re-sort. Scan it to spot where growth is consistently strong or soft before you dig into any one group.
4. **Scores vs. growth** — two views at once: where students scored this year along the bottom and how much they grew compared with expectations up the side, with dashed lines marking the district average. Available by school (each school's own number or a steadied version) and by individual student.
5. **Growth by student group** — side-by-side box plots that compare growth from one student group to the next, across the same five comparisons in demo and uploaded data alike (free-or-reduced lunch, students with an IEP, English learners, Black vs. White, and Hispanic vs. White students).
6. **Group gaps by school** — pick a subject and two student groups and see the gap between them at every school, ranked from largest to smallest. Show results on a standard scale or as weeks of learning, with schools that have too few students to read reliably set apart.
7. **Export** — builds a board-ready PowerPoint deck of what you're currently looking at, ready to edit.
8. **Resources** — research syntheses, working papers, and practitioner tools matched to clear patterns GrowthLens detects in your data.

Want the details on how the numbers are made? The methods note lives in [methods.html](methods.html), linked from the sidebar and the FAQ.

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

**Required columns** (matched case-insensitively; `{SUBJECT}` = `MATH` or `COMM_ARTS`, detected from the residual prefix):

| Column | Meaning |
|---|---|
| `{SUBJECT}_Z_RESIDUAL` | standardized growth residual (state-computed, SD units) |
| `{SUBJECT}_Z_RESIDUAL_SE` | per-student SE of that residual |
| `{SUBJECT}_Z_T` | standardized current-year score (status axis) |
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

The pipeline is upload → `ingest.loadSubjectFile` → `compute.computeSlice` → `store.putUploaded`, which swaps the `window.GAPS_DATA` / `HEATMAP_DATA` / `DEMO_DATA` / `ACH_DATA` globals the figures already read. Figure render logic is unchanged; only the data behind those globals is now real.

Run the tests:

```
node --test
```

## Status

The data layer is **real**: a district drops its own DESE files and every page renders computed values, with the "nothing leaves the browser" promise verifiable in DevTools (only same-origin requests during analysis). The bundled Math demo remains for stakeholder review without a file.

**Deliberately deferred** (the seams are in place):
- **Multi-year UI** — the compute unit is `computeSlice(subject)`, which pins each subject to its latest year; a year parameter is the planned seam.
- **Settings / configurable min-n** — the threshold stays at the default (10); the Settings page remains a placeholder.
- **Expanded subgroups** — the subgroup config is data-driven; v1 ships the five DESE comparisons.
- **Shrunken-heatmap / shrunken-demographics variants.**

**Roadmap:**
- Production build (Vite + bundled production React) to replace in-browser Babel.
- Export-deck polish (name the threshold value on the headline slide; per-slide / per-subgroup selection).
- Accessibility: replace hover-only `title=` hints with real popovers; add a touch equivalent for the forest-row tooltip.

## File map

```
index.html              entry — import map + engine scripts + React/Babel/pptxgenjs (CDN)
favicon.svg             SLU measurement-bar brand glyph
app-shell.jsx           LeftNav, Controls/Overview cards, page router, ctx state, Upload wiring
forest-shared.jsx       SLU colors, fonts, scales, unit helpers (weeksPerSD, fmtVal, fmtCI)
forest-final.jsx        Group gaps by school — animated forest plot
heatmap-variants.jsx    Growth by school & grade — H1 diverging heatmap (sortable columns)
demographics.jsx        Growth by student group — box-and-whisker by subgroup
achievement.jsx         Scores vs. growth — achievement vs. growth scatter
district-report.jsx     Statewide comparison — PRiME tile histograms + trends
export.jsx              Export page — PPTX generation via PptxGenJS

engine/                 real ingestion + computation engine (see Architecture)
tools/build-demo.js     regenerates ALL demo fixtures (data.js + heatmap-data.js + demo-data.js)
                        from one synthetic student dataset via engine/stats.js
vendor/duckdb/          vendored DuckDB-WASM + Apache Arrow, same-origin (has its own README)
test/                   node --test specs (stats, ingest helpers, store)

data.js                 bundled Math demo (generated): 7 grade-banded schools, all five DESE
                        gap slices with CIs/B, engine-computed district gaps + τ² (focal − reference)
heatmap-data.js         demo school × grade residual cells (3–5 elementary, 6–8 middle) + ok flags
demo-data.js            demo demographics box-plots + achievement scatter (generated through
                        engine/stats.js — raw/shrunken coherent by construction)

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
