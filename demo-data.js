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
        { key: 'non_frl', label: 'non-FRL',   mean:  0.18,  sd: 0.92, n: 3100 },
        { key: 'frl',     label: 'FRL',       mean: -0.21,  sd: 1.05, n: 3580 },
      ],
    },
    race: {
      label: 'Race / Ethnicity',
      short: 'Race',
      groups: [
        { key: 'white',     label: 'White',            mean:  0.22, sd: 0.92, n: 2310 },
        { key: 'asian',     label: 'Asian',            mean:  0.34, sd: 0.88, n:  640 },
        { key: 'hispanic',  label: 'Hispanic / Latine',mean: -0.14, sd: 1.02, n: 1980 },
        { key: 'black',     label: 'Black',            mean: -0.28, sd: 1.08, n: 1340 },
        { key: 'multi',     label: 'Two+ / Other',     mean:  0.04, sd: 0.97, n:  410 },
      ],
    },
    ell: {
      label: 'EL · English Language Learner',
      short: 'EL',
      groups: [
        { key: 'non_el', label: 'non-EL', mean:  0.08, sd: 0.95, n: 5510 },
        { key: 'el',     label: 'EL',     mean: -0.34, sd: 1.10, n: 1170 },
      ],
    },
    iep: {
      label: 'IEP / SPED',
      short: 'IEP',
      groups: [
        { key: 'non_iep', label: 'non-IEP', mean:  0.06, sd: 0.93, n: 5840 },
        { key: 'iep',     label: 'IEP',     mean: -0.46, sd: 1.18, n:  840 },
      ],
    },
    gifted: {
      label: 'Gifted',
      short: 'Gifted',
      groups: [
        { key: 'non_gifted', label: 'non-Gifted', mean: -0.03, sd: 0.96, n: 5990 },
        { key: 'gifted',     label: 'Gifted',     mean:  0.62, sd: 0.78, n:  690 },
      ],
    },
    migrant: {
      label: 'Migrant',
      short: 'Migrant',
      groups: [
        { key: 'non_migrant', label: 'non-Migrant', mean:  0.02, sd: 0.97, n: 6480 },
        { key: 'migrant',     label: 'Migrant',     mean: -0.18, sd: 1.04, n:  200 },
      ],
    },
    gender: {
      label: 'Gender',
      short: 'Gender',
      groups: [
        { key: 'female', label: 'Female', mean:  0.04, sd: 0.94, n: 3340 },
        { key: 'male',   label: 'Male',   mean: -0.04, sd: 1.01, n: 3340 },
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
        const v = g.mean + g.sd * gauss(rng);
        records.push({
          student_id: 'S-' + (studentCounter++).toString(),
          residual: v,
          // synthetic but plausible bookkeeping
          school_id: 'Sch-' + (1000 + Math.floor(rng() * 30) + 1),
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
      const schoolEffect = (gauss(rng) * 0.35); // school-level shift
      const groups = spec.groups.map((g, gi) => {
        const r = seeded(5000 + si * 31 + gi * 7 + demoKey.length);
        const sampleN = 50 + Math.floor(r() * 70); // 50–120
        const vals = [];
        const groupShift = (gauss(r) * 0.12); // small per-group jitter
        for (let i = 0; i < sampleN; i++) {
          vals.push(g.mean + schoolEffect + groupShift + g.sd * gauss(r));
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
  // Student-level: 30 schools × ~22 students each = ~660 points. Achievement
  // is a synthetic prior-score axis (mean 50, sd 10) with mild positive
  // correlation to residual. Each school gets a distinct hue (HSL ring).
  const studentPoints = [];
  SCHOOLS.forEach((s, si) => {
    const rng = seeded(9000 + si * 13);
    // School base achievement; correlate weakly with school's overall residual
    const schoolMean = (window.HEATMAP_DATA && window.HEATMAP_DATA.schools[si] && computeSchoolMean(window.HEATMAP_DATA.schools[si])) || 0;
    const baseAch = 50 + schoolMean * 6 + gauss(rng) * 4;
    const baseGr  = schoolMean + gauss(rng) * 0.15;
    const nStu = 18 + Math.floor(rng() * 14); // 18–31 per school
    const hue = (si * 360 / SCHOOLS.length) % 360;
    for (let i = 0; i < nStu; i++) {
      const ach = baseAch + gauss(rng) * 8;
      const corrNoise = gauss(rng);
      // mild positive correlation r≈0.25 with prior achievement
      const gr  = baseGr + 0.25 * (ach - 50) / 10 + corrNoise * 0.85;
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

  // School-level: 30 points, one per school
  const SCHOOL_NAME_ROOTS = [
    'Lincoln', 'Roosevelt', 'Jefferson', 'Washington', 'Madison',
    'Hamilton', 'Eisenhower', 'Kennedy', 'Truman', 'Adams',
    'Carver', 'Marshall', 'Douglass', 'Tubman', 'Parks',
    'Audubon', 'Cascade', 'Riverside', 'Hillcrest', 'Oakwood',
    'Sunnybrook', 'Meadowbrook', 'Pinegrove', 'Briarwood', 'Westbrook',
    'Cedarcrest', 'Brookside', 'Edgewater', 'Glenwood', 'Northgate',
  ];
  const SCHOOL_TYPES = ['Elementary', 'Middle', 'Academy', 'School'];
  const schoolPoints = SCHOOLS.map((s, si) => {
    const rng = seeded(15000 + si * 19);
    const schoolMean = computeSchoolMean(s);
    const baseAch = 50 + schoolMean * 6 + gauss(rng) * 4;
    const totalN = Object.values(s.grades || {}).filter(c => c && c.ok).reduce((a, c) => a + c.n, 0);
    const root = SCHOOL_NAME_ROOTS[si % SCHOOL_NAME_ROOTS.length];
    const type = SCHOOL_TYPES[si % SCHOOL_TYPES.length];
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
