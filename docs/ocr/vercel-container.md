# Deploy the independent OCR on Vercel Containers

Use this guide on `hack-delhi/ocr-business-upgrade`. Keep this fix on the feature branch; merging into `main` is a separate decision. The runtime configuration change preserves the existing UI, receipt extraction, authentication/session behavior, consent, business workspace and Supabase integration.

## Why the Container build fails

The Container build now runs, but the former `build-public-config.mjs` step required public Supabase values inside Docker's build environment. Configuring variables for Vercel Preview does not prove that a particular container build receives them as Docker `ARG` values. Vercel's [container builder](https://github.com/vercel/vercel/blob/main/packages/container/src/index.ts) converts `meta.buildEnv` into build arguments; an [open upstream issue](https://github.com/vercel/vercel/issues/16895) and [proposed fix](https://github.com/vercel/vercel/pull/16897) document a gap for CLI `--build-env` values arriving through `config.build.env`. That issue does not establish the cause of every Dashboard-variable failure, and changing Dockerfile declarations cannot supply values absent from the builder input. This image no longer depends on that forwarding path.

The existing `Dockerfile.vercel` and `"framework": "container"` setting remain appropriate. Vercel's [Container Runtime documentation](https://vercel.com/docs/functions/runtimes/container) says that `Dockerfile.vercel` takes precedence over framework detection. It builds the entire application as one container-backed HTTP Function, keeping frontend and API routing together. The native executable and language packs are included in the image.

`Dockerfile.vercel` shares the existing recipe, with port 80 as its default. The ordinary `Dockerfile` retains port 3000 for existing local Docker commands. Both install Tesseract 5 plus English, Hindi and the existing Odia pack; download the same pinned best-English model; and verify all model hashes. The native fast-English fallback is preserved. No OCR service, extraction rule, model weights, or receipt-specific output is substituted.

## Configure the Vercel Preview

1. Keep the Git production branch set to `main`; deploy this upgrade branch as Preview.
2. Set the Vercel Project Root Directory to the directory containing `package.json` and `Dockerfile.vercel`. It is the repository root when this folder is pushed as `rupee-rizz`; do not set it to a local Windows folder name.
3. Confirm the deployment detects **Container**, not the ordinary Next.js runtime. `Dockerfile.vercel` selects this automatically. If project overrides still select Next.js, choose the Container framework preset. Remove old custom Build Command/Output Directory overrides intended for `.next` output.
4. Add these environment variables for **Preview**, and configure Production separately before eventual promotion:

| Variable | When needed | Handling |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Runtime only | Actual public Supabase project URL for this deployment. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Runtime only | Actual public publishable key. Existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also supported; the publishable variable takes precedence. Never use a service-role or `sb_secret_` key. |
| `RR_OCR_SIGNING_KEY` | Runtime only | Generate once with `openssl rand -hex 32`, store as a sensitive Vercel environment value, and keep stable across instances. At least 32 random characters are required. Never commit it or declare it as Docker `ARG`/`ENV`. |
| `PORT` | Runtime | Use `80`, or leave unset for this image's default. If overriding it, Vercel and the server must use that same value. |
| Existing feature secrets, e.g. `TINYFISH_API_KEY` and optional `OPENAI_API_KEY` | Runtime | Keep existing environment-specific settings. They are not needed to build the image and are never declared as build arguments. |

Set these values through Vercel's project environment settings for Preview, checking any branch-specific overrides. [Environment changes apply only to new deployments](https://vercel.com/docs/environment-variables), so redeploy this branch after updating them. Supply the real public values at runtime; do not substitute example credentials in a deployed app. No public or private Supabase value is required by `docker build`.

### Matching browser and server configuration

[Next.js normally embeds direct `process.env.NEXT_PUBLIC_*` references during `next build`](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser). Its documentation supports reading runtime values during dynamic rendering and providing those values to the client during initialization. This application implements that path instead of patching compiled JavaScript or using the deprecated `publicRuntimeConfig` option.

`lib/supabase/public-config.js` reads the runtime environment through an environment object, validates it, and returns only `{ url, key }`. `app/layout.js` uses `force-dynamic`, resolves those values on the server for each render, and passes them to `Providers` through React props. React handles serialization for hydration; private environment values are not passed. `Providers` initializes the existing browser singleton before child effects or API calls need it. The client retains its existing persistent session, PKCE, URL-session detection and storage settings, and rejects a configuration change after initialization.

The server's `createRequestClient()` uses the same resolver and runtime environment for each authenticated request. It retains the end user's bearer token and Row Level Security behavior. Neither client reads a Supabase URL/key frozen into the browser build. The same credentialless image can therefore run with different actual public settings in separate environments. No `container-public-config.json` is generated or shipped, and the former build-time configuration script is removed.

Container startup validates the public configuration before starting Next. Missing values, malformed or credential-bearing URLs, private keys, and values that are neither publishable keys nor legacy anon JWTs fail startup without printing their values. There is no production fallback URL or key.

The signing key is checked before the server starts and is still checked by the unchanged receipt-signing code. Missing or short keys stop startup with the variable name, never its value. Do not generate a new signing key at each container boot: pending scan tickets must work across autoscaled instances. Rotating it invalidates outstanding scan tickets, so users must rescan.

`.dockerignore` excludes env files, local build output, dependencies, credentials, private reports and local model copies. The image downloads verified model files during build. The runner receives standalone application files, public/static assets, verified models, deployment scripts and the shared public-configuration resolver. Runtime secrets and environment-specific public settings are not copied into the image. `HOSTNAME` is forced to `0.0.0.0`; the original standalone server runs in PID 1 with its existing shutdown handling.

## Build and execute locally

Use Linux Docker or Docker Desktop's Linux engine. The Vercel target is `linux/amd64`. Build both targets without credentials or public configuration arguments:

```bash
docker build --platform linux/amd64 -f Dockerfile.vercel \
  --target verification -t rupeerizz-ocr-verification:vercel .

# Original private photo remains outside the image and source repository.
docker run --rm \
  --mount type=bind,src=/absolute/private/receipt2zudio.jpeg,dst=/fixtures/zudio.jpeg,readonly \
  -e RR_RECEIPT_REGRESSION_IMAGE=/fixtures/zudio.jpeg \
  rupeerizz-ocr-verification:vercel

docker build --platform linux/amd64 -f Dockerfile.vercel \
  -t rupeerizz-vercel:preview .

# Export the actual deployment values in your shell first.
# Forward their names rather than putting credentials literally in shell history.
docker run --rm -p 8080:80 \
  -e NEXT_PUBLIC_SUPABASE_URL -e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  -e RR_OCR_SIGNING_KEY rupeerizz-vercel:preview

# Isolated checks; this command does not contact a live Supabase project.
node scripts/deploy/check-image.mjs rupeerizz-vercel:preview

# Linux Docker host: also load actual production Next scripts in the isolated
# jsdom fixture, navigate to the business demo, and run its native sample scan.
node scripts/deploy/check-image.mjs rupeerizz-vercel:preview \
  --browser-image rupeerizz-ocr-verification:vercel
```

For a legacy anon key, replace `-e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with `-e NEXT_PUBLIC_SUPABASE_ANON_KEY`. Forward any other existing feature secrets needed by your deployment separately. The ordinary `Dockerfile` uses the same runtime strategy and defaults to port 3000.

The `verification` target runs every `tests/*.test.js`, the five-case receipt benchmark, and the real API-handler fixture with native OCR and image-bound signing. The private-photo test expects both shirt rows at 399, bag at 10, date 2026-08-31 and total 808; unknown identifiers may be blank but cannot be wrong. Authentication/consent in the handler fixture is isolated and external requests are blocked. This does not certify a live Supabase account or deployment.

The runtime target also checks native language packs and model hashes while building and again at startup. `check-image.mjs` starts temporary local containers with explicitly isolated synthetic public fixtures and random signing/feature keys. It uses the same image with two different configurations, including the legacy anon-key path and a non-default port, and checks that each uncached HTML response contains only its own public values. These test fixtures are supplied by the check script, are never production defaults, and do not verify real Supabase authentication or storage.

The script also checks Tesseract 5 and the `eng`/`hin`/`ori` packs, `/api/root`, `/api/demo/document` (bundled synthetic receipt: total 44, quantity two), the home page, a `/_next/static/` asset and the bundled sample PNG. Anonymous OCR must return 401. Missing signing/public configuration and private public-key inputs must fail startup. The image must contain no env files, baked public configuration record, or injected runtime secrets; immutable JavaScript must not contain the runtime values. Temporary containers are stopped after testing.

The optional `--browser-image` check uses the verification image's existing jsdom dependencies and loads the actual built Next scripts over local HTTP. It checks hydration, landing-to-demo navigation, and the sample scan under both runtime configurations, while blocking external network requests and failing on JavaScript errors. It stubs browser layout/font APIs, so it does not certify visual rendering or a live Supabase sign-in.

## Preview acceptance gate

The previously supplied deployment URL is an existing immutable Preview; it will not acquire these changes until this branch is redeployed. Record the new URL, deployed commit and Container build logs. Do not disable deployment protection just to automate verification.

On the new Preview:

- Confirm the deployed commit includes this fix, the credentialless Container build succeeds, and logs show native Tesseract, `eng`/`hin`/`ori` packs and the pinned model checks. Confirm startup receives the actual Preview public settings and signing key.
- Confirm the home-page HTML/hydration contains the expected public URL/key, is not publicly cached, and contains no private key. Confirm the browser uses that project when signing in and the authenticated API still uses the same project.
- Check `/api/demo/document` returns the bundled receipt with total 44 and quantity two; confirm the sample image and static assets load.
- Sign into the existing app, grant its existing consent, and upload the original Zudio JPEG. Expect `Trent Ltd.`, 31 August 2026, two shirts at 399, carry bag 10, total 808 and category Shopping. Review ambiguous identifiers manually. Keep the original photo private.
- Confirm unauthenticated requests are rejected and a missing-consent account cannot scan. Do not bypass these guards for a public diagnostic upload endpoint.
- Confirm saving a reviewed receipt still writes to the user's private Supabase storage and account-scoped rows. Exercise the existing business workspace and another unrelated receipt.
- Check cold-start and repeated-request latency, memory, upload size, and runtime logs. Keep the same signing key during the test.
- Record the live results separately. This repository change alone is not evidence of Preview success, and this fix does not authorize a merge into `main`.

## Current runtime limits and unresolved verification

Vercel's [Container Runtime](https://vercel.com/docs/functions/runtimes/container) is Beta, uses Fluid Compute and scales to zero. Preview instances scale down after 30 idle seconds, production after five minutes; SIGTERM has a 30-second grace period. OCR model initialization and cold starts must be measured on Preview. Containers are not persistent VMs; continue storing receipts and business data in Supabase. Logs are broadcast to concurrent requests, so do not log secrets, source images or raw OCR text.

Container Functions inherit [Function resource/request limits](https://vercel.com/docs/functions/limitations). Current Fluid defaults include 300-second duration; plan-specific memory and maximum durations vary. The request-body limit is 4.5 MB, including JSON/base64 overhead: the app's existing 10 MB image allowance can exceed this platform limit. The supplied Zudio photo is below it. Supporting larger uploads would require an upload-flow change, deliberately outside this UI-preserving deployment repair.

The [Container Registry](https://vercel.com/docs/container-registry/limits-and-pricing) permits 2 GB compressed layers, 15 GB total compressed image size and 2,000,000 filesystem entries before optimization. Check the actual image and Preview quotas. The current builder targets Linux amd64. Current runtime docs list Secure Compute and Static IP support and say BYOC is unsupported; older knowledge-base pages disagree about networking support, so use the runtime reference and confirm account availability.

Local Docker and handler-fixture results must be reported separately from live Preview results. A protected Vercel URL or absent authenticated deployment session prevents inspecting/deploying the new Preview; it does not justify marking it verified. No merge to main is authorized by an unverified Preview.

## Historical verification before the runtime-configuration fix — 24 November 2026

The following results describe the earlier build-time configuration implementation. They are preserved as historical evidence and are superseded for configuration behavior by the runtime strategy above. They do **not** establish that the current fix has built or passed its new checks.

- Both the verification target and final `Dockerfile.vercel` runtime image built successfully for Linux amd64, using Node 22 and native Tesseract 5.3.0.
- Native English, Hindi, Odia and best-English model hashes matched the existing manifests. No extraction source, UI, application dependencies or model weights were changed.
- All **112 tests passed**, including the original Zudio JPEG mounted read-only. Its exact-photo check took about 42 seconds. All five text benchmarks passed.
- The real receipt API-handler fixture returned the correct original-photo fields and three product occurrences. Anonymous, unconsented and malformed requests were rejected; signed tickets rejected different images and accounts. External requests were blocked in that isolated fixture.
- The final non-root runtime image passed HTTP checks on both port 80 and overridden port 8081, served the home page/static assets/sample PNG, rejected unauthenticated OCR, and executed native OCR on the bundled sample (total 44, quantity two).
- Missing signing-key startup failed as intended. Runtime image environment/history checks found no injected runtime secret; `/app` contained no env files. The public configuration file contained only URL/key/key-variable fields.
- The final local image measured **180 MiB uncompressed**. Registry compressed-size/entry quotas and live Function resources still require Preview confirmation.
- `npm ci` reported ten audit findings in the existing application dependency lockfile (two low, one moderate, six high, one critical). No dependency upgrades were applied in this deployment-only repair; those findings need a separate security review. The verification-tool dependency installation reported no audit findings.
- The supplied existing Preview URL redirects unauthenticated requests to **Login – Vercel**. No authenticated Vercel CLI session was available. These local results do **not** mark the live Preview, Supabase save/storage integration, or Vercel cold-start/resource behavior as verified.

## Verification of the current fix

The following checks passed locally for the runtime-configuration fix on 24 November 2026:

- Both the final `Dockerfile.vercel` runtime image and the fresh `verification` target built for Linux amd64 without build arguments, public configuration or private credentials.
- The fresh verification image ran **112 tests: 111 passed, none failed, one skipped** because the optional original private receipt photo was unavailable. All five receipt benchmarks passed. The actual API-handler fixture passed its authentication, consent and malformed-request checks; its private-photo extraction check was skipped for the same reason. Historical exact-photo results above are not a rerun of that check.
- The same **180 MiB** non-root runtime image passed `check-image.mjs` with a publishable-key fixture on port 80 and a different legacy anon-key fixture on port 8081. Each home-page HTML response contained only its own runtime public URL/key and used `no-store`. Static assets and the bundled sample PNG loaded, anonymous OCR returned 401, and `/api/demo/document` executed native OCR with total **44** and item quantity **two**.
- Native **Tesseract 5.3.0**, the `eng`/`hin`/`ori` language packs, and all four existing model hashes passed verification. Missing signing/public configuration and private Supabase public-key inputs correctly rejected startup. Image checks found no env files, baked public configuration record or injected runtime secrets; the inspected immutable JavaScript did not contain runtime configuration values.
- The optional production-script hydration check passed under **both** runtime configurations. Actual Next scripts hydrated the runtime props, left the splash, navigated from the landing page to the business demo and scanned the sample (total 44, quantity two), with no JavaScript errors or external requests. This used jsdom with layout/font stubs, not a visual browser review or live Supabase account.
- The unchanged application lockfile still reported ten npm audit findings (two low, one moderate, six high, one critical). The verification dependencies reported none. No dependency versions were changed.

Live Vercel Container build, actual Preview variable delivery, authenticated Supabase sign-in/save/storage behavior and cold-start/resource checks remain incomplete until recorded against the new deployed commit and URL. No authenticated Vercel CLI session or linked local project was available. The isolated local fixture checks do not establish those live outcomes.
