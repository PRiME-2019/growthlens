# Usage Telemetry + District Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log which districts use GrowthLens and which features they touch, keyed to a self-reported district identity, into a free Supabase Postgres — with disclosure, opt-out, and zero risk to the app when telemetry fails.

**Architecture:** A UMD module `telemetry.js` (browser → `window.GLTelemetry`, Node → `module.exports`) holds all pure logic (props whitelist, truncation, typeahead filter, batching client) so it's `node --test`-able with stubbed fetch/storage. The React shell (`app-shell.jsx`) owns the district modal + sidebar chip and calls the module at instrumentation points. Supabase receives batched inserts through PostgREST with an insert-only anon key; a GitHub Actions cron keeps the free project awake.

**Tech Stack:** Vanilla JS UMD modules (repo pattern, no build step), React 18 via in-browser Babel, Supabase (Postgres + PostgREST + RLS), GitHub Actions, `node --test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-20-usage-telemetry-design.md`

## Global Constraints

- **No build step.** New browser files are plain scripts loaded from `index.html`; no imports of npm packages.
- **UMD pattern** for Node-testable modules — copy the wrapper style of `engine/units.js` exactly.
- **AGPL header** on every new `.js` file — copy the 6-line comment block from the top of `changelog.js`.
- **Telemetry must never throw into the app.** Every public entry point is wrapped so failure = silent no-op. No `console.error` spam (a single `console.warn` at most, none in hot paths).
- **Never any student data, filenames, row counts, or computed results in any event.** Props are whitelisted per event name; everything else is dropped.
- **Event names (fixed, nine + system):** `session_start`, `identity_set`, `opt_out`, `opt_in`, `page_view`, `upload_ok`, `upload_error`, `export`, `interact`, plus cron-only `keepalive`.
- **localStorage key:** `gl:identity`. Existing keys (`gl-seen-version`, analysis prefs) are untouched.
- **String cap:** 120 chars (`MAX_STR`), event name ≤ 40 in the DB.
- **Style:** 2-space indent, single quotes, trailing commas where the file already has them.
- **Tests:** `node --test` from repo root must stay green after every task.
- **Commits:** conventional prefix (`feat:`/`test:`/`docs:`/`chore:`), body trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. **Commit locally only — DO NOT PUSH without Andrew's explicit approval.**

---

### Task 1: Telemetry core — sanitizeProps, truncate, filterDistricts

