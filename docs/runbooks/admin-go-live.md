# Admin panel go-live checklist (one console pass)

Everything code-side ships with the repo; these are the console steps only
Andrew can do. Order matters only where noted. Replace `<your-site>` with the
production Netlify URL and `<your-domain>` with the email-sending domain.

## 0. Deploy

The panel goes live when the commits are pushed — Netlify auto-deploys.
`https://<your-site>/admin.html` (and the `/admin` redirect) must exist before
step 2's verification or step 7.

## 1. Supabase Auth prerequisites (verify — mostly done already)

1. **Authentication → Sign In / Up:** new user signups **disabled** (this is
   what makes OTP an allowlist).
2. **Authentication → Users:** your admin email appears (invited). Anyone who
   should reach the panel must be invited here; there is no self-serve path.
3. **Authentication → Providers → Email:** **Email OTP length = 8** — must
   match `OTP_LENGTH` in `admin.jsx`; change both or neither.
4. **Authentication → URL Configuration:**
   - **Site URL** = `https://<your-site>` (replace the `localhost:3000`
     default).
   - **Redirect URLs**: add `https://<your-site>/admin.html` and (for local
     testing) `http://localhost:8123/admin.html`.
   - Why this matters even though OTP sign-in is deliberately link-free: other
     auth emails Supabase sends — **invites** to a future second admin,
     password recovery if ever enabled — carry `{{ .ConfirmationURL }}`, which
     resolves through the Site URL. With the default left in place those links
     point at localhost and dead-end.

## 2. GitHub PAT (powers the Publish button)

5. GitHub → Settings → Developer settings → **Fine-grained personal access
   tokens** → Generate new token:
   - Resource owner: **PRiME-2019** (the org must allow fine-grained PATs —
     Org Settings → Third-party Access → Personal access tokens. If the org
     blocks them, fall back to a **classic PAT** with the `workflow` scope.)
   - Repository access: **Only select repositories** → `growthlens`
   - Permissions → Repository → **Actions: Read and write** (nothing else)
   - Expiration: 1 year — calendar the renewal; an expired PAT shows up as
     "GitHub dispatch failed (401)" on the Publish button.
6. Copy the token (shown once).

## 3. Edge Function

7. Supabase Dashboard → **Edge Functions → Deploy new function** → name it
   exactly **`publish`** → paste `supabase/functions/publish/index.ts` from
   the repo verbatim → deploy. Do not retype the CORS lines — the
   `x-client-info` entry in the allow-list is required or every
   `functions.invoke()` preflight fails.
8. Edge Functions → **Secrets** → add `GITHUB_PAT` = the token from step 6.
9. Verify (needs step 0 deployed): panel → Resources tab → **Publish to
   site** → "Publish started", and a `publish-resources` run appears on the
   repo's Actions tab. Errors surface the function's real reason: "not signed
   in" = auth; "GitHub dispatch failed (401/404)" = the PAT.

## 4. Email template + OTP settings

10. Supabase Dashboard → **Authentication → Email Templates → Magic Link** →
    - Subject: `Your GrowthLens sign-in code`
    - Body: paste `docs/runbooks/otp-email.html` (keep `{{ .Token }}` intact).
    - **Keep the template link-free** — no `{{ .ConfirmationURL }}`. Outlook
      SafeLinks prefetches links and can consume a one-time link before it's
      clicked; the typed code is the only sign-in path on purpose.

## 5. Resend custom SMTP

Why: the built-in mailer is limited to ≈2 emails/hour and sends from a generic
address. Resend free tier (100/day, 3,000/month) is ample. Full detail with
screenshots-level steps: `docs/runbooks/resend-setup.md`. Condensed:

11. Create the account at <https://resend.com>.
12. **Domains → Add Domain** → `<your-domain>` (or `mail.<your-domain>` to
    keep root DNS untouched) → add the SPF/DKIM/MX records Resend displays at
    your DNS host (copy from the Resend screen — values are account-specific)
    → wait for **Verified**.
13. Optional but good for deliverability: add a DMARC TXT record
    (`_dmarc.<your-domain>` → `v=DMARC1; p=none;`) if the domain doesn't have
    one.
14. **API Keys → Create** — name `growthlens-smtp`, permission **Sending
    access**, restricted to `<your-domain>`. Copy the key.
15. Supabase Dashboard → **Authentication → SMTP Settings** (some dashboard
    versions: Project Settings → Auth) → **Enable custom SMTP**:
    - Host `smtp.resend.com` · Port `465` · Username `resend`
    - Password: the API key · Sender `no-reply@<your-domain>` · Name
      `GrowthLens`
16. First send after switching: check the spam folder once; with SPF+DKIM
    verified (and DMARC) it should land in the inbox from then on.

## 6. Redirect + URL checks

17. `https://<your-site>/admin` 301-redirects to `/admin.html`
    (netlify.toml rule) — check it resolves after deploy.
18. `https://<your-site>/admin.html` loads the login card over HTTPS with no
    console errors (F12).

## 7. End-to-end live smoke

19. `/admin` → enter your email → branded 8-digit code arrives from
    `no-reply@<your-domain>` → boxes auto-advance → shell.
20. **Summary** shows real telemetry; `(system)` keepalive rows are invisible.
21. **Resources** → edit any field → **Unpublished changes** badge appears.
22. **Publish to site** → the Action commits the CSV change → Netlify deploys
    → reload the panel → badge reads "Everything published".
23. Revert the edit in the panel → Publish again → confirm the revert lands.
    That round-trip exercises auth, RLS, the edge function, the PAT, the
    workflow, and the badge in one pass.

## Troubleshooting

- **No email:** Resend → Logs (accepted/bounced) or Supabase → Authentication
  → Logs (SMTP attempt). Before step 5, remember the built-in mailer's
  ≈2/hour cap — a second code request inside the window silently waits.
- **"That email isn't invited":** the address isn't in Auth → Users. Invite
  it; signups are closed by design.
- **Publish button errors:** the panel shows the function's message.
  "Couldn't check publish status" on the badge is different — that's the
  CSV/DB comparison failing (usually transient; use Recheck).
- **Invite/recovery links dead-end on localhost:** Site URL was left at the
  default — step 4 of section 1.
