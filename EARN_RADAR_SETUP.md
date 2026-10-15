# RupeeRizz Earn Radar setup and verification

Earn Radar searches public pages for potential paid work, attempts to extract source-page details through TinyFish Fetch, ranks listings with deterministic explainable rules, and screens text for common earning-scam red flags. It does not auto-apply, contact employers, make payments, or promise income.

## Required setup

1. Configure the existing Supabase values in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, or the supported legacy anon-key alias).
2. Create a TinyFish API key in the [TinyFish dashboard](https://agent.tinyfish.ai/api-keys). Set it in the server environment as `TINYFISH_API_KEY`. This variable must not start with `NEXT_PUBLIC_`.
3. Apply `supabase/migrations/0002_earn_radar.sql` in the Supabase SQL Editor after the existing `0001_rupeerizz_supabase.sql` schema. The migration creates the per-user saved-opportunity table, explicitly revokes table access from `anon`/`PUBLIC`, grants access to `authenticated`, and applies owner-scoped Row Level Security policies. Until it is applied, live search can still run, but saving/status tracking will return a clear setup error. Do not apply it blindly to a different Supabase project.
4. Start locally with Node.js 20.9 or later:

   ```bash
   npm install
   npm run dev
   ```

5. Run checks with:

   ```bash
   npm run test:earn-radar
   npm run test:receipt
   npm run test:grow
   npm run build
   ```

## Live TinyFish contract

Earn Radar uses the documented endpoints directly from the server:

- Search: `GET https://api.search.tinyfish.ai?query=...&location=IN&language=en` with `X-API-Key`.
- Fetch: `POST https://api.fetch.tinyfish.ai` with `X-API-Key`, JSON content type, and `{ "urls": ["https://..."], "format": "markdown", "purpose": "...", "per_url_timeout_ms": 20000 }`.

Official references: [Search API](https://docs.tinyfish.ai/search-api), [Search API reference](https://docs.tinyfish.ai/search-api/reference), [Fetch API](https://docs.tinyfish.ai/fetch-api), [Fetch API reference](https://docs.tinyfish.ai/fetch-api/reference), [Authentication](https://docs.tinyfish.ai/authentication).

Search makes up to six concise, category-specific queries per user submission; user goal, deadline, availability, location and experience are sent separately in the Search API `purpose` context. The first Fetch stage handles direct candidates plus up to three likely relevant job-board/category pages. Those discovery pages are never counted as jobs: Fetch requests `links: true`, extracts plausible individual listing links, then a second Fetch stage retrieves and validates the individual detail pages. Direct listing candidates and discovered candidates are deduplicated before display. The app also returns non-secret pipeline counts under `diagnostics` (raw search results, direct candidates, discovery pages fetched, discovered listing URLs, and fetched listing pages) to help distinguish API results from filtering outcomes.

Fetch supports the documented `links` boolean and returns absolute URLs in `results[].links` when enabled. See the [Fetch API reference](https://docs.tinyfish.ai/fetch-api/reference). Search's `location=IN` is the documented country code for geo-targeted results, not a domain restriction; see the [Search API reference](https://docs.tinyfish.ai/search-api/reference). The integration does not bypass authentication, robots/access controls, or restricted pages. Live requests depend on TinyFish key validity, plan limits, network access and source-site accessibility.


### Verify the migration (run in Supabase SQL Editor)

After applying `0002_earn_radar.sql`, run these read-only checks in the same Supabase project:

```sql
-- The table should exist.
select to_regclass('public.earn_radar_saved') as earn_radar_saved_table;

-- RLS should be enabled (rowsecurity = true).
select c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'earn_radar_saved';

-- Expect select/insert/update/delete policies restricted to authenticated owner rows.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'earn_radar_saved'
order by policyname;

-- Check the visible table grants. There should be no explicit anon grant.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'earn_radar_saved'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by grantee, privilege_type;
```

The migration is designed to be repeatable for its own table/index/policies, but the query results—not the presence of a local SQL file—are the evidence that the database is configured. No live Supabase database was available to inspect or modify during the source-code test run.

## Matching and safety

- Scores are deterministic and explainable (skill overlap, stated work arrangement, existence of pay text, listing date, requirements, and payout/deadline signals). They are not an estimate of hiring probability.
- The app only extracts compensation and dates when recognizable text is present. Missing information remains missing rather than being invented.
- Deadline labels distinguish explicit payout windows, unknown payout timing, and unlikely timelines. Advertised compensation is never treated as income already received or subtracted from the remaining goal.
- Scam checks are automated red-flag screening, not a fraud verdict. No detected flag does not prove legitimacy.
- Search requires the user's existing authentication and active consent. Search requests are rate limited. The TinyFish key stays server-side.
- Saved opportunity records are scoped to the signed-in user by the server and protected with Supabase RLS. Status changes are user-entered tracking only.

## Troubleshooting

- **TinyFish not configured:** Set `TINYFISH_API_KEY` in `.env.local` and in your production host's environment settings, then restart/redeploy. Do not commit the key.
- **Tracking storage not ready:** Apply `0002_earn_radar.sql` in Supabase and retry.
- **401 / consent error:** Sign in to the normal RupeeRizz account and complete the app's consent step.
- **429 / rate limit:** Wait before retrying. The app intentionally limits repeated searches and TinyFish may impose its own rate limits.
- **Few or no results:** Inspect the response `diagnostics` values in browser DevTools → Network → the `/earn-radar/search` request → Response. `rawSearchResults` counts URLs returned by Search; `directCandidates` counts usable direct candidates; `discoveryPagesFetched` counts directories inspected for links; `discoveredListingUrls` counts direct links found; `fetchedListingPages` counts second-stage page extractions. If raw results are present but all later counts are zero, review the associated warning before changing filters. Earn Radar does not show fabricated fallback listings.

## Verification notes

The Earn Radar automated tests use controlled request/response fixtures and do not prove that a live TinyFish key works. A live request can only be verified in an environment with a real `TINYFISH_API_KEY` and network access to TinyFish. Refer to `IMPLEMENTATION_REPORT.md` for the actual checks run on the delivered source copy.