**Files:**
- Create: `telemetry.js` (repo root)
- Test: `test/telemetry.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2, 4, 5):
  - `filterDistricts(list: string[], query: string, limit = 8): string[]` — case-insensitive; prefix matches first, then substring matches; `[]` for empty/blank query.
  - `sanitizeProps(event: string, props: object|null): object|null` — `null` for unknown event names; otherwise an object containing only whitelisted keys, strings truncated to 120, arrays capped at 10 elements with each element truncated, numbers/booleans passed through.
  - Constants: `IDENTITY_KEY = 'gl:identity'`, `MAX_STR = 120`.

- [ ] **Step 1: Write the failing tests**

Create `test/telemetry.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/telemetry.test.js`
Expected: FAIL — `Cannot find module '../telemetry.js'`

- [ ] **Step 3: Write the implementation**

Create `telemetry.js` (repo root). Copy the AGPL header from `changelog.js` first, then:

```js
// GrowthLens usage telemetry — UMD: browser → window.GLTelemetry, Node → module.exports.
// Pure logic (whitelist, truncation, typeahead filter, batching client) lives here so
// node --test can exercise it with stubbed fetch/storage; app-shell.jsx owns the UI.
// Events carry ONLY page/feature names and the self-reported district identity —
// never student data, filenames, row counts, or computed results.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLTelemetry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const IDENTITY_KEY = 'gl:identity';
  const MAX_STR = 120;

  // Per-event props whitelist. An event not listed here cannot be sent at all;
  // a key not listed for its event is silently dropped. This table IS the
  // privacy contract — extend it only alongside the spec.
  const PROPS_ALLOWED = {
    session_start: [],
    identity_set: ['custom'],
    opt_out: [],
    opt_in: [],
    page_view: ['page'],
    upload_ok: ['subject'],
    upload_error: ['subject', 'code'],
    export: ['subjects'],
    interact: ['control', 'value'],
    keepalive: [],
  };

  function truncate(v, n = MAX_STR) {
    const s = String(v);
    return s.length > n ? s.slice(0, n) : s;
  }

  function sanitizeProps(event, props) {
    const allowed = PROPS_ALLOWED[event];
    if (!allowed) return null;
    const out = {};
    for (const k of allowed) {
      const v = props ? props[k] : undefined;
      if (v == null) continue;
      if (Array.isArray(v)) out[k] = v.slice(0, 10).map((x) => truncate(x));
      else if (typeof v === 'boolean' || typeof v === 'number') out[k] = v;
      else out[k] = truncate(v);
    }
    return out;
  }

  // Typeahead over the MO district list: prefix matches first (a user typing
  // "Meh" wants Mehlville at the top), then substring matches, capped.
  function filterDistricts(list, query, limit = 8) {
    const q = String(query || '').trim().toLowerCase();
    if (!q || !Array.isArray(list)) return [];
    const starts = [];
    const contains = [];
    for (const d of list) {
      const dl = String(d).toLowerCase();
      if (dl.startsWith(q)) starts.push(d);
      else if (dl.includes(q)) contains.push(d);
    }
    return starts.concat(contains).slice(0, limit);
  }

  return { IDENTITY_KEY, MAX_STR, truncate, sanitizeProps, filterDistricts };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/telemetry.test.js`
Expected: all PASS. Also run the full suite: `node --test` — everything green.

- [ ] **Step 5: Commit**

```bash
git add telemetry.js test/telemetry.test.js
git commit -m "feat(telemetry): core props whitelist, truncation, district typeahead filter"
```

---

### Task 2: Telemetry client — createClient (queue, flush, identity, opt-out)

**Files:**
- Modify: `telemetry.js` (add `createClient` to the factory's return)
- Test: `test/telemetry.test.js` (append)

**Interfaces:**
- Consumes: `sanitizeProps`, `truncate`, `IDENTITY_KEY` from Task 1.
- Produces (used by Tasks 3–5): `createClient(deps)` where `deps = { fetchFn, storage, uuid, url, key, version = null, flushAt = 20 }`. Returns:
  - `init()` — reads/mints identity (persists `deviceId` immediately), queues `session_start`.
  - `log(event, props)` — queue an event; auto-flush at `flushAt`; no-op when opted out (except forced opt events); never throws.
  - `flush({ keepalive = false } = {}): Promise<void>` — POST the queue as one PostgREST bulk insert; **one retry then drop**; silently drops when `url`/`key` are empty.
  - `setIdentity({ district, isCustom })` — persist + queue `identity_set` `{ custom }` + flush.
  - `setOptOut(flag: boolean)` — persist; queues `opt_out` (forced) or `opt_in`; flush.
  - `getIdentity(): { district, isCustom, deviceId, optOut, setAt, dismissedAt }` (copy).
  - `needsPrompt(): boolean` — `district == null && !dismissedAt`.
  - `dismissPrompt()` — stamps `dismissedAt`, persists.
- Row shape sent to Supabase (exact keys): `{ district_id, is_custom, device_id, session_id, event, props, app_version }` — `district_id` is `'(unset)'` when no district chosen. `created_at` is set by the server.

- [ ] **Step 1: Write the failing tests**

Append to `test/telemetry.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/telemetry.test.js`
Expected: FAIL — `T.createClient is not a function`

- [ ] **Step 3: Write the implementation**

Inside the factory in `telemetry.js`, after `filterDistricts`, add — and extend the return statement to include `createClient`:

```js
  // The batching client. All I/O comes in through deps so Node tests can stub
  // it: { fetchFn, storage, uuid, url, key, version, flushAt }. Nothing here
  // may throw into the caller — telemetry must never break the app.
  function createClient(deps) {
    const { fetchFn, storage, uuid, url, key, version = null, flushAt = 20 } = deps;
    let identity = null;
    let sessionId = null;
    let queue = [];

    function writeIdentity() {
      try { storage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* private mode */ }
    }
    function readIdentity() {
      let raw = null;
      try { raw = JSON.parse(storage.getItem(IDENTITY_KEY) || 'null'); } catch { raw = null; }
      if (!raw || typeof raw !== 'object') {
        raw = { district: null, isCustom: false, deviceId: null, optOut: false, setAt: null, dismissedAt: null };
      }
      identity = raw;
      if (!identity.deviceId) { identity.deviceId = uuid(); writeIdentity(); }
    }

    function enqueue(event, props, force) {
      if (!identity) readIdentity();
      if (identity.optOut && !force) return;
      const clean = sanitizeProps(event, props);
      if (clean == null) return;
      queue.push({
        district_id: identity.district == null ? '(unset)' : truncate(identity.district),
        is_custom: !!identity.isCustom,
        device_id: identity.deviceId,
        session_id: sessionId,
        event,
        props: clean,
        app_version: version,
      });
      if (queue.length >= flushAt) flush();
    }

    async function flush(opts) {
      if (!queue.length) return;
      const batch = queue;
      queue = [];
      if (!url || !key) return; // not configured yet — drop, never error
      const send = () => fetchFn(url + '/rest/v1/events', {
        method: 'POST',
        keepalive: !!(opts && opts.keepalive),
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      });
      try { const r = await send(); if (r && r.ok) return; } catch { /* retry below */ }
      try { await send(); } catch { /* drop — telemetry never surfaces errors */ }
    }

    return {
      init() {
        readIdentity();
        sessionId = uuid();
        enqueue('session_start', {});
      },
      log(event, props) { try { enqueue(event, props); } catch { /* never throw */ } },
      flush,
      setIdentity({ district, isCustom }) {
        if (!identity) readIdentity();
        identity.district = truncate(String(district));
        identity.isCustom = !!isCustom;
        identity.setAt = new Date().toISOString();
        writeIdentity();
        enqueue('identity_set', { custom: !!isCustom });
        flush();
      },
      setOptOut(flag) {
        if (!identity) readIdentity();
        identity.optOut = !!flag;
        writeIdentity();
        enqueue(flag ? 'opt_out' : 'opt_in', {}, true);
        flush();
      },
      getIdentity() {
        if (!identity) readIdentity();
        return { ...identity };
      },
      needsPrompt() {
        if (!identity) readIdentity();
        return identity.district == null && !identity.dismissedAt;
      },
      dismissPrompt() {
        if (!identity) readIdentity();
        identity.dismissedAt = new Date().toISOString();
        writeIdentity();
      },
    };
  }
