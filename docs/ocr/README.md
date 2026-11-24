# Run RupeeRizz with local document OCR

This branch continues the HackDelhi business workspace. The existing Next.js API runs Sharp and native Tesseract 5 on the application host. Recognition consumes CPU and memory. Scanning calls no external inference service. Supabase still provides authentication, record storage and the private receipt bucket.

## Quick start on Windows with WSL, or on Linux

Use Node 22 and run these commands from the application directory on Debian or Ubuntu.

```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin tesseract-ocr-ori
npm ci --legacy-peer-deps
bash scripts/ocr/best-english.sh models/ocr/best
cp .env.example .env.local
openssl rand -hex 32
```

Set the generated value as the server-only `RR_OCR_SIGNING_KEY`. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for your project. Apply unapplied migrations under `supabase/migrations` in numeric order, through **0004_document_intelligence.sql**. Keep existing private keys out of Git. Start the app with `npm run dev`, then open http://localhost:3000.

With the actual public Supabase configuration set for the running app, select **See the demo → Scan sample with local OCR** for the **synthetic judge demo**. Review the ₹44 invoice and its two rice units, confirm INR, then save. Select the receipt under **Receipt evidence**, choose **purchase**, enable **Post reviewed inventory lines** and save. Open **Stock & suppliers** and **Evidence Passport**. The original invoice PNG is bundled. The application processes it with Tesseract on first use per server process. Demo records stay in page memory. Live account scans require active consent and the signing key. Production startup has no placeholder credentials; synthetic configuration is limited to isolated verification scripts.

## Deployment and engine choices

For Vercel, follow the [Container Functions deployment guide](vercel-container.md). `Dockerfile.vercel` takes precedence over ordinary Next.js detection and includes the existing native OCR engine.

Deploy the whole Next.js app on a Linux host or container with the native executable and language packs. An ordinary Vercel deployment does not provision them. The included Dockerfiles build the Next standalone server without Supabase credentials or build arguments. Supply the actual two public Supabase values and the signing key at runtime. The dynamic application layout passes only the validated public URL/key to the browser during hydration; the server's authenticated request client uses the same runtime resolver. Example from a shell with the actual deployment values set:

```bash
docker build --platform linux/amd64 -t rupeerizz .
docker run --rm -p 3000:3000 -e NEXT_PUBLIC_SUPABASE_URL -e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY -e RR_OCR_SIGNING_KEY rupeerizz
```

The native CPU engine reuses the existing server-side image pipeline. Tesseract.js was considered for browser execution, which would require shipping language packs and running a worker on each device. PaddleOCR would add a separate model runtime. No comparative speed or accuracy claim is made for either alternative. Runtime languages are English, English plus Hindi, and experimental Odia plus English. The language selector controls model selection. Requests must supply a JPEG, PNG or WebP, up to 10 MB and 24 megapixels. At most two recognitions run concurrently per Node process. Per-pass timeouts and the existing per-user rate limit apply. Test large phone images and latency on your deployment hardware.

