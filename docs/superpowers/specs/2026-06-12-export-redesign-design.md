# Export redesign — design

**Date:** 2026-06-12
**Status:** approved (design review in chat)

## Goal

Replace the 6-slide, single-slice export with a board-ready deck that covers
every loaded result, uses real school and district names, and looks like the
app. Decisions from the design review:

| Question | Decision |
|---|---|
| Figure tech | **Native PowerPoint elements** — shapes, color-filled tables, real PptxGenJS charts. Everything editable; no new dependencies. |
| Structure | **Summary first, detail appendix.** Board half up front; school-by-school detail behind a divider. |
| Units | **Follow the sidebar Units toggle** (SD or weeks), named on the cover and cautions slides. |
| Preview UI | **Carousel** — one slide at a time with prev/next, rendered from the same deck model the PPTX is built from. |
| Fonts | **Common system fonts** — Calibri for headings/body, Georgia for the cover serif accent, Consolas for tabular numbers. No webfont names in the file. |
| Appendix | **Only comparisons with a reliable signal**: the district-wide gap's 95% interval stays on one side of zero. The gaps-overview table still lists all five comparisons and says which ones the appendix skips and why. |

## Deck structure

Sections drop out when their data isn't loaded. With both subjects and a
known district: ~16–20 slides.

**Front half**
1. **Cover** — district name (crosswalk `meta.districtName`; "Sample district"
   when demo), "Growth report · <year>", subjects included, date, PRiME/SLU
   brand. Demo data gets a SAMPLE DATA banner here and a footer tag on every
   slide.
2. **How to read this** — three plain sentences: growth vs. expectations,
   0 = a typical year, numbers steadied for small schools; names the unit.
3. **District at a glance** — stat tiles (schools above expectations per
   subject, largest group gap, students included) + generated takeaways:
   the first non-caveat takeaway from each page's GLInsights generator
   (scan, scores vs. growth, groups, gaps) per subject, capped at six
   bullets, scan and gaps first.
4. **Per subject (Math, then ELA), 4 slides each:**
   - *Growth by school & grade* — native table, school names down the rows,
     grades + Overall across, cell fills from the app's diverging palette,
     suppressed cells hatched/empty with a "too few" note.
   - *Scores vs. growth* — native scatter chart (school level), quadrant
     lines drawn at the district averages, side panel naming the strongest
     and weakest schools.
   - *Growth by student group* — shape-drawn strip per group: middle-half
     bar + median diamond on a shared axis (same vocabulary as the app),
     typical-student value labels.
   - *Group gaps overview* — table of all five comparisons: district-wide
     gap, likely range, schools leaning the same way, schools with enough
     students. Footnote names the comparisons the appendix skips.
5. **Statewide comparison** (when the district resolves: upload's
   districtCode, or the demo default on sample data) — per subject: stacked
   column chart of the level histograms (gray statewide pool, gold = your
   schools, named in labels/notes) + native line chart of growth over time.
   Skipped entirely when the upload has no district code or the PRiME fetch
   failed.
6. **Cautions** — the current methods content + units note + minimum-n note.

**Appendix** — divider slide, then one slide per reliable comparison per
subject (0–10): forest-style shape-drawn rows — school name, interval bar,
gap diamond, n's — with too-few-students schools listed compactly below.

## Architecture

**`engine/deck.js`** (UMD, Node-tested) — pure deck-model builder:

```
buildDeck({ bySubject, prime, units, fmt, today }) → { slides: [descriptor] }
```

- `bySubject`: `{ math?: { gaps, heat, ach, demo, meta }, ela?: … }` — the
  store's full shapes per subject.
- `prime`: `{ rows, lea } | null` — parsed PRiME rows + resolved district.
- `fmt`: injected value formatter (the insights convention), so the engine
  never knows about conversion tables.
- Each descriptor: `{ kind, title, eyebrow, notes, …data }`, with `kind` one
  of `cover | intro | glance | heat | scatter | groups | gapsOverview |
  stateHist | stateTrend | cautions | divider | forest`. All school/district
  names resolved here (label = `school_name || school_id`).
- Appendix gating, slide ordering, and every edge case (one subject, single
  school, zero reliable comparisons, no district) live here — testable in
  Node.

**`export.jsx`** becomes two thin renderers off the same model:
- `buildPPTX(deck)` — kind → PptxGenJS layout (one layout function per kind),
  shared header/footer helpers, SLU palette, system fonts, speaker notes per
  slide.
- `SlideCarousel(deck)` — kind → HTML/CSS approximation for the on-page
  preview. One slide visible, prev/next buttons + "slide n of N" counter,
  arrow-key navigation, dots elided in favor of the counter. Because both
  renderers read the same descriptor, content can't drift; only styling is
  approximated.

**`engine/store.js`** — `allSubjectsData()` grows `ach`, `demo`, and `meta`
alongside the existing `gaps` + `heat` (callers: resources page unchanged —
extra keys are additive).

Filename: `GrowthLens-<district-or-sample>-<YYYY-MM-DD>.pptx` (the deck is no
longer one subject × one comparison).

## Edge cases

- **One subject loaded** — one subject section; glance tiles show that
  subject only.
- **Single-school upload** — heatmap table renders one row; scatter gets one
  point; forest slides render their one row; takeaway generators already
  guard these.
- **No reliable comparisons** — appendix collapses to nothing; the gaps
  overview says so in plain language.
- **District unknown** — statewide section skipped; cover uses "Your
  district".
- **Weeks units** — heatmap cells convert per grade, pooled numbers use the
  grade 4–8 average, identical to the app.

## Testing

- Node tests for `engine/deck.js`: slide selection per data availability
  (both/one subject, prime present/absent), name preference, appendix
  signal-gating, single-school shapes, fmt injection.
- Store test: `allSubjectsData` carries the new keys.
- Browser verification: carousel renders and navigates with zero console
  errors; the download is intercepted, unzipped (a .pptx is a zip), and the
  slide XML is checked for slide count, district + school names, and absence
  of webfont faces.

## Out of scope

PDF export, per-section include/exclude UI, font embedding, per-student
detail slides, statewide subgroup ranks.
