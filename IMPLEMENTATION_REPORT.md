# Follow-up patch — search discovery pipeline (15 October 2026)

This patch updates the previously reported bug-fix ZIP after live requests made locally returned mostly job-board/category pages. It does not change the saved-opportunity database schema or compensate for blocked/unavailable sources.

## Follow-up changes

- Search query text is shorter and category-specific; detailed user constraints are passed in the Search API `purpose` field rather than forcing all constraints into the query terms.
- The service now searches up to six selected opportunity categories per submission (bounded by the app's own per-user search rate limit).
- Direct listing candidates remain subject to existing title/evidence validation.
- Up to three relevant discovery pages can be fetched with TinyFish Fetch `links: true`. They are not counted as opportunities. Links extracted from Markdown anchors or recognized individual-listing URL patterns are fetched in a second stage and independently passed through the existing listing qualification rules.
- Non-secret response diagnostics report raw search results, direct candidates, discovery pages fetched, discovered listing URLs, and listing pages extracted.
- TinyFish's documented `location=IN` parameter is retained as the India country hint. Fetch `links` support is documented at https://docs.tinyfish.ai/fetch-api/reference.

## Follow-up checks

| Check | Result |
|---|---|
| `node --check lib/earnRadarService.js` | **Passed** |
| `node --check tests/earnRadarRules.test.js` | **Passed** |
| `node --test tests/earnRadarRules.test.js` | **Passed: 30/30** (fixture-based, including discovery-page link extraction and the default TinyFish request path) |
| `node --test tests/growCalculators.test.js tests/growRules.test.js` | **Passed: 21/21** |
| `npm run test:receipt` | **Blocked:** this execution environment has an incomplete dependency install; `zod` was unavailable. |
| `npm run build` | **Not verified:** `next` was unavailable after the package-install attempt stalled. Run locally after `npm ci` completes. |
| Live TinyFish Search/Fetch | **Not verified by this ZIP build.** The user's separate direct Search test had HTTP 200 and returned results, but the updated two-stage app flow still must be tested on the user's machine. |
| Live Supabase persistence | **Not verified in this patch.** |

The fixture tests establish code behavior for known response shapes, not that all live job boards return individual listing links or that every discovered URL remains active.

---

# RupeeRizz Earn Radar bug-fix report

## 1. Issues discovered and root causes

- **Generic search results counted as jobs:** candidate selection deduplicated URLs, but the previous version did not require a specific role/project title and listing-specific evidence before creating the final opportunity list. Category pages, article/ranking pages and job-count pages could enter the result count.
- **Incorrect pay parsing (including `Rs 4.9`):** compensation was previously represented as a loosely extracted display string, with no structured salary-context validation or retained evidence. Currency-looking values could be confused with ratings or unrelated quantities.
- **Unclear saved-opportunity failure states:** Supabase errors were not consistently classified into missing migration, RLS/permission denial, and general storage/configuration problems. The database flow was source-implemented but could not be live-verified without project credentials.
- **Additional edge cases tightened:** page extraction could return a short access-denied/bot challenge and be mistaken for useful extraction; URL normalization stripped generic `ref`/`source` query parameters even though those may identify a listing; explicit beginner experience was not penalized for clear senior-level requirements.

## 2. Changes implemented

- The follow-up patch replaces oversized, overly specific search phrases with concise category-specific queries and passes user context through TinyFish Search `purpose`. It makes up to six queries (bounded, one per selected category) per submission.
- Candidate filtering rejects obvious category/search pages, vacancy counts, broad freelance listings and ranking/article pages as opportunities, but the follow-up patch may fetch up to three relevant discovery pages with `links: true` to find direct listing links. Extracted direct pages are then checked for individual-role evidence. Result counts now reflect distinct qualifying candidates only; generic-only responses return zero, with no fabricated fallback opportunities.
- Canonical URL handling removes common tracking parameters while preserving potentially meaningful `ref` and `source` parameters. Duplicate candidates are de-duplicated on canonical URLs.
- Page access-denied/login/captcha text is no longer treated as a successful extraction. Partial query failures remain visible even when another query returns only generic pages, and API inputs have bounded skills/category arrays. A candidate can still be shown on specific listing evidence in the search snippet, clearly marked as snippet-only and not independently verified.
- Compensation parsing returns structured amounts/ranges, original currency, payment basis, display text, source evidence, and confidence. It requires salary/payment context, rejects ratings/counts and ambiguous unrelated figures, and does not convert currencies. `Rs 4.9` has direct regression coverage.
- Deadline and match rules remain deterministic; explicit beginner experience incurs an explainable penalty when a result clearly requires senior/5+ years experience. Payout timing that is absent remains unknown; compensation never counts as money already received.
- Saved-item POST now rejects records not explicitly classified as individual opportunity candidates. Supabase error responses distinguish migration-required (503), permission/RLS denial (403), and general storage unavailability (503), and do not echo raw database details. Duplicate concurrent saves re-read the existing user-owned record.
- The migration explicitly revokes table access from `anon` and `PUBLIC`, grants table operations to `authenticated`, enforces RLS ownership policies, and includes URL uniqueness and indexes. Server-side save requests accept only records explicitly classified as individual opportunities; permission-denied responses are separated from configuration/migration errors. It was not applied to a live database.
- UI status separates listing candidates from independently verified jobs, displays compensation evidence and missing-data messages, and shows an unavailable saved count if the database read fails.

## 3. Tests and verification actually run

| Check | Result |
|---|---|
| `npm run test:earn-radar` | **Passed: 29/29 tests.** Includes salary/rating parsing, targeted query details, generic-only search, URL deduplication/canonicalization, access-wall handling, fraud flags, deadline scoring, API fixture parsing, storage error classification, save-shape guard, and migration policy checks. TinyFish requests are fixture-based, not live. |
| `npm run test:grow` | **Passed: 21/21 tests.** Existing Grow Savings regression tests. |
| `npm run test:receipt` | **Blocked before tests ran:** the environment lacks the installed `zod` dependency (`ERR_MODULE_NOT_FOUND`). |
| `npm run build` | **Blocked:** `next` is not installed (`next: not found`). The earlier dependency installation attempt failed because DNS could not resolve `registry.npmjs.org`. |
| `node --check` | **Passed** for the changed server-side modules and Earn Radar test file. |
| TypeScript parser syntax pass | **Passed:** 132 JS-family files parsed with zero syntax diagnostics; a full Next.js compiler/build was not available. |
| SQL source assertions | **Passed** in fixture tests for user ownership RLS, unique `(user_id, source_url)`, and explicit table-grant revocation. This validates source text only, not execution against Supabase. |

## 4. TinyFish verification status

- **Implementation:** server-side Search and Fetch calls use the documented endpoints and `X-API-Key` header. Fetch is bounded to the configured candidate count and uses timeouts.
- **Automated fixtures:** passed for successful response parsing, generic-only result rejection, empty/malformed responses, rate limits, and timeouts.
- **Live Search/Fetch:** **not verified; no genuine request succeeded during this run.** No valid `TINYFISH_API_KEY` was configured in the test environment. Do not treat the fixture tests as proof of live access.

## 5. Supabase verification status

- The source migration and client-side/API ownership assumptions were inspected; RLS policies restrict reads/writes to `auth.uid()`, and user-scoped API queries also filter by the authenticated user ID.
- The SQL file is designed to be repeatable for the table/index/policy definitions and includes explicit grants/revokes. `EARN_RADAR_SETUP.md` includes read-only SQL queries to verify table existence, RLS and policies after applying it.
- **Live persistence is unverified.** No database credentials were present and the migration was not applied. A real save → reload → status update → delete test still needs to be run against a development Supabase project.

## 6. Remaining limitations / manual setup

1. Configure `TINYFISH_API_KEY` in local `.env.local` and the production host's server-side environment; never use a `NEXT_PUBLIC_` prefix.
2. Apply `supabase/migrations/0002_earn_radar.sql` to the intended Supabase project after the existing base schema, then run the verification queries in `EARN_RADAR_SETUP.md`. If this migration was already run, inspect the live schema before making manual changes.
3. When package registry access is available, install dependencies and rerun `npm run test:earn-radar`, `npm run test:grow`, `npm run test:receipt`, and `npm run build`.
4. Perform an authenticated/consented browser smoke test, plus live TinyFish Search/Fetch and Supabase save/read/update/delete checks. These could not be performed here.
5. Search results and extraction can remain incomplete or wrong; a qualifying record is an actionable-looking candidate, not independent verification of an active opening, hiring decision, or payment.
6. Rate limiting is in-process memory and does not coordinate counts across separate serverless instances.

## 7. Files changed or added for this fix

- `lib/earnRadarService.js`
- `lib/earnRadarRules.js`
- `lib/earnRadarPersistence.js`
- `app/api/[[...path]]/route.js`
- `components/rupee/views/EarnRadarView.js`
- `supabase/migrations/0002_earn_radar.sql`
- `tests/earnRadarRules.test.js`
- `EARN_RADAR_SETUP.md`

The existing receipt and Grow Savings source were preserved. No Git branch, remote push, deployment, or live database mutation was performed.
