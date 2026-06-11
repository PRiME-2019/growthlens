// Key-takeaway generators: pure functions over the gap slices / heatmap
// shapes. Formatting is injected (fmt.val) so the UI can render SD or weeks
// without the generator knowing about conversion factors.
const test = require('node:test');
const assert = require('node:assert/strict');

const I = require('../engine/insights.js');

const fmtSD = { val: (z) => (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2) + ' SD' };

function sch(id, gap, lo, hi, meets = true, over = {}) {
  return {
    school_id: id, n_a: 20, n_b: 20,
    raw_gap: gap, raw_ci95: [lo, hi],
    shrunk_gap: gap, shrunk_ci95: [lo, hi],
    shrinkage_factor: 0.5, meets_min_cell: meets, ...over,
  };
}
function slice(key, A, B, districtGap, schools) {
  return {
    meta: {
      demographic: key, groupA: A, groupB: B, districtGap,
      nSchools: schools.length,
      nMeetingThreshold: schools.filter((s) => s.meets_min_cell).length,
      minCellSize: 10,
    },
    schools,
  };
}

const FRL = slice('frl', 'FRL', 'non-FRL', -0.13, [
  sch('S1', -0.20, -0.30, -0.10),
  sch('S2', -0.10, -0.25, 0.05),
  sch('S3', -0.15, -0.27, -0.03),
]);
const RACE = slice('race_bw', 'Black', 'White', -0.22, [sch('S1', -0.2, -0.3, -0.1)]);
const EL = slice('el', 'EL', 'non-EL', -0.05, [sch('S1', -0.05, -0.1, 0.0)]);

test('gapTakeaways: ranks widest and narrowest district gaps across comparisons', () => {
  const out = I.gapTakeaways({ slices: { frl: FRL, race_bw: RACE, el: EL }, activeKey: 'frl', mode: 'shrunk', fmt: fmtSD });
  const first = out[0].text;
  assert.match(first, /\*\*Black vs\. White\*\*/);
  assert.match(first, /−0\.22 SD/);
  assert.match(first, /\*\*EL vs\. non-EL\*\*/);
});

test('gapTakeaways: pervasiveness counts same-direction and clear-of-zero schools', () => {
  const out = I.gapTakeaways({ slices: { frl: FRL }, activeKey: 'frl', mode: 'shrunk', fmt: fmtSD });
  const perv = out.find((t) => /\*\*3 of 3\*\*/.test(t.text));
  assert.ok(perv, 'pervasiveness takeaway present');
  assert.match(perv.text, /FRL behind/);
  assert.match(perv.text, /2 /); // two schools clear of zero
});

test('gapTakeaways: flags schools where the gap reverses', () => {
  const rev = slice('frl', 'FRL', 'non-FRL', -0.13, [
    sch('S1', -0.20, -0.30, -0.10),
    sch('S2', -0.15, -0.27, -0.03),
    sch('S4', 0.12, 0.02, 0.22),
  ]);
  const out = I.gapTakeaways({ slices: { frl: rev }, activeKey: 'frl', mode: 'shrunk', fmt: fmtSD });
  const r = out.find((t) => /reverses/.test(t.text));
  assert.ok(r, 'reversal takeaway present');
  assert.match(r.text, /\*\*S4\*\*/);
  assert.match(r.text, /ahead/);
});

test('gapTakeaways: respects the selected method for school-level values', () => {
  const s = sch('S1', -0.30, -0.40, -0.20, true, { shrunk_gap: -0.18, shrunk_ci95: [-0.26, -0.10] });
  const one = slice('frl', 'FRL', 'non-FRL', -0.13, [s, sch('S2', -0.05, -0.15, 0.05)]);
  const raw = I.gapTakeaways({ slices: { frl: one }, activeKey: 'frl', mode: 'raw', fmt: fmtSD });
  const shr = I.gapTakeaways({ slices: { frl: one }, activeKey: 'frl', mode: 'shrunk', fmt: fmtSD });
  assert.ok(raw.some((t) => t.text.includes('−0.30 SD')), 'raw mode shows raw gap');
  assert.ok(shr.some((t) => t.text.includes('−0.18 SD')), 'shrunk mode shows shrunken gap');
});

test('gapTakeaways: single reliable school gets an explicit context line instead of pervasiveness', () => {
  const one = slice('frl', 'FRL', 'non-FRL', -0.13, [sch('S1', -0.13, -0.21, -0.05)]);
  const out = I.gapTakeaways({ slices: { frl: one }, activeKey: 'frl', mode: 'shrunk', fmt: fmtSD });
  const ctx = out.find((t) => /only school/.test(t.text));
  assert.ok(ctx, 'single-school context line present');
  assert.match(ctx.text, /\*\*S1\*\*/);
  assert.ok(!out.some((t) => /reliable schools show/.test(t.text)), 'no pervasiveness counts');
  assert.ok(!out.some((t) => /widest school-level gap/.test(t.text)), 'no extremes with one school');
});

