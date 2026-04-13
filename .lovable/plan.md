

## Plan: Implement SM2 v2.1 Multi-Agent Pipeline with Hard Gates

This is a major overhaul of the content generation system, transitioning from a single monolithic AI call to an 8-agent sequential pipeline with 20 Content Safety Rules, 5 Hard Gates, and output matching the Homer Hard Gates reference format.

### What Changes

**Current state:** One edge function (`generate-sm2-content`) makes a single Anthropic API call with a ~14K token system prompt that does everything — planning, writing, compliance, art direction — in one shot. No `content_settings` concept exists anywhere in the database.

**Target state:** 8 sequential agent calls (each under 4K tokens), with a `content_settings` JSONB column on the `clinics` table, Hard Gate enforcement at the planner/fact-checker/SaaS-backstop levels, and output HTML matching the Homer reference (per-post: Hook A/B, caption, hashtags, alt text, image gen prompt with hex/font/layout/negatives, Stories sequence, concierge checklists, engagement playbook, QA tab with 12-criteria review).

---

### Part 1: Database Migration

Add `content_settings` JSONB column to the `clinics` table with default restrictive values:

```json
{
  "promotion_requested": false,
  "promotion_details": null,
  "team_spotlight_requested": false,
  "team_spotlight_member": null,
  "pricing_on_website": false,
  "pricing_in_posts": "not_requested",
  "patient_consent": "NOT_CONFIRMED",
  "end_of_life_content": "not_requested"
}
```

All existing clinics get this default (all gates blocked = safest). Backfill using `ALTER TABLE clinics ADD COLUMN content_settings jsonb NOT NULL DEFAULT '{...}'::jsonb`.

---

### Part 2: Content Settings UI (Client Preferences Tab)

Update `ContentThemeSliders.tsx` (the client "Preferences" tab) to include the 5 Hard Gate toggles alongside the existing theme sliders. Staff see all toggles; clients see theme sliders only (Hard Gates are staff-controlled since they involve consent/compliance decisions).

Also create a staff-facing "Content Settings" section in the Generation tab's preflight dialog showing the current Hard Gate states before generation.

---

### Part 3: Rewrite Edge Function — 8-Agent Pipeline

Completely rewrite `supabase/functions/generate-sm2-content/index.ts` to implement the 8-agent sequential pipeline:

| Agent | Role | Token Budget | Key Responsibility |
|---|---|---|---|
| Step 0 | SaaS DNA Assembly | 0 (code) | Pre-resolve all lookup data from DB. Build DNA payload including `content_settings`. |
| Agent 1 | The Researcher | ~2.5K | Trending topics, formats, local seasonal context. |
| Agent 2 | The Planner | ~3.5K | Plan 10 post slots as JSON. Apply Hard Gates FIRST. Content Safety Layer (20 rules). |
| Agent 3 | The Writer | ~3.5K | Write Hook A/B, full captions, hashtags, disclaimers, alt text. |
| Agent 3B | Art Director v2 | ~2K | Typography-first image gen prompts with hex codes, font names, layout %, negative instructions. |
| Agent 3C | Stories Planner | ~2K | 3-5 frame Stories sequences per post. |
| Agent 4 | Concierge Briefer | ~2.5K | Before/during/after checklists + engagement playbook. |
| Agent 5 | Fact Checker | ~2K | Verify against DNA + 20 safety rules. FAIL triggers rewrite flag. |
| Agent 6 | Reviewer | ~2K | Batch 12-criteria review. PASS/CONDITIONAL/FAIL verdict. |

Each agent is a separate Anthropic API call with a focused system prompt. Agent outputs chain into the next agent's user message.

**Hard Gate Logic (injected into Agents 2, 3, 3B, 5, 6):**
- Read `content_settings` from DNA payload
- `promotion_requested=false` → zero promo posts
- `team_spotlight_requested=false` → zero team features (references OK)
- `patient_consent≠CONFIRMED` → zero patient content
- `pricing_in_posts≠requested OR pricing_on_website=false` → zero pricing
- `end_of_life_content≠requested` → zero EOL content

**SaaS Backstop Validation** runs after Agent 6, scanning all text for keyword violations before storing.

**Model:** `claude-sonnet-4-20250514` for all agents (consistent with current).

**Async pattern:** Keep the existing `EdgeRuntime.waitUntil` background pattern. The 8 calls run sequentially within the background task (~30-60 seconds total).

---

### Part 4: HTML Output Template

The final HTML assembly (after all agents complete) produces output matching the Homer Hard Gates reference:

- **Header:** Clinic name, month, location, governing body, hospital type, Hard Gate status pills
- **Posts tab:** 10 posts with sidebar navigation. Each post shows:
  - Pillar pill, format, date, boost suggestion, fact-check status
  - Hook A + Hook B cards
  - Expandable sections: Caption, Before Posting, While Posting, After Posting, Art Director v2 (with concept/layout/type/colour/texture/neg), Stories frames, Alt Text
- **Hard Gates tab:** Shows all 5 flags and what they blocked
- **Engagement tab:** 10+ trigger-response pairs with rule references
- **QA tab:** Hard Gate verification, 12-criteria review, batch verdict

This HTML is assembled in TypeScript code (not by the AI) using the structured JSON outputs from all agents, guaranteeing consistent formatting.

---

### Part 5: Update `buildUserMessage` to Include `content_settings`

Add the `content_settings` block from the clinic's new column into the DNA payload sent to all agents, so Hard Gates are visible to every agent in the chain.

---

### Part 6: Frontend Updates

- **ContentGenerationTab.tsx:** Show Hard Gate states in preflight dialog. Display pipeline progress (which agent is running).
- **ContentThemeSliders.tsx / new ContentSettingsCard:** Staff UI to toggle the 5 Hard Gate flags per clinic.
- **HtmlPreviewDialog:** Already handles tab switching — no changes needed since the new HTML uses the same `switchTab` pattern.

---

### Files Changed

1. **Migration SQL** — Add `content_settings` JSONB to `clinics` table
2. **`supabase/functions/generate-sm2-content/index.ts`** — Complete rewrite with 8-agent pipeline, Hard Gate enforcement, SaaS backstop, structured HTML assembly
3. **`src/components/social/ContentGenerationTab.tsx`** — Show Hard Gate states, pipeline progress
4. **`src/components/social/ContentThemeSliders.tsx`** — Add Hard Gate toggles for staff
5. **`src/hooks/useSM2Generation.ts`** — Minor: update polling to handle multi-step progress if needed

### Cost Impact

~8 API calls x ~2-3.5K tokens each = ~20K total tokens per clinic/month ≈ $0.30/clinic. Down from ~14K in a single call but split across focused agents for dramatically better output quality.

