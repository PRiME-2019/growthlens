# Controls Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the global analysis settings (Subject, Units, Method) into a persistent sidebar panel, move per-figure options onto their figure cards, and retire the per-page Controls card.

**Architecture:** GrowthLens is a no-build static app — plain `.jsx` files transformed in-browser by Babel Standalone, sharing state through a `ctx` object created in `AppBody` (app-shell.jsx) and components/constants published on `window`. This plan edits four jsx files; no engine or data changes. Spec: `docs/superpowers/specs/2026-06-11-controls-restructure-design.md`.

**Tech Stack:** React 18 (CDN), Babel Standalone, no bundler. Engine tests: `node --test "test/*.test.js"` (UI has no test harness — UI steps verify in a real browser).

---

## How to verify UI steps (used by several tasks)

The app must be served over HTTP. From the repo root:

```powershell
python -m http.server 8013   # leave running in background
```

Drive it with Playwright (already installed in the scratch dir `%TEMP%\gl-verify` from prior sessions; if missing: `npm i playwright@1.60.0` there) using the system Edge channel — no browser download:

```js
// %TEMP%\gl-verify\check.cjs — adapt the body per task's "Verify" step
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1400 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:8013/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // in-browser Babel transform
  // ... task-specific steps ...
  console.log('ERRORS:', JSON.stringify(errs));
  await browser.close();
})();
```

Gotchas (learned the hard way): nav tabs are `role=button`; the segmented controls are `role=radio`; allow ~2.5s after load before interacting. A step passes only if the listed assertions hold **and** `ERRORS: []`.

---

### Task 1: Sidebar "Analysis" panel + localStorage persistence

**Files:**
- Modify: `app-shell.jsx` (AppBody state init ~line 66, persistence effect, LeftNav ~line 174, NavItem footer ~line 236)

The Controls cards stay in place during this task (temporarily duplicating the
globals) — the app must keep working after every task.

- [ ] **Step 1: Add the prefs loader (module scope, just above `function AppBody()`)**

```js
// Global analysis settings persist across sessions. UI preferences only —
// no student data ever touches storage, so the privacy promise is intact.
const ANALYSIS_PREFS_KEY = 'gl-analysis-v1';
function loadAnalysisPrefs() {
  try { return JSON.parse(localStorage.getItem(ANALYSIS_PREFS_KEY) || '{}') || {}; }
  catch { return {}; }
}
```

- [ ] **Step 2: Restore persisted values in the state initializers**

Replace in `AppBody` (validate enumerations — a corrupt value falls back to the default):

```js
const [subject, setSubjectState] = React.useState(() =>
  loadAnalysisPrefs().subject === 'ela' ? 'ela' : 'math');
const [demo, setDemo] = React.useState(() => {
  const d = loadAnalysisPrefs().demo;
  return DEMOS[d] ? d : 'frl';
});
const [estimate, setEstimate] = React.useState(() =>
  loadAnalysisPrefs().estimate === 'raw' ? 'raw' : 'shrunk');
const [unit, setUnit] = React.useState(() =>
  loadAnalysisPrefs().unit === 'weeks' ? 'weeks' : 'z');
```

- [ ] **Step 3: Write prefs on change + snap back unavailable persisted subject**

Add right after the existing `disabledSubjects` computation (the demo
subgroup snap-back effect at ~line 122 is the pattern being mirrored):

```js
// Persist the analysis settings; failure (private mode) just means no restore.
React.useEffect(() => {
  try { localStorage.setItem(ANALYSIS_PREFS_KEY, JSON.stringify({ subject, unit, estimate, demo })); }
  catch { /* ignore */ }
}, [subject, unit, estimate, demo]);
// A persisted subject the active store can't serve (e.g. 'ela' with the
// Math-only demo) snaps back instead of dead-ending on "No data".
React.useEffect(() => {
  if (window.GLStore && !window.GLStore.available(subject)) setSubjectState('math');
});
```

