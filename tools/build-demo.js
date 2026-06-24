// GrowthLens - district-facing value-added interpretation tool
// Copyright (C) 2026 Andrew Camp
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// Regenerates the bundled demo fixtures (data.js + heatmap-data.js) from one
// deterministic synthetic student dataset for a small, grade-banded district.
//
// Growth residuals are simulated as first-stage OLS VAM residuals of a
// standardized score `score_z` on priors + covariates with R^2 ~ 0.70, per the
// "simulate student-level first-stage VAM residuals" spec:
//
//   Per subject x grade cell (pooled across schools):
//     y    = score_z - mean(score_z)              (s = sd(y))
//     u    = school(8%) + student(92%) noise, standardized
//     z    = residuals of lm(u ~ y), rescaled to sd 1   (orthogonal to y)
//     resid = (1 - R2) * y + sqrt(R2 * (1 - R2)) * s * z
//           = 0.30 * y + 0.458 * s * z
//
//   => mean(resid)=0 exactly, sd(resid)=0.548*s, cor(resid, score_z)=0.548,
//      cor(fitted, resid)=0, with an 8%-variance school value-add component
//      (drawn once per school, reused across grades). Math noise is left-skewed
//      and heavy-tailed; |resid|>2.2 is redrawn (not clamped). The forest gaps
//      and heatmap are then computed from these residuals with engine/stats.js.
//
//   node tools/build-demo.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'engine', 'stats.js')); // UMD -> module.exports

const MIN_N = 10;
const R2 = 0.70;
const A = 1 - R2;                    // 0.30 — weight on y
const Bz = Math.sqrt(R2 * (1 - R2)); // 0.4583 — weight on s*z

const LICENSE = [
  '// GrowthLens - district-facing value-added interpretation tool',
  '// Copyright (C) 2026 Andrew Camp',
  '//',
  '// This program is free software: you can redistribute it and/or modify',
  '// it under the terms of the GNU Affero General Public License as published',
  '// by the Free Software Foundation, version 3.',
  '//',
  '// This program is distributed in the hope that it will be useful,',
  '// but WITHOUT ANY WARRANTY; without even the implied warranty of',
  '// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the',
  '// GNU Affero General Public License for more details.',
  '',
].join('\n');

// ---- deterministic RNG + draws --------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Master seed: overridable for seed-searching (the self-check demands τ² > 0 on
// all five comparisons, which with only 6 fit schools is luck-of-the-draw).
const SEED = Number(process.env.DEMO_SEED || 20260627);
const rng = mulberry32(SEED);
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// Student-t with df degrees of freedom (heavy tails).
function tdist(df) {
  let c = 0; for (let i = 0; i < df; i++) { const g = gauss(); c += g * g; }
  return gauss() / Math.sqrt(c / df);
}
// Math shape: left-skewed, heavy-tailed. Two-piece t(8): stretch the left tail.
const M_NEG = 1.30, M_POS = 0.82;
function mathRaw() { const t = tdist(8); return t < 0 ? t * M_NEG : t * M_POS; }

// ---- vector helpers --------------------------------------------------------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
function sd(a) { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
function skew(a) { const m = mean(a), s = sd(a) || 1; return a.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0) / a.length; }
function standardize(a) { const m = mean(a), s = sd(a) || 1; return a.map(x => (x - m) / s); }
function cor(a, b) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
function round(x, dp) { if (!isFinite(x)) return x; const f = Math.pow(10, dp); return Math.round(x * f) / f; }

// ---- district definition (grade-banded small district) ---------------------
// scoreLevel  = school achievement level (drives between-school score spread).
// frlScoreGap = how far FRL students score below non-FRL in this school (SDs);
//               the residual FRL gap emerges as ~ -0.30 * frlScoreGap.
// One tiny elementary (Sch-1005) sits below the 10-student cutoff.
const ELEM = [3, 4, 5], MID = [6, 7, 8];
const SCORE_NOISE_SD = 0.84;          // idiosyncratic score sd -> within-cell sd(score_z) ~ 0.9
const SCHOOLS = [
  { id: 'Sch-1001', band: 'elem', scoreLevel:  0.18, frlShare: 0.46, frlScoreGap: 0.60, gradeSize: 84 },
  { id: 'Sch-1002', band: 'elem', scoreLevel:  0.26, frlShare: 0.38, frlScoreGap: 0.30, gradeSize: 88 },
  { id: 'Sch-1003', band: 'elem', scoreLevel: -0.12, frlShare: 0.58, frlScoreGap: 0.70, gradeSize: 80 },
  { id: 'Sch-1004', band: 'elem', scoreLevel:  0.04, frlShare: 0.50, frlScoreGap: 0.45, gradeSize: 86 },
  { id: 'Sch-1005', band: 'elem', scoreLevel: -0.26, frlShare: 0.72, frlScoreGap: 0.50, gradeSize:  7 },
  { id: 'Sch-1006', band: 'mid',  scoreLevel: -0.08, frlShare: 0.52, frlScoreGap: 0.35, gradeSize: 152 },
  { id: 'Sch-1007', band: 'mid',  scoreLevel:  0.10, frlShare: 0.44, frlScoreGap: 0.50, gradeSize: 158 },
];

