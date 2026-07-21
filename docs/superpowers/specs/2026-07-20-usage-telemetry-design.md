# Usage telemetry + district identity — design

**Date:** 2026-07-20
**Status:** approved (this conversation)
**Next:** implementation plan; admin dashboard is a separate, later project.

## Goal

Light, near-zero-cost logging of how districts use GrowthLens, keyed to a
self-reported district identity. Three questions the logs must answer:

1. **Adoption** — which districts use the tool, how often, when.
2. **Feature usage** — which pages and features get used.
3. **Friction** — where uploads fail and sessions stall.

Explicitly **not** goals: session replay, funnels, A/B testing, per-student
anything. The admin dashboard that reads these logs is the next project; this
design only has to leave it a clean seam (queryable store + auth ready).

## Constraints

- **$0 hosting.** Supabase free tier + GitHub Actions cron. No Netlify
  functions; the site stays fully static.
- **The privacy promise stays honest.** No student data, no computed results,
  no filenames, no row counts (a row count is a student count — near-PII for a
  tiny district). Events carry only page/feature names and identity metadata.
  Disclosure in the modal; opt-out available.
- **Telemetry must never break the app.** Fire-and-forget, one retry, drop on
  failure. No blocking, no persisted queues, no console spam.
- **No build step.** Supabase URL + anon key are constants in source. The anon
  key is public by design and can only insert (see RLS below).

## 1. Identity — district modal + localStorage

**First visit** (no identity in localStorage): a modal opens over the app.

- **Combobox** pre-populated with the MO district list — type-to-filter,
  arrow keys + Enter or click to select. List ships as a small static file
  (`reference/mo-districts.js`, ~550 names, provided by Andrew; placeholder
  list of a handful of names until then).
- Free text that matches nothing offers a **"Use "…""** row — the typed text
  becomes the ID (`isCustom: true`).
- **Disclosure + opt-out toggle** in the same modal:

  > GrowthLens records which pages and features you use — never your data or
  > your results. If you turn logging off, we record only that you turned it
  > off.

- **Skippable** (X / "later"): stores `district: null`; logging continues with
  `district_id: "(unset)"`; the sidebar chip reads **"Set your district"**.
  This keeps friction data from hesitant users and gives them a way back in.

**Stored shape** (single localStorage key `gl:identity`):

```json
{ "district": "Mehlville R-IX", "isCustom": false,
  "deviceId": "<uuid>", "optOut": false, "setAt": "<ISO>" }
```

`deviceId` is minted once per browser (crypto.randomUUID) — it distinguishes
two people from the same district and lets the dashboard count devices, not
just names.

**Sidebar chip:** in the secondary-nav block next to the Methods link
(app-shell.jsx ~line 306). Shows the district name (truncated) or "Set your
district"; clicking reopens the modal.

**Opt-out semantics** (per Andrew, explicit): opting out sends a final
`opt_out` event carrying the district ID, then behavioral logging stops.
Opting back in sends `opt_in`. The disclosure sentence says this honestly.

## 2. Event taxonomy

Nine fixed event names. No event is added without touching this table.

| Goal | Event | Props (whitelisted, tiny) |
|---|---|---|
| Adoption | `session_start` | — |
| | `identity_set` | `{ custom: bool }` |
| | `opt_out` / `opt_in` | — |
| Features | `page_view` | `{ page }` — key from the PAGES map |
| | `upload_ok` | `{ subject }` |
| | `export` | `{ subjects }` |
| | `interact` | `{ control, value }` — units toggle, grade filter, heatmap sort |
| Friction | `upload_error` | `{ subject, code }` — ingest's string code (`no_prefix`, `missing_columns`, `subject_mismatch`, `no_year`, `no_rows_latest`) |

Plus `keepalive` sent by the cron (district `"(system)"`), filtered out of all
reporting.

**Row shape** (`events` table):

| column | type | notes |
|---|---|---|
| `id` | bigint identity PK | |
| `created_at` | timestamptz default now() | server clock |
| `district_id` | text | chosen name, free text, `"(unset)"`, or `"(system)"` |
| `is_custom` | boolean | free-text vs. picked from list |
| `device_id` | uuid | per-browser |
| `session_id` | uuid | per tab load |
| `event` | text | one of the names above |
| `props` | jsonb | whitelisted per event |
| `app_version` | text | `window.GL_VERSION` |

`char_length` sanity checks on the text columns (district ≤ 120, event ≤ 40)
resist junk inserts.

## 3. Client logger — `telemetry.js`

Root-level module (alongside app-shell.jsx), loaded from index.html. API:

```
Telemetry.init(identity)      read localStorage, mint session, send session_start
Telemetry.log(event, props)   queue an event (no-op when opted out)
Telemetry.setIdentity(d)      update identity, send identity_set
Telemetry.optOut() / optIn()  flip flag, send the corresponding event
```

Internals:

- **Queue + batch:** in-memory queue; flush every 30 s or at 20 events.
  On `visibilitychange → hidden`, flush with `fetch(..., { keepalive: true })`
  — sendBeacon cannot carry the `apikey` header; keepalive fetch can and
  survives tab close.
- **Transport:** one bulk-insert POST per flush to
  `https://<project>.supabase.co/rest/v1/events` with `apikey` +
  `Authorization: Bearer <anon>` headers and `Prefer: return=minimal`.
  PostgREST accepts a JSON array as a bulk insert.
- **Failure:** one retry, then drop the batch. Never throws into the app.
- **Opt-out:** `log()` is a no-op except `opt_in`/`opt_out`.
- **Hygiene:** strings truncated to 120 chars before send; props objects
  whitelisted per event name (unknown keys dropped).

