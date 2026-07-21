# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin.html` on the existing site — polished email-OTP login, telemetry summary, resource workbench editor with an honest unpublished-changes badge and a Publish button firing the `publish-resources` workflow through a Supabase Edge Function.

**Architecture:** Standalone page reusing the app's no-build React 18 + Babel CDN stack plus supabase-js v2 UMD (this page only). Pure logic (aggregation, validation, CSV writing, publish-diff) lives in UMD `engine/` modules tested with `node --test`. UI flows verified with Playwright by intercepting the real Supabase URL — no test seams needed. The GitHub PAT lives only in an Edge Function secret.

**Tech Stack:** React 18.3.1 + Babel Standalone (pinned CDN + SRI, same tags as index.html), @supabase/supabase-js v2 UMD (pinned + SRI), Supabase Edge Function (Deno), node:test, Playwright/msedge.

**Spec:** `docs/superpowers/specs/2026-07-21-admin-panel-design.md`

## Global Constraints

- **No build step**; new browser files are plain scripts in `admin.html` only — `index.html` is untouched by this plan.
- **AGPL header** (copy from `changelog.js`) on every new `.js`/`.jsx` file.
- **UMD pattern** from `engine/units.js` for `engine/csv.js` and `engine/admin-data.js`.
- **Admin is standalone**: its own SLU/font constants; it may load only `engine/csv.js` + `engine/resources.js` from the app.
- **No telemetry from the admin page** (do not load telemetry.js).
- Supabase project: URL `https://slhlkltahmybgkjzuech.supabase.co`, publishable key `sb_publishable_CqONVSh4-PvqZvLgs-_dHw_oGKWTMqf` (public by design; RLS is the wall).
- `(system)` rows are excluded from every reported number; `(unset)` is excluded from the *districts* count but shown as its own rollup row.
- **Tests**: `node --test` green after every task.
- **Commits:** conventional prefixes, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. **Local only — NO PUSH without Andrew's explicit approval.**

---

### Task 1: Extract writeCsv into engine/csv.js

**Files:**
- Create: `engine/csv.js`
- Modify: `tools/publish-resources.js` (require the new module; delete its local `writeCsv`)
- Test: `test/csv.test.js` (new); `test/publish-resources.test.js` must keep passing unchanged.

**Interfaces:**
- Produces: UMD `GLCsv` / `module.exports` = `{ writeCsv(header: string[], rows: object[]): string }` — every field quoted, `"`→`""`, LF endings, trailing newline. Tasks 2 and 5 consume it; `tools/publish-resources.js` re-exports it unchanged (`writeCsv` stays on its module.exports so existing tests pass).

- [ ] **Step 1: Write the failing test** — `test/csv.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine/csv.js');
const R = require('../engine/resources.js');

test('GLCsv.writeCsv: parseCsv inverts it (commas, quotes, newlines)', () => {
  const rows = [{ a: 'x,y', b: 'he said ""hi""'.replace(/""/g, '"') , c: 'two\nlines' }];
  assert.deepEqual(R.parseCsv(C.writeCsv(['a', 'b', 'c'], rows)), rows);
});
test('GLCsv.writeCsv: exact dialect — all quoted, LF, trailing newline', () => {
  assert.equal(C.writeCsv(['x'], [{ x: '1' }]), '"x"\n"1"\n');
});
test('tools/publish-resources re-exports the same writeCsv', () => {
  const P = require('../tools/publish-resources.js');
  assert.equal(P.writeCsv, C.writeCsv);
});
```

- [ ] **Step 2:** Run `node --test test/csv.test.js` — FAIL (`Cannot find module '../engine/csv.js'`).
- [ ] **Step 3: Implement.** `engine/csv.js` (AGPL header, then):

```js
// GrowthLens CSV writer — the exact all-quoted dialect engine/resources.js
// parseCsv reads and git stores (LF, trailing newline). Shared by
// tools/publish-resources.js (Node) and admin.jsx (browser diff badge).
// UMD: browser → window.GLCsv, Node → module.exports.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLCsv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function writeCsv(header, rows) {
    const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const line = (vals) => vals.map(cell).join(',');
    return [line(header)]
      .concat(rows.map((r) => line(header.map((h) => r[h]))))
      .join('\n') + '\n';
  }
  return { writeCsv };
});
```

