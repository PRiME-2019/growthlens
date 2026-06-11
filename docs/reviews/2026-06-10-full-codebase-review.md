# Full codebase review — 2026-06-10

Multi-agent review of the whole repo (12 focused reviewers + adversarial verification of every
finding + completeness critic; 189 verified findings before dedup, ~95 unique). Scope: UI quirks,
dead options/controls, demo↔upload consistency, engine correctness, docs drift. Clear-win fixes
were applied in the same pass (see "Fixed", bottom); everything below the fold is open and needs a
product or design decision.

---

## Status update (same day, follow-up session)

All three high-priority items and the medium tier are now **fixed**, except two that are
bigger than bugfixes and remain open:

- **Open → #7 (demo Raw/Shrunken backwards on Status & Growth)** — the real fix is the README
  roadmap item: regenerate the achievement/demographics demo fixtures through the engine.
- **Open → #14 (weeks-of-learning methodology)** — the methodology note content is research
  writing for the PRiME team, not a code change.

Decisions made with the user along the way: slide 03 widest = most negative; slide 04 shows
parity-or-better only (honest empty state); the Demographics page dropped the do-nothing
"Groups to compare" select; Gap sorts rank by the displayed estimate; Z_T relabeled
"this year's score"; shrinkage falls back to raw when τ² can't be fit (<2 schools);
ingest filters to grades 3–8 with a visible "rows set aside" note; deck uses rust for
negative gaps. Also fixed in the same pass: Remove now truly removes (store API +
DuckDB cleanup + tests), unavailable subgroup options disable instead of silently
falling back to FRL, the Upload page remembers loaded files across navigation, the
DatasetStrip refreshes immediately on upload/remove, Demographics flags below-min-n
groups, the student scatter stride-samples above 2,000 dots, and subgroup-independent
pages (Scan/Demographics/Status & Growth) show subject-only headers.

**Low-tier sweep (same day, third session):** dead seams dropped (DEMO_DATA_BY_SCHOOL from
fixture/engine/store/tests, OLS reg fits, demo y_shrunk, DEMO_SPECS.short, cells() status,
parseFlag, HeatmapH1 controlled-sort mode, ForestFinal setter props, .frame-hatch,
reference/20260512_prior_va.json deleted); SLU.mute darkened to #6F727A (≥4.5:1 AA) across
app/methods/deck; prefers-reduced-motion now gates all chart transitions; collapsible card
headers and FAQ accordions are keyboard-operable with aria-expanded; ViewToggle exposes
aria-pressed; invalid aria-sort dropped in favor of richer header labels; chart SVGs have
accessible names; demographics outliers got 9px hit targets and uploads get a compact
tooltip (no "student" placeholder); demoVar clamp writes back; forest + heatmap scroll
horizontally at narrow widths; demo fixture aligned to engine (focal-first order, matching
labels); methods.html links the real repo. Verified by a 17-step browser smoke across all
pages in demo + uploaded states, zero console errors.

**Fourth session — backlog closed out:** the demo is now fully engine-generated
(tools/build-demo.js emits data.js with ALL five gap slices, heatmap-data.js, and
demo-data.js; every "Groups to compare" option is real in demo mode; raw/shrunken coherent
by construction; seed 20260627 chosen so every slice has τ² > 0). Heatmap upgraded:
role=grid semantics with per-cell aria-labels, roving-tabindex arrow-key navigation
(focus reveals n), sticky header inside a 72vh scroll region, and luminance-computed
cell/glyph inks replacing the fixed dark threshold (Scan overview included). Status &
Growth gained a school color legend (chips, capped at 24). Unit conversion extracted to
engine/units.js (pure, 10 tests incl. the year-fallback matrix); compute.js gets 4 tests
via a fake DuckDB connection (five comparisons + signs, districtMean + both-tail
outliers, the τ² raw fallback, the null-status filter) — suite now 52/52.
data-prep/notes/methodology.md drafted (marked DRAFT) from the R script's actual
behavior. Verified by a 19-step browser smoke incl. Weeks-toggle (GLUnits delegation)
and keyboard-grid probes, zero console errors.

