
Plan

1. Extend clinic access settings in the database
- Add clinic-level boolean flags on `clinics` for:
  - `website_enabled`
  - `seo_enabled`
  - `google_ads_enabled`
  - `social_media_enabled`
- Keep using the existing `ai_seo_enabled` field for AI SEO.
- Default the new fields to `true` so existing clinics keep access unless an admin turns a service off.

2. Add access controls to the Add Clinic dialog
- In `src/pages/Clinics.tsx`, add a new “Service Access” section to the add-clinic modal.
- Show 5 toggle/button options:
  - Website
  - SEO
  - Google Ads
  - AI SEO
  - Social Media
- Preselect them by default so admins can disable any service while creating the clinic.
- Save those access choices together with the clinic record.

3. Reuse the same access settings in clinic management
- Update the clinic detail settings area so admins can later edit the same service-access toggles, not just AI SEO.
- Keep “Connections” for integrations, but move service availability into one consistent clinic-level access section.

4. Add a shared clinic-access hook/helper
- Create a shared access utility/hook that reads the selected clinic’s enabled flags.
- Behavior:
  - Admins bypass locks and can still open disabled departments.
  - Non-admin users see the clinic as selectable, but the department content is gated if that clinic’s service is disabled.
- This keeps the logic centralized instead of duplicating checks in each page.

5. Add locked states to each department page
- Apply the gating to:
  - `src/pages/WebsiteDepartment.tsx`
  - `src/pages/SeoDepartment.tsx`
  - `src/pages/GoogleAdsDepartment.tsx`
  - `src/pages/AiSeoDepartment.tsx`
  - `src/pages/SocialMedia.tsx`
- When disabled for the selected clinic:
  - keep the page shell and clinic selector visible
  - replace the main content with a locked card/message
  - use messaging like: “You do not have access to this service. Contact your admin to enable access.”
- For AI SEO, merge this cleanly with the existing access logic so it still respects clinic-level enablement and the admin bypass rule.

6. Keep department behavior consistent
- Do not hide the clinic from selectors.
- Do not remove routes/tabs globally.
- Only gate the selected clinic’s department content, so users understand the service exists but is unavailable for that clinic.
- Preserve current role-specific behavior where it already exists, then layer clinic access on top.

7. QA and edge cases
- Ensure new clinics default correctly.
- Ensure existing clinics remain accessible after migration.
- Verify admin bypass works.
- Verify clients/team members see the locked state for disabled clinics.
- Verify tickets/analytics/reports inside a disabled department are not reachable through the tab content.

Technical notes
- This requires a database migration because only `ai_seo_enabled` exists today.
- Best structure is to store service availability on `clinics`, since access is clinic-level and already partially modeled there.
- `useClinicSelector` likely needs to select the new fields or a companion access hook will need to fetch them for the selected clinic.
- Current AI SEO already shows a locked state, so that page can become the pattern for the other departments.
