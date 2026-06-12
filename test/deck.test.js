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

test('buildDemoSections: empty input gives no sections', () => {
  assert.deepEqual(D.buildDemoSections({}), []);
});

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

test('forestSlides: raw mode reads the raw gap and interval', () => {
  const slice = gapSlice('frl', 'FRL', 'non-FRL', -0.15, [-0.22, -0.08], [{
    school_id: '1', school_name: 'One', n_a: 25, n_b: 30,
    raw_gap: -0.30, raw_ci95: [-0.4, -0.2],
    shrunk_gap: -0.18, shrunk_ci95: [-0.26, -0.10],
    shrinkage_factor: 0.6, meets_min_cell: true,
  }]);
  const f = D.forestSlides({ gaps: { frl: slice }, subject: 'math', mode: 'raw', fmt: fmtSD })[0];
  assert.equal(f.rows[0].text, '−0.30 SD');
  assert.deepEqual(f.rows[0].ci, [-0.4, -0.2]);
});

test('forestSlides: a small school with BOTH groups present reads "too few", not "no students"', () => {
  const slice = gapSlice('frl', 'FRL', 'non-FRL', -0.15, [-0.22, -0.08], [
    SCH('1', 'Anchor School', -0.2, -0.3, -0.1),
    SCH('2', 'Tiny School', -0.1, -0.6, 0.4, false),   // 25 vs 30 students but below threshold
    { ...SCH('3', 'One-Sided School', null, null, null, false), n_a: 0 },
  ]);
  const f = D.forestSlides({ gaps: { frl: slice }, subject: 'math', mode: 'shrunk', fmt: fmtSD })[0];
  assert.equal(f.excluded.find((e) => e.name === 'Tiny School').reason, 'too few students to read reliably');
  assert.equal(f.excluded.find((e) => e.name === 'One-Sided School').reason, 'no FRL students');
});
