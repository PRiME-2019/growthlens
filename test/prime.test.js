// PRiME database engine: composite-key name lookup, district report series,
// statewide tile histograms, shape enrichment, and report takeaways.
const test = require('node:test');
const assert = require('node:assert/strict');

const P = require('../engine/prime.js');

const fmtSD = { val: (z) => (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(2) + ' SD' };

// Two districts; school_id 0001 deliberately repeats across districts to
// exercise composite-key identity. Years skip 2020 like the real file.
function row(lea, leaName, school, schoolName, year, level, ela, math, rEla, rMath) {
  return {
    lea_id: lea, lea_name: leaName, school_id: school, school_name: schoolName,
    school_year: String(year), school_level: level,
    growth_zscore_all_ela: String(ela), growth_zscore_all_math: String(math),
    prime_rank_all_1yr_ela: String(rEla), prime_rank_all_1yr_math: String(rMath),
  };
}
const ROWS = [
  row('000001', 'Alpha District', '0001', 'Alpha Elem', 2024, 'Elementary', 0.10, 0.05, 1, 2),
  row('000001', 'Alpha District', '0001', 'Alpha Elem', 2025, 'Elementary', 0.20, -0.10, 1, 3),
  row('000001', 'Alpha District', '0002', 'Alpha Middle', 2025, 'Middle', -0.05, 0.15, 2, 1),
  row('000002', 'Beta District', '0001', 'Beta Elem', 2025, 'Elementary', -0.30, -0.20, 3, 4),
  row('000002', 'Beta District', '0003', 'Beta Annex', 2024, 'Elementary', 0.00, 0.00, 2, 1),
  // level change across years: Middle in 2024, EleMiddle in 2025
  row('000002', 'Beta District', '0004', 'Beta Combined', 2024, 'Middle', 0.08, 0.02, 1, 2),
  row('000002', 'Beta District', '0004', 'Beta Combined', 2025, 'EleMiddle', 0.12, 0.06, 1, 1),
];

test('nameLookup: composite keys; same school_id in two districts stays distinct', () => {
  const names = P.nameLookup(ROWS);
  assert.equal(names.school('000001', '0001'), 'Alpha Elem');
  assert.equal(names.school('000002', '0001'), 'Beta Elem');
  assert.equal(names.school('000002', '9999'), null);
  assert.equal(names.district('000001'), 'Alpha District');
  assert.equal(names.district('000003'), null);
});

test('detectLevel: displayed year wins; falls back to latest known', () => {
  assert.equal(P.detectLevel(ROWS, '000002', '0004', '2024'), 'Middle');
  assert.equal(P.detectLevel(ROWS, '000002', '0004', '2025'), 'EleMiddle');
  assert.equal(P.detectLevel(ROWS, '000002', '0004', '2019'), 'EleMiddle'); // no 2019 row → latest
});

test('districtReport: per-school series with parsed numbers and pool sizes', () => {
  const rep = P.districtReport(ROWS, '000001');
  assert.equal(rep.name, 'Alpha District');
  assert.deepEqual(rep.years, ['2024', '2025']);
  const elem = rep.schools.find((s) => s.school_id === '0001');
  assert.equal(elem.name, 'Alpha Elem');
  assert.deepEqual(elem.series.ela.map((p) => p.year), ['2024', '2025']);
  assert.equal(elem.series.ela[1].z, 0.20);
  assert.equal(elem.series.math[1].rank, 3);
  // pool size = schools of the same level with a rank that year (statewide)
  assert.equal(elem.series.ela[1].poolN, 2);  // Alpha Elem + Beta Elem in 2025 Elementary
});

test('histogram: unit-tile bins over the level pool, district tiles flagged', () => {
  const h = P.histogram(ROWS, { year: '2025', level: 'Elementary', subject: 'ela', binWidth: 0.1, lea: '000001' });
  assert.equal(h.poolN, 2);
  const total = h.bins.reduce((t, b) => t + b.count, 0);
  assert.equal(total, 2);
  const districtTotal = h.bins.reduce((t, b) => t + b.district, 0);
  assert.equal(districtTotal, 1);          // Alpha Elem only
  const alphaBin = h.bins.find((b) => b.district > 0);
  assert.ok(alphaBin.x0 <= 0.20 && 0.20 < alphaBin.x1, 'district school lands in its z bin');
});

test('districtMeanSeries: unweighted mean per year, missing years absent', () => {
  const rep = P.districtReport(ROWS, '000002');
  const mean = P.districtMeanSeries(rep, 'ela');
  assert.deepEqual(mean.map((p) => p.year), ['2024', '2025']);
  assert.ok(Math.abs(mean[0].z - 0.04) < 1e-9);   // (0.00 + 0.08) / 2
  assert.ok(Math.abs(mean[1].z - (-0.09)) < 1e-9); // (-0.30 + 0.12) / 2
});

test('enrichShapes: stamps names by composite key; unknown codes untouched', () => {
  const shapes = {
    GAPS_DATA_BY_DEMO: { frl: { meta: {}, schools: [{ school_id: '0001' }, { school_id: '9999' }] } },
    HEATMAP_DATA: { schools: [{ school_id: '0001', grades: {} }] },
    ACH_DATA: { school: { points: [{ school_id: '0001', school_name: '0001' }] }, student: { points: [] } },
  };
  const districtName = P.enrichShapes(shapes, '000002', ROWS);
  assert.equal(districtName, 'Beta District');
  assert.equal(shapes.GAPS_DATA_BY_DEMO.frl.schools[0].school_name, 'Beta Elem');
  assert.equal(shapes.GAPS_DATA_BY_DEMO.frl.schools[1].school_name, undefined);
  assert.equal(shapes.HEATMAP_DATA.schools[0].school_name, 'Beta Elem');
  assert.equal(shapes.ACH_DATA.school.points[0].school_name, 'Beta Elem');
});

test('enrichShapes: no district code or no rows → no-op, returns null', () => {
  const shapes = { GAPS_DATA_BY_DEMO: {}, HEATMAP_DATA: { schools: [] }, ACH_DATA: { school: { points: [] } } };
  assert.equal(P.enrichShapes(shapes, null, ROWS), null);
  assert.equal(P.enrichShapes(shapes, '000404', ROWS), null);
});

test('primeTakeaways: at/above-typical counts and a standout school', () => {
  const rep = P.districtReport(ROWS, '000002');
  const out = P.primeTakeaways({ report: rep, year: '2025', fmt: fmtSD });
  assert.ok(out.length >= 1 && out.length <= 4);
  const counts = out.find((t) => /typical/.test(t.text));
  assert.ok(counts, 'at/above-typical takeaway present');
  assert.match(counts.text, /\*\*1 of 2\*\*/);   // ELA 2025: Combined +0.12 yes, Beta Elem −0.30 no
});
