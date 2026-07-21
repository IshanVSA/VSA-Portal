## Problem

The Backlinks tab is now showing readable errors (good — the last fix worked), but Search Atlas is rate-limiting us at **40 requests / 60 seconds**. Both "Top Referring Domains" and "Recent Backlinks" hit the ceiling and render as empty tables with the retry-after message.

Root cause: the proxy's parameter-variant retry loop (added last turn to survive INTERNAL errors) fires up to ~5 shape permutations per tool, and pagination multiplies that further. Two detail tools × variants × pages blows past 40 calls per minute on a single tab load.

## Plan

Cut the request volume, cache what we get, and make the tab survive rate limits gracefully.

### 1. Proxy: stop the variant storm (`supabase/functions/search-atlas-proxy/index.ts`)
- Remember the **first successful parameter variant** per `(tool, site)` in an in-memory map so subsequent calls (including pagination pages 2+) skip straight to the winning shape.
- On `RATE_LIMIT` / `Retry after Xs`: stop pagination immediately, return whatever pages succeeded plus a `rateLimited: true` flag and `retryAfterSeconds`. No more retries in that request.
- Cap variant attempts at 3 (not 5+) and short-circuit on the first non-INTERNAL response.
- Add a 24-hour response cache keyed by `(tool, normalized args)` in a new `search_atlas_cache` table (JSONB payload + `expires_at`). Serve cached data on rate-limit so the tab is never blank once it has loaded once.

### 2. Hook: throttle client-side (`src/hooks/useSearchAtlas.ts`)
- Increase `staleTime` on Backlinks queries to 30 min so tab re-mounts don't refetch.
- When the proxy returns `rateLimited: true`, surface `retryAfterSeconds` to the UI instead of a generic error.

### 3. Backlinks tab (`src/components/ai-seo/SearchAtlasBacklinksTab.tsx`)
- Load the two detail tables **sequentially, not in parallel**, with a 1.5s gap so a fresh visit uses ~2 calls instead of ~10.
- When `rateLimited` is true and cached data exists, render the cached rows with a small "Showing cached results — Search Atlas rate-limited, retry in Xs" banner.
- Add a manual "Retry now" button that only enables after the retry-after countdown.

### 4. Migration
- New table `public.search_atlas_cache` (id, tool, args_hash, payload jsonb, fetched_at, expires_at) with GRANTs + RLS (service_role only; proxy reads/writes it).

## Technical notes

- Variant memoization lives in module scope in the edge function — survives warm invocations, cold-start rebuilds from cache table.
- Cache lookup happens BEFORE the MCP call; on cache hit within TTL, return immediately (zero MCP requests). Backlinks data doesn't change hourly, so 24h is safe.
- No changes to other AI SEO tabs in this plan — Backlinks first, then apply the same pattern tab by tab as you asked.
