const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '../engine/store.js'), 'utf8');

// Each call runs store.js fresh against a brand-new mock window (isolated module state).
function freshStore() {
  const win = {
    GAPS_DATA: { meta: { subject: 'math', nSchools: 30 }, schools: [] },
    HEATMAP_DATA: { meta: { subject: 'math' }, schools: [] },
    DEMO_DATA: { frl: { groups: [] } },
    DEMO_DATA_BY_SCHOOL: {},
    ACH_DATA: { student: {}, school: {} },
  };
  const demoGaps = win.GAPS_DATA;
  // eslint-disable-next-line no-new-func
  new Function('window', SRC)(win);
  return { win, store: win.GLStore, demoGaps };
}

test('store: seedDemo makes math available, ela not (demo is Math-only)', () => {
  const { store } = freshStore();
  store.seedDemo();
  assert.equal(store.available('math'), true);
  assert.equal(store.available('ela'), false);
});

test('store: activating math + frl points window.GAPS_DATA at the demo gaps', () => {
  const { win, store, demoGaps } = freshStore();
  store.seedDemo();
  store.setActiveSubject('math');
  store.setActiveSubgroup('frl');
  assert.equal(win.GAPS_DATA, demoGaps);
});

test('store: setActiveSubject(ela) is a no-op until an ELA file is uploaded', () => {
  const { store } = freshStore();
  store.seedDemo();
  store.setActiveSubject('ela');
  assert.equal(store.activeSubject(), 'math');
});

test('store: an unknown subgroup falls back to frl on the demo', () => {
  const { win, store, demoGaps } = freshStore();
  store.seedDemo();
  store.setActiveSubject('math');
  store.setActiveSubgroup('iep'); // demo only ships frl
  assert.equal(win.GAPS_DATA, demoGaps);
});

test('store: putUploaded(ela) makes ela available + active and shadows the right gaps', () => {
  const { win, store } = freshStore();
  store.seedDemo();
  const elaFrl = { meta: { subject: 'ela', demographic: 'frl' }, schools: [] };
  const elaShapes = { GAPS_DATA_BY_DEMO: { frl: elaFrl }, HEATMAP_DATA: {}, DEMO_DATA: {}, DEMO_DATA_BY_SCHOOL: {}, ACH_DATA: {} };
  store.putUploaded('ela', elaShapes, { subject: 'ela', nSchools: 5 });
  assert.equal(store.available('ela'), true);
  store.setActiveSubject('ela');
  assert.equal(store.activeSubject(), 'ela');
  store.setActiveSubgroup('frl');
  assert.equal(win.GAPS_DATA, elaFrl);
});

test('store: getActiveMeta returns the active source meta with source tag', () => {
  const { store } = freshStore();
  store.seedDemo();
  store.setActiveSubject('math');
  const m = store.getActiveMeta();
  assert.equal(m.subject, 'math');
  assert.equal(m.source, 'demo');
  const elaShapes = { GAPS_DATA_BY_DEMO: { frl: {} }, HEATMAP_DATA: {}, DEMO_DATA: {}, DEMO_DATA_BY_SCHOOL: {}, ACH_DATA: {} };
  store.putUploaded('ela', elaShapes, { subject: 'ela', nSchools: 7 });
  store.setActiveSubject('ela');
  assert.equal(store.getActiveMeta().source, 'uploaded'); // putUploaded tags source:'uploaded'
});

test('store: putUploaded(math) shadows the demo for the same subject (resolve precedence)', () => {
  const { win, store } = freshStore();
  store.seedDemo();
  const mathFrl = { meta: { subject: 'math', demographic: 'frl' }, schools: [] };
  const mathShapes = { GAPS_DATA_BY_DEMO: { frl: mathFrl }, HEATMAP_DATA: {}, DEMO_DATA: {}, DEMO_DATA_BY_SCHOOL: {}, ACH_DATA: {} };
  store.putUploaded('math', mathShapes, { subject: 'math', nSchools: 99 });
  store.setActiveSubject('math');
  store.setActiveSubgroup('frl');
  assert.equal(win.GAPS_DATA, mathFrl);                   // uploaded shadows demo for the same subject
  assert.equal(store.getActiveMeta().source, 'uploaded');
  assert.equal(store.getActiveMeta().nSchools, 99);
});
