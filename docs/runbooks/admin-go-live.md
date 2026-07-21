# Admin panel go-live checklist (one console pass)

Everything code-side ships with the repo; these are the console steps only
Andrew can do. Order matters only where noted.

## 1. GitHub PAT (for the Publish button)

1. GitHub → Settings → Developer settings → **Fine-grained personal access
   tokens** → Generate new token:
   - Resource owner: **PRiME-2019** (the org must allow fine-grained PATs —
     Org Settings → Third-party Access → Personal access tokens. If the org
     blocks them, fall back to a **classic PAT** with the `workflow` scope.)
   - Repository access: **Only select repositories** → `growthlens`
   - Permissions → Repository → **Actions: Read and write**
   - Expiration: 1 year (calendar a renewal reminder)
2. Copy the token.

## 2. Edge Function

3. Supabase Dashboard → **Edge Functions → Deploy new function** → name it
   exactly **`publish`** → paste `supabase/functions/publish/index.ts` from
   the repo → deploy.
4. Edge Functions → **Secrets** → add `GITHUB_PAT` = the token from step 2.
5. Quick check: the panel's **Publish to site** button should now start the
   workflow (verify on the repo's Actions tab) rather than returning an error.

## 3. Email template + OTP settings

6. Supabase Dashboard → **Authentication → Email Templates → Magic Link** →
   - Subject: `Your GrowthLens sign-in code`
   - Body: paste `docs/runbooks/otp-email.html` (keep `{{ .Token }}` intact).
   - **Keep the template link-free** — no `{{ .ConfirmationURL }}`. Outlook
     SafeLinks prefetches links and can consume a one-time link before it's
     clicked; the typed code is the only sign-in path on purpose. The
     panel's `OTP_LENGTH` constant (admin.jsx) must match the **Email OTP
     length** auth setting — both are 8 as of 2026-07-21.

## 4. Resend SMTP

7. Follow `docs/runbooks/resend-setup.md` (account → domain DNS → API key →
   Supabase SMTP settings). Until this is done the built-in mailer still
   works — just slowly (≈2 emails/hour) and from a generic sender.

## 5. Live smoke test

8. Open `https://<site>/admin.html` (or localhost) → sign in via OTP → the
   branded email arrives → code boxes → Summary shows real telemetry.
9. Resources tab → edit any field → **Unpublished changes** badge appears →
   **Publish to site** → watch the `publish-resources` Action commit the CSV
   change and Netlify deploy → reload the panel → badge reads "Everything
   published".
10. Revert the edit in the panel → Publish again → confirm the revert lands.
