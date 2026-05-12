# GrowthLens

A district-level analytics prototype for visualizing student growth residuals across schools, grades, and subgroups. Built for the PRiME Center at Saint Louis University.

## What it does

Seven pages, navigated from the left rail:

1. **Overview** (landing) — value-prop blurb, three click-through cards, accordion explaining what GrowthLens is and isn't.
2. **Upload data** — drag-and-drop dropzones for ELA + Math residuals CSVs (currently mocked; see below).
3. **System Scan** — heatmap of grade × school residuals with an overall column; sortable by clicking any column header.
4. **Gap Analysis** — animated forest plot of within-school subgroup gaps; raw ↔ shrunken toggle, SD ↔ weeks-of-learning units, threshold modes for cells below the minimum cell size.
5. **Status & Growth** — achievement vs. growth scatter with quadrant labels and a district-mean cross; student-level and school-level views.
6. **Demographics** — side-by-side box plots of student residuals by subgroup category (FRL, race, ELL, IEP, gifted, migrant, gender).
7. **Export** — generates a PPTX deck of the current slice via PptxGenJS.

Methods documentation lives in [methods.html](methods.html), linked from the sidebar and the FAQ.

## Run it

No build step. Open [index.html](index.html) in a modern browser (Chrome/Edge/Firefox). React 18.3.1, Babel Standalone, and PptxGenJS load from CDN; `data.js`, `heatmap-data.js`, and `demo-data.js` provide bundled demo fixtures.

For local dev, any static server works:

```
python -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`.

## Current status

**v0.4 — design prototype.** All seven pages render with bundled demo data. The visual system, interaction model, and methodological story are stable. The app is suitable for stakeholder review and internal demos; it is **not yet wired to real data**.

What works end-to-end:
- Subject (ELA/Math), method (Shrunken/Raw), units (SD/Weeks) toggles drive all four data pages.
- District-wide gap is computed as a random-effects pooled mean with a 95% CI (variance-weighted, REML-style τ²).
- Shrinkage factor B and 95% credible intervals are honored throughout.
- Below-threshold cells (n < 10) are flagged with a badge and surfaced consistently in the heatmap, forest, and export deck.
- PPTX export generates a six-slide deck with cover, headline stats, top/reversed gaps, heatmap summary, and a methods slide; speaker notes included.
- Methods note ([methods.html](methods.html)) is real and explicitly covers the counter-intuitive "shrinkage can grow gaps" case.

## What needs to be done

### Data wiring (blocking real-world use)
- **Upload page is mocked.** Dropzones accept files visually but do not parse CSVs, validate columns, or persist to app state. Wire to a real parser (PapaParse) and feed the resulting frames into the existing data shape.
- **Math data is a deterministic affine transform of ELA** (`v * 0.82 - 0.06 + jitter`). CIs scale 1:1 with point estimates — a careful reviewer will spot this in 30 seconds. Replace `__transformInPlace` in [app-shell.jsx](app-shell.jsx) with actual Math residuals once the upload pipeline lands.
- **`DatasetStrip` displays a hardcoded demo label** ("bundled demo data"). Wire to upload state so it reflects the loaded dataset.
- **Settings page is a "Soon" placeholder.** Threshold mode and minimum cell size are currently per-page settings; promote them to a global Settings page.

### Methodological refinements
- District-gap CI is shown in `OverviewCardGap` but not yet on the PPTX headline slide. Already started; finish.
- DistributionStrip interpretation copy implicitly assumes a normal random-effects distribution. Either add a caveat or switch to the empirical IQR of shrunken gaps.
- Outlier rule on the demographics box plots is hard-coded as 1.5×IQR with no surfaced label. Annotate on the figure or expose in a tooltip.
- Minimum-n threshold defaults to 10. Many state DOEs (e.g., Missouri DESE) require n≥30 for public reporting. Consider raising the default once Settings is built.

### Export deck polish
- Headline slide says "schools meeting threshold" without naming the threshold value. Should read "schools with n ≥ 10."
- Slide 02 capture timing under Math: the SE column is recomputed but the screenshot is taken before React re-render settles. Needs a one-frame `await` before capture.
- Add a final "Methods" slide linking back to `methods.html`.
- Allow users to pick which slides to include and which subgroup to export.

### Accessibility
- Heatmap column sorts and segmented controls have keyboard nav, focus rings, and ARIA roles. Still pending: forest plot row tooltip has no touch-screen equivalent; info hints rely on native `title=` (hover-only, screen-reader-invisible) — replace with a real popover.

### Production deployment
- Move from Babel Standalone (in-browser JSX compilation) to a real build (Vite + React). The current setup is fine for demo but ships ~3MB of dev-mode React and recompiles JSX on every page load.
- Replace CDN React with bundled production React.
- Add a CI step that lints, type-checks, and verifies the PPTX export still generates without runtime errors.

## File map

```
index.html              entry — loads React/Babel/pptxgenjs from CDN, mounts <AppBody/>
app-shell.jsx           LeftNav, Controls/Overview cards, page router, ctx state
forest-shared.jsx       SLU colors, fonts, scales, unit helpers (WEEKS_PER_SD, fmtVal, fmtCI)
forest-final.jsx        Gap Analysis — animated forest plot
heatmap-variants.jsx    System Scan — H1 diverging heatmap (sortable columns)
demographics.jsx        Demographics — box-and-whisker by subgroup
achievement.jsx         Status & Growth — achievement vs. growth scatter
export.jsx              Export page — PPTX generation via PptxGenJS

data.js                 30 schools with raw/shrunken gaps, CIs, n, shrinkage B
heatmap-data.js         school × grade residual cells with meets_min_cell flags
demo-data.js            student-level residuals by demographic category

methods.html            stand-alone methods note (linked from sidebar)
prime-logo.png          asset; not currently referenced (final lockup is text-only)
```

## Brand

Saint Louis University palette:
- **SLU Blue** `#003DA5` — primary
- **Gold** `#C8A84A` — used sparingly for figure-card top rules and the district-prior reference line

Fonts (all Google Fonts):
- **Mulish** — UI, headings (Brandon Grotesque analog per SLU brand)
- **Crimson Pro** — wordmark, prose body
- **Archivo Narrow** — all-caps eyebrows and labels
- **JetBrains Mono** — tabular numerics