// School value-add component of u (8% of variance), one draw per school, reused
// across all grades within the school (school effects persist across grades).
const schoolU = {};
for (const s of SCHOOLS) schoolU[s.id] = gauss();

// Per-school multipliers on the demographic score gaps — without between-school
// heterogeneity REML correctly finds τ² = 0 and every school's shrunken gap
// collapses onto the pooled mean, which makes for a degenerate demo forest.
const GAP_MULT = {};
for (const s of SCHOOLS) {
  GAP_MULT[s.id] = {
    iep: 0.35 + 1.3 * rng(),
    el:  0.35 + 1.3 * rng(),
    b:   0.35 + 1.3 * rng(),
    h:   0.35 + 1.3 * rng(),
  };
}

// ---- generate one synthetic student dataset --------------------------------
// Demographic score gaps (score-SD units); the residual gap for each emerges
// as ≈ -0.30 × gap through the VAM construction below.
const IEP_GAP = 0.70, EL_GAP = 0.55, B_GAP = 0.55, H_GAP = 0.30;
const students = [];
for (const sc of SCHOOLS) {
  // Race mix loosely tracks the school's FRL share so demographics correlate
  // plausibly; ~13% Hispanic and ~7% other/multiracial district-wide.
  const blackShare = clamp(0.10 + (sc.frlShare - 0.45) * 0.6, 0.05, 0.40);
  for (const grade of (sc.band === 'elem' ? ELEM : MID)) {
    const n = Math.max(1, Math.round(sc.gradeSize * (0.9 + 0.2 * rng())));
    for (let i = 0; i < n; i++) {
      const r = rng();
      const race = r < blackShare ? 'black'
                 : r < blackShare + 0.13 ? 'hispanic'
                 : r < blackShare + 0.20 ? 'other' : 'white';
      students.push({
        school: sc, sid: sc.id, grade,
        frl: rng() < sc.frlShare,
        iep: rng() < 0.13,
        el:  rng() < 0.10,
        race,
        scoreIdioRaw: mathRaw(),
        studentURaw: mathRaw(),
        residual_se: clamp(0.30 + gauss() * 0.05, 0.20, 0.50),
        score_z: 0, y: 0, resid: 0,
      });
    }
  }
}

