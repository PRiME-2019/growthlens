const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../telemetry.js');

// ---- filterDistricts --------------------------------------------------------

const LIST = ['Columbia 93', 'West Plains R-VII', 'Plainfield', 'Springfield R-XII', 'Mehlville R-IX'];

test('filterDistricts: prefix matches rank before substring matches', () => {
  assert.deepEqual(T.filterDistricts(LIST, 'plain'), ['Plainfield', 'West Plains R-VII']);
});
test('filterDistricts: case-insensitive', () => {
  assert.deepEqual(T.filterDistricts(LIST, 'SPRING'), ['Springfield R-XII']);
});
test('filterDistricts: blank or whitespace query returns empty', () => {
  assert.deepEqual(T.filterDistricts(LIST, ''), []);
  assert.deepEqual(T.filterDistricts(LIST, '   '), []);
});
test('filterDistricts: respects limit', () => {
  const many = Array.from({ length: 20 }, (_, i) => `District ${i}`);
  assert.equal(T.filterDistricts(many, 'district').length, 8);
  assert.equal(T.filterDistricts(many, 'district', 3).length, 3);
});
test('filterDistricts: non-array list is safe', () => {
  assert.deepEqual(T.filterDistricts(null, 'x'), []);
});

// ---- sanitizeProps ----------------------------------------------------------

test('sanitizeProps: unknown event returns null', () => {
  assert.equal(T.sanitizeProps('made_up_event', { a: 1 }), null);
});
test('sanitizeProps: drops keys not on the whitelist', () => {
  assert.deepEqual(T.sanitizeProps('page_view', { page: 'scan', student: 'NO' }), { page: 'scan' });
});
test('sanitizeProps: truncates long strings to 120 chars', () => {
  const long = 'x'.repeat(400);
  assert.equal(T.sanitizeProps('page_view', { page: long }).page.length, 120);
});
test('sanitizeProps: arrays capped at 10, elements truncated', () => {
  const arr = Array.from({ length: 15 }, () => 'y'.repeat(200));
  const out = T.sanitizeProps('export', { subjects: arr });
  assert.equal(out.subjects.length, 10);
  assert.equal(out.subjects[0].length, 120);
});
test('sanitizeProps: numbers and booleans pass through; null/undefined dropped', () => {
  assert.deepEqual(T.sanitizeProps('identity_set', { custom: true }), { custom: true });
  assert.deepEqual(T.sanitizeProps('page_view', { page: null }), {});
  assert.deepEqual(T.sanitizeProps('session_start', null), {});
});