test('scanTakeaways: single school gets a context line instead of school extremes', () => {
  const oneSchool = {
    meta: { subject: 'math' },
    schools: [
      { school_id: 'S1', grades: { 3: { n: 30, r: 0.2, ok: true }, 4: { n: 30, r: 0.02, ok: true } } },
    ],
  };
  const out = I.scanTakeaways({ heat: oneSchool, fmt: fmtSD });
  const ctx = out.find((t) => /only school/.test(t.text));
  assert.ok(ctx, 'single-school context line present');
  assert.match(ctx.text, /\*\*S1\*\*/);
  assert.match(ctx.text, /\+0\.11 SD/); // n-weighted overall mean (0.2*30 + 0.02*30) / 60
});

test('gapTakeaways: caveat counts below-threshold schools and is last', () => {
  const withBelow = slice('frl', 'FRL', 'non-FRL', -0.13, [
    sch('S1', -0.20, -0.30, -0.10),
    sch('S2', -0.10, -0.25, 0.05),
    sch('S5', 0.24, -0.27, 0.75, false),
    { school_id: 'S6', n_a: 0, n_b: 21, raw_gap: null, raw_ci95: null, shrunk_gap: null, shrunk_ci95: null, shrinkage_factor: null, meets_min_cell: false },
  ]);
  const out = I.gapTakeaways({ slices: { frl: withBelow }, activeKey: 'frl', mode: 'shrunk', fmt: fmtSD });
  const last = out[out.length - 1];
  assert.equal(last.caveat, true);
  assert.match(last.text, /2 schools/);
});

test('gapTakeaways: returns at most 4 items', () => {
  const big = slice('frl', 'FRL', 'non-FRL', -0.13, [
    sch('S1', -0.20, -0.30, -0.10),
    sch('S2', -0.10, -0.25, 0.05),
    sch('S3', 0.12, 0.02, 0.22),
    sch('S5', 0.24, -0.27, 0.75, false),
  ]);
  const out = I.gapTakeaways({ slices: { frl: big, race_bw: RACE, el: EL }, activeKey: 'frl', mode: 'shrunk', fmt: fmtSD });
  assert.ok(out.length >= 2 && out.length <= 4, `got ${out.length}`);
});

// ---- achievement -------------------------------------------------------------

const ACH = {
  school: { points: [
    { school_id: 'S1', school_name: 'Lincoln', x: -0.8, y_raw: 0.12, y_shrunk: 0.09, n: 200 },
    { school_id: 'S2', school_name: 'Carver', x: 0.6, y_raw: -0.15, y_shrunk: -0.11, n: 250 },
    { school_id: 'S3', school_name: 'Riverside', x: 0.4, y_raw: 0.10, y_shrunk: 0.08, n: 220 },
    { school_id: 'S4', school_name: 'Hillcrest', x: -0.2, y_raw: -0.30, y_shrunk: -0.20, n: 8 },
  ] },
  student: { points: [
    { x: 0.1, y_raw: 0.2 }, { x: -0.3, y_raw: 0.4 }, { x: 0.5, y_raw: -0.1 }, { x: 0.2, y_raw: -0.6 },
  ] },
};

test('achievementTakeaways: names the pattern-breaker (low score, fast growth)', () => {
  const out = I.achievementTakeaways({ ach: ACH, mode: 'shrunk', fmt: fmtSD });
  const t = out.find((x) => /Lincoln/.test(x.text));
  assert.ok(t, 'bright-spot takeaway present');
  assert.match(t.text, /\+0\.09 SD/);   // shrunken value under shrunk mode
});

test('achievementTakeaways: flags high score but slow growth', () => {
  const out = I.achievementTakeaways({ ach: ACH, mode: 'shrunk', fmt: fmtSD });
  const t = out.find((x) => /Carver/.test(x.text));
  assert.ok(t, 'high-status-slow-growth takeaway present');
});

test('achievementTakeaways: reports the student share at/above expectations', () => {
  const out = I.achievementTakeaways({ ach: ACH, mode: 'shrunk', fmt: fmtSD });
  const t = out.find((x) => /\*\*50%\*\*/.test(x.text));
  assert.ok(t, 'student share takeaway present (2 of 4 ≥ 0)');
});

test('achievementTakeaways: small-school caveat flagged and last', () => {
  const out = I.achievementTakeaways({ ach: ACH, mode: 'shrunk', fmt: fmtSD });
  const last = out[out.length - 1];
  assert.equal(last.caveat, true);
  assert.match(last.text, /Hillcrest/);
});

