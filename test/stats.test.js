const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../engine/stats.js');
const FIXTURE_GAPS = require('./fixtures/gaps.json');

test('module loads', () => { assert.equal(typeof S, 'object'); });

test('cellSE: heterogeneity dominates → classic SEM', () => {
  assert.ok(Math.abs(S.cellSE({ s2: 0.25, ms2: 0.04, n: 100 }) - 0.05) < 1e-9);
});
test('cellSE: measurement floor dominates', () => {
  assert.ok(Math.abs(S.cellSE({ s2: 0.01, ms2: 0.04, n: 100 }) - 0.02) < 1e-9);
});
test('cellSE: n=1 → single-student SE = sqrt(ms2)', () => {
  assert.ok(Math.abs(S.cellSE({ s2: NaN, ms2: 0.09, n: 1 }) - 0.3) < 1e-9);
});
test('cellSE: n=0 → null', () => {
  assert.equal(S.cellSE({ s2: 0, ms2: 0, n: 0 }), null);
});

test('gapSE combines in quadrature', () => {
  assert.ok(Math.abs(S.gapSE(0.3, 0.4) - 0.5) < 1e-9);
});
test('shrink: precision-weighted blend at a known fixed point (tau2=0.0309, mu=0.18)', () => {
  const r = S.shrink({ rawGap: 0.7314, rawSe: 0.2277, tau2: 0.0309, mu: 0.18 });
  assert.ok(Math.abs(r.B - 0.374) < 1e-3, `B=${r.B}`);
  assert.ok(Math.abs(r.shrunkGap - 0.3860) < 5e-4, `shrunkGap=${r.shrunkGap}`);
  assert.ok(Math.abs(r.shrunkSe - 0.1392) < 5e-4, `shrunkSe=${r.shrunkSe}`);
});
test('shrink: B→1 when rawSe→0 (no shrinkage)', () => {
  const r = S.shrink({ rawGap: 0.5, rawSe: 1e-6, tau2: 0.03, mu: 0.1 });
  assert.ok(r.B > 0.9999);
  assert.ok(Math.abs(r.shrunkGap - 0.5) < 1e-3);
});

test('pooledMean: equal weights → simple mean + se', () => {
  const rows = [{ gap: 0, se: 1 }, { gap: 2, se: 1 }];
  const r = S.pooledMean(rows, 0);
  assert.ok(Math.abs(r.mu - 1) < 1e-9);
  assert.ok(Math.abs(r.se - Math.sqrt(0.5)) < 1e-9);
});
test('pooledMean: CI uses t(k−1), not 1.96', () => {
  const rows = [{ gap: 0, se: 1 }, { gap: 2, se: 1 }];        // k=2 → t(1) = 12.706
  const r = S.pooledMean(rows, 0);
  assert.ok(Math.abs((r.ciHi - r.mu) / r.se - 12.706) < 1e-9);
  const seven = Array.from({ length: 7 }, (_, i) => ({ gap: i * 0.1, se: 0.5 })); // k=7 → t(6) = 2.447
  const r7 = S.pooledMean(seven, 0.01);
  assert.ok(Math.abs((r7.ciHi - r7.mu) / r7.se - 2.447) < 1e-9);
});
test('tCrit95: table values, large-df and degenerate-df fallbacks', () => {
  assert.equal(S.tCrit95(1), 12.706);
  assert.equal(S.tCrit95(6), 2.447);
  assert.equal(S.tCrit95(30), 1.96);
  assert.equal(S.tCrit95(500), 1.96);
  assert.equal(S.tCrit95(0), 1.96);
});
test('shrink: muSe widens the posterior SD by the pooled-mean uncertainty', () => {
  // B = 0.5: sd² = 0.5·se² + 0.25·muSe²
  const se = 0.2, tau2 = se * se, muSe = 0.1;
  const r = S.shrink({ rawGap: 0.4, rawSe: se, tau2, mu: 0, muSe });
  assert.ok(Math.abs(r.B - 0.5) < 1e-12);
  assert.ok(Math.abs(r.shrunkSe - Math.sqrt(0.5 * se * se + 0.25 * muSe * muSe)) < 1e-12);
  // default muSe = 0 keeps the classic μ-known form
  const r0 = S.shrink({ rawGap: 0.4, rawSe: se, tau2, mu: 0 });
  assert.ok(Math.abs(r0.shrunkSe - Math.sqrt(0.5) * se) < 1e-12);
});
test('dlTau2: zero between-school variance when all gaps equal', () => {
  const rows = [{ gap: 0.2, se: 0.1 }, { gap: 0.2, se: 0.1 }, { gap: 0.2, se: 0.1 }];
  assert.ok(Math.abs(S.dlTau2(rows)) < 1e-12);
});
test('dlTau2: positive when spread exceeds sampling error', () => {
  const rows = [{ gap: -1, se: 0.1 }, { gap: 0, se: 0.1 }, { gap: 1, se: 0.1 }];
  assert.ok(S.dlTau2(rows) > 0.3);
});

test('remlTau2: zero when all gaps equal', () => {
  const rows = [{ gap: 0.2, se: 0.1 }, { gap: 0.2, se: 0.1 }, { gap: 0.2, se: 0.1 }];
  assert.equal(S.remlTau2(rows), 0);
});
test('remlTau2: recovers ~0.0223 on the 30 fixture gaps (model-correct, NOT fixture 0.0309)', () => {
  const rows = FIXTURE_GAPS.filter(r => r.meets).map(r => ({ gap: r.gap, se: r.se }));
  const t = S.remlTau2(rows);
  assert.ok(Math.abs(t - 0.0223) < 1e-3, `tau2=${t}`);
});
test('remlTau2: pooled mean on fixture gaps ~0.144 (NOT districtGap 0.18)', () => {
  const rows = FIXTURE_GAPS.filter(r => r.meets).map(r => ({ gap: r.gap, se: r.se }));
  const mu = S.pooledMean(rows, S.remlTau2(rows)).mu;
  assert.ok(Math.abs(mu - 0.144) < 5e-3, `mu=${mu}`);
});

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

test('summarize: empty/null input → null', () => {
  assert.equal(S.summarize([]), null);
  assert.equal(S.summarize(null), null);
});
test('ols: n<2 → null', () => {
  assert.equal(S.ols([], 'x', 'y'), null);
  assert.equal(S.ols([{ x: 1, y: 1 }], 'x', 'y'), null);
});
test('ols: vertical (all same x) → null', () => {
  assert.equal(S.ols([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], 'x', 'y'), null);
});
test('ols: horizontal line → r2 = 1 (not NaN)', () => {
  const r = S.ols([{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }], 'x', 'y');
  assert.equal(r.r2, 1);
});
