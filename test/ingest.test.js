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
test('validate: demographic columns are optional — a file missing them still loads', () => {
  // Only growth + structural columns are required now; the demographic splits
  // are offered per-file based on which columns are present (see DEMOG_COLS).
  const headers = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T','SCHOOL_CODE','GRADE','GROWTH_YEAR']; // no demographic columns at all
  const r = I.validate(headers);
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
});
test('validate: a missing STRUCTURAL column is still a blocking error listing it', () => {
  const headers = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T','SCHOOL_CODE','GRADE']; // missing GROWTH_YEAR
  const r = I.validate(headers);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('GROWTH_YEAR'));
});
test('validate: full header set passes', () => {
  const headers = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T','SCHOOL_CODE','GRADE','GROWTH_YEAR','FREE_OR_REDUCED_LUNCH','IEP_DISABILITY','ENGLISH_LANGUAGE_LEARNER','GIFTED','GENDER','BLACK','WHITE','HISPANIC'];
  assert.equal(I.validate(headers).ok, true);
});
test('validate: no recognizable prefix → error no_prefix', () => {
  const r = I.validate(['GRADE','SCHOOL_CODE']);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'no_prefix');
});
test('detectDelimiter: tab-delimited DESE .txt header → tab', () => {
  const header = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T','SCHOOL_CODE','GRADE'].join('\t');
  assert.equal(I.detectDelimiter(header).char, '\t');
  assert.equal(I.detectDelimiter(header).sql, '\\t');   // the literal DuckDB's sep expects
});
test('detectDelimiter: comma .csv header → comma', () => {
  const header = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T'].join(',');
  assert.equal(I.detectDelimiter(header).char, ',');
});
test('detectDelimiter: picks the dominant separator, not an incidental one', () => {
  // A tab file whose header text happens to contain a stray comma stays tab.
  const header = 'A_Z_RESIDUAL\tB, C\tD\tE';
  assert.equal(I.detectDelimiter(header).char, '\t');
});
test('detectDelimiter: no separators (single column) defaults to comma', () => {
  assert.equal(I.detectDelimiter('GRADE').char, ',');
});
test('validate: works off a tab-split header the same as comma', () => {
  const header = ['MATH_Z_RESIDUAL','MATH_Z_RESIDUAL_SE','MATH_Z_T','SCHOOL_CODE','GRADE','GROWTH_YEAR','FREE_OR_REDUCED_LUNCH','IEP_DISABILITY','ENGLISH_LANGUAGE_LEARNER','BLACK','WHITE','HISPANIC'].join('\t');
  const d = I.detectDelimiter(header);
  assert.equal(I.validate(header.split(d.char)).ok, true);
});
test('SUBGROUPS: includes gifted (Y/N flag) and gender (M/F split into two booleans)', () => {
  const byKey = Object.fromEntries(I.SUBGROUPS.map((s) => [s.key, s]));
  assert.ok(byKey.gifted, 'gifted subgroup present');
  assert.equal(byKey.gifted.a.dbCol, 'gifted');
  assert.equal(byKey.gifted.a.val, true);
  assert.equal(byKey.gifted.b.dbCol, 'gifted');
  assert.equal(byKey.gifted.b.val, false);
  assert.ok(byKey.gender, 'gender subgroup present');
  assert.equal(byKey.gender.a.dbCol, 'female');   // Female vs. Male, both as true-sided booleans
  assert.equal(byKey.gender.a.val, true);
  assert.equal(byKey.gender.b.dbCol, 'male');
  assert.equal(byKey.gender.b.val, true);
});
test('demographicColumnsSql: present column → normalized predicate; absent → NULL::BOOLEAN', () => {
  const sql = I.demographicColumnsSql(new Set(['FREE_OR_REDUCED_LUNCH', 'GIFTED', 'GENDER']));
  // Present Y/N flags get the affirmative-token test aliased to their dbCol.
  assert.match(sql, /lower\(trim\("FREE_OR_REDUCED_LUNCH"\)\) IN \('y','1','t','true','yes'\) AS frl/);
  assert.match(sql, /lower\(trim\("GIFTED"\)\) IN \('y','1','t','true','yes'\) AS gifted/);
  // GENDER splits one column into two value-matched booleans.
  assert.match(sql, /lower\(trim\("GENDER"\)\) IN \('f','female'\) AS female/);
  assert.match(sql, /lower\(trim\("GENDER"\)\) IN \('m','male'\) AS male/);
  // Absent columns still emit a real (NULL) column so compute.js predicates stay valid SQL.
  assert.match(sql, /NULL::BOOLEAN AS iep/);
  assert.match(sql, /NULL::BOOLEAN AS black/);
});
test('demographicColumnsSql: every canonical dbCol is emitted exactly once', () => {
  const sql = I.demographicColumnsSql(new Set());   // nothing present
  for (const dbCol of ['frl','direct_cert','iep','el','gifted','black','white','hispanic','female','male']) {
    assert.match(sql, new RegExp(`AS ${dbCol}(\\b|,|$)`), `${dbCol} emitted`);
  }
});
test('normalizeDistrictCode: restores Excel-stripped leading zeros to 6 digits', () => {
  assert.equal(I.normalizeDistrictCode('16090'), '016090');
  assert.equal(I.normalizeDistrictCode('016090'), '016090');
  assert.equal(I.normalizeDistrictCode(' 1090 '), '001090');
  assert.equal(I.normalizeDistrictCode('X-12'), 'X-12');   // non-numeric passes through
  assert.equal(I.normalizeDistrictCode(''), null);
  assert.equal(I.normalizeDistrictCode(null), null);
});
