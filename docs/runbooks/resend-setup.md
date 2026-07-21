# Resend custom SMTP for GrowthLens admin emails

Why: Supabase's built-in mailer is limited to roughly **2 emails per hour** and
sends from a generic address. Resend's free tier (100 emails/day, 3,000/month)
is far more than a single admin ever needs, and the OTP mail arrives from your
own domain.

Everywhere below, replace **`<your-domain>`** with the domain you control
(e.g. `example.org` → sender `no-reply@example.org`).

## 1. Resend account + domain

1. Create an account at <https://resend.com> (free tier).
2. **Domains → Add Domain** → enter `<your-domain>` (or a subdomain like
   `mail.<your-domain>` if you prefer to keep root DNS untouched).
3. Resend shows the DNS records to add — typically:
   - one **TXT** record for SPF (e.g. `send.<your-domain>` →
     `v=spf1 include:amazonses.com ~all`),
   - one **MX** record on the same subdomain,
   - one **TXT** record for DKIM (`resend._domainkey.<your-domain>`).
   Add them at your DNS host exactly as displayed (values vary per account —
   copy from the Resend screen, not from here).
4. Wait for the domain to show **Verified** (usually minutes, up to an hour
   with slow DNS propagation).

## 2. API key

5. **API Keys → Create API key** — name `growthlens-smtp`, permission
   **Sending access**, domain restricted to `<your-domain>`. Copy the key
   (shown once).

## 3. Supabase custom SMTP

6. Supabase Dashboard → **Authentication → Emails → SMTP Settings** (on some
   dashboard versions: Project Settings → Authentication → SMTP) → **Enable
   custom SMTP**:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the API key from step 5
   - Sender email: `no-reply@<your-domain>`
   - Sender name: `GrowthLens`
7. Save.

## 4. Test

8. Open `/admin.html`, enter your invited email, **Send code** — the email
   should arrive within seconds, from `no-reply@<your-domain>`, using the
   branded template (see `otp-email.html` in this folder; paste it under
   Authentication → Email Templates if you haven't yet).
9. If nothing arrives: Resend → **Logs** shows every accepted/bounced send;
   Supabase → **Authentication → Logs** shows the SMTP attempt.
