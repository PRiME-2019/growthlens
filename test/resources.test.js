// Resources engine: CSV parsing, finding detection (CI-gated), and the
// crosswalk join that turns findings into matched resources.
const test = require('node:test');
const assert = require('node:assert/strict');

const R = require('../engine/resources.js');

// ---- parseCsv ----------------------------------------------------------------

test('parseCsv: quoted fields, embedded commas, doubled quotes', () => {
  const rows = R.parseCsv('"a","b"\n"1,2","he said ""hi"""\n"3","4"\n');
  assert.deepEqual(rows, [
    { a: '1,2', b: 'he said "hi"' },
    { a: '3', b: '4' },
  ]);
});

test('parseCsv: skips blank trailing lines', () => {
  const rows = R.parseCsv('"x"\n"1"\n\n');
  assert.deepEqual(rows, [{ x: '1' }]);
});

// ---- detectFindings ------------------------------------------------------------

function slice(key, A, B, gap, ci) {
  return { meta: { demographic: key, groupA: A, groupB: B, subject: 'math', districtGap: gap, districtCi95: ci }, schools: [] };
}
const HEAT = {
  meta: { subject: 'math' },
  schools: [
    { school_id: 'S1', grades: { 3: { n: 50, r: -0.10, ok: true }, 6: { n: 50, r: 0.06, ok: true } } },
    { school_id: 'S2', grades: { 4: { n: 50, r: -0.08, ok: true }, 7: { n: 50, r: 0.02, ok: true } } },
  ],
};
const BY_SUBJECT = {
  math: {
    gaps: {
      frl: slice('frl', 'FRL', 'non-FRL', -0.13, [-0.21, -0.06]),          // fires
      iep: slice('iep', 'IEP', 'non-IEP', -0.10, [-0.22, 0.02]),           // straddles zero — no
      el: slice('el', 'EL', 'non-EL', 0.12, [0.04, 0.20]),                 // positive (focal ahead) — no
      race_bw: slice('race_bw', 'Black', 'White', -0.22, [-0.31, -0.13]),  // fires
      race_hw: slice('race_hw', 'Hispanic', 'White', -0.07, [-0.13, -0.01]), // fires — merges with race_bw
    },
    heat: HEAT,
  },
};

test('detectFindings: only CI-clear-of-zero negative gaps fire', () => {
  const out = R.detectFindings({ bySubject: BY_SUBJECT });
  const gaps = out.filter((f) => f.type === 'subgroup_gap');
  const keys = gaps.map((f) => f.subgroup).sort();
  assert.deepEqual(keys, ['frl', 'race']);
});

test('detectFindings: the two race comparisons merge into one race finding', () => {
  const out = R.detectFindings({ bySubject: BY_SUBJECT });
  const race = out.find((f) => f.subgroup === 'race');
  assert.equal(race.comparisons.length, 2);
  assert.deepEqual(race.comparisons.map((c) => c.groupA), ['Black', 'Hispanic']);
});

test('detectFindings: low-growth band fires below the floor, with bandsServed', () => {
  const out = R.detectFindings({ bySubject: BY_SUBJECT });
  const low = out.filter((f) => f.type === 'low_growth');
  assert.equal(low.length, 1);
  assert.equal(low[0].gradeBand, 'elementary');   // (−0.10·50 + −0.08·50)/100 = −0.09
  assert.equal(low[0].subject, 'math');
  const gap = out.find((f) => f.subgroup === 'frl');
  assert.deepEqual(gap.bandsServed.sort(), ['elementary', 'middle']);
});

test('detectFindings: spans every subject given', () => {
  const two = {
    ...BY_SUBJECT,
    ela: { gaps: { frl: { ...slice('frl', 'FRL', 'non-FRL', -0.2, [-0.3, -0.1]), meta: { ...slice('frl', 'FRL', 'non-FRL', -0.2, [-0.3, -0.1]).meta, subject: 'ela' } } }, heat: null },
  };
  const out = R.detectFindings({ bySubject: two });
  const subjects = [...new Set(out.map((f) => f.subject))].sort();
  assert.deepEqual(subjects, ['ela', 'math']);
});

