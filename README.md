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
- **Supabase** for Postgres data, Auth, Storage and Row Level Security.
- **Native Tesseract 5 and Sharp** for local document recognition. The separate financial-insights feature retains its optional LLM integration.

### Independent receipt and business document OCR

Receipt images run through local Sharp preprocessing, native Tesseract and deterministic extraction. The review screen links an owner-confirmed document to its private source. Follow [installation, evaluation and demo instructions](docs/ocr/README.md).

For Vercel Preview deployment, use the [Container Functions deployment guide](docs/ocr/vercel-container.md). The included `Dockerfile.vercel` packages native OCR with the full app.

### API and security

- Single catch-all API at `app/api/[[...path]]/route.js`.
- Server-side Supabase clients inherit the end-user bearer token, so RLS applies to every request. The service-role key is never used.
- Consent is checked before receipt OCR/storage and AI insight generation.
- Receipt images are stored in a private Supabase Storage bucket.

### Supabase tables
The app reads/writes the Supabase tables used by the current schema, including `profiles`, `consents`, `receipts`, `savings_goals`, `goal_contributions`, and `deletion_requests`, plus the private `receipts` Storage bucket.

### Security & privacy model
- Every user route requires `Authorization: Bearer <Supabase access token>` and filters by that `user_id`.
- Consent is required (HTTP 403 `consent_required`) before OCR, receipts, dashboard analysis, insights, or Before-You-Borrow.
- Extracted merchant and item text passes through sensitive-data masking. The original image is stored privately as uploaded.
- The ledger does not request account passwords, PINs or Aadhaar numbers.
- The financial-insight LLM receives **only verified, server-computed values** and cannot change goals/plans/scores. Receipt images are processed locally on the application host.

---

## Run locally

Install the native dependencies and configure the Supabase public credentials and server-only scan signing key as described in [the OCR guide](docs/ocr/README.md). Run `npm ci --legacy-peer-deps` followed by `npm run dev`. The landing page offers the business demonstration.

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

## Hack With Delhi 4.0 · Business workspace

Apply migrations 0001 through 0004 in order before serving this branch. The existing Supabase environment variables and receipt scanner are reused. Sign in with a consented micro-entrepreneur profile and open **Business**.

For an isolated walkthrough, choose **See the demo** on the landing page. The sample shop bought ten rice bags for ₹500 and sold two on credit for ₹160. Open **Stock & suppliers** to see eight bags left. In **Ledger**, link the ₹160 sample receipt to the sale, then settle it digitally. The receivable clears while operating profit stays at ₹60. Open **Evidence Passport** to see coverage rise from 50% to 100%, export JSON, and compare the file with the ledger. Demo edits last until you exit or reload. Live accounts start with their own records.

Monetary calculations use paise. GST is entered by the operator. Passports report the strength of recorded evidence and do not determine loan or scheme eligibility. Run the regression suite with `node --test tests/*.test.js`.