- [ ] **Step 4: Add the AnalysisPanel component (below `LeftNav`, above `NavItem`)**

```jsx
// Global analysis settings — subject, units, method — live in the sidebar so
// the state that changes what every figure means is always visible. Per-figure
// options live on the figure cards themselves.
function AnalysisPanel({ ctx }) {
  return (
    <div style={{ padding: '14px 16px 4px', display: 'flex', flexDirection: 'column', gap: 12,
                   borderTop: `1px solid ${SLU.rule2}`, marginTop: 8 }}>
      <div style={{ fontSize: 10, fontFamily: LABEL, color: SLU.mute,
                     textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>
        Analysis
      </div>
      <CSegmented value={ctx.subject} onChange={ctx.setSubject} options={SUBJECTS}
                  label="Subject" disabledKeys={ctx.disabledSubjects} />
      <CSegmented value={ctx.unit} onChange={ctx.setUnit}
                  options={{ z: 'SD', weeks: 'Weeks' }} label="Units" hint={UNIT_HINT} />
      <CSegmented value={ctx.estimate} onChange={ctx.setEstimate}
                  options={METHOD_OPTS} label="Method"
                  hint={METHOD_HINT} optionHints={METHOD_OPT_HINTS} />
    </div>
  );
}
```

- [ ] **Step 5: Render the panel in LeftNav, drop the Settings placeholder**

`LeftNav` gains a `ctx` prop: `function LeftNav({ page, setPage, ctx })`, and the
caller in `AppBody` becomes `<LeftNav page={page} setPage={setPage} ctx={ctx} />`.
Insert `<AnalysisPanel ctx={ctx} />` between the tab-nav `</div>` and the
"Secondary nav" block, and delete the line:

```jsx
<NavItem label="Settings" placeholder soon />
```

(`NavItem`'s `placeholder`/`soon` props become unused — leave `NavItem` itself
alone; it still renders "Methods note".)

- [ ] **Step 6: Verify in browser**

Serve + run a check script that does: click "Gap Analysis" → assert sidebar
contains "ANALYSIS", "Subject", "Units", "Method"; click the sidebar `radio`
"Weeks" → assert the figure card text contains "in weeks of learning"; reload
the page → assert the Weeks radio is still checked (`aria-checked="true"`).
Then click "SD" to restore. Expect `ERRORS: []`.

- [ ] **Step 7: Commit**

```powershell
git add app-shell.jsx
git commit -m "feat(shell): sidebar Analysis panel with persisted subject/units/method"
```

---

### Task 2: Gap Analysis — Compare select on the card; drop sort & small-groups

**Files:**
- Modify: `forest-final.jsx` (constants ~line 20-40, ForestFinal signature/body, title row, ForestTable, file-bottom exports)
- Modify: `app-shell.jsx` (GapPage ~line 831, ForestSlot ~line 1428, GapControls ~line 1385, fallbacks ~line 1363, AppBody ctx)

- [ ] **Step 1: forest-final.jsx — delete the option tables**

Delete `SORTS_FINAL` (and its comment block "Gap sorts rank by…") and
`THRESHOLD_MODES`. At the file bottom, reduce the exports to:

```js
window.ForestFinal = ForestFinal;
```

- [ ] **Step 2: forest-final.jsx — new ForestFinal signature + fixed sort/section**

```js
function ForestFinal({ estimate, unit: unitProp, demo, setDemo, demoOptions = {}, disabledDemos = [] } = {}) {
  const data = window.GAPS_DATA;
  const mode = estimate || 'shrunk';
  const unit = unitProp || 'z';
  const [view, setView] = React.useState('chart');          // 'chart' | 'table'

  const gapKey = mode === 'raw' ? 'raw_gap' : 'shrunk_gap';
  // Fixed order: largest gap first by the displayed estimate (rows re-sort on
  // the Method toggle and the position animation covers the move). Zero-side
  // schools carry null estimates and always sort last.
  const all = [...data.schools].sort((a, b) => {
    const an = a[gapKey] == null, bn = b[gapKey] == null;
    if (an || bn) return an === bn ? 0 : (an ? 1 : -1);
    return b[gapKey] - a[gapKey];
  });
  const meets = all.filter(s => s.meets_min_cell);
  const below = all.filter(s => !s.meets_min_cell);
```

