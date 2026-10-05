# RupeeRizz Novelty Update — Financial Future Lab

Added a receipt-powered behavioral layer without changing the existing Supabase schema:

- **Spending DNA** — derives category, merchant, weekend/weekday and recoverable-spend patterns from verified receipts.
- **Money Time Machine** — counterfactual simulator that changes one category spend and instantly shows monthly/annual savings and goal-time impact.
- **₹100 Question** — translates a purchase into opportunity cost relative to savings and the selected goal.
- **7-Day Money Experiment** — turns the strongest observed pattern into a testable action and stores the result in browser storage for the hackathon prototype.
- **Deterministic calculations** — money math lives in `lib/behavior.js`; the LLM is not responsible for numerical calculations.

## Presentation flow

`Receipt → Verified transaction → Spending DNA → Alternate Reality → Money Experiment → Outcome`

## Deployment

No new environment variables or database migration is required for this update. The prototype uses the existing `/dashboard` API and browser `localStorage` for experiment state.
