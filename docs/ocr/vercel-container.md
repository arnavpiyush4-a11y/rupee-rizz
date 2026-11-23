# Deploy the independent OCR on Vercel Containers

Use this guide on `hack-delhi/ocr-business-upgrade`. Do not merge or promote to production until the new Preview passes the checks below. No UI, receipt extraction, authentication, consent, business-workspace or Supabase code is changed by this deployment setup.

## Why the existing Preview fails

A successful ordinary Next.js deployment does not install the native `tesseract` executable or its language packs. A Dockerfile alone also does not override detected Next.js framework settings. Vercel's current [Container Runtime documentation](https://vercel.com/docs/functions/runtimes/container) says that `Dockerfile.vercel` takes precedence over framework detection. It builds the entire application as one container-backed HTTP Function, keeping frontend and API routing together.

`Dockerfile.vercel` shares the existing recipe, with port 80 as its default. The ordinary `Dockerfile` retains port 3000 for existing local Docker commands. Both install Tesseract 5 plus English, Hindi and the existing Odia pack; download the same pinned best-English model; and verify all model hashes. The native fast-English fallback is preserved. No OCR service, extraction rule, model weights, or receipt-specific output is substituted.

## Configure the Vercel Preview

1. Keep the Git production branch set to `main`; deploy this upgrade branch as Preview.
2. Set the Vercel Project Root Directory to the directory containing `package.json` and `Dockerfile.vercel`. It is the repository root when this folder is pushed as `rupee-rizz`; do not set it to a local Windows folder name.
3. Confirm the deployment detects **Container**, not the ordinary Next.js runtime. `Dockerfile.vercel` selects this automatically. If project overrides still select Next.js, choose the Container framework preset. Remove old custom Build Command/Output Directory overrides intended for `.next` output.
4. Add these environment variables for **Preview**, and configure Production separately before eventual promotion:

| Variable | When needed | Handling |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Build; restored for server runtime | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Build; restored for server runtime | Public publishable key. Existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also supported. Never use a service-role or `sb_secret_` key. |
| `RR_OCR_SIGNING_KEY` | Runtime only | Generate once with `openssl rand -hex 32`, store as a sensitive Vercel environment value, and keep stable across instances. At least 32 random characters are required. Never commit it or declare it as Docker `ARG`/`ENV`. |
| `PORT` | Runtime | Use `80`, or leave unset for this image's default. If overriding it, Vercel and the server must use that same value. |
| Existing feature secrets, e.g. `TINYFISH_API_KEY` and optional `OPENAI_API_KEY` | Runtime | Keep existing environment-specific settings. They are not needed to build the image and are never declared as build arguments. |

Vercel's [container builder](https://github.com/vercel/vercel/blob/main/packages/container/src/index.ts) forwards project build environment values as Docker build arguments. Only the three public Supabase names are declared by this recipe. Use project environment settings rather than relying solely on CLI `--build-env`; an [upstream CLI issue](https://github.com/vercel/vercel/issues/16895) documents a forwarding gap in that path. If the public values are not forwarded, the build fails with a configuration message instead of publishing a broken browser bundle. Redeploy after setting environment variables.

Next.js embeds `NEXT_PUBLIC_*` values during `next build`. Changing only runtime public variables cannot retarget the browser to another Supabase project. A generated `container-public-config.json` contains only the public URL/key and restores these values for the server. Startup rejects a conflicting runtime value. Rebuild the image for a different Preview/Production project.

The signing key is checked before the server starts and is still checked by the unchanged receipt-signing code. Missing or short keys stop startup with the variable name, never its value. Do not generate a new signing key at each container boot: pending scan tickets must work across autoscaled instances. Rotating it invalidates outstanding scan tickets, so users must rescan.

`.dockerignore` excludes env files, local build output, dependencies, credentials, private reports and local model copies. The image downloads verified model files during build. The runner receives only standalone application files, public/static assets, verified models, deployment scripts and the public configuration record. Runtime secrets are not copied into the image. `HOSTNAME` is forced to `0.0.0.0`; the original standalone server runs in PID 1 with its existing shutdown handling.

## Build and execute locally

Use Linux Docker or Docker Desktop's Linux engine. The Vercel target is `linux/amd64`. The fixture public values below are only for isolated tests; build a deployable image with the actual public values for that environment.

```bash
docker build --platform linux/amd64 -f Dockerfile.vercel \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=public-container-test-fixture \
  --target verification -t rupeerizz-ocr-verification:vercel .

# Original private photo remains outside the image and source repository.
docker run --rm \
  --mount type=bind,src=/absolute/private/receipt2zudio.jpeg,dst=/fixtures/zudio.jpeg,readonly \
  -e RR_RECEIPT_REGRESSION_IMAGE=/fixtures/zudio.jpeg \
  rupeerizz-ocr-verification:vercel

docker build --platform linux/amd64 -f Dockerfile.vercel \
  --build-arg NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  -t rupeerizz-vercel:preview .

# Supply the existing secret from the environment, not a literal in shell history.
docker run --rm -p 8080:80 -e RR_OCR_SIGNING_KEY rupeerizz-vercel:preview
```

