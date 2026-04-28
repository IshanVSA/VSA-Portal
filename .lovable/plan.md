## Update AI compliance acknowledgment text

Replace the override acknowledgment line shown after the AI compliance scan with the new AI-disclaimer wording, in both places it appears.

**New text:**
> "I understand this advice is AI-generated, provided for general informational purposes only and does not constitute legal or professional advice."

### Where it changes

1. **Pop-up Offers quick action** — `src/components/department/ticket-forms/PopupOffersForm.tsx` (line 339)
   - The "Override compliance check" block that appears when the AI verification flags issues.

2. **Special Promotion (Social Media) quick action** — `src/components/social/PromotionModule.tsx` (line 335)
   - Same pattern: shown after AI verification flags issues. This is the suitable parallel spot since it's also AI-generated compliance advice.

### What stays the same
- The final "I acknowledge that all information provided… is correct and compliant" consent at the bottom of PopupOffersForm (line 359) — this is a factual/regulatory consent, not an AI disclaimer, so it remains untouched.
- The override reason textarea, checkbox behavior, and submit gating are unchanged.

No database, edge function, or schema changes required.