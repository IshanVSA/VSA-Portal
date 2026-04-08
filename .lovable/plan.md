

## Plan: Fix SM2 Content Generation Timeout

### Root Cause

The edge function timed out at 153 seconds (Supabase limit ~150s). Two issues:

1. **Invalid model name**: `claude-sonnet-4-6` is not a valid Anthropic model ID. The correct ID is `claude-sonnet-4-20250514` (or `claude-3-5-sonnet-20241022` for 3.5 Sonnet).
2. **Retry doubles the timeout**: If the first call fails (likely due to invalid model), the retry makes a second identical call, guaranteeing a timeout.
3. **12,000 max_tokens is very large**: The full HTML deliverable generation is ambitious for a single call within edge function time limits.

### Fix

**File: `supabase/functions/generate-sm2-content/index.ts`**

1. **Fix the model name** to `claude-sonnet-4-20250514` (Claude Sonnet 4, the fast model suitable for this task).
2. **Remove the retry logic** — retrying the same large generation within the same edge function guarantees a timeout. If the first call fails, return the error immediately.
3. **Reduce max_tokens to 8000** — the HTML output can be trimmed. 12k tokens with the massive system prompt pushes generation time past limits.
4. **Add an AbortController with a 120-second timeout** on the fetch call so it fails cleanly before the edge function hard-kills at 150s.

### Technical Details

```
Model:  "claude-sonnet-4-6"  →  "claude-sonnet-4-20250514"
Tokens: 12000  →  8000
Retry:  removed (single attempt only)
Timeout: 120s AbortController on fetch
```

### Impact

Content generation should complete in ~60-90 seconds with the correct model, producing the full HTML deliverable successfully.