```

Return statement becomes:

```js
  return { IDENTITY_KEY, MAX_STR, truncate, sanitizeProps, filterDistricts, createClient };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/telemetry.test.js` — all PASS. Then `node --test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add telemetry.js test/telemetry.test.js
git commit -m "feat(telemetry): batching client - queue/flush, identity, opt-out, retry-then-drop"
```

---

### Task 3: Browser bootstrap — start(), config, script tags, district list file

**Files:**
- Modify: `telemetry.js` (browser singleton + config constants)
- Create: `reference/mo-districts.js`
- Modify: `index.html:67` (script tags)
- Test: `test/telemetry.test.js` (append two tests)

**Interfaces:**
- Consumes: `createClient` from Task 2.
- Produces (used by Tasks 4–5 — this is the API app code calls):
  - `window.GLTelemetry.start()` — idempotent; creates the singleton with real deps, calls `init()`, installs a 30 s flush interval and a `visibilitychange → hidden` keepalive flush. Returns the client (or `null` outside a browser).
  - `window.GLTelemetry.log(event, props)` — safe before `start()` (no-op).
  - `window.GLTelemetry.flush()` — force a send; resolves immediately pre-start. Exists for verification/debugging (Task 9 calls it instead of simulating tab-hide).
  - `window.GLTelemetry.getIdentity() | needsPrompt() | setIdentity(...) | setOptOut(...) | dismissPrompt()` — delegate to the singleton; safe no-ops (or `null`/`false`) before `start()`.
  - `window.MO_DISTRICTS: string[]` — the typeahead list.
  - Test seams: `window.GL_TELEMETRY_URL` / `window.GL_TELEMETRY_KEY` override the constants when set **before** `start()` (used by the Playwright pass in Task 9).

- [ ] **Step 1: Write the failing tests**

Append to `test/telemetry.test.js`:

```js
// ---- browser bootstrap (Node-side safety) -----------------------------------