In `tools/publish-resources.js`: delete the local `writeCsv` function, add `const { writeCsv } = require('../engine/csv.js');` below `'use strict';`, keep `module.exports = { RESOURCE_COLUMNS, CROSSWALK_COLUMNS, writeCsv, fetchTable };` unchanged.

- [ ] **Step 4:** `node --test` — everything green (csv, publish fidelity, all 178+).
- [ ] **Step 5:** Commit: `refactor(csv): extract shared writeCsv into engine/csv.js`

---

### Task 2: engine/admin-data.js — summarize, validators, diffPublished

**Files:**
- Create: `engine/admin-data.js`
- Test: `test/admin-data.test.js`

**Interfaces:**
- Consumes: `GLCsv.writeCsv` (Task 1).
- Produces: UMD `GLAdminData` = 
  - `summarize(events: Array<{district_id,device_id,session_id,event,props,created_at}>): {districts:number, devices:number, sessions:number, events:number, weekly:Array<{week:string,count:number}>, topPages:Array<{page:string,count:number}>, uploadErrors:Array<{code:string,count:number}>, perDistrict:Array<{district:string, firstSeen:string, lastSeen:string, sessions:number, devices:number, events:number}>}` — `(system)` rows dropped entirely; `(unset)` excluded from `districts` count but present in `perDistrict` (sorted lastSeen desc); `weekly` is ISO-Monday buckets `YYYY-MM-DD` ascending; topPages/uploadErrors sorted count desc.
  - `validateResource(r: object, otherIds: string[]): string[]` (empty = valid). Rules: `resource_id` required, ≤10 chars, not in `otherIds`; `title` required; `url` required and must start `http://`/`https://`.
  - `validateCrosswalk(row: object, resourceIds: string[]): string[]`. Rules: `finding_type`, `subgroup`, `subject`, `grade_band`, `match_strength` required; `resource_id` must be in `resourceIds`.
  - `diffPublished(columns: string[], dbRows: object[], fileText: string): boolean` — true when **unpublished changes exist** (writeCsv(columns, dbRows) !== fileText with CRLF→LF).

- [ ] **Step 1: Write the failing tests** — `test/admin-data.test.js`:

```js
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
```

- [ ] **Step 2:** `node --test test/admin-data.test.js` — FAIL (module missing).
- [ ] **Step 3: Implement** `engine/admin-data.js` (AGPL header; UMD wrapper as in engine/units.js; Node branch needs `const GLCsv = typeof require !== 'undefined' ? require('./csv.js') : root.GLCsv` — put the require inside the UMD bootstrap and pass it into the factory):

