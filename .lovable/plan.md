

## Plan: Manually validate the Clinic Differentiator

### Context

The "⚠ Not validated" badge is driven by `synthesized_profile.differentiator_validated` (boolean) set by the AI in `synthesize-dna`. For CVBC clinics (like Alma) review mining is suppressed by policy, so this flag stays `false` permanently — there's no way for the AI to ever flip it. Today, staff can edit the differentiator text but cannot change its validation state.

### What we'll build

A small **manual validation control** next to the badge, available to admins and concierges, that lets staff confirm the differentiator after a human review (e.g., a client call or owner email).

### 1. UI — `BrandDNATab.tsx` (badge area, ~line 466)

Replace the static badge with an interactive control:

- **Read-only for clients** — they continue to see "✓ Review-validated" / "⚠ Not validated"
- **For admin/concierge** — the badge becomes a button with a `Shield` icon. Clicking opens a small popover:
  - Toggle: "Mark as validated" / "Mark as not validated"
  - Optional `Textarea`: "Validation note (e.g. confirmed with Dr. Parveen on 2026-04-19)"
  - "Save" button

When saved, write to `clinic_brand_dna.synthesized_profile`:
```json
{
  ...existing,
  "differentiator_validated": true,
  "differentiator_validated_by": "<user_id>",
  "differentiator_validated_at": "2026-04-20T...",
  "differentiator_validation_note": "Confirmed with Dr. Parveen via call"
}
```

No DB schema change — `synthesized_profile` is JSONB.

### 2. Visual states (admin/concierge view)

```text
[⚠ Not validated]   →  click  →  popover with toggle + note  →  [✓ Manually validated by Sarah · Apr 20]
```

A third badge variant "Manually validated" (amber-to-emerald) distinguishes human validation from AI/review validation, so the audit trail stays clear.

### 3. Sync with the Vedant Checklist

In `AdminDNAProfileCard.tsx`, the existing checklist item `differentiator_validated` ("Clinic differentiator is validated against reviews") will:
- Auto-check when `synthesized.differentiator_validated === true` (whether AI or manual)
- Re-label to "Clinic differentiator is validated (review or manual)"

This means manual validation also unblocks profile activation.

### 4. Files touched

- `src/components/social/BrandDNATab.tsx` — interactive badge + popover for staff, read-only for clients
- `src/components/social/AdminDNAProfileCard.tsx` — checklist auto-check + relabel

No migration, no edge function changes.