**Remaining (intentional/by design):** ControlsCard auto-vs-manual collapse interplay
(documented behavior); quadrant counts when the mean cross is hidden (matches the blurb);
the methodology DRAFT needs PRiME review and the methods note still doesn't explain the
weeks conversion to end users.

## Open — high priority (all FIXED — see status update)

1. **The Upload page "Remove" button doesn't remove anything** — `app-shell.jsx` (≈664),
   `engine/store.js`. It only resets the dropzone's local stage; the store has no removal API, so
   the uploaded data keeps driving every figure, the DatasetStrip keeps saying "MATH upload", the
   subject toggle stays enabled, and the student rows stay in the DuckDB table. In a product whose
   core promise is privacy, a Remove control that visibly claims the file is gone is a trust
   failure. Fix needs: `GLStore.removeUploaded(subject)` (delete `sources.uploaded[subject]`,
   re-point globals, fall back to demo or disable the subject) plus `DROP TABLE t_<subject>` /
   `t_<subject>_all`. Until then, relabel or hide the button.

2. **Export slides 03/04 still assume the old sign convention** — `export.jsx` (≈29–79, 348–356).
   Gaps are now focal − reference (widest gap = most negative), but `summary.sorted` sorts
   descending, so slide 03 "Schools with the widest gaps" shows the *narrowest*, and slide 04's
   speaker notes praise the most-negative schools as "rare bright spots." With ≤8 eligible schools
   the two slides can also show the same school twice. Needs a coherent redesign: widest =
   most-negative (or largest |gap|), bright spots = gaps ≥ 0 / closest to zero, disjoint membership,
   titles and notes rewritten together.

3. **Demo mode: 4 of 5 "Groups to compare" options silently show FRL data** — `engine/store.js:30`
   fallback + `app-shell.jsx` GapControls. Selecting IEP/EL/race in demo mode changes the page
   header to "Math · IEP" while the forest still renders (and titles itself) FRL − non-FRL.
   Suggested: `GLStore.availableSubgroups()` + `disabledKeys` on the select (exactly how the ELA
   toggle is greyed), or a visible "showing FRL sample" notice when the fallback fires.

## Open — medium (FIXED except #7 and #14 — see status update)

4. **Upload page forgets loaded files when you navigate away and back** — `app-shell.jsx` (≈427).
   `files`/`stages` are component-local, so after Upload → Scan → Upload the zones say "Waiting for
   file" while the data is still active (the strip above contradicts them). Needs a small store API
   (e.g. `hasUploaded(subject)` + filename in meta) to seed initial state.
5. **"Where students started (prior achievement)" mislabels Z_T** — `achievement.jsx` axis/blurb,
   README, landing copy. `{P}_Z_T` is the standardized *current-year* score (the README's own
   column table says so). Every Status & Growth surface frames it as prior achievement. Copy
   decision: relabel as "this year's score (status)" or similar, consistently.
6. **Demographics never flags below-min-n groups** — contradicts the Upload-page FAQ promise that
   too-small groups are "flagged everywhere they appear." Needs a badge/dim treatment for groups
   with n < 10 (and a decision about per-side vs combined n).
7. **Demo Status & Growth Raw/Shrunken toggle behaves backwards** — `demo-data.js` (≈290):
   `y_raw = schoolMean + noise`, `y_shrunk = schoolMean`, so "Shrunken" can be more extreme than
   "Raw" and flip sign. Real fix is the README roadmap item: regenerate the achievement fixture
   through the engine.
8. **Degenerate shrinkage when <2 schools meet min-n** — `engine/compute.js` (≈47): `tau2=0`,
   `B=0`, every school's shrunken gap collapses to the pooled mean with zero-width CIs — a
   fabricated exact value. Needs a guard (e.g. fall back to raw display + a notice).
9. **Uncapped per-student SVG rendering** — `achievement.jsx` student view renders one
   CSS-transitioned `<circle>` per uploaded student (a 20k-student district = 20k animated nodes).
   Needs sampling, canvas, or at least dropping the transition above a count threshold.
10. **DatasetStrip / window globals stay stale after an upload until the next AppBody render** —
    `app-shell.jsx` (≈444). Upload succeeds inside UploadPage state; AppBody (which re-points the
    store globals during render) doesn't re-render until navigation. Needs a store-change
    subscription or lifting upload state.