**Instrumentation points** (app-shell + pages):

- `session_start` — on Telemetry.init at app boot.
- `page_view` — effect on the `page` state in AppShell (fires on every
  `setPage`, including the initial landing).
- `upload_ok` / `upload_error` — in the upload wiring where ingest's
  `{ ok, error }` result lands.
- `export` — where the deck download is triggered.
- `interact` — units toggle, grade filter, heatmap column sort.

## 4. Supabase project

- Free tier, one project. Region: US central/east.
- `events` table as above, **RLS enabled**:
  - `anon`: **INSERT only** (no select/update/delete) — nobody can read or
    tamper with logs from the browser.
  - `authenticated`: SELECT — ready for the admin dashboard.
- **Auth:** public signups **disabled**; Andrew's admin email invited
  manually; email-OTP enabled. With signups closed, OTP login is effectively
  an allowlist. Nothing to redo when the dashboard lands.
- Anon key + URL as constants in `telemetry.js` (public by design; insert-only).
- **Accepted risk:** anyone with the key can insert junk rows. At this scale,
  accepted; remedy is delete-by-SQL and, if it ever matters, a rate-limiting
  Postgres function. Documented here so it's a decision, not a surprise.

## 5. Keep-alive cron

Supabase pauses free projects after ~7 days without API activity, and this
tool is seasonal (school breaks). Guardrail:

- `.github/workflows/keepalive.yml`, cron `0 12 */5 * *` (day-of-month
  1,6,11,…,31 — worst-case month-boundary gap ≈ 6 days, under the 7-day
  pause window).
- The job POSTs one `keepalive` event (district `"(system)"`) through the
  same REST insert users take — keeps the project awake **and** verifies the
  ingest path end-to-end. Anon key stored as a repo Actions secret (hygiene,
  not secrecy — the key is public in source anyway).
- Caveat noted: GitHub disables scheduled workflows after 60 days of repo
  inactivity (warning email first). Current commit cadence makes this moot.

## 6. Disclosure surfaces & docs

- **README:** "only same-origin requests" phrasing becomes "no student data
  ever leaves the browser — usage pings carry only page and feature names."
- **FAQ (Home page):** one entry mirroring the modal's disclosure sentence.
- **methods.html:** one sentence in the same voice.
- **changelog.js:** new top entry (v0.73) announcing the district prompt and
  usage logging in plain language.

## 7. Testing

`node --test`, matching the repo's pure-module pattern:

- **Typeahead filter** — prefix/substring matching, case-insensitivity, the
  "Use '…'" fallback row logic.
- **Queue/flush logic** — flush at 20 events and on timer; opt-out gating
  (no-op except opt events); truncation; props whitelist drops unknown keys.
  `fetch` stubbed; no network in tests.
- **Identity round-trip** — localStorage shape, deviceId minted once,
  skip → `"(unset)"`.

Browser verification (http.server + Playwright, per the usual recipe): modal
on first visit, chip updates after selection, POST visible with correct
payload, opt-out silences logging, reopening via chip works.

## Out of scope (deliberate)

- The admin dashboard (next project; this design leaves it Postgres + OTP
  auth, nothing to redo).
- Multi-admin auth, roles.
- Rate limiting / abuse hardening beyond insert-only RLS.
- Multi-year identity migration (localStorage shape is versioned by key name
  `gl:identity`; a future change mints a new key).

## Amendment (2026-07-20): resources workbench + publish pipeline

Approved in-session after the telemetry implementation. The future admin panel
must manage the evidence resources, which today live as two same-origin CSVs:
`reference/evidence_resources.csv` (curated links) and
`reference/evidence_crosswalk.csv` (finding → resource matching rules, FK to
resources). `engine/resources.js` parses both in-browser.

**Architecture decision — static serving, Supabase workbench.** The app keeps
reading the static CSVs (fast, cached, same-origin, immune to a paused free
project). Supabase holds the *editable copy*: `resources` and
`resource_crosswalk` tables mirroring the CSV columns, plus `position`
(preserves file ordering exactly) and `updated_at`. A paused project breaks
nothing user-facing — only editing.

**RLS:** anon + authenticated get SELECT (the content is public in the repo
already; anon read also lets the publish workflow use the anon key instead of
the service-role key). `authenticated` gets full write — the admin panel
later; Supabase Table Editor until then.

**One-pass console setup:** the whole SQL — events table, resource tables,
policies, and seed INSERTs generated from the current CSVs — lives in a
committed `supabase/schema.sql`. Console session = create project → paste one
file → auth settings → copy keys.

**Publish pipeline (GitHub-API commit):** `tools/publish-resources.js`
(dependency-free Node, CJS like the other tools) fetches both tables ordered
by `position` and rewrites the two CSVs in the exact all-quoted dialect
`engine/resources.js` parses (LF line endings, trailing newline — matching
the git blobs). `.github/workflows/publish-resources.yml`
(`workflow_dispatch`) runs it and commits only when the files changed, using
the built-in `GITHUB_TOKEN` with `contents: write` — no PAT. Netlify deploys
the push. The admin panel's future Publish button triggers this workflow.

**Tests:** round-trip (`parseCsv(writeCsv(rows))` returns the rows) and
fidelity (parsing each current CSV and re-writing it reproduces the file
byte-for-byte after CRLF normalization) — proving the workbench → publish
path lossless before the console is ever touched.

**Accepted trade-offs:** the workflow can only be verified end-to-end after
the approved push; triggering stays manual (GitHub UI / `gh workflow run`)
until the admin panel exists; `updated_at` is set on insert only until the
panel manages updates.
