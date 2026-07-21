const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../engine/admin-data.js');
const C = require('../engine/csv.js');

const ev = (over = {}) => ({
  district_id: 'Columbia 93', device_id: 'd1', session_id: 's1',
  event: 'page_view', props: { page: 'scan' }, created_at: '2026-07-15T10:00:00Z', ...over,
});

test('summarize: drops (system) entirely; (unset) not a district but rolls up', () => {
  const s = A.summarize([
    ev(), ev({ district_id: '(system)', event: 'keepalive', props: {} }),
    ev({ district_id: '(unset)', device_id: 'd2', session_id: 's2' }),
  ]);
  assert.equal(s.districts, 1);
  assert.equal(s.devices, 2);
  assert.equal(s.sessions, 2);
  assert.equal(s.events, 2);
  assert.deepEqual(s.perDistrict.map((d) => d.district).sort(), ['(unset)', 'Columbia 93']);
});
test('summarize: weekly buckets on ISO Mondays, ascending', () => {
  const s = A.summarize([
    ev({ created_at: '2026-07-13T00:30:00Z' }), // Mon
    ev({ created_at: '2026-07-19T23:00:00Z' }), // Sun same ISO week
    ev({ created_at: '2026-07-20T01:00:00Z' }), // next Mon
  ]);
  assert.deepEqual(s.weekly, [
    { week: '2026-07-13', count: 2 },
    { week: '2026-07-20', count: 1 },
  ]);
});
test('summarize: topPages and uploadErrors count and sort desc', () => {
  const s = A.summarize([
    ev(), ev(), ev({ props: { page: 'gap' } }),
    ev({ event: 'upload_error', props: { subject: 'math', code: 'no_year' } }),
  ]);
  assert.deepEqual(s.topPages[0], { page: 'scan', count: 2 });
  assert.deepEqual(s.uploadErrors, [{ code: 'no_year', count: 1 }]);
});
test('summarize: perDistrict first/last seen and counts', () => {
  const s = A.summarize([
    ev({ created_at: '2026-07-10T00:00:00Z' }),
    ev({ created_at: '2026-07-15T00:00:00Z', session_id: 's2', device_id: 'd2' }),
  ]);
  const d = s.perDistrict[0];
  assert.equal(d.firstSeen, '2026-07-10T00:00:00Z');
  assert.equal(d.lastSeen, '2026-07-15T00:00:00Z');
  assert.equal(d.sessions, 2);
  assert.equal(d.devices, 2);
  assert.equal(d.events, 2);
});
test('summarize: empty input → zeroed shape', () => {
  const s = A.summarize([]);
  assert.deepEqual([s.districts, s.devices, s.sessions, s.events], [0, 0, 0, 0]);
  assert.deepEqual(s.weekly, []);
});
test('validateResource: rules', () => {
  assert.deepEqual(A.validateResource({ resource_id: 'R30', title: 'T', url: 'https://x.org' }, ['R01']), []);
  assert.ok(A.validateResource({ resource_id: '', title: 'T', url: 'https://x' }, []).length);
  assert.ok(A.validateResource({ resource_id: 'R01', title: 'T', url: 'https://x' }, ['R01']).length);
  assert.ok(A.validateResource({ resource_id: 'R30', title: '', url: 'https://x' }, []).length);
  assert.ok(A.validateResource({ resource_id: 'R30', title: 'T', url: 'ftp://x' }, []).length);
});
test('validateCrosswalk: rules', () => {
  const ok = { finding_type: 'subgroup_gap', subgroup: 'mll', subject: 'any', grade_band: 'any', match_strength: 'direct', resource_id: 'R01' };
  assert.deepEqual(A.validateCrosswalk(ok, ['R01']), []);
  assert.ok(A.validateCrosswalk({ ...ok, resource_id: 'R99' }, ['R01']).length);
  assert.ok(A.validateCrosswalk({ ...ok, subgroup: '' }, ['R01']).length);
});
test('diffPublished: equal, unequal, CRLF-insensitive', () => {
  const cols = ['a', 'b'];
  const rows = [{ a: '1', b: '2' }];
  const file = C.writeCsv(cols, rows);
  assert.equal(A.diffPublished(cols, rows, file), false);
  assert.equal(A.diffPublished(cols, rows, file.replace(/\n/g, '\r\n')), false);
  assert.equal(A.diffPublished(cols, [{ a: '1', b: 'X' }], file), true);
});
