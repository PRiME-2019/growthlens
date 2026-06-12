# Export Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6-slide single-slice PPTX export with a comprehensive, board-ready deck (cover → glance → per-subject figures → statewide → cautions → signal-gated appendix), driven by a Node-tested deck model, with a carousel preview on the Export page.

**Architecture:** New pure module `engine/deck.js` builds a deck model (array of slide descriptors with all data resolved: names, units, takeaways, appendix gating). `export.jsx` becomes two thin renderers off that model — `buildPPTX` (PptxGenJS layouts per descriptor kind) and a `SlideCarousel` preview. `GLStore.allSubjectsData()` grows full shapes. Spec: `docs/superpowers/specs/2026-06-12-export-redesign-design.md`.

**Tech Stack:** No-build React (in-browser Babel, window globals), UMD engine modules tested with `node --test`, PptxGenJS 3.12 (already vendored via CDN tag), Playwright/msedge for browser verification.

---

## Context for an engineer with zero codebase knowledge

- Engine modules live in `engine/*.js`, wrapped in UMD: `(function (root, factory) { const api = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = api; root.GLName = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () { 'use strict'; … return api; });`. They are loaded as plain `<script>` tags in `index.html` AND required directly by Node tests (`test/*.test.js`, run with `node --test "test/*.test.js"` — the quoted glob matters on Windows).
- JSX files are plain `<script type="text/babel">` — no imports; cross-file references go through `window.*` (bare identifiers resolve to window properties at runtime).
- Data shapes the deck consumes (all built by `engine/compute.js` per subject, registered in the store):
  - `gaps` = `GAPS_DATA_BY_DEMO`: `{ frl|iep|el|race_bw|race_hw: { meta: { subject, demographic, groupA, groupB, districtGap, districtCi95:[lo,hi]|null, tauSquared, nSchools, nMeetingThreshold, minCellSize }, schools: [{ school_id, school_name?, n_a, n_b, raw_gap, shrunk_gap, raw_ci95, shrunk_ci95, shrinkage_factor, meets_min_cell }] } }` (gap/ci fields are null for zero-side schools).
  - `heat` = `HEATMAP_DATA`: `{ meta:{subject}, schools: [{ school_id, school_name?, grades: { 3..8?: { n, r, rs, ok } }, overall: { n, r, rs }|null }] }`.
  - `ach` = `ACH_DATA`: `{ school: { points: [{ school_id, school_name, x, y_raw, y_shrunk, n }] }, student: { points: [{ x, y_raw, … }] } }` (x is this-year standardized score).
  - `demo` = `DEMO_DATA`: `{ frl|…: { label, districtMean, groups: [{ key, label, n, mean, median, q1, q3, whiskerLo, whiskerHi, outliers }] } }`.
  - `meta`: `{ subject, latestYear, nSchools, nRowsLatest, districtCode?, districtName?, source? ('uploaded' for real data), filename? }`.
- `engine/prime.js` (`GLPrime`) provides `districtReport(rows, lea)`, `histogram(rows,{year,level,subject,binWidth,lea})`, `districtMeanSeries(report, subject)`, `nameLookup`. `engine/insights.js` (`GLInsights`) provides `scanTakeaways({heat,fmt})`, `gapTakeaways({slices,activeKey,mode,fmt})`, `achievementTakeaways({ach,mode,fmt})`, `demographicsTakeaways({data,fmt})` — each returns `[{text, caveat?}]` with `**bold**` markers.
- The PRiME CSV loads via `window.loadPrimeDb()` (cached promise of parsed rows; defined in `district-report.jsx`).
- SLU palette (window globals from `forest-shared.jsx`): blue `#003DA5`, blueDark `#002A75`, gold `#9A7611`, ink `#1A1B1F`, ink2 `#3F4147`, mute `#6F727A`, rule2 `#EDEDEF`, neg (rust) `#7C3A12`. Heatmap cell fill comes from `window.divColor(z)` → `"rgb(r,g,b)"` string; `window.heatCellInk(z)` → `'#fff'` or ink.
- Browser verification recipe: serve `python -m http.server 8013` from repo root (background), Playwright from `%TEMP%\gl-verify` with `chromium.launch({ channel: 'msedge' })`, nav tabs are `role=button` in `aside`, wait ~2.5–3s after `goto` for Babel. Upload simulation: `page.locator('input[type=file]').nth(1).setInputFiles(csv)` (0=ELA, 1=Math), poll up to 30s for "is loaded". `%TEMP%\gl-verify\named-math.csv` carries real Jackson R-II school codes + `COUNTY_DISTRICT_CODE` (16090) so the crosswalk stamps real names.
- Commit messages: write to `$env:TEMP\gl-commit-msg.txt` and `git commit -F` (inline quotes break PowerShell args). End with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `engine/store.js` | modify | `allSubjectsData()` also returns `ach`, `demo`, `meta` per subject |
| `engine/deck.js` | create | pure deck-model builder (`buildDeck`) + `buildDemoSections` (moved from demographics.jsx) |
| `test/store.test.js` | modify | cover the new keys |
| `test/deck.test.js` | create | deck model tests |
| `demographics.jsx` | modify | use `window.GLDeck.buildDemoSections` (delete local copy) |
| `district-report.jsx` | none | `loadPrimeDb` already exported on window |
| `export.jsx` | rewrite | `ExportPage` (carousel + download button), `buildPPTX(deck)` layouts |
| `index.html` | modify | `<script src="engine/deck.js">` after prime.js |
| `README.md` | modify | Export bullet describes the new deck |

---

### Task 1: Store exposes full shapes per subject

**Files:**
- Modify: `engine/store.js` (the `allSubjectsData()` method, ~line 86)
- Test: `test/store.test.js`

