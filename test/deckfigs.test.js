// SVG figure builders: structure, counts, escaping, and the data-honesty
// details (2020 dashed bridge, gold tile per school, ringed standouts).
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../deck-figures.js');

const count = (svg, re) => (svg.match(re) || []).length;

const SCATTER = {
  kind: 'scatter', subject: 'math',
  points: [
    { name: 'A & B Elementary', x: -0.4, y: 0.11, n: 40 },
    { name: 'North', x: -0.1, y: -0.06, n: 30 },
    { name: 'South', x: 0.2, y: 0.02, n: 35 },
  ],
  xMean: -0.1, yMean: 0.02,
  best: { name: 'A & B Elementary', text: '+0.11 SD' },
  worst: { name: 'North', text: '−0.06 SD' },
};

test('scatter: one dot per school, two gold standout rings, crosshair, escaped names', () => {
  const { svg, w, h } = F.scatter(SCATTER);
  assert.ok(w > 0 && h > 0);
  assert.equal(count(svg, /r="7"/g), 3, 'three dots');
  assert.equal(count(svg, /r="11"/g), 2, 'two standout rings');
  assert.equal(count(svg, /stroke-dasharray="5 4"/g), 2, 'two crosshair lines');
  assert.ok(svg.includes('A &amp; B Elementary'), 'names XML-escaped');
  assert.ok(!svg.includes('A & B Elementary'), 'no raw ampersand');
});

const GROUPS = {
  kind: 'groups', subject: 'math',
  sections: [
    { title: 'Income', groups: [
      { label: 'FRL', n: 900, median: -0.05, q1: -0.4, q3: 0.3, text: '−0.05 SD' },
      { label: 'non-FRL', n: 1000, median: 0.08, q1: -0.3, q3: 0.4, text: '+0.08 SD' },
    ]},
  ],
  domain: { min: -1, max: 1.2 },
};

test('groups: one diamond per group, zero line, section heading', () => {
  const { svg } = F.groups(GROUPS);
  assert.equal(count(svg, /<polygon/g), 2, 'one diamond per group');
  assert.ok(svg.includes('INCOME'));
  assert.ok(svg.includes('typical year of growth'));
});

const HIST = {
  kind: 'stateHist', district: 'X', year: '2025',
  levels: [{ level: 'Elementary', heading: 'Elementary schools', subjects: {
    ela: { poolN: 1000,
      bins: [{ x0: -0.1, x1: -0.05, count: 300, district: 1 }, { x0: -0.05, x1: 0, count: 400, district: 2 }, { x0: 0, x1: 0.05, count: 300, district: 0 }],
      yours: [{ name: 'A', z: -0.07, rank: 700 }, { name: 'B', z: -0.02, rank: 600 }, { name: 'C', z: -0.01, rank: 580 }] },
    math: { poolN: 0, bins: [], yours: [] },
  }}],
};

test('stateHist: one gold tile per district school; empty subject pools skipped', () => {
  const { svg } = F.stateHist(HIST);
  assert.equal(count(svg, /#9A7611/g), 3, 'three gold tiles, math block skipped');
  assert.ok(svg.includes('0 of 3'), 'caption counts at-or-above-typical');
  assert.ok(svg.includes('1,000 schools statewide'));
});

const TREND = {
  kind: 'stateTrend', district: 'X', years: ['2018', '2019', '2021', '2022'],
  series: {
    ela: [{ year: '2018', z: 0.01 }, { year: '2019', z: -0.01 }, { year: '2021', z: 0.0 }, { year: '2022', z: -0.06 }],
    math: [],
  },
};

test('stateTrend: dashed bridge across the 2020 gap, solid elsewhere, ghosted year label', () => {
  const { svg } = F.stateTrend(TREND);
  assert.equal(count(svg, /stroke-dasharray="7 6"/g), 1, 'exactly one dashed bridge (2019→2021)');
  assert.equal(count(svg, /<circle/g), 4, 'one point per year with data');
  assert.ok(svg.includes('’20'), '2020 tick still labeled (ghosted)');
});

const FOREST = {
  kind: 'forest', subject: 'math', groupA: 'FRL', groupB: 'non-FRL',
  district: { gap: -0.13, ci: [-0.21, -0.06], text: '−0.13 SD' },
  rows: [
    { name: 'One', nA: 120, nB: 150, gap: -0.2, ci: [-0.3, -0.1], text: '−0.20 SD' },
    { name: 'Two', nA: 130, nB: 140, gap: -0.1, ci: [-0.2, 0.0], text: '−0.10 SD' },
  ],
  excluded: [], axis: { min: -0.36, max: 0.36 },
};

test('forest: one diamond per school, both reference lines labeled', () => {
  const { svg } = F.forest(FOREST);
  assert.equal(count(svg, /<polygon/g), 2);
  assert.ok(svg.includes('no gap'));
  assert.ok(svg.includes('district −0.13 SD'));
  assert.ok(svg.includes('stroke-dasharray="7 5"'), 'district line dashed');
});
