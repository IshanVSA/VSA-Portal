
Plan

1. Add website-based autofill to the Add Clinic dialog
- Extend `src/pages/Clinics.tsx` with a new website URL field in the add-clinic modal.
- Add a manual action button like `Extract from Website` beside or below that field, matching your preferred flow.
- Keep all extracted values editable before saving the clinic.

2. Add an AI extraction backend for clinic details
- Create a dedicated edge function for clinic website extraction instead of reusing chat logic.
- Input: website URL only.
- Output structured fields for:
  - clinic name
  - phone
  - email if available
  - address
  - website
  - timezone inferred from address
  - optional confidence / source notes for fallback handling
- Use the project’s existing AI secret setup. Since both OpenAI and Anthropic secrets already exist, I’ll follow the existing backend pattern and keep the extraction server-side.

3. Use flexible website coverage for better accuracy
- Fetch the homepage first, then inspect relevant pages such as contact, about, location, and footer-linked pages when needed.
- Limit crawl depth/page count so extraction stays fast and predictable.
- Prefer on-site content first rather than guessing.

4. Autofill the Add Clinic form from extracted results
- Populate `clinic_name`, `phone`, `address`, website, and timezone automatically after extraction.
- If some fields are missing, leave them blank for manual completion.
- If multiple candidate values are found, prefer the most likely primary clinic/location and show a clear toast/message when results are partial.

5. Preserve manual review before save
- Do not auto-create the clinic after extraction.
- Users review and adjust extracted values, then click the normal `Add Clinic` button.
- This follows the same “review then autofill” pattern already used elsewhere in the app.

6. Update the add-clinic save path
- Include the website field in the insert payload.
- Include timezone in the insert payload so the clinic is immediately ready for timezone-based analytics.
- Reuse the current HTTPS validation pattern for website URLs.

7. Error handling and safeguards
- Validate and normalize the input URL before extraction.
- Show clear states: idle, extracting, success, partial success, failure.
- Handle blocked websites, empty extraction, AI/provider errors, and rate-limit/credits errors with user-friendly toasts.
- Keep extraction admin-only within the existing clinic creation flow.

Technical notes
- Main UI file: `src/pages/Clinics.tsx`
- New backend piece: a dedicated edge function for website extraction
- No schema change is required because `clinics` already has `website`, `address`, `phone`, `email`, and `timezone`.
- Since no Firecrawl connector is linked, the most practical implementation is:
  - fetch website content from the edge function
  - collect a few relevant pages
  - send the combined content to the AI model for structured extraction
- Timezone should be derived from the extracted address, then validated against IANA timezone values before populating the form.

Expected result
- When adding a new clinic, you paste the clinic website URL, click `Extract from Website`, and the form auto-fills the clinic’s core details.
- You can then review/edit everything and save normally.