11. **Forest sorts always rank by the shrunken gap, even in Raw mode** — `forest-final.jsx`
    SORTS_FINAL. Raw view can render visibly out of order. Decision: mode-aware sorting (rows
    re-order on toggle) vs. stable order (current) — affects the toggle animation either way.
12. **Grades outside 3–8 are silently inconsistent** — ingest keeps all grades; the heatmap and
    Scan overview hardcode 3–8 (out-of-range grades vanish) while Gap/Demographics include them.
    Upload copy says "Grades 3–8 are supported." Decide: filter at ingest (with an explicit
    "n rows outside grades 3–8 were ignored" notice — `meta.nDropped` already exists, unused) or
    derive heatmap columns from data.
13. **Deck palette codes negative gaps gold** — `export.jsx` addGapTable/hotspots use gold for
    negative where every figure uses rust (gold elsewhere means "district reference"). Palette
    decision for the deck.
14. **Weeks-of-learning methodology is unwritten** — `data-prep/notes/methodology.md` is five
    "to be documented here" stubs; methods.html never explains the conversion; the factor file's
    coverage gaps (no grade 3; no 2020/2021 administrations) are documented nowhere user-facing.
    The UI footnote now names the factor year and grade range honestly, but the methods note should
    own the conversion before a district leans on it.

## Open — low / polish

