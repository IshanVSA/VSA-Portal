

## Plan: Update GBP Post Generation to Use Claude Opus 4.6

### Overview
Update the model ID in `supabase/functions/generate-gbp-posts/index.ts` from `claude-sonnet-4-20250514` to `claude-opus-4-6`.

### Change
**File:** `supabase/functions/generate-gbp-posts/index.ts`
- Line ~165: Change `model: "claude-sonnet-4-20250514"` → `model: "claude-opus-4-6"`
- Also increase `max_tokens` from 4096 to 8192 since Opus 4.6 supports up to 128K output tokens

Single-line change, deploy, done.

