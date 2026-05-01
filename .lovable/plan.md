## Problem

For 48th Avenue Animal Hospital the stored address is just `Ladner, BC, Canada`, while the website footer clearly shows `5020 48 Ave, Delta, BC V4K 3V3, Canada`. Because the address has no postal code and no province‑adjacent ZIP, the `detectComplianceBody()` heuristic in `src/lib/compliance-body.ts` cannot lock onto British Columbia reliably, so the wrong veterinary regulatory body shows up in the Promotion module and Pop-up Offers ticket form.

The AI extractor (`supabase/functions/extract-clinic-website`) is the upstream cause — it returns whatever it considers "an address," even when only a city/province is present.

## Fix

### 1. Tighten AI address extraction (`extract-clinic-website`)

- Update the `extract_clinic_details` tool schema so `address` is required to be a **complete postal address** with explicit sub-fields the model must fill, then we compose them:
  - `street` (e.g., `5020 48 Ave`)
  - `city` (e.g., `Delta`)
  - `region` (province / state, full or abbreviated)
  - `postal_code` (ZIP / Canadian postal code)
  - `country`
  - Keep `address` as the composed single-line string for back-compat.
- Strengthen the system prompt:
  - "Always return the full street address including street number, street name, city, province/state, postal/ZIP code, and country, exactly as printed on the site (typically in the footer, Contact page, or schema.org JSON-LD)."
  - "Never return a city-only or region-only address. If a street address cannot be confidently located, set `address` to null and lower confidence."
- Add a server-side post-processing guard that:
  - Parses the JSON-LD `PostalAddress` / `LocalBusiness` blocks from the fetched HTML directly and uses them as a deterministic fallback / cross-check.
  - Verifies the returned address contains a digit (street number) AND a postal/ZIP-shaped token; if not, retry the model with an explicit "must include street number + postal code" instruction once before giving up.
- Boost the contact/footer signal sent to the model:
  - Always include the homepage `<footer>` HTML (sanitized) as a dedicated section.
  - Always include any JSON-LD blocks verbatim (they almost always contain `streetAddress`, `addressLocality`, `addressRegion`, `postalCode`).

### 2. Backfill the affected clinic

- Re-run extraction for `48th Avenue Animal Hospital` (id `417749c9-688a-4757-85aa-83fcef8f9e72`) via the existing admin "Re-extract" action so the address becomes `5020 48 Ave, Delta, BC V4K 3V3, Canada`.
- After update, `detectComplianceBody()` returns `CVBC (College of Veterinarians of British Columbia)` automatically — no client changes required.

### 3. Light defensive improvement in `compliance-body.ts` (optional, low-risk)

- Already handles `City, ST` and full province names. No change needed once the address is complete. Leaving this file untouched.

## Files to change

- `supabase/functions/extract-clinic-website/index.ts` — schema + prompt + JSON-LD/footer injection + validation retry.
- (Data) Re-run extraction for 48th Avenue Animal Hospital from the Clinics admin page after the function ships, or trigger via a one-off admin call.

## Out of scope

- No UI changes.
- No changes to `compliance-body.ts` mapping logic.
- No edits to other extractors (DNA, locality) — they read `clinics.address` which will now be correct.
