

## Plan: Add Blog Package Toggle to Clinic Service Access

### What Changes

Add a "Blog Package" toggle to the existing **Service Access** card on the Clinic Detail settings page (`/clinics/:id` → Settings tab). This follows the exact same pattern as the 5 existing service toggles (Website, SEO, Google Ads, AI SEO, Social Media).

### Implementation

**File: `src/pages/ClinicDetail.tsx`**

1. Add `blog_package_active` to the `ClinicAccessKey` type
2. Add a new entry to the `clinicAccessRows` array:
   ```
   { key: "blog_package_active", label: "Blog Package", description: "Enable monthly AI blog generation for this clinic" }
   ```
3. Adjust the default value logic so `blog_package_active` defaults to `false` (like `ai_seo_enabled`)

That's the only file change needed — the existing `updateClinicAccess` function and Switch component handle the rest automatically.

