# Admin panel — design

**Date:** 2026-07-21
**Status:** approved (this conversation)
**Builds on:** 2026-07-20-usage-telemetry-design.md (tables, RLS, grants, auth
settings, publish-resources workflow — all live and verified).

## Goal

A single-admin panel at `/admin.html` on the existing Netlify site:

1. **Polished email-OTP login** (Supabase Auth; signups closed, so OTP is an
   allowlist of invited emails).
2. **Telemetry summary** — adoption / features / friction, `(system)` filtered.
3. **Resource workbench editor** — both tables, with an honest
   "unpublished changes" badge and a Publish button that fires the
   `publish-resources` workflow via a Supabase Edge Function.
4. **Branded OTP email template** + a Resend custom-SMTP runbook.

Decisions made in-session: panel lives in this repo on the same site (option
A); publish credential lives in an Edge Function secret, never the browser;
OTP email sends from a domain Andrew controls via Resend (domain name is a
placeholder until provided).

## Constraints

- Same no-build stack as the app: React 18 + Babel CDN, pinned versions + SRI.
  `supabase-js` v2 UMD (pinned + SRI) loads **only on admin.html** — the
  district-facing app never touches it.
- The panel page is publicly reachable; **RLS is the wall**. The publishable
  key appears in admin.html exactly as it does in telemetry.js.
- Admin is standalone: it defines its own small SLU/font constants rather than
  loading app modules, so app refactors can't break it. Exception: it loads
  `engine/csv.js` + `engine/resources.js` (pure, stable) for the diff badge.
- All aggregation/validation/diff logic is pure, UMD, `node --test`-covered.
- No telemetry events are logged from the admin page.

## Files

```
admin.html                    entry: fonts, React/Babel CDN, supabase-js CDN,
                              engine/csv.js + engine/resources.js, admin.jsx
admin.jsx                     the whole panel (login, shell, three views)
engine/csv.js                 writeCsv extracted from tools/publish-resources.js
                              (UMD; the tool now requires it — single source)
engine/admin-data.js          summarize(), validateResource(), validateCrosswalk(),
                              diffPublished() — pure, Node-tested
supabase/functions/publish/index.ts   Edge Function: JWT check → workflow_dispatch
docs/runbooks/resend-setup.md         Resend + custom SMTP, step by step
docs/runbooks/admin-go-live.md        one-pass console checklist (PAT, function,
                                      secrets, email template, SMTP)
test/admin-data.test.js, test/csv.test.js (+ publish tests keep passing)
```

## Login flow

