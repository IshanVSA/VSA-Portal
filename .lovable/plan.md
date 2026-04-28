## Goal

Make the **Content Pipeline Funnel** in the Social Overview (Admin + Concierge views) reflect the real SM2 monthly-batch workflow, counting calendars (one per target month) instead of legacy `content_requests` rows. Replace the unused "Client Selected" and "Final Approved" stages with more useful ops metrics.

## Current problem

- The funnel queries the legacy `content_requests` table with stages `generated → concierge_preferred → admin_approved → client_selected → final_approved`. That table is no longer the source of truth for SM2 calendars, so all five buckets stay at `0`.
- "Client Selected" / "Final Approved" don't map to anything in the SM2 v2.1 lifecycle and add noise.

## New funnel — 5 stages

Counts come from the `sm2_generations` table, scoped to the selected clinic. Each row = one monthly calendar (target month).

| # | Stage | Source filter (sm2_generations) | Meaning |
|---|---|---|---|
| 1 | **Generated** | `approval_status = 'pending'` AND `sent_to_client_at IS NULL` | Calendar produced by SM2, not yet sent to client. Admin/concierge has it for internal review. |
| 2 | **Under Review** | `sent_to_client_at IS NOT NULL` AND `approval_status IN ('sent_for_copy_review','sent_for_final_review')` | Sent to client, awaiting their copy or final review. Matches the "Awaiting Your Review" badge logic on the client side. |
| 3 | **Approved** | `approval_status IN ('copy_approved','approved_client')` | Client signed off on a round (copy or final). Removed from "Under Review" automatically because status changes. |
| 4 | **Changes Requested** *(new — replaces "Client Selected")* | `approval_status IN ('copy_changes_requested','final_changes_requested')` | Client kicked it back; needs concierge action. High-signal ops metric. |
| 5 | **Failed / Blocked** *(new — replaces "Final Approved")* | `approval_status IN ('generation_failed','retrying')` OR `failure_reason IS NOT NULL AND approval_status NOT IN ('approved_client','copy_approved')` | Pipeline issues that need engineering/concierge intervention. |

Notes:
- A single row moves between stages over its lifetime — counts are mutually exclusive at any moment, so when a batch flips from `sent_for_copy_review` to `copy_approved`, "Under Review" decreases and "Approved" increases automatically (matches the user's request).
- Counting is by **calendar** (sm2_generations row). If the user generates for April and May, that's 2 in "Generated", exactly as requested.

## Scope: which screens change

1. **`src/components/social/overview/AdminSocialOverview.tsx`** — replace the existing pipeline data fetch + `STAGE_ORDER`.
2. **`src/components/social/overview/ConciergeSocialOverview.tsx`** — currently has no funnel; add the same `<PipelineFunnel>` card so concierges see it too (the user explicitly asked for both).

Client overview is not changed (it already has a different "Awaiting Your Review" KPI).

## Implementation details

### AdminSocialOverview.tsx
- Replace `STAGE_ORDER` with the 5 new stages above (keep colors: blue, amber, primary, violet, destructive).
- Replace the `content_requests` query in the `Promise.all` block with a single `sm2_generations` query selecting `approval_status, sent_to_client_at, failure_reason` for the clinic.
- Aggregate counts in JS by mapping each row to one bucket using the rules above (priority order: Failed > Changes Requested > Approved > Under Review > Generated, so a row only lands in one bucket).
- Update the "Pipeline Health" KPI card: change `conversionPct` to `Approved / (Generated + Under Review + Approved + Changes Requested)` so it reflects the new model.
- Click handler on funnel still routes to the `generation` tab.

### ConciergeSocialOverview.tsx
- Add a new state `pipelineStages` and the same fetch/aggregation logic.
- Insert a `<Card>` containing `<PipelineFunnel>` as a new row between "Quick Actions" (Row 2) and "Review Queue + Hard Gates" (Row 3). Reuse the same header style (`Workflow` icon, "Content Pipeline Funnel" title).
- Click handler routes to `generation` tab.

### PipelineFunnel.tsx
- No structural changes needed. The grid is already `sm:grid-cols-5` which fits 5 stages.

## Out of scope

- No DB migration — reading existing `sm2_generations` columns only.
- No changes to client overview, generation tab, or the underlying SM2 worker.

## Validation

After implementation, on `/social?tab=overview` for a clinic with SM2 generations:
- Counts should be non-zero where the data exists.
- Approving a batch in "My Posts" → reload overview → that batch moves out of "Under Review" into "Approved".
- Generating a new month creates +1 in "Generated".