- **Deferred-feature seams that read as dead code** (wire, document, or drop):
  `DEMO_DATA_BY_SCHOOL` (built by fixture *and* engine, stored, swapped, tested — no figure reads
  it); `reg_raw`/`reg_shrunk` OLS fits (computed twice, never rendered); demo student `y_shrunk`
  (unused; the comment in achievement.jsx denying its existence is wrong); `DEMO_SPECS.short`;
  `cells()` `avg(status)` in buildGaps; ingest meta `districtCode`(hardcoded null)/`nDropped`/
  `nRowsLatest` (never surfaced; DatasetStrip's districtCode prefix is unreachable);
  `parseFlag` (exported+tested, production duplicates it in SQL with different NULL semantics);
  HeatmapH1's controlled `sortKey`/`setSortKey` mode; ForestFinal's accepted-but-unused
  `setSort`/`setThreshold` props; `.frame-hatch` CSS; `reference/20260512_prior_va.json` (1.5 MB,
  referenced by nothing — delete or document).
- **Accessibility backlog** (beyond the roadmap's popover item): collapsible card headers are
  mouse-only divs; Chart/Table ViewToggle exposes no checked state; the heatmap matrix has no
  table semantics and puts `aria-sort` on buttons; schools in the scatter are hue-only encoded
  with no legend; SLU.mute (#7B7E85) small text ≈4.07:1 on white and heatmap mid-band glyphs sit in
  a contrast dead zone; FAQ accordions lack `aria-expanded`; demographics outlier dots have ~5 px
  hit targets; chart SVGs lack accessible names; chart animations have no
  `prefers-reduced-motion` guard.
- **Narrow-viewport behavior**: heatmap (min ~780 px) and forest chart have no horizontal
  overflow handling at tablet widths; heatmap headers aren't sticky for long school lists.
- **Demo↔upload cosmetic drift**: group row order flips (demo reference-first, engine
  focal-first); subgroup labels differ between fixture and engine; uploaded outlier tooltips show
  a literal "student" placeholder with a blank detail row; the subgroup slice label appears in
  headers of pages that ignore the subgroup (Scan, Status & Growth); `demoVar` clamp is
  display-only so stale state silently reverts when switching back to demo; quadrant counts still
  split at the district mean after the user hides the mean cross; ControlsCard auto-collapse can
  fight a manual collapse at the top; dropzone copy says "click to choose one" but only the button
  is clickable.
- **Test gaps**: `engine/compute.js` (the module that assembles every uploaded figure) has zero
  tests; `weeksPerSD`/`wolFactorYear` and the year-fallback branch are untested.
- methods.html GitHub repo link is a self-described placeholder.

## Documented-deferred (no action; confirmed intentional)

Multi-year UI · Settings page / configurable min-n · expanded subgroups · shrunken heatmap &
demographics variants (the `estimate` prop seam through HeatmapSlot is kept wired on purpose) ·
demographics/achievement demo fixtures still procedurally sampled · in-browser Babel (Vite build
on roadmap) · hover-only `title=` hints (popovers on roadmap) · prime-logo.png unreferenced.

---

## Fixed in this pass

**Visible rendering bugs**
- DistributionStrip "district +-0.15" garbled sign (`app-shell.jsx`)
- Forest legend hardcoded *and* backwards ("● favors non-FRL") → data-driven, matches axis
  (`forest-final.jsx`)
- Fixed forest axis `[-0.55, +1.25]` (old sign convention) → auto-ranged per dataset over both
  raw+shrunken CIs, stable across the Method toggle; demo now spans `[-0.70, +0.15]`
- Scan overview rendered "▲0.00 · n=0" boxes for grades absent from the data → filtered
- Heatmap SD cells showed asymmetric signs (▼ -0.08 vs ▲ 0.06) → explicit sign both ways
- Achievement school view could show a single "0" y-tick → adaptive tick step; stray ticks outside
  the plot clamped; stale hover tooltips cleared on view changes; duplicate school code in tooltip
  dropped; no-op CSS transitions on dashed lines removed
- Demo school dot showed "n=0" for the below-threshold school (`demo-data.js`)

**Misleading controls & copy**
- Heatmap subtitle claimed "Shrunken results" driven by another page's control → describes the raw
  values actually rendered
- Export page claimed the deck uses "the same settings you've set elsewhere" → honest copy; deck
  slice text now uses the active dataset's year (was hardcoded 2024–25); sample-data decks are
  stamped "· sample data"; slide-06 no longer tells boards to "set" the fixed threshold
- Landing card promise of a removed sample file; stale "subject fixed to ELA" comment
- `no_year` error copy blamed a missing column that exists
- methods.html: hide-mode claim contradicting the engine; "you can set the threshold" imperatives;
  "B column" reference; offline claim scoped to analysis-after-load; citation year; favicon
- README: `computeSlice(year, subject)` → actual signature; `WEEKS_PER_SD` → `weeksPerSD`;
  data-prep README inputs CSV → .xls/.xlsx
- Stale test name referencing a school no longer in data.js

**Upload robustness**
- Drag-over no longer wipes a zone's "Loaded" state; second-file-while-parsing guard; 50 MB limit
  now enforced (FAQ promised it); file input keyboard-accessible (was `display:none`)
- Ingest: `TRY_CAST` on GRADE/GROWTH_YEAR (malformed value drops the row instead of throwing);
  header sniff handles files without a trailing newline
- One shared DuckDB connection (was leaking one per call)

**Uploaded-data correctness**
- `computeSlice` now emits `districtMean` → Demographics reference line no longer vanishes (with a
  0-default guard in the figure)
- Box-plot outliers down-sampled across *both* tails (was keeping only the 8 most negative)
- Students with missing Z_T no longer plotted at x=0
- Weeks conversion: `WOL_OPTS` uses the uploaded growth year; `weeksPerSD` falls back to the
  nearest factor year; new `wolFactorYear()` lets footnotes name the factor year actually used;
  footnote grade range corrected to 4–8
- Conversion factors renamed to the documented fixed name `reference/conversion_factors.json`
  (data-prep deploy procedure now correct as written)

**Heatmap & shell**
- Suppressed (ok:false) cells no longer rank rows by their hidden residual; Overall sort now
  n-weighted to match the displayed Overall; grade headers announce properly to screen readers;
  legend entry for blank grade-not-served cells; "Click any heading to sort" kept
- `SORTS_FALLBACK` keys re-synced (stale keys would crash the sort lookup)
- Dead code removed: `AnimatedNum`, `DotShape`, `ForestCard`, `Checkbox`, `Axis`, `fmtB`,
  unreachable `var_desc`+`rowVar`, `_rDisplay`, NavItem `pdf` badge, ControlsGrid `columns`,
  HeaderRow's unused props

**Export & boot**
- ExportPage rules-of-hooks violation (early return before hooks); PPTX failures now surface an
  error instead of vanishing; pptxgenjs CDN script got the missing SRI integrity hash; boot
  failure no longer strands the pulsing "Loading" screen