// ---- matchResources -----------------------------------------------------------

const RESOURCES = [
  { resource_id: 'R1', title: 'MLL synthesis', evidence_type: 'synthesis', subject: 'any', grade_band: 'all', url: 'u1', notes: '' },
  { resource_id: 'R2', title: 'Algebra access', evidence_type: 'synthesis', subject: 'math', grade_band: 'secondary', url: 'u2', notes: '' },
  { resource_id: 'R3', title: 'Tutoring', evidence_type: 'synthesis', subject: 'any', grade_band: 'all', url: 'u3', notes: '' },
  { resource_id: 'R4', title: 'Equity systems', evidence_type: 'synthesis', subject: 'any', grade_band: 'all', url: 'u4', notes: '' },
];
const CROSSWALK = [
  { finding_type: 'subgroup_gap', subgroup: 'frl', subject: 'any', grade_band: 'any', resource_id: 'R4', match_strength: 'adjacent', rationale: 'systems' },
  { finding_type: 'subgroup_gap', subgroup: 'frl', subject: 'math', grade_band: 'middle', resource_id: 'R2', match_strength: 'adjacent', rationale: 'algebra middle' },
  { finding_type: 'subgroup_gap', subgroup: 'frl', subject: 'math', grade_band: 'high', resource_id: 'R2', match_strength: 'adjacent', rationale: 'algebra high' },
  { finding_type: 'subgroup_gap', subgroup: 'frl', subject: 'any', grade_band: 'any', resource_id: 'R3', match_strength: 'general', rationale: 'broad' },
  { finding_type: 'subgroup_gap', subgroup: 'mll', subject: 'any', grade_band: 'any', resource_id: 'R1', match_strength: 'direct', rationale: 'mll direct' },
  { finding_type: 'subgroup_gap', subgroup: 'mll', subject: 'any', grade_band: 'any', resource_id: 'R3', match_strength: 'general', rationale: 'broad' },
  { finding_type: 'low_growth', subgroup: '', subject: 'math', grade_band: 'elementary', resource_id: 'R3', match_strength: 'general', rationale: 'broad' },
];

const FRL_FINDING = { type: 'subgroup_gap', subject: 'math', subgroup: 'frl', comparisons: [], bandsServed: ['elementary', 'middle'] };
const MLL_FINDING = { type: 'subgroup_gap', subject: 'ela', subgroup: 'mll', comparisons: [], bandsServed: ['elementary'] };

test('matchResources: direct sorts before adjacent; rationale carried', () => {
  const out = R.matchResources({ findings: [MLL_FINDING], crosswalk: CROSSWALK, resources: RESOURCES });
  assert.equal(out.sections.length, 1);
  assert.equal(out.sections[0].matches[0].resource.resource_id, 'R1');
  assert.equal(out.sections[0].matches[0].strength, 'direct');
  assert.equal(out.sections[0].matches[0].rationale, 'mll direct');
});

test('matchResources: bandsServed lets pooled gaps match band-specific rows', () => {
  const out = R.matchResources({ findings: [FRL_FINDING], crosswalk: CROSSWALK, resources: RESOURCES });
  const ids = out.sections[0].matches.map((m) => m.resource.resource_id);
  assert.ok(ids.includes('R2'), 'middle-band algebra row matches (district serves middle)');
  assert.equal(ids.filter((id) => id === 'R2').length, 1, 'high-band duplicate deduped');
  assert.ok(ids.includes('R4'), 'any/any row matches');
});

test('matchResources: generals pooled once, never in sections', () => {
  const out = R.matchResources({ findings: [FRL_FINDING, MLL_FINDING], crosswalk: CROSSWALK, resources: RESOURCES });
  assert.ok(out.sections.every((s) => s.matches.every((m) => m.strength !== 'general')));
  assert.deepEqual(out.general.map((r) => r.resource_id), ['R3']);
});

test('matchResources: no findings → empty sections, generals fall back to the full general tier', () => {
  const out = R.matchResources({ findings: [], crosswalk: CROSSWALK, resources: RESOURCES });
  assert.deepEqual(out.sections, []);
  assert.deepEqual(out.general.map((r) => r.resource_id), ['R3']);
});