// ---- per subject x grade cell: build score_z, then VAM residuals -----------
const GRADES = [3, 4, 5, 6, 7, 8];
// Per-grade district offset: the VAM is fit on the STATE, so a single district's
// residuals need not be mean-zero within a grade. This gives the heatmap real
// grade-level patterns instead of columns that sum to exactly 0. It is added to
// FRL and non-FRL students alike, so it cancels out of the forest FRL gap.
const GRADE_OFFSET = {};
for (const g of GRADES) GRADE_OFFSET[g] = gauss() * 0.085;
const cellReport = [];
for (const g of GRADES) {
  const cell = students.filter(st => st.grade === g);
  if (cell.length < 2) continue;

  // score_z = scoreLevel + demographic score gaps + SCORE_NOISE_SD * standardized-math-noise
  const idioStd = standardize(cell.map(st => st.scoreIdioRaw));
  cell.forEach((st, k) => {
    const m = GAP_MULT[st.sid];
    st.score_z = st.school.scoreLevel
      + (st.frl ? -st.school.frlScoreGap : 0)
      + (st.iep ? -IEP_GAP * m.iep : 0)
      + (st.el ? -EL_GAP * m.el : 0)
      + (st.race === 'black' ? -B_GAP * m.b : st.race === 'hispanic' ? -H_GAP * m.h : 0)
      + SCORE_NOISE_SD * idioStd[k];
  });
  const cmean = mean(cell.map(st => st.score_z));
  cell.forEach(st => { st.y = st.score_z - cmean; });
  const s = sd(cell.map(st => st.y));
  const delta = GRADE_OFFSET[g];   // per-grade district offset (district vs. state)

  // resid = A*y + Bz*s*z + delta, with z = (u residualized on y), rescaled to sd 1.
  // Redraw students whose final |resid| > 2.2 (do not clamp), then rebuild.
  for (let iter = 0; iter < 30; iter++) {
    const uStd = standardize(cell.map(st => st.studentURaw));
    cell.forEach((st, k) => { st.u = schoolU[st.sid] * Math.sqrt(0.08) + uStd[k] * Math.sqrt(0.92); });
    const ys = cell.map(st => st.y), us = cell.map(st => st.u), um = mean(us);
    let syy = 0, suy = 0;
    for (let k = 0; k < cell.length; k++) { syy += ys[k] * ys[k]; suy += (us[k] - um) * ys[k]; }
    const slope = syy > 0 ? suy / syy : 0;
    const z = standardize(cell.map((st, k) => (us[k] - um) - slope * ys[k]));
    cell.forEach((st, k) => { st.resid = A * st.y + Bz * s * z[k] + delta; });
    const bad = cell.filter(st => Math.abs(st.resid) > 2.2);
    if (!bad.length) break;
    bad.forEach(st => { st.studentURaw = mathRaw(); });
  }

  const resid = cell.map(st => st.resid), scorez = cell.map(st => st.score_z);
  const fitted = cell.map(st => st.score_z - st.resid);
  cellReport.push({
    grade: g, n: cell.length, s, offset: delta,
    meanR: mean(resid), sdRatio: sd(resid) / s,
    corRY: cor(resid, scorez), corFR: cor(fitted, resid),
    skew: skew(resid), min: Math.min(...resid), max: Math.max(...resid),
  });
}

// ---- displayed same-year status (achievement scatter x-axis) ---------------
// The VAM construction above makes resid a direct function of score_z, so
// cor(growth, score_z) ≈ 0.55 at the student level and the school dots line up
// along the diagonal — stronger than real data, where a school's status mostly
// reflects prior attainment that the growth model already removed. The
// *displayed* status therefore keeps each school's within-school score shape
// but rebuilds the school-level status means with a CONTROLLED correlation to
// school growth (Gram-Schmidt against the school growth means, the same trick
// the cell loop uses for z ⊥ y — with 7 schools, free noise draws are too
// luck-of-the-draw), plus independent student-level noise. Drawn AFTER every
// other RNG draw so the residuals, gaps, and heatmap stay byte-identical.
const STATUS_SCHOOL_COR = 0.35;  // target school-level status⇄growth correlation
const STATUS_STUDENT_SD = 1.0;   // independent student-level status noise
{
  const ids = SCHOOLS.map(sc => sc.id);
  const scoreMeanById = {}, residMeanById = {};
  for (const sc of SCHOOLS) {
    const mine = students.filter(st => st.sid === sc.id);
    scoreMeanById[sc.id] = mean(mine.map(st => st.score_z));
    residMeanById[sc.id] = mean(mine.map(st => st.resid));
  }
  const r = standardize(ids.map(id => residMeanById[id]));
  const e0 = ids.map(() => gauss());
  const rho = cor(e0, r);
  const eperp = standardize(e0.map((e, i) => e - rho * sd(e0) * r[i]));
  const level = mean(ids.map(id => scoreMeanById[id]));
  const spread = sd(ids.map(id => scoreMeanById[id]));   // keep the x-axis spread natural
  const statusMeanById = {};
  ids.forEach((id, i) => {
    statusMeanById[id] = level
      + spread * (STATUS_SCHOOL_COR * r[i] + Math.sqrt(1 - STATUS_SCHOOL_COR ** 2) * eperp[i]);
  });
  students.forEach(st => {
    st.status_z = (st.score_z - scoreMeanById[st.sid]) + statusMeanById[st.sid]
      + gauss() * STATUS_STUDENT_SD;
  });
}

