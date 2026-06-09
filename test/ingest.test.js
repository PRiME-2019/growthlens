const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../engine/ingest.js');

test('detectPrefix: case-insensitive, math', () => {
  assert.equal(I.detectPrefix(['grade', 'math_z_residual', 'MATH_Z_T']).subject, 'math');
});
test('detectPrefix: comm_arts → ela', () => {
  assert.equal(I.detectPrefix(['COMM_ARTS_Z_RESIDUAL', 'GRADE']).subject, 'ela');
});
test('detectPrefix: no residual column → null', () => {
  assert.equal(I.detectPrefix(['grade', 'school_code']), null);
});
test('parseFlag tolerant + case-insensitive', () => {
  assert.equal(I.parseFlag('Y'), true);
  assert.equal(I.parseFlag('y'), true);
  assert.equal(I.parseFlag('1'), true);
  assert.equal(I.parseFlag('true'), true);
  assert.equal(I.parseFlag('N'), false);
  assert.equal(I.parseFlag(''), false);
  assert.equal(I.parseFlag('garbage'), false);
});
test('validate: missing required subgroup column is a blocking error listing it', () => {
  const headers = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T','SCHOOL_CODE','GRADE','GROWTH_YEAR','FREE_OR_REDUCED_LUNCH','IEP_DISABILITY','ENGLISH_LANGUAGE_LEARNER','BLACK','WHITE']; // missing HISPANIC
  const r = I.validate(headers);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('HISPANIC'));
});
test('validate: full header set passes', () => {
  const headers = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T','SCHOOL_CODE','GRADE','GROWTH_YEAR','FREE_OR_REDUCED_LUNCH','IEP_DISABILITY','ENGLISH_LANGUAGE_LEARNER','BLACK','WHITE','HISPANIC'];
  assert.equal(I.validate(headers).ok, true);
});
test('validate: no recognizable prefix → error no_prefix', () => {
  const r = I.validate(['GRADE','SCHOOL_CODE']);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'no_prefix');
});
