## Problem

The June post for Apollo Animal Hospital references the **Cloverdale Rodeo & Country Fair**, which actually runs in **May**. I verified in the DB:

- `clinic_monthly_signals` for Apollo / `2026-06` has **empty** `community_events`, `seasonal_topics`, `local_news`, and `statutory_holidays`.
- The Planner agent received empty arrays in the `MONTHLY SIGNAL LAYER` and **invented** a local event from its training data — landing on a May festival while writing the June plan.

So this is two issues combined:
1. The Planner is allowed to fabricate named local events when no signals are provided.
2. Nothing pre-populates June's community events for the clinic, so the prompt goes in empty.

## Fix

### 1. Lock down the Planner prompt (`supabase/functions/sm2-worker/index.ts`)
Add an explicit rule to `AGENT_PLANNER`:

- Named community events, festivals, fairs, parades, sporting events, holidays — may **only** be referenced if they appear in the supplied `COMMUNITY_EVENTS` or `STATUTORY_HOLIDAYS` arrays for `CURRENT_MONTH`.
- Never reference an event from a different month, even if it is locally famous.
- If `COMMUNITY_EVENTS` is empty, fall back to evergreen seasonal angles (weather, daylight, pet behaviour for the season) and clinic-DNA topics — no invented festival names, no "this weekend at the …".
- All `local_reference` values must be either: a landmark from `LOCAL_LANDMARKS`, the city/neighbourhood, or an event present in the supplied lists.

### 2. Tighten the Fact Checker (`AGENT_FACT_CHECKER`)
Add a hard check: if a post mentions a named festival/fair/parade/sporting event not present in `COMMUNITY_EVENTS` or `STATUTORY_HOLIDAYS` for `CURRENT_MONTH`, return verdict **FAIL** with issue `"references event outside current month or not in supplied signals"`. This will surface in the Reviewer batch and block auto-approval until fixed.

### 3. Surface empty-signal warning in the UI (`src/components/social/MonthlySignalsForm.tsx` and `ContentGenerationTab.tsx`)
Before kicking off SM2 generation, if `community_events`, `seasonal_topics`, and `local_news` are all empty for the target month, show a non-blocking warning banner:
> "No local events or seasonal topics set for {Month}. Content will be generated using evergreen angles only — add community events to get locally-grounded posts."

This makes it obvious to the concierge why posts feel generic, and stops silent fabrication.

### 4. (No DB schema changes, no migrations, no new tables.)

## Out of scope
- Auto-fetching community events from an external calendar — can be a follow-up if you want it. For now we rely on the concierge entering events into Monthly Signals (the existing flow), but the AI will no longer invent them.

## Verification
- Re-trigger generation for Apollo June with empty signals → posts must not name any festival/fair.
- Add a June event (e.g. "Surrey Fusion Festival") to Monthly Signals → that event should appear, Cloverdale Rodeo should not.
- Spot-check Fact Checker output: a planted "Cloverdale Rodeo" topic should come back as FAIL.
