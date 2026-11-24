# Receipt reliability and model configuration

Receipt uploads currently run local Tesseract, image preprocessing and deterministic extraction. The receipt schema and vision-merging helpers in `lib/openaiVision.js` and `lib/receiptEngine.js` are not called by the live upload route. The optional financial-insights LLM is a separate feature. No custom recognition weights have been trained, and no receipt LLM credentials are configured in the audited local environment.

The synthetic regression suite checks defined layouts and failure cases. Passing it does not establish accuracy on every phone photograph. A correct total is insufficient: names, occurrence counts, quantities, paid line amounts, taxable bases and payment evidence must also be checked. Preserve two repeated purchases as two rows. Unreadable fields must remain reviewable rather than be guessed.

## Verified repair, 23 November 2026

The owner's original Zudio JPEG was tested locally, outside the repository. The previous failure combined textured photographic margins, different skew in the header and table, misread digits, and selection logic that retained garbled rows. A matching card total incorrectly hid inconsistent product amounts. The old synthetic-only checks missed those failures.

The scanner now detects paper margins, retries page layouts, deskews the product region independently, and reads damaged numeric cells separately. It accepts cell corrections only from observed OCR candidates with corroboration and valid quantity/rate/discount arithmetic. It keeps name and price confidence separate, rejects rate-as-net fallbacks, resolves dates using independent readings, and withholds conflicting identifiers. No prices are filled by balancing a missing amount against the total. Receipt scans still call no LLM and no custom model training was performed.

The exact private-photo regression and actual receipt API-handler test returned `Trent Ltd.`, `2026-08-31`, two `MENS DENIM T-SHIRT STATEMENT` rows at 399 each, one `CARRY BAG` at 10, quantities of one, and total 808. Ambiguous product codes and invoice identifiers are left blank. The image-bound, owner-bound signed ticket and authentication/consent checks also passed. The source photo is not distributed. The complete suite passed 107 tests with that photo enabled; the text benchmark passed all five defined cases. These results describe the checked cases, not a general accuracy percentage.

The private-photo regression took about 45 seconds in the verification run. Difficult photographs invoke multiple regional and cell readings; an easy synthetic document finishes much faster. Mean OCR confidence is not a calibrated correctness probability. Review remains required.

To rerun the private test, set `RR_RECEIPT_REGRESSION_IMAGE` to the original file and run `node --test tests/receiptPhoto.test.js`. The test permits an unreadable identifier to be blank and rejects an incorrect identifier. It requires all three names, paid prices, quantities and total to match.

## Runtime settings

The server and diagnostic CLI share these optional settings. Paths are interpreted by the process running Node/Tesseract; use Linux paths when the application runs in WSL. Restart the server after changing them.

| Setting | Default | Purpose |
| --- | --- | --- |
| `RR_OCR_EXECUTABLE` | `tesseract` on PATH | Native executable path; supply an executable, not a shell command. |
| `RR_OCR_TESSDATA_DIR` | Bundled `models/ocr/best` for English when present; otherwise Tesseract's configured model location | Directory containing the selected `.traineddata` files. Other languages retain system models unless explicitly configured. |
| `RR_OCR_LANG_EN` | `eng` | English model name, for example `rr_eng`. |
| `RR_OCR_LANG_HI` | `eng+hin` | English/Hindi model combination. |
| `RR_OCR_LANG_OR` | `ori+eng` | Odia/English model combination. |

Do not silently rename or replace system models. Keep candidate weights in a separate directory and compare their hashes, full item output and latency before promotion. An explicit model directory must contain every requested component; an English-only directory does not provide Hindi or Odia.

## Try a stronger pretrained English model

Upstream documents `tessdata_best` as a slower, more accurate alternative to `tessdata_fast` on its evaluation data. That is a candidate to evaluate, not a promise about this application's receipts. See the [official model guide](https://tesseract-ocr.github.io/tessdoc/Data-Files) and [image-quality guide](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).