```js
(function (root, factory) {
  const csv = (typeof module !== 'undefined' && module.exports)
    ? require('./csv.js') : root.GLCsv;
  const api = factory(csv);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GLAdminData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GLCsv) {
  'use strict';

  // Monday of the ISO week containing the timestamp, as YYYY-MM-DD (UTC).
  function isoWeekStart(iso) {
    const d = new Date(iso);
    const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  const countMap = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const sortedCounts = (m, key) => [...m.entries()]
    .map(([k, count]) => ({ [key]: k, count }))
    .sort((a, b) => b.count - a.count || String(a[key]).localeCompare(String(b[key])));

  function summarize(events) {
    const rows = (events || []).filter((e) => e.district_id !== '(system)');
    const devices = new Set(), sessions = new Set(), districts = new Set();
    const weekly = new Map(), pages = new Map(), errors = new Map();
    const byDistrict = new Map();
    for (const e of rows) {
      if (e.device_id) devices.add(e.device_id);
      if (e.session_id) sessions.add(e.session_id);
      if (e.district_id && e.district_id !== '(unset)') districts.add(e.district_id);
      countMap(weekly, isoWeekStart(e.created_at));
      if (e.event === 'page_view' && e.props && e.props.page) countMap(pages, e.props.page);
      if (e.event === 'upload_error' && e.props && e.props.code) countMap(errors, e.props.code);
      const d = byDistrict.get(e.district_id) ||
        { district: e.district_id, firstSeen: e.created_at, lastSeen: e.created_at,
          sessions: new Set(), devices: new Set(), events: 0 };
      d.firstSeen = e.created_at < d.firstSeen ? e.created_at : d.firstSeen;
      d.lastSeen = e.created_at > d.lastSeen ? e.created_at : d.lastSeen;
      if (e.session_id) d.sessions.add(e.session_id);
      if (e.device_id) d.devices.add(e.device_id);
      d.events++;
      byDistrict.set(e.district_id, d);
    }
    return {
      districts: districts.size, devices: devices.size,
      sessions: sessions.size, events: rows.length,
      weekly: [...weekly.entries()].map(([week, count]) => ({ week, count }))
        .sort((a, b) => a.week.localeCompare(b.week)),
      topPages: sortedCounts(pages, 'page'),
      uploadErrors: sortedCounts(errors, 'code'),
      perDistrict: [...byDistrict.values()].map((d) => ({
        district: d.district, firstSeen: d.firstSeen, lastSeen: d.lastSeen,
        sessions: d.sessions.size, devices: d.devices.size, events: d.events,
      })).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
    };
  }

  function validateResource(r, otherIds) {
    const errs = [];
    const id = String(r.resource_id || '').trim();
    if (!id) errs.push('resource_id is required');
    else if (id.length > 10) errs.push('resource_id must be 10 characters or fewer');
    else if ((otherIds || []).includes(id)) errs.push(`resource_id ${id} already exists`);
    if (!String(r.title || '').trim()) errs.push('title is required');
    const url = String(r.url || '').trim();
    if (!/^https?:\/\//.test(url)) errs.push('url must start with http:// or https://');
    return errs;
  }

  function validateCrosswalk(row, resourceIds) {
    const errs = [];
    for (const f of ['finding_type', 'subgroup', 'subject', 'grade_band', 'match_strength']) {
      if (!String(row[f] || '').trim()) errs.push(`${f} is required`);
    }
    if (!(resourceIds || []).includes(row.resource_id)) {
      errs.push(`resource_id ${row.resource_id || '(empty)'} does not match an existing resource`);
    }
    return errs;
  }

  function diffPublished(columns, dbRows, fileText) {
    return GLCsv.writeCsv(columns, dbRows) !== String(fileText || '').replace(/\r\n/g, '\n');
  }

  return { summarize, validateResource, validateCrosswalk, diffPublished, isoWeekStart };
});
```

- [ ] **Step 4:** `node --test` — green.
- [ ] **Step 5:** Commit: `feat(admin): pure summary/validation/diff helpers (engine/admin-data.js)`

---

### Task 3: admin.html + login flow + shell

**Files:**
- Create: `admin.html`, `admin.jsx`

**Interfaces:**
- Consumes: supabase-js UMD (`window.supabase.createClient`), `GLCsv`, `GLResources` (loaded but used in Tasks 4–5).
- Produces: `admin.html` loads scripts in order: fonts/styles → React/ReactDOM/Babel (same pinned tags + SRI as index.html) → supabase-js UMD (pinned + SRI, computed in Step 1) → `engine/csv.js` → `engine/resources.js` → `admin.jsx` (text/babel) → boot script rendering `<AdminApp />` into `#root`. `admin.jsx` defines: `sb` (supabase client), `ADMIN` (SLU color/font constants), `AdminApp` (session gate), `LoginCard`, `CodeBoxes`, `Shell` with tabs `summary | resources | crosswalk` (views stubbed as placeholders for Tasks 4–5). Tab state signature: `Shell` renders `<SummaryView />`, `<EditorTab table="resources" />`, `<EditorTab table="resource_crosswalk" />`.

- [ ] **Step 1: Pin supabase-js + compute SRI.** Download `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js`, compute `openssl dgst -sha384 -binary | openssl base64 -A`, use in the script tag. (Any current 2.x works; pin whatever resolves and record it.)
- [ ] **Step 2: Write `admin.html`** — same head pattern as index.html (fonts link, minimal reset), `#root` with a small "Loading" placeholder, scripts per the Produces block, boot `<script type="text/babel">ReactDOM.createRoot(document.getElementById('root')).render(<window.AdminApp/…/>)</script>` with the same try/catch fallback message pattern index.html uses.
- [ ] **Step 3: Write `admin.jsx`** — config + client:

