const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine/csv.js');
const R = require('../engine/resources.js');

test('GLCsv.writeCsv: parseCsv inverts it (commas, quotes, newlines)', () => {
  const rows = [{ a: 'x,y', b: 'he said "hi"', c: 'two\nlines' }];
  assert.deepEqual(R.parseCsv(C.writeCsv(['a', 'b', 'c'], rows)), rows);
});
test('GLCsv.writeCsv: exact dialect — all quoted, LF, trailing newline', () => {
  assert.equal(C.writeCsv(['x'], [{ x: '1' }]), '"x"\n"1"\n');
});
test('tools/publish-resources re-exports the same writeCsv', () => {
  const P = require('../tools/publish-resources.js');
  assert.equal(P.writeCsv, C.writeCsv);
});
