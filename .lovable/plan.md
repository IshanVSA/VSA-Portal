

## Plan: Update Client tab visibility in Social Media department

Currently in `src/pages/SocialMedia.tsx`, the client sees only: Overview, Tickets, My Content, Preferences.

Update `visibleTabs` for clients to show this exact set in this order:

1. Overview
2. Tickets
3. Active Promotions
4. Analytics
5. Files
6. GBP Posts (posts only — already handled by `GBPPostsTab` showing `clientTabs` = Scheduled + History when role is client)
7. Brand DNA
8. Preferences
9. Meta Ads

### Changes

**`src/pages/SocialMedia.tsx`**

- Replace the client branch of `visibleTabs`:
  ```ts
  const visibleTabs = isClient
    ? [
        baseTabs.find(t => t.value === "overview")!,
        baseTabs.find(t => t.value === "tickets")!,
        baseTabs.find(t => t.value === "promotions")!,
        baseTabs.find(t => t.value === "analytics")!,
        baseTabs.find(t => t.value === "uploads")!, // "Files"
        gbpPostsTab,
        dnaTab,
        themeSlidersTab,
        metaAdsTab, // new
      ]
    : [...baseTabs, generationTab, gbpPostsTab, dnaTab, themeSlidersTab, ...(isStaff ? [chatTab] : [])];
  ```
- Add a `metaAdsTab` definition. Since there's no existing Meta Ads tab content, add a placeholder `TabsContent` using `ComingSoonTab` (already used in the codebase) or a simple "Meta Ads coming soon" card. Use `Megaphone` icon from lucide-react.
- Render the Brand DNA tab content for clients too (currently gated behind `isStaff`). Move the `<TabsContent value="brand-dna">` out of the `isStaff` block so clients can view it (read/edit via existing `BrandDNATab` — it already handles role internally).
- Keep `content-review` (My Content) removed from the client tab list per the new spec.

### Brand DNA note

Confirm the existing `BrandDNATab` is safe for clients — it already powers the DNA gate flow. If it shows admin-only controls, we'll guard those by role inside the component (small follow-up). For this plan, expose the tab and reuse the existing component.

### Meta Ads tab

No backend yet. Render a simple placeholder card ("Meta Ads — Coming soon") so the tab is visible and clickable but informative. We can wire real data in a follow-up.

### Files touched

- `src/pages/SocialMedia.tsx` (only file)