```jsx
const SUPABASE_URL = 'https://slhlkltahmybgkjzuech.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CqONVSh4-PvqZvLgs-_dHw_oGKWTMqf';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const ADMIN = { blue: '#003DA5', gold: '#9A7611', goldLight: '#C8A84A', bg: '#F7F7F8',
  ink: '#1A1B1F', ink2: '#3F4147', mute: '#6F727A', rule: '#D9D9DD', rule2: '#EDEDEF' };
const FONT = '"Mulish", ui-sans-serif, system-ui, sans-serif';
const SERIF = '"Crimson Pro", ui-serif, Georgia, serif';
const LABEL = '"Archivo Narrow", "Mulish", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';
```

`AdminApp`: session `undefined | null | Session` via `getSession()` + `onAuthStateChange`; renders loading / `LoginCard` / `Shell`.

`LoginCard` state machine: `stage: 'email' | 'code'`, `email` (init from `localStorage['gl:admin-email']`), `code`, `err`, `busy`, `cooldown` (60 → 0 interval). Send: `sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`; on error containing `Signups not allowed` show "That email isn't invited to the admin panel." else the error message; on success persist email, `stage='code'`, `cooldown=60`. Verify (auto when 6 digits, or Enter): `sb.auth.verifyOtp({ email, token: code, type: 'email' })`; wrong/expired → "That code didn't work — it may have expired. Try again or resend." Resend button disabled while `cooldown > 0`, label `Resend code (Ns)`.

`CodeBoxes({ value, onChange, onComplete })`: six `<input inputMode="numeric" maxLength={1}>`; typing a digit advances focus; Backspace on an empty box focuses the previous; paste distributes `\d` chars from position 0 and focuses the last filled box; every change calls `onChange(joined)`; when joined length hits 6 call `onComplete(joined)`. Boxes 42px, mono font, blue focus ring (reuse `.gl-focus`-style outline inline).

`Shell({ session })`: header — serif "GrowthLens" + LABEL "ADMIN" chip, right side `session.user.email` + Sign out (`sb.auth.signOut()`); tab bar (Summary / Resources / Matching rules) as buttons with active underline; body renders the active view (placeholder `<div>Coming in Task N</div>` until Tasks 4–5 replace them).

- [ ] **Step 4: Playwright smoke** (scratchpad script, msedge; route `https://slhlkltahmybgkjzuech.supabase.co/**`):
  - `/auth/v1/otp` POST → `{}` 200. `/auth/v1/verify` POST → canned session `{ access_token: '<header.payload.sig with far-future exp, base64url JSON>', token_type: 'bearer', expires_in: 3600, expires_at: <future epoch>, refresh_token: 'fake', user: { id: 'u1', email: 'andrewmcamp@gmail.com', aud: 'authenticated' } }`. `/auth/v1/user` GET → the same user.
  - Assert: login card renders; entering an email and submitting shows the code stage; typing 6 digits auto-verifies and the Shell header shows the email; Sign out returns to login; wrong-code path (route returns 403 `{ error_description: 'Token has expired or is invalid' }`) shows the friendly error; no console errors.
- [ ] **Step 5:** `node --test` green (regression). Commit: `feat(admin): admin.html shell + polished OTP login flow`

---

### Task 4: Telemetry summary view

**Files:**
- Modify: `admin.jsx` (replace the summary placeholder)

**Interfaces:**
- Consumes: `GLAdminData.summarize` (Task 2); `sb.from('events')`.
- Produces: `SummaryView` with window picker `'30' | '90' | 'all'`; `fetchAllEvents(sinceIso | null): Promise<rows>` paging loop.

- [ ] **Step 1: Implement fetch + view.** Paging loop (PostgREST caps at 1000):

```jsx
async function fetchAllEvents(sinceIso) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from('events')
      .select('district_id,device_id,session_id,event,props,created_at')
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (sinceIso) q = q.gte('created_at', sinceIso);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
```