test('module: requiring without a window is safe; start() is a no-op returning null', () => {
  assert.equal(typeof T.start, 'function');
  assert.equal(T.start(), null);
});
test('module: pre-start delegates are safe no-ops', async () => {
  assert.doesNotThrow(() => T.log('page_view', { page: 'scan' }));
  assert.equal(T.getIdentity(), null);
  assert.equal(T.needsPrompt(), false);
  assert.doesNotThrow(() => T.dismissPrompt());
  await T.flush(); // resolves without a singleton
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/telemetry.test.js`
Expected: FAIL — `T.start is not a function`

- [ ] **Step 3: Implement the browser bootstrap**

In `telemetry.js`, after `createClient`, add (still inside the factory):

```js
  // ---- Browser bootstrap ----------------------------------------------------
  // Supabase project credentials. The anon key is public by design — RLS
  // allows it to INSERT into public.events and nothing else (see the spec).
  // Empty until the Supabase project exists; the client drops batches
  // silently while unconfigured, so the app behaves identically either way.
  const SUPABASE_URL = '';
  const SUPABASE_ANON_KEY = '';

  const FLUSH_MS = 30000;
  let singleton = null;

  function start() {
    if (typeof window === 'undefined' || !window.document) return null;
    if (singleton) return singleton;
    let storage;
    try { storage = window.localStorage; } catch { storage = null; }
    singleton = createClient({
      fetchFn: (u, o) => window.fetch(u, o),
      storage: storage || { getItem: () => null, setItem: () => {} },
      uuid: () => (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : 'no-uuid-' + String(Math.random()).slice(2)),
      url: window.GL_TELEMETRY_URL || SUPABASE_URL,
      key: window.GL_TELEMETRY_KEY || SUPABASE_ANON_KEY,
      version: window.GL_VERSION || null,
    });
    singleton.init();
    window.setInterval(() => singleton.flush(), FLUSH_MS);
    window.document.addEventListener('visibilitychange', () => {
      if (window.document.visibilityState === 'hidden') singleton.flush({ keepalive: true });
    });
    return singleton;
  }
```

And make the return statement delegate through the singleton:

```js
  return {
    IDENTITY_KEY, MAX_STR, truncate, sanitizeProps, filterDistricts, createClient,
    start,
    log: (event, props) => { if (singleton) singleton.log(event, props); },
    flush: () => (singleton ? singleton.flush() : Promise.resolve()),
    getIdentity: () => (singleton ? singleton.getIdentity() : null),
    needsPrompt: () => (singleton ? singleton.needsPrompt() : false),
    setIdentity: (v) => { if (singleton) singleton.setIdentity(v); },
    setOptOut: (v) => { if (singleton) singleton.setOptOut(v); },
    dismissPrompt: () => { if (singleton) singleton.dismissPrompt(); },
  };
```

- [ ] **Step 4: Create the district list placeholder**

Create `reference/mo-districts.js` (AGPL header from `changelog.js` on top):

```js
// Missouri public school districts for the identity typeahead.
// PLACEHOLDER: a dozen recognizable districts so the modal works end-to-end.
// Andrew supplies the full DESE list (~550 names); replace the array wholesale,
// one exact display name per entry — the modal offers free text for anything missing.
window.MO_DISTRICTS = [
  'Columbia 93',
  'Fort Zumwalt R-II',
  'Francis Howell R-III',
  'Hazelwood',
  'Kansas City 33',
  'Lee\'s Summit R-VII',
  'Mehlville R-IX',
  'North Kansas City 74',
  'Parkway C-2',
  'Rockwood R-VI',
  'Springfield R-XII',
  'St. Louis City',
];
```

- [ ] **Step 5: Add the script tags**

In `index.html`, directly after `<script src="changelog.js"></script>` (line 67), add:

```html
<script src="reference/mo-districts.js"></script>
<script src="telemetry.js"></script>
```

(Both must load before the Babel-compiled JSX; anywhere after `changelog.js` and before the `.jsx` scripts is correct. Note `reference/` carries a 7-day cache header on Netlify — acceptable for a list that changes ~yearly; a district missing from a stale list can still free-text.)

- [ ] **Step 6: Run tests + syntax checks**

Run: `node --test` — full suite green.
Run: `node --check telemetry.js` and `node --check reference/mo-districts.js` — no output (clean parse).

- [ ] **Step 7: Commit**

```bash
git add telemetry.js reference/mo-districts.js index.html test/telemetry.test.js
git commit -m "feat(telemetry): browser bootstrap, MO district list placeholder, script wiring"
```

---

### Task 4: District modal + sidebar chip (app-shell.jsx)

**Files:**
- Modify: `app-shell.jsx` — `AppBody` (~line 89), `LeftNav` secondary nav (~line 306), new `DistrictModal` component (place directly after `ChangelogModal`, ~line 570)

**Interfaces:**
- Consumes: `window.GLTelemetry` (Task 3 API), `window.MO_DISTRICTS`.
- Produces: `ctx.openDistrictModal()` and `ctx.identityDistrict` (string|null) for `LeftNav`; `DistrictModal({ onClose })` component. Task 5 relies on `T.start()` being called in an AppBody mount effect **declared before** the `page_view` effect it adds.

- [ ] **Step 1: Wire AppBody state + effects**

In `AppBody`, after the changelog state block (after line ~135), add:

```jsx
  // District identity + usage telemetry. start() is idempotent and must run
  // before the page_view effect below so the first landing view is captured.
  const [showDistrictModal, setShowDistrictModal] = React.useState(false);
  const [, setIdentityRev] = React.useState(0); // chip re-render after modal saves
  const openDistrictModal = React.useCallback(() => setShowDistrictModal(true), []);
  const closeDistrictModal = React.useCallback(() => {
    const T = window.GLTelemetry;
    // Closing the first-visit prompt without choosing counts as "later" —
    // remember the dismissal so the modal doesn't nag every visit.
    if (T && T.needsPrompt()) T.dismissPrompt();
    setShowDistrictModal(false);
    setIdentityRev((r) => r + 1);
  }, []);
  React.useEffect(() => {
    const T = window.GLTelemetry;
    if (!T) return;
    T.start();
    if (T.needsPrompt()) setShowDistrictModal(true);
  }, []);
  const identityDistrict =
    (window.GLTelemetry && window.GLTelemetry.getIdentity() || {}).district || null;
```

Add to the `ctx` object (line ~198): `openDistrictModal, identityDistrict,`

Render the modal next to the changelog modal (line ~239):

```jsx
      {showDistrictModal && <DistrictModal onClose={closeDistrictModal} />}
```

- [ ] **Step 2: Add the sidebar chip**

In `LeftNav`'s secondary-nav block (lines 306–310), after the Methods `NavItem`:

```jsx
        <button type="button" onClick={ctx.openDistrictModal}
          title="Your district — click to change"
          style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                   border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                   padding: '7px 10px', borderRadius: 6, color: SLU.mute,
                   fontFamily: LABEL, fontSize: 11.5, fontWeight: 700,
                   letterSpacing: 0.6, textTransform: 'uppercase' }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%',
                   background: ctx.identityDistrict ? SLU.gold : SLU.rule2, flex: 'none' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ctx.identityDistrict || 'Set your district'}
          </span>
        </button>
