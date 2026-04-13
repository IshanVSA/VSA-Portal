

## Plan: Build Blog Section in SEO Department (Module 11 — Sprint 1 Core)

This is a large feature based on 4 detailed specification documents. The implementation follows the Sprint 1 priority items from the Dev Workflow document, building the core blog generation pipeline, publishing panel, client portal view, and tracker within the SEO department.

### What Gets Built

A new "Blog" tab appears in the SEO department (`/seo?tab=blog`) with sub-tabs for different views (admin/concierge vs client). The system generates 3 blog posts per clinic per month using the OneURL Blog Prompt v1.7 via Anthropic API, with QA parsing, client review, and a structured publishing panel.

---

### Part 1: Database Tables (Migration)

Create all P1 tables per the Module 11 spec:

**blog_prompt_versions** — Versioned prompt storage
- id, version_label, prompt_text (TEXT), is_current (BOOLEAN), approved_by, approved_date, change_notes, generation_count

**blog_posts** — One record per monthly generation run per clinic
- id, clinic_id (FK clinics), generation_type (SCHEDULED/EMERGENCY), generation_date, blog_month_count, prompt_version_id (FK blog_prompt_versions), token_count_input, token_count_output, hospital_type_detected, jurisdiction_detected, governing_body_applied, spelling_mode, blog_1_type, blog_1/2/3_slot, blog_1/2/3_topic, blog_1/2/3_slug, blog_1/2/3_url, blog_1/2/3_status, blog_1/2/3_confirmed, qa_status, qa_issues, type_mismatch_flagged, duplicate_risk_flagged, active_hazards, high_alert_hazards, unverified_fields, generation_status, remark_round, approval_type, approval_timestamp, verification_complete, image_filename_1/2/3, publish_date_1/2/3, raw_output_text (TEXT — stores the full output), marked_published_by, marked_published_at, sitemap_ping_sent, emergency_topic

**blog_tracker** — One record per clinic, running history
- id, clinic_id (UNIQUE FK clinics), month_count, published_slugs (JSONB), cluster_data (JSONB), last_updated

**blog_client_submissions** — Client topic/content submissions
- id, clinic_id, submission_type, submission_month, submission_year, content_text, compliance_scan_result, approved_by, approved_date, fed_into_generation

Also add `blog_package_active BOOLEAN DEFAULT FALSE` to the clinics table.

RLS policies: Admin/concierge full access. Client read-only on their own clinic's blog_posts (filtered fields — no meta/schema/slug).

---

### Part 2: Edge Function — `generate-blog-batch`

New edge function (separate from SM2 `generate-sm2-content`). This is the core blog generation pipeline:

1. **Pre-generation checks** (7 checks): blog_package_active, DNA completeness, hospital_type set, governing_body confirmed, live site accessible, profile active, duplicate content baseline
2. **User message construction** — All 16 fields per spec (BLOG_MONTH_COUNT, PUBLISHED_SLUGS, CLUSTER data, PROMO, GSC queries, SM2/GBP alignment, VOICE/DNA fields, LIVE_SITE_URL)
3. **Anthropic API call** — System prompt from `blog_prompt_versions` where `is_current = true`. Model: `claude-sonnet-4-20250514`. Max tokens: 10000.
4. **Output validation** — Check word count >= 1500, QA report markers present, all 3 blogs present, generation header present
5. **QA report parser** — Extract between `--- TWO-PASS QA REPORT ---` markers. Route ALL PASS to portal, hold ISSUES FOUND
6. **Generation header parser** — Extract hospital_type_detected, jurisdiction, spelling_mode, slots, hazards. Flag type mismatches.
7. **Save** — Store full output text, metadata, token counts to blog_posts. Initialize blog_tracker if needed.

---

### Part 3: SEO Department Blog Tab UI

Add a "Blog" tab to `SeoDepartment.tsx` with sub-tabs based on role:

