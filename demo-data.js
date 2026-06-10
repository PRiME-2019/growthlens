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

// Mock data for Demographics box plots and Achievement vs Growth scatter.
// Deterministic — same shape each load so the design holds still.

(function () {
  // Seeded PRNG (mulberry32)
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    // Box–Muller, drops the second
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  // Left-skewed, heavy-tailed Math growth-residual draw (skew ≈ −0.5, t(8)-ish
  // tails), standardized to ~mean 0, sd 1. Mirrors tools/build-demo.js so the
  // demographics + achievement residuals share the engine demo's distribution.
  function mathDraw(rng) {
    let c = 0; for (let i = 0; i < 8; i++) { const g = gauss(rng); c += g * g; }
    const t = gauss(rng) / Math.sqrt(c / 8);   // t(8)
    const v = t < 0 ? t * 1.20 : t * 0.86;     // stretch the left tail
    return (v + 0.1502) / 1.1957;              // standardize (calibrated)
  }
  function quantile(sorted, q) {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    return sorted[base];
  }
  function summarize(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const median = quantile(sorted, 0.5);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const whiskerLo = sorted.find(v => v >= lowerFence) ?? sorted[0];
    const whiskerHi = [...sorted].reverse().find(v => v <= upperFence) ?? sorted[sorted.length - 1];
    const outliers = sorted.filter(v => v < lowerFence || v > upperFence);
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    return {
      n: sorted.length, mean, median, q1, q3,
      whiskerLo, whiskerHi, outliers, min: sorted[0], max: sorted[sorted.length - 1],
    };
  }

  // ---- DEMOGRAPHICS ----------------------------------------------------------
  // For each demographic variable, define groups with target (mean, sd, n).
  // We sample, summarize, and stash the box-plot stats.
  const DEMO_SPECS = {
    frl: {
      label: 'FRL · Free / Reduced Lunch',
      short: 'FRL',
      groups: [
        { key: 'non_frl', label: 'non-FRL',   mean:  0.07,  sd: 0.49, n:  920 },
        { key: 'frl',     label: 'FRL',       mean: -0.07,  sd: 0.55, n: 1080 },
      ],
    },
    race: {
      label: 'Race / Ethnicity',
      short: 'Race',
      groups: [
        { key: 'white',     label: 'White',            mean:  0.07, sd: 0.49, n:  980 },
        { key: 'asian',     label: 'Asian',            mean:  0.10, sd: 0.46, n:   80 },
        { key: 'hispanic',  label: 'Hispanic / Latine',mean: -0.04, sd: 0.53, n:  520 },
        { key: 'black',     label: 'Black',            mean: -0.08, sd: 0.56, n:  330 },
        { key: 'multi',     label: 'Two+ / Other',     mean:  0.01, sd: 0.51, n:   90 },
      ],
    },
    ell: {
      label: 'EL · English Language Learner',
      short: 'EL',
      groups: [
        { key: 'non_el', label: 'non-EL', mean:  0.02, sd: 0.49, n: 1740 },
        { key: 'el',     label: 'EL',     mean: -0.10, sd: 0.55, n:  260 },
      ],
    },
    iep: {
      label: 'IEP / SPED',
      short: 'IEP',
      groups: [
        { key: 'non_iep', label: 'non-IEP', mean:  0.02, sd: 0.48, n: 1760 },
        { key: 'iep',     label: 'IEP',     mean: -0.14, sd: 0.60, n:  240 },
      ],
    },
    gifted: {
      label: 'Gifted',
      short: 'Gifted',
      groups: [
        { key: 'non_gifted', label: 'non-Gifted', mean: -0.01, sd: 0.50, n: 1850 },
        { key: 'gifted',     label: 'Gifted',     mean:  0.19, sd: 0.42, n:  150 },
      ],
    },
    migrant: {
      label: 'Migrant',
      short: 'Migrant',
      groups: [
        { key: 'non_migrant', label: 'non-Migrant', mean:  0.01, sd: 0.49, n: 1950 },
        { key: 'migrant',     label: 'Migrant',     mean: -0.05, sd: 0.54, n:   50 },
      ],
    },
    gender: {
      label: 'Gender',
      short: 'Gender',
      groups: [
        { key: 'female', label: 'Female', mean:  0.01, sd: 0.49, n: 1000 },
        { key: 'male',   label: 'Male',   mean: -0.01, sd: 0.51, n: 1000 },
      ],
    },
  };

  const demoData = {};
  let seed = 7;
  let studentCounter = 100000;
  Object.entries(DEMO_SPECS).forEach(([key, spec]) => {
    const rawByGroup = [];
    const groups = spec.groups.map(g => {
      const rng = seeded(seed++);
      // To keep things fast we sample 600 per group instead of full n
      const sampleN = Math.min(600, g.n);
      const records = [];
      for (let i = 0; i < sampleN; i++) {
        const v = g.mean + g.sd * mathDraw(rng);
        records.push({
          student_id: 'S-' + (studentCounter++).toString(),
          residual: v,
          // synthetic but plausible bookkeeping — pick a real school from the district
          school_id: (window.HEATMAP_DATA.schools[Math.floor(rng() * window.HEATMAP_DATA.schools.length)] || {}).school_id,
          grade: 3 + Math.floor(rng() * 6),
        });
      }
      const vals = records.map(r => r.residual);
      const stats = summarize(vals);
      const lowerFence = stats.q1 - 1.5 * (stats.q3 - stats.q1);
      const upperFence = stats.q3 + 1.5 * (stats.q3 - stats.q1);
      // Outliers as full records (so we can show student_id on hover)
      const outlierRecords = records
        .filter(r => r.residual < lowerFence || r.residual > upperFence)
        .sort((a, b) => a.residual - b.residual);
      // Down-sample to keep the dot stack readable
      const outliers = outlierRecords.length > 12
        ? outlierRecords.filter((_, i) => i % Math.ceil(outlierRecords.length / 12) === 0)
        : outlierRecords;
      rawByGroup.push({ vals, n: g.n });
      return {
        key: g.key, label: g.label,
        n: g.n,
        mean: stats.mean, median: stats.median,
        q1: stats.q1, q3: stats.q3,
        whiskerLo: stats.whiskerLo, whiskerHi: stats.whiskerHi,
        min: stats.min, max: stats.max,
        outliers,
      };
    });
    // District mean = mean of all pooled student residuals across groups,
    // weighted by reported group n (so groups contribute proportionally to
    // their real population rather than the down-sampled count).
    let weightedSum = 0, weightTotal = 0;
    rawByGroup.forEach((r, i) => {
      const sampleMean = r.vals.reduce((a, b) => a + b, 0) / r.vals.length;
      weightedSum += sampleMean * r.n;
      weightTotal += r.n;
    });
    const districtMean = weightTotal > 0 ? weightedSum / weightTotal : 0;
    demoData[key] = { ...spec, key, groups, districtMean };
  });

  // Per-school variant: same demographic specs, but sampled school-by-school
  // with school-level random effects so the boxes differ per school.
  const SCHOOLS = (window.HEATMAP_DATA && window.HEATMAP_DATA.schools) || [];
  const demoBySchool = {};
  Object.entries(DEMO_SPECS).forEach(([demoKey, spec]) => {
    demoBySchool[demoKey] = {};
    SCHOOLS.forEach((s, si) => {
      const rng = seeded(2000 + si * 17 + demoKey.length);
      const schoolEffect = (gauss(rng) * 0.12); // school-level shift (residual scale)
      const groups = spec.groups.map((g, gi) => {
        const r = seeded(5000 + si * 31 + gi * 7 + demoKey.length);
        const sampleN = 50 + Math.floor(r() * 70); // 50–120
        const vals = [];
        const groupShift = (gauss(r) * 0.05); // small per-group jitter
        for (let i = 0; i < sampleN; i++) {
          vals.push(g.mean + schoolEffect + groupShift + g.sd * mathDraw(r));
        }
        const stats = summarize(vals);
        const outliers = stats.outliers.length > 8
          ? stats.outliers.filter((_, i) => i % Math.ceil(stats.outliers.length / 8) === 0)
          : stats.outliers;
        return {
          key: g.key, label: g.label, n: sampleN,
          mean: stats.mean, median: stats.median,
          q1: stats.q1, q3: stats.q3,
          whiskerLo: stats.whiskerLo, whiskerHi: stats.whiskerHi,
          min: stats.min, max: stats.max,
          outliers,
        };
      });
      demoBySchool[demoKey][s.school_id] = { groups };
    });
  });

  window.DEMO_DATA = demoData;
  window.DEMO_DATA_BY_SCHOOL = demoBySchool;
  window.DEMO_SPECS = DEMO_SPECS;

  // ---- ACHIEVEMENT vs GROWTH -------------------------------------------------
  // Student-level: 7 schools × ~22 students each ≈ 150 points. Achievement is a
  // synthetic prior-score axis, nearly uncorrelated with the growth residual
  // (VAM residuals are ~orthogonal to prior). Distinct hue per school.
  const studentPoints = [];
  SCHOOLS.forEach((s, si) => {
    const rng = seeded(9000 + si * 13);
    // School base achievement; correlate weakly with school's overall residual
    const schoolMean = (window.HEATMAP_DATA && window.HEATMAP_DATA.schools[si] && computeSchoolMean(window.HEATMAP_DATA.schools[si])) || 0;
    const baseAch = 50 + schoolMean * 6 + gauss(rng) * 4;
    const baseGr  = schoolMean + gauss(rng) * 0.10;
    const nStu = 18 + Math.floor(rng() * 14); // 18–31 per school
    const hue = (si * 360 / SCHOOLS.length) % 360;
    for (let i = 0; i < nStu; i++) {
      const ach = baseAch + gauss(rng) * 8;
      const corrNoise = mathDraw(rng);
      // near-zero correlation with prior achievement (VAM residuals ~orthogonal)
      const gr  = baseGr + 0.05 * (ach - 50) / 10 + corrNoise * 0.48;
      studentPoints.push({
        school_id: s.school_id,
        school_idx: si,
        hue,
        x: ach,
        y_raw: gr,
        y_shrunk: gr * 0.7 + schoolMean * 0.3, // toy shrinkage toward school
      });
    }
  });

  function computeSchoolMean(school) {
    if (!school || !school.grades) return 0;
    const cells = Object.values(school.grades).filter(c => c && c.ok);
    if (cells.length === 0) return 0;
    const totalN = cells.reduce((a, c) => a + c.n, 0);
    if (totalN === 0) return 0;
    return cells.reduce((a, c) => a + c.r * c.n, 0) / totalN;
  }

  // School-level: 7 points, one per school
  const SCHOOL_NAME_ROOTS = [
    'Lincoln', 'Roosevelt', 'Jefferson', 'Washington', 'Madison',
    'Hamilton', 'Eisenhower', 'Kennedy', 'Truman', 'Adams',
    'Carver', 'Marshall', 'Douglass', 'Tubman', 'Parks',
    'Audubon', 'Cascade', 'Riverside', 'Hillcrest', 'Oakwood',
    'Sunnybrook', 'Meadowbrook', 'Pinegrove', 'Briarwood', 'Westbrook',
    'Cedarcrest', 'Brookside', 'Edgewater', 'Glenwood', 'Northgate',
  ];
  const schoolPoints = SCHOOLS.map((s, si) => {
    const rng = seeded(15000 + si * 19);
    const schoolMean = computeSchoolMean(s);
    const baseAch = 50 + schoolMean * 6 + gauss(rng) * 4;
    const totalN = Object.values(s.grades || {}).filter(c => c && c.ok).reduce((a, c) => a + c.n, 0);
    const root = SCHOOL_NAME_ROOTS[si % SCHOOL_NAME_ROOTS.length];
    const gradeKeys = Object.keys(s.grades || {});
    const type = (gradeKeys.includes('6') || gradeKeys.includes('7') || gradeKeys.includes('8')) ? 'Middle' : 'Elementary';
    return {
      school_id: s.school_id,
      school_name: `${root} ${type}`,
      school_idx: si,
      hue: (si * 360 / SCHOOLS.length) % 360,
      x: baseAch,
      y_raw: schoolMean + gauss(rng) * 0.1,
      y_shrunk: schoolMean,
      n: totalN,
    };
  });

  // OLS regression helper
  function regression(points, yKey) {
    const n = points.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    points.forEach(p => {
      sx += p.x; sy += p[yKey]; sxy += p.x * p[yKey]; sxx += p.x * p.x; syy += p[yKey] * p[yKey];
    });
    const mx = sx / n, my = sy / n;
    const slope = (sxy - n * mx * my) / (sxx - n * mx * mx);
    const intercept = my - slope * mx;
    const ssTot = syy - n * my * my;
    const ssRes = points.reduce((acc, p) => {
      const yhat = intercept + slope * p.x;
      return acc + (p[yKey] - yhat) ** 2;
    }, 0);
    const r2 = 1 - ssRes / ssTot;
    return { slope, intercept, r2 };
  }

  window.ACH_DATA = {
    student: {
      points: studentPoints,
      reg_raw: regression(studentPoints, 'y_raw'),
      reg_shrunk: regression(studentPoints, 'y_shrunk'),
    },
    school: {
      points: schoolPoints,
      reg_raw: regression(schoolPoints, 'y_raw'),
      reg_shrunk: regression(schoolPoints, 'y_shrunk'),
    },
  };
})();
