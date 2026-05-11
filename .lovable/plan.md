## Goal
Make the second checkbox label in the Terms Acceptance modal dynamic based on the client's clinic country (Canada vs United States), instead of always saying "Canadian Clients".

## Behavior
- **Canada** → "**Canadian Clients:** I consent to receiving commercial electronic messages from VSA in connection with my service agreement." (current copy — required for CASL)
- **United States** → "**US Clients:** I consent to receiving commercial electronic messages (including email and SMS) from VSA in connection with my service agreement." (CAN-SPAM / TCPA framing)
- **Unknown / no clinic match** → fall back to a neutral label: "**Clients:** I consent to receiving commercial electronic messages from VSA in connection with my service agreement." so the gate never breaks.

The checkbox itself stays required (same submit-gating as today). Only the label text changes; `casl_consent_given` continues to store the boolean as-is.

## Implementation (frontend only)

1. **Detect the client's country** in `src/components/terms/TermsAcceptanceModal.tsx`:
   - Add a small `useQuery` that, for the logged-in `user.id`, looks up their clinic address. A client owns a clinic via `clinics.owner_user_id = user.id`; sub-account clients are linked via the existing sub-account → clinic relationship. Query the first matching clinic and read its `address` (and `country` column if present — check `clinics` schema while wiring).
   - Pass that address through the existing `detectComplianceBody` helper's country detector. To avoid coupling to the compliance body string, extract a tiny `detectCountry(address)` helper from `src/lib/compliance-body.ts` (it already has the logic internally) and export it as `detectClientCountry(address): "CA" | "US" | null`. No behavior change to existing callers.

2. **Render the label dynamically** based on the resolved country (`CA` / `US` / `null` → fallback). Keep the `<strong>` prefix styling identical.

3. **Loading state**: while the country query is pending, show the neutral fallback label so the modal still renders immediately and the Accept button isn't blocked by an extra await.

## Out of scope
- No DB migrations, no edge function changes, no changes to acceptance logging schema.
- Staff acknowledgment modal is unaffected (no CASL checkbox there).
- Standalone `/terms-of-service` page copy is not changed in this pass — only the in-app acceptance gate, since that's what the screenshot shows.

## Files touched
- `src/lib/compliance-body.ts` — export a `detectClientCountry` helper (reuse existing internal logic).
- `src/components/terms/TermsAcceptanceModal.tsx` — fetch clinic country, render the label dynamically.