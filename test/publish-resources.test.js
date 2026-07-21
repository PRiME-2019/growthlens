const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../engine/resources.js');
const P = require('../tools/publish-resources.js');

const lf = (s) => s.replace(/\r\n/g, '\n');
const readRef = (f) => lf(fs.readFileSync(path.join(__dirname, '..', 'reference', f), 'utf8'));

// ---- round-trip -------------------------------------------------------------

test('writeCsv: parseCsv inverts it for commas, quotes, and newlines in fields', () => {
  const header = ['a', 'b', 'c'];
  const rows = [
    { a: 'plain', b: 'has, comma', c: 'has "quotes" inside' },
    { a: 'multi\nline', b: '', c: 'trailing space ' },
  ];
  const out = P.writeCsv(header, rows);
  assert.deepEqual(R.parseCsv(out), rows);
});

test('writeCsv: every field quoted, LF endings, trailing newline', () => {
  const out = P.writeCsv(['x', 'y'], [{ x: '1', y: '2' }]);
  assert.equal(out, '"x","y"\n"1","2"\n');
  assert.ok(!out.includes('\r'));
});

// ---- fidelity against the shipped CSVs --------------------------------------

test('column constants match the shipped CSV headers exactly', () => {
  assert.equal(readRef('evidence_resources.csv').split('\n')[0],
    P.RESOURCE_COLUMNS.map((c) => `"${c}"`).join(','));
  assert.equal(readRef('evidence_crosswalk.csv').split('\n')[0],
    P.CROSSWALK_COLUMNS.map((c) => `"${c}"`).join(','));
});

test('re-writing the parsed resources CSV reproduces it byte-for-byte (LF-normalized)', () => {
  const file = readRef('evidence_resources.csv');
  assert.equal(P.writeCsv(P.RESOURCE_COLUMNS, R.parseCsv(file)), file);
});

test('re-writing the parsed crosswalk CSV reproduces it byte-for-byte (LF-normalized)', () => {
  const file = readRef('evidence_crosswalk.csv');
  assert.equal(P.writeCsv(P.CROSSWALK_COLUMNS, R.parseCsv(file)), file);
});

// ---- fetch shaping ----------------------------------------------------------

test('fetchTable: requests the right columns in position order and returns rows', async () => {
  let captured = null;
  const rows = [{ resource_id: 'R01', title: 'T' }];
  const fetchFn = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => rows };
  };
  const out = await P.fetchTable('https://x.test', 'anon', 'resources', ['resource_id', 'title'], fetchFn);
  assert.deepEqual(out, rows);
  assert.equal(captured.url,
    'https://x.test/rest/v1/resources?select=resource_id,title&order=position.asc');
  assert.equal(captured.opts.headers.apikey, 'anon');
});

test('fetchTable: non-ok response throws (publish must fail loudly, not commit junk)', async () => {
  const fetchFn = async () => ({ ok: false, status: 500, json: async () => [] });
  await assert.rejects(
    () => P.fetchTable('https://x.test', 'anon', 'resources', ['a'], fetchFn),
    /resources.*500/);
});
