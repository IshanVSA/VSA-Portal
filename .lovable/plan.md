# SEO Blog Engine — Pipeline Rebuild

Refactor the current single-shot blog generation into the staged engine from the doc, with each stage's inputs/outputs/owner tracked and visible.

Once the plan is approved, I'll ask you to paste the OneURL Blog Prompt v2.2 + Injection Contract v1.1 text. That prompt drops into stage 4 (Write) unchanged; the surrounding stages just prepare its inputs and check its outputs.

## New engine shape

One run = one clinic × one publish-ready blog (a single cluster spoke), instead of today's 3-blogs-per-batch behaviour. Existing multi-blog rows keep working; new runs are one spoke each.

Stages (owner tag in brackets, matches the doc):

0. **Validate injection** [prompt] — fail-closed check that every load-bearing input exists.
1. **Load context** [portal] — clinic identity, jurisdiction, DNA, GBP config, cluster.
2. **Read live site** [prompt] — fetch canonical URL, extract fresh service/tone signal only (identity comes from injection).
3a. **Choose cluster + spoke** [portal + judgment] — picks the next unpublished spoke from that clinic's backlog.
3b. **SERP scan** [portal] — reads `clinic_gsc_daily` for questions/entities/queries relevant to the spoke topic.
3c. **Resolve compliance** [portal] — jurisdiction → concrete rule set (e.g. CVBC strictest tier, CAD spelling, emergency-language limits).
3d. **Allocate hazards** [portal] — month × location → required-mention hazards (heatstroke in Vancouver June, algae, etc.).
4. **Write the spoke** [prompt] — v2.2 prompt runs with the full assembled injection.
5. **Build schema** [prompt] — 5 structured-data blocks; missing pieces flagged, not faked.
6. **Independent checker** [prompt, separate call] — fresh LLM pass, no memory of the write; checks compliance, em-dashes, hazard mentions, title/desc/word-count ranges → pass or specific flags.
7. **Human gate** [human] — SEO lead verifies real-world facts (named parks, image alt, phone/link), optional vet sign-off on byline, then marks published.

## Data model

New tables (all in `public`, admin-managed, with GRANTs + RLS):

- `blog_clusters` — clinic_id, cluster_slug, cluster_name, rationale, generated_by ('ai'|'admin'), status.
- `blog_spokes` — cluster_id, clinic_id, title, angle, target_keyword, priority, status ('backlog'|'in_progress'|'published'|'retired'), assigned_month, published_post_id.
- `blog_pipeline_runs` — one row per run, tracks per-stage status/duration/error, holds the full injection JSON, SERP scan result, compliance resolution, hazard list, checker verdict, and the human-gate checklist.
- `blog_compliance_rules` — jurisdiction → rule set (seeded for CVBC/ABVMA/CVO/etc; matches existing compliance-body util).
- `blog_seasonal_hazards` — region × month → hazard list (seeded for BC/AB/ON etc, editable in admin).

Extend `blog_posts` with `run_id`, `spoke_id`, `stage_progress`, `checker_report`, `human_gate_status`, `human_gate_notes` (kept nullable so historical rows still render).

## Auto-generating clusters/spokes from DNA

On first run per clinic (or via a manual "Regenerate backlog" button in the SEO tab):
- Edge function `generate-blog-backlog` reads `clinic_brand_dna` + `clinic_gbp_config` + address + services and asks Claude Opus to produce 8–12 clusters and 30–40 spokes tailored to that clinic (species mix, city, differentiator).
- Result written to `blog_clusters` + `blog_spokes` for admin review; each row editable/removable in a new "Content Backlog" panel inside the SEO Blog tab.
- Engine's stage 3a just picks the highest-priority backlog spoke that hasn't been written this month.

## SERP scan from Search Console

Stage 3b uses `clinic_gsc_daily` (already populated by the existing GSC sync):
- Pulls last 90 days of rows for the clinic.
- Ranks queries by impressions where a query token overlaps the spoke topic (fuzzy match on lowercased tokens).
- Also surfaces "opportunity" queries (position 11–20, impressions > 0) for the spoke.
- Extracts distinct entities (query n-grams) and top pages that already rank for related terms.
- If GSC not connected → stage 3b returns an empty scan and flags the run so the human gate knows the SERP evidence is missing (not a hard fail).

## Engine execution

New edge function `blog-engine-run` replaces the monolithic worker body. `blog-worker` cron picks up pending runs and calls it. Each stage:
- writes its own row to `blog_pipeline_runs.stages[stage_key]` with `status`, `started_at`, `ended_at`, `output`, `error`;
- fails the run early if a mandatory stage errors;
- surfaces a stage-by-stage timeline in the UI.

Prompt v2.2 (which you'll paste) is stored as a new `blog_prompt_versions` row, marked current, and consumed at stage 4. Injection Contract v1.1 becomes a Zod schema in the edge function used at stage 0.

## UI

Rebuild `src/components/seo/blog/BlogTab.tsx` around three panels:

1. **Content Backlog** — clusters + spokes table, drag to prioritise, "Regenerate from DNA" button, per-spoke actions (edit, retire, generate now).
2. **Active runs** — per run: stage timeline (0→7) with owner tags, live status dots, expandable per-stage output, checker verdict, and a "Human gate" checklist (verify parks, alt text, phone, coordinates, byline) that must be fully ticked before "Mark published" enables.
3. **Published** — existing published-blog table, unchanged shape, plus a link back to the run that produced each post.

Admin-only controls; client role sees a read-only view of Backlog + Published.

## Rollout

- New tables + RLS migration.
- New/updated edge functions: `blog-engine-run`, `generate-blog-backlog`, updated `blog-worker` to dispatch to the new engine.
- New hooks: `useBlogBacklog`, `useBlogRun`, `useBlogPipelineStage`.
- `useBlogPosts` extended, not replaced — existing history keeps rendering.
- Old single-shot path stays available behind a feature flag for one week so in-flight runs finish cleanly.

## Out of scope for this pass (call out if you want them)

- Auto-publishing to WordPress (still manual via human gate).
- Image generation (schema still flags image as placeholder).
- Multi-language spokes.