// ---- heatmap (school x grade mean residual, with EB shrinkage) --------------
// Mirrors engine/compute.js buildHeatmap: each cell shrinks toward its grade's
// pooled district mean (schools are the exchangeable units within a grade
// column), and the Overall column uses the SAME school-level shrinkage as the
// Status & Growth scatter so the two figures always agree.
function buildHeatmap() {
  // Per-cell stats, grouped by grade for the within-grade pooling.
  const cellsByGrade = {};
  const cellLookup = {};
  for (const sc of SCHOOLS) {
    for (const grade of (sc.band === 'elem' ? ELEM : MID)) {
      const rows = students.filter(st => st.sid === sc.id && st.grade === grade);
      const c = { school_id: sc.id, grade, ...cellStats(rows) };
      (cellsByGrade[grade] = cellsByGrade[grade] || []).push(c);
      cellLookup[`${sc.id}|${grade}`] = c;
    }
  }
  for (const gradeCells of Object.values(cellsByGrade)) {
    const fit = gradeCells.filter(c => c.n >= MIN_N && isFinite(c.se)).map(c => ({ gap: c.rbar, se: c.se }));
    const canShrink = fit.length >= 2;
    const tau2 = canShrink ? S.remlTau2(fit) : 0;
    const pooled = canShrink ? S.pooledMean(fit, tau2) : null;
    for (const c of gradeCells) {
      c.rs = (canShrink && pooled && isFinite(c.se))
        ? S.shrink({ rawGap: c.rbar, rawSe: c.se, tau2, mu: pooled.mu }).shrunkGap
        : null;
    }
  }
  // School-level overall (same fit rule as buildAchievement).
  const overallBySchool = {};
  {
    const agg = SCHOOLS.map(sc => ({ id: sc.id, ...cellStats(students.filter(st => st.sid === sc.id)) }));
    const fit = agg.filter(s => s.n >= MIN_N).map(s => ({ gap: s.rbar, se: s.se }));
    const canShrink = fit.length >= 2;
    const tau2 = canShrink ? S.remlTau2(fit) : 0;
    const pooled = S.pooledMean(fit, tau2) || { mu: 0 };
    for (const s of agg) {
      overallBySchool[s.id] = {
        n: s.n, r: round(s.rbar, 3),
        rs: round(canShrink ? S.shrink({ rawGap: s.rbar, rawSe: s.se, tau2, mu: pooled.mu }).shrunkGap : s.rbar, 3),
      };
    }
  }
  const schools = SCHOOLS.map(sc => {
    const grades = {};
    for (const grade of (sc.band === 'elem' ? ELEM : MID)) {
      const c = cellLookup[`${sc.id}|${grade}`];
      grades[grade] = { n: c.n, r: round(c.rbar, 3), rs: c.rs == null ? null : round(c.rs, 3), ok: c.n >= MIN_N };
    }
    return { school_id: sc.id, grades, overall: overallBySchool[sc.id] };
  });
  return { meta: { subject: 'math' }, schools };
}

// ---- gaps for all five DESE comparisons (mirror engine/compute.js buildGaps)
// Same keys/labels as engine/ingest.js SUBGROUPS so the demo behaves exactly
// like an upload — every "Groups to compare" option is real in demo mode.
const COMPARISONS = [
  { key: 'frl',     label: 'FRL · economically disadvantaged', aLabel: 'FRL',      bLabel: 'non-FRL', a: st => st.frl,  b: st => !st.frl },
  { key: 'iep',     label: 'IEP · students with disabilities', aLabel: 'IEP',      bLabel: 'non-IEP', a: st => st.iep,  b: st => !st.iep },
  { key: 'el',      label: 'EL · English learners',            aLabel: 'EL',       bLabel: 'non-EL',  a: st => st.el,   b: st => !st.el },
  { key: 'race_bw', label: 'Race · Black vs. White',           aLabel: 'Black',    bLabel: 'White',   a: st => st.race === 'black',    b: st => st.race === 'white' },
  { key: 'race_hw', label: 'Race · Hispanic vs. White',        aLabel: 'Hispanic', bLabel: 'White',   a: st => st.race === 'hispanic', b: st => st.race === 'white' },
];

