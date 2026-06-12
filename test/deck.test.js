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

test('descriptor builders return null on missing data', () => {
  assert.equal(D.heatSlide({ heat: null, subject: 'math', fmt: fmtSD }), null);
  assert.equal(D.scatterSlide({ ach: null, subject: 'math', fmt: fmtSD }), null);
  assert.equal(D.groupsSlide({ demo: null, subject: 'math', fmt: fmtSD }), null);
  assert.equal(D.glanceSlide({ bySubject: {}, fmt: fmtSD }), null);
});

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

test('buildDeck: both subjects interleave math-then-ela', () => {
  const mk = (subj) => ({ gaps: GAPS, heat: HEAT, ach: ACH, demo: DEMO,
    meta: { subject: subj, latestYear: 2025, nSchools: 2, nRowsLatest: 700, source: 'uploaded' } });
  const deck = D.buildDeck({ bySubject: { math: mk('math'), ela: mk('ela') }, prime: null,
                             unitLabel: 'SD', fmt: fmtSD, today: 'x' });
  assert.deepEqual(deck.slides.map((s) => s.kind), ['cover', 'intro', 'glance',
    'heat', 'scatter', 'groups', 'gapsOverview',
    'heat', 'scatter', 'groups', 'gapsOverview',
    'cautions', 'divider', 'forest', 'forest']);
  assert.deepEqual(deck.slides.filter((s) => s.kind === 'heat').map((s) => s.subject), ['math', 'ela']);
  assert.equal(deck.slides[0].district, 'Your district');   // uploaded but no district name
  assert.deepEqual(deck.meta.subjects, ['Math', 'ELA']);
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
