# Controls restructure — design

**Date:** 2026-06-11
**Status:** approved (design review in chat)

## Problem

Every analysis page carries a "Controls" card that repeats the same global
settings (Subject, Units, Method) alongside a few per-figure options. The card
takes vertical space on every page, needs sticky/auto-collapse machinery to
stay reachable, and mixes two kinds of state: settings that change what *every*
figure means, and options that only affect one figure.

## Decision summary

| Setting | Today | New home |
|---|---|---|
| Subject (Math/ELA) | Controls card, every page | Sidebar "Analysis" panel |
| Units (SD/Weeks) | Controls card, every page | Sidebar "Analysis" panel |
| Method (Shrunken/Raw) | Controls card (Gap, Status & Growth) | Sidebar "Analysis" panel |
| Groups to compare | Controls card (Gap) | Gap Analysis figure card |
| Sort order | Controls card (Gap) | **Dropped** — always largest gap first |
| Small groups handling | Controls card (Gap) | **Dropped** — always grouped at the bottom |
| Group (Demographics) | Controls card | Demographics figure card |
| Level School/Student | Controls card (Status & Growth) | Status & Growth figure card |
| District average Show/Hide | Figure card (already moved) | unchanged |
| Chart/Table view | Figure card (already there) | unchanged |

Global settings persist to localStorage. The Controls card and its chrome are
retired on all four analysis pages.

## 1. Sidebar "Analysis" panel

A labeled block in the left sidebar between the nav tabs and the footer links.
The "Settings" placeholder nav item is removed (the panel takes its role);
"Methods note" stays:

```
── ANALYSIS ────────
 Subject   [Math] ELA
 Units     [SD] Weeks
 Method    [Shrunken] Raw
```

- Reuses `CSegmented` (hint tooltips, roving-tabindex radiogroup, disabled
  keys). Compact spacing to fit the 220px column.
- Subject availability greying carries over (`disabledSubjects`); demo data is
  Math-only until an ELA upload.
- The sidebar is already sticky, so the active analysis state is always
  visible — this replaces the Controls card's sticky slice-strip role.

### Persistence

- Key `gl-analysis-v1`, JSON: `{ subject, unit, estimate, demo }`.
- Read once in the `useState` initializers; written by an effect on change.
- Boot validation: after `GLStore.seedDemo()`, an effect snaps persisted
  values the active store can't serve back to defaults (subject → `math`,
  demo → `frl`), mirroring the existing subgroup snap-back effect. The
  render-time `setSubject` guard already covers user-initiated switches.
- UI preferences only — no student data; the privacy promise is untouched.

## 2. Per-figure options on the cards

- **Gap Analysis** (`forest-final.jsx`): the title row gains a **Compare**
  select (the five comparisons; unavailable ones disabled with the existing
  "(not in this data)" hint) to the left of the View Chart/Table pill.
  `ForestSlot` passes `demo`, `setDemo`, `disabledDemos` through to
  `ForestFinal`. Sort and small-groups controls are gone: the forest always
  sorts by the displayed estimate, largest gap first (null-estimate rows
  last), and below-threshold schools always render in the labeled bottom
  section ("Group at the bottom" — the Upload-FAQ-promised behavior).
- **Demographics** (`demographics.jsx`): the Group select moves into the
  figure card's header row, right side.
- **Status & Growth** (`achievement.jsx`): a School/Student pill joins the
  District-average pill on the card's title row. `MeansToggle` generalizes
  into a reusable two-option pill (label + options) used by both.
- **System Scan**: nothing moves — it only had globals.

## 3. Removals

- `ControlsCard` (sticky wrapper, scroll auto-collapse handler) and the four
  page controls components (`GapControls`, `ScanControls`,
  `DemographicsControls`, `AchievementControls`).
- `ctx.forestSort` / `ctx.threshold` and their setters.
- `SORTS_FINAL`, `THRESHOLD_MODES`, `SORTS_FALLBACK`, `THRESH_FALLBACK`,
  `flattenOptionMap` — the forest hardcodes the default comparator
  (`b[gapKey] − a[gapKey]`, nulls last) and `section` threshold behavior.
- `AuxCard` **stays** (used by the Overview cards); only the ControlsCard
  specialization goes.

## 4. Consequences and edge cases

- **Export** follows the active comparison set on the Gap card (its card
  already names the slice, e.g. "6 slides · Math · FRL"); it keeps
  hardcoding shrunken/SD as stated in its copy. A dedicated slice picker on
  the Export page is out of scope.
- **Student-level Status & Growth** ignores Method (no shrinkage at student
  level; `y_raw` forced) — same as today. The Method control remains visible
  in the sidebar instead of disappearing; its hint copy covers this.
- **Stale persisted state** (e.g. `ela` persisted, ELA upload since removed):
  boot validation snaps back to defaults; no "No data" dead-ends.
- Tab-switch scroll-to-top behavior stays; the ControlsCard re-open handler
  it paired with is deleted with the card.

## Out of scope

- Export-page slice picker; methods.html copy; heatmap internals; the
  "Settings" item as a future app-settings modal.

## Acceptance criteria

1. Sidebar shows the Analysis panel on every page; changing Subject/Units/
   Method updates the open figure exactly as the Controls card did.
2. No Controls card renders on Scan / Gap / Status & Growth / Demographics.
3. Gap card: Compare select works (greyed options disabled), forest always
   sorts largest-gap-first with small schools sectioned at the bottom.
4. Demographics card hosts its Group select; Status & Growth card hosts
   Level + District average pills.
5. Reload restores subject/unit/method/comparison from localStorage; a
   persisted value the dataset can't serve snaps back to Math/FRL.
6. `node --test "test/*.test.js"` passes (no engine changes expected).
7. In-browser verification of all four pages, plus Export still building.
