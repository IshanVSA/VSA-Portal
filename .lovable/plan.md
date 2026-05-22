## Goal
Simplify the Content Request form so clients only enter campaign details, then an AI agent generates a structured preview (Title, Description, Caption, CTA) they can review and edit before submitting. No category selection, no prefilled placeholders, veterinary social-media context baked into the backend.

## Changes

### 1. `src/components/department/ticket-forms/ContentRequestForm.tsx` (rewrite)
- Remove the category dropdown and all `CATEGORIES` default title/description/notes prefill logic.
- New, simpler field layout:
  - **Campaign / Promotion details*** (textarea — required, the only thing the client must fill, e.g. "Free Exam With Any Vaccination")
  - **Additional notes** (textarea — optional: dates, audience, tone)
  - **Generate Preview** button (primary action, disabled until campaign details are non-empty)
  - After generation, show an editable preview card with four fields, all initially empty until generation completes:
    - Post Title
    - Post Description
    - Suggested Caption / Script
    - CTA
  - "Regenerate" button to re-run the AI with the same input.
- Voice dictation kept (maps into Campaign details / Notes only).
- `onChange` payload sent to the parent ticket becomes a clean block:
  ```
  Content Request (Social Media):
  Campaign: ...
  Notes: ...
  --- AI Preview ---
  Title: ...
  Description: ...
  Caption: ...
  CTA: ...
  ```
- Accept new prop `clinicId` so the AI call can include the clinic name (passed from `NewTicketDialog.renderCustomForm`).

### 2. `src/components/department/NewTicketDialog.tsx`
- Pass `clinicId` to `<ContentRequestForm />` (line 333).
- No other behavior changes.

### 3. New edge function `supabase/functions/generate-content-preview/index.ts`
- Auth: validates the caller's JWT (same pattern as `extract-ticket-fields`).
- Input: `{ clinic_id, campaign: string, notes?: string }`.
- Loads clinic name from `clinics` table for context.
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a system prompt hard-coded to:
  - Industry: **Veterinary / Animal Hospital Marketing**
  - Content type: **Social Media Post**
  - Return strict JSON via tool calling: `{ title, description, caption, cta }`.
  - No emojis, no em-dashes (matches existing social-caption rules in project memory).
- Handles 429 / 402 from the gateway and surfaces friendly errors.
- Register in `supabase/config.toml` with `verify_jwt = false` (in-code auth check, matching project convention).

### 4. Wire the frontend to the new function
- `ContentRequestForm` calls `supabase.functions.invoke('generate-content-preview', { body: { clinic_id, campaign, notes } })`.
- On success: populate the four preview fields (editable).
- On error: toast via `extractEdgeFunctionError` helper.

## Out of scope
- No changes to ticket creation/submission flow, routing, RLS, or the existing monthly `generate-content` calendar pipeline.
- No changes to other ticket-type forms.
- No DB schema changes — the AI preview is stored as plain text inside the ticket description, same as today.

## Technical notes
- Uses `LOVABLE_API_KEY` (already provisioned). No new secrets required.
- Reuses existing `VoiceDictation` component; only the field mappings change.
- The form remains usable across departments since the dialog only renders it for `ticketType === "Content Request"`, but the copy and AI context are explicitly social-media + veterinary per the spec.