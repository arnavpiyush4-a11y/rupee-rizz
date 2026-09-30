# RupeeRizz AI Pipeline — v6

## Current receipt pipeline
- Image quality gate and preprocessing.
- Dual OCR passes (original + enhanced).
- Context-aware OCR fallback that excludes pincode, table number, cashier/payment metadata and preserves repeated line items.
- Direct OpenAI multimodal extraction when `OPENAI_API_KEY` is available.
- Emergent remains a secondary fallback when configured.
- Evidence arbitration between image, OCR and model extraction.
- Arithmetic validation uses the final selected item set.
- Low-confidence/conflicting results remain editable and cannot be treated as verified automatically.
- UI explicitly reports when the vision LLM was not used or failed.

## Regression status
- Receipt unit tests: **15/15 passed**
- Receipt benchmark: **5/5 passed**
- Zudio regression: **₹808 total, 3 line items (₹399 + ₹399 + ₹10)**
- Brew & Bites regression: **₹240 total, 2 line items (₹120 + ₹120)**

## Important runtime behavior
A scan that shows `OCR-only fallback — verify carefully` is not a multimodal LLM success. Check the `Vision LLM was not available...` message for the exact reason.