Branded card (wordmark, ADMIN eyebrow). Email step: input prefilled from
`gl:admin-email` in localStorage; submit → `signInWithOtp({ email, options:
{ shouldCreateUser: false } })`. Code step: six segmented digit boxes —
auto-advance, backspace moves back, full-code paste distributes, Enter
verifies → `verifyOtp({ email, token, type: 'email' })`. Resend link disabled
behind a 60 s countdown. Error states in plain language: wrong/expired code,
"that email isn't invited" (signInWithOtp error when user doesn't exist),
network failure. Session persists via supabase-js; `onAuthStateChange` drives
the gate. Signed-in header: email + Sign out. Focus is managed
(email → first code box); `prefers-reduced-motion` respected.

## Telemetry summary

Window picker: 30 days (default) / 90 days / all time. Fetch
`events` with the authenticated session, paging past PostgREST's 1000-row cap
(`.range()` loop), columns only (no props needed beyond page/code extraction —
fetch `props` too, it's tiny). `summarize(events, { sinceIso })` (pure)
returns: stat totals (districts, devices, sessions, events — `(system)`
excluded), weekly counts (ISO week buckets) for an SVG bar sparkline, top
pages, upload errors by code, per-district rollup (first/last seen, sessions,
devices) sorted by last-seen. Render: four stat cards, sparkline, three
tables. Empty state for a fresh window.

## Resource editor + publish

Tabs: **Resources** and **Matching rules**. Each: table list ordered by
`position`; row click opens an edit form; Add and Delete (confirm) buttons;
▲/▼ reorder swaps `position` values (two updates). Crosswalk form:
`resource_id` dropdown from live resources; `match_strength` datalist from
observed values (`direct`, `adjacent`) but free entry allowed; other enums
free text with datalist suggestions. Saves stamp `updated_at`. Validation
(pure, tested): required fields, `url` must be http(s), `resource_id`
unique / must exist for crosswalk rows; blocking errors shown inline.

**Unpublished badge:** fetch `/reference/evidence_*.csv` same-origin, run DB
rows through the same `writeCsv`, string-compare (LF-normalized) via
`diffPublished()`. Unequal → "Unpublished changes" badge on the Publish bar.

**Publish button:** `supabase.functions.invoke('publish')`. Success → "Publish
started" + link to the Actions page; badge clears once the deployed CSVs catch
up (refetch on focus/interval is out of scope — a manual refresh is fine).
Errors surface the function's message.

## Edge Function (`publish`)

Deno, committed to the repo, pasted into the dashboard (or `supabase functions
deploy`). Flow: CORS preflight → `auth.getUser()` with the caller's
Authorization header (any authenticated user = the admin; signups closed) →
`POST /repos/PRiME-2019/growthlens/actions/workflows/publish-resources.yml/dispatches`
`{ ref: 'main' }` with `GITHUB_PAT` from function secrets → 204 = `{ok:true}`,
else 502 with detail. CORS stays permissive (`*`): the JWT check is the
security boundary, not CORS. Secrets: `GITHUB_PAT` only (SUPABASE_URL/keys are
auto-injected). PAT: fine-grained, this repo only, Actions read+write — note:
PRiME-2019 is an org, so fine-grained PATs need org policy to allow them;
classic PAT with `workflow` scope is the fallback.

## Email template + Resend runbook

Branded OTP HTML (inline email-safe CSS, no webfonts: Georgia serif wordmark,
SLU-blue rule, `{{ .Token }}` large and centered, 1-hour expiry note,
ignore-if-unexpected line) + subject ("Your GrowthLens sign-in code") for the
Supabase **Magic Link / OTP email template** dashboard field.
`docs/runbooks/resend-setup.md`: Resend account → add domain
(`<your-domain>` placeholder) → SPF/DKIM DNS records → SMTP credentials
(`smtp.resend.com`, port 465, user `resend`, password = API key) → Supabase
Auth SMTP settings → sender `no-reply@<your-domain>` → test. Rate-limit note
(built-in mailer ≈ 2/hour; Resend free tier 100/day — ample).

## Testing

- `node --test`: `csv.js` round-trip (existing publish fidelity tests keep
  passing through the extraction), `admin-data.js` — summarize windows,
  `(system)` filtering, weekly bucketing, rollups; validation rules;
  diffPublished equal/unequal/CRLF cases.
- Playwright, Supabase intercepted at the network layer (canned
  `/auth/v1/otp`, `/auth/v1/verify`, `/auth/v1/user`, REST reads): login
  renders; code boxes auto-advance/paste/error states; wrong-code path;
  summary renders canned data (stat values asserted); editor lists rows, edit
  form round-trips; publish button hits the function route; no console errors.
- Live OTP login + real publish click: manual, Andrew, post-deploy.

## Console steps (Andrew, one pass — docs/runbooks/admin-go-live.md)

1. Create the PAT (fine-grained or classic fallback).
2. Dashboard → Edge Functions → new function `publish` → paste
   `supabase/functions/publish/index.ts` → set secret `GITHUB_PAT`.
3. Auth → Email Templates → paste subject + HTML.
4. Resend runbook (account, DNS, SMTP into Supabase).
5. Live smoke: OTP login, view summary, edit a field, Publish, watch the
   Action run and Netlify deploy, revert the edit, Publish again.

## Out of scope (deliberate)

- Multi-admin roles; audit log of edits (Postgres has `updated_at` only).
- Auto-refreshing the unpublished badge after deploys.
- Editing the statewide PRiME database or conversion factors.
- Admin usage telemetry.
