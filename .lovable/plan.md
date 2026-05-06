## Goal

Enhance the **Edit Clinic** dialog (Admin → Clinics → Edit) with:

1. A **"Refetch from website"** button that re-runs the AI extractor against the clinic's stored website to refresh fields (most importantly Address) when the AI got it wrong.
2. A **Compliance Body** display showing which regulatory body the system has detected for this clinic based on its address.
3. An **override dropdown** so an admin can pick the correct body (Canadian provinces + US states + national bodies) when the auto-detected one is wrong, persisted on the clinic record.

## UX

In the Edit Clinic dialog, directly under the **Address** field, add:

```text
Address
[ 14675 108 Avenue, Surrey, BC, V3R 1V9            ] [↻ Refetch]
                                                     small button on the right

Compliance Body                                       (Auto-detected)
[ CVBC (College of Veterinarians of British Columbia) ▼ ]
The body the AI uses for ad/promotion compliance. Override only if incorrect.
```

- **Refetch button**: secondary/outline, with refresh icon. Disabled if the clinic has no website on file. Shows a spinner while running. On success, updates the local edit form fields (name/phone/address/etc.) — the user still has to click **Save Changes** to persist. Toast confirms what came back.
- **Compliance Body select**: shows the **auto-detected** value as the default (computed live from the current `editAddress`). If an admin picks a different one, that override is saved to the clinic. A small "Reset to auto" link appears when an override is active. A badge next to the label reads "Auto-detected" or "Manual override".

## Data model

Add one nullable column to `public.clinics`:

- `compliance_body_override TEXT NULL` — when set, this string is the authoritative compliance body for the clinic; when null, the system falls back to `detectComplianceBody(address)`.

No RLS changes needed — existing clinic update policies (admin only) already cover it.

## Files to change

1. **`supabase/migrations/<new>.sql`** — add `compliance_body_override` column.
2. **`src/lib/compliance-body.ts`** — export the full list of selectable bodies (CA provinces, US states, CA national, US national, generic) so the dropdown can render them. Add a helper `getEffectiveComplianceBody(address, override)` that returns the override when set, otherwise the detected value.
3. **`src/pages/Clinics.tsx`**
   - Extend `Clinic` interface with `website` and `compliance_body_override`.
   - Add `editWebsite` and `editComplianceOverride` state; populate them in `openEditDialog`.
   - Add `refetchFromWebsite()` handler — same call as `extractClinicFromWebsite` but writes into the **edit** state vars, using `editClinic.website` as the URL. If no website on the clinic, show a toast and bail.
   - Render the Refetch button next to the Address input (or below it on mobile).
   - Render the Compliance Body select + "Auto-detected / Manual override" badge + Reset link, computed from `editAddress` and `editComplianceOverride`.
   - Update `saveEdit` to also persist `compliance_body_override` (null when matching the auto value or "Reset to auto" was clicked).
4. **`src/integrations/supabase/types.ts`** — auto-regenerated after migration.

## Out of scope (won't touch)

- The Add Clinic dialog (only Edit, per the request).
- Other surfaces that read compliance body (PromotionModule, PopupOffersForm). They'll automatically pick up the override once they switch to `getEffectiveComplianceBody`, but that wiring can be a follow-up — this plan only guarantees the value is **stored** on the clinic. I'll mention this in the closing note so you can decide whether to extend it now.

## Order of operations

1. Create the SQL migration (await user approval).
2. After migration runs, add `getEffectiveComplianceBody` + selectable-bodies export to `compliance-body.ts`.
3. Wire the Edit dialog: state, Refetch button, Compliance Body select, save logic.
4. Manual QA: open Edit on a clinic, confirm auto-detected body matches address, change override, save, reopen — value persists; Refetch updates fields without saving until Save is clicked.
