

## Explanation: Client View vs Team QA View

The generated HTML file contains **two built-in tabs** created by the AI engine:

- **Client View** — A clean, professional view showing only the 10 posts with captions, visual directions, format, and CTA. No internal data. This is what gets shown to the clinic client for approval.

- **Team QA View** — The full internal view for staff (concierges/admins). It includes everything: Neighborhood Intelligence Brief, Generation Audit Report, Confirmation Summary, all posts with compliance/sensitivity sweep results, Concierge Action Guide, Meta Ads details, and budget summary.

### Why the tabs aren't clickable

The tab switching relies on inline JavaScript inside the generated HTML. The iframe currently has `sandbox="allow-same-origin allow-scripts"`, which should allow scripts. However, there are two likely causes:

1. The AI model may have generated broken or missing JavaScript for the tab toggle (the model sometimes omits or malforms the JS).
2. The `srcDoc` injection may be stripping or breaking the script execution context.

### Fix

1. **Verify the generated HTML** — Fetch the stored HTML file from Supabase storage and inspect whether the tab-toggle JavaScript is actually present and correct.
2. **If JS is missing/broken in the generated HTML** — Update the system prompt in `generate-sm2-content/index.ts` to include an explicit JavaScript snippet for tab switching (rather than leaving it to the model to generate).
3. **If JS is present but not executing** — The sandbox attribute may need adjustment, or the `srcDoc` approach may need a small tweak to ensure scripts run.

### Implementation

**Step 1**: Query the stored HTML file to diagnose whether the JavaScript is present.

**Step 2**: Add an explicit tab-toggle JavaScript template to the system prompt's Step 16, e.g.:
```html
<script>
function switchTab(tab) {
  document.getElementById('client-view').style.display = tab === 'client' ? 'block' : 'none';
  document.getElementById('team-qa-view').style.display = tab === 'team' ? 'block' : 'none';
}
</script>
```

**Step 3**: Redeploy the edge function. Existing HTML files won't be affected — only new generations will include the fix. Optionally, re-generate for Alma Animal Hospital to verify.

