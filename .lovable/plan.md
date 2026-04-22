

## Plan: Add clinic profile picture (logo) upload

### What you'll get

A new circular profile picture slot at the top of every clinic's detail page. Anyone with access to the clinic — admin, concierge, or the client owner — can click it to upload, replace, or remove the image. The picture will also show up wherever the clinic is listed (clinic list, dashboard cards, sidebar selector) instead of the current letter avatar.

### How it works

- **Storage**: reuse the existing public `department-files` bucket under a new folder `clinic-logos/{clinic_id}/logo.{ext}` — no new bucket needed.
- **Database**: the `clinics.logo_url` column already exists. We just need to start writing to it. No migration required.
- **Permissions**: the upload component only renders for users who can already view the clinic (admins via RLS, the assigned concierge, or the owner client). Storage RLS on `department-files` is already public-read; we add an INSERT/UPDATE/DELETE policy on `storage.objects` scoped to that path so admins, the assigned concierge, and the clinic owner can write.

### UI changes

1. **New component** `src/components/clinic-detail/ClinicLogoUploader.tsx`
   - 96×96 circular avatar with hover overlay ("Change photo")
   - Click → file picker (accepts `image/png, image/jpeg, image/webp`, max 2 MB, client-side resize to 512×512)
   - Shows a small "Remove" button when a logo exists
   - Optimistic update + toast feedback
   - Uses existing `Avatar` primitive from `src/components/ui/avatar.tsx` for fallback initials when no image

2. **Mount points** (display the logo where the clinic appears):
   - `src/pages/ClinicDetail.tsx` — interactive uploader at the top of the page header, replacing the current text-only title block
   - `src/pages/Clinics.tsx` — read-only avatar in each clinic row
   - `src/components/dashboard/ClientDashboard.tsx` — replace the letter circle with the logo
   - Global clinic selector in the navbar (if present) — read-only avatar next to the name

### Files touched

**New**
- `src/components/clinic-detail/ClinicLogoUploader.tsx`
- 1 storage RLS migration (policies on `storage.objects` for the `clinic-logos/` path)

**Edited**
- `src/pages/ClinicDetail.tsx` — mount uploader in header
- `src/pages/Clinics.tsx` — show logo in list
- `src/components/dashboard/ClientDashboard.tsx` — show logo in clinic cards

### Notes

- Old logos are deleted from storage when replaced, so we don't accumulate orphans.
- Image is resized client-side before upload to keep storage small and load times fast.
- No edge function needed — the browser uploads directly to Supabase Storage using the existing client.