**Admin/Concierge sub-tabs:**
- **Overview** — Blog stats: total published this month, pending approval, generation status per clinic. Pillar calendar timeline.
- **Generate** — Manual trigger for emergency blog generation (Admin only). Shows pre-generation check status. Prompt version display.
- **Publishing Panel** — The core concierge workflow:
  - 3 blog cards per clinic per month, each with own status (PENDING/IN_PROGRESS/PUBLISHED)
  - Verification gate (phone, booking URL, hours) — copy buttons locked until all confirmed
  - Field copy panel: Post Title, SEO Title, Meta Description, Focus Keyword, URL Slug, Category, Alt Text, Getty Search Terms, Blog Body HTML (pre-processed), Schema (3 blocks), Publish Date (clinic local + IST)
  - Image filename input with [IMAGE_FILENAME] auto-replace in schema
  - Mark as Published workflow with URL input
- **Tracker** — Blog tracker per clinic showing month_count, published slugs, pillar rotation calendar
- **Prompt Manager** — Version list, upload new version, set current, rollback (Admin only)

**Client sub-tabs:**
- **My Blogs** — Current month's 3 blogs showing topic (H1), posting date, blog type label, full content as clean HTML. NO meta/schema/slug/generation data visible. Status timeline. Approve All button. Per-blog remark field.
- **Blog History** — Archive of all previously published blogs with publish date, title, live URL, blog type

---

### Part 4: Client Remark System

- Per-blog remark field with validity gate: blog selector, remark type dropdown (Remove/Add/Change wording/Factual correction/Topic change), detail text (min 20 chars)
- On submission: separate Anthropic API call for AI adjustment (max_tokens 5000)
- Post-adjustment compliance re-scan (max_tokens 1000)
- Round tracking: max 2 rounds, then lock and resume auto-approve
- New edge function `adjust-blog-remark` handling adjustment + compliance re-scan

---

### Part 5: Blog Body HTML Pre-processor

TypeScript utility (runs in the publishing panel render):
1. Strip H1:/H2:/Q:/A: labels and output markers
2. Wrap H1 in `<h1>` tags, H2 in `<h2>` tags
3. Wrap paragraphs in `<p>` tags
4. Convert `**bold keywords**` to `<strong>` tags (or `<a><strong>` when slug map exists)
5. Format FAQ Q: as bold paragraphs, A: as normal paragraphs
6. Format author line and disclaimer as `<em>` paragraphs
7. Output valid pasteable HTML for WordPress Code Editor

---

### Part 6: Prompt Storage

Insert the full OneURL Blog Prompt v1.7 (Section 01 from the uploaded document) into blog_prompt_versions as the initial current version. This is the system prompt IP — stored exactly as written, never modified without Admin approval and a new version record.

---

### Files Created/Modified

1. **Migration SQL** — Create blog_prompt_versions, blog_posts, blog_tracker, blog_client_submissions tables + add blog_package_active to clinics + RLS policies
2. **`supabase/functions/generate-blog-batch/index.ts`** — New edge function for blog generation
3. **`supabase/functions/adjust-blog-remark/index.ts`** — New edge function for remark adjustment + compliance re-scan
4. **`src/components/seo/blog/BlogTab.tsx`** — Main blog tab container with sub-tabs
5. **`src/components/seo/blog/BlogOverview.tsx`** — Stats and pillar calendar
6. **`src/components/seo/blog/PublishingPanel.tsx`** — Full publishing workflow (verification gate, copy fields, mark published)
7. **`src/components/seo/blog/BlogTracker.tsx`** — Tracker view
8. **`src/components/seo/blog/PromptManager.tsx`** — Prompt version management (Admin)
9. **`src/components/seo/blog/ClientBlogView.tsx`** — Client-facing blog review with remark system
10. **`src/components/seo/blog/BlogHistory.tsx`** — Client blog archive
11. **`src/components/seo/blog/BlogGeneratePanel.tsx`** — Manual/emergency generation trigger
12. **`src/lib/blog-html-preprocessor.ts`** — HTML pre-processing utility
13. **`src/hooks/useBlogPosts.ts`** — React Query hook for blog data
14. **`src/pages/SeoDepartment.tsx`** — Add Blog tab to tab list
15. **`src/integrations/supabase/types.ts`** — Auto-updated after migration

### Scope Notes

- Sprint 1 focus: generation, QA, client portal, basic publishing panel, tracker, prompt manager
- Email sequence (SendGrid), WordPress credential management, GSC/GA4 integration, URL confirmation pings, spot checks, and policy monitoring are deferred to later sprints per the Dev Workflow document
- Slack notifications deferred (no Slack integration exists yet)