- [ ] **Step 1: Write the failing test.** Open `test/store.test.js`, find how existing tests seed the store (they set `window`-ish globals via the module's exported store object — follow the established pattern in that file; there is a helper that calls `putUploaded(subject, shapes, meta)`). Add:

```js
test('allSubjectsData carries ach, demo, and meta alongside gaps and heat', () => {
  // Arrange: register one uploaded subject with all four shapes (reuse the
  // file's existing minimal-shape helpers/fixtures if present).
  const shapes = {
    GAPS_DATA_BY_DEMO: { frl: { meta: { subject: 'math' }, schools: [] } },
    HEATMAP_DATA: { meta: { subject: 'math' }, schools: [] },
    ACH_DATA: { school: { points: [] }, student: { points: [] } },
    DEMO_DATA: { frl: { label: 'FRL', groups: [], districtMean: 0 } },
  };
  store.putUploaded('math', shapes, { subject: 'math', latestYear: 2025, nSchools: 0 });
  const all = store.allSubjectsData();
  assert.ok(all.math.gaps, 'gaps still present');
  assert.ok(all.math.heat !== undefined, 'heat still present');
  assert.ok(all.math.ach.school, 'ach present');
  assert.ok(all.math.demo.frl, 'demo present');
  assert.equal(all.math.meta.latestYear, 2025, 'meta present');
});
```

Adapt the arrange block to the file's actual conventions (read the top of `test/store.test.js` first — it may construct the store fresh per test).

- [ ] **Step 2: Run it** — `node --test "test/store.test.js"`. Expected: FAIL (ach undefined).

- [ ] **Step 3: Implement.** In `engine/store.js`, `allSubjectsData()`:

```js
    // Full shapes + meta for EVERY available subject — the Resources page
    // reads gaps/heat; the Export deck reads everything.
    allSubjectsData() {
      const out = {};
      for (const s of ['math', 'ela']) {
        const ds = resolve(s);
        if (ds) out[s] = {
          gaps: ds.shapes.GAPS_DATA_BY_DEMO || {},
          heat: ds.shapes.HEATMAP_DATA || null,
          ach: ds.shapes.ACH_DATA || null,
          demo: ds.shapes.DEMO_DATA || null,
          meta: ds.meta || null,
        };
      }
      return out;
    },
```

- [ ] **Step 4: Run the full suite** — `node --test "test/*.test.js"`. Expected: all pass (currently 101 + 1 new).

- [ ] **Step 5: Commit** — `feat(store): allSubjectsData carries ach, demo, and meta`.

---

### Task 2: engine/deck.js scaffold + buildDemoSections moves into the engine

**Files:**
- Create: `engine/deck.js`
- Create: `test/deck.test.js`
- Modify: `demographics.jsx` (delete local `buildDemoSections`, call `window.GLDeck.buildDemoSections`)
- Modify: `index.html` (script tag)

- [ ] **Step 1: Write failing tests** in `test/deck.test.js`:

```js
// Deck model: pure slide-descriptor builder for the PPTX export + carousel.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../engine/deck.js');

const fmtSD = { val: (z) => (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2) + ' SD' };

test('buildDemoSections: merges the shared White reference into one Race section', () => {
  const dd = {
    frl: { groups: [{ label: 'FRL' }, { label: 'non-FRL' }] },
    race_bw: { groups: [{ label: 'Black' }, { label: 'White' }] },
    race_hw: { groups: [{ label: 'Hispanic' }, { label: 'White' }] },
  };
  const sections = D.buildDemoSections(dd);
  assert.deepEqual(sections.map((s) => s.title), ['Income', 'Race']);
  assert.deepEqual(sections[1].groups.map((g) => g.label), ['Black', 'Hispanic', 'White']);
});

test('buildDemoSections: unknown comparison keys get their own section', () => {
  const dd = { custom: { label: 'Custom thing', groups: [{ label: 'A' }] } };
  assert.deepEqual(D.buildDemoSections(dd).map((s) => s.title), ['Custom thing']);
});
```

- [ ] **Step 2: Run** — `node --test "test/deck.test.js"`. Expected: FAIL (module not found).

- [ ] **Step 3: Create `engine/deck.js`** with the UMD wrapper that injects GLPrime + GLInsights (deck composes them; Node gets the real modules):

```js
// GrowthLens deck model — pure functions, no DOM, no PptxGenJS. UMD: browser →
// window.GLDeck, Node → module.exports.
//
// buildDeck() turns the store's per-subject shapes (+ the PRiME rows when the
// district is known) into an ordered array of slide DESCRIPTORS. Both the
// PPTX builder and the on-page carousel render from this one model, so the
// preview can never drift from the file. All school/district names, unit
// formatting (via the injected fmt), takeaway selection, and appendix gating
// happen here — where Node can test them.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./prime.js'), require('./insights.js'));
  } else {
    root.GLDeck = factory(root.GLPrime, root.GLInsights);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P, I) {
  'use strict';

  const label = (s) => (s.school_name && s.school_name !== s.school_id ? s.school_name : s.school_id);

  // ---- demographics sections (moved from demographics.jsx — one source) ----
  // One section per demographic dimension. A group label appearing in more
  // than one race comparison (White, the shared reference) is kept once,
  // ordered last. Unknown comparison keys get their own section.
  function buildDemoSections(dd) {
    const sections = [];
    const groupsOf = (key) => (dd[key] && dd[key].groups) || [];
    if (groupsOf('frl').length) sections.push({ title: 'Income', groups: groupsOf('frl') });
    if (groupsOf('iep').length) sections.push({ title: 'Disability', groups: groupsOf('iep') });
    if (groupsOf('el').length) sections.push({ title: 'Language', groups: groupsOf('el') });
    const raceKeys = ['race_bw', 'race_hw'].filter((k) => groupsOf(k).length);
    if (raceKeys.length) {
      const counts = {};
      raceKeys.forEach((k) => groupsOf(k).forEach((g) => { counts[g.label] = (counts[g.label] || 0) + 1; }));
      const seen = new Set();
      const focal = [], shared = [];
      raceKeys.forEach((k) => groupsOf(k).forEach((g) => {
        if (seen.has(g.label)) return;
        seen.add(g.label);
        (counts[g.label] > 1 ? shared : focal).push(g);
      }));
      sections.push({ title: 'Race', groups: [...focal, ...shared] });
    }
    const known = new Set(['frl', 'iep', 'el', 'race_bw', 'race_hw']);
    for (const [key, v] of Object.entries(dd)) {
      if (known.has(key) || !v || !v.groups || !v.groups.length) continue;
      sections.push({ title: v.label || key, groups: v.groups });
    }
    return sections;
  }

  return { buildDemoSections, label };
});
```

- [ ] **Step 4: Run** — `node --test "test/deck.test.js"`. Expected: PASS.

- [ ] **Step 5: Switch demographics.jsx to the engine copy.** Delete the whole local `function buildDemoSections(dd) { … }` (demographics.jsx ~lines 25–56) and replace its one call site (`const sections = buildDemoSections(dd);` in `DemographicsPage`) with `const sections = window.GLDeck.buildDemoSections(dd);`. Keep the explanatory comment, pointing at the engine:

```js
// Sections come from engine/deck.js (shared with the Export deck): one per
// demographic dimension, shared White reference merged into one Race section.
```

- [ ] **Step 6: Add the script tag** in `index.html` after prime.js:

```html
<script src="engine/prime.js"></script>
<script src="engine/deck.js"></script>
```

- [ ] **Step 7: Run all tests** (`node --test "test/*.test.js"`) and a quick browser smoke (serve + open Growth by student group, confirm sections render, zero console errors).

- [ ] **Step 8: Commit** — `feat(deck): engine deck module scaffold; buildDemoSections moves to the engine`.

---

### Task 3: Gaps overview + appendix gating + forest descriptors

**Files:**
- Modify: `engine/deck.js`
- Test: `test/deck.test.js`

- [ ] **Step 1: Failing tests.** Reusable fixture at the top of `test/deck.test.js`:

```js
function gapSlice(key, A, B, districtGap, ci, schools) {
  return {
    meta: { subject: 'math', demographic: key, groupA: A, groupB: B,
            districtGap, districtCi95: ci, tauSquared: 0.01,
            nSchools: schools.length,
            nMeetingThreshold: schools.filter((s) => s.meets_min_cell).length,
            minCellSize: 10 },
    schools,
  };
}
const SCH = (id, name, gap, lo, hi, meets = true) => ({
  school_id: id, school_name: name, n_a: 25, n_b: 30,
  raw_gap: gap, shrunk_gap: gap, raw_ci95: gap == null ? null : [lo, hi],
  shrunk_ci95: gap == null ? null : [lo, hi],
  shrinkage_factor: 0.7, meets_min_cell: meets,
});
const GAPS = {
  frl: gapSlice('frl', 'FRL', 'non-FRL', -0.15, [-0.22, -0.08], [
    SCH('4015', 'Orchard Drive Elementary', -0.2, -0.3, -0.1),
    SCH('4110', 'North Elementary', -0.1, -0.2, 0.0),
    SCH('4160', 'West Lane Elementary', null, null, null, false),  // zero-side
  ]),
  iep: gapSlice('iep', 'IEP', 'non-IEP', -0.05, [-0.15, 0.05], [
    SCH('4015', 'Orchard Drive Elementary', -0.05, -0.2, 0.1),
  ]),
};

test('gapsOverview: one row per comparison; reliable = district CI on one side of zero', () => {
  const o = D.gapsOverview({ gaps: GAPS, mode: 'shrunk', fmt: fmtSD });
  assert.equal(o.rows.length, 2);
  const frl = o.rows.find((r) => r.key === 'frl');
  assert.equal(frl.reliable, true);
  assert.match(frl.gapText, /−0\.15 SD/);
  assert.match(frl.rangeText, /−0\.22.*−0\.08/);
  assert.equal(frl.coverage, '2 of 3');
  const iep = o.rows.find((r) => r.key === 'iep');
  assert.equal(iep.reliable, false);          // CI spans zero
  assert.match(o.skippedNote, /IEP/);          // overview names what the appendix skips
});

test('forestSlides: only reliable comparisons; names, sorted by |gap|, zero-side excluded list', () => {
  const slides = D.forestSlides({ gaps: GAPS, subject: 'math', mode: 'shrunk', fmt: fmtSD });
  assert.equal(slides.length, 1);              // iep gated out
  const f = slides[0];
  assert.equal(f.kind, 'forest');
  assert.deepEqual(f.rows.map((r) => r.name), ['Orchard Drive Elementary', 'North Elementary']);
  assert.equal(f.rows[0].text, '−0.20 SD');
  assert.ok(f.axis.min < -0.3 && f.axis.max > 0.1, 'axis covers the CIs');
  assert.deepEqual(f.excluded.map((e) => e.name), ['West Lane Elementary']);
});
```

- [ ] **Step 2: Run** — expected FAIL (functions missing).

- [ ] **Step 3: Implement** in `engine/deck.js` (before the return; add `gapsOverview, forestSlides` to the exports):

```js
  const GAP_KEYS = ['frl', 'iep', 'el', 'race_bw', 'race_hw'];
  const isReliable = (m) => !!(m && m.districtCi95 && (m.districtCi95[0] > 0 || m.districtCi95[1] < 0));

  // One table row per comparison the data carries. `reliable` drives the
  // appendix gate: the district-wide interval stays on one side of zero.
  function gapsOverview({ gaps = {}, mode = 'shrunk', fmt } = {}) {
    const gapKey = mode === 'raw' ? 'raw_gap' : 'shrunk_gap';
    const rows = GAP_KEYS.filter((k) => gaps[k] && gaps[k].meta).map((k) => {
      const { meta, schools } = gaps[k];
      const reliable = isReliable(meta);
      const dSign = Math.sign(meta.districtGap || 0);
      const meets = schools.filter((s) => s.meets_min_cell && Number.isFinite(s[gapKey]));
      const leaning = dSign === 0 ? 0 : meets.filter((s) => Math.sign(s[gapKey]) === dSign).length;
      return {
        key: k, groupA: meta.groupA, groupB: meta.groupB,
        label: `${meta.groupA} vs. ${meta.groupB}`,
        gapText: fmt.val(meta.districtGap),
        rangeText: meta.districtCi95
          ? `${fmt.val(meta.districtCi95[0])} to ${fmt.val(meta.districtCi95[1])}` : '—',
        leaning: `${leaning} of ${meets.length}`,
        coverage: `${meta.nMeetingThreshold} of ${meta.nSchools}`,
        reliable,
      };
    });
    const skipped = rows.filter((r) => !r.reliable).map((r) => r.label);
    const skippedNote = skipped.length
      ? `No school-by-school slide for ${skipped.join(' or ')} — the district-wide difference there could plausibly be zero.`
      : null;
    return { kind: 'gapsOverview', rows, skippedNote };
  }

  // Appendix: one forest slide per RELIABLE comparison, schools sorted by
  // gap size, zero-side/too-small schools listed compactly instead of drawn.
  function forestSlides({ gaps = {}, subject, mode = 'shrunk', fmt } = {}) {
    const gapKey = mode === 'raw' ? 'raw_gap' : 'shrunk_gap';
    const ciKey = mode === 'raw' ? 'raw_ci95' : 'shrunk_ci95';
    return GAP_KEYS
      .filter((k) => gaps[k] && isReliable(gaps[k].meta))
      .map((k) => {
        const { meta, schools } = gaps[k];
        const drawn = schools
          .filter((s) => s.meets_min_cell && Number.isFinite(s[gapKey]) && s[ciKey])
          .sort((a, b) => Math.abs(b[gapKey]) - Math.abs(a[gapKey]))
          .map((s) => ({
            name: label(s), nA: s.n_a, nB: s.n_b,
            gap: s[gapKey], ci: s[ciKey],
            text: fmt.val(s[gapKey]),
            rangeText: `${fmt.val(s[ciKey][0])} to ${fmt.val(s[ciKey][1])}`,
          }));
        const excluded = schools
          .filter((s) => !(s.meets_min_cell && Number.isFinite(s[gapKey]) && s[ciKey]))
          .map((s) => ({
            name: label(s),
            reason: !Number.isFinite(s[gapKey])
              ? `no ${s.n_a === 0 ? meta.groupA : meta.groupB} students`
              : 'too few students to read reliably',
          }));
        const ext = Math.max(0.1, Math.abs(meta.districtGap || 0),
          ...drawn.flatMap((r) => [Math.abs(r.ci[0]), Math.abs(r.ci[1])]));
        return {
          kind: 'forest', subject, key: k,
          groupA: meta.groupA, groupB: meta.groupB,
          title: `${meta.groupA} vs. ${meta.groupB} — school by school`,
          district: { gap: meta.districtGap, ci: meta.districtCi95, text: fmt.val(meta.districtGap) },
          rows: drawn, excluded,
          axis: { min: -ext * 1.1, max: ext * 1.1 },
        };
      });
  }
```

- [ ] **Step 4: Run** — `node --test "test/deck.test.js"`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(deck): gaps overview + signal-gated forest descriptors`.

---

### Task 4: Heat, scatter, groups, and glance descriptors

**Files:**
- Modify: `engine/deck.js`
- Test: `test/deck.test.js`

- [ ] **Step 1: Failing tests** (append; fixtures inline):

```js
const HEAT = { meta: { subject: 'math' }, schools: [
  { school_id: '4015', school_name: 'Orchard Drive Elementary',
    grades: { 3: { n: 35, r: 0.12, rs: 0.10, ok: true }, 4: { n: 6, r: 0.4, rs: 0.2, ok: false } },
    overall: { n: 41, r: 0.13, rs: 0.11 } },
  { school_id: '4110', school_name: 'North Elementary',
    grades: { 3: { n: 30, r: -0.08, rs: -0.06, ok: true } },
    overall: { n: 30, r: -0.08, rs: -0.06 } },
]};
const ACH = { school: { points: [
  { school_id: '4015', school_name: 'Orchard Drive Elementary', x: 0.2, y_raw: 0.15, y_shrunk: 0.11, n: 41 },
  { school_id: '4110', school_name: 'North Elementary', x: -0.3, y_raw: -0.09, y_shrunk: -0.06, n: 30 },
]}, student: { points: [] } };
const DEMO = { frl: { label: 'FRL · economically disadvantaged', districtMean: 0.01, groups: [
  { key: 'A', label: 'FRL', n: 300, mean: -0.05, median: -0.06, q1: -0.4, q3: 0.3, whiskerLo: -1, whiskerHi: 1, outliers: [] },
  { key: 'B', label: 'non-FRL', n: 400, mean: 0.06, median: 0.05, q1: -0.3, q3: 0.4, whiskerLo: -1, whiskerHi: 1.2, outliers: [] },
]}};

test('heatSlide: names, shrunken cell values formatted, suppressed cells flagged', () => {
  const h = D.heatSlide({ heat: HEAT, subject: 'math', fmt: fmtSD });
  assert.equal(h.kind, 'heat');
  assert.deepEqual(h.grades, [3, 4]);          // only grades any school serves
  const row = h.rows[0];
  assert.equal(row.name, 'Orchard Drive Elementary');
  assert.equal(row.cells[0].z, 0.10);          // rs preferred
  assert.equal(row.cells[0].text, '+0.10 SD');
  assert.equal(row.cells[1].ok, false);        // suppressed
  assert.equal(row.overall.text, '+0.11 SD');
  assert.equal(h.rows[1].cells[1], null);      // grade not served
});

test('scatterSlide: shrunken y, named standouts, district means', () => {
  const s = D.scatterSlide({ ach: ACH, subject: 'math', mode: 'shrunk', fmt: fmtSD });
  assert.equal(s.kind, 'scatter');
  assert.equal(s.points.length, 2);
  assert.equal(s.best.name, 'Orchard Drive Elementary');
  assert.equal(s.worst.name, 'North Elementary');
  assert.ok(Math.abs(s.yMean - (0.11 * 41 - 0.06 * 30) / 71) < 1e-9, 'n-weighted mean');
});

test('groupsSlide: sections via buildDemoSections, median text, shared domain', () => {
  const g = D.groupsSlide({ demo: DEMO, subject: 'math', fmt: fmtSD });
  assert.equal(g.kind, 'groups');
  assert.equal(g.sections[0].title, 'Income');
  assert.equal(g.sections[0].groups[0].text, '−0.06 SD');
  assert.ok(g.domain.min <= -1 && g.domain.max >= 1.2, 'domain covers whiskers');
});

test('glanceSlide: tiles + first non-caveat takeaway per generator, capped at six', () => {
  const bySubject = { math: { gaps: GAPS, heat: HEAT, ach: ACH, demo: DEMO,
    meta: { subject: 'math', latestYear: 2025, nSchools: 2, nRowsLatest: 700 } } };
  const g = D.glanceSlide({ bySubject, fmt: fmtSD });
  assert.equal(g.kind, 'glance');
  assert.ok(g.tiles.length >= 2);
  const above = g.tiles.find((t) => /above|faster/i.test(t.label));
  assert.match(above.value, /1 \/ 2/);          // Orchard above, North below (math)
  assert.ok(g.takeaways.length >= 1 && g.takeaways.length <= 6);
  assert.ok(g.takeaways.every((t) => !t.caveat));
});
```

- [ ] **Step 2: Run** — expected FAIL.

- [ ] **Step 3: Implement** (append to deck.js; export the four functions):

```js
  const GRADES = [3, 4, 5, 6, 7, 8];
  const cellVal = (c) => (c.rs != null ? c.rs : c.r);

  function heatSlide({ heat, subject, fmt } = {}) {
    if (!heat || !heat.schools || !heat.schools.length) return null;
    const grades = GRADES.filter((g) => heat.schools.some((s) => s.grades && s.grades[g] && s.grades[g].n > 0));
    const rows = heat.schools.map((s) => {
      const cells = grades.map((g) => {
        const c = s.grades && s.grades[g];
        if (!c || !(c.n > 0)) return null;
        const z = cellVal(c);
        return { z, n: c.n, ok: !!c.ok, text: fmt.val(z, { grade: g }) };
      });
      const ovz = s.overall ? cellVal(s.overall) : null;
      return {
        name: label(s), cells,
        overall: ovz == null ? null : { z: ovz, n: s.overall.n, text: fmt.val(ovz) },
      };
    });
    return { kind: 'heat', subject, grades, rows };
  }

  function scatterSlide({ ach, subject, mode = 'shrunk', fmt } = {}) {
    const pts = (ach && ach.school && ach.school.points) || [];
    if (!pts.length) return null;
    const y = (p) => (mode === 'raw' || p.y_shrunk == null) ? p.y_raw : p.y_shrunk;
    const points = pts.map((p) => ({ name: label(p), x: p.x, y: y(p), n: p.n || 1 }));
    let w = 0, xw = 0, yw = 0;
    points.forEach((p) => { w += p.n; xw += p.x * p.n; yw += p.y * p.n; });
    const sorted = [...points].sort((a, b) => b.y - a.y);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    return {
      kind: 'scatter', subject, points,
      xMean: w ? xw / w : 0, yMean: w ? yw / w : 0,
      best: { name: best.name, text: fmt.val(best.y) },
      worst: { name: worst.name, text: fmt.val(worst.y) },
    };
  }

  function groupsSlide({ demo, subject, fmt } = {}) {
    if (!demo) return null;
    const sections = buildDemoSections(demo).map((sec) => ({
      title: sec.title,
      groups: sec.groups.map((g) => ({
        label: g.label, n: g.n, median: g.median, q1: g.q1, q3: g.q3,
        text: fmt.val(g.median),
      })),
    }));
    if (!sections.length) return null;
    const all = sections.flatMap((s) => s.groups);
    const raw = buildDemoSections(demo).flatMap((s) => s.groups);
    const lo = Math.min(...raw.map((g) => g.whiskerLo ?? g.q1));
    const hi = Math.max(...raw.map((g) => g.whiskerHi ?? g.q3));
    return { kind: 'groups', subject, sections, domain: { min: lo, max: hi } };
  }

  // Tiles + the first non-caveat takeaway from each page's generator,
  // scan and gaps first, capped at six bullets.
  function glanceSlide({ bySubject = {}, mode = 'shrunk', fmt } = {}) {
    const subjects = Object.keys(bySubject);
    if (!subjects.length) return null;
    const tiles = [];
    for (const s of subjects) {
      const heat = bySubject[s].heat;
      const ov = (heat && heat.schools || []).map((x) => x.overall).filter(Boolean);
      if (ov.length) {
        tiles.push({
          label: `Schools growing faster than expected · ${s === 'ela' ? 'ELA' : 'Math'}`,
          value: `${ov.filter((o) => cellVal(o) >= 0).length} / ${ov.length}`,
          sub: 'after steadying small schools',
        });
      }
    }
    let widest = null;
    for (const s of subjects) {
      for (const k of GAP_KEYS) {
        const m = bySubject[s].gaps && bySubject[s].gaps[k] && bySubject[s].gaps[k].meta;
        if (m && Number.isFinite(m.districtGap)
            && (!widest || Math.abs(m.districtGap) > Math.abs(widest.gap))) {
          widest = { gap: m.districtGap, label: `${m.groupA} vs. ${m.groupB}`, subject: s };
        }
      }
    }
    if (widest) tiles.push({
      label: 'Largest gap between groups',
      value: fmt.val(widest.gap),
      sub: `${widest.label} · ${widest.subject === 'ela' ? 'ELA' : 'Math'}`,
    });
    const students = subjects.reduce((t, s) =>
      Math.max(t, (bySubject[s].meta && bySubject[s].meta.nRowsLatest) || 0), 0);
    if (students) tiles.push({ label: 'Students included', value: students.toLocaleString(), sub: 'latest year' });

    const takeaways = [];
    const first = (items) => (items || []).find((t) => !t.caveat);
    for (const s of subjects) {
      const b = bySubject[s];
      const picks = [
        first(I.scanTakeaways({ heat: b.heat, fmt })),
        first(I.gapTakeaways({ slices: b.gaps, activeKey: GAP_KEYS.find((k) => b.gaps && b.gaps[k]), mode, fmt })),
        first(I.achievementTakeaways({ ach: b.ach, mode, fmt })),
        first(b.demo ? I.demographicsTakeaways({ data: { groups: buildDemoSections(b.demo).flatMap((x) => x.groups) }, fmt }) : null),
      ].filter(Boolean);
      takeaways.push(...picks);
    }
    return { kind: 'glance', tiles, takeaways: takeaways.slice(0, 6) };
  }
```

- [ ] **Step 4: Run deck tests, then the full suite.** Expected: PASS. (If `glanceSlide`'s takeaway count assertion fails because a generator needs richer fixtures, loosen the fixture, not the production code.)

- [ ] **Step 5: Commit** — `feat(deck): heat, scatter, groups, and glance descriptors`.

---

### Task 5: Statewide descriptors + buildDeck assembly

**Files:**
- Modify: `engine/deck.js`
- Test: `test/deck.test.js`

- [ ] **Step 1: Failing tests** (reuse the PRiME row fixture style from `test/prime.test.js` — copy its `row()` helper):

```js
function primeRow(lea, leaName, school, schoolName, year, level, ela, math, rEla, rMath) {
  return { lea_id: lea, lea_name: leaName, school_id: school, school_name: schoolName,
    school_year: String(year), school_level: level,
    growth_zscore_all_ela: String(ela), growth_zscore_all_math: String(math),
    prime_rank_all_1yr_ela: String(rEla), prime_rank_all_1yr_math: String(rMath) };
}
const PRIME_ROWS = [
  primeRow('016090', 'Jackson R-II', '4015', 'Orchard Drive Elementary', 2025, 'Elementary', 0.07, 0.17, 294, 117),
  primeRow('016090', 'Jackson R-II', '4015', 'Orchard Drive Elementary', 2024, 'Elementary', 0.07, 0.22, 284, 59),
  primeRow('999999', 'Elsewhere', '0001', 'Other School', 2025, 'Elementary', -0.1, -0.2, 800, 900),
];

test('statewideSlides: histogram + trend descriptors when the district resolves', () => {
  const slides = D.statewideSlides({ prime: { rows: PRIME_ROWS, lea: '016090' } });
  assert.equal(slides.length, 2);
  const hist = slides.find((s) => s.kind === 'stateHist');
  assert.equal(hist.year, '2025');
  assert.equal(hist.levels[0].level, 'Elementary');
  assert.ok(hist.levels[0].subjects.ela.bins.length > 0);
  assert.equal(hist.levels[0].subjects.ela.yours[0].name, 'Orchard Drive Elementary');
  const trend = slides.find((s) => s.kind === 'stateTrend');
  assert.deepEqual(trend.series.math.map((p) => p.year), ['2024', '2025']);
});

test('statewideSlides: empty when no district', () => {
  assert.deepEqual(D.statewideSlides({ prime: null }), []);
});

test('buildDeck: full assembly, order, and edge cases', () => {
  const bySubject = { math: { gaps: GAPS, heat: HEAT, ach: ACH, demo: DEMO,
    meta: { subject: 'math', latestYear: 2025, nSchools: 2, nRowsLatest: 700,
            districtName: 'Jackson R-II', source: 'uploaded' } } };
  const deck = D.buildDeck({ bySubject, prime: { rows: PRIME_ROWS, lea: '016090' },
                             unit: 'z', unitLabel: 'SD (standard scale)', fmt: fmtSD, today: 'June 12, 2026' });
  const kinds = deck.slides.map((s) => s.kind);
  assert.deepEqual(kinds, ['cover', 'intro', 'glance', 'heat', 'scatter', 'groups',
    'gapsOverview', 'stateHist', 'stateTrend', 'cautions', 'divider', 'forest']);
  assert.equal(deck.meta.district, 'Jackson R-II');
  assert.equal(deck.meta.sample, false);
  assert.equal(deck.slides[0].district, 'Jackson R-II');
  // numbering for the carousel/footers
  assert.equal(deck.slides[0].n, 1);
  assert.equal(deck.slides[deck.slides.length - 1].n, deck.slides.length);
});

test('buildDeck: sample data, no prime, no reliable gaps → minimal deck', () => {
  const gapsNoSignal = { frl: gapSlice('frl', 'FRL', 'non-FRL', -0.05, [-0.15, 0.05],
    [SCH('4001', null, -0.05, -0.15, 0.05)]) };
  const bySubject = { math: { gaps: gapsNoSignal, heat: HEAT, ach: ACH, demo: DEMO,
    meta: { subject: 'math', latestYear: 2025, nSchools: 2, source: 'demo' } } };
  const deck = D.buildDeck({ bySubject, prime: null, unit: 'z', unitLabel: 'SD', fmt: fmtSD, today: 'x' });
  const kinds = deck.slides.map((s) => s.kind);
  assert.ok(!kinds.includes('stateHist') && !kinds.includes('forest') && !kinds.includes('divider'));
  assert.equal(deck.meta.sample, true);
  assert.equal(deck.slides[0].district, 'Sample district');
});
```

- [ ] **Step 2: Run** — expected FAIL.

- [ ] **Step 3: Implement** (append; export `statewideSlides, buildDeck`):

```js
  const LEVEL_ORDER = ['Elementary', 'Middle', 'EleMiddle', 'Other'];
  const LEVEL_HEADING = { Elementary: 'Elementary schools', Middle: 'Middle schools',
    EleMiddle: 'Elementary–middle schools', Other: 'Other schools' };
  const SUBJ_WORD = { ela: 'ELA', math: 'Math' };

  // Statewide section: latest year with district data; per level present that
  // year, per subject: histogram bins + the district's named schools; plus a
  // growth-over-time district-mean series per subject.
  function statewideSlides({ prime } = {}) {
    if (!prime || !prime.rows || !prime.rows.length || !prime.lea || !P) return [];
    const report = P.districtReport(prime.rows, prime.lea);
    if (!report) return [];
    const year = report.years[report.years.length - 1];
    const levels = LEVEL_ORDER.filter((lv) =>
      report.schools.some((s) => ['ela', 'math'].some((sub) =>
        (s.series[sub] || []).some((p) => p.year === year && p.level === lv))));
    const histLevels = levels.map((lv) => {
      const subjects = {};
      for (const sub of ['ela', 'math']) {
        const h = P.histogram(prime.rows, { year, level: lv, subject: sub, binWidth: 0.05, lea: prime.lea });
        subjects[sub] = {
          poolN: h.poolN,
          bins: h.bins.map((b) => ({ x0: b.x0, x1: b.x1, count: b.count, district: b.district })),
          yours: h.schools.map((s) => ({ name: s.name, z: s.z, rank: s.rank })),
        };
      }
      return { level: lv, heading: LEVEL_HEADING[lv], subjects };
    });
    const series = {};
    for (const sub of ['ela', 'math']) series[sub] = P.districtMeanSeries(report, sub);
    return [
      { kind: 'stateHist', district: report.name, year, levels: histLevels },
      { kind: 'stateTrend', district: report.name, years: report.years, series },
    ];
  }

  function buildDeck({ bySubject = {}, prime = null, unit = 'z', unitLabel = 'SD (standard scale)',
                       mode = 'shrunk', fmt, today = '' } = {}) {
    const subjects = ['math', 'ela'].filter((s) => bySubject[s]);
    const metas = subjects.map((s) => bySubject[s].meta).filter(Boolean);
    const sample = !metas.some((m) => m && m.source === 'uploaded');
    const district = (metas.map((m) => m && m.districtName).find(Boolean))
      || (sample ? 'Sample district' : 'Your district');
    const year = metas.map((m) => m && m.latestYear).find(Boolean) || '';

    const slides = [];
    slides.push({ kind: 'cover', district, year, sample, today,
                  subjects: subjects.map((s) => SUBJ_WORD[s]) });
    slides.push({ kind: 'intro', unitLabel, bullets: [
      'Every number compares growth with what was expected: 0 means a typical year of growth, positive means faster, negative means slower.',
      'Small schools and groups are steadied toward the district average, so a handful of students can’t swing a result.',
      `Values are shown in ${unitLabel}.`,
    ]});
    const glance = glanceSlide({ bySubject, mode, fmt });
    if (glance) slides.push(glance);
    for (const s of subjects) {
      const b = bySubject[s];
      for (const sl of [heatSlide({ heat: b.heat, subject: s, fmt }),
                        scatterSlide({ ach: b.ach, subject: s, mode, fmt }),
                        groupsSlide({ demo: b.demo, subject: s, fmt })]) {
        if (sl) slides.push(sl);
      }
      const ov = gapsOverview({ gaps: b.gaps, mode, fmt });
      if (ov.rows.length) slides.push({ ...ov, subject: s });
    }
    slides.push(...statewideSlides({ prime }));
    slides.push({ kind: 'cautions', unitLabel, bullets: [
      'Numbers are nudged toward the district average (shrinkage), so a few students can’t swing a school.',
      'Groups with fewer than 10 students are flagged, not trusted.',
      'These figures describe what’s happening, not why — use them to ask sharper questions, never to evaluate individual teachers.',
      'All analysis ran privately in the browser; no student data left the device.',
    ]});
    const forests = subjects.flatMap((s) =>
      forestSlides({ gaps: bySubject[s].gaps, subject: s, mode, fmt }));
    if (forests.length) {
      slides.push({ kind: 'divider', title: 'Appendix — school-by-school detail',
        sub: 'One slide per group comparison with a clear district-wide signal.' });
      slides.push(...forests);
    }
    slides.forEach((s, i) => { s.n = i + 1; });
    return { slides, meta: { district, year, sample, subjects: subjects.map((s) => SUBJ_WORD[s]), unitLabel } };
  }
```

Update the module's return to:

```js
  return { buildDemoSections, label, gapsOverview, forestSlides,
           heatSlide, scatterSlide, groupsSlide, glanceSlide,
           statewideSlides, buildDeck };
```

- [ ] **Step 4: Run the full suite.** Expected: PASS.

- [ ] **Step 5: Commit** — `feat(deck): statewide descriptors + full deck assembly`.

---

### Task 6: export.jsx — PPTX renderer (rewrite buildPPTX)

**Files:**
- Rewrite: `export.jsx` (keep the file; replace `slides` construction, `SlideCard`/`SlideBody`, `buildPPTX`, `addHeader`, `addGapTable`, `scanHotspots` wholesale)

This task replaces the PPTX half; Task 7 replaces the page/preview half. Until Task 7 lands the page may not compile — do Tasks 6+7 as one commit if needed, but keep the code organized as below.

- [ ] **Step 1: Shared chrome + palette.** At the top of the new export.jsx keep the license header and write:

```jsx
// Export page — builds the full GrowthLens deck (PPTX) and previews it in a
// carousel. ALL content comes from the deck model (engine/deck.js); this file
// only renders: one PPTX layout function and one preview component per slide
// kind. System fonts only (Calibri / Georgia / Consolas) so the file looks
// the same on any machine.

const XP = {
  blue: '003DA5', blueDark: '002A75', gold: '9A7611', goldLight: 'C8A84A',
  ink: '1A1B1F', ink2: '3F4147', mute: '6F727A', rule: 'D9D9DD', rule2: 'EDEDEF',
  neg: '7C3A12', paper: 'FDFCFA',
};
const F_HEAD = 'Calibri', F_BODY = 'Calibri', F_SERIF = 'Georgia', F_MONO = 'Consolas';
const PAGE_W = 13.33, PAGE_H = 7.5;

// window.divColor returns "rgb(r,g,b)" — PptxGenJS wants bare hex.
function rgbToHex(rgb) {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb);
  if (!m) return 'FFFFFF';
  return [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0').toUpperCase()).join('');
}

// Standard slide chrome: eyebrow + title + gold rule + footer.
function chrome(slide, deck, d, eyebrow, title) {
  slide.addText(eyebrow.toUpperCase(), { x: 0.6, y: 0.32, w: 9, h: 0.3, fontFace: F_HEAD, fontSize: 11, color: XP.mute, bold: true, charSpacing: 3 });
  slide.addText(title, { x: 0.6, y: 0.62, w: 12.1, h: 0.55, fontFace: F_SERIF, fontSize: 24, color: XP.ink });
  slide.addShape('rect', { x: 0.6, y: 1.28, w: 0.55, h: 0.035, fill: { color: XP.gold }, line: { type: 'none' } });
  const tag = deck.meta.sample ? 'SAMPLE DATA · ' : '';
  slide.addText(`${tag}${deck.meta.district} · ${deck.meta.year} · GrowthLens · ${d.n}/${deck.slides.length}`,
    { x: 0.6, y: PAGE_H - 0.42, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 9, color: XP.mute, charSpacing: 2 });
}
const subjWord = (s) => (s === 'ela' ? 'ELA' : 'Math');
```

- [ ] **Step 2: Layout functions, one per kind.** Complete code:

```jsx
function layoutCover(pres, slide, deck, d) {
  slide.background = { color: XP.blueDark };
  slide.addText('GrowthLens', { x: 0.9, y: 1.5, w: 8, h: 0.8, fontFace: F_SERIF, fontSize: 40, color: 'FFFFFF' });
  slide.addShape('rect', { x: 0.95, y: 2.45, w: 1.0, h: 0.04, fill: { color: XP.goldLight }, line: { type: 'none' } });
  slide.addText(d.district, { x: 0.9, y: 2.8, w: 11.5, h: 1.0, fontFace: F_HEAD, fontSize: 32, bold: true, color: 'FFFFFF' });
  slide.addText(`Growth report · ${d.year} · ${d.subjects.join(' + ')}`,
    { x: 0.9, y: 3.8, w: 11, h: 0.5, fontFace: F_HEAD, fontSize: 16, color: XP.goldLight });
  if (d.sample) slide.addText('SAMPLE DATA — for demonstration only',
    { x: 0.9, y: 4.5, w: 8, h: 0.4, fontFace: F_HEAD, fontSize: 13, bold: true, color: 'FFD27D' });
  slide.addText(`PRiME Center · Saint Louis University · ${d.today}`,
    { x: 0.9, y: PAGE_H - 0.7, w: 11, h: 0.35, fontFace: F_HEAD, fontSize: 10, color: 'B9C4DE', charSpacing: 2 });
  slide.addNotes('Title slide. Set the scene: this is the district’s growth report. Anyone who wants the technical detail can read the methods note linked from the app.');
}

function layoutBullets(slide, bullets, x, y, w, opts = {}) {
  slide.addText(bullets.map((b) => ({
    text: typeof b === 'string' ? b : b.text,
    options: { bullet: { code: '2022', indent: 12 }, breakLine: true, paraSpaceAfter: 8 },
  })), { x, y, w, h: 4.6, fontFace: F_BODY, fontSize: opts.fontSize || 15, color: XP.ink2, valign: 'top', lineSpacingMultiple: 1.15 });
}

// **bold** markers from the insight generators → PPTX runs.
function mdRuns(text, base = {}) {
  return text.split('**').map((seg, i) => ({
    text: seg, options: { ...base, bold: i % 2 === 1 },
  })).filter((r) => r.text !== '');
}

function layoutIntro(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Before the numbers', 'How to read this deck');
  layoutBullets(slide, d.bullets, 0.8, 1.9, 11.6, { fontSize: 17 });
  slide.addNotes('Three ground rules before any figure: zero means a typical year of growth; small groups are steadied; the unit in use. Read them aloud — they prevent the most common misreadings.');
}

function layoutGlance(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Summary', 'Your district at a glance');
  const tileW = Math.min(3.9, 12.1 / Math.max(1, d.tiles.length) - 0.2);
  d.tiles.forEach((t, i) => {
    const x = 0.6 + i * (tileW + 0.25);
    slide.addShape('rect', { x, y: 1.7, w: tileW, h: 1.5, fill: { color: XP.paper }, line: { color: XP.rule2, width: 1 } });
    slide.addText(t.label.toUpperCase(), { x: x + 0.15, y: 1.8, w: tileW - 0.3, h: 0.5, fontFace: F_HEAD, fontSize: 9, bold: true, color: XP.mute, charSpacing: 1.5 });
    slide.addText(t.value, { x: x + 0.15, y: 2.25, w: tileW - 0.3, h: 0.6, fontFace: F_MONO, fontSize: 26, bold: true, color: XP.ink });
    slide.addText(t.sub, { x: x + 0.15, y: 2.85, w: tileW - 0.3, h: 0.3, fontFace: F_HEAD, fontSize: 9.5, color: XP.mute });
  });
  const rows = d.takeaways.flatMap((t) => mdRuns(t.text, { fontSize: 13.5, color: XP.ink2 })
    .map((r, i, arr) => ({ ...r, options: { ...r.options, bullet: i === 0 ? { code: '25AA', indent: 14 } : undefined, breakLine: i === arr.length - 1, paraSpaceAfter: 8 } })));
  slide.addText(rows, { x: 0.8, y: 3.6, w: 11.7, h: 3.3, fontFace: F_BODY, valign: 'top', lineSpacingMultiple: 1.15 });
  slide.addNotes('The whole story on one slide. Each bullet is generated from the data behind a later section; the sections carry the detail.');
}

function layoutHeat(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Growth by school & grade');
  const head = [{ text: 'School', options: { bold: true, color: XP.mute, fontSize: 10, align: 'left' } },
    ...d.grades.map((g) => ({ text: `Gr ${g}`, options: { bold: true, color: XP.mute, fontSize: 10, align: 'center' } })),
    { text: 'Overall', options: { bold: true, color: XP.mute, fontSize: 10, align: 'center' } }];
  const body = d.rows.map((r) => [
    { text: r.name, options: { fontFace: F_BODY, fontSize: 11, color: XP.ink, align: 'left' } },
    ...r.cells.map((c) => {
      if (!c) return { text: '', options: { fill: { color: 'FFFFFF' } } };
      if (!c.ok) return { text: 'too few', options: { fontSize: 8, color: XP.mute, align: 'center', fill: { color: 'F4F4F6' } } };
      const fill = rgbToHex(window.divColor(c.z));
      const ink = window.heatCellInk(c.z) === '#fff' ? 'FFFFFF' : XP.ink;
      return { text: c.text, options: { fontFace: F_MONO, fontSize: 10, color: ink, align: 'center', fill: { color: fill } } };
    }),
    r.overall
      ? { text: r.overall.text, options: { fontFace: F_MONO, fontSize: 10, bold: true, align: 'center',
          fill: { color: rgbToHex(window.divColor(r.overall.z)) },
          color: window.heatCellInk(r.overall.z) === '#fff' ? 'FFFFFF' : XP.ink } }
      : { text: '—', options: { align: 'center', color: XP.mute } },
  ]);
  const rowH = Math.min(0.42, 4.9 / (body.length + 1));
  slide.addTable([head, ...body], { x: 0.6, y: 1.7, w: 12.1, rowH,
    colW: [3.4, ...d.grades.map(() => (12.1 - 3.4 - 1.3) / d.grades.length), 1.3],
    border: { type: 'solid', color: 'FFFFFF', pt: 1 }, valign: 'middle', fontFace: F_BODY });
  slide.addText('Blue = growing faster than expected · rust = slower · numbers steadied toward the district average',
    { x: 0.6, y: PAGE_H - 0.85, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 10, color: XP.mute });
  slide.addNotes('Scan rows for schools that are consistently strong or soft, and columns for grades where the whole district leans one way.');
}

function layoutScatter(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Scores vs. growth, school by school');
  slide.addChart(pres.ChartType.scatter, [
    { name: 'Score', values: d.points.map((p) => p.x) },
    { name: 'Schools', values: d.points.map((p) => p.y) },
  ], {
    x: 0.6, y: 1.6, w: 8.2, h: 5.1,
    lineSize: 0, showLegend: false,
    chartColors: [XP.blue],
    catAxisTitle: 'This year’s score (standard scale)', showCatAxisTitle: true, catAxisTitleFontSize: 10,
    valAxisTitle: 'Growth vs. expected', showValAxisTitle: true, valAxisTitleFontSize: 10,
    catAxisLineShow: true, valAxisLineShow: true,
    lineDataSymbolSize: 9,
  });
  slide.addText([
    { text: 'Strongest growth\n', options: { fontSize: 10, bold: true, color: XP.mute, charSpacing: 1.5 } },
    { text: `${d.best.name}\n`, options: { fontSize: 13, bold: true, color: XP.ink } },
    { text: `${d.best.text}\n\n`, options: { fontFace: F_MONO, fontSize: 12, color: XP.blue } },
    { text: 'Slowest growth\n', options: { fontSize: 10, bold: true, color: XP.mute, charSpacing: 1.5 } },
    { text: `${d.worst.name}\n`, options: { fontSize: 13, bold: true, color: XP.ink } },
    { text: d.worst.text, options: { fontFace: F_MONO, fontSize: 12, color: XP.neg } },
  ], { x: 9.1, y: 1.9, w: 3.5, h: 3.5, fontFace: F_BODY, valign: 'top' });
  slide.addNotes('Each dot is a school: right = higher scores this year, up = faster growth than expected. The two named schools anchor the range.');
}

function layoutGroups(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Growth by student group');
  const x0 = 4.0, plotW = 7.6, span = d.domain.max - d.domain.min || 1;
  const xOf = (v) => x0 + ((v - d.domain.min) / span) * plotW;
  let y = 1.8;
  const zeroX = xOf(0);
  for (const sec of d.sections) {
    slide.addText(sec.title.toUpperCase(), { x: 0.6, y, w: 3, h: 0.3, fontFace: F_HEAD, fontSize: 10, bold: true, color: XP.mute, charSpacing: 2 });
    y += 0.34;
    for (const g of sec.groups) {
      slide.addText(`${g.label}  ·  n=${g.n.toLocaleString()}`, { x: 0.6, y: y + 0.02, w: 3.2, h: 0.3, fontFace: F_BODY, fontSize: 11, color: XP.ink });
      const color = g.median >= 0 ? XP.blue : XP.neg;
      slide.addShape('rect', { x: xOf(g.q1), y: y + 0.05, w: Math.max(0.05, xOf(g.q3) - xOf(g.q1)), h: 0.22,
        fill: { color, transparency: 82 }, line: { color, width: 1 } });
      slide.addShape('diamond', { x: xOf(g.median) - 0.07, y: y + 0.02, w: 0.14, h: 0.28,
        fill: { color: 'FFFFFF' }, line: { color, width: 1.25 } });
      slide.addText(g.text, { x: 12.0, y: y - 0.02, w: 0.95, h: 0.3, fontFace: F_MONO, fontSize: 10.5, color: XP.ink2, align: 'right' });
      y += 0.42;
    }
    y += 0.12;
  }
  slide.addShape('line', { x: zeroX, y: 1.75, w: 0, h: y - 1.8, line: { color: XP.ink2, width: 1, dashType: 'dash' } });
  slide.addText('typical year of growth', { x: zeroX - 0.9, y: y + 0.05, w: 1.8, h: 0.25, fontFace: F_HEAD, fontSize: 9, color: XP.ink2, align: 'center' });
  slide.addText('Box = the middle half of that group’s students · diamond = the typical student',
    { x: 0.6, y: PAGE_H - 0.85, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 10, color: XP.mute });
  slide.addNotes('Same vocabulary as the app’s box plots: where the middle of each group sits, and how much groups overlap.');
}

function layoutGapsOverview(pres, slide, deck, d) {
  chrome(slide, deck, d, subjWord(d.subject), 'Gaps between student groups');
  const mk = (t, o = {}) => ({ text: t, options: { fontSize: 11, fontFace: F_BODY, color: XP.ink2, align: 'left', ...o } });
  const head = ['Comparison', 'District-wide gap', 'Likely range', 'Schools leaning that way', 'Schools with enough students']
    .map((t) => mk(t, { bold: true, fontSize: 9.5, color: XP.mute }));
  const body = d.rows.map((r) => [
    mk(r.label, { bold: true, color: XP.ink }),
    mk(r.gapText, { fontFace: F_MONO, color: r.reliable ? XP.ink : XP.mute }),
    mk(r.rangeText, { fontFace: F_MONO, color: XP.mute, fontSize: 10 }),
    mk(r.leaning), mk(r.coverage),
  ]);
  slide.addTable([head, ...body], { x: 0.6, y: 1.8, w: 12.1, rowH: 0.5,
    colW: [3.4, 2.2, 2.7, 2.2, 1.6],
    border: { type: 'solid', color: XP.rule2, pt: 0.75 }, valign: 'middle' });
  if (d.skippedNote) slide.addText(d.skippedNote,
    { x: 0.6, y: 1.85 + 0.5 * (d.rows.length + 1) + 0.15, w: 12.1, h: 0.6, fontFace: F_BODY, italic: true, fontSize: 11, color: XP.mute });
  slide.addNotes('Negative = the first-named group grew less. A range crossing zero means the difference could plausibly be nothing — those comparisons get no appendix slide.');
}
```

- [ ] **Step 3: Statewide, cautions, divider, forest layouts.**

```jsx
function layoutStateHist(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Statewide', `Where your schools land among all Missouri schools · ${d.year}`);
  const blocks = d.levels.flatMap((lv) => (['ela', 'math']).map((sub) => ({ lv, sub })))
    .filter((b) => b.lv.subjects[b.sub].poolN > 0);
  const w = Math.min(5.9, 12.1 / Math.min(2, blocks.length) - 0.2);
  blocks.slice(0, 4).forEach((b, i) => {
    const x = 0.6 + (i % 2) * (w + 0.35), y = 1.55 + Math.floor(i / 2) * 2.7;
    const s = b.lv.subjects[b.sub];
    slide.addText(`${b.lv.heading} · ${subjWord(b.sub)} · ${s.poolN.toLocaleString()} statewide`,
      { x, y, w, h: 0.28, fontFace: F_HEAD, fontSize: 10.5, bold: true, color: XP.ink2 });
    slide.addChart(pres.ChartType.bar, [
      { name: 'Missouri schools', labels: s.bins.map((c) => c.x0.toFixed(2)), values: s.bins.map((c) => c.count - c.district) },
      { name: 'Your schools', labels: s.bins.map((c) => c.x0.toFixed(2)), values: s.bins.map((c) => c.district) },
    ], { x, y: y + 0.3, w, h: 2.1, barDir: 'col', barGrouping: 'stacked',
         chartColors: ['E4E5E9', XP.gold], showLegend: false, catAxisHidden: false,
         catAxisLabelFontSize: 7, valAxisHidden: true, barGapWidthPct: 8 });
  });
  const names = d.levels.flatMap((lv) => ['ela', 'math'].flatMap((sub) =>
    lv.subjects[sub].yours.map((s) => `${s.name} (${subjWord(sub)} ${s.z >= 0 ? '+' : '−'}${Math.abs(s.z).toFixed(2)})`)));
  slide.addNotes('Gold = this district’s schools, against every Missouri school of the same type. Zero is a typical year of growth. Yours: ' + names.join('; '));
}

function layoutStateTrend(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Statewide', 'Growth over time');
  const years = d.years;
  (['ela', 'math']).forEach((sub, i) => {
    const pts = d.series[sub];
    if (!pts || !pts.length) return;
    const vals = years.map((y) => { const p = pts.find((q) => q.year === y); return p ? p.z : null; });
    slide.addText(subjWord(sub), { x: 0.6 + i * 6.2, y: 1.6, w: 3, h: 0.3, fontFace: F_HEAD, fontSize: 12, bold: true, color: XP.ink });
    slide.addChart(pres.ChartType.line, [{ name: 'District average', labels: years, values: vals }],
      { x: 0.6 + i * 6.2, y: 1.95, w: 5.9, h: 4.4, chartColors: [XP.blue], lineSize: 2.5,
        lineDataSymbol: 'circle', lineDataSymbolSize: 7, showLegend: false,
        valAxisLabelFontSize: 9, catAxisLabelFontSize: 9 });
  });
  slide.addText('0 = a typical year of growth statewide · the 2020 gap is the year state testing was cancelled',
    { x: 0.6, y: PAGE_H - 0.85, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 10, color: XP.mute });
  slide.addNotes('District average of statewide growth scores per year. The missing 2020 point is the cancelled test year, not missing district data.');
}

function layoutCautions(pres, slide, deck, d) {
  chrome(slide, deck, d, 'Read with care', 'How to read this deck — a few cautions');
  layoutBullets(slide, d.bullets, 0.8, 1.9, 11.6, { fontSize: 15 });
  slide.addNotes('Walk these four points briefly. The full methods note is linked from the app.');
}

function layoutDivider(pres, slide, deck, d) {
  slide.background = { color: XP.paper };
  slide.addText(d.title, { x: 0.9, y: 2.9, w: 11.5, h: 0.8, fontFace: F_SERIF, fontSize: 30, color: XP.ink });
  slide.addText(d.sub, { x: 0.9, y: 3.8, w: 11, h: 0.5, fontFace: F_HEAD, fontSize: 13, color: XP.mute });
  slide.addShape('rect', { x: 0.95, y: 2.75, w: 0.8, h: 0.04, fill: { color: XP.gold }, line: { type: 'none' } });
}

function layoutForest(pres, slide, deck, d) {
  chrome(slide, deck, d, `${subjWord(d.subject)} · appendix`, d.title);
  const x0 = 4.4, plotW = 7.2, span = d.axis.max - d.axis.min || 1;
  const xOf = (v) => x0 + ((v - d.axis.min) / span) * plotW;
  const rows = d.rows.slice(0, 11);   // one slide's worth; tall districts trade detail for legibility
  const rowH = Math.min(0.42, 4.4 / Math.max(1, rows.length));
  // zero + district reference lines
  slide.addShape('line', { x: xOf(0), y: 1.6, w: 0, h: rows.length * rowH + 0.3, line: { color: XP.ink2, width: 1 } });
  slide.addShape('line', { x: xOf(d.district.gap), y: 1.6, w: 0, h: rows.length * rowH + 0.3, line: { color: XP.gold, width: 1.25, dashType: 'dash' } });
  rows.forEach((r, i) => {
    const y = 1.75 + i * rowH;
    const color = r.gap >= 0 ? XP.blue : XP.neg;
    slide.addText(r.name, { x: 0.6, y: y - 0.05, w: 3.6, h: 0.3, fontFace: F_BODY, fontSize: 10.5, color: XP.ink, align: 'left' });
    slide.addShape('line', { x: xOf(r.ci[0]), y: y + 0.09, w: xOf(r.ci[1]) - xOf(r.ci[0]), h: 0, line: { color, width: 2 } });
    slide.addShape('diamond', { x: xOf(r.gap) - 0.055, y: y + 0.01, w: 0.11, h: 0.18, fill: { color }, line: { color: 'FFFFFF', width: 0.75 } });
    slide.addText(r.text, { x: 11.8, y: y - 0.05, w: 1.1, h: 0.3, fontFace: F_MONO, fontSize: 9.5, color: XP.ink2, align: 'right' });
  });
  let footY = 1.75 + rows.length * rowH + 0.25;
  slide.addText(`District-wide: ${d.district.text} (gold dashed line) · bar = the range each school’s true gap most likely falls in`,
    { x: 0.6, y: footY, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 10, color: XP.mute });
  if (d.excluded.length) {
    footY += 0.3;
    slide.addText('Not drawn: ' + d.excluded.map((e) => `${e.name} (${e.reason})`).join(' · '),
      { x: 0.6, y: footY, w: 12.1, h: 0.5, fontFace: F_HEAD, fontSize: 9.5, italic: true, color: XP.mute });
  }
  if (d.rows.length > rows.length) slide.addText(`+ ${d.rows.length - rows.length} more schools — see the app for the full list`,
    { x: 0.6, y: footY + 0.3, w: 12.1, h: 0.3, fontFace: F_HEAD, fontSize: 9.5, italic: true, color: XP.mute });
  slide.addNotes(`${d.groupA} minus ${d.groupB}: negative bars mean ${d.groupA} students grew less than their ${d.groupB} schoolmates at that school.`);
}
```

- [ ] **Step 4: The dispatcher.**

```jsx
const PPTX_LAYOUTS = {
  cover: layoutCover, intro: layoutIntro, glance: layoutGlance, heat: layoutHeat,
  scatter: layoutScatter, groups: layoutGroups, gapsOverview: layoutGapsOverview,
  stateHist: layoutStateHist, stateTrend: layoutStateTrend,
  cautions: layoutCautions, divider: layoutDivider, forest: layoutForest,
};

async function buildPPTX(deck) {
  if (typeof window.PptxGenJS !== 'function') throw new Error('PptxGenJS failed to load');
  const pres = new window.PptxGenJS();
  pres.defineLayout({ name: 'GL_WIDE', width: PAGE_W, height: PAGE_H });
  pres.layout = 'GL_WIDE';
  pres.author = 'GrowthLens · PRiME Center, Saint Louis University';
  pres.title = `GrowthLens growth report · ${deck.meta.district}`;
  for (const d of deck.slides) {
    const slide = pres.addSlide();
    (PPTX_LAYOUTS[d.kind] || (() => {}))(pres, slide, deck, d);
  }
  const dist = deck.meta.sample ? 'sample' : deck.meta.district.replace(/[^\w]+/g, '-');
  await pres.writeFile({ fileName: `GrowthLens-${dist}-${new Date().toISOString().slice(0, 10)}.pptx` });
}
```

- [ ] **Step 5:** Continue straight into Task 7 (the page needs its other half before the app compiles).

---

### Task 7: export.jsx — carousel preview + page shell

**Files:**
- Modify: `export.jsx` (same rewrite, second half)

- [ ] **Step 1: Deck assembly in the page.** The page builds the deck model on render (and re-fetches prime once):

```jsx
function ExportPage({ ctx }) {
  const [busy, setBusy] = React.useState(false);
  const [primeRows, setPrimeRows] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    if (window.loadPrimeDb) window.loadPrimeDb().then(
      (rows) => { if (alive) setPrimeRows(rows); }, () => {});
    return () => { alive = false; };
  }, []);

  const bySubject = window.GLStore ? window.GLStore.allSubjectsData() : {};
  const unit = ctx.unit || 'z';
  const unitLabel = unit === 'weeks' ? 'weeks of learning' : 'SD (standard scale)';
  const fmt = { val: (z, opts) => window.fmtVal(z, unit, opts) };   // forest-shared helper: SD/weeks per global unit
  // District for the statewide section: an upload's code, else the sample default.
  const metas = Object.values(bySubject).map((b) => b.meta).filter(Boolean);
  const anyUploaded = metas.some((m) => m.source === 'uploaded');
  const lea = metas.map((m) => m.districtCode).find(Boolean) || (!anyUploaded ? '016090' : null);
  const prime = primeRows && lea ? { rows: primeRows, lea } : null;
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  const deck = window.GLDeck.buildDeck({ bySubject, prime, unit, unitLabel, mode: ctx.estimate || 'shrunk', fmt, today });

  const exportPPTX = async () => {
    if (busy) return;
    setBusy(true);
    try { await buildPPTX(deck); }
    catch (err) {
      console.error('PPTX export failed:', err);
      alert('Something went wrong while building the deck. Please try again.');
    } finally { setBusy(false); }
  };
  // …render below…
}
```

Note `fmt.val` reuses `window.fmtVal` (already spells "weeks"/"week" and handles SD signs). The deck model is rebuilt per render — cheap (pure functions over in-memory shapes).

- [ ] **Step 2: Carousel component.** Single slide visible, prev/next, counter, arrow keys:

```jsx
function SlideCarousel({ deck }) {
  const [idx, setIdx] = React.useState(0);
  const clamp = (i) => Math.max(0, Math.min(deck.slides.length - 1, i));
  const go = (delta) => setIdx((i) => clamp(i + delta));
  React.useEffect(() => { setIdx((i) => clamp(i)); }, [deck.slides.length]);
  const d = deck.slides[idx];
  return (
    <div onKeyDown={(e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    }} tabIndex={0} className="gl-focus" role="group"
       aria-label={`Deck preview, slide ${idx + 1} of ${deck.slides.length}`}
       style={{ outline: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <CarouselArrow dir={-1} onClick={() => go(-1)} disabled={idx === 0} />
        <div style={{ flex: 1, aspectRatio: '16 / 9', background: '#FDFCFA', borderRadius: 8,
                      border: `1px solid ${SLU.rule2}`, overflow: 'hidden', position: 'relative',
                      boxShadow: '0 2px 10px rgba(15,23,42,0.08)' }}>
          <PreviewSlide d={d} deck={deck} />
        </div>
        <CarouselArrow dir={1} onClick={() => go(1)} disabled={idx === deck.slides.length - 1} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: SLU.mute, fontFamily: MONO }}>
        Slide {idx + 1} of {deck.slides.length} · {previewTitle(d)}
      </div>
    </div>
  );
}