(`sort`, `threshold`, `cmpFn`, and `visible` are gone.)

- [ ] **Step 3: forest-final.jsx — axis memo loses the threshold branch**

```js
const ciKey = mode === 'raw' ? 'raw_ci95' : 'shrunk_ci95';
const pool = data.schools;
```

and the dependency array becomes `[data, mode]`.

- [ ] **Step 4: forest-final.jsx — add CompareSelect and put it in the title row**

New component (next to `ViewToggle`):

```jsx
// Which comparison this figure (and the Export deck) slices by. Lives on the
// card because it defines what the figure compares; subject/units/method are
// global in the sidebar panel.
function CompareSelect({ value, onChange, options, disabledKeys = [] }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontFamily: LABEL, color: SLU.mute,
                      textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
        Compare
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        fontFamily: FONT, fontSize: 12.5, color: SLU.ink, padding: '7px 26px 7px 12px',
        border: `1px solid ${SLU.rule}`, borderRadius: 999, background: '#fff', cursor: 'pointer',
      }}>
        {Object.entries(options).map(([k, v]) => {
          const off = disabledKeys.includes(k);
          return <option key={k} value={k} disabled={off}>{v}{off ? ' (not in this data)' : ''}</option>;
        })}
      </select>
    </label>
  );
}
```

Title row right side becomes:

```jsx
<div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
               rowGap: 10, justifyContent: 'flex-end' }}>
  {setDemo && <CompareSelect value={demo} onChange={setDemo}
                             options={demoOptions} disabledKeys={disabledDemos} />}
  <ViewToggle view={view} setView={setView} />
</div>
```

- [ ] **Step 5: forest-final.jsx — body always renders the sectioned layout**

Replace the `{threshold === 'section' ? (…) : (…)}` block with:

```jsx
{meets.map((s, i) => <ForestRow key={s.school_id} s={s} mode={mode} unit={unit} axis={axis} plotMinW={PLOT_MIN_W} rowH={ROW_H} stripe={i % 2 === 1} />)}
{below.length > 0 && (
  <>
    <SectionDivider label="Too few students to read reliably — handle with care" count={below.length} />
    {below.map((s, i) => <ForestRow key={s.school_id} s={s} mode={mode} unit={unit} axis={axis} plotMinW={PLOT_MIN_W} rowH={ROW_H} stripe={i % 2 === 1} dimmed />)}
  </>
)}
```

And the table call site:

```jsx
<ForestTable meets={meets} below={below} mode={mode} unit={unit}
             districtGap={data.meta.districtGap}
             districtCi={data.meta.districtCi95 || null}
             groupA={data.meta.groupA} groupB={data.meta.groupB} />
```

- [ ] **Step 6: forest-final.jsx — ForestTable drops threshold plumbing**

```js
function ForestTable({ meets, below, mode, unit, districtGap, districtCi, groupA, groupB }) {
  const rows = [...meets, ...below];
  const dividerAt = meets.length;
```

Inside `rows.map`, the row-state lines become:

```js
const dimmed = i >= dividerAt;
const sectionStart = i === dividerAt && below.length > 0;
```

(`schools`/`threshold` props and the `threshold === 'inline'` branch are gone.)

- [ ] **Step 7: app-shell.jsx — GapPage loses the Controls card; ForestSlot passes the comparison**

```jsx
function GapPage({ sliceLabel, ctx }) {
  return (
    <>
      <BriefHeader eyebrow="Gap Analysis" slice={sliceLabel}
                   title="Where the gap lives, school by school"
                   blurb={/* unchanged */} />
      <OverviewCardGap />
      <ForestSlot ctx={ctx} />
    </>
  );
}
```