```

(Match `NavItem`'s hover treatment if it has one — read `NavItem` at line 339 and mirror its style so the chip looks native.)

- [ ] **Step 3: Build DistrictModal**

Directly after `ChangelogModal` (~line 570), following its overlay/dialog pattern:

```jsx
// First-visit district prompt; reopened any time from the sidebar chip.
// The input is the source of truth: Save commits whatever is in the box
// (list pick or free text), plus any change to the opt-out toggle.
function DistrictModal({ onClose }) {
  const T = window.GLTelemetry;
  const current = (T && T.getIdentity()) || {};
  const [query, setQuery] = React.useState(current.district || '');
  const [open, setOpen] = React.useState(false);   // dropdown visibility
  const [hover, setHover] = React.useState(-1);    // keyboard highlight
  const [optOut, setOptOutFlag] = React.useState(!!current.optOut);
  const list = window.MO_DISTRICTS || [];

  const matches = (T && open) ? T.filterDistricts(list, query) : [];
  const q = query.trim();
  const exact = q && list.some((d) => d.toLowerCase() === q.toLowerCase());
  const rows = matches.map((d) => ({ label: d, custom: false }));
  if (q && !exact) rows.push({ label: q, custom: true });

  const pick = (row) => { setQuery(row.label); setOpen(false); setHover(-1); };
  const save = () => {
    if (T) {
      const had = current.district || null;
      if (q && q !== had) {
        T.setIdentity({ district: q, isCustom: !list.some((d) => d.toLowerCase() === q.toLowerCase()) });
      }
      if (optOut !== !!current.optOut) T.setOptOut(optOut);
    }
    onClose();
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHover((h) => Math.min(h + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHover((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && hover >= 0 && rows[hover]) pick(rows[hover]); else save(); }
  };
  React.useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Tell us your district"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(26, 27, 31, 0.45)',
               display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
               padding: '10vh 16px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(480px, 100%)', background: '#fff', borderRadius: 12,
        boxShadow: '0 20px 60px rgba(26, 27, 31, 0.30)',
        border: `1px solid ${SLU.rule2}`, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '16px 20px', borderBottom: `1px solid ${SLU.rule2}` }}>
          <div>
            <div style={{ fontFamily: LABEL, fontSize: 10.5, fontWeight: 700, color: SLU.mute,
                          textTransform: 'uppercase', letterSpacing: 1.4 }}>Welcome</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: SLU.ink,
                          letterSpacing: -0.3, lineHeight: 1.1 }}>Which district are you with?</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Not now"
            style={{ flex: 'none', border: 'none', background: 'none', cursor: 'pointer',
                     color: SLU.mute, fontSize: 24, lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <input
              autoFocus
              value={query}
              placeholder="Start typing your district's name…"
              onChange={(e) => { setQuery(e.target.value); setOpen(true); setHover(-1); }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKey}
              role="combobox" aria-expanded={open && rows.length > 0} aria-autocomplete="list"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                       fontFamily: FONT, fontSize: 14.5, color: SLU.ink,
                       border: `1.5px solid ${SLU.rule2}`, borderRadius: 8, outline: 'none' }} />
            {open && rows.length > 0 && (
              <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                       marginTop: 4, background: '#fff', border: `1px solid ${SLU.rule2}`,
                       borderRadius: 8, boxShadow: '0 12px 32px rgba(26, 27, 31, 0.18)',
                       maxHeight: 260, overflowY: 'auto' }}>
                {rows.map((row, i) => (
                  <div key={row.custom ? '__custom' : row.label} role="option" aria-selected={i === hover}
                    onMouseDown={(e) => { e.preventDefault(); pick(row); }}
                    onMouseEnter={() => setHover(i)}
                    style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 14,
                             color: row.custom ? SLU.blue : SLU.ink,
                             fontWeight: row.custom ? 600 : 500,
                             background: i === hover ? 'rgba(0, 61, 165, 0.07)' : 'none',
                             borderTop: row.custom && rows.length > 1 ? `1px solid ${SLU.rule2}` : 'none' }}>
                    {row.custom ? `Use “${row.label}”` : row.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: SLU.ink2 }}>
            GrowthLens records which pages and features you use — never your data or your
            results. If you turn logging off, we record only that you turned it off.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                          color: SLU.ink2, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={optOut}
              onChange={(e) => setOptOutFlag(e.target.checked)} />
            Don’t log my usage
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{ border: 'none', background: 'none', cursor: 'pointer',
                       fontFamily: FONT, fontSize: 13.5, color: SLU.mute, padding: '9px 6px' }}>
              Not now
            </button>
            <button type="button" onClick={save}
              style={{ border: 'none', borderRadius: 8, cursor: 'pointer',
                       fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: '#fff',
                       background: SLU.blue, padding: '9px 18px' }}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

(Check the exact names of the shared style constants at the top of `app-shell.jsx` — `SLU`, `FONT`, `LABEL`, `SERIF` — and use whatever the file actually defines; `ChangelogModal` is the reference.)

- [ ] **Step 4: Verify in the browser**

Serve and check by hand (full Playwright pass comes in Task 9):

```bash
python -m http.server 8000
```

Open `http://localhost:8000` in a fresh profile/incognito: the modal appears on load; typing filters the list; free text offers the `Use "…"` row; Save closes and the sidebar chip shows the name; reload → no modal (identity persisted); clicking the chip reopens it prefilled; clearing localStorage and reloading → modal again; × / "Not now" dismisses and doesn't reappear on reload; chip reads "Set your district".

- [ ] **Step 5: Run the test suite**

Run: `node --test` — green (no Node-side changes, guard regression).

- [ ] **Step 6: Commit**

```bash
git add app-shell.jsx
git commit -m "feat(identity): first-visit district modal, sidebar chip, opt-out toggle"
```

