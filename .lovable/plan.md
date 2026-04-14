

## Plan: Privacy Policy & Terms of Use -- Full Implementation

This is a large feature with multiple interconnected parts. I'll break it into phases that can be implemented incrementally.

### What we're building

1. **Update the Privacy Policy and Terms of Service pages** with the full content from the uploaded document (Part One = Privacy Policy, Part Two + Part Three = Terms of Use)
2. **Terms acceptance gate for clients** -- on first login (or when terms version changes), show a non-dismissable modal requiring acceptance before dashboard access
3. **Staff acknowledgment flow** -- concierge/member users see a lighter acknowledgment modal
4. **Decline flow** -- if a client clicks "I Have Concerns", block access and notify admins
5. **Admin email notification** -- send email to admins when a client declines terms

### Database Changes (Migration)

**New tables:**

- `terms_versions` -- stores version info (version text PK, effective_at, is_active, amendment_type)
- `terms_acceptance_log` -- append-only log (user_id, terms_version, accepted_at, acceptance_type, ip_address via edge function, user_agent, casl_consent_given)
- `terms_decline_log` -- tracks declines (user_id, terms_version, declined_at, resolved_at, resolution)

**New function:**
- `has_accepted_current_terms(p_user_id uuid)` -- SECURITY DEFINER function that checks if user has accepted the currently active terms version

**Seed data:**
- Insert version `1.0` with `effective_at = '2026-04-13'`, `is_active = true`, `amendment_type = 'material'`

**RLS policies:**
- `terms_acceptance_log`: insert-only for authenticated users (no update/delete)
- `terms_decline_log`: insert-only for authenticated users
- `terms_versions`: select-only for authenticated users
- Admins can select all logs

### Frontend Changes

**1. New hook: `src/hooks/useTermsAcceptance.ts`**
- Queries `has_accepted_current_terms` RPC for the current user
- Returns `{ hasAccepted, isLoading, currentVersion }`

**2. New component: `src/components/terms/TermsAcceptanceModal.tsx`**
- Full-screen, non-dismissable modal
- Renders the full Privacy Policy + Terms of Use content (extracted as React components from the HTML document)
- Scroll enforcement: "Accept and Continue" button disabled until user scrolls to bottom
- Two checkboxes: (1) "I have read and agree..." (2) CASL consent for Canadian clients
- Two buttons: "Accept and Continue" / "I Have Concerns"
- On accept: inserts into `terms_acceptance_log`, invalidates query, grants access
- On decline: inserts into `terms_decline_log`, calls edge function to email admins, shows blocked message

**3. New component: `src/components/terms/StaffAcknowledgmentModal.tsx`**
- Lighter modal for concierge users
- Message: "You are accessing this platform as an authorized user under a managed account..."
- Single "Acknowledge and Continue" button
- Logs with `acceptance_type = 'staff'`

**4. New component: `src/components/terms/TermsBlockedScreen.tsx`**
- Shown when client declines terms
- Message: "Your access has been temporarily suspended pending review. A member of the VSA team will contact you within two business days."
- Sign out button

**5. Update `src/components/ProtectedRoute.tsx`**
- After auth + role check, check `hasAccepted`
- If client role and not accepted: show `TermsAcceptanceModal`
- If concierge role and not accepted: show `StaffAcknowledgmentModal`
- Admins bypass the gate

**6. Update Privacy Policy & Terms of Service pages**
- Replace current placeholder content with full document content from the uploaded HTML
- Part One content goes to `/privacy-policy`
- Part Two + Part Three content goes to `/terms-of-service`

### Edge Function: `notify-terms-decline`

- Called when a client declines terms
- Queries all admin user IDs from `user_roles`
- Fetches their emails from `auth.users` (via service role)
- Sends notification emails using Zoho (existing email infrastructure) to each admin
- Includes client name, clinic name, and timestamp

### Implementation Order

Due to the size, this will be built in chunks:

1. **Database migration** -- tables, functions, seed data, RLS
2. **Privacy Policy page** -- update with full Part One content
3. **Terms of Service page** -- update with full Part Two + Part Three content  
4. **Terms acceptance hook + modal** -- the core gate logic
5. **Staff acknowledgment modal**
6. **ProtectedRoute integration** -- wire the gate into the app
7. **Decline flow + blocked screen**
8. **Admin notification edge function**

### Technical Details

- IP address capture: done server-side via an edge function (`log-terms-acceptance`) that reads `x-forwarded-for` header
- The terms content will be stored as React components (not fetched from DB) since the document is static per version
- The `has_accepted_current_terms` function uses SECURITY DEFINER to avoid RLS recursion
- No foreign key to `auth.users` -- we reference user_id as uuid without FK constraint per project conventions

