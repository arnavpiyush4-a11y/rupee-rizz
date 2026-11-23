# Scan reliability audit

Branch hack-delhi/independent-ocr, baseline b1462f0. Receipt scanning calls local Tesseract and a deterministic parser. Optional OpenAI financial insights use a separate route. The recognition weights are unchanged. The small evaluation sets do not justify fine-tuning.

| Set | Role | Measured result |
| --- | --- | --- |
| 12 new Indian-format amount cases | Development challenge, before and after | Correct display or abstention rose from 7/12 to 12/12. Three unsafe amounts became blank and two missed totals were recovered. |
| 8 previous synthetic images | Rechecked regression set | All 8 matched the scored fields and item list, previously 7. |
| 6 fresh synthetic documents | Final unseen set, generated after changes to the scanner | 6/6 totals, dates, merchants, invoice identifiers, payment classes and document classes. 5/6 full documents and exact item rows. |
| Zudio photo | Private regression | ₹808. Photo excluded from distribution. |
| Vishwanand restaurant photo | Public development example | ₹525 total, ₹500 taxable and ₹25 GST on the sparse pass. The final pass did not recover the five item rows. |
| CORD v2 test/0 | Foreign-currency out-of-domain check | No amount proposed; native label 60,000. |
| Historical handwritten receipt | Out-of-domain check on archival handwriting | No total or payment method proposed. No Indian handwriting accuracy claim. |

The earlier Odia failure combined a recognition substitution in the total label with overly strict label matching. The digits were legible. The revised rule requires agreement with a separately printed taxable base and tax. On the photographed CORD receipt, fixed-block recognition garbled several words and decimal separators; the parser withheld the total. On the Indian restaurant receipt, fixed-block OCR misread the last digits and a tax label. Sparse segmentation on the original image preserved the component rows. The parser now checks their arithmetic and the amount token's own OCR confidence. Scans still require owner confirmation.

The receipts and invoices used for the generated sets are original fixtures. The final six use new vendors, amounts, serif type and layout, including one rotated image, one blurred image, and two Hindi payable labels. No real customer records or validation/test images were used to train a model. These counts do not estimate accuracy across Indian businesses.

Reproduce from the repository root after following the native model setup in README.md:

```bash
python3 scripts/ocr/amount-cases.py /tmp/rr-amount
node scripts/ocr/check-amounts.mjs /tmp/rr-amount
python3 scripts/ocr/blind-documents.py /tmp/rr-blind
node scripts/ocr/evaluate.mjs /tmp/rr-blind
node --test tests/*.test.js
```

The older evaluator's “baseline” is the preexisting text parser; the 12-case before/after JSON files separately compare the production model pipelines at b1462f0 and this revision. Run the database and UI verification commands listed in README.md. The UI harness drives OCR, owner review, purchase, stock, supplier history, GST CSV, udhaar settlement and passport. The production server also served the ₹44 local OCR demo over HTTP and rejected an unauthenticated live OCR upload. Live Supabase account and storage access were unavailable.

Public image provenance: Sakurakat, [Bill Vishwanand](https://commons.wikimedia.org/wiki/File:Bill_Vishwanand_2026-01-28.jpg), CC0, 960-pixel JPEG SHA-256 6cd46b6486a88fe0112e525523975b518e502a69a5b58596577ce3b13d071dd3. [Ezek Price Receipt](https://commons.wikimedia.org/wiki/File:Ezek_Price_Receipt_September_14,_1780_-_DPLA_-_64987a44d0fa1d540f3df44445fb4cd1.gif), 330-pixel GIF SHA-256 2e56b9223d114642356ec068507b9b738f4f348dc0c2fffd44bd990f68bf22ec, converted to PNG for the scan. See README.md for CORD attribution.
