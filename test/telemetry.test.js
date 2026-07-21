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

// ---- createClient -----------------------------------------------------------

function stubbed(overrides = {}) {
  const store = new Map();
  const calls = [];
  let n = 0;
  const deps = {
    fetchFn: async (url, opts) => { calls.push({ url, opts }); return { ok: true }; },
    storage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    uuid: () => 'uuid-' + (++n),
    url: 'https://fake.test',
    key: 'anon-key',
    version: '0.73',
    ...overrides,
  };
  return { deps, calls, store };
}
const rowsOf = (call) => JSON.parse(call.opts.body);

test('client: init queues session_start; flush POSTs one bulk insert with the right shape', async () => {
  const { deps, calls } = stubbed();
  const c = T.createClient(deps);
  c.init();
  await c.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://fake.test/rest/v1/events');
  assert.equal(calls[0].opts.headers.apikey, 'anon-key');
  assert.equal(calls[0].opts.headers.Prefer, 'return=minimal');
  const rows = rowsOf(calls[0]);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(),
    ['app_version', 'device_id', 'district_id', 'event', 'is_custom', 'props', 'session_id']);
  assert.equal(rows[0].event, 'session_start');
  assert.equal(rows[0].district_id, '(unset)');
  assert.equal(rows[0].app_version, '0.73');
});

test('client: auto-flushes when the queue reaches flushAt', async () => {
  const { deps, calls } = stubbed();
  const c = T.createClient({ ...deps, flushAt: 5 });
  c.init(); // 1 queued
  for (let i = 0; i < 4; i++) c.log('page_view', { page: 'scan' }); // hits 5
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(rowsOf(calls[0]).length, 5);
});

test('client: setIdentity stamps later rows and sends identity_set', async () => {
  const { deps, calls } = stubbed();
  const c = T.createClient(deps);
  c.init();
  c.setIdentity({ district: 'Mehlville R-IX', isCustom: false });
  await c.flush();
  const rows = calls.flatMap(rowsOf);
  const idSet = rows.find((r) => r.event === 'identity_set');
  assert.deepEqual(idSet.props, { custom: false });
  assert.equal(idSet.district_id, 'Mehlville R-IX');
  c.log('page_view', { page: 'gap' });
  await c.flush();
  const last = rowsOf(calls[calls.length - 1]);
  assert.equal(last[last.length - 1].district_id, 'Mehlville R-IX');
});

test('client: opt-out gates logging but the opt_out/opt_in events themselves go through', async () => {
  const { deps, calls } = stubbed();
  const c = T.createClient(deps);
  c.init();
  c.setOptOut(true);
  await Promise.resolve();
  c.log('page_view', { page: 'scan' }); // must be dropped
  c.setOptOut(false);
  await Promise.resolve();
  await c.flush();
  const events = calls.flatMap(rowsOf).map((r) => r.event);
  assert.ok(events.includes('opt_out'));
  assert.ok(events.includes('opt_in'));
  assert.ok(!events.includes('page_view'));
});

test('client: unknown event names are never queued', async () => {
  const { deps, calls } = stubbed();
  const c = T.createClient(deps);
  c.log('made_up', {});
  await c.flush();
  assert.equal(calls.length, 0);
});

test('client: failed send retries once then drops without throwing', async () => {
  let attempts = 0;
  const { deps } = stubbed({ fetchFn: async () => { attempts++; throw new Error('net down'); } });
  const c = T.createClient(deps);
  c.init();
  await c.flush(); // must not reject
  assert.equal(attempts, 2);
  await c.flush(); // queue is empty now — no further attempts
  assert.equal(attempts, 2);
});

test('client: non-ok response also retries once', async () => {
  let attempts = 0;
  const { deps } = stubbed({ fetchFn: async () => { attempts++; return { ok: false, status: 500 }; } });
  const c = T.createClient(deps);
  c.init();
  await c.flush();
  assert.equal(attempts, 2);
});

test('client: empty url means flush drops silently without calling fetch', async () => {
  const { deps, calls } = stubbed({ url: '' });
  const c = T.createClient(deps);
  c.init();
  await c.flush();
  assert.equal(calls.length, 0);
});

test('client: deviceId minted once and persists across clients on the same storage', () => {
  const { deps } = stubbed();
  const a = T.createClient(deps);
  a.init();
  const id1 = a.getIdentity().deviceId;
  const b = T.createClient(deps); // same storage map
  b.init();
  assert.equal(b.getIdentity().deviceId, id1);
});

test('client: needsPrompt true on first run, false after dismissPrompt or setIdentity', () => {
  const { deps } = stubbed();
  const c = T.createClient(deps);
  c.init();
  assert.equal(c.needsPrompt(), true);
  c.dismissPrompt();
  assert.equal(c.needsPrompt(), false);
  const { deps: deps2 } = stubbed();
  const d = T.createClient(deps2);
  d.init();
  d.setIdentity({ district: 'Columbia 93', isCustom: false });
  assert.equal(d.needsPrompt(), false);
});

test('client: corrupted localStorage JSON is survived', () => {
  const { deps, store } = stubbed();
  store.set(T.IDENTITY_KEY, '{not json!!');
  const c = T.createClient(deps);
  c.init();
  assert.equal(c.needsPrompt(), true);
  assert.ok(c.getIdentity().deviceId);
});