For the exact language weights used in evaluation, run `bash scripts/ocr/models.sh /tmp/rr-models` and export `TESSDATA_PREFIX=/tmp/rr-models`. The script checks SHA-256 against the three evaluated files. Models originate from the [Tesseract tessdata_fast distribution](https://github.com/tesseract-ocr/tessdata_fast), licensed under Apache 2.0. Distribution packages may supply different model revisions. The app does not fetch models while scanning.

## Evidence and financial treatment

The API applies EXIF orientation, grayscale normalization and sharpening, reads word confidence and TSV layout, and tries quarter-turn rotations on weak scans. Processing yields an editable owner-review draft. It retains original extracted values, warnings, document hash, a private original image and reviewed values. Read the overall confidence as a mean engine word score. It is not a calibrated probability of a correct total. The signing key binds the server scan to its image and account through review. A passport compares owner records and evidence. It does not authenticate the seller or certify creditworthiness.

Owners explicitly select the transaction direction and payment. Choosing an invoice does not post revenue, purchases, debt or repayments automatically. Integer-unit stock lines must reconcile to the transaction net of entered GST before posting. The effect of multiple items is derived from one atomic ledger row. Quantity-based stock posting currently supports whole units. Record other units manually or review them before posting. Partial-credit settlements require manual handling. GST totals, components and rates are entered or reviewed by the owner.

The private original retains anything printed on it. Recognized merchant and item text use the app's masking rules. Exact image duplicates and repeated supplier/invoice identifiers are rejected within an account. Recompressed images lacking a usable invoice identifier can evade duplicate matching. Corrections keep the original scan and use a revision check and a database transaction to update a linked posting. Conflicting payment history or unbalanced stock lines reject the entire correction. Legacy records remain accessible.

## Reproduce evaluation

```bash
node --test tests/*.test.js
npm run build
sudo apt-get install -y python3-pil fonts-dejavu-core fonts-noto-core
python3 scripts/ocr/fixtures.py /tmp/rr-docs
TESSDATA_PREFIX=/tmp/rr-models node scripts/ocr/evaluate.mjs /tmp/rr-docs/unseen
npm install --prefix scripts/ocr/verification
node scripts/ocr/verification/check-database.mjs
node scripts/ocr/verification/check-workflow.mjs
```

The optional verification harness uses Node 24, PGlite for PostgreSQL and jsdom for component interaction. It invokes the real OCR route for the public demo and exercises identity/consent checks using isolated database roles. It does not use live Supabase credentials. The production image builds without the public environment variables; running the application requires their actual deployment values. The [Container guide](vercel-container.md) distinguishes current verification from historical results and describes the isolated two-configuration image check.

The generator writes three training documents plus line-image/transcription pairs, two validation documents, eight development-test documents and eight final unseen documents. Vendors are disjoint across splits. Held-out fixtures change header order, merchant names and amounts but share the generator's typography. They include rotated, blurred, low-contrast and incomplete cases. Hindi and Odia samples contain a local-script total label embedded in English text. These samples do not establish reliability for full Indic-script invoices or handwriting.

The baseline is native OCR with a single unprocessed image and the previous deterministic parser. The new system adds normalization, orientation retries, language selection and business-field extraction. Unsupported baseline fields count as misses. The measured comparison excludes paid vision providers. Raw outcomes and CPU timings are in `unseen-results.json`. Whole-document success requires exact merchant, date, total, invoice, method, document class, item count, name, quantity and line price. One incomplete document has a null reference total.

| Eight held-out synthetic images | Baseline | Local pipeline |
|---|---:|---:|
| Merchant | 7 | 8 |
| Date | 6 | 8 |
| Total, including correct abstention | 5 | 7 |
| Invoice / payment method / class, each | 0 | 8 |
| Exact item matches / eight expected | 0 | 8 |
| Whole documents | 0 | 7 |

The missed amount was on the Odia sample. The pipeline got six of seven present totals exactly right and left the incomplete total blank. Median processing time was 384 ms for the local pipeline and 335 ms for the baseline. The timings are individual runs on the evaluation host, not a production latency guarantee.

Two photographed receipt checks supplemented the generated fixtures. On the owner's Zudio sample, both versions returned ₹808. The photo was used during development and is excluded from the ZIP and held-out score. For the public [NAVER CLOVA CORD v2](https://huggingface.co/datasets/naver-clova-ix/cord-v2) test row 0, the baseline returned zero and the new engine abstained. Its label is 60,000 in the source currency. This is an Indonesian out-of-domain sample, not an INR accuracy result. Use `python3 scripts/ocr/public-sample.py /tmp/rr-public` to acquire the attributed CC BY 4.0 image and ground truth. No public or private receipt was used to train weights.

## Future recognition training

No model weights were fine-tuned. The available data was insufficient for a valid production handwriting or multilingual training claim. Collect permissioned line-image/transcription pairs, group by writer, vendor and template before splitting, and reserve untouched validation and test folds. Keep private images outside Git. Use upstream [tesstrain](https://github.com/tesseract-ocr/tesstrain) with floating-point [tessdata_best](https://github.com/tesseract-ocr/tessdata_best) starting weights. Set TESTRAIN_DIR, GROUND_TRUTH_DIR and TESSDATA_BEST, and run `bash scripts/ocr/train.sh eng` (or hin/ori). The generator's training-lines directory can exercise dataset preparation. Promote new models only after independent real-document evaluation.

The subsequent [scan reliability audit](scan-audit.md) records the updated totals parser, sparse-layout retry, production HTTP checks and fresh evaluation results.

For the current pipeline audit, configurable model paths, an optional stronger English model, private-photo diagnostics and the custom-training promotion process, see [receipt reliability and model configuration](receipt-reliability.md).
