

## Plan: Surface Actual Error Messages Project-Wide

### Problem
When edge functions fail (e.g., "API credit balance depleted"), the frontend shows vague messages like "Failed to generate" or "Something went wrong" because:
1. The Supabase SDK wraps edge function errors, hiding the actual message in `error.context`
2. Most call sites use hardcoded fallback strings without attempting to extract the real error
3. Only `useGBPBatches.ts` has a proper error extraction helper — everywhere else ignores the response body

### Solution

**1. Create a shared error extraction utility** (`src/lib/edge-function-error.ts`)

Move and improve the `getEdgeFunctionErrorMessage` helper from `useGBPBatches.ts` into a shared utility. This function will:
- Try to read `error.context.json()` (Supabase SDK pattern)
- Fall back to `error.message`
- Return the actual server error string (e.g., "Anthropic API credit balance is too low...")

**2. Update all edge function call sites** (~20 files) to use this utility

Every file that calls `supabase.functions.invoke()` and shows a toast on error will be updated to extract and display the real error message. Key files:

| File | Current error message |
|---|---|
| `useSM2Generation.ts` | "Generation failed" |
| `useGBPPosts.ts` | "Failed to generate posts" |
| `useGBPBatches.ts` | Already has helper (will import shared one) |
| `BrandDNATab.tsx` | "Extraction failed" / "Synthesis failed" |
| `ContentRequestsContent.tsx` | "Generation failed" |
| `GoogleAdsAnalyticsTab.tsx` | "Sync failed" |
| `WebsiteHealthTab.tsx` | "PageSpeed check failed" |
| `MetaConnectionCard.tsx` | "Sync failed" |
| `GoogleAdsConnectionCard.tsx` | "Sync failed" |
| `Clinics.tsx` | "Failed to extract" |
| `Employees.tsx` / `Clients.tsx` | "Failed to create/delete" |
| `ChatAssistant.tsx` | "Failed to get a response" |
| `DepartmentChat.tsx` | generic errors |
| `VoiceDictation.tsx` | "Transcription failed" |
| `UpdateSeoAnalyticsDialog.tsx` | "Extraction failed" |

The pattern at each call site changes from:
```typescript
// Before
if (error) toast.error("Generation failed");

// After
if (error) toast.error(await extractErrorMessage(error, data, "Generation failed"));
```

Also check `data?.error` (many edge functions return `{ error: "..." }` in the body with status 200).

**3. Update edge functions for consistent error format**

Several edge functions already return `{ error: "descriptive message" }`. Verify all edge functions follow this pattern — the ones already fixed (extract-brand-dna, mine-reviews, locality-fetch, extract-clinic-website) serve as the template. Remaining functions to audit:
- `generate-sm2-content`
- `generate-gbp-posts`
- `generate-content`
- `synthesize-dna`
- `generate-batch-queue`
- `chat`
- `transcribe-audio`

### Files Changed
1. **New**: `src/lib/edge-function-error.ts` — shared error extraction utility
2. **Edit**: ~15-20 frontend files — replace vague error strings with extracted messages
3. **Edit**: ~5-7 edge functions — ensure all return `{ error: "descriptive reason" }` on failure
4. **Edit**: `src/hooks/useGBPBatches.ts` — import from shared utility instead of local function