function cellStats(rows) {
  const n = rows.length;
  const m = mean(rows.map(r => r.resid));
  const s2 = n >= 2 ? rows.reduce((a, r) => a + (r.resid - m) ** 2, 0) / (n - 1) : NaN;
  const ms2 = mean(rows.map(r => r.residual_se * r.residual_se));
  return { n, rbar: m, se: S.cellSE({ s2, ms2, n }) };
}
function buildGaps(cmp) {
  const rows = SCHOOLS.map(sc => {
    const mine = students.filter(st => st.sid === sc.id);
    const a = cellStats(mine.filter(cmp.a));             // focal
    const b = cellStats(mine.filter(cmp.b));             // reference
    // Mirror engine/compute.js: a school missing one side entirely carries
    // null estimates (there's no gap to compute) but stays listed so the UI
    // can show it in the too-few section; a school with no students on
    // either side has no SQL rows at all and is dropped.
    if (a.n === 0 || b.n === 0) {
      return { school_id: sc.id, n_a: a.n, n_b: b.n,
               raw_gap: null, raw_se: null, meets_min_cell: false };
    }
    return {
      school_id: sc.id, n_a: a.n, n_b: b.n,
      raw_gap: a.rbar - b.rbar, raw_se: S.gapSE(a.se, b.se),
      meets_min_cell: a.n >= MIN_N && b.n >= MIN_N,
    };
  }).filter(s => s.n_a > 0 || s.n_b > 0);
  const fit = rows.filter(s => s.meets_min_cell).map(s => ({ gap: s.raw_gap, se: s.raw_se }));
  const canShrink = fit.length >= 2;                     // same τ² guard as compute.js
  const tau2 = canShrink ? S.remlTau2(fit) : 0;
  const pooled = S.pooledMean(fit, tau2) || { mu: 0, ciLo: 0, ciHi: 0 };
  const schools = rows.map(s => {
    if (s.raw_gap == null) {
      return { school_id: s.school_id, n_a: s.n_a, n_b: s.n_b,
               raw_gap: null, raw_se: null, raw_ci95: null,
               shrunk_gap: null, shrunk_se: null, shrunk_ci95: null,
               shrinkage_factor: null, meets_min_cell: false };
    }
    const sh = canShrink
      ? S.shrink({ rawGap: s.raw_gap, rawSe: s.raw_se, tau2, mu: pooled.mu })
      : { shrunkGap: s.raw_gap, shrunkSe: s.raw_se, B: 1 };
    return {
      school_id: s.school_id, n_a: s.n_a, n_b: s.n_b,
      raw_gap: round(s.raw_gap, 4), raw_se: round(s.raw_se, 4),
      raw_ci95: [round(s.raw_gap - 1.96 * s.raw_se, 4), round(s.raw_gap + 1.96 * s.raw_se, 4)],
      shrunk_gap: round(sh.shrunkGap, 4), shrunk_se: round(sh.shrunkSe, 4),
      shrunk_ci95: [round(sh.shrunkGap - 1.96 * sh.shrunkSe, 4), round(sh.shrunkGap + 1.96 * sh.shrunkSe, 4)],
      shrinkage_factor: round(sh.B, 3), meets_min_cell: s.meets_min_cell,
    };
  }).sort((x, y) => (x.shrunk_gap ?? Infinity) - (y.shrunk_gap ?? Infinity));
  const meta = {
    subject: 'math', demographic: cmp.key, groupA: cmp.aLabel, groupB: cmp.bLabel,
    districtGap: round(pooled.mu, 4), districtCi95: [round(pooled.ciLo, 4), round(pooled.ciHi, 4)],
    tauSquared: round(tau2, 4),
    nSchools: schools.length, nMeetingThreshold: rows.filter(s => s.meets_min_cell).length, minCellSize: MIN_N,
  };
  return { meta, schools };
}

// ---- demographics box plots (mirror engine/compute.js buildDemo) ------------
function sampleOutliers(outliers, k = 8) {
  if (!outliers || outliers.length <= k) return outliers || [];
  const step = Math.ceil(outliers.length / k);
  return outliers.filter((_, i) => i % step === 0);
}
function buildDemoData() {
  const districtMean = round(mean(students.map(st => st.resid)), 4);
  const demoData = {};
  for (const cmp of COMPARISONS) {
    const groups = [];
    for (const [key, label, pred] of [['A', cmp.aLabel, cmp.a], ['B', cmp.bLabel, cmp.b]]) {
      const stat = S.summarize(students.filter(pred).map(st => st.resid));
      if (!stat) continue;
      groups.push({
        key, label, n: stat.n,
        mean: round(stat.mean, 4), median: round(stat.median, 4),
        q1: round(stat.q1, 4), q3: round(stat.q3, 4),
        whiskerLo: round(stat.whiskerLo, 4), whiskerHi: round(stat.whiskerHi, 4),
        min: round(stat.min, 4), max: round(stat.max, 4),
        outliers: sampleOutliers(stat.outliers).map(v => round(v, 4)),
      });
    }
    demoData[cmp.key] = { label: cmp.label, groups, districtMean };
  }
  return demoData;
}