function CarouselArrow({ dir, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
            aria-label={dir < 0 ? 'Previous slide' : 'Next slide'}
            style={{ width: 38, height: 38, borderRadius: 999, border: `1px solid ${SLU.rule}`,
                     background: '#fff', color: disabled ? SLU.rule : SLU.ink2, fontSize: 16,
                     cursor: disabled ? 'default' : 'pointer', flex: '0 0 auto' }}>
      {dir < 0 ? '←' : '→'}
    </button>
  );
}
```

- [ ] **Step 3: Preview renderers.** One compact HTML approximation per kind, reading the SAME descriptor. Keep each under ~30 lines; the goal is recognizable content, not pixel fidelity. Complete set (titles via a shared helper):

```jsx
function previewTitle(d) {
  return ({ cover: 'Cover', intro: 'How to read this deck', glance: 'Your district at a glance',
    heat: `Growth by school & grade · ${subjWord(d.subject || '')}`,
    scatter: `Scores vs. growth · ${subjWord(d.subject || '')}`,
    groups: `Growth by student group · ${subjWord(d.subject || '')}`,
    gapsOverview: `Gaps between student groups · ${subjWord(d.subject || '')}`,
    stateHist: 'Statewide comparison', stateTrend: 'Statewide growth over time',
    cautions: 'Cautions', divider: 'Appendix', forest: d.title || 'School-by-school detail' })[d.kind] || '';
}