---

### Task 5: Instrumentation — page views, uploads, export, interactions

**Files:**
- Modify: `app-shell.jsx` — `AppBody` (page_view effect + tracked setters, ~lines 103–205), `OverviewPage.onFile` (~lines 599–646)
- Modify: `export.jsx` — `buildPPTX` (~line 333)
- Modify: `heatmap-variants.jsx` — `ColumnHeader` (~line 136)
- Modify: `achievement.jsx` — no direct edit needed (grade filter flows through `ctx.setAchGrade`, wrapped below); confirm both call sites (lines 220, 348) use `ctx.setAchGrade`.

**Interfaces:**
- Consumes: `window.GLTelemetry.log(event, props)` (Task 3); the `start()` effect from Task 4 (must already be declared above where the page_view effect goes).
- Produces: the complete event stream defined in the spec. `interact` control names (fixed vocabulary): `'units'`, `'grade_filter'`, `'heatmap_sort'`.

- [ ] **Step 1: page_view effect**

In `AppBody`, immediately **after** the telemetry-start effect added in Task 4 (order matters — React runs same-render effects in declaration order):

```jsx
  React.useEffect(() => {
    if (window.GLTelemetry) window.GLTelemetry.log('page_view', { page });
  }, [page]);
```

- [ ] **Step 2: tracked setters for units + grade filter**

In `AppBody`, after the `setUnit` state declaration (~line 104), add:

```jsx
  // interact-instrumented setters: every consumer goes through ctx, so wrapping
  // here catches the Controls card, the statewide page's own toggle, and any
  // future call site without touching each one.
  const setUnitTracked = React.useCallback((v) => {
    if (window.GLTelemetry) window.GLTelemetry.log('interact', { control: 'units', value: v });
    setUnit(v);
  }, []);
  const setAchGradeTracked = React.useCallback((v) => {
    if (window.GLTelemetry) window.GLTelemetry.log('interact', { control: 'grade_filter', value: String(v) });
    setAchGrade(v);
  }, []);
```

In the `ctx` object (~line 200), swap the entries: `unit, setUnit: setUnitTracked,` and `achGrade, setAchGrade: setAchGradeTracked,`. Grep for any direct `setUnit(`/`setAchGrade(` calls **outside** ctx (the snap-back effects use `setSubjectState`/`setDemo`, not these) — internal programmatic calls, if any turn up, should keep the raw setters so only user actions log.

- [ ] **Step 3: upload instrumentation**

In `OverviewPage.onFile` (~lines 599–646), add one line at each outcome:

- Line ~608 (file too large), before/after the `setErrors` call:
  `if (window.GLTelemetry) window.GLTelemetry.log('upload_error', { subject: key, code: 'too_large' });`
- Line ~614 (engine failed to load):
  `if (window.GLTelemetry) window.GLTelemetry.log('upload_error', { subject: key, code: 'engine_unavailable' });`
- Line ~620 (ingest rejected), inside the `if (!res.ok)` branch:
  `if (window.GLTelemetry) window.GLTelemetry.log('upload_error', { subject: key, code: res.error || 'unknown' });`
- Line ~638 (success), next to `setStages(... 'ready')`:
  `if (window.GLTelemetry) window.GLTelemetry.log('upload_ok', { subject: key });`
- Line ~642 (unexpected exception):
  `if (window.GLTelemetry) window.GLTelemetry.log('upload_error', { subject: key, code: 'exception' });`

- [ ] **Step 4: export instrumentation**

In `export.jsx`, first line of `buildPPTX` (~line 333):

```js
  if (window.GLTelemetry) window.GLTelemetry.log('export', {
    subjects: ['math', 'ela'].filter((s) => window.GLStore && window.GLStore.available(s)),
  });
```

- [ ] **Step 5: heatmap sort instrumentation**

In `heatmap-variants.jsx` `ColumnHeader` (~line 136), the click handler currently computes `setSort(sort === descKey ? ascKey : descKey)`. Rewrite that expression as:

```js
    const next = sort === descKey ? ascKey : descKey;
    if (window.GLTelemetry) window.GLTelemetry.log('interact', { control: 'heatmap_sort', value: next });
    setSort(next);
```

(Read the actual handler first — variable names may differ slightly; keep its logic identical and only add the log line.)

- [ ] **Step 6: Verify in the browser**

With `python -m http.server 8000` and DevTools console:
`window.GLTelemetry.start()` exists; navigate pages, toggle units, sort the heatmap, upload the demo file path is optional — instead run with a paused network: since Supabase creds are empty, verify via an injected seam:

```js
// paste in DevTools BEFORE reloading:
localStorage.clear();
window.GL_TELEMETRY_URL = 'https://telemetry-test.invalid';
```

then reload with the Network tab open: navigating and interacting produces a failed POST to `telemetry-test.invalid/rest/v1/events` about every 30 s / 20 events — inspect the request payload and confirm rows carry only whitelisted props. (Failed sends are correct behavior here: retry once, drop, no console errors surfaced to the user, app unaffected.)

- [ ] **Step 7: Run the test suite**

Run: `node --test` — green.

- [ ] **Step 8: Commit**

