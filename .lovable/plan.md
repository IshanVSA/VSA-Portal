

## Plan: Complete Social Media Department — Full Implementation

### Context

After reviewing all 4 documents (DNA Collection System v1.0, SM2 DNA-Aware Prompt v1.4, Concierge Operations Guide v2.0, SaaS Technical Requirements v1.0) and the current codebase, here is a gap analysis and phased implementation plan.

### What Already Exists
- Brand DNA: 3-layer collection (website extraction, review mining, collection call questionnaire with voice dictation), AI synthesis engine, auto-extraction on clinic add
- Content generation: Basic intake form + Anthropic-powered generation (non-DNA-aware, uses older prompt format)
- Content requests workflow: 5-stage lifecycle (Generated → Under Review → Approved → Client Selected → Final Approved)
- Content calendar: Monthly/list views with post inspector
- Social media overview dashboard with KPIs
- Tickets, uploads, team chat tabs
- Meta OAuth connection + analytics sync

### What Is Missing (Organized by Module from SaaS Technical Requirements)

---

### Phase 1 — DNA Profile Card Completion (Module 1)

**1a. Expand DNA profile fields in database**
- Add permanent DNA fields to `clinic_brand_dna` or a new `clinic_dna_profile` table: `HOSPITAL_TYPE`, `STAT_HOLIDAY_PROTOCOL`, `BRAND_IDENTITY` (sub-fields: primary/secondary color hex, font, logo URL, visual tone), `AFTER_HOURS_REFERRAL`, `ACCREDITATIONS`, `CONTENT_TYPE_PERMISSIONS` (multi-select from 19 pillar types), `PATIENT_CONSENT_ON_FILE`, `OWNER_PRESENCE_LEVEL`, `MULTI_LOCATION`, `CLUSTER_NEIGHBORS`, `ASSIGNED_CONCIERGE`, `CAMPAIGN_START_DATE`, `PROFILE_STATUS` (DRAFT/ACTIVE/LOCKED/OFFBOARDED), `GOVERNING_BODY_CONFIRMED`
- Add monthly signal layer fields: `CAMPAIGN_MONTH_NUMBER`, `MONTHLY_BUDGET`, `CURRENCY`, `SEASONAL_TOPICS`, `COMMUNITY_EVENTS`, `STATUTORY_HOLIDAYS`, `TOP_PERFORMER_LAST_MONTH`, `ACTIVE_PROMOTIONS`, `CLIENT_CONTENT_PREFERENCE`, `CLINIC_NEWS_THIS_MONTH`, `FACEBOOK_SPECIFIC_THIS_MONTH`, `STOCK_POST_COUNT`, `CLIENT_ASSET_POSTS_COUNT`

**1b. Locality Fetch edge function**
- New `locality-fetch` edge function using Google Places API to auto-populate: `NEIGHBOURHOOD`, `LOCAL_TRAILS_AND_PARKS`, `WILDLIFE_PROFILE`, `CULTURAL_COMMUNITIES`, `COMMUNITY_ANCHORS`, `HOUSING_CHARACTER`, `COMMUTER_PROFILE`
- Runs at onboarding alongside website extraction

**1c. Brand Identity auto-fetch enhancement**
- Enhance `extract-brand-dna` to also extract: `PRIMARY_BRAND_COLOR` (hex), `SECONDARY_BRAND_COLOR` (hex), `BRAND_FONT`, `LOGO_URL`, `VISUAL_TONE`

**1d. DNA Completeness Score (weighted 100-point system)**
- Implement the exact weighted scoring from the SM2 document (20 pts for core fields, 10 pts governing body, etc.)
- Replace the current simple percentage calculation

**1e. Admin DNA Profile Card UI**
- Full profile view in Brand DNA tab showing all permanent + monthly signal fields
- Editable fields for Admin, read-only for concierge where marked AUTO
- Vedant Review Checklist UI with checkboxes before profile activation

---

### Phase 2 — SM2 DNA-Aware Content Generation Engine (Module 2)

**2a. Replace current `generate-content` with SM2-compliant engine**
- New `generate-sm2-content` edge function that:
  - Uses the complete SM2 v1.4 system prompt (Part A) as a fixed string
  - Dynamically constructs the User Message (Part B) from the DNA profile + monthly signal layer
  - Calls Anthropic API with `claude-sonnet-4-6`, `max_tokens: 12000`
  - Returns complete HTML output with Client View + Team QA View tabs
- Pre-generation checks: DNA score above 50, CLINIC_NEWS entered, STAT_HOLIDAY_PROTOCOL set

**2b. HTML output storage**
- Save generated HTML as a file in Supabase Storage (`department-files` bucket)
- Store metadata: clinic ID, month, timestamp, model, token count, confidence score, triggering user
- File naming: `[clinic-slug]-[month-year]-social.html`

