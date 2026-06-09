# Real Data Ingestion Engine (DuckDB-WASM) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GrowthLens's mocked data layer with a real, in-browser DuckDB-WASM engine that ingests Missouri DESE/MOSIS subject files (pre-computed residuals), computes every figure's data via SQL aggregation + a pure-JS statistics layer, and makes the privacy/methods copy true.

**Architecture:** Pure-JS statistics (`engine/stats.js`) and ingest helpers are TDD'd in Node. DuckDB-WASM is vendored same-origin and instantiated lazily on first upload. `engine/compute.js` runs `GROUP BY` aggregations and calls `stats.js` to build the five `window.*` figure shapes, which `engine/store.js` swaps in behind the existing `activateSubject()` seam. Figures are untouched; only fake-data code and no-op toggles are removed. Full design: [docs/superpowers/specs/2026-06-08-real-data-ingestion-design.md](../specs/2026-06-08-real-data-ingestion-design.md).

**Tech Stack:** Vanilla ES + React 18 (Babel Standalone, no build), DuckDB-WASM (EH single-thread bundle), Node's built-in test runner (`node --test`, zero deps).

**Conventions:**
- No build step. Pure modules use a UMD wrapper so the **browser** gets `window.GL*` globals and **Node tests** can `require()` them.
- TDD: write the failing test, watch it fail, implement minimally, watch it pass, commit.
- Run tests with `node --test test/` from the repo root.
- Sign convention is **focal − reference** (§2.3 of the spec): a negative gap means the focal group has the lower residual.

---

## File structure

**Create:**
- `engine/stats.js` — pure statistics (cellSE, gapSE, dlTau2, remlTau2, pooledMean, shrink, summarize, ols). UMD.
- `engine/ingest.js` — pure helpers (detectPrefix, canonHeader, parseFlag, validateColumns, SUBGROUPS config) + browser-only `loadSubjectFile()`. UMD for the pure parts.
- `engine/duckdb-loader.mjs` — ESM lazy singleton → `window.GL.getConnection()`.
- `engine/compute.js` — `computeSlice(year, subject)` → the five shapes. Browser-only classic script.
- `engine/store.js` — dataset registry, memo cache, `window.*` seam. Browser-only classic script.
- `vendor/duckdb/` — vendored DuckDB-WASM assets + `README.md`.
- `test/stats.test.js`, `test/ingest.test.js` — Node tests.

**Modify:**
- `index.html` — load the new engine scripts/module; trigger compute on upload.
- `app-shell.jsx` — delete `__mathify`/`__transformInPlace`/`ensureMathData` transform; wire `UploadPage`/`SubjectDropZone` to `ingest`+`store`; wire `DatasetStrip` and the subgroup `CSelect` to `store`; remove the estimate toggle from `ScanControls` (keep Units).
- `demographics.jsx` — remove the estimate toggle from `DemographicsControls`.
- `achievement.jsx` — hide the estimate toggle when level is student.
- `data.js` — re-sign `GAPS_DATA` to focal − reference; relabel as the Math demo.
- `heatmap-data.js`, `demo-data.js` — relabel demo `meta.subject` to `math` (no numeric change).
- `methods.html` — §1 residual rewrite + gap direction, §3 cell-SE formula, §2 shrunk_se caveat, §7 privacy.

---

## Phase 1 — Pure statistics (`engine/stats.js`), TDD

### Task 1: Scaffold the test runner and stats module

**Files:**
- Create: `engine/stats.js`
- Create: `test/stats.test.js`

- [ ] **Step 1: Create the UMD skeleton** `engine/stats.js`

```js
// GrowthLens statistics — pure functions, no DOM/DuckDB. UMD: browser → window.GLStats, Node → module.exports.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {}; // filled in by later tasks
});
```

- [ ] **Step 2: Create a smoke test** `test/stats.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../engine/stats.js');

test('module loads', () => { assert.equal(typeof S, 'object'); });
```

- [ ] **Step 3: Run it**

Run: `node --test test/`
Expected: 1 test passing.

- [ ] **Step 4: Commit**

```bash
git add engine/stats.js test/stats.test.js
git commit -m "test: scaffold stats module + node test runner"
```

### Task 2: `cellSE` — measurement-error-aware cell standard error

