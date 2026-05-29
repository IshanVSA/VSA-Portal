## Search Atlas integration in AI SEO department

### What you'll see
A new tabbed dashboard inside **AI SEO → per clinic**, pulling live from Search Atlas:

1. **Overview** — Domain Power, organic traffic estimate, visibility score, total backlinks, keywords tracked
2. **Site Audit** — Health score, total issues by severity (errors / warnings / notices), top issue list
3. **Keyword Rankings** — Tracked keywords, current position, position change, search volume, SERP feature
4. **Backlinks** — Total backlinks, referring domains, new vs lost (last 30d), top referring domains
5. **Heatmap** — Local rank tracker grid (lat/lng cells colored by ranking position) for the clinic's primary keyword
6. **LLM Visibility** — Brand visibility across ChatGPT / Perplexity / Gemini (since you mentioned "etc.")

Each card supports the existing 7d/14d/30d/90d DateRangeFilter where applicable, with empty/loading/error states matching the rest of the app.

### Per-clinic mapping
Each clinic needs to know **which Search Atlas project IDs** to query. We'll add fields to the `clinics` table:
- `search_atlas_otto_uuid` — OTTO/Site Audit project UUID
- `search_atlas_rank_tracker_id` — Rank tracker project ID (also drives heatmap)
- `search_atlas_backlink_project_id` — Backlink project ID
- `search_atlas_llm_project_id` — LLM visibility project ID (optional)
- `search_atlas_domain` — domain string (for Site Explorer-style endpoints)

A new **"Search Atlas Setup"** card on the Clinic Detail page lets you paste these IDs (with a "Fetch projects" button that lists all available projects from your account so you can pick by dropdown).

### Technical details
- **Secret**: `SEARCH_ATLAS_API_KEY` already added ✅
- **Edge function** `search-atlas-proxy`: validates JWT, takes `{ endpoint, params }`, calls `https://api.searchatlas.com{endpoint}` with `X-API-Key` header. Whitelists allowed endpoints (read-only GETs covering otto-projects, site-auditor, rank-tracker, backlink, llm-visibility, brand). Returns JSON or `extractEdgeFunctionError`-compatible error.
- **Hook** `useSearchAtlas(clinicId, endpoint, params)` — react-query wrapper, 5-min stale time, gated on whether the clinic has the relevant project ID set.
- **Components** (all in `src/components/ai-seo/`):
  - `SearchAtlasOverviewCard.tsx`
  - `SearchAtlasSiteAuditTab.tsx`
  - `SearchAtlasKeywordsTab.tsx`
  - `SearchAtlasBacklinksTab.tsx`
  - `SearchAtlasHeatmapTab.tsx` (renders the rank-tracker grid as a colored mini-map)
  - `SearchAtlasLLMTab.tsx`
- **Department gating**: existing AI SEO access lock still applies. If clinic has no Search Atlas IDs configured, show a "Connect Search Atlas" empty state with a link to the Clinic Detail setup card.
- **AI SEO tab structure**: replace the "Coming Soon" Overview with `Overview / Site Audit / Keywords / Backlinks / Heatmap / LLM Visibility / Client Chat` tabs.

### What I won't do (unless you ask)
- Won't write Search Atlas back (no creating projects/posts from our app — all read-only)
- Won't auto-create OTTO/rank tracker projects per clinic (you'll wire IDs by hand or pick from dropdown)
- Won't expose Search Atlas data to the `client` role until you confirm (admin/member only by default)

### Open question
Should the client role be able to see this data too, or is it admin/member-only? (Default: admin/member only.)