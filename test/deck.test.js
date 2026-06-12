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
