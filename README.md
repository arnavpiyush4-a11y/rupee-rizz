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
- **Direct OpenAI Responses API** for primary multimodal receipt extraction, with strict JSON Schema + OCR evidence fusion; **Emergent Universal LLM** remains an optional server-side fallback.

### Receipt intelligence pipeline (v5)

RupeeRizz now treats receipt extraction as an evidence-fusion problem instead of trusting one OCR result.

1. The server assesses image quality (resolution, contrast, sharpness and glare) before extraction.
2. The image is preprocessed server-side and OCR.space can run two passes: original + enhanced image.
3. Each OCR pass is parsed independently. Totals, dates and merchant names are reconciled rather than concatenated.
4. Direct OpenAI vision is the primary multimodal LLM path when `OPENAI_API_KEY` is configured. The image is the primary evidence and OCR is corroboration.
5. Strict JSON Schema output reduces extraction drift.
6. A second vision arbitration pass can resolve genuine conflicts by re-reading the receipt; it must return `null` + verification when the image is ambiguous rather than guessing.
7. Arithmetic validation checks item totals, labelled tax/discount lines and payment/tender amounts against the proposed grand total.
8. Low-quality images and disputed fields stay editable and require user verification before the receipt is saved.
9. Emergent remains an optional fallback provider. The system never silently falls back to demo values in live mode.

### Runtime configuration

```env
OPENAI_API_KEY=...
OPENAI_RECEIPT_MODEL=gpt-5.6-sol
OPENAI_RECEIPT_FALLBACK_MODEL=gpt-5.6-luna
OPENAI_RECEIPT_ARBITER_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=high
OPENAI_RECEIPT_MAX_OUTPUT_TOKENS=1800
OPENAI_INSIGHTS_MODEL=gpt-5.6-luna
OPENAI_INSIGHTS_FALLBACK_MODEL=gpt-5.6-luna
OPENAI_INSIGHTS_REASONING=low
OPENAI_INSIGHTS_MAX_OUTPUT_TOKENS=700
OPENAI_TIMEOUT_MS=60000
OCR_MODE=live
OCR_PROVIDER=ocrspace
OCR_API_KEY=...
```

Optional fallback:

```env
EMERGENT_LLM_KEY=...
```

Supabase requires the project URL plus the publishable key (or the supported legacy anon-key alias). This app does **not** require a Supabase service-role/secret key.

OpenAI API usage is billed separately from a ChatGPT subscription. Keep `OPENAI_API_KEY` server-side only; never expose it in client code or source control.

### API and security

- Single catch-all API at `app/api/[[...path]]/route.js`.
- Server-side Supabase clients inherit the end-user bearer token, so RLS applies to every request. The service-role key is never used.
- Consent is checked before receipt OCR/storage and AI insight generation.
- Receipt images are stored in a private Supabase Storage bucket.

### Supabase tables
The app reads/writes the Supabase tables used by the current schema, including `profiles`, `consents`, `receipts`, `savings_goals`, `goal_contributions`, and `deletion_requests`, plus the private `receipts` Storage bucket.

### Security & privacy model
- Every user route requires `Authorization: Bearer <user_id>` and filters by that `user_id`.
- Consent is required (HTTP 403 `consent_required`) before OCR, receipts, dashboard analysis, insights, or Before-You-Borrow.
- Receipt text is masked for phone numbers, UPI IDs and card-like numbers **before storage**.
- Never collected/used: caste, religion, gender, political views, Aadhaar, card numbers, PINs, passwords, bank logins.
- The financial-insight LLM receives **only verified, server-computed values** and cannot change goals/plans/scores. The receipt vision LLM receives the consented receipt image(s) plus OCR evidence only for extraction; it cannot write goals, plans, scores, or account data.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon client key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy alias supported by the app |
| `OPENAI_API_KEY` | Direct OpenAI API key for primary multimodal AI |
| `OPENAI_RECEIPT_*`, `OPENAI_INSIGHTS_*` | OpenAI model, fallback, reasoning, timeout and output settings |
| `EMERGENT_LLM_KEY` | Optional Emergent fallback key |
| `OCR_MODE` | `live` (default) or `demo`; demo must be explicitly enabled |
| `OCR_PROVIDER`, `OCR_API_KEY` | Live OCR via OCR.space; provider defaults to `ocrspace` when a key is present |

---

## Demo mode & OCR

- **Demo OCR** returns realistic, deterministic sample receipts (clearly labelled) so the full
  **upload → scan → extract → verify → save** flow works with no keys.
- **Enhanced OCR:** the real scanner uses OCR.space Engine 2 with language autodetection, orientation detection, provider scaling, two passes (original + server-preprocessed image), strict amount/date/merchant heuristics, and LLM structuring with OCR evidence checks. `OCR_MODE=live` is the default.
- **Important:** if `OCR_API_KEY` is missing while `OCR_MODE=live`, the API now fails safely with a verification-required response instead of returning canned demo values. This prevents fake-looking OCR results from leaking into real uploads.
- To force demo OCR only, set `OCR_MODE=demo`.
- For **live OCR**, set `OCR_MODE=live` and `OCR_API_KEY` (provider defaults to OCR.space). The backend OCR adapter is already implemented; no UI changes are needed.

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

## Receipt AI provider

RupeeRizz can use the direct OpenAI API as the primary multimodal receipt engine. The app sends the receipt image to an OpenAI vision model and combines that result with two independent OCR.space passes when `OCR_API_KEY` is configured. Conflicts can trigger a second vision arbitration pass. Emergent remains an optional fallback.

Set `OPENAI_API_KEY` in `.env.local`. ChatGPT subscription billing and OpenAI API billing are separate; API usage requires API billing/credits on the API platform.

### Receipt verification commands

```bash
npm run test:receipt
npm run benchmark:receipt
```


## Receipt AI v6 notes

RupeeRizz now treats receipt extraction as an evidence-fusion problem rather than trusting one parser. The final receipt values are cross-checked across OCR passes, multimodal vision extraction and arithmetic. The app will explicitly label OCR-only fallback mode and require verification instead of presenting it as a verified AI result.

Run the local receipt checks with:

```bash
npm run test:receipt
npm run benchmark:receipt
```