// ---- achievement scatter (mirror engine/compute.js buildAchievement) --------
const SCHOOL_NAMES = {
  'Sch-1001': 'Lincoln Elementary', 'Sch-1002': 'Carver Elementary',
  'Sch-1003': 'Riverside Elementary', 'Sch-1004': 'Oakwood Elementary',
  'Sch-1005': 'Hillcrest Elementary', 'Sch-1006': 'Marshall Middle',
  'Sch-1007': 'Truman Middle',
};
function buildAchievement() {
  const agg = SCHOOLS.map(sc => {
    const mine = students.filter(st => st.sid === sc.id);
    const c = cellStats(mine);
    return { sc, n: c.n, rbar: c.rbar, se: c.se, status: mean(mine.map(st => st.status_z)) };
  });
  const fit = agg.filter(s => s.n >= MIN_N).map(s => ({ gap: s.rbar, se: s.se }));
  const canShrink = fit.length >= 2;
  const tau2 = canShrink ? S.remlTau2(fit) : 0;
  const pooled = S.pooledMean(fit, tau2) || { mu: 0 };
  // Coherence: every shrunken value must sit between its raw value and the
  // pooled mean actually used (B ∈ [0,1] guarantees this).
  for (const s of agg) {
    if (!canShrink) break;
    const sh = S.shrink({ rawGap: s.rbar, rawSe: s.se, tau2, mu: pooled.mu }).shrunkGap;
    if ((sh - s.rbar) * (pooled.mu - s.rbar) < -1e-9) {
      throw new Error(`shrunken school value not between raw and pooled mean (${s.sc.id})`);
    }
  }
  const schoolPoints = agg.map((s, i) => ({
    school_id: s.sc.id, school_name: SCHOOL_NAMES[s.sc.id] || s.sc.id,
    school_idx: i, hue: Math.round((i * 360 / agg.length) % 360),
    x: round(s.status, 4), y_raw: round(s.rbar, 4),
    y_shrunk: round(canShrink ? S.shrink({ rawGap: s.rbar, rawSe: s.se, tau2, mu: pooled.mu }).shrunkGap : s.rbar, 4),
    n: s.n,
  }));
  const idx = Object.fromEntries(schoolPoints.map((s, i) => [s.school_id, i]));
  const studentPoints = students.map(st => ({
    school_id: st.sid, grade: st.grade, hue: schoolPoints[idx[st.sid]].hue,
    x: round(st.status_z, 3), y_raw: round(st.resid, 3),
  }));
  // Per-grade school points (mirror engine/compute.js buildAchievement): each
  // grade pools its own schools with the same τ²>0 shrinkage guard, and reuses
  // the all-grades idx/hue so a school keeps its color across grade filters.
  const byGrade = {};
  for (const g of GRADES) {
    const cells = SCHOOLS.map(sc => {
      const mine = students.filter(st => st.sid === sc.id && st.grade === g);
      if (!mine.length) return null;
      const c = cellStats(mine);
      return { sc, n: c.n, rbar: c.rbar, se: c.se, status: mean(mine.map(st => st.status_z)) };
    }).filter(Boolean);
    if (!cells.length) continue;
    const gfit = cells.filter(s => s.n >= MIN_N).map(s => ({ gap: s.rbar, se: s.se }));
    const genough = gfit.length >= 2;
    const gtau2 = genough ? S.remlTau2(gfit) : 0;
    const gShrink = genough && gtau2 > 0;
    const gpool = S.pooledMean(gfit, gtau2) || { mu: 0 };
    byGrade[String(g)] = cells.map(s => ({
      school_id: s.sc.id, school_name: SCHOOL_NAMES[s.sc.id] || s.sc.id,
      school_idx: idx[s.sc.id], hue: schoolPoints[idx[s.sc.id]].hue,
      x: round(s.status, 4), y_raw: round(s.rbar, 4),
      y_shrunk: round(gShrink ? S.shrink({ rawGap: s.rbar, rawSe: s.se, tau2: gtau2, mu: gpool.mu }).shrunkGap : s.rbar, 4),
      n: s.n,
    }));
  }
  return { student: { points: studentPoints }, school: { points: schoolPoints, byGrade } };
}

