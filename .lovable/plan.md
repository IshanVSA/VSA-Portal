## Verified diagnosis

The Search Atlas API key and basic connection are working. The visible summary metrics come from the REST customer-projects call, while the empty detailed rows/charts come from MCP `tools/call` requests.

The current issue has two confirmed parts:

1. **MCP tool errors are being treated as successful empty data**
   - Search Atlas returns HTTP 200 with `result.isError: true` and a JSON error inside `result.content[0].text`.
   - The proxy only checks top-level JSON-RPC `error`, so validation failures are passed to the frontend as if they were successful.
   - The frontend unwraps those payloads into empty arrays, which is why the UI says things like “No keywords found” instead of showing the real error.

2. **Some frontend calls are missing required parameters**
   - The live network trace confirms `llmv_get_sentiment_trend`, `llmv_get_citations_overview`, and `llmv_get_citations_urls` are failing with: `domain: required field is missing`.
   - `SearchAtlasLLMTab.tsx` currently sends only `project_id` for several LLM visibility calls, despite the saved clinic config having `search_atlas_domain = 108aveanimalhospital.com`.

## Implementation plan

1. **Fix MCP error detection in the edge proxy**
   - Update `supabase/functions/search-atlas-proxy/index.ts` so `hasMcpError` also detects:
     - `result.isError === true`
     - `result.structuredContent.success === false`
     - JSON error objects embedded inside `result.content[].text`
   - Return a `__searchAtlasError` payload with the exact tool error details instead of silently passing it through.

2. **Pass required domain arguments to LLM tools**
   - Update `src/components/ai-seo/SearchAtlasLLMTab.tsx` so all `llmv_*` calls include both:
     - `project_id`
     - `domain`
   - This directly addresses the observed validation errors.

3. **Harden detailed data parsing**
   - Update `src/hooks/useSearchAtlas.ts` so MCP responses with `result.isError` or `success:false` are recognized as Search Atlas soft errors, not unwrapped as normal data.
   - Keep the existing flexible parser for successful nested payloads.

4. **Review high-risk MCP parameter calls**
   - Recheck `SearchAtlasBacklinksTab.tsx`, `SearchAtlasKeywordsTab.tsx`, and `SearchAtlasSerpHistoryTab.tsx` for parameter consistency.
   - Keep existing broad compatibility fields where they are harmless, but remove or adjust any parameter that causes validated MCP failures if confirmed by response payloads.

5. **Validate with real signals**
   - Deploy the updated `search-atlas-proxy` function.
   - Use the preview network trace after refresh to confirm:
     - LLM calls no longer return `domain: required field is missing`.
     - Tool-level errors now surface as `__searchAtlasError` instead of empty tables.
     - Successful MCP payloads populate the detailed UI where Search Atlas returns rows.

## Expected outcome

After implementation, the AI SEO tabs will stop hiding MCP validation failures. The LLM tab should start receiving data for calls that were only missing `domain`. If any Search Atlas tool still returns no detailed rows, the UI/proxy will show the exact upstream reason so the next fix can be based on the real schema/error instead of guesswork.