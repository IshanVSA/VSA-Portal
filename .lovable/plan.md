## Problem

The compliance body shown in the Promotion Module and Pop-up Offers ticket form falls back to **"General Veterinary Advertising Standards"** for any clinic outside Canada. US clinics like Cherry Knolls Veterinary Clinic (Centennial, Colorado) should instead show **CVMA (Colorado Veterinary Medical Association)**.

Canadian provinces are already mapped correctly. The detector simply has no US coverage.

## Where the bug lives

The same `detectComplianceBody(address)` function is duplicated in two files:

- `src/components/social/PromotionModule.tsx` (lines 42–74)
- `src/components/department/ticket-forms/PopupOffersForm.tsx` (lines 23–59)

Both only check Canadian provinces, then return the generic string.

## Changes

### 1. New shared helper: `src/lib/compliance-body.ts`

A single `detectComplianceBody(address)` function used by both call sites. It will:

- Detect country first using postal-code shape (`A1A 1A1` for Canada, 5-digit ZIP for US) plus explicit "USA" / "Canada" tokens.
- For **Canada**, keep the existing province → college/association mapping (ABVMA, CVBC, CVO, OMVQ, etc.). Replace the misleading `"AVMA (general)"` entries for NT/NU/YT with **CVMA (Canadian Veterinary Medical Association)**.
- For **US**, add a full mapping of all 50 states + DC to their state Veterinary Medical Association (or the closest equivalent professional body). Examples:
  - CO → CVMA (Colorado Veterinary Medical Association)
  - CA → CVMA (California Veterinary Medical Association)
  - NY → NYSVMS (New York State Veterinary Medical Society)
  - TX → TVMA (Texas Veterinary Medical Association)
  - FL → FVMA, IL → ISVMA, SC → SCAV, etc.
- Recognize states by full name (`"COLORADO"`) **or** 2-letter code, but only honor a 2-letter code when a US ZIP / Canadian postal code in the same string confirms the country — prevents false positives (e.g. "OR" matching Oregon inside a Canadian address, or "ON" matching Ontario inside a US address).
- National fallbacks: **AVMA** (US) and **CVMA** (Canada) when the country is known but the region isn't. Generic label only when the country itself can't be determined.

### 2. Refactor the two components

In both `PromotionModule.tsx` and `PopupOffersForm.tsx`:
- Delete the local `PROVINCE_MAP`, `nameMap`, and `detectComplianceBody` definitions.
- `import { detectComplianceBody } from "@/lib/compliance-body";`
- No UI changes — the existing "Compliance: …" badge and the AI verification call (which already passes the resolved `complianceBody` string to `verify-popup-offer`) automatically pick up the correct value.

### 3. Edge function awareness (no code change required)

`supabase/functions/verify-popup-offer/index.ts` receives `complianceBody` as a string from the client and uses it inside the prompt. It will now receive the correct US state body (e.g. "CVMA (Colorado Veterinary Medical Association)") and validate against those standards.

## Notes on accuracy

- Where two associations exist, I'm using the state VMA (the body that publishes advertising/professional-conduct guidance) rather than the state licensing board, matching the pattern used for Canadian provinces.
- Acronyms reuse the same letters across states (e.g. "CVMA" for both California and Colorado) — that's intentional and matches how each association brands itself. The full name in parentheses disambiguates.
- This is a pure client-side heuristic over `clinics.address`. Clinics with malformed addresses will still fall back to AVMA / CVMA / generic in that order.