// ---- serialize -------------------------------------------------------------
function fmtSchoolRow(s) {
  const ci = a => a ? `[${a[0]}, ${a[1]}]` : 'null';
  return `    { school_id: ${JSON.stringify(s.school_id)}, n_a: ${s.n_a}, n_b: ${s.n_b}, `
    + `raw_gap: ${s.raw_gap}, raw_se: ${s.raw_se}, raw_ci95: ${ci(s.raw_ci95)}, `
    + `shrunk_gap: ${s.shrunk_gap}, shrunk_se: ${s.shrunk_se}, shrunk_ci95: ${ci(s.shrunk_ci95)}, `
    + `shrinkage_factor: ${s.shrinkage_factor}, meets_min_cell: ${s.meets_min_cell} },`;
}
function fmtGapSlice(gaps) {
  const m = gaps.meta;
  return '{\n  meta: {\n'
    + `    subject: ${JSON.stringify(m.subject)},\n    demographic: ${JSON.stringify(m.demographic)},\n`
    + `    groupA: ${JSON.stringify(m.groupA)},\n    groupB: ${JSON.stringify(m.groupB)},\n`
    + `    districtGap: ${m.districtGap},\n    districtCi95: [${m.districtCi95[0]}, ${m.districtCi95[1]}],\n    tauSquared: ${m.tauSquared},\n`
    + `    nSchools: ${m.nSchools},\n    nMeetingThreshold: ${m.nMeetingThreshold},\n    minCellSize: ${m.minCellSize},\n  },\n`
    + '  schools: [\n' + gaps.schools.map(fmtSchoolRow).join('\n') + '\n  ],\n}';
}
function writeGaps(gapsByDemo) {
  const slices = Object.entries(gapsByDemo)
    .map(([k, g]) => `${k}: ${fmtGapSlice(g).replace(/\n/g, '\n  ')},`)
    .join('\n  ');
  const out = LICENSE
    + '\n// Forest plot data — all five DESE comparisons for the coherent small\n'
    + '// district, generated by tools/build-demo.js. The demo behaves exactly like\n'
    + '// an upload: every "Groups to compare" option is a real engine-computed slice.\n'
    + 'window.GAPS_DATA_DEMO_ALL = {\n  ' + slices + '\n};\n'
    + 'window.GAPS_DATA = window.GAPS_DATA_DEMO_ALL.frl;\n';
  fs.writeFileSync(path.join(ROOT, 'data.js'), out);
}
function writeDemoData(demoData, ach) {
  fs.writeFileSync(path.join(ROOT, 'demo-data.js'),
    LICENSE
    + '\n// Demographics box plots + achievement scatter for the coherent small\n'
    + '// district — generated by tools/build-demo.js through engine/stats.js,\n'
    + '// the same math the upload pipeline uses.\n'
    + 'window.DEMO_DATA = ' + JSON.stringify(demoData) + ';\n'
    + 'window.ACH_DATA = ' + JSON.stringify(ach) + ';\n');
}
function writeHeatmap(heat) {
  fs.writeFileSync(path.join(ROOT, 'heatmap-data.js'),
    LICENSE + '\n// Heatmap data — school × grade residuals, generated by tools/build-demo.js.\n'
    + 'window.HEATMAP_DATA = ' + JSON.stringify(heat) + ';\n');
}

// ---- run + validation ------------------------------------------------------
const heat = buildHeatmap();
const gapsByDemo = {};
for (const cmp of COMPARISONS) gapsByDemo[cmp.key] = buildGaps(cmp);
const gaps = gapsByDemo.frl;
const demoData = buildDemoData();
const ach = buildAchievement();
writeGaps(gapsByDemo);
writeHeatmap(heat);
writeDemoData(demoData, ach);

console.log('District:', gaps.meta.nSchools, 'schools,', students.length, 'students (Math, grades 3-8).');
for (const cmp of COMPARISONS) {
  const g = gapsByDemo[cmp.key];
  console.log(`  ${cmp.key.padEnd(8)} district gap ${String(g.meta.districtGap).padStart(8)} | tau^2 ${String(g.meta.tauSquared).padStart(7)} | meeting ${g.meta.nMeetingThreshold}/${g.meta.nSchools}`);
}

