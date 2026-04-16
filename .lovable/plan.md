

## Store Client IP on Terms Accept/Decline

### Current State
- `terms_acceptance_log` has an `ip_address` column (already exists, always NULL)
- `terms_decline_log` has NO `ip_address` column
- Neither the accept nor decline code captures IP -- the browser cannot reliably determine the user's public IP

### Approach
Use a lightweight public IP lookup from the client side before inserting the record. This avoids needing a custom edge function.

### Step 1: Add `ip_address` column to `terms_decline_log`
Migration: `ALTER TABLE terms_decline_log ADD COLUMN ip_address text;`

### Step 2: Create a helper to fetch the client's public IP
Create `src/lib/get-client-ip.ts` that calls a free, privacy-safe IP echo service (`https://api.ipify.org?format=json`) and returns the IP string. Cache for the session so it only fetches once. Falls back to `null` on failure (non-blocking).

### Step 3: Update `TermsAcceptanceModal.tsx`
- In `handleAccept`, fetch IP and include `ip_address` in the insert to `terms_acceptance_log`
- In `handleDecline`, fetch IP and include `ip_address` in the insert to `terms_decline_log`

### Step 4: Update `StaffAcknowledgmentModal.tsx`
- In `handleAcknowledge`, fetch IP and include `ip_address` in the insert to `terms_acceptance_log`

### Privacy Note
Storing IP at the moment of legal consent/decline is standard practice under PIPEDA for establishing proof of agreement. The IP is only captured at the specific consent event, not during general browsing (consistent with the platform's existing privacy-compliant anonymous analytics).

### Technical Details
- **Migration**: 1 SQL statement (add column)
- **New file**: `src/lib/get-client-ip.ts`
- **Modified files**: `TermsAcceptanceModal.tsx`, `StaffAcknowledgmentModal.tsx`
- No RLS changes needed -- existing insert policies already cover these tables

