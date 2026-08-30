# RupeeRizz — Your friendly money mate

> Save smarter, borrow responsibly. A consent-based **financial wellbeing coach** for Indian
> students and micro-entrepreneurs. **We do not push loans** — we help people become financially
> ready and choose responsible options.

Built for Smart India Hackathon. This is **not** a loan-approval / credit-underwriting app.

---

## What it does (the aha)

1. **Consent first** — nothing is analysed until you clearly agree.
2. **Money snapshot** (Student or Micro-entrepreneur) → transparent, editable maths.
3. **Safe monthly saving** = `max(0, income − essentials − EMI − business costs)`.
4. **Financial Readiness Score /100** with a 5-factor breakdown (self-improvement only — never loan approval).
5. **Receipt OCR** → verify → private storage; sensitive details (phone/UPI/card) are masked.
6. **Goals** with milestones, safe vs required monthly contribution, and a shortfall guard (never over-allocates).
7. **Friendly AI insight** — the LLM only *phrases* server-computed, verified numbers (it never invents money facts).
8. **Government scheme matcher** + **Before You Borrow** (safer options ranked before any credit).
9. **My Data** — export (JSON/CSV), delete, withdraw consent anytime. **English / Hindi** toggle.

---

## Tech & architecture

- **Next.js (App Router)** + **Tailwind** + **shadcn/ui** + **Recharts** + **lucide-react**.
- **MongoDB** for data (see note below), accessed only via `process.env.MONGO_URL` / `process.env.DB_NAME`.
- **Emergent Universal LLM** (`emergentintegrations`, model `openai/gpt-4o-mini`) for insights, server-side only.
- Single catch-all API at `app/api/[[...path]]/route.js`. All calls are under **`/api`**.

> **Note on Supabase vs MongoDB:** the original brief asked for Supabase (Postgres + Auth + Storage + RLS).
> This build runs on a pre-provisioned **MongoDB + Next.js** environment, so the data layer uses MongoDB and
> the security guarantees are provided by **server-side authorisation on every route** (every query is scoped to
> the authenticated `user_id` — an RLS-equivalent), plus **owner-only private receipt storage**. Auth uses a
> demo-safe session (email or anonymous demo), and **Google OAuth is intentionally deferred** (see below).

### Collections (MongoDB)
`users`, `profiles`, `consents`, `receipts`, `receipt_images` (private), `savings_goals`,
`goal_contributions`, `financial_entries`*, `monthly_snapshots`*, `financial_health`*,
`scheme_registry` (seeded), `scheme_matches`, `deletion_requests`, `insights_log`.
(*computed on the fly where not persisted.)

### Security & privacy model
- Every user route requires `Authorization: Bearer <user_id>` and filters by that `user_id`.
- Consent is required (HTTP 403 `consent_required`) before OCR, receipts, dashboard analysis, insights, or Before-You-Borrow.
- Receipt text is masked for phone numbers, UPI IDs and card-like numbers **before storage**.
- Never collected/used: caste, religion, gender, political views, Aadhaar, card numbers, PINs, passwords, bank logins.
- The LLM receives **only verified, server-computed values**; it cannot change goals/plans/scores.

---

## Run locally

```bash
yarn install
cp .env.example .env      # fill in values (see below)
yarn dev                  # or: sudo supervisorctl restart nextjs
```

Open the app, click **Try demo safely** → start as **Arnav** (student) or **Priya** (micro-entrepreneur)
for a fully seeded, working dashboard. Or **Continue with email** for a fresh account
(→ consent → onboarding → dashboard).

### Environment variables
| Key | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | Database name |
| `NEXT_PUBLIC_BASE_URL` | Public URL of the app |
| `EMERGENT_LLM_KEY` | Emergent Universal LLM key (`sk-emergent-...`) for AI insights |
| `OCR_MODE` | `demo` (default) or `live` |
| `OCR_PROVIDER`, `OCR_API_KEY` | For live OCR (optional) |

---

## Demo mode & OCR

- **Demo OCR** returns realistic, deterministic sample receipts (clearly labelled) so the full
  **upload → scan → extract → verify → save** flow works with no keys.
- To enable **live OCR** later: set `OCR_MODE=live`, `OCR_PROVIDER`, `OCR_API_KEY`, and implement the
  provider call in the OCR adapter section of `app/api/[[...path]]/route.js`. **No UI changes are needed** —
  the verification screen already consumes the same extraction JSON shape.

## Enabling Google sign-in later (optional)

Google OAuth needs an auth provider (e.g. Supabase). To add it: configure a Supabase project, set the
Google provider redirect URL to `<NEXT_PUBLIC_BASE_URL>/auth/callback`, and swap the demo-safe session for
Supabase Auth. The current build ships a working demo-safe session instead so the MVP runs with zero external setup.

---

## Key files

```
app/page.js                          # SPA orchestrator (routing + guards)
app/providers.js                     # session / profile / consent / language context
app/api/[[...path]]/route.js         # all backend endpoints (/api/...)
lib/finance.js                       # deterministic, explainable money math (server + client)
lib/schemes.js                       # government scheme registry + matcher
lib/demo.js                          # demo profiles, deterministic OCR, masking, Aman story
lib/i18n.js                          # English + Hindi strings
components/rupee/*                   # UserTypeSelector, ConsentModal, ReceiptUploader,
                                     # ReceiptVerificationForm, SpendingCategoryChart, SavingsGoalCard,
                                     # FinancialHealthChecklist, FriendlyNudgeCard, SchemeMatcher,
                                     # BeforeYouBorrowComparison, MyDataControlPanel, SecurityAlertBanner
components/rupee/views/*             # Landing, Auth, Consent, Onboarding, Dashboard, Receipts, Plan,
                                     # Goals, FinancialHealth, Options, BeforeYouBorrow, MyData, Demo
```

## For guidance only
RupeeRizz is for financial guidance only. Always verify scheme and lender conditions from official sources.
