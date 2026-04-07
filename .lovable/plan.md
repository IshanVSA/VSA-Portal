

## Plan: Add Brand DNA Collection to Social Media Department

### Overview
When a client opens the Social Media department for the first time (and their clinic has no DNA profile yet), they see a multi-step "Brand DNA" questionnaire instead of the normal department tabs. Once submitted, it's stored per-clinic and the normal department view loads on all future visits. Admins/concierges can view and edit the DNA profile anytime via a new "Brand DNA" tab.

### Database

**New table: `clinic_brand_dna`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| clinic_id | uuid, unique | One profile per clinic |
| status | text | `draft`, `completed`, `synthesized` |
| call_notes | jsonb | Raw answers to Q1-Q10 from the document |
| additional_fields | jsonb | Neighbourhood, voice phrases, trails, etc. |
| synthesized_profile | jsonb | AI-generated DNA profile output (Parts 1-4) |
| completeness_score | integer | 0-100 from AI synthesis |
| confidence_flags | jsonb | Flags from AI synthesis |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| submitted_by | uuid | User who submitted |

RLS: Admins full access. Concierges can insert/update/view for assigned clinics. Clients can view and update their own clinic's DNA.

### Frontend Components

**1. Brand DNA Form (`src/components/social/BrandDNAForm.tsx`)**
- Multi-step wizard (similar to existing intake form pattern)
- 10 questions from the document (Q1-Q10), each on its own step with the exact question text and helper notes from the document
- Steps: Real Differentiator, Myth/Misconception, Target Client, Founding Story, Owner Presence, Growth Priority, Content Exclusions, Community Connections, Patient Consent, Stat Holidays
- Final step: Additional fields (neighbourhood character, voice phrases, local trails, cultural communities, visual style)
- Progress bar showing completion
- Save as draft capability
- Submit button on final step

**2. Brand DNA Gate Logic (in `SocialMedia.tsx`)**
- After access check passes, query `clinic_brand_dna` for the selected clinic
- If no record exists and user is a client: show the BrandDNAForm as a full-page overlay instead of the normal tabs
- If record exists with status `completed` or `synthesized`: show normal tabs
- Admins/concierges always see normal tabs but get a new "Brand DNA" tab to view/edit the profile

**3. Brand DNA View Tab (`src/components/social/BrandDNATab.tsx`)**
- Staff-only tab showing the completed DNA profile in a readable card layout
- Edit capability for admins/concierges
- Shows completeness score with color coding (green 90-100, yellow 70-89, amber 50-69, red below 50)
- Shows confidence flags

### Question Mapping (from document)
Each question stores the client's raw answer in `call_notes` as a keyed JSON object:

```json
{
  "q1_differentiator": "Dr. Patel always calls personally the next day...",
  "q2_myth": "People think their dog's mouth is clean...",
  "q3_target_client": "Young families with first puppies...",
  "q4_founding_story": "My father started it in 1987...",
  "q5_owner_presence": "featured",
  "q6_growth_priority": "More dental cases...",
  "q7_content_exclusions": "No raw feeding content...",
  "q8_community_connections": "We work with BCSPCA...",
  "q9_patient_consent": "conditional",
  "q10_stat_holidays": "confirm_annually",
  "additional": { ... }
}
```

### Tab Changes
- Clients: Brand DNA gate appears before they can access the department
- Staff: New "Brand DNA" tab added (with Dna icon) showing profile status, answers, and edit capability

### Files to Create/Modify
1. **Migration**: New `clinic_brand_dna` table with RLS
2. **`src/components/social/BrandDNAForm.tsx`**: Multi-step questionnaire
3. **`src/components/social/BrandDNATab.tsx`**: Staff view/edit of completed DNA
4. **`src/pages/SocialMedia.tsx`**: Add gate logic + new tab for staff
5. **`src/hooks/useBrandDNA.ts`**: Hook to fetch/save DNA profile

