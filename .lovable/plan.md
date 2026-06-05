# Google Ads Security Hardening Plan

Your org's Google Ads account was compromised. The portal stores Google OAuth refresh tokens, a Google Ads developer token, and OAuth client credentials. Anyone who still holds those secrets can keep reading/writing your Ads data even after the Google account password is reset. This plan locks that down.

## What's at risk in the portal today

1. **`GOOGLE_CLIENT_SECRET`** — used by `google-oauth`, `sync-google-ads`, `google-ads-cron`. If exfiltrated, an attacker can mint new tokens.
2. **`GOOGLE_ADS_DEVELOPER_TOKEN`** — required to call the Google Ads API. If leaked, attackers can pair it with any OAuth tokens.
3. **Stored refresh tokens** in `clinic_api_credentials.google_ads_refresh_token` (AES-256-GCM encrypted with `ENCRYPTION_KEY`). Still valid until revoked at Google — encryption only helps if `ENCRYPTION_KEY` wasn't also exposed.
4. **`google-oauth` callback** issues a 302 to whatever `origin` was passed in `state` — currently unvalidated. An attacker with the client secret could craft an OAuth flow that exfiltrates a fresh code/token to their own domain.
5. **`save-google-account`** and **`retrieve-oauth-data`** are `verify_jwt = false` and rely on in-code admin checks. Fine, but worth re-auditing.

## Plan

### 1. Rotate everything Google-side (manual, you do this in Google Cloud / Ads)
- Revoke the existing OAuth client and create a **new** OAuth Client ID + Secret in Google Cloud Console.
- Rotate the **Google Ads Developer Token** (request a new one; old one becomes unusable).
- In Google Account → Security → Third-party access, revoke all existing app grants so every stored refresh token dies.
- Re-confirm MCC user access; remove any unknown users/service accounts.

### 2. Rotate portal secrets (I'll prompt you via the secrets tool)
- `GOOGLE_CLIENT_ID` (new)
- `GOOGLE_CLIENT_SECRET` (new)
- `GOOGLE_ADS_DEVELOPER_TOKEN` (new)
- `ENCRYPTION_KEY` (new) — since old refresh tokens are now invalid anyway, re-encrypting isn't needed; we'll just clear them.

### 3. Wipe stored Google Ads credentials
Migration to null out compromised tokens so no stale data is ever used:
```sql
UPDATE clinic_api_credentials
SET google_ads_refresh_token = NULL,
    google_ads_customer_id = NULL,
    google_ads_login_customer_id = NULL,
    google_ads_account_name = NULL;
```
Every clinic will then show "Not connected" and admins reconnect using the new OAuth client.

### 4. Harden `google-oauth` edge function
- **Allow-list redirect origins.** Replace the "trust whatever `origin` is in state" behavior with a hardcoded allow-list: `portal.vsavetmedia.com`, `vet-dash-suite.lovable.app`, `*.lovable.app` preview pattern. Reject anything else and fall back to `FRONTEND_URL`.
- **Sign the `state` param** (HMAC with a server secret) instead of plain base64 JSON, so attackers can't forge `state` to bounce tokens to a different clinic or origin.
- **Require admin auth on `authorize`** — today anyone who hits `/google-oauth?action=authorize&clinic_id=...` can start a flow. Require a valid admin JWT on that route.
- **Bind state to the initiating admin user** (store `user_id` in state; verify on callback) so a leaked authorize link can't be hijacked.

### 5. Audit + tighten related functions
- `save-google-account` and `retrieve-oauth-data`: already check admin role; add rate-limit (max 10/min per user) and structured audit logging into a new `security_audit_log` table (action, user_id, clinic_id, ip, ua, timestamp).
- `sync-google-ads` / `google-ads-cron`: ensure they only run with `CRON_SECRET` (cron) or admin JWT (manual). Log every sync.

### 6. Add a one-click "Disconnect all Google Ads" admin tool
New admin-only button on the Clinics page that calls a new edge function to wipe `google_ads_*` columns across every clinic. Useful if this ever happens again.

### 7. Document recovery
Save a `mem://security/google-ads-compromise-response` runbook with the rotation order and SQL above for future incidents.

## Files that will change (build mode)

- `supabase/functions/google-oauth/index.ts` — signed state, origin allow-list, admin JWT on authorize
- `supabase/functions/save-google-account/index.ts` — audit logging
- `supabase/functions/retrieve-oauth-data/index.ts` — audit logging
- `supabase/functions/sync-google-ads/index.ts` — audit logging
- New `supabase/functions/disconnect-all-google-ads/index.ts`
- New migration: clear tokens + create `security_audit_log` table with RLS + GRANTs
- `src/pages/Clinics.tsx` (or admin settings) — "Disconnect all Google Ads" button
- New `mem://security/google-ads-compromise-response`

## Order of operations

1. You rotate Google-side credentials + developer token.
2. I add the secret prompts for the new `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `ENCRYPTION_KEY`.
3. I ship the migration (wipe tokens) + harden the edge functions + add the audit log + admin disconnect tool.
4. Admins reconnect each clinic's Google Ads through the new, hardened flow.

Confirm and I'll switch to build mode and execute steps 2–4. Let me know if you want to skip any item (e.g., signed state, audit log table) to keep the change smaller.