The `verification` target runs every `tests/*.test.js`, the five-case receipt benchmark, and the real API-handler fixture with native OCR and image-bound signing. The private-photo test expects both shirt rows at 399, bag at 10, date 2026-08-31 and total 808; unknown identifiers may be blank but cannot be wrong. Authentication/consent in the handler fixture is isolated and external requests are blocked. This does not certify a live Supabase account or deployment.

The runtime target also checks native language packs and model hashes while building and again at startup. Check `/api/root`, `/api/demo/document` (bundled synthetic receipt: total 44), the home page, a `/_next/static/` asset and the bundled sample PNG from the running image. POST `/api/ocr/receipt` without a bearer token must return 401. Startup without `RR_OCR_SIGNING_KEY` must fail. Test a non-default `PORT` to verify routing overrides.

## Preview acceptance gate

The previously supplied deployment URL is an existing immutable Preview; it will not acquire these changes until this branch is redeployed. Record the new URL, deployed commit and Container build logs. Do not disable deployment protection just to automate verification.

On the new Preview:

- Confirm build logs show native Tesseract, `eng`/`hin` packs and the pinned model checks; confirm container startup succeeds.
- Sign into the existing app, grant its existing consent, and upload the original Zudio JPEG. Expect `Trent Ltd.`, 31 August 2026, two shirts at 399, carry bag 10, total 808 and category Shopping. Review ambiguous identifiers manually. Keep the original photo private.
- Confirm unauthenticated requests are rejected and a missing-consent account cannot scan. Do not bypass these guards for a public diagnostic upload endpoint.
- Confirm saving a reviewed receipt still writes to the user's private Supabase storage and account-scoped rows. Exercise the existing business workspace and another unrelated receipt.
- Check cold-start and repeated-request latency, memory, upload size, and runtime logs. Keep the same signing key during the test.
- Merge only after these live checks pass; this repository change alone is not evidence of Preview success.

## Current runtime limits and unresolved verification

Vercel's [Container Runtime](https://vercel.com/docs/functions/runtimes/container) is Beta, uses Fluid Compute and scales to zero. Preview instances scale down after 30 idle seconds, production after five minutes; SIGTERM has a 30-second grace period. OCR model initialization and cold starts must be measured on Preview. Containers are not persistent VMs; continue storing receipts and business data in Supabase. Logs are broadcast to concurrent requests, so do not log secrets, source images or raw OCR text.

Container Functions inherit [Function resource/request limits](https://vercel.com/docs/functions/limitations). Current Fluid defaults include 300-second duration; plan-specific memory and maximum durations vary. The request-body limit is 4.5 MB, including JSON/base64 overhead: the app's existing 10 MB image allowance can exceed this platform limit. The supplied Zudio photo is below it. Supporting larger uploads would require an upload-flow change, deliberately outside this UI-preserving deployment repair.

The [Container Registry](https://vercel.com/docs/container-registry/limits-and-pricing) permits 2 GB compressed layers, 15 GB total compressed image size and 2,000,000 filesystem entries before optimization. Check the actual image and Preview quotas. The current builder targets Linux amd64. Current runtime docs list Secure Compute and Static IP support and say BYOC is unsupported; older knowledge-base pages disagree about networking support, so use the runtime reference and confirm account availability.

Local Docker and handler-fixture results must be reported separately from live Preview results. A protected Vercel URL or absent authenticated deployment session prevents inspecting/deploying the new Preview; it does not justify marking it verified. No merge to main is authorized by an unverified Preview.

## Local verification results — 24 November 2026

- Both the verification target and final `Dockerfile.vercel` runtime image built successfully for Linux amd64, using Node 22 and native Tesseract 5.3.0.
- Native English, Hindi, Odia and best-English model hashes matched the existing manifests. No extraction source, UI, application dependencies or model weights were changed.
- All **112 tests passed**, including the original Zudio JPEG mounted read-only. Its exact-photo check took about 42 seconds. All five text benchmarks passed.
- The real receipt API-handler fixture returned the correct original-photo fields and three product occurrences. Anonymous, unconsented and malformed requests were rejected; signed tickets rejected different images and accounts. External requests were blocked in that isolated fixture.
- The final non-root runtime image passed HTTP checks on both port 80 and overridden port 8081, served the home page/static assets/sample PNG, rejected unauthenticated OCR, and executed native OCR on the bundled sample (total 44, quantity two).
- Missing signing-key startup failed as intended. Runtime image environment/history checks found no injected runtime secret; `/app` contained no env files. The public configuration file contained only URL/key/key-variable fields.
- The final local image measured **180 MiB uncompressed**. Registry compressed-size/entry quotas and live Function resources still require Preview confirmation.
- `npm ci` reported ten audit findings in the existing application dependency lockfile (two low, one moderate, six high, one critical). No dependency upgrades were applied in this deployment-only repair; those findings need a separate security review. The verification-tool dependency installation reported no audit findings.
- The supplied existing Preview URL redirects unauthenticated requests to **Login – Vercel**. No authenticated Vercel CLI session was available. These local results do **not** mark the live Preview, Supabase save/storage integration, or Vercel cold-start/resource behavior as verified.

Run `node scripts/deploy/check-image.mjs IMAGE_TAG` on a Docker-enabled Linux host to repeat the runtime-image checks. It creates only temporary local test containers and stops them after testing.