```jsx
function ForestSlot({ ctx }) {
  if (window.ForestFinal) return (
    <window.ForestFinal
      estimate={ctx.estimate}
      unit={ctx.unit}
      demo={ctx.demo} setDemo={ctx.setDemo}
      demoOptions={DEMOS} disabledDemos={ctx.disabledDemos}
    />
  );
  return <PlaceholderCard label="Forest plot" h={680} />;
}
```

- [ ] **Step 8: app-shell.jsx — delete GapControls, the fallbacks, and the dead state**

Delete: `GapControls`, `flattenOptionMap`, `SORTS_FALLBACK`, `THRESH_FALLBACK`.
In `AppBody` delete the two state lines (and the threshold default comment):

```js
const [forestSort, setForestSort] = React.useState('gap_desc');
const [threshold, setThreshold] = React.useState('section');
```

and remove `forestSort, setForestSort, threshold, setThreshold,` from `ctx`.

- [ ] **Step 9: Verify in browser**

Gap Analysis: no Controls card; card title row shows Compare select + View
pill; schools sorted largest gap first with Sch-1005 in the bottom section;
switching Compare to "EL · English learners" re-renders the card titled
"MATH · EL vs. non-EL growth…" (Sch-1005 shows "no EL students"); disabled
comparisons say "(not in this data)" when the demo dataset is active — the
demo ships all five, so check instead that all five options are listed.
Expect `ERRORS: []`.

- [ ] **Step 10: Commit**

```powershell
git add forest-final.jsx app-shell.jsx
git commit -m "feat(gap): Compare select on the figure card; fixed sort + sectioned small groups"
```

---

### Task 3: Demographics — Group select onto the figure card

**Files:**
- Modify: `demographics.jsx` (DemographicsPage ~line 24, DemographicsControls ~line 51, DemographicsFigure header ~line 155)

- [ ] **Step 1: DemographicsPage drops the Controls card and passes the clamped group**

```jsx
function DemographicsPage({ sliceLabel, ctx }) {
  const dd = window.DEMO_DATA || {};
  const demoVar = dd[ctx.demoVar] ? ctx.demoVar : (dd.frl ? 'frl' : Object.keys(dd)[0]);
  React.useEffect(() => { if (demoVar && demoVar !== ctx.demoVar) ctx.setDemoVar(demoVar); });

  const districtData = dd[demoVar];
  const groups = districtData ? districtData.groups : [];
  const label = districtData ? districtData.label : '';
  const districtMean = (districtData && districtData.districtMean != null) ? districtData.districtMean : 0;

  return (
    <>
      <window.BriefHeader eyebrow="Demographics" slice={sliceLabel}
                   title="How growth varies from group to group"
                   blurb={/* unchanged */} />
      <DemographicsFigure label={label} groups={groups} districtMean={districtMean}
                          demoVar={demoVar} ctx={ctx} />
    </>
  );
}
```

Delete `DemographicsControls` entirely.

- [ ] **Step 2: Group select in the figure header**

`DemographicsFigure` signature gains `demoVar`:
`function DemographicsFigure({ label, groups, districtMean = 0, demoVar, ctx })`.

Add above the component:

```jsx
// Inline group picker for the card header — options come from the active
// dataset's comparisons (window.DEMO_SPECS), same source the Controls card used.
function GroupSelect({ value, onChange }) {
  const SLU = window.SLU;
  const options = {};
  if (window.DEMO_SPECS) {
    Object.entries(window.DEMO_SPECS).forEach(([k, v]) => { options[k] = v.label; });
  }
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontFamily: DEMO_PAGE_LABEL, color: SLU.mute,
                      textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
        Group
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        fontFamily: DEMO_PAGE_FONT, fontSize: 12.5, color: SLU.ink, padding: '7px 26px 7px 12px',
        border: `1px solid ${SLU.rule}`, borderRadius: 999, background: '#fff', cursor: 'pointer',
      }}>
        {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}
```

