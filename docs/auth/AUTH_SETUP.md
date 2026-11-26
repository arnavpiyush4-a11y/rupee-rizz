# Auth setup — Supabase dashboard, SMTP and email templates

This document covers **only** the configuration that lives outside the repository.
It is the counterpart to the code changes on `auth-recovery`: the code can route,
retry and explain every outcome correctly, but confirmation and recovery emails
will still fail if the items below are wrong.

Nothing here needs a code change, and nothing in the code can substitute for it.

---

## 1. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL (already required by the app) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public key (already required) |
| `NEXT_PUBLIC_SITE_URL` | optional | Fallback base URL for email redirects when a browser origin is unavailable |

Never put `service_role` or `sb_secret_*` keys in `NEXT_PUBLIC_*`. `lib/supabase/public-config.js`
rejects them at startup.

---

## 2. Dashboard → Authentication → URL Configuration

This is the single most common cause of "the confirmation link is invalid".

**Site URL**

- Production: `https://<your-production-domain>`
- Local development: `http://localhost:3000`

**Redirect URLs** — add every origin you actually open in a browser, each with the
`/auth/confirm` path:

```
http://localhost:3000/auth/confirm
http://127.0.0.1:3000/auth/confirm
https://<your-production-domain>/auth/confirm
```

Notes

- `next dev --hostname 0.0.0.0` is often reached as `http://127.0.0.1:3000` or a LAN
  IP such as `http://192.168.1.20:3000`. Add those too if you use them — the app
  sends whatever origin the browser reports.
- A `0.0.0.0` origin is normalised to `localhost` by the app because a browser can
  never follow a redirect to `0.0.0.0`.
- Wildcards (`http://localhost:3000/**`) work, but the exact paths above are
  narrower and easier to audit.

---

## 3. Dashboard → Authentication → Providers → Email

- **Email provider: enabled.**
- **Confirm email: ON.** Do not disable it. The app treats "signup succeeded but
  no session yet" as "confirmation required" and will not create a usable session
  without it.
- **Secure email change / Change email: optional**, not used by this feature.

Dashboard → Authentication → Rate Limits