`SummaryView`: state `win` ('30' default), `summary`, `err`, `busy`. Effect on `win`: compute `sinceIso = win === 'all' ? null : new Date(Date.now() - win*864e5).toISOString()`, fetch, `setSummary(GLAdminData.summarize(rows))`. Render: window segmented control; 4 stat cards (label LABEL-caps, value 28px mono); `Spark({ weekly })` — inline SVG, bars `fill=ADMIN.blue`, width 12/gap 4, height scaled to max, week labels on first/last; three tables (Top pages, Upload errors, Districts — columns District / First seen / Last seen / Sessions / Devices / Events, dates shown `YYYY-MM-DD`); empty state "No events in this window."; error state with retry button.

- [ ] **Step 2: Playwright:** route REST GET `/rest/v1/events*` → canned 25 rows spanning two districts + `(system)` + `(unset)` and two weeks; assert the four stat values, that `(system)` never appears in the DOM, both district rows render, and switching the window refires the route (second canned payload → numbers change). No console errors.
- [ ] **Step 3:** `node --test` green. Commit: `feat(admin): telemetry summary view (windowed, paged, aggregated client-side)`

---

### Task 5: Resource editor, unpublished badge, publish button

**Files:**
- Modify: `admin.jsx` (replace both editor placeholders; add PublishBar)

**Interfaces:**
- Consumes: `GLAdminData.validateResource/validateCrosswalk/diffPublished`, `GLCsv`, `GLResources.parseCsv`; `RESOURCE_COLUMNS`/`CROSSWALK_COLUMNS` orders **duplicated as consts in admin.jsx** (they must match `tools/publish-resources.js` — copy the arrays verbatim); `sb.from('resources' | 'resource_crosswalk')`; `sb.functions.invoke('publish')`.
- Produces: `EditorTab({ table })` and `PublishBar` (rendered above both editor tabs).

- [ ] **Step 1: Implement `EditorTab`.** Load: `sb.from(table).select('*').order('position')`. Table list (resources: id / title / population / url; crosswalk: finding_type / subgroup / subject / grade_band / resource_id / match_strength) with ▲/▼ per row, Edit per row, Add button. **Reorder swap must respect the UNIQUE(position) constraint — three steps:** set row A `position = -1`, set row B to A's old position, set A to B's old position (sequential awaits; reload on error). Edit/Add form: one labeled input per CSV column (`notes`/`rationale` as textarea); crosswalk `resource_id` as `<select>` of current resource ids; `match_strength` input with `<datalist>` `direct`/`adjacent`; validate with the Task-2 validators (existing-ids array excludes the row being edited); blocking errors listed inline; Save → `insert` (new: `position = max+1`) or `update` (match on `resource_id` for resources, `id` for crosswalk) always setting `updated_at: new Date().toISOString()`; Delete (form footer, `confirm()`d) → `.delete()`; reload list after any write.
- [ ] **Step 2: Implement `PublishBar`.** On mount and after any save: fetch `/reference/evidence_resources.csv` + `/reference/evidence_crosswalk.csv` (same-origin, `cache: 'no-store'`), pull both tables, badge = `diffPublished(RESOURCE_COLUMNS, resources, resCsv) || diffPublished(CROSSWALK_COLUMNS, crosswalk, xwCsv)` → amber "Unpublished changes" chip vs muted "Everything published". Publish button: `sb.functions.invoke('publish')` → success: "Publish started — the site updates when the workflow lands." + link `https://github.com/PRiME-2019/growthlens/actions/workflows/publish-resources.yml`; failure: show `error.message`.
- [ ] **Step 3: Playwright:** routes — REST GET both tables (canned 3 resources / 2 crosswalk rows), same-origin CSVs fetched for real (differ from canned → badge shows); PATCH/POST/DELETE captured and 204/201; `/functions/v1/publish` POST → `{ ok: true }`. Assert: both tabs list rows; edit form round-trips (PATCH body contains the edited field + `updated_at`); validation blocks an empty title with inline error; reorder emits the 3-step position sequence; badge visible; Publish click hits the function route and shows the success line. No console errors.
- [ ] **Step 4:** `node --test` green. Commit: `feat(admin): resource/crosswalk editor, unpublished badge, publish button`

