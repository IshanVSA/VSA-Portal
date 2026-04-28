# Strengthen Pop-up Offer Legal Acknowledgment

## What you're seeing vs. what we changed before

The screenshot shows the **bottom submission checkbox** (the one right above "Create Ticket"). The previous edit only updated a *different* checkbox — the AI compliance override that appears between "Verify Offer Compliance" and the final acknowledgment. That's why the bottom text looks unchanged: it is unchanged. This plan updates the actual checkbox in your screenshot.

## Goal

Replace the soft "I acknowledge…correct and compliant" wording with a stronger, multi-point legal attestation that:

- Shifts full legal responsibility for the offer's content, accuracy, claims, pricing, and regulatory compliance onto the clinic (the licensed party).
- Explicitly disclaims VSA Vet Media's role as a marketing service provider only — not a legal, veterinary, or regulatory advisor.
- Acknowledges AI-generated guidance is informational, not legal advice.
- Indemnifies VSA Vet Media against claims arising from the offer.

## New acknowledgment text

A single checkbox label, written as four short clauses so it reads cleanly under the form:

> **By submitting this pop-up offer, I confirm and agree on behalf of the clinic that:**
> 
> 1. All offer details, pricing, inclusions, exclusions, terms, and dates provided are accurate, current, and authorized by the clinic.
> 2. The offer complies with all applicable laws and the advertising, pricing, and professional conduct rules of **{complianceBody}**, and the clinic — not VSA Vet Media — is solely responsible for ensuring and maintaining that compliance.
> 3. Any AI-generated compliance feedback shown in this tool is provided for general informational purposes only, does not constitute legal, veterinary, or regulatory advice, and has not been reviewed by a lawyer or the regulator. The clinic is responsible for obtaining its own professional advice where needed.
> 4. VSA Vet Media acts solely as a marketing service provider executing the clinic's instructions, and the clinic agrees to indemnify and hold VSA Vet Media harmless from any claims, penalties, complaints, or damages arising from the publication, content, or fulfilment of this offer.

If a compliance override has been applied, the existing `(compliance override applied)` suffix is appended to clause 2 so the audit trail stays intact.

## Where it changes

**`src/components/department/ticket-forms/PopupOffersForm.tsx`** (lines ~357–363)

- Replace the single-paragraph label with the structured 4-clause version above.
- Keep the existing `Checkbox` control, `complianceBody` interpolation, `overridden` suffix, and `accepted` state wiring — only the visible label changes.
- Light styling tweak: render the four points as a numbered list (`<ol>`) with tight spacing so it stays compact inside the dialog.

No other files, database tables, edge functions, or flows are affected. The existing AI override checkbox (already updated previously) and the Promotion module's CVBC checkbox are intentionally left as-is — they serve different purposes.

## What is intentionally NOT changed

- The AI override acknowledgment (already updated last turn).
- The Special Promotion module's CVBC confirmation (different scope, different regulator-specific wording).
- Backend storage — the same `accepted` boolean is recorded; the strengthened wording is captured implicitly via the form version.

## Recommended follow-ups (optional, not in this change)

1. Add a one-line Terms of Service clause mirroring this indemnity so the in-form text is backed by the master agreement.
2. Persist the exact acknowledgment text version alongside each ticket (e.g. `acknowledgment_version: "2026-04-popup-v2"`) so you can prove which wording the user accepted at submission time. Happy to wire this up as a follow-up if you want a defensible audit trail.
