# RupeeRizz v5 receipt verification

## Source-level verification

- Receipt regression tests: **11/11 passed**
- Deterministic receipt benchmark: **4/4 passed**
- Server-side JS syntax checks: **passed** for `route.js`, `receiptEngine.js`, `openaiVision.js`, and `scripts/receiptBenchmark.mjs`

## Covered regressions

1. OCR money noise such as `4O5.00` is normalized.
2. Tied total candidates are not resolved by choosing the larger number.
3. Two agreeing OCR passes create high-confidence evidence.
4. Conflicting OCR totals remain verification-required.
5. Vision + OCR agreement can become verified.
6. Vision disagreement remains editable.
7. `NO. OF ITEMS` and payment/cashier metadata cannot become the receipt total.
8. Zudio-style `TOTAL AMOUNT 808` vs `NO. OF ITEMS 3` is explicitly covered.
9. Vision-only results remain explicitly verifiable when OCR is unavailable.
10. Item arithmetic + payment can reconcile a final total.
11. Arithmetic catches a false total even when item OCR is otherwise strong.

## Benchmark

The deterministic benchmark currently covers:

- Zudio-style total confusion (`808` vs `3`)
- OCR character noise (`4O5`)
- payment amount vs final total
- conflicting total candidates

## Build note

A full Next.js production build was not executed in the model build environment because the environment could not complete dependency installation. The source-level checks above pass; after extracting locally, run:

```bash
npm install
npm run test:receipt
npm run benchmark:receipt
npm run build
```

Then run the real receipt flow with a valid `OPENAI_API_KEY` and, preferably, `OCR_API_KEY`.


## v6 local regression update
- Receipt unit tests: 15/15 passed
- Receipt benchmark: 5/5 passed
- Added Zudio repeated-item/SKU regression
- Added Brew & Bites pincode/table-number regression
- Added vision-vs-OCR item-arbitration regression