Formula (spec §3.2): `SE = sqrt( max(S2, ms2) / n )`, where `S2` = sample variance of residuals, `ms2` = mean of per-student `se^2`. Edge: `n===1` → `sqrt(ms2)` (the single student's SE); `n===0` → `null`.

**Files:** Modify `engine/stats.js`, `test/stats.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('cellSE: heterogeneity dominates → classic SEM', () => {
  // residuals with sample variance 0.25, per-student se all 0.2 (ms2=0.04), n=100
  // max(0.25,0.04)/100 = 0.0025 → 0.05
  assert.ok(Math.abs(S.cellSE({ s2: 0.25, ms2: 0.04, n: 100 }) - 0.05) < 1e-9);
});
test('cellSE: measurement floor dominates', () => {
  // max(0.01,0.04)/100 = 0.0004 → 0.02
  assert.ok(Math.abs(S.cellSE({ s2: 0.01, ms2: 0.04, n: 100 }) - 0.02) < 1e-9);
});
test('cellSE: n=1 → single-student SE = sqrt(ms2)', () => {
  assert.ok(Math.abs(S.cellSE({ s2: NaN, ms2: 0.09, n: 1 }) - 0.3) < 1e-9);
});
test('cellSE: n=0 → null', () => {
  assert.equal(S.cellSE({ s2: 0, ms2: 0, n: 0 }), null);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test test/`
Expected: FAIL — `S.cellSE is not a function`.

- [ ] **Step 3: Implement** (inside the `return {}` object of `engine/stats.js`)

```js
cellSE: function ({ s2, ms2, n }) {
  if (!n || n < 1) return null;
  if (n === 1) return Math.sqrt(ms2);
  return Math.sqrt(Math.max(s2, ms2) / n);
},
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/stats.js test/stats.test.js
git commit -m "feat(stats): measurement-error-aware cellSE"
```

### Task 3: `gapSE` and `shrink` — gap SE and empirical-Bayes shrinkage

`gapSE(seA, seB) = sqrt(seA^2 + seB^2)`. `shrink({ rawGap, rawSe, tau2, mu })` returns `{ B, shrunkGap, shrunkSe }` where `B = tau2/(tau2+rawSe^2)`, `shrunkGap = B*rawGap + (1-B)*mu`, `shrunkSe = sqrt(B)*rawSe` (spec §3.3, §3.6). Oracle values are the real `data.js` Sch-1013 row.

**Files:** Modify `engine/stats.js`, `test/stats.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('gapSE combines in quadrature', () => {
  assert.ok(Math.abs(S.gapSE(0.3, 0.4) - 0.5) < 1e-9);
});
test('shrink matches data.js Sch-1013 (tau2=0.0309, mu=0.18)', () => {
  const r = S.shrink({ rawGap: 0.7314, rawSe: 0.2277, tau2: 0.0309, mu: 0.18 });
  assert.ok(Math.abs(r.B - 0.374) < 5e-4, `B=${r.B}`);
  assert.ok(Math.abs(r.shrunkGap - 0.3860) < 5e-4, `shrunkGap=${r.shrunkGap}`);
  assert.ok(Math.abs(r.shrunkSe - 0.1392) < 5e-4, `shrunkSe=${r.shrunkSe}`);
});
test('shrink: B→1 when rawSe→0 (no shrinkage)', () => {
  const r = S.shrink({ rawGap: 0.5, rawSe: 1e-6, tau2: 0.03, mu: 0.1 });
  assert.ok(r.B > 0.9999);
  assert.ok(Math.abs(r.shrunkGap - 0.5) < 1e-3);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test test/`
Expected: FAIL — functions undefined.

- [ ] **Step 3: Implement**

```js
gapSE: function (seA, seB) { return Math.sqrt(seA * seA + seB * seB); },
shrink: function ({ rawGap, rawSe, tau2, mu }) {
  const B = tau2 / (tau2 + rawSe * rawSe);
  return { B, shrunkGap: B * rawGap + (1 - B) * mu, shrunkSe: Math.sqrt(B) * rawSe };
},
```

- [ ] **Step 4: Run, verify pass** — `node --test test/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/stats.js test/stats.test.js
git commit -m "feat(stats): gapSE + EB shrink (matches fixture downstream columns)"
```

### Task 4: `dlTau2` and `pooledMean` — DerSimonian-Laird τ² and inverse-variance pooled mean

`dlTau2(rows)` where `rows = [{gap, se}]`: closed-form DL estimate, floored at 0. `pooledMean(rows, tau2)` → `{ mu, se, ciLo, ciHi }` with `w=1/(se^2+tau2)`, `mu=Σw·gap/Σw`, `se=1/sqrt(Σw)`, CI `mu±1.96·se` (spec §3.5).

**Files:** Modify `engine/stats.js`, `test/stats.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('pooledMean: equal weights → simple mean + se', () => {
  const rows = [{ gap: 0, se: 1 }, { gap: 2, se: 1 }]; // tau2=0 → w=1 each
  const r = S.pooledMean(rows, 0);
  assert.ok(Math.abs(r.mu - 1) < 1e-9);
  assert.ok(Math.abs(r.se - Math.sqrt(0.5)) < 1e-9); // 1/sqrt(2)
});
test('dlTau2: zero between-school variance when all gaps equal', () => {
  const rows = [{ gap: 0.2, se: 0.1 }, { gap: 0.2, se: 0.1 }, { gap: 0.2, se: 0.1 }];
  assert.ok(Math.abs(S.dlTau2(rows)) < 1e-12);
});
test('dlTau2: positive when spread exceeds sampling error', () => {
  const rows = [{ gap: -1, se: 0.1 }, { gap: 0, se: 0.1 }, { gap: 1, se: 0.1 }];
  assert.ok(S.dlTau2(rows) > 0.3);
});
```

- [ ] **Step 2: Run, verify failure** — `node --test test/` → FAIL.

- [ ] **Step 3: Implement**

```js
pooledMean: function (rows, tau2) {
  let wS = 0, wxS = 0;
  for (const r of rows) { const w = 1 / (r.se * r.se + tau2); wS += w; wxS += w * r.gap; }
  if (wS <= 0) return null;
  const mu = wxS / wS, se = 1 / Math.sqrt(wS);
  return { mu, se, ciLo: mu - 1.96 * se, ciHi: mu + 1.96 * se };
},
dlTau2: function (rows) {
  const k = rows.length;
  if (k < 2) return 0;
  let sw = 0, swx = 0, sw2 = 0;
  for (const r of rows) { const w = 1 / (r.se * r.se); sw += w; swx += w * r.gap; sw2 += w * w; }
  const mu = swx / sw;
  let Q = 0; for (const r of rows) { Q += (1 / (r.se * r.se)) * (r.gap - mu) ** 2; }
  const c = sw - sw2 / sw;
  return Math.max(0, (Q - (k - 1)) / c);
},
```

- [ ] **Step 4: Run, verify pass** — `node --test test/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/stats.js test/stats.test.js
git commit -m "feat(stats): DerSimonian-Laird tau2 + inverse-variance pooled mean"
```

### Task 5: `remlTau2` — REML between-school variance

Bounded golden-section maximization of the REML profile log-likelihood (spec §3.4). Bracket `[0, max(10·dlTau2, 1)]`; boundary: return 0 if DL is 0; snap `<1e-8` to 0. Oracle: the 30 `data.js` gaps give τ²≈0.0223 (independently computed); equal-gap data gives 0.

**Files:** Modify `engine/stats.js`, `test/stats.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const FIXTURE_GAPS = require('./fixtures/gaps.json'); // [{gap, se, meets}], created in Step 3a

test('remlTau2: zero when all gaps equal', () => {
  const rows = [{ gap: 0.2, se: 0.1 }, { gap: 0.2, se: 0.1 }, { gap: 0.2, se: 0.1 }];
  assert.equal(S.remlTau2(rows), 0);
});
test('remlTau2: recovers ~0.0223 on the 30 fixture gaps (the model-correct value, NOT the fixture 0.0309)', () => {
  const rows = FIXTURE_GAPS.filter(r => r.meets).map(r => ({ gap: r.gap, se: r.se }));
  const t = S.remlTau2(rows);
  assert.ok(Math.abs(t - 0.0223) < 1e-3, `tau2=${t}`);
});
test('remlTau2: pooled mean on fixture gaps ~0.144 (NOT districtGap 0.18)', () => {
  const rows = FIXTURE_GAPS.filter(r => r.meets).map(r => ({ gap: r.gap, se: r.se }));
  const mu = S.pooledMean(rows, S.remlTau2(rows)).mu;
  assert.ok(Math.abs(mu - 0.144) < 5e-3, `mu=${mu}`);
});
```

- [ ] **Step 2: Run, verify failure** — FAIL (`remlTau2` undefined + missing fixtures file).

- [ ] **Step 3a: Create the fixture extract** `test/fixtures/gaps.json`

Generate it once from `data.js` (do not hand-type). Run this from the repo root and commit the output file:

```bash
node -e "const fs=require('fs');const w={};eval(fs.readFileSync('data.js','utf8'));const rows=w.GAPS_DATA.schools.map(s=>({gap:s.raw_gap,se:s.raw_se,meets:s.meets_min_cell!==false}));fs.mkdirSync('test/fixtures',{recursive:true});fs.writeFileSync('test/fixtures/gaps.json',JSON.stringify(rows,null,2));" 
```

(Note: `data.js` assigns to `window.GAPS_DATA`; the snippet shims `window` as `w`.)

- [ ] **Step 3b: Implement `remlTau2`**

```js
remlTau2: function (rows) {
  const k = rows.length;
  if (k < 2) return 0;
  const dl = this.dlTau2(rows);
  if (dl <= 0) return 0;
  const ll = (tau2) => {
    let sumLn = 0, wS = 0, wxS = 0;
    for (const r of rows) { const v = r.se * r.se + tau2; const w = 1 / v; sumLn += Math.log(v); wS += w; wxS += w * r.gap; }
    const mu = wxS / wS;
    let q = 0; for (const r of rows) { q += (1 / (r.se * r.se + tau2)) * (r.gap - mu) ** 2; }
    return -0.5 * (sumLn + Math.log(wS) + q);
  };
  let lo = 0, hi = Math.max(10 * dl, 1), gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
  for (let i = 0; i < 200; i++) {
    if (ll(c) > ll(d)) hi = d; else lo = c;
    c = hi - gr * (hi - lo); d = lo + gr * (hi - lo);
    if (hi - lo < 1e-7) break;
  }
  const t = (lo + hi) / 2;
  return t < 1e-8 ? 0 : t;
},
```

- [ ] **Step 4: Run, verify pass** — `node --test test/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/stats.js test/stats.test.js test/fixtures/gaps.json
git commit -m "feat(stats): REML tau2 (golden-section); recovers model-correct 0.0223 on fixture"
```

### Task 6: `summarize` and `ols` — box-plot stats and OLS line

`summarize(values)` → `{ n, mean, median, q1, q3, whiskerLo, whiskerHi, outliers, min, max }` with 1.5×IQR fences (port the existing `demo-data.js` logic verbatim, spec §3.8). `ols(points, xKey, yKey)` → `{ slope, intercept, r2 }` (port from `demo-data.js`).

**Files:** Modify `engine/stats.js`, `test/stats.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('summarize: quartiles + 1.5*IQR outlier', () => {
  const r = S.summarize([1, 2, 3, 4, 5, 6, 7, 8, 100]);
  assert.equal(r.n, 9);
  assert.equal(r.median, 5);
  assert.ok(r.outliers.includes(100));
  assert.ok(r.whiskerHi <= 8);
});
test('ols: perfect line y=2x+1', () => {
  const pts = [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }];
  const r = S.ols(pts, 'x', 'y');
  assert.ok(Math.abs(r.slope - 2) < 1e-9);
  assert.ok(Math.abs(r.intercept - 1) < 1e-9);
  assert.ok(Math.abs(r.r2 - 1) < 1e-9);
});
```

- [ ] **Step 2: Run, verify failure** — FAIL.

- [ ] **Step 3: Implement** (port `quantile`/`summarize`/`regression` from `demo-data.js`)

```js
_quantile: function (sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q, base = Math.floor(pos), rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
},
summarize: function (values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const q1 = this._quantile(sorted, 0.25), q3 = this._quantile(sorted, 0.75), median = this._quantile(sorted, 0.5);
  const iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const whiskerLo = sorted.find(v => v >= lo) ?? sorted[0];
  const whiskerHi = [...sorted].reverse().find(v => v <= hi) ?? sorted[sorted.length - 1];
  const outliers = sorted.filter(v => v < lo || v > hi);
  const mean = sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1);
  return { n: sorted.length, mean, median, q1, q3, whiskerLo, whiskerHi, outliers, min: sorted[0], max: sorted[sorted.length - 1] };
},
ols: function (points, xKey, yKey) {
  const n = points.length; let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (const p of points) { const x = p[xKey], y = p[yKey]; sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y; }
  const mx = sx / n, my = sy / n;
  const slope = (sxy - n * mx * my) / (sxx - n * mx * mx), intercept = my - slope * mx;
  const ssTot = syy - n * my * my;
  let ssRes = 0; for (const p of points) { const yh = intercept + slope * p[xKey]; ssRes += (p[yKey] - yh) ** 2; }
  return { slope, intercept, r2: 1 - ssRes / ssTot };
},
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/stats.js test/stats.test.js
git commit -m "feat(stats): summarize (1.5xIQR box plot) + ols"
```

---

## Phase 2 — Ingest pure helpers (`engine/ingest.js`), TDD

### Task 7: Subgroup config + column helpers

Pure helpers, no DuckDB: `SUBGROUPS` config (spec §2.3, focal − reference), `detectPrefix(headers)`, `canonHeader(name)`, `parseFlag(value)`, `requiredColumns(prefix)`, `validate(headers)`.

**Files:** Create `engine/ingest.js`, `test/ingest.test.js`

- [ ] **Step 1: Write the failing tests** `test/ingest.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../engine/ingest.js');

test('detectPrefix: case-insensitive, math', () => {
  assert.equal(I.detectPrefix(['grade', 'math_z_residual', 'MATH_Z_T']).subject, 'math');
});
test('detectPrefix: comm_arts → ela', () => {
  assert.equal(I.detectPrefix(['COMM_ARTS_Z_RESIDUAL', 'GRADE']).subject, 'ela');
});
test('detectPrefix: no residual column → null', () => {
  assert.equal(I.detectPrefix(['grade', 'school_code']), null);
});
test('parseFlag tolerant + case-insensitive', () => {
  assert.equal(I.parseFlag('Y'), true);
  assert.equal(I.parseFlag('y'), true);
  assert.equal(I.parseFlag('1'), true);
  assert.equal(I.parseFlag('true'), true);
  assert.equal(I.parseFlag('N'), false);
  assert.equal(I.parseFlag(''), false);
  assert.equal(I.parseFlag('garbage'), false);
});
test('validate: missing required subgroup column is a blocking error listing it', () => {
  const headers = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T','SCHOOL_CODE','GRADE','GROWTH_YEAR','FREE_OR_REDUCED_LUNCH','IEP_DISABILITY','ENGLISH_LANGUAGE_LEARNER','BLACK','WHITE']; // missing HISPANIC
  const r = I.validate(headers);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('HISPANIC'));
});
test('validate: full header set passes', () => {
  const headers = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T','SCHOOL_CODE','GRADE','GROWTH_YEAR','FREE_OR_REDUCED_LUNCH','IEP_DISABILITY','ENGLISH_LANGUAGE_LEARNER','BLACK','WHITE','HISPANIC'];
  assert.equal(I.validate(headers).ok, true);
});
```

- [ ] **Step 2: Run, verify failure** — FAIL (module missing).

- [ ] **Step 3: Implement** `engine/ingest.js` (UMD; browser-only `loadSubjectFile` added in Task 9)

```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLIngest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUBGROUPS = [
    { key: 'frl', label: 'FRL · economically disadvantaged', a: { col: 'FREE_OR_REDUCED_LUNCH', val: true },  b: { col: 'FREE_OR_REDUCED_LUNCH', val: false }, aLabel: 'FRL', bLabel: 'non-FRL' },
    { key: 'iep', label: 'IEP · students with disabilities', a: { col: 'IEP_DISABILITY', val: true },          b: { col: 'IEP_DISABILITY', val: false }, aLabel: 'IEP', bLabel: 'non-IEP' },
    { key: 'el',  label: 'EL · English learners',            a: { col: 'ENGLISH_LANGUAGE_LEARNER', val: true }, b: { col: 'ENGLISH_LANGUAGE_LEARNER', val: false }, aLabel: 'EL', bLabel: 'non-EL' },
    { key: 'race_bw', label: 'Race · Black vs. White',       a: { col: 'BLACK', val: true },    b: { col: 'WHITE', val: true }, aLabel: 'Black', bLabel: 'White' },
    { key: 'race_hw', label: 'Race · Hispanic vs. White',    a: { col: 'HISPANIC', val: true }, b: { col: 'WHITE', val: true }, aLabel: 'Hispanic', bLabel: 'White' },
  ];
  const PREFIX_TO_SUBJECT = { MATH: 'math', COMM_ARTS: 'ela' };
  const STRUCT_COLS = ['SCHOOL_CODE', 'GRADE', 'GROWTH_YEAR'];
  const FLAG_COLS = ['FREE_OR_REDUCED_LUNCH', 'IEP_DISABILITY', 'ENGLISH_LANGUAGE_LEARNER', 'BLACK', 'WHITE', 'HISPANIC'];

  const canonHeader = (s) => String(s).trim().toUpperCase();

  function detectPrefix(headers) {
    const up = headers.map(canonHeader);
    const m = up.map(h => /^(.*)_Z_RESIDUAL$/.exec(h)).find(Boolean);
    if (!m) return null;
    const prefix = m[1];
    return { prefix, subject: PREFIX_TO_SUBJECT[prefix] || null };
  }

  function parseFlag(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'y' || s === '1' || s === 't' || s === 'true' || s === 'yes';
  }

  function requiredColumns(prefix) {
    return [`${prefix}_Z_RESIDUAL`, `${prefix}_Z_RESIDUAL_SE`, `${prefix}_Z_T`, ...STRUCT_COLS, ...FLAG_COLS];
  }

  function validate(headers) {
    const up = new Set(headers.map(canonHeader));
    const det = detectPrefix(headers);
    if (!det || !det.subject) return { ok: false, error: 'no_prefix', missing: [], subject: null };
    const missing = requiredColumns(det.prefix).filter(c => !up.has(c));
    return { ok: missing.length === 0, missing, subject: det.subject, prefix: det.prefix };
  }

  return { SUBGROUPS, PREFIX_TO_SUBJECT, FLAG_COLS, canonHeader, detectPrefix, parseFlag, requiredColumns, validate };
});
```

- [ ] **Step 4: Run, verify pass** — `node --test test/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/ingest.js test/ingest.test.js
git commit -m "feat(ingest): subgroup config + prefix/flag/column helpers (TDD)"
```

---

## Phase 3 — Vendor DuckDB-WASM + loader

### Task 8: Vendor the EH bundle and write the lazy loader

**Files:** Create `vendor/duckdb/` (assets + README), `engine/duckdb-loader.mjs`

- [ ] **Step 1: Download the EH (single-thread) bundle into `vendor/duckdb/`**

Pick the current `@duckdb/duckdb-wasm` release and fetch the four files needed for manual instantiation (ESM build): `duckdb-browser.mjs`, `duckdb-browser-eh.worker.js`, `duckdb-eh.wasm`, and the `duckdb-browser.mjs.map` (optional). From the repo root:

```bash
mkdir -p vendor/duckdb
VER=1.29.0   # pin to the latest stable @duckdb/duckdb-wasm at vendoring time; record it in the README
base="https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${VER}/dist"
curl -L -o vendor/duckdb/duckdb-browser.mjs            "$base/duckdb-browser.mjs"
curl -L -o vendor/duckdb/duckdb-browser-eh.worker.js   "$base/duckdb-browser-eh.worker.js"
curl -L -o vendor/duckdb/duckdb-eh.wasm                "$base/duckdb-eh.wasm"
```

Then verify the three files exist and the `.wasm` is tens of MB:

Run: `ls -la vendor/duckdb/`
Expected: three files; `duckdb-eh.wasm` is ~35–40 MB.

- [ ] **Step 2: Write `vendor/duckdb/README.md`** (records the pin + re-vendoring)

```markdown
# Vendored DuckDB-WASM

Pinned version: `@duckdb/duckdb-wasm@<VER>` (EH / single-thread bundle).
Files: duckdb-browser.mjs, duckdb-browser-eh.worker.js, duckdb-eh.wasm.

Re-vendor: bump VER in the curl block in docs/.../plans/2026-06-08-real-data-ingestion.md Task 8
and re-run it. The EH (exception-handling, single-thread) bundle is used deliberately so no
COOP/COEP cross-origin-isolation headers are required on the static host.
```

- [ ] **Step 3: Write `engine/duckdb-loader.mjs`**

```js
// Lazy DuckDB-WASM singleton from vendored same-origin assets. ESM. Attaches to window.GL.
import * as duckdb from '../vendor/duckdb/duckdb-browser.mjs';

let _dbPromise = null;

async function instantiate() {
  const bundle = {
    mainModule: new URL('../vendor/duckdb/duckdb-eh.wasm', import.meta.url).href,
    mainWorker: new URL('../vendor/duckdb/duckdb-browser-eh.worker.js', import.meta.url).href,
  };
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
  return db;
}

export function getDB() {
  if (!_dbPromise) _dbPromise = instantiate();
  return _dbPromise;
}
export async function getConnection() {
  const db = await getDB();
  return db.connect();
}

window.GL = window.GL || {};
window.GL.getDB = getDB;
window.GL.getConnection = getConnection;
```

- [ ] **Step 4: Manual smoke test in the browser**

Add a throwaway check to confirm the engine instantiates and runs SQL. Temporarily append to `index.html` body and load the page on a static server (`python -m http.server 8000`), open devtools console:

```html
<script type="module">
  import { getConnection } from './engine/duckdb-loader.mjs';
  const c = await getConnection();
  const r = await c.query('SELECT 41 + 1 AS answer');
  console.log('DuckDB answer:', r.toArray()[0].answer); // expect 42
</script>
```

Expected console: `DuckDB answer: 42` and **no third-party network requests** (devtools Network tab shows only same-origin `vendor/duckdb/*`). Remove the throwaway `<script>` after verifying.

- [ ] **Step 5: Commit**

```bash
git add vendor/duckdb engine/duckdb-loader.mjs
git commit -m "feat(engine): vendor DuckDB-WASM (EH) + lazy same-origin loader"
```

---

## Phase 4 — File load (`ingest.loadSubjectFile`)

### Task 9: Load a CSV into DuckDB, validate, filter to latest year, return meta

**Files:** Modify `engine/ingest.js` (add browser-only `loadSubjectFile`), `index.html` (load `ingest.js`)

- [ ] **Step 1: Add `loadSubjectFile` to `engine/ingest.js`** (inside the factory, before `return`)

```js
// Browser-only: read a File, register it in DuckDB, validate, filter to latest GROWTH_YEAR.
// Returns { ok, table, meta } or { ok:false, error, ... }. `conn` is a DuckDB connection.
async function loadSubjectFile(file, conn, dropzoneSubject) {
  const text = await file.text();
  const headerLine = text.slice(0, text.indexOf('\n')).replace(/\r$/, '');
  const headers = headerLine.split(',');
  const v = validate(headers);
  if (!v.ok) return { ok: false, error: v.error || 'missing_columns', missing: v.missing };
  if (dropzoneSubject && v.subject !== dropzoneSubject)
    return { ok: false, error: 'subject_mismatch', detected: v.subject, expected: dropzoneSubject };

  const table = `t_${v.subject}`;
  await conn.query(`DROP TABLE IF EXISTS ${table}`);
  await conn.query(`DROP TABLE IF EXISTS ${table}_all`);
  // DuckDB reads registered buffers; register the file text and read_csv_auto it.
  const db = await window.GL.getDB();
  await db.registerFileText(`${v.subject}.csv`, text);
  await conn.query(`CREATE TABLE ${table}_all AS SELECT * FROM read_csv_auto('${v.subject}.csv', header=true, all_varchar=true)`);

  const P = v.prefix;
  const yrRow = (await conn.query(`SELECT max(CAST("GROWTH_YEAR" AS INTEGER)) AS y FROM ${table}_all`)).toArray()[0];
  const latestYear = yrRow && yrRow.y != null ? Number(yrRow.y) : null;
  if (latestYear == null) return { ok: false, error: 'no_year' };

  // Canonical, typed, latest-year-only table. Flags normalized to booleans.
  await conn.query(`
    CREATE TABLE ${table} AS
    SELECT
      "SCHOOL_CODE"::VARCHAR AS school_id,
      CAST("GRADE" AS INTEGER) AS grade,
      CAST("${P}_Z_RESIDUAL" AS DOUBLE) AS residual,
      CAST("${P}_Z_RESIDUAL_SE" AS DOUBLE) AS residual_se,
      CAST("${P}_Z_T" AS DOUBLE) AS status,
      lower(trim("FREE_OR_REDUCED_LUNCH")) IN ('y','1','t','true','yes') AS frl,
      lower(trim("IEP_DISABILITY")) IN ('y','1','t','true','yes') AS iep,
      lower(trim("ENGLISH_LANGUAGE_LEARNER")) IN ('y','1','t','true','yes') AS el,
      lower(trim("BLACK")) IN ('y','1','t','true','yes') AS black,
      lower(trim("WHITE")) IN ('y','1','t','true','yes') AS white,
      lower(trim("HISPANIC")) IN ('y','1','t','true','yes') AS hispanic
    FROM ${table}_all
    WHERE CAST("GROWTH_YEAR" AS INTEGER) = ${latestYear}
      AND TRY_CAST("${P}_Z_RESIDUAL" AS DOUBLE) IS NOT NULL
  `);

  const stat = (await conn.query(`
    SELECT count(*) AS n, count(DISTINCT school_id) AS schools FROM ${table}
  `)).toArray()[0];
  const nRowsLatest = Number(stat.n);
  if (nRowsLatest === 0) return { ok: false, error: 'no_rows_latest', latestYear };
  const totalAll = Number((await conn.query(`SELECT count(*) AS n FROM ${table}_all`)).toArray()[0].n);

  return {
    ok: true, table,
    meta: {
      subject: v.subject, prefix: P, latestYear,
      nSchools: Number(stat.schools), nRowsLatest, nDropped: totalAll - nRowsLatest,
      districtCode: null,
    },
  };
}
```

Add `loadSubjectFile` to the returned object: `return { SUBGROUPS, ..., validate, loadSubjectFile };`

- [ ] **Step 2: Load `ingest.js` in `index.html`** (after the existing data scripts, before the engine modules)

In `index.html`, add after line 66 (`<script src="demo-data.js"></script>`):

```html
<script src="engine/stats.js"></script>
<script src="engine/ingest.js"></script>
```

- [ ] **Step 3: Manual browser verification** with a real DESE Math CSV

On the static server, temporarily add to `index.html`:

```html
<script type="module">
  import { getConnection } from './engine/duckdb-loader.mjs';
  window.__test = async (file) => {
    const conn = await getConnection();
    const r = await window.GLIngest.loadSubjectFile(file, conn, 'math');
    console.log(JSON.stringify(r.ok ? r.meta : r, null, 2));
  };
</script>
<input type="file" onchange="window.__test(this.files[0])">
```

Pick a real Math file. Expected console: `{ subject:"math", latestYear:<year>, nSchools:<n>, nRowsLatest:<n>, nDropped:<n>, ... }`. Try an ELA file in the `math` slot → `{ error:"subject_mismatch", detected:"ela", expected:"math" }`. Remove the throwaway markup after verifying.

- [ ] **Step 4: Commit**

```bash
git add engine/ingest.js index.html
git commit -m "feat(ingest): loadSubjectFile - register, validate, type, latest-year filter"
```

---

## Phase 5 — Compute the five shapes (`engine/compute.js`)

### Task 10: `computeSlice` — SQL aggregation + stats → the five `window.*` shapes

**Files:** Create `engine/compute.js`; Modify `index.html`

This is the integration core. It queries the canonical table for cell aggregates, then uses `GLStats` to build each shape exactly as §4.5 specifies. Below is the full module.

- [ ] **Step 1: Write `engine/compute.js`**

```js
// computeSlice(subject) → builds the five figure shapes from DuckDB + GLStats.
// Browser-only classic script. Reads the canonical table t_<subject> created by ingest.loadSubjectFile.
(function () {
  'use strict';
  const S = window.GLStats, I = window.GLIngest;
  const MIN_N = 10;
  const GRADES = ['3', '4', '5', '6', '7', '8'];

  // Aggregate residuals for an arbitrary WHERE predicate, grouped by a column expr.
  async function cells(conn, table, groupExpr, whereExpr) {
    const where = whereExpr ? `WHERE ${whereExpr}` : '';
    const rows = (await conn.query(`
      SELECT ${groupExpr} AS g,
             count(*) AS n,
             avg(residual) AS rbar,
             var_samp(residual) AS s2,
             avg(residual_se * residual_se) AS ms2,
             avg(status) AS status
      FROM ${table} ${where}
      GROUP BY ${groupExpr}
    `)).toArray();
    return rows.map(r => ({
      g: r.g, n: Number(r.n), rbar: Number(r.rbar),
      s2: r.s2 == null ? NaN : Number(r.s2), ms2: Number(r.ms2), status: Number(r.status),
      se: S.cellSE({ s2: r.s2 == null ? NaN : Number(r.s2), ms2: Number(r.ms2), n: Number(r.n) }),
    }));
  }

  function predicate(side) { return `${side.col} = ${side.val ? 'TRUE' : 'FALSE'}`; }

  async function buildGaps(conn, table, subject) {
    const byDemo = {};
    for (const sg of I.SUBGROUPS) {
      const A = await cells(conn, table, 'school_id', predicate(sg.a));
      const B = await cells(conn, table, 'school_id', predicate(sg.b));
      const bById = Object.fromEntries(B.map(c => [c.g, c]));
      const schools = [];
      for (const a of A) {
        const b = bById[a.g]; if (!b) continue;
        const rawGap = a.rbar - b.rbar;                 // focal − reference
        const rawSe = S.gapSE(a.se, b.se);
        const meets = a.n >= MIN_N && b.n >= MIN_N;
        schools.push({ school_id: a.g, n_a: a.n, n_b: b.n, raw_gap: rawGap, raw_se: rawSe, meets_min_cell: meets });
      }
      const fitRows = schools.filter(s => s.meets_min_cell).map(s => ({ gap: s.raw_gap, se: s.raw_se }));
      const tau2 = S.remlTau2(fitRows);
      const pooled = S.pooledMean(fitRows, tau2) || { mu: 0, ciLo: 0, ciHi: 0 };
      for (const s of schools) {
        const sh = S.shrink({ rawGap: s.raw_gap, rawSe: s.raw_se, tau2, mu: pooled.mu });
        s.raw_ci95 = [s.raw_gap - 1.96 * s.raw_se, s.raw_gap + 1.96 * s.raw_se];
        s.shrunk_gap = sh.shrunkGap; s.shrunk_se = sh.shrunkSe; s.shrinkage_factor = sh.B;
        s.shrunk_ci95 = [sh.shrunkGap - 1.96 * sh.shrunkSe, sh.shrunkGap + 1.96 * sh.shrunkSe];
      }
      byDemo[sg.key] = {
        meta: { subject, demographic: sg.key, groupA: sg.aLabel, groupB: sg.bLabel,
                districtGap: pooled.mu, tauSquared: tau2,
                nSchools: schools.length, nMeetingThreshold: schools.filter(s => s.meets_min_cell).length, minCellSize: MIN_N },
        schools,
      };
    }
    return byDemo;
  }

  async function buildHeatmap(conn, table, subject) {
    const raw = (await conn.query(`
      SELECT school_id, CAST(grade AS VARCHAR) AS grade, count(*) AS n, avg(residual) AS rbar
      FROM ${table} GROUP BY school_id, grade
    `)).toArray();
    const bySchool = {};
    for (const r of raw) {
      const id = r.school_id; bySchool[id] = bySchool[id] || { school_id: id, grades: {} };
      bySchool[id].grades[r.grade] = { n: Number(r.n), r: Number(r.rbar), ok: Number(r.n) >= MIN_N };
    }
    return { meta: { subject }, schools: Object.values(bySchool) };
  }

  async function buildDemo(conn, table) {
    // District-wide + per-school residual distributions for each subgroup side.
    const demoData = {}, bySchool = {};
    for (const sg of I.SUBGROUPS) {
      const groups = [];
      const perSchool = {}; // school_id -> [{key,label,...stat}]
      for (const side of [sg.a, sg.b]) {
        const key = side === sg.a ? 'A' : 'B', label = side === sg.a ? sg.aLabel : sg.bLabel;
        const rows = (await conn.query(`SELECT school_id, residual FROM ${table} WHERE ${predicate(side)}`)).toArray();
        const all = rows.map(r => Number(r.residual));
        const stat = S.summarize(all);
        groups.push({ key, label, ...stat, outliers: stat.outliers.slice(0, 8) });
        const bySch = {};
        for (const r of rows) { (bySch[r.school_id] = bySch[r.school_id] || []).push(Number(r.residual)); }
        for (const [sid, vals] of Object.entries(bySch)) {
          const st = S.summarize(vals);
          (perSchool[sid] = perSchool[sid] || []).push({ key, label, ...st, outliers: st.outliers.slice(0, 8) });
        }
      }
      demoData[sg.key] = { label: sg.label, short: sg.key.toUpperCase(), groups };
      bySchool[sg.key] = {};
      for (const [sid, gs] of Object.entries(perSchool)) bySchool[sg.key][sid] = { groups: gs };
    }
    return { demoData, bySchool };
  }

  async function buildAchievement(conn, table, gapsByDemo) {
    // Student points (raw only) + school points (status vs overall residual, raw + shrunk overall).
    const students = (await conn.query(`SELECT school_id, status AS x, residual AS y FROM ${table}`)).toArray()
      .map((r, i) => ({ school_id: r.school_id, school_idx: 0, hue: 0, x: Number(r.x), y_raw: Number(r.y) }));
    const schoolAgg = await (async () => {
      const c = await cellsOverall(conn, table);
      const fit = c.filter(s => s.n >= MIN_N).map(s => ({ gap: s.rbar, se: s.se }));
      const tau2 = S.remlTau2(fit); const pooled = S.pooledMean(fit, tau2) || { mu: 0 };
      return c.map((s, i) => {
        const sh = S.shrink({ rawGap: s.rbar, rawSe: s.se, tau2, mu: pooled.mu });
        return { school_id: s.g, school_name: s.g, school_idx: i, hue: (i * 360 / c.length) % 360,
                 x: s.status, y_raw: s.rbar, y_shrunk: sh.shrunkGap, n: s.n };
      });
    })();
    const idx = Object.fromEntries(schoolAgg.map((s, i) => [s.school_id, i]));
    students.forEach(p => { p.school_idx = idx[p.school_id] ?? 0; p.hue = (p.school_idx * 360 / schoolAgg.length) % 360; });
    return {
      student: { points: students, reg_raw: S.ols(students, 'x', 'y_raw') },
      school: { points: schoolAgg, reg_raw: S.ols(schoolAgg, 'x', 'y_raw'), reg_shrunk: S.ols(schoolAgg, 'x', 'y_shrunk') },
    };
  }
  async function cellsOverall(conn, table) {
    const rows = (await conn.query(`
      SELECT school_id AS g, count(*) AS n, avg(residual) AS rbar, var_samp(residual) AS s2,
             avg(residual_se*residual_se) AS ms2, avg(status) AS status
      FROM ${table} GROUP BY school_id
    `)).toArray();
    return rows.map(r => ({ g: r.school_id ?? r.g, n: Number(r.n), rbar: Number(r.rbar), status: Number(r.status),
      se: S.cellSE({ s2: r.s2 == null ? NaN : Number(r.s2), ms2: Number(r.ms2), n: Number(r.n) }) }));
  }

  async function computeSlice(subject) {
    const conn = await window.GL.getConnection();
    const table = `t_${subject}`;
    const gaps = await buildGaps(conn, table, subject);
    const heatmap = await buildHeatmap(conn, table, subject);
    const demo = await buildDemo(conn, table);
    const ach = await buildAchievement(conn, table, gaps);
    return { GAPS_DATA_BY_DEMO: gaps, HEATMAP_DATA: heatmap, DEMO_DATA: demo.demoData, DEMO_DATA_BY_SCHOOL: demo.bySchool, ACH_DATA: ach };
  }

  window.GLCompute = { computeSlice };
})();
```

- [ ] **Step 2: Load `compute.js` in `index.html`** — add after `ingest.js`:

```html
<script src="engine/compute.js"></script>
```

- [ ] **Step 3: Manual browser verification** — extend the Task 9 throwaway to call `computeSlice` and spot-check one gap row + one heatmap cell against a Node recomputation from the same file. Confirm `GAPS_DATA_BY_DEMO.frl.meta.tauSquared` is a plausible small positive number and signs are focal − reference (FRL gap typically negative). Remove throwaway markup after.

- [ ] **Step 4: Commit**

```bash
git add engine/compute.js index.html
git commit -m "feat(compute): computeSlice builds the five figure shapes via DuckDB + stats"
```

---

## Phase 6 — Dataset store (`engine/store.js`)

### Task 11: Registry, memo cache, and the `window.*` seam

**Files:** Create `engine/store.js`; Modify `index.html`

- [ ] **Step 1: Write `engine/store.js`**

```js
// Holds computed datasets, swaps window.* globals behind activateSubject, exposes active meta.
(function () {
  'use strict';
  const DEMOS_ORDER = ['frl', 'iep', 'el', 'race_bw', 'race_hw'];
  const sources = { demo: {}, uploaded: {} };   // sources[src][subject] = { shapes, meta }
  const memo = {};                               // memo[`${src}:${subject}`] = shapes
  let activeSubject = 'math', activeSubgroup = 'frl';

  // Seed the demo source from the bundled fixtures (Math demo). Re-signed in Task 14.
  function seedDemo() {
    sources.demo.math = {
      meta: { subject: 'math', source: 'demo', label: 'bundled demo data', nSchools: (window.GAPS_DATA?.meta?.nSchools) || 30, year: '2024–25' },
      shapes: {
        GAPS_DATA_BY_DEMO: { frl: window.GAPS_DATA },   // demo only ships FRL; others fall back to it
        HEATMAP_DATA: window.HEATMAP_DATA, DEMO_DATA: window.DEMO_DATA,
        DEMO_DATA_BY_SCHOOL: window.DEMO_DATA_BY_SCHOOL, ACH_DATA: window.ACH_DATA,
      },
    };
  }

  function resolve(subject) { return sources.uploaded[subject] || sources.demo[subject] || null; }
  function available(subject) { return !!resolve(subject); }

  function putUploaded(subject, shapes, meta) {
    sources.uploaded[subject] = { shapes, meta: { ...meta, source: 'uploaded' } };
    delete memo[`uploaded:${subject}`];
  }

  function pointGlobals(subject, subgroup) {
    const ds = resolve(subject); if (!ds) return;
    const sh = ds.shapes;
    const gaps = sh.GAPS_DATA_BY_DEMO[subgroup] || sh.GAPS_DATA_BY_DEMO.frl;
    window.GAPS_DATA = gaps;
    window.HEATMAP_DATA = sh.HEATMAP_DATA;
    window.DEMO_DATA = sh.DEMO_DATA;
    window.DEMO_DATA_BY_SCHOOL = sh.DEMO_DATA_BY_SCHOOL;
    window.ACH_DATA = sh.ACH_DATA;
  }

  const store = {
    seedDemo, available, putUploaded,
    setActiveSubject(s) { if (available(s)) { activeSubject = s; pointGlobals(activeSubject, activeSubgroup); } },
    setActiveSubgroup(k) { activeSubgroup = k; pointGlobals(activeSubject, activeSubgroup); },
    getActiveMeta() { const ds = resolve(activeSubject); return ds ? ds.meta : null; },
    activeSubject: () => activeSubject,
  };
  window.GLStore = store;
})();
```

- [ ] **Step 2: Load `store.js` in `index.html`** after `compute.js`:

```html
<script src="engine/store.js"></script>
```

- [ ] **Step 3: Manual verification** — in console after load: `window.GLStore.seedDemo(); window.GLStore.setActiveSubgroup('frl'); window.GAPS_DATA.meta.subject` → `"math"`. `window.GLStore.available('ela')` → `false`.

- [ ] **Step 4: Commit**

```bash
git add engine/store.js index.html
git commit -m "feat(store): dataset registry + window.* seam + demo seeding"
```

---

## Phase 7 — Wire the app: upload, subject swap, DatasetStrip, subgroup selector

### Task 12: Replace synthetic-Math with the store; wire `UploadPage`/`SubjectDropZone` to real ingest

**Files:** Modify `app-shell.jsx`

- [ ] **Step 1: Delete the synthetic-Math machinery.** Remove `__deepClone`, `__mathify`, `__RESIDUAL_FIELDS`, `__CI_FIELDS`, `__transformInPlace`, `ensureMathData`, and the `__DATA_KEYS` transform (app-shell.jsx ~lines 26–102). Replace `ensureMathData()`/`activateSubject(subject)` calls in `AppBody` (lines ~175–176) with:

```jsx
  React.useEffect(() => { if (window.GLStore) window.GLStore.seedDemo(); }, []);
  if (window.GLStore) window.GLStore.setActiveSubject(subject);
  if (window.GLStore) window.GLStore.setActiveSubgroup(demo);
```

Keep `window.WOL_OPTS = { year: 2025, subject };` as-is.

- [ ] **Step 2: Rewrite `SubjectDropZone`'s accept path to really parse.** In `UploadPage`/`SubjectDropZone`, replace the fake `setOne` timer (lines ~498–502) and the `onAccept(f.name)` calls with a real handler that runs ingest + compute + store, then drives the stage and error state:

```jsx
  const onFile = async (key, file) => {
    setFiles(f => ({ ...f, [key]: file.name }));
    setStages(s => ({ ...s, [key]: 'parsing' }));
    setErrors(e => ({ ...e, [key]: null }));
    try {
      const conn = await window.GL.getConnection();
      const res = await window.GLIngest.loadSubjectFile(file, conn, key);
      if (!res.ok) { setStages(s => ({ ...s, [key]: 'idle' })); setErrors(e => ({ ...e, [key]: res })); return; }
      const shapes = await window.GLCompute.computeSlice(key);
      window.GLStore.putUploaded(key, shapes, res.meta);
      setStages(s => ({ ...s, [key]: 'ready' }));
    } catch (err) {
      setStages(s => ({ ...s, [key]: 'idle' }));
      setErrors(e => ({ ...e, [key]: { error: 'exception', message: String(err) } }));
    }
  };
```

Add `const [errors, setErrors] = React.useState({ ela: null, math: null });` to `UploadPage`, pass `onFile` into both `SubjectDropZone`s (replace `onAccept`), and in `SubjectDropZone` call `onFile(subjectKey, f)` from both the drop and file-input handlers (passing the real `File`, not `f.name`). Render `errors[subjectKey]` as a readable message (map `error` codes: `missing_columns` → "Missing columns: " + `missing.join(', ')`; `subject_mismatch` → `This is the ${subjectLabel} slot, but the file looks like ${detected}.`; `no_rows_latest` → "No rows for the latest year."; `no_prefix` → "Couldn't find a *_Z_RESIDUAL column."). Replace the "Looks good — schema validated" copy so it only shows on `ready`.

- [ ] **Step 3: Manual browser verification** — load the page, drop a real Math file in the Math zone → it parses, "Loaded" appears, "Continue" enabled. Navigate to System Scan / Gap Analysis → real numbers render. Drop ELA in the Math zone → inline error. Reload → demo (Math) only.

- [ ] **Step 4: Commit**

```bash
git add app-shell.jsx
git commit -m "feat(app): wire upload to real ingest/compute/store; delete synthetic Math"
```

### Task 13: Wire `DatasetStrip` and the subgroup selector to the store

**Files:** Modify `app-shell.jsx`

- [ ] **Step 1: Make `DatasetStrip` read real meta** (replace the hardcoded string, lines ~345–359):

```jsx
function DatasetStrip() {
  const m = (window.GLStore && window.GLStore.getActiveMeta()) || null;
  const label = m
    ? `${m.districtCode ? m.districtCode + ' · ' : ''}${m.source === 'uploaded' ? m.subject.toUpperCase() + ' upload' : 'bundled demo data'} · ${m.nSchools} schools${(m.latestYear || m.year) ? ' · ' + (m.latestYear || m.year) : ''}`
    : 'No dataset loaded';
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, fontSize:11.5, color:SLU.mute, fontFamily:MONO, flexWrap:'wrap' }}>
      <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</span>
      <span style={{ display:'inline-flex', gap:14, alignItems:'center', flexShrink:0 }}>
        <span><span style={{ color:'#1F8A5B' }}>●</span> private — runs in browser</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Make the subgroup `CSelect` repoint via the store.** In `GapControls` the selector is `<CSelect value={ctx.demo} onChange={ctx.setDemo} ...>`. `ctx.setDemo` already lives in `AppBody`; Task 12 Step 1 already calls `setActiveSubgroup(demo)` each render, so changing `demo` now repoints `window.GAPS_DATA`. Confirm the `DEMOS` map keys match the `SUBGROUPS` keys (`frl, iep, el, race_bw, race_hw`) — they do. No further change needed beyond verifying the forest re-reads on `demo` change (the page is keyed on `subject`; add `demo` to the key if the forest doesn't refresh: change `<div key={subject}>` at line ~212 to `<div key={subject + ':' + demo}>`).

- [ ] **Step 3: Manual verification** — upload a file; change the subgroup selector on Gap Analysis → forest updates to that comparison; DatasetStrip shows the upload label + school count.

- [ ] **Step 4: Commit**

```bash
git add app-shell.jsx
git commit -m "feat(app): live DatasetStrip + working subgroup selector"
```

---

## Phase 8 — Toggle visibility gating

### Task 14: Remove the no-op estimate toggle from System Scan and Demographics; hide at student level

**Files:** Modify `app-shell.jsx`, `demographics.jsx`, `achievement.jsx`

- [ ] **Step 1: System Scan — drop the Method toggle, keep Units.** In `ScanControls` (app-shell.jsx ~1325–1341) replace the `CGroup title="Estimate"` block so only Units remains:

```jsx
function ScanControls({ ctx }) {
  return (
    <ControlsGrid>
      <CGroup title="Slice">
        <CSegmented value={ctx.subject} onChange={ctx.setSubject} options={SUBJECTS} label="Subject" />
      </CGroup>
      <CGroup title="Units">
        <CSegmented value={ctx.unit} onChange={ctx.setUnit}
                    options={{ z: 'SD', weeks: 'Weeks' }} label="Units" hint={UNIT_HINT} />
      </CGroup>
    </ControlsGrid>
  );
}
```

- [ ] **Step 2: Demographics — remove the estimate toggle.** In `demographics.jsx` `DemographicsControls` (~lines 54–57) delete the estimate `CSegmented`. Keep the subject and any unit controls.

- [ ] **Step 3: Status & Growth — hide the toggle at student level.** First read `achievement.jsx` to locate the estimate `CSegmented` and the y-key selection (`y_raw`/`y_shrunk`). Then wrap the estimate toggle so it only shows when `ctx.achLevel === 'school'` (e.g. `{ctx.achLevel === 'school' && <CSegmented .../>}`), and make the figure use `y_raw` when `achLevel === 'student'` regardless of `ctx.estimate`.

- [ ] **Step 4: Manual verification** — System Scan and Demographics no longer show a Raw/Shrunken control; Units still works on System Scan; Gap Analysis and school-level Status & Growth still toggle.

- [ ] **Step 5: Commit**

```bash
git add app-shell.jsx demographics.jsx achievement.jsx
git commit -m "fix(controls): remove no-op estimate toggle from Scan/Demographics; gate at student level"
```

---

## Phase 9 — Re-sign the demo fixture

### Task 15: Flip `data.js` GAPS_DATA to focal − reference

**Files:** Modify `data.js`

- [ ] **Step 1: Re-sign programmatically and review the diff.** Run from repo root:

```bash
node -e "
const fs=require('fs');const w={};const src=fs.readFileSync('data.js','utf8');eval(src);
const g=w.GAPS_DATA;
g.meta.groupA='FRL';g.meta.groupB='non-FRL';g.meta.districtGap=-g.meta.districtGap;
for(const s of g.schools){s.raw_gap=-s.raw_gap;s.shrunk_gap=-s.shrunk_gap;
  s.raw_ci95=[-s.raw_ci95[1],-s.raw_ci95[0]];s.shrunk_ci95=[-s.shrunk_ci95[1],-s.shrunk_ci95[0]];}
const header=src.slice(0,src.indexOf('window.GAPS_DATA'));
fs.writeFileSync('data.js',header+'window.GAPS_DATA = '+JSON.stringify(g,null,2)+';\n');
console.log('re-signed: districtGap',g.meta.districtGap);
"
```

- [ ] **Step 2: Verify** — `node -e "const w={};eval(require('fs').readFileSync('data.js','utf8'));console.log(w.GAPS_DATA.meta.districtGap, w.GAPS_DATA.schools[0].raw_gap)"` → districtGap negative; first school's `raw_gap` negated. Load the app demo → forest shows focal − reference signs; CIs still ordered `[lo,hi]`.

- [ ] **Step 3: Commit**

```bash
git add data.js
git commit -m "refactor(demo): re-sign GAPS_DATA to focal - reference convention"
```

---

## Phase 10 — Methods & copy reconciliation

### Task 16: Make the methods note and FAQ true and accurate

**Files:** Modify `methods.html`, `app-shell.jsx`

- [ ] **Step 1: `methods.html` §1 (residual + gap direction).** Replace the "GrowthLens computes a residual… conditional on prior achievement and grade" paragraph with: the residual is **ingested**, pre-computed by the Missouri DESE growth model; GrowthLens aggregates and shrinks it. Change the gap example from "non-FRL minus FRL" to **focal − reference** ("FRL minus non-FRL; a negative gap means FRL students have the lower mean residual"). Re-check the §2 counter-intuitive-shrinkage example sign.

- [ ] **Step 2: `methods.html` §3 (cell SE) + §2 (shrunk_se caveat).** Add the measurement-error-aware cell-SE formula `SE = √(max(S², ms²)/n)` with the one-line derivation (spec §3.2) and the note that below-min-n schools are excluded from the τ² fit but shown in figures. In §2, add: `shrunk_se` is the conditional posterior SD treating the district mean as known (≈1–2% under the full EB SD).

- [ ] **Step 3: `methods.html` §7 (privacy).** Now literally true — strengthen to: computation runs in DuckDB-WASM **vendored same-origin**; no third-party requests; works offline.

- [ ] **Step 4: FAQ copy (`app-shell.jsx`).** The DuckDB-WASM and "schema validated" claims are now true (leave). Soften the "minimum-n configurable from the Controls card" FAQ answer to: the minimum-n threshold defaults to 10 (configurable in a future release).

- [ ] **Step 5: Manual review** — read `methods.html` end-to-end; confirm no remaining "computes a residual conditional on prior achievement" and the gap direction matches the app.

- [ ] **Step 6: Commit**

```bash
git add methods.html app-shell.jsx
git commit -m "docs(methods): ingested-residual rewrite, cell-SE formula, focal-reference gaps, true privacy copy"
```

---

## Final verification

- [ ] **Run the full test suite** — `node --test test/` → all green.
- [ ] **End-to-end browser pass** — serve (`python -m http.server 8000`), upload a real Math + a real ELA file; verify every page (Overview, Upload, System Scan, Gap Analysis, Status & Growth, Demographics, Export) renders real values; subject toggle switches ELA↔Math; subgroup selector works; PPTX export generates; devtools Network shows only same-origin requests during analysis.
- [ ] **Commit any final fixes**, then this branch (`feature/real-data-ingestion`) is ready for PR/merge.

---

## Spec coverage check (self-review)

- §2 input contract → Tasks 7, 9 (prefix/flags/validate/load). ✓
- §3 statistics → Tasks 2–6 (cellSE, gap, τ², pooled, shrink, summarize, ols), Task 10 (wired). ✓
- §4 architecture/modules + §4.5 shapes → Tasks 8–11. ✓
- §5 ingest UX/errors → Tasks 9, 12. ✓
- §6 figure changes (delete __mathify, DatasetStrip, subgroup selector, toggle gating) → Tasks 12–14. ✓
- §7 methods/copy → Task 16. ✓
- §8 testing → Tasks 1–7 (Node) + manual goldens in 9–12. ✓
- §2.3 re-sign → Task 15. ✓
