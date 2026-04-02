

## Plan: Strengthen US English Enforcement in GBP Post Generation Prompt

### Problem
The compliance scan flags "US English: FAIL" on generated posts because the AI model occasionally uses British spellings (e.g., "centre" instead of "center", "behaviour" instead of "behavior"). The current prompt mentions US English in one line but doesn't emphasize it enough.

### Change
**File:** `supabase/functions/generate-gbp-posts/index.ts`

Update the Tier 1 compliance section of the system prompt (around line 152) to:
1. Expand the US English instruction from a single line into an explicit list of British→American spelling conversions
2. Add a dedicated "LANGUAGE RULE" block listing the exact British spellings that trigger compliance failure: `colour→color, favour→favor, behaviour→behavior, specialise→specialize, organise→organize, centre→center, metre→meter, defence→defense, licence→license, analyse→analyze`
3. Add a final self-check instruction at the end of the prompt telling the model to review every word for British spellings before outputting

This ensures the model treats US English as a hard compliance rule rather than a soft guideline.

