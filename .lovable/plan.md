
## Plan: Layer 1 — Website Extraction for Brand DNA

### Overview
Automatically scrape the clinic website to extract ~40% of the Brand DNA profile fields. This reuses the existing website scraping pattern from `extract-clinic-website` but targets DNA-specific fields.

### Edge Function: `extract-brand-dna`
A new edge function that:
1. Accepts a `clinic_id` parameter
2. Looks up the clinic's website URL from the `clinics` table
3. Scrapes the homepage + key pages (about, team, services)
4. Uses AI (via Lovable AI Gateway) to extract structured DNA fields:
   - `hospital_name`, `phone`, `booking_url`, `hours`
   - `doctors` (names + credentials)
   - `services_list` (top services offered)
   - `founding_year`, `about_us_content`
   - `brand_identity` (tagline, tone, visual style cues)
5. Upserts data into `clinic_brand_dna.additional_fields` under a `website_extraction` key
6. Sets initial status to `draft` if no record exists

### Database Changes
- Add a `website_extracted_at` column to `clinic_brand_dna` to track when extraction last ran
- No new table needed — data goes into `additional_fields` JSONB

### Frontend Changes
- **BrandDNATab.tsx**: Add an "Extract from Website" button for admins/concierges that triggers the extraction
- Show extracted website data in a dedicated card section on the Brand DNA tab
- **BrandDNAForm.tsx**: Pre-fill relevant fields from website extraction data when available (e.g., show extracted info as context)

### Files to Create/Modify
1. `supabase/functions/extract-brand-dna/index.ts` — New edge function
2. `src/hooks/useBrandDNA.ts` — Add extraction mutation
3. `src/components/social/BrandDNATab.tsx` — Add extraction UI + display
4. Migration — Add `website_extracted_at` column
