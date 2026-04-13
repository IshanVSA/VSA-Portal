

## Plan: Remove Blog Package Toggle, Gate on SEO Enabled

### What Changes

Remove the separate `blog_package_active` flag entirely. Blog generation will be allowed whenever SEO is enabled (`seo_enabled = true`) for a clinic.

### Implementation

**1. `src/pages/ClinicDetail.tsx`**
- Remove `"blog_package_active"` from the `ClinicAccessKey` type
- Remove the Blog Package entry from the `clinicAccessRows` array

**2. `supabase/functions/generate-blog-batch/index.ts`**
- Replace the `blog_package_active` check (lines 37-43) with a `seo_enabled` check:
  ```typescript
  if (!clinic.seo_enabled) {
    return new Response(JSON.stringify({ error: "SEO is not enabled for this clinic" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  ```

No database migration needed — the column can remain unused without harm, and removing it would be a breaking schema change for no benefit.

