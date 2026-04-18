

The user wants richer Meta (FB/IG) analytics in the Social Media department. Their app isn't verified, but Meta says Standard Access (own data / pages with roles) works without verification. The current `MetaConnectionCard` already does OAuth and `sync-meta-analytics` pulls data. Need to inspect what's currently fetched/stored vs what's possible under Standard Access, then expand.

Let me check the current sync function and analytics rendering.
<lov-tool-use id="toolu_vrtx_018kqZHG3R1T771E9DpKFF7E" name="code--view" integration-id="code" data="{\"file_path\": \"supabase/functions/sync-meta-analytics/index.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Tk6vkWZVLRthXSSWHKko9m" name="code--search_files" integration-id="code" data="{\"query\": \"FacebookInsightCard|InstagramInsightCard|meta_insights|sync-meta\", \"include_patterns\": \"src/**/*.tsx,src/**/*.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01TWWjrQQpboxhPByjGG4sux" name="code--search_files" integration-id="code" data="{\"query\": \"CREATE TABLE.*meta|meta_analytics|fb_insights|ig_insights\", \"include_patterns\": \"supabase/migrations/*.sql\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01H2xHognQoYN3SnJNjyDE2V" name="code--view" integration-id="code" data="{\"file_path\": \"supabase/functions/sync-meta-analytics/index.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_013jyarWNLsZb3Y5HWtmTPvY" name="code--search_files" integration-id="code" data="{\"query\": \"FacebookInsightCard|sync-meta-analytics|meta_page_id|instagram_business\", \"include_patterns\": \"src/**/*.tsx,src/**/*.ts\"}">
</lov-tool-use>
I have enough context. The current sync function already attempts insights but they fail without App Review. Per Meta's message, the user can keep the app in **Development Mode** and add the Page admin as a Tester to access full insights. Let me present a plan focused on enriching what we can pull and surface in the UI.

<lov-plan>

## Plan: Rich Meta analytics without App Review (Dev Mode + Standard Access)

Meta confirmed the app can stay in Development Mode and use full insight permissions as long as the calling user has a role on the app (Admin/Developer/Tester) AND a role on the Page. Our current `sync-meta-analytics` already requests the right metrics, but (a) it silently logs failures into `console.warn`, (b) it ignores per-post insights, demographics, and Instagram media-level insights, and (c) the UI only shows 4 KPI cards.

We will (1) expand the sync to pull every metric available under Standard Access + Dev-Mode tester, (2) surface failures so the user knows when a permission is missing, and (3) build a real analytics dashboard in the Social Media department.

### 1. Prerequisite (one-time, user action — documented in UI)

Add a small "Setup Requirements" callout on the Meta connection card explaining:
- App must remain in Development Mode (Live toggle OFF)
- The clinic Page admin who connects must be added as **Tester or Admin** under App Roles → Roles in developers.facebook.com
- Then click "Reconnect" to pull a fresh token with all dev-mode scopes

No code change to OAuth — existing scopes already cover what we need in dev mode.

### 2. Expand `sync-meta-analytics` (server)

Add the following Graph API calls (all work in Dev Mode for app testers):

**Facebook Page**
- `page_fans_country` & `page_fans_city` (top demographics — lifetime period)
- `page_fans_gender_age` (audience breakdown)
- Per-post insights for the 10 most recent posts: `post_impressions`, `post_impressions_unique`, `post_engaged_users`, `post_clicks`, `post_reactions_by_type_total`
- `page_video_views_paid`, `page_video_view_time`
- Negative feedback: `page_negative_feedback`

**Instagram Business**
- `audience_country`, `audience_city`, `audience_gender_age` (lifetime)
- `online_followers` (best times to post)
- Per-media insights for 10 most recent posts: `impressions`, `reach`, `engagement`, `saved`, `video_views` (for reels)
- Story insights: `impressions`, `reach`, `replies`, `exits` for last 24h stories

Key changes in the function:
- Wrap each block in try/catch and accumulate a `permissions_status` object: `{ page_insights: "ok" | "missing", post_insights: ..., ig_insights: ..., demographics: ... }`
- Return that status in the response so UI can show actionable warnings
- Store everything in `analytics.metrics_json` (no schema migration — JSONB already accommodates)

### 3. New `SocialAnalyticsTab` component (UI)

Replace the bare numbers in the SM department with a Meta Business Suite-style dashboard. Reuse `FacebookInsightCard` and add new sections:

```text
┌─ Connection status banner (green/amber based on permissions_status) ─┐
│                                                                       │
├─ Top KPI grid (4 cards) — Followers, Reach, Engagement, Impressions  ┤
├─ Trend chart (Recharts AreaChart) — 30-day reach + engagement        ┤
├─ Top Posts table — thumbnail, caption, reach, engagement, ER%        ┤
├─ Audience demographics — gender/age bar + top countries/cities      ┤
├─ Best times to post — heatmap from online_followers (IG only)        ┤
├─ Stories performance (24h) — IG only                                  ┤
└─ Last sync timestamp + Sync Now button                                ┘
```

Tabs at the top: **Overview · Facebook · Instagram · Audience**.

### 4. Files touched

- `supabase/functions/sync-meta-analytics/index.ts` — add the new Graph calls, return `permissions_status`
- `src/components/department/SocialAnalyticsTab.tsx` (new) — the dashboard
- `src/pages/SocialMedia.tsx` — wire the new tab in
- `src/components/clinic-detail/MetaConnectionCard.tsx` — add the Dev-Mode setup callout & surface `permissions_status` from sync response

### 5. What we cannot do without App Review

Even in Dev Mode, these remain unavailable: data from Pages/Instagram accounts the connecting user has no role on, ads insights for ad accounts they don't manage, comment moderation on others' posts. We'll display "Requires Business Verification" badges on those specific cards so it's transparent.