test('achievementTakeaways: respects raw mode for school values', () => {
  const out = I.achievementTakeaways({ ach: ACH, mode: 'raw', fmt: fmtSD });
  assert.ok(out.some((x) => x.text.includes('+0.12 SD')), 'raw value shown in raw mode');
});

// ---- demographics ------------------------------------------------------------

const DEMO = {
  label: 'FRL status',
  districtMean: -0.03,
  groups: [
    { key: 'frl', label: 'FRL', n: 950, median: -0.05, q1: -0.38, q3: 0.28, mean: -0.06, whiskerLo: -1.2, whiskerHi: 1.1, outliers: [] },
    { key: 'nonfrl', label: 'non-FRL', n: 980, median: 0.08, q1: -0.27, q3: 0.43, mean: 0.07, whiskerLo: -1.1, whiskerHi: 1.3, outliers: [] },
  ],
};

test('demographicsTakeaways: leads with the median gap between groups', () => {
  const out = I.demographicsTakeaways({ data: DEMO, fmt: fmtSD });
  const t = out[0].text;
  assert.match(t, /\*\*non-FRL\*\*/);
  assert.match(t, /\*\*FRL\*\*/);
  assert.match(t, /\+0\.08 SD/);
  assert.match(t, /−0\.05 SD/);
});

test('demographicsTakeaways: notes within-group spread vs between-group gap', () => {
  const out = I.demographicsTakeaways({ data: DEMO, fmt: fmtSD });
  const t = out.find((x) => /within/.test(x.text));
  assert.ok(t, 'overlap takeaway present (avg IQR 0.68 >> gap 0.13)');
});

test('demographicsTakeaways: small-group caveat when a group is under 10', () => {
  const tiny = { ...DEMO, groups: [DEMO.groups[0], { ...DEMO.groups[1], n: 6 }] };
  const out = I.demographicsTakeaways({ data: tiny, fmt: fmtSD });
  const last = out[out.length - 1];
  assert.equal(last.caveat, true);
  assert.match(last.text, /non-FRL/);
});

test('demographicsTakeaways: empty groups produce no takeaways', () => {
  assert.deepEqual(I.demographicsTakeaways({ data: { groups: [] }, fmt: fmtSD }), []);
});

// ---- scan ------------------------------------------------------------------

const HEAT = {
  meta: { subject: 'math' },
  schools: [
    { school_id: 'S1', grades: { 3: { n: 30, r: 0.2, ok: true }, 4: { n: 30, r: 0.1, ok: true } } },
    { school_id: 'S2', grades: { 3: { n: 30, r: -0.25, ok: true }, 4: { n: 5, r: 0.9, ok: false } } },
    { school_id: 'S3', grades: { 3: { n: 30, r: 0.01, ok: true }, 4: { n: 30, r: -0.02, ok: true } } },
  ],
};

test('scanTakeaways: names strongest and weakest school', () => {
  const out = I.scanTakeaways({ heat: HEAT, fmt: fmtSD });
  const t = out[0].text;
  assert.match(t, /\*\*S1\*\*/);
  assert.match(t, /\*\*S2\*\*/);
});

test('scanTakeaways: grade extremes appear when the spread is meaningful', () => {
  const out = I.scanTakeaways({ heat: HEAT, fmt: fmtSD });
  const g = out.find((t) => /grade 4/.test(t.text) && /grade 3/.test(t.text));
  assert.ok(g, 'grade takeaway present');
});

test('scanTakeaways: standout cells use the |r| >= 0.15 threshold, biggest first', () => {
  const out = I.scanTakeaways({ heat: HEAT, fmt: fmtSD });
  const cells = out.find((t) => /stand out/.test(t.text));
  assert.ok(cells, 'standout-cells takeaway present');
  assert.ok(cells.text.indexOf('S2') < cells.text.indexOf('S1'), 'larger |r| listed first');
  assert.ok(!/S3/.test(cells.text), 'near-zero cells not listed');
});

test('scanTakeaways: suppressed-cell caveat is last and flagged', () => {
  const out = I.scanTakeaways({ heat: HEAT, fmt: fmtSD });
  const last = out[out.length - 1];
  assert.equal(last.caveat, true);
  assert.match(last.text, /1 school-grade cell/);
});

test('scanTakeaways: grade is passed to fmt for per-grade values', () => {
  const seen = [];
  const fmt = { val: (z, o) => { seen.push(o && o.grade); return fmtSD.val(z); } };
  I.scanTakeaways({ heat: HEAT, fmt });
  assert.ok(seen.some((g) => g != null), 'fmt.val received grade context');
});
