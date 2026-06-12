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

test('store: allGapSlices returns every comparison the active dataset carries', () => {
  const { win, store, demoGaps } = freshStore();
  store.seedDemo();
  store.setActiveSubject('math');
  const slices = store.allGapSlices();
  assert.deepEqual(Object.keys(slices), ['frl']);   // mock demo ships frl only
  assert.equal(slices.frl, demoGaps);
  const iep = { meta: { subject: 'ela', demographic: 'iep' }, schools: [] };
  store.putUploaded('ela', { GAPS_DATA_BY_DEMO: { frl: {}, iep }, HEATMAP_DATA: {}, DEMO_DATA: {}, ACH_DATA: {} }, { subject: 'ela' });
  store.setActiveSubject('ela');
  assert.deepEqual(Object.keys(store.allGapSlices()).sort(), ['frl', 'iep']);
  assert.equal(store.allGapSlices().iep, iep);
});

test('store: allSubjectsData spans every available subject regardless of the active one', () => {
  const { store } = freshStore();
  store.seedDemo();
  store.setActiveSubject('math');
  assert.deepEqual(Object.keys(store.allSubjectsData()), ['math']);   // demo is Math-only
  const elaShapes = { GAPS_DATA_BY_DEMO: { frl: {} }, HEATMAP_DATA: { schools: [] }, DEMO_DATA: {}, ACH_DATA: {} };
  store.putUploaded('ela', elaShapes, { subject: 'ela' });
  // Real data suppresses the sample entirely — only the upload remains.
  const all = store.allSubjectsData();
  assert.deepEqual(Object.keys(all), ['ela']);
  assert.equal(all.ela.heat, elaShapes.HEATMAP_DATA);
  const mathShapes = { GAPS_DATA_BY_DEMO: { frl: {} }, HEATMAP_DATA: { schools: [] }, DEMO_DATA: {}, ACH_DATA: {} };
  store.putUploaded('math', mathShapes, { subject: 'math' });
  assert.deepEqual(Object.keys(store.allSubjectsData()).sort(), ['ela', 'math']);
});

test('store: any real upload suppresses the demo; removing it brings the sample back', () => {
  const { win, store, demoGaps } = freshStore();
  store.seedDemo();
  store.setActiveSubject('math');
  assert.equal(store.available('math'), true);   // demo backs math
  const elaFrl = { meta: { subject: 'ela', demographic: 'frl' }, schools: [] };
  store.putUploaded('ela', { GAPS_DATA_BY_DEMO: { frl: elaFrl }, HEATMAP_DATA: {}, DEMO_DATA: {}, ACH_DATA: {} }, { subject: 'ela' });
  assert.equal(store.available('math'), false, 'sample math unloaded once real ELA exists');
  assert.equal(store.activeSubject(), 'ela', 'active subject moves off the vanished sample');
  assert.equal(win.GAPS_DATA, elaFrl, 'globals point at the upload, not stale demo data');
  store.removeUploaded('ela');
  assert.equal(store.available('math'), true, 'sample returns when the last upload is removed');
  assert.equal(store.activeSubject(), 'math');
  assert.equal(win.GAPS_DATA, demoGaps);
});

test('store: putUploaded(ela) makes ela available + active and shadows the right gaps', () => {
  const { win, store } = freshStore();
  store.seedDemo();
  const elaFrl = { meta: { subject: 'ela', demographic: 'frl' }, schools: [] };
  const elaShapes = { GAPS_DATA_BY_DEMO: { frl: elaFrl }, HEATMAP_DATA: {}, DEMO_DATA: {}, ACH_DATA: {} };
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
  const elaShapes = { GAPS_DATA_BY_DEMO: { frl: {} }, HEATMAP_DATA: {}, DEMO_DATA: {}, ACH_DATA: {} };
  store.putUploaded('ela', elaShapes, { subject: 'ela', nSchools: 7 });
  store.setActiveSubject('ela');
  assert.equal(store.getActiveMeta().source, 'uploaded'); // putUploaded tags source:'uploaded'
});

test('store: putUploaded(math) shadows the demo for the same subject (resolve precedence)', () => {
  const { win, store } = freshStore();
  store.seedDemo();
  const mathFrl = { meta: { subject: 'math', demographic: 'frl' }, schools: [] };
  const mathShapes = { GAPS_DATA_BY_DEMO: { frl: mathFrl }, HEATMAP_DATA: {}, DEMO_DATA: {}, ACH_DATA: {} };
  store.putUploaded('math', mathShapes, { subject: 'math', nSchools: 99 });
  store.setActiveSubject('math');
  store.setActiveSubgroup('frl');
  assert.equal(win.GAPS_DATA, mathFrl);                   // uploaded shadows demo for the same subject
  assert.equal(store.getActiveMeta().source, 'uploaded');
  assert.equal(store.getActiveMeta().nSchools, 99);
});