```bash
git add app-shell.jsx export.jsx heatmap-variants.jsx
git commit -m "feat(telemetry): instrument page views, uploads, exports, key interactions"
```

---

### Task 6: Docs, disclosure surfaces, changelog v0.73

**Files:**
- Modify: `README.md` (line ~92 promise line; File map section ~line 105)
- Modify: `app-shell.jsx` — FAQ items in `OverviewPage` (~line 860–877)
- Modify: `methods.html` — §9 Privacy (lines 201–203)
- Modify: `changelog.js` (new top entry)

- [ ] **Step 1: README**

Line ~92 currently ends: `…verifiable in DevTools (only same-origin requests during analysis).` Replace that parenthetical so the sentence reads:

> …with the "nothing leaves the browser" promise verifiable in DevTools — analysis itself makes only same-origin requests; the one outbound call is a small usage ping (page and feature names plus the district name you enter, never data or results), and it can be switched off from the district chip in the sidebar.

In the File map section, add two lines in the appropriate spots:

```
telemetry.js            usage logging: props whitelist, batching client (node-tested),
                        browser bootstrap; sends page/feature names only — never data
reference/mo-districts.js  MO district list for the identity typeahead
```

- [ ] **Step 2: FAQ entry**

In `OverviewPage`'s FAQ items array (before the closing `]} />` at ~line 877), add:

```jsx
            {
              q: 'What does GrowthLens record about how I use it?',
              a: <>Which pages and features are used, plus the district name you enter when prompted — never your data, your files, or your results. This helps PRiME see which parts of the tool are earning their keep. You can turn it off any time by clicking your district name at the bottom of the sidebar; if you do, we record only that you turned it off.</>,
            },
```

- [ ] **Step 3: methods.html §9**

Line 202 ends with `Close the tab and the data is gone; GrowthLens stores nothing between sessions.` — replace that final clause with:

> Close the tab and your data is gone; GrowthLens keeps only small preferences in your browser (your unit choice, your district name) — never your files or results.

After line 202's paragraph, insert a new paragraph:

```html
  <p>Separately from your data, GrowthLens sends a small usage ping — which pages and features are used, plus the district name you enter when prompted — so the PRiME Center can see which parts of the tool help. It never includes student records, uploaded files, or computed results. You can turn it off from your district name in the sidebar; if you do, we record only that you turned it off.</p>
```

- [ ] **Step 4: changelog entry**

New top entry in `changelog.js`:

```js
  {
    version: '0.73',
    date: '2026-07-20',
    stage: 'preview',
    title: 'Tell us your district — and see how GrowthLens is used',
    items: [
      'A one-time prompt asks which district you’re with — pick from the list or type anything. Your answer lives in your browser and shows at the bottom of the sidebar; click it any time to change it.',
      'GrowthLens now records which pages and features are used (never your data, files, or results) so PRiME can improve the parts that matter. Turn it off any time from your district name in the sidebar.',
    ],
  },
```

- [ ] **Step 5: Verify + commit**

Run: `node --test` (green); load the app and confirm the FAQ renders, the changelog banner announces v0.73, and `methods.html` §9 reads correctly.

```bash
git add README.md app-shell.jsx methods.html changelog.js
git commit -m "docs: disclose usage logging in README, FAQ, methods note; changelog v0.73"
```

---

### Task 7: Supabase project setup ⛔ REQUIRES ANDREW

**Files:**
- Modify: `telemetry.js` (fill `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants)

**Interfaces:**
- Consumes: nothing from code.
- Produces: a live `events` endpoint; the filled constants turn the client from silent-drop to live. Task 8 needs the same URL + anon key as repo secrets.

**Andrew's console steps** (Claude cannot do these — they need the Supabase account):

- [ ] **Step 1: Create the project** at supabase.com — org: personal, name `growthlens`, region: a US region, free tier. Note the **Project URL** and the **anon public key** (Settings → API).

- [ ] **Step 2: Run the schema** in SQL Editor:

```sql
create table public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  district_id text not null check (char_length(district_id) between 1 and 120),
  is_custom boolean not null default false,
  device_id uuid,
  session_id uuid,
  event text not null check (char_length(event) <= 40),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 2048),
  app_version text check (char_length(app_version) <= 20)
);

alter table public.events enable row level security;

-- The public anon key may ONLY insert. No select/update/delete policies exist
-- for anon, so RLS denies them regardless of default grants.
create policy events_insert_anon on public.events
  for insert to anon with check (true);

-- The admin dashboard (next project) reads as an authenticated user.
create policy events_select_admin on public.events
  for select to authenticated using (true);

create index events_created_at_idx on public.events (created_at);
```

- [ ] **Step 3: Lock down auth** — Authentication → Sign In / Up: **disable new user signups**; enable Email provider (OTP); Authentication → Users → invite `andrewmcamp@gmail.com`. (With signups closed, OTP login is an allowlist of invited emails.)

- [ ] **Step 4: Paste credentials** into `telemetry.js` — set `SUPABASE_URL = 'https://<project-ref>.supabase.co'` and `SUPABASE_ANON_KEY = '<anon key>'`.

- [ ] **Step 5: Verify from the shell** (replace placeholders):

```bash
# Insert as anon — expect HTTP 201:
curl -si -X POST "https://<ref>.supabase.co/rest/v1/events" \
  -H "apikey: <anon>" -H "Authorization: Bearer <anon>" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '[{"district_id":"(system)","event":"keepalive","props":{}}]'