function PvChrome({ d, deck, eyebrow, children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '4.5% 5%', fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: LABEL, fontSize: 8.5, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: SLU.mute }}>{eyebrow}</div>
      <div style={{ fontFamily: SERIF, fontSize: 15, color: SLU.ink, margin: '2px 0 4px' }}>{previewTitle(d)}</div>
      <div style={{ width: 26, height: 2, background: SLU.gold, marginBottom: 8 }} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
      <div style={{ fontSize: 7.5, color: SLU.mute, letterSpacing: 1 }}>
        {deck.meta.sample ? 'SAMPLE DATA · ' : ''}{deck.meta.district} · {deck.meta.year} · {d.n}/{deck.slides.length}
      </div>
    </div>
  );
}
```

Then `PreviewSlide` dispatches by kind. Implement these renderers (full code in the file; representative bodies):
- `cover` — dark navy block, GrowthLens wordmark, district name, subjects, SAMPLE banner.
- `intro` / `cautions` — bullet list of `d.bullets`.
- `glance` — tile row (label/value/sub) + takeaway bullets (render `**` with `<strong>` exactly like `KeyTakeaways` does — reuse its split('**') pattern).
- `heat` — an HTML table, cell backgrounds from `window.divColor(c.z)`, "too few" cells gray, school names left.
- `scatter` — small inline SVG: dots at scaled x/y, crosshair at means, side panel with best/worst names.
- `groups` — rows with a scaled bar (q1→q3) + diamond at median (inline SVG or positioned divs), value at right.
- `gapsOverview` — compact HTML table of `d.rows` + skipped note.
- `stateHist` — per level×subject mini bar strip (divs with heights ∝ counts, gold segment for district).
- `stateTrend` — inline SVG polyline per subject.
- `divider` — big serif title on paper background.
- `forest` — rows: name, scaled CI line + diamond (positioned divs), value right; excluded list line.

- [ ] **Step 4: Page shell** (replace the old preview grid):

```jsx
  return (
    <>
      <BriefHeader eyebrow="Export" slice={`${deck.meta.subjects.join(' + ')} · ${deck.meta.year}`}
        title="Download a board-ready deck"
        blurb={'The full picture in one editable PowerPoint: every school and grade, scores against growth, every student group, the gaps between them, and where your schools land statewide — with a school-by-school appendix for the comparisons that show a clear signal. Flip through the preview below; what you see is what downloads.'} />
      <section style={{ background: '#fff', borderRadius: 8, border: `1px solid ${SLU.rule2}`,
        borderTop: `3px solid ${SLU.gold}`, boxShadow: '0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.04)',
        padding: 24, fontFamily: FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: SLU.ink, letterSpacing: -0.2 }}>
              {deck.slides.length} slides · {deck.meta.district} · {deck.meta.year}
            </div>
            <div style={{ fontSize: 12, color: SLU.mute, marginTop: 2 }}>
              Built right here in your browser — nothing is uploaded. Values in {deck.meta.unitLabel}; common system fonts, so it opens the same anywhere.
            </div>
          </div>
          <button onClick={exportPPTX} disabled={busy} style={{
            padding: '10px 18px', borderRadius: 6,
            background: busy ? SLU.mute : SLU.blue, color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, padding: '1px 5px',
                            border: '1px solid rgba(255,255,255,0.45)', borderRadius: 3,
                            letterSpacing: 0.5 }}>PPTX</span>
            {busy ? 'Generating…' : 'Export PPTX →'}
          </button>
        </div>
        <SlideCarousel deck={deck} />
      </section>
    </>
  );
