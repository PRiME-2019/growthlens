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
const rng = mulberry32(20260609);
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

// ---- generate one synthetic student dataset --------------------------------
const students = [];
for (const sc of SCHOOLS) {
  for (const grade of (sc.band === 'elem' ? ELEM : MID)) {
    const n = Math.max(1, Math.round(sc.gradeSize * (0.9 + 0.2 * rng())));
    for (let i = 0; i < n; i++) {
      students.push({
        school: sc, sid: sc.id, grade,
        frl: rng() < sc.frlShare,
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

  // score_z = scoreLevel + (frl ? -frlScoreGap : 0) + SCORE_NOISE_SD * standardized-math-noise
  const idioStd = standardize(cell.map(st => st.scoreIdioRaw));
  cell.forEach((st, k) => {
    st.score_z = st.school.scoreLevel + (st.frl ? -st.school.frlScoreGap : 0) + SCORE_NOISE_SD * idioStd[k];
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

// ---- heatmap (school x grade mean residual) --------------------------------
function buildHeatmap() {
  const schools = SCHOOLS.map(sc => {
    const grades = {};
    for (const grade of (sc.band === 'elem' ? ELEM : MID)) {
      const r = students.filter(st => st.sid === sc.id && st.grade === grade).map(st => st.resid);
      grades[grade] = { n: r.length, r: round(mean(r), 3), ok: r.length >= MIN_N };
    }
    return { school_id: sc.id, grades };
  });
  return { meta: { subject: 'math' }, schools };
}

// ---- forest / FRL gap (mirror engine/compute.js buildGaps for the frl slice)
function cellStats(rows) {
  const n = rows.length;
  const m = mean(rows.map(r => r.resid));
  const s2 = n >= 2 ? rows.reduce((a, r) => a + (r.resid - m) ** 2, 0) / (n - 1) : NaN;
  const ms2 = mean(rows.map(r => r.residual_se * r.residual_se));
  return { n, rbar: m, se: S.cellSE({ s2, ms2, n }) };
}
function buildGaps() {
  const rows = SCHOOLS.map(sc => {
    const mine = students.filter(st => st.sid === sc.id);
    const a = cellStats(mine.filter(st => st.frl));      // focal = FRL
    const b = cellStats(mine.filter(st => !st.frl));     // reference = non-FRL
    return {
      school_id: sc.id, n_a: a.n, n_b: b.n,
      raw_gap: a.rbar - b.rbar, raw_se: S.gapSE(a.se, b.se),
      meets_min_cell: a.n >= MIN_N && b.n >= MIN_N,
    };
  });
  const fit = rows.filter(s => s.meets_min_cell).map(s => ({ gap: s.raw_gap, se: s.raw_se }));
  const tau2 = S.remlTau2(fit);
  const pooled = S.pooledMean(fit, tau2) || { mu: 0 };
  const schools = rows.map(s => {
    const sh = S.shrink({ rawGap: s.raw_gap, rawSe: s.raw_se, tau2, mu: pooled.mu });
    return {
      school_id: s.school_id, n_a: s.n_a, n_b: s.n_b,
      raw_gap: round(s.raw_gap, 4), raw_se: round(s.raw_se, 4),
      raw_ci95: [round(s.raw_gap - 1.96 * s.raw_se, 4), round(s.raw_gap + 1.96 * s.raw_se, 4)],
      shrunk_gap: round(sh.shrunkGap, 4), shrunk_se: round(sh.shrunkSe, 4),
      shrunk_ci95: [round(sh.shrunkGap - 1.96 * sh.shrunkSe, 4), round(sh.shrunkGap + 1.96 * sh.shrunkSe, 4)],
      shrinkage_factor: round(sh.B, 3), meets_min_cell: s.meets_min_cell,
    };
  }).sort((x, y) => x.shrunk_gap - y.shrunk_gap);
  const meta = {
    subject: 'math', demographic: 'frl', groupA: 'FRL', groupB: 'non-FRL',
    districtGap: round(pooled.mu, 4), tauSquared: round(tau2, 4),
    nSchools: schools.length, nMeetingThreshold: rows.filter(s => s.meets_min_cell).length, minCellSize: MIN_N,
  };
  return { meta, schools };
}

// ---- serialize -------------------------------------------------------------
function fmtSchoolRow(s) {
  const ci = a => `[${a[0]}, ${a[1]}]`;
  return `    { school_id: ${JSON.stringify(s.school_id)}, n_a: ${s.n_a}, n_b: ${s.n_b}, `
    + `raw_gap: ${s.raw_gap}, raw_se: ${s.raw_se}, raw_ci95: ${ci(s.raw_ci95)}, `
    + `shrunk_gap: ${s.shrunk_gap}, shrunk_se: ${s.shrunk_se}, shrunk_ci95: ${ci(s.shrunk_ci95)}, `
    + `shrinkage_factor: ${s.shrinkage_factor}, meets_min_cell: ${s.meets_min_cell} },`;
}
function writeGaps(gaps) {
  const m = gaps.meta;
  const out = LICENSE
    + '\n// Forest plot data — coherent small district, generated by tools/build-demo.js.\n'
    + 'window.GAPS_DATA = {\n  meta: {\n'
    + `    subject: ${JSON.stringify(m.subject)},\n    demographic: ${JSON.stringify(m.demographic)},\n`
    + `    groupA: ${JSON.stringify(m.groupA)},\n    groupB: ${JSON.stringify(m.groupB)},\n`
    + `    districtGap: ${m.districtGap},\n    tauSquared: ${m.tauSquared},\n`
    + `    nSchools: ${m.nSchools},\n    nMeetingThreshold: ${m.nMeetingThreshold},\n    minCellSize: ${m.minCellSize},\n  },\n`
    + '  schools: [\n' + gaps.schools.map(fmtSchoolRow).join('\n') + '\n  ],\n};\n';
  fs.writeFileSync(path.join(ROOT, 'data.js'), out);
}
function writeHeatmap(heat) {
  fs.writeFileSync(path.join(ROOT, 'heatmap-data.js'),
    LICENSE + '\n// Heatmap data — school × grade residuals, generated by tools/build-demo.js.\n'
    + 'window.HEATMAP_DATA = ' + JSON.stringify(heat) + ';\n');
}

// ---- run + validation ------------------------------------------------------
const heat = buildHeatmap();
const gaps = buildGaps();
writeGaps(gaps);
writeHeatmap(heat);

console.log('District:', gaps.meta.nSchools, 'schools,', students.length, 'students (Math, grades 3-8).');
console.log('  district FRL gap', gaps.meta.districtGap, '| tau^2', gaps.meta.tauSquared,
  '| meeting threshold', gaps.meta.nMeetingThreshold + '/' + gaps.meta.nSchools);

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

const errs = [];
if (gaps.meta.nSchools !== 7) errs.push('expected 7 schools');
if (gaps.meta.nMeetingThreshold !== 6) errs.push('expected 6 meeting threshold, got ' + gaps.meta.nMeetingThreshold);
if (!(gaps.meta.districtGap < 0)) errs.push('expected negative district FRL gap');
if (cellReport.some(c => Math.abs(c.sdRatio - 0.548) > 0.02)) errs.push('sd ratio off target');
if (cellReport.some(c => Math.abs(c.corRY - 0.548) > 0.03)) errs.push('cor(resid,score) off target');
if (cellReport.some(c => Math.abs(c.corFR) > 0.02)) errs.push('cor(fitted,resid) not ~0');
if (sd(cellReport.map(c => c.offset)) < 0.03) errs.push('grade offsets too small to register');
if (errs.length) { console.error('\nSELF-CHECK FAILED:', errs.join('; ')); process.exit(1); }
console.log('\nSelf-check OK. Wrote data.js + heatmap-data.js.');
