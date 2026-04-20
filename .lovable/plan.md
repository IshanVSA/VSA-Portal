

## Plan: Automate publishing of approved GBP posts

### How GBP auto-posting actually works

Approved posts in `gbp_post_history` (status `approved`) currently just sit in the "Scheduled Posts" tab as a preview. Nothing pushes them to Google. To automate this we need three pieces:

1. **Google Business Profile API access** — a separate Google API from Ads, with its own OAuth scope (`https://www.googleapis.com/auth/business.manage`).
2. **Per-clinic OAuth connection** — each clinic owner must authorize us to post to their GBP location once. We store a `refresh_token` + the GBP `account_id` and `location_id`.
3. **A scheduler** — a cron job that wakes up, finds approved posts whose scheduled date has arrived, and calls the GBP API for each one.

### ⚠ Important prerequisite (Google approval)

The Google Business Profile API is **gated** — Google must approve your project for production access (form: "Business Profile APIs access request"). Without approval, calls return 403 even with a valid OAuth token. This usually takes 1–4 weeks. We can **build everything now and test on the approved test clinic**, then flip to all clinics once Google approves you. I'll flag this clearly in the UI.

### 1. Database (one migration)

Extend `clinic_api_credentials` with GBP fields:
- `gbp_refresh_token` (text, encrypted with existing `enc:` AES-256-GCM)
- `gbp_account_id` (text) — e.g. `accounts/12345`
- `gbp_location_id` (text) — e.g. `locations/67890`
- `gbp_location_name` (text) — friendly label
- `gbp_connected_at`, `last_gbp_sync_at` (timestamptz)

Extend `gbp_post_history` with publishing state:
- `scheduled_publish_at` (timestamptz) — when to publish (auto-set when approved)
- `published_at` (timestamptz)
- `gbp_post_resource_name` (text) — Google's returned ID, used to update/delete later
- `publish_error` (text) — last failure reason for the UI
- `publish_attempts` (int, default 0)
- Add `'scheduled'`, `'failed'` to the `gbp_post_status` enum (alongside existing `published`)

### 2. Connection flow — new edge function `gbp-oauth`

Mirrors the existing `google-oauth` pattern (authorize → callback → store token):
- `?action=authorize&clinic_id=...` → redirects to Google with scope `business.manage`
- `?action=callback` → exchanges code, lists the user's GBP accounts + locations via `mybusinessaccountmanagement.googleapis.com` and `mybusinessbusinessinformation.googleapis.com`, opens a **location selection dialog** (reuse the `GoogleAccountSelectionDialog` pattern), then encrypts and stores the refresh token + selected location

New UI card: `src/components/clinic-detail/GBPConnectionCard.tsx` — sits in Clinic Detail next to the existing Google Ads / Meta cards. Shows connection state, location, "Connect / Reconnect / Disconnect".

### 3. Scheduling logic

When a staff member clicks **Approve** in `PostHistory`, we now also set `scheduled_publish_at`:
- Default schedule = **Monday of the post's `week_number`, 9:00 AM in the clinic's timezone**
- Staff can override the date/time inline on the post card before approval (small datetime picker added to `PostHistory`)
- `status` becomes `scheduled` once a publish time is set; stays `approved` only if no time is set yet

### 4. Publishing worker — new edge function `gbp-publish-cron`

Runs every 15 minutes via `pg_cron` + `pg_net` (existing pattern from `google-ads-cron` and `pagespeed-cron`):
- Selects rows from `gbp_post_history` where `status = 'scheduled'` AND `scheduled_publish_at <= now()` AND `publish_attempts < 5`
- For each post: refresh the access token, build the GBP `localPosts.create` payload (summary = `post_content`, optional CTA with `cta_text` + `cta_url`, topic type from `post_type`), POST to `https://mybusiness.googleapis.com/v4/{account}/{location}/localPosts`
- On success: set `status='published'`, `published_at=now()`, `gbp_post_resource_name=...`
- On failure: increment `publish_attempts`, save `publish_error`, set `status='failed'` after 5 attempts
- Uses `CRON_SECRET` (already configured) for auth

### 5. UI updates (small)

- **`ScheduledPosts.tsx`** — add `scheduled_publish_at` display, "Publish now" button (admin/concierge), and a status badge (`Scheduled` / `Published` / `Failed — retry`)
- **`PostHistory.tsx`** — datetime picker in the approval flow, "Republish" action for failed posts
- **`GBPConnectionCard.tsx`** — new component on Clinic Detail page
- **Banner** at the top of GBP Posts tab if the clinic has approved posts but no GBP connection: *"Connect Google Business Profile to enable auto-publishing"*

### 6. Files touched

**New**
- `supabase/functions/gbp-oauth/index.ts`
- `supabase/functions/gbp-publish-cron/index.ts`
- `src/components/clinic-detail/GBPConnectionCard.tsx`
- `src/components/clinic-detail/GBPLocationSelectionDialog.tsx`
- 1 migration (schema + cron schedule)

**Edited**
- `src/components/seo/gbp/ScheduledPosts.tsx` — schedule time + publish state
- `src/components/seo/gbp/PostHistory.tsx` — datetime picker on approve, retry button
- `src/pages/ClinicDetail.tsx` — mount `GBPConnectionCard`
- `supabase/config.toml` — register the two new functions with `verify_jwt = false`

### 7. Required from you

- **Confirm**: should we add a "Connect GBP" card on the Clinic Detail page (same place as Meta / Google Ads), or inside the GBP Posts tab itself?
- **Confirm**: default publish time = **Monday 9:00 AM clinic-local** for the post's week — sound right? (Otherwise tell me preferred default.)
- **Action you'll need to take**: submit Google's "Business Profile APIs" access form — I'll give you the exact link and pre-filled justification text in the implementation step. Until approved, auto-publishing will work only on accounts whitelisted by Google.