The following setup command downloads only the official English model from immutable upstream revision `9ddc24e750eec0994223a9edc3fcb434a2244f3b`. It verifies SHA-256 `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`, records it in `eng.manifest.json` and refuses an existing model file. An optional second argument supplies an independently recorded SHA-256 to enforce. The scanner never runs this download automatically. Models use Apache-2.0 licensing; see the [upstream repository](https://github.com/tesseract-ocr/tessdata_best).

```bash
bash scripts/ocr/best-english.sh /tmp/rr-tessdata-best
export RR_OCR_TESSDATA_DIR=/tmp/rr-tessdata-best
export RR_OCR_LANG_EN=eng
```

## Diagnose the actual private photograph

Keep photographs, reference labels and reports outside the repository or in an appropriately private local directory. The diagnostic does not upload the image or contact an LLM. It writes a new local report containing image/model hashes, extraction output and confidence. It masks recognized phone/card/UPI patterns, but output may still contain names, addresses, product information or unrecognized sensitive text. Treat the entire report as private. `--include-text` additionally records original-image PSM 6 and PSM 11 readings; these are diagnostic readings, not necessarily the final preprocessed pass selected by the scanner.

```bash
node --env-file=.env.local scripts/ocr/diagnose.mjs /private/receipt.jpg \
  --out /private/receipt-report.json --language en --include-text \
  --reference /private/receipt-expected.json
```

The output path must not already exist. A failed reference comparison returns exit status 1; bad arguments or an unwritable report return 2. Reference fields are optional and compare exactly. Repeated expected items consume distinct extracted rows. Example reference:

```json
{
  "merchant": "Trent Ltd.",
  "date": "2026-08-31",
  "total": 808,
  "items": [
    { "name": "MENS DENIM T-SHIRT STATEMENT", "price": 399 },
    { "name": "MENS DENIM T-SHIRT STATEMENT", "price": 399 },
    { "name": "CARRY BAG", "price": 10 }
  ]
}
```

Compare the actual photograph under baseline and candidate configuration using separate report paths. Also rerun unrelated receipts and the full suite. Inspect names and every paid amount; do not score only the grand total. Record runtime versions, explicit model hashes, false accepted fields, correct abstentions and latency. The diagnostic intentionally does not copy the image into the repository.

## Exercise the real upload route with isolated account fixtures

The route harness bundles the actual API handler and calls its production recognition and signing code. It substitutes only the Supabase authentication/consent client, blocks external requests and uses a process-local test signing key. No live account, database or source-image copy is required. First install the existing pinned verification dependencies, then supply the private regression image by environment variable:

```bash
npm install --prefix scripts/ocr/verification
RR_RECEIPT_REGRESSION_IMAGE=/private/receipt.jpg \
  node scripts/ocr/verification/check-receipt-route.mjs
```

This specific private regression expects Trent Ltd., 31 August 2026, total 808, two shirt rows at 399 each and a bag at 10. It also verifies that the scan ticket rejects different images and owners. Run with `--access-only` to test anonymous denial, missing consent and malformed uploads without OCR. With no image variable, access checks run and the actual-image check is explicitly skipped. A passing handler fixture does not replace live deployment checks for the installed runtime, consent state, storage and database permissions.

## Custom training

Do not train on a single receipt or mix evaluation photographs into training. First collect permissioned line images and independently checked transcriptions across vendors, fonts, devices and capture conditions. Split by vendor/template and reserve untouched evaluation data. Tesseract's [quality guide](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html) recommends addressing typical image-quality and segmentation problems before retraining.

`scripts/ocr/train.sh` is a training entry point, not a trained model. It requires an upstream `tesstrain` checkout, curated ground-truth pairs and floating-point starting weights. After independently validating a resulting `rr_eng.traineddata`, place it in a dedicated model directory, set `RR_OCR_TESSDATA_DIR` and `RR_OCR_LANG_EN=rr_eng`, then rerun the private-photo comparison and unrelated regression set before deployment. Keep the original model available for rollback. No accuracy claim or model promotion follows merely from completing training iterations.