console.log('\nPer-cell residual checks (targets: mean ≈ grade offset, sd/sd_score 0.548, cor(r,score) 0.548, cor(fit,r) 0):');
console.log('  grade    n   s    offset  mean   sd/s   cor_rY  cor_fR  skew    min     max');
for (const c of cellReport) {
  const f = (x, w = 6, d = 3) => x.toFixed(d).padStart(w);
  console.log(`   ${c.grade}    ${String(c.n).padStart(4)} ${f(c.s, 5)} ${f(c.offset)} ${f(c.meanR)} ${f(c.sdRatio)} ${f(c.corRY)} ${f(c.corFR)} ${f(c.skew)} ${f(c.min)} ${f(c.max)}`);
}

// Pooled: SD of school mean residuals (target ~0.10-0.13) + sign persistence.
const schoolMeans = SCHOOLS.map(sc => mean(students.filter(st => st.sid === sc.id).map(st => st.resid)));
console.log('\nPooled checks:');
console.log('  SD of school mean residuals:', round(sd(schoolMeans), 4), '(target ~0.10-0.13)');
let persistOk = 0;
for (const sc of SCHOOLS) {
  const overall = mean(students.filter(st => st.sid === sc.id).map(st => st.resid));
  const grades = (sc.band === 'elem' ? ELEM : MID);
  const sameSign = grades.filter(g => {
    const gm = mean(students.filter(st => st.sid === sc.id && st.grade === g).map(st => st.resid));
    return Math.sign(gm) === Math.sign(overall);
  }).length;
  if (sameSign >= 2) persistOk++;
  console.log(`  ${sc.id}  overall ${round(overall, 3)}  same-sign grades ${sameSign}/${grades.length}`);
}
console.log('  schools with persistent sign (>=2/3 grades):', persistOk + '/7');

// Displayed status ⇄ growth: should be noticeably weaker than the VAM's
// internal cor(resid, score_z) = 0.548, at both levels.
const statusCorStudent = cor(students.map(st => st.resid), students.map(st => st.status_z));
const schoolStatusMeans = SCHOOLS.map(sc => mean(students.filter(st => st.sid === sc.id).map(st => st.status_z)));
const statusCorSchool = cor(schoolMeans, schoolStatusMeans);
console.log('\nDisplayed status vs. growth:');
console.log('  cor(resid, status) student-level:', round(statusCorStudent, 3), '(target ~0.25-0.45)');
console.log('  cor(resid, status) school-level :', round(statusCorSchool, 3));

const errs = [];
if (gaps.meta.nSchools !== 7) errs.push('expected 7 schools');
if (gaps.meta.nMeetingThreshold !== 6) errs.push('expected 6 meeting threshold, got ' + gaps.meta.nMeetingThreshold);
if (!(gaps.meta.districtGap < 0)) errs.push('expected negative district FRL gap');
for (const k of ['iep', 'el', 'race_bw', 'race_hw']) {
  if (!(gapsByDemo[k].meta.districtGap < 0)) errs.push(`expected negative district ${k} gap`);
}
// Every slice needs real between-school spread — τ² = 0 collapses the shrunken
// forest onto a single point with zero-width CIs (legitimate REML output, but
// a degenerate demo). Re-tune GAP_MULT / the master seed if this trips.
for (const k of Object.keys(gapsByDemo)) {
  if (!(gapsByDemo[k].meta.tauSquared > 0)) errs.push(`tau^2 = 0 for ${k} slice`);
}
if (statusCorStudent < 0.15 || statusCorStudent > 0.5) errs.push(`student status⇄growth cor ${round(statusCorStudent, 3)} outside 0.15-0.5`);
if (cellReport.some(c => Math.abs(c.sdRatio - 0.548) > 0.02)) errs.push('sd ratio off target');
if (cellReport.some(c => Math.abs(c.corRY - 0.548) > 0.03)) errs.push('cor(resid,score) off target');
if (cellReport.some(c => Math.abs(c.corFR) > 0.02)) errs.push('cor(fitted,resid) not ~0');
if (sd(cellReport.map(c => c.offset)) < 0.03) errs.push('grade offsets too small to register');
if (demoData.frl.groups.length !== 2 || demoData.race_bw.groups.length !== 2) errs.push('demo box-plot groups malformed');
if (errs.length) { console.error('\nSELF-CHECK FAILED:', errs.join('; ')); process.exit(1); }
console.log('\nSelf-check OK. Wrote data.js + heatmap-data.js + demo-data.js.');