---

### Task 6: Edge Function, email template, runbooks, README

**Files:**
- Create: `supabase/functions/publish/index.ts`
- Create: `docs/runbooks/otp-email.html`
- Create: `docs/runbooks/resend-setup.md`
- Create: `docs/runbooks/admin-go-live.md`
- Modify: `README.md` (file map + one line under the telemetry paragraph noting the admin panel)

- [ ] **Step 1: Edge Function** (committed for reference; Andrew pastes it in the dashboard):

```ts
// Fires the publish-resources workflow for an authenticated admin.
// Secrets: GITHUB_PAT (fine-grained: this repo, Actions read+write; classic
// PAT with `workflow` scope if org policy blocks fine-grained).
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*", // auth is the JWT below, not CORS
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "not signed in" }),
      { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  const r = await fetch(
    "https://api.github.com/repos/PRiME-2019/growthlens/actions/workflows/publish-resources.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("GITHUB_PAT")}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "growthlens-admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (r.status !== 204) {
    const detail = await r.text();
    return new Response(JSON.stringify({ error: `GitHub dispatch failed (${r.status})`, detail }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true }),
    { headers: { ...CORS, "Content-Type": "application/json" } });
});
```

- [ ] **Step 2: OTP email template** (`docs/runbooks/otp-email.html`) — email-safe single-table HTML, inline CSS only, no webfonts: 560px card on `#F7F7F8`; Georgia-serif "GrowthLens" wordmark + small caps "ADMIN SIGN-IN"; 2px `#C8A84A` rule; body line "Here's your one-time sign-in code:"; `{{ .Token }}` at 34px letter-spaced in a `#003DA5`-on-`#F0F4FB` pill; "This code expires in one hour. If you didn't request it, you can safely ignore this email."; footer "PRiME Center · Saint Louis University". Subject (documented at the top of the file in a comment): `Your GrowthLens sign-in code`.
- [ ] **Step 3: `resend-setup.md`** — numbered runbook: create Resend account → Domains → Add `<your-domain>` → add the SPF (TXT) + DKIM (CNAME/TXT) records Resend displays at the DNS host → wait for Verified → API Keys → create key (sending access) → Supabase Dashboard → Authentication → SMTP: enable custom SMTP, host `smtp.resend.com`, port `465`, username `resend`, password = the API key, sender `no-reply@<your-domain>`, sender name `GrowthLens` → save → send a test OTP. Notes: built-in mailer ≈ 2 emails/hour (why we're doing this); Resend free tier 100/day / 3,000/month; `<your-domain>` marked clearly as the placeholder to replace.
- [ ] **Step 4: `admin-go-live.md`** — the one-pass console checklist from the spec (PAT with org-policy note → Edge Function paste + `GITHUB_PAT` secret → email template paste (subject + otp-email.html into Auth → Email Templates → Magic Link/OTP) → resend-setup.md → live smoke: OTP login, summary loads, edit → badge appears → Publish → watch Action + Netlify → revert edit → Publish again).
- [ ] **Step 5: README** — file-map entries for `admin.html`, `admin.jsx`, `engine/csv.js`, `engine/admin-data.js`, `supabase/functions/publish/`, `docs/runbooks/`; one sentence after the telemetry paragraph: admin panel at `/admin.html`, OTP-gated, reads telemetry + edits the resource workbench.
- [ ] **Step 6:** Commit: `feat(admin): publish edge function, OTP email template, go-live runbooks`

---

### Task 7: Full verification

- [ ] **Step 1:** `node --test` — entire suite green.
- [ ] **Step 2:** Serve + run ALL Playwright scripts: the three telemetry smokes (regression — index.html untouched, but prove it) plus the Task 3/4/5 admin scripts. All assertions pass, zero console errors, screenshots of login + summary + editor for the report.
- [ ] **Step 3:** Fix-forward anything found; re-run; commit fixes if any.

## Execution notes

- Tasks 1→6 run without external dependencies; console steps (PAT, function deploy, template paste, Resend DNS) are Andrew's, listed in `admin-go-live.md`.
- **NO PUSH at any point without Andrew's explicit approval.**