**2c. Generation trigger UI**
- "Generate Content" button on the Social Media department for concierge/admin
- Pre-flight checklist dialog confirming all required signal layer fields
- Monthly signal layer input form (CLINIC_NEWS_THIS_MONTH, FACEBOOK_SPECIFIC_THIS_MONTH)

**2d. Monthly post limit enforcement**
- Track stock posts (max 12) vs client asset posts (unlimited) per clinic per month
- Block generation beyond 12 stock posts

---

### Phase 3 — Client Delivery and Approval (Module 3)

**3a. Client portal content view**
- Render generated HTML (Client View only) in an iframe or sanitized container
- APPROVE button and feedback text field per post
- Post lifecycle timeline visible to client (Created → QA → Delivered → Approved → Scheduled → Live → Boosted)

**3b. Automated email sequence**
- Day 0: Delivery notification with portal link
- Day 3: Follow-up reminder (if no response)
- Day 5: Auto-approve trigger
- Use Supabase edge function + configured email service

**3c. Promotion module**
- Client-facing promotion entry form (offer name, inclusions, exclusions, start/end dates)
- CVBC governing body check for BC clinics
- Promotion statuses: DRAFT → ACTIVE → EXPIRED
- 15-day advance notification to client

**3d. Additional stock post request flow**
- AI strategic advisor that evaluates requests against DNA profile, compliance, cluster
- Three scenarios: Clean approval, Compliance concern with replacement, Hard violation
- Liability disclaimer checkbox

**3e. Content theme sliders (Client self-service)**
- Five theme weights (Service Awareness 25%, Clinical Education 30%, Seasonal Safety 20%, Community 15%, Promotions 10%)
- Client adjusts via sliders, saved as `CLIENT_CONTENT_PREFERENCE`

---

### Phase 4 — Scheduling and Operations (Modules 4 + 6)

**4a. IST Master Posting Schedule**
- Time zone conversion from clinic local time to IST
- Unified monthly schedule per concierge
- Auto-stagger posts within 15 minutes

**4b. Meta Ads department handoff**
- Automated alert to Ads team when concierge marks post LIVE + META AD: YES
- 24-hour escalation if no campaign setup

**4c. Onboarding flow automation**
- Sequence: brand fetch → locality fetch → review mining → governing body detection → hospital type → DNA score → assign concierge → create client portal → set campaign start
- Profile status: DRAFT → ACTIVE (after Vedant review)

**4d. Offboarding flow**
- Cancel scheduled posts, lock profile after 30 days, revoke portal access

---

### Phase 5 — Performance Intelligence (Module 5)

**5a. Meta analytics auto-capture**
- Pull engagement data 28 days after generation
- Calculate engagement rate per post, identify top performer
- Auto-populate `TOP_PERFORMER_LAST_MONTH`

**5b. Performance dashboard**
- Engagement trends per clinic, pillar type performance by market, format comparison

---

### Phase 6 — Notification System (Module 7)

- Stat holiday notifications (15-day, 10-day, 5-day sequence for CONFIRM ANNUALLY clinics)
- Promotion month reminders
- DNA gap-fill reminders (at months 3, 6)
- Hashtag refresh flags (campaign months 3, 6, 9, 12)
- Generation confidence alerts
- Brand identity update notifications
- Client asset vault notifications (WhatsApp photo auto-routing — future)

---

### Phase 7 — Client Self-Service (Module 8)

- Boost override requests
- Content theme distribution sliders
- Client asset vault (photo/video upload with consent badges: GREEN/YELLOW/RED)

---

### Recommended Build Order

Given the massive scope, I recommend building in this order:

1. **Phase 1a + 1c + 1d** — Complete the DNA profile data model (database migration + scoring fix)
2. **Phase 2a + 2b + 2c** — SM2 DNA-aware generation engine (the core value of the system)
3. **Phase 3a** — Client content review portal (render generated HTML)
4. **Phase 1b** — Locality fetch (enriches generation quality)
5. **Phase 3b + 3c** — Email automation + promotion module
6. **Phase 4c** — Onboarding flow
7. **Phase 5a** — Performance intelligence loop
8. **Phase 3d + 3e** — Advanced client self-service
9. **Phase 4a + 4b** — Scheduling + ads handoff
10. **Phase 6 + 7** — Notifications + remaining features

### Technical Notes

- The SM2 system prompt is approximately 8,000 tokens. It will be stored as a versioned record in the database so it can be updated without code changes.
- The generation engine uses `claude-sonnet-4-6` per the spec (different from the current `claude-opus-4-6` used elsewhere). However, since the allowed models list only includes specific models, we will use the closest available model.
- HTML output files will be stored in the `department-files` Supabase Storage bucket.
- The monthly signal layer will be a separate table (`clinic_monthly_signals`) that resets each month via a cron job.
- All 19 content pillar types from Q10 will be stored as an array field for multi-select permissions.

### Shall I Start?

This is a multi-week build. I recommend starting with **Phase 1a (database schema) + Phase 2a (SM2 generation engine)** as the first implementation batch, since the generation engine is the core of the entire system and everything else depends on it.