In the figure's header row, replace the lone x-axis caption span with:

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
  <span style={{ fontSize: 11, fontFamily: DEMO_PAGE_LABEL, color: SLU.mute,
                  textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
    x: growth vs. expected ({unitLabel})
  </span>
  <GroupSelect value={demoVar} onChange={ctx.setDemoVar} />
</div>
```

- [ ] **Step 3: Verify in browser**

Demographics: no Controls card; Group select sits on the card; switching it to
"IEP · students with disabilities" swaps the box plots (header reads
"Growth by IEP status" or the dataset's label). Expect `ERRORS: []`.

- [ ] **Step 4: Commit**

```powershell
git add demographics.jsx
git commit -m "feat(demographics): group select on the figure card; retire its Controls card"
```

---

### Task 4: Status & Growth — Level pill onto the card

**Files:**
- Modify: `achievement.jsx` (AchievementPage ~line 18, AchievementControls ~line 31, MeansToggle, figure title row)

- [ ] **Step 1: Generalize MeansToggle into PillToggle**

Replace the existing block — the comment above it, the `const ACH_TWEEN…`
line, and the whole `MeansToggle` function — with (note: `ACH_TWEEN` appears
exactly once after this edit; a second `const ACH_TWEEN` would throw):

```jsx
// Two-option pill used on the figure card (same visual as the forest card's
// View toggle): [['school','School'],['student','Student']] etc.
const ACH_TWEEN = window.MOTION_OK === false ? '0ms' : '420ms cubic-bezier(0.32, 0.72, 0.24, 1)';
function PillToggle({ label, value, options, onChange }) {
  const SLU = window.SLU;
  const idx = Math.max(0, options.findIndex(([k]) => k === value));
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontFamily: window.LABEL, color: SLU.mute,
                      textTransform: 'uppercase', letterSpacing: 1.0, fontWeight: 700 }}>
        {label}
      </span>
      <div style={{ position: 'relative', display: 'inline-flex', background: SLU.rule2, borderRadius: 999, padding: 3 }}>
        <div style={{
          position: 'absolute', top: 3, bottom: 3, width: 'calc(50% - 3px)',
          left: idx === 0 ? 3 : '50%',
          background: '#fff', borderRadius: 999,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
          transition: `left ${ACH_TWEEN}`,
        }} />
        {options.map(([k, text]) => {
          const active = k === value;
          return (
            <button key={k} onClick={() => onChange(k)}
                    aria-pressed={active}
                    style={{
                      position: 'relative', zIndex: 1, border: 'none', background: 'transparent',
                      padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                      fontSize: 12.5, fontWeight: active ? 600 : 500,
                      color: active ? SLU.ink : SLU.ink2, fontFamily: window.FONT,
                    }}>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Title row hosts both pills**

Replace `<MeansToggle show={…} setShow={…} />` in the figure title row with:

```jsx
<div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap',
               rowGap: 10, justifyContent: 'flex-end' }}>
  <PillToggle label="View" value={level}
              options={[['school', 'School'], ['student', 'Student']]}
              onChange={ctx.setAchLevel} />
  <PillToggle label="District average" value={ctx.achShowMeans !== false ? 'show' : 'hide'}
              options={[['show', 'Show'], ['hide', 'Hide']]}
              onChange={(v) => ctx.setAchShowMeans(v === 'show')} />
</div>
```

- [ ] **Step 3: AchievementPage drops the Controls card**

Delete the line
`<window.ControlsCard title="Controls"><AchievementControls ctx={ctx} /></window.ControlsCard>`
and the whole `AchievementControls` component.

- [ ] **Step 4: Verify in browser**

Status & Growth: no Controls card; card shows View School/Student and
District average Show/Hide pills; clicking Student switches to the dot cloud
(title says "student view"); Hide removes the gold cross. Expect `ERRORS: []`.

- [ ] **Step 5: Commit**

```powershell
git add achievement.jsx
git commit -m "feat(achievement): level pill joins district-average on the card; retire its Controls card"
```

---

### Task 5: Retire ControlsCard chrome + Scan controls + dead atoms

**Files:**
- Modify: `app-shell.jsx` (ScanPage ~line 843, ControlsCard ~line 915, ScanControls ~line 1412, ControlsGrid/CGroup/GHead/CSelect ~lines 1224-1353, window exports ~line 1457, comment ~line 103)

- [ ] **Step 1: ScanPage loses its Controls card**

Delete the line
`<ControlsCard title="Controls" slice={sliceLabel}><ScanControls ctx={ctx} /></ControlsCard>`
and the whole `ScanControls` component.

- [ ] **Step 2: Confirm nothing else uses the dead components**

```powershell
# each must return NO matches (only definitions/exports may remain, which the
# next step deletes):
Select-String -Path *.jsx -Pattern "ControlsCard" | Where-Object Line -notmatch "function ControlsCard|window.ControlsCard"
Select-String -Path *.jsx -Pattern "ControlsGrid|CGroup\b|CSelect\b" | Where-Object Line -notmatch "function |window\."
```

- [ ] **Step 3: Delete the dead components and their exports**

Delete from app-shell.jsx: `ControlsCard` (whole component including its
scroll-collapse effect), `ControlsGrid`, `CGroup`, `GHead`, `CSelect`. Keep
`CLabel` and `CSegmented` (the sidebar panel uses them) and `AuxCard` (the
Overview cards use it). Remove these export lines:

```js
window.ControlsCard = ControlsCard;
window.ControlsGrid = ControlsGrid;
window.CGroup = CGroup;
window.CSelect = CSelect;
```

Update the stale comment at ~line 103 (“pairs with ControlsCard's scroll
handler…”) to just: `// Scroll to the top whenever the user changes analysis
tabs so the new page reads from its header.`

- [ ] **Step 4: Verify in browser**

Click through ALL pages (Overview, Upload, System Scan, Gap Analysis,
Status & Growth, Demographics, Export): every page renders, no Controls card
anywhere, sidebar panel works on each. Expect `ERRORS: []`.

- [ ] **Step 5: Commit**

```powershell
git add app-shell.jsx
git commit -m "refactor(shell): retire ControlsCard chrome and unused control atoms"
```

---

### Task 6: Full regression sweep

- [ ] **Step 1: Engine tests (regression only — nothing in `engine/` changed)**

```powershell
node --test "test/*.test.js"
```
Expected: all pass (53 at time of writing).

- [ ] **Step 2: Browser sweep**

One Playwright run that: (1) sets Weeks + Raw in the sidebar, picks
"IEP · students with disabilities" in the gap card's Compare select, reloads,
and asserts all three are restored (Weeks/Raw radios `aria-checked="true"`,
Compare select value `iep`); (2) screenshots Gap Analysis, System Scan,
Status & Growth, Demographics; (3) on Export, asserts the slide-count line
shows the active slice and clicks "Export PPTX →", asserting the button cycles
through "Generating…" back to idle with `ERRORS: []` (the .pptx download
itself is fine to ignore).

- [ ] **Step 3: Reset state + eyeball the screenshots**

Set the sidebar back to SD + Shrunken and Compare back to FRL (or clear the
`gl-analysis-v1` localStorage key). Read the screenshots — layout intact,
no clipped sidebar controls at 220px width.

- [ ] **Step 4: Commit any verification fixes; otherwise nothing to commit**

---

## Self-review notes

- Spec coverage: §1 sidebar panel → Task 1; §2 per-card options → Tasks 2-4;
  §3 removals → Tasks 2 (sort/threshold/fallbacks) + 5 (chrome/atoms);
  §4 consequences → verified in Tasks 2 (compare select drives slice) and 6
  (export follows it). Acceptance criteria 1-7 map to Task verify steps.
- The plan intentionally keeps each task shippable: Task 1 duplicates globals
  (sidebar + old cards) for one commit rather than breaking pages mid-stream.
