

## Move Clinic Selector to the Navbar

Currently every department page (Website, SEO, AI SEO, Google Ads, Social Media, Reports) has its own `<ClinicSelector>` in the page header. The goal is to have one global clinic selector in the top navbar that all pages share.

### Approach

**1. Lift `useClinicSelector` state to `DashboardLayout`**
- The `useClinicSelector` hook already uses URL search params (`?clinic=...`), so it's inherently global. We just need to call it once in `DashboardLayout` and render the `<ClinicSelector>` in the top header bar.
- Place it in the navbar between the breadcrumb and the action buttons, visible on department/report pages (or always visible for simplicity).

**2. Add `<ClinicSelector>` to the navbar header**
- In `DashboardLayout.tsx`, import and render the `ClinicSelector` component in the `<header>` element (line ~405).
- Show it for admin/concierge roles always; for client role, hide it (clients have a single clinic auto-selected).
- The existing `activeClinicId` logic in DashboardLayout already reads `searchParams.get("clinic")`, so the sidebar lock indicators will continue working seamlessly.

**3. Remove `<ClinicSelector>` from each department page**
- Remove the `ClinicSelector` import and rendering from:
  - `WebsiteDepartment.tsx`
  - `SeoDepartment.tsx`
  - `GoogleAdsDepartment.tsx`
  - `AiSeoDepartment.tsx`
  - `SocialMedia.tsx`
  - `Reports.tsx`
- Each page still calls `useClinicSelector()` to get `selectedClinicId` and `selectedClinic` for data fetching — that stays. Only the UI selector moves out.

**4. Keep the clinic name subtitle in department headers**
- The department page headers currently show the selected clinic name as a subtitle (e.g., "Website / Alma Animal Hospital"). This stays — it reads from `selectedClinic?.clinic_name` which still comes from `useClinicSelector()`.

### Files Changed
- `src/components/DashboardLayout.tsx` — add ClinicSelector to header, import hook + component
- `src/pages/WebsiteDepartment.tsx` — remove ClinicSelector from page header
- `src/pages/SeoDepartment.tsx` — remove ClinicSelector from page header
- `src/pages/GoogleAdsDepartment.tsx` — remove ClinicSelector from page header
- `src/pages/AiSeoDepartment.tsx` — remove ClinicSelector from page header
- `src/pages/SocialMedia.tsx` — remove ClinicSelector from page header
- `src/pages/Reports.tsx` — remove ClinicSelector from page header

