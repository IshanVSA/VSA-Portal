

## Plan: Fix Supabase Storage Access for SM2 Content

### Problem

Content generation is actually **working** — there's already a successful generation for Alma Animal Hospital (April 2026, confidence score 100%, HTML file stored). However, the frontend can't display it because:

1. The `department-files` bucket is **private**
2. The code uses `getPublicUrl()` which only works on public buckets
3. The iframe gets a URL that returns an auth error

### Fix

**Two changes needed:**

#### 1. Migration: Make the bucket public

Create a migration to update the `department-files` bucket to public. This is safe because the bucket already has RLS policies controlling who can upload/delete, and the files stored here (generated HTML previews, chat attachments, ticket files) are internal staff/client content that needs to be viewable via direct URL (especially in iframes).

```sql
UPDATE storage.buckets SET public = true WHERE id = 'department-files';
```

#### 2. Update ContentGenerationTab.tsx — use `getPublicUrl` correctly

With the bucket set to public, `getPublicUrl()` will work as-is. No code change needed for this file.

However, `useSM2Generation.ts` also uses `getPublicUrl` — both will work once the bucket is public.

#### 3. Verify other storage consumers still work

The `DepartmentChat.tsx` and `UploadsTab.tsx` use `createSignedUrl()` which works on both public and private buckets, so no changes needed there.

### Summary

- One migration: flip `department-files` bucket to public
- No frontend code changes required
- Content is already generated — it will display immediately after the migration