# Read as anon — expect HTTP 200 with an EMPTY body [] (RLS blocks reads):
curl -s "https://<ref>.supabase.co/rest/v1/events?select=*" \
  -H "apikey: <anon>" -H "Authorization: Bearer <anon>"
```

Then load the app locally, click around, and confirm rows in Table Editor → `events` — and that a browser reload shows POSTs returning 201 in the Network tab.

- [ ] **Step 6: Commit**

```bash
git add telemetry.js
git commit -m "feat(telemetry): point client at the live Supabase project"
```

---

### Task 8: Keep-alive GitHub Actions cron

**Files:**
- Create: `.github/workflows/keepalive.yml`

**Interfaces:**
- Consumes: repo secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Task 7 credentials).
- Produces: a `keepalive` event row every 5 days keeping the free project unpaused.

- [ ] **Step 1: Write the workflow**

```yaml
# Supabase pauses free projects after ~7 days without API activity, and school
# tools go quiet over breaks. This inserts one "(system)" keepalive event every
# 5 days (worst month-boundary gap ~6 days) through the same REST path the app
# uses — keeping the project awake AND verifying the insert pipeline.
# The dashboard filters district_id = '(system)' out of all reporting.
name: supabase-keepalive
on:
  schedule:
    - cron: '0 12 */5 * *'
  workflow_dispatch: {}
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Insert keepalive event
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: |
          curl -sS --fail-with-body -X POST "$SUPABASE_URL/rest/v1/events" \
            -H "apikey: $SUPABASE_ANON_KEY" \
            -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=minimal" \
            -d '[{"district_id":"(system)","event":"keepalive","props":{}}]'
```

- [ ] **Step 2: Set the repo secrets** (after Task 7 provides values):

```bash
gh secret set SUPABASE_URL --body "https://<ref>.supabase.co"
gh secret set SUPABASE_ANON_KEY --body "<anon key>"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/keepalive.yml
git commit -m "chore(ci): 5-day Supabase keepalive cron via the public insert path"
```

- [ ] **Step 4: Verify — DEFERRED until the branch is pushed with Andrew's approval**

Scheduled workflows only exist on GitHub once pushed. After the approved push:

```bash
gh workflow run supabase-keepalive
gh run watch
```

Expected: green run; a new `keepalive` row in Supabase Table Editor.

---

### Task 9: Full verification pass

**Files:**
- Create (scratchpad only, not committed): a Playwright script per the browser-verify recipe.

- [ ] **Step 1: Full Node suite**

Run: `node --test`
Expected: every test green, including all telemetry tests.

- [ ] **Step 2: Playwright browser pass**

Per the repo recipe (serve with `python -m http.server 8000`, drive `msedge` via Playwright; segmented controls are `role=radio`). Script outline — before `page.goto`, install the seam and a route:

```js
await context.route('https://telemetry-test.invalid/**', (route) =>
  route.fulfill({ status: 201, body: '' }));
await page.addInitScript(() => {
  window.GL_TELEMETRY_URL = 'https://telemetry-test.invalid';
  window.GL_TELEMETRY_KEY = 'test-key';
});
```

Then assert, capturing routed request bodies:

1. Fresh context → modal visible on load; screenshot.
2. Type `meh` → listbox shows `Mehlville R-IX` first; Enter picks it; Save → chip shows the name.
3. Captured POST rows include `session_start`, `identity_set` (props `{custom:false}`), `page_view` `{page:'landing'}`; every row's keys are exactly the seven expected; `district_id` updates after identity_set.
4. Navigate to two pages, toggle units → `page_view` ×2 and `interact` `{control:'units'}` captured. Force sends with `await page.evaluate(() => window.GLTelemetry.flush())` after each step — no need to wait 30 s or simulate tab-hiding.
5. Reopen modal via chip, check "Don't log my usage", Save → an `opt_out` row arrives; further navigation produces no new rows.
6. New context, dismiss modal with × → no `identity_set`; rows show `district_id:'(unset)'`; reload → modal does not reappear.
7. No console errors anywhere in the run.

- [ ] **Step 3: Fix anything found, re-run both, commit fixes**

```bash
git add -A
git commit -m "fix(telemetry): browser-verification follow-ups"
```

(Skip the commit if nothing changed.)

- [ ] **Step 4: Report** — summarize event coverage, verification evidence, and the two outstanding user-gated items (Task 7 console steps if not yet done; Task 8 Step 4 after approved push).

---

## Execution notes

- Task order 1→6 has no external dependencies and can proceed immediately; Task 7 blocks on Andrew's Supabase account; Task 8 Steps 2/4 depend on Task 7; Task 9 runs regardless (the test seam works without live credentials).
- **No pushing at any point without Andrew's explicit approval** — all commits stay local.
- The full MO district list replaces `reference/mo-districts.js`'s array wholesale when Andrew supplies it; no other file changes needed.