```

Delete everything the new file no longer uses: the old `slides` array, `SlideCard`, `SlideBody`, `Empty`, `scanHotspots`, `addGapTable`, `addHeader`, old `buildPPTX`, `fmt2` (keep only if a preview uses it). Search the file for orphans before committing.

- [ ] **Step 5: Run all Node tests** (unchanged ones must still pass), then a quick manual serve + click Export: carousel renders, arrows navigate, download produces a file.

- [ ] **Step 6: Commit** — `feat(export): full-results deck with carousel preview (Tasks 6+7)`.

---

### Task 8: Browser verification + pptx inspection + docs

**Files:**
- Create: `%TEMP%\gl-verify\verify-deck.cjs`
- Modify: `README.md` (Export bullet, file map line for `engine/deck.js`)

- [ ] **Step 1: Verification script.** Two passes: sample data, then the named Jackson upload. Core assertions:

```js
// (full Playwright boilerplate per the recipe at the top of this plan)
// PASS A — sample data:
//   nav to Export; carousel visible; counter says "Slide 1 of N" with N >= 10;
//   ArrowRight advances; cover preview shows "Sample district";
//   click Export PPTX; const dl = await page.waitForEvent('download');
//   await dl.saveAs(path.join(DIR, 'deck-sample.pptx'));
// PASS B — upload named-math.csv on Home, wait for "is loaded", nav to Export:
//   cover preview shows "Jackson R-II"; slide count grew (statewide + appendix);
//   download to deck-named.pptx; zero console errors throughout.
```

After the script, inspect the files from PowerShell (a .pptx is a zip):

```powershell
Copy-Item "$env:TEMP\gl-verify\deck-named.pptx" "$env:TEMP\gl-verify\deck-named.zip" -Force
Expand-Archive "$env:TEMP\gl-verify\deck-named.zip" "$env:TEMP\gl-verify\deck-named" -Force
(Get-ChildItem "$env:TEMP\gl-verify\deck-named\ppt\slides" -Filter 'slide*.xml').Count   # = deck slide count
Select-String -Path "$env:TEMP\gl-verify\deck-named\ppt\slides\*.xml" -Pattern 'Jackson R-II' -List
Select-String -Path "$env:TEMP\gl-verify\deck-named\ppt\slides\*.xml" -Pattern 'West Lane Elementary' -List
Select-String -Path "$env:TEMP\gl-verify\deck-named\ppt\slides\*.xml" -Pattern 'Mulish|JetBrains|Crimson' -List  # expect NO matches
```

- [ ] **Step 2: Fix anything the sweep surfaces** (chart option typos are the likely failure — PptxGenJS throws inside writeFile; the alert path catches it, so watch the console output).

- [ ] **Step 3: README.** Update page-list bullet 7 to describe the new deck (cover → glance → per-subject figures → statewide → cautions → signal-gated appendix; carousel preview; system fonts) and add `engine/deck.js   deck model for the Export page (Node-tested)` to the file map.

- [ ] **Step 4: Run the full Node suite one last time.**

- [ ] **Step 5: Commit + push** — `feat(export): verified deck export; docs updated`.

---

## Self-review checklist (run after writing, before execution)

- Spec coverage: cover/intro/glance ✓ (Task 5), per-subject four slides ✓ (Tasks 4–6), statewide ✓ (Task 5/6), cautions ✓, divider+appendix gating ✓ (Task 3/5), carousel ✓ (Task 7), system fonts ✓ (Task 6 constants + verification grep), filename ✓ (Task 6), store change ✓ (Task 1), buildDemoSections single-source ✓ (Task 2), units toggle ✓ (Task 7 fmt), edge cases ✓ (Task 5 tests).
- Names consistent: `GLDeck.buildDeck`, descriptor kinds `cover|intro|glance|heat|scatter|groups|gapsOverview|stateHist|stateTrend|cautions|divider|forest` used identically in deck.js, PPTX_LAYOUTS, and previewTitle.
- Known risk: PptxGenJS chart option names (`lineDataSymbolSize`, `barGapWidthPct`) vary by version — if writeFile throws, consult the bundled pptxgen.bundle.js or simplify the option set; the layout still works without the cosmetic options.