test('store: removeUploaded(math) falls back to the demo and re-points the globals', () => {
  const { win, store, demoGaps } = freshStore();
  store.seedDemo();
  const mathFrl = { meta: { subject: 'math', demographic: 'frl' }, schools: [] };
  const mathShapes = { GAPS_DATA_BY_DEMO: { frl: mathFrl }, HEATMAP_DATA: {}, DEMO_DATA: {}, ACH_DATA: {} };
  store.putUploaded('math', mathShapes, { subject: 'math', nSchools: 99 });
  store.setActiveSubject('math');
  store.setActiveSubgroup('frl');
  assert.equal(win.GAPS_DATA, mathFrl);
  store.removeUploaded('math');
  assert.equal(store.available('math'), true);            // demo still backs math
  assert.equal(store.getActiveMeta().source, 'demo');
  assert.equal(win.GAPS_DATA, demoGaps);                  // globals re-pointed at the demo
});

test('store: removeUploaded(ela) disables ela and moves the active subject off it', () => {
  const { win, store, demoGaps } = freshStore();
  store.seedDemo();
  const elaFrl = { meta: { subject: 'ela', demographic: 'frl' }, schools: [] };
  const elaShapes = { GAPS_DATA_BY_DEMO: { frl: elaFrl }, HEATMAP_DATA: {}, DEMO_DATA: {}, ACH_DATA: {} };
  store.putUploaded('ela', elaShapes, { subject: 'ela', nSchools: 5 });
  store.setActiveSubject('ela');
  assert.equal(store.activeSubject(), 'ela');
  store.removeUploaded('ela');
  assert.equal(store.available('ela'), false);            // no demo backs ela
  assert.equal(store.activeSubject(), 'math');            // fell back to an available subject
  assert.equal(win.GAPS_DATA, demoGaps);
});

test('store: removeUploaded of a never-uploaded subject is a safe no-op', () => {
  const { store } = freshStore();
  store.seedDemo();
  store.removeUploaded('ela');
  assert.equal(store.activeSubject(), 'math');
  assert.equal(store.available('math'), true);
});

test('store: getUploadedMeta returns the uploaded meta for that subject only', () => {
  const { store } = freshStore();
  store.seedDemo();
  assert.equal(store.getUploadedMeta('math'), null);      // demo doesn't count
  const shapes = { GAPS_DATA_BY_DEMO: { frl: {} }, HEATMAP_DATA: {}, DEMO_DATA: {}, ACH_DATA: {} };
  store.putUploaded('math', shapes, { subject: 'math', filename: 'math.csv' });
  assert.equal(store.getUploadedMeta('math').filename, 'math.csv');
  store.removeUploaded('math');
  assert.equal(store.getUploadedMeta('math'), null);
});

test('store: allSubjectsData carries ach, demo, and meta alongside gaps and heat', () => {
  const { store } = freshStore();
  store.seedDemo();
  const shapes = {
    GAPS_DATA_BY_DEMO: { frl: { meta: { subject: 'math' }, schools: [] } },
    HEATMAP_DATA: { meta: { subject: 'math' }, schools: [] },
    ACH_DATA: { school: { points: [] }, student: { points: [] } },
    DEMO_DATA: { frl: { label: 'FRL', groups: [], districtMean: 0 } },
  };
  store.putUploaded('math', shapes, { subject: 'math', latestYear: 2025, nSchools: 0 });
  const all = store.allSubjectsData();
  assert.ok(all.math.gaps, 'gaps still present');
  assert.equal(all.math.heat, shapes.HEATMAP_DATA, 'heat still present');
  assert.ok(all.math.ach.school, 'ach present');
  assert.ok(all.math.demo.frl, 'demo present');
  assert.equal(all.math.meta.latestYear, 2025, 'meta present');
});

test('store: availableSubgroups reflects the active dataset (demo = frl only; upload = its keys)', () => {
  const { store } = freshStore();
  store.seedDemo();
  store.setActiveSubject('math');
  assert.deepEqual(store.availableSubgroups(), ['frl']);
  const shapes = { GAPS_DATA_BY_DEMO: { frl: {}, iep: {}, el: {} }, HEATMAP_DATA: {}, DEMO_DATA: {}, ACH_DATA: {} };
  store.putUploaded('math', shapes, { subject: 'math' });
  assert.deepEqual(store.availableSubgroups().sort(), ['el', 'frl', 'iep']);
  store.removeUploaded('math');
  assert.deepEqual(store.availableSubgroups(), ['frl']);  // back to the demo's keys
});
