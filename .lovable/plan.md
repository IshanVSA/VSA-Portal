

## Problem

The "Preferences" tab (containing Theme Sliders and Hard Gates) is only visible to **client** users. Staff/concierge users cannot see or access it. Additionally, there is no dedicated Monthly Signals form for concierges to fill in campaign goals, budget, seasonal topics, and clinic news.

This means Phase 4 of the workflow is partially broken for staff:
- Theme Sliders: inaccessible to staff (tab hidden)
- Hard Gates: inaccessible to staff (tab hidden)
- Monthly Signals: no comprehensive editing UI exists (only partial data in preflight/overview)

## Plan

### Step 1: Add "Preferences" tab to staff tab bar

In `SocialMedia.tsx`, add `themeSlidersTab` to the staff `visibleTabs` array so concierges and admins can access the Theme Sliders and Hard Gates UI.

### Step 2: Build a Monthly Signals form

Create a new component `src/components/social/MonthlySignalsForm.tsx` that provides a full editing interface for all monthly signal fields:
- Campaign month number
- Monthly budget and currency
- Seasonal topics (tag input)
- Community events (tag input)
- Local alerts and local news (text areas)
- Clinic news this month (text area)
- Facebook-specific notes (text area)
- Active promotions (pulled from clinic_promotions table)
- Statutory holidays (auto-populated, with manual override)

This form will use the existing `useMonthlySignals` hook for read/write.

### Step 3: Add Monthly Signals form to the Preferences tab

Embed the new `MonthlySignalsForm` inside `ContentThemeSliders.tsx` (or rename it to a wrapper component) so all Phase 4 configuration lives in one tab -- visible to both staff and clients (with staff-only sections gated by role).

Layout order on the Preferences tab:
1. Theme Sliders (all users)
2. Monthly Signals form (staff only)
3. Hard Gates (staff only)

### Technical Details

- **Files modified**: `src/pages/SocialMedia.tsx`, `src/components/social/ContentThemeSliders.tsx`
- **Files created**: `src/components/social/MonthlySignalsForm.tsx`
- **Hook reused**: `useMonthlySignals` (no changes needed)
- **No database changes** -- all fields already exist in `clinic_monthly_signals` table