- The default email sending limit on the built-in SMTP service is very low
  (a handful per hour). Expect `over_email_send_rate_limit` ("For security
  purposes, you can only request this after N seconds") when testing repeatedly.
  The UI shows this as a generic "please wait a moment", and both resend buttons
  enforce a client-side 60-second cooldown, but real testing needs custom SMTP.

---

## 4. Dashboard → Authentication → SMTP Settings (required for production)

The built-in sender is for development only: it is heavily rate limited and does
not reliably deliver to Indian consumer inboxes.

| Field | Value |
| --- | --- |
| Host | your provider's SMTP host (e.g. `smtp.resend.com`, `smtp.sendgrid.net`, `email-smtp.<region>.amazonaws.com`) |
| Port | `587` (STARTTLS) or `465` (SSL) |
| Username | provider-specific API user (often literally `apikey` or `resend`) |
| Password | provider SMTP credential / API key — **store only in Supabase, never in this repo** |
| Sender email | a verified sending domain, e.g. `no-reply@<your-domain>` |
| Sender name | `RupeeRizz` |

Checklist

1. Verify the sending domain with the provider (SPF + DKIM records) before going live.
2. Send a test email from the Supabase dashboard to a Gmail and an Outlook address.
3. Keep the built-in SMTP for local development only.

---

## 5. Dashboard → Authentication → Email Templates

### 5.1 Confirm signup — recommended template (works on any device)

Two styles work with this app:

- **Default style (`{{ .ConfirmationURL }}`)** — a link containing `?code=…`. This is
  PKCE: the code can only be exchanged in the browser that started the signup,
  because the verifier lives in that browser's storage. Cross-device it fails with
  "PKCE code verifier not found", which the app now explains.
- **Recommended style** — a `token_hash` link plus the 6-digit `{{ .Token }}`. Both
  work on any device, which is what users actually expect from an email.

```html
<h2>Confirm your RupeeRizz account</h2>
<p>Tap the button below to confirm <strong>{{ .Email }}</strong>:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm my email</a></p>
<p>On a different device? Enter this 6-digit code in the app instead:</p>
<p style="font-size:24px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>This code expires in 1 hour and can be used once.</p>
```

`{{ .SiteURL }}` must be correct in Dashboard → URL Configuration for that link to
resolve.

### 5.2 Reset password — REQUIRED template

The in-app recovery flow verifies a **6-digit code** with
`supabase.auth.verifyOtp({ email, token, type: 'recovery' })`, so the recovery email
**must** contain `{{ .Token }}`. If it only contains a link, the "enter the code"
step can never succeed.

```html
<h2>Reset your RupeeRizz password</h2>
<p>Enter this 6-digit code in the app to choose a new password:</p>
<p style="font-size:24px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>This code expires in 1 hour and can be used once.</p>
<hr />
<p>Or, on the same device you requested it from, open this link:</p>
<p><a href="{{ .ConfirmationURL }}">Choose a new password</a></p>
<p>If you did not ask for this, ignore this email — your password has not changed.</p>
```

Why both: the code is device independent and is what the app's form accepts; the
link is the same-browser (PKCE) shortcut and lands on `/auth/confirm`, which sends
the user straight to the "choose a new password" step.

The same `{{ .Token }}` requirement applies if you switch the recovery template to
`token_hash`:

```html
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a></p>
```

---

## 6. How the app handles each link outcome

| Situation | URL the app receives | Behaviour |
| --- | --- | --- |
| Signup confirmed, same browser | `/auth/confirm?code=…` | Exchanged, then routed to consent/onboarding/dashboard |
| Signup confirmed, other device | `/auth/confirm?token_hash=…&type=signup` | Verified, then routed normally |
| Signup confirmed by code | none (user types 6 digits) | `verifyOtp({type:'signup'})`, then routed normally |
| Link expired or already used | `…&error_code=otp_expired` | "incorrect, has expired, or was already used" + resend with cooldown |
| Password reset link, same browser | `/auth/confirm?code=…` | Straight to the "choose a new password" step |
| Password reset link, other device | `/auth/confirm?token_hash=…&type=recovery` | Same: set-password step |
| Password reset by code | none | Code verified, then password update; a failed update can be retried **without a new code** |

---

## 7. Manual (real-Supabase) checks — not covered by the mocked tests

`npm run test:auth` proves the logic with fabricated payloads. These must be done
by hand against a real project:

1. **Signup, same browser** — create an account, open the email in the same browser,
   confirm, land in consent/onboarding.
2. **Signup, other device** — create an account, open the email on a phone, confirm,
   land in the app. (Requires the `token_hash` template or the 6-digit code.)
3. **Expired link** — open a used confirmation link again: expect the expired panel
   with a working resend, never a silent landing page.
4. **Recovery by code** — request a code, enter it with a new password, confirm the
   user is signed in and routed to consent/onboarding/dashboard, not stuck on the
   reset form.
5. **Wrong / reused code** — enter a wrong code, then a previously used one: both
   show the same generic message and offer a resend.
6. **Wrong email for a valid code** — request a code for account A, type account B's
   email with A's code: the app must refuse and end that session
   (`account_mismatch`).
7. **Password update failure** — with a verified code, submit a too-short password
   and confirm you can retry on the same screen without a new code.
8. **Session restoration** — reload while signed in: no onboarding flash, no
   duplicate `/me` calls (Network tab).
9. **Network failure** — DevTools offline, reload while signed in: a retry screen,
   not a sign-out and not onboarding.
10. **Logout / account switch** — sign out, then sign in as a different account:
    no data from the previous account appears (experiment cache cleared).
11. **Enumeration** — request a reset for an address with no account: the message
    must be identical to the real-account case.

---

## 8. Known limitations

- Supabase deliberately returns **the same error** for a wrong, expired and
  already-used one-time code, so the app cannot distinguish them in the UI. It
  shows one message covering all three and offers a resend.
- PKCE `?code=` links are single-browser by design. The fix is configuration
  (use the `token_hash` / `{{ .Token }}` templates), not code.
- Client-side resend cooldowns are 60 seconds and are a UX guard only. The
  authoritative limit is the Supabase rate limit.
