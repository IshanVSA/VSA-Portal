# Brand DNA — Two-Pane Navigator Redesign

Replace the current long, vertically stacked Brand DNA layout with a two-pane "layers navigator" inspired by your reference: a left rail of Layers, a right detail panel that swaps based on selection. Keeps all existing data, actions, edit flows, and role gating — only the presentation changes.

## Target layout

```text
┌─ Header (clinic name + Export / Re-synthesize) ─────────────────┐
│                                                                 │
├──────── LAYERS ────────┬────────── DETAIL PANEL ────────────────┤
│ • Synthesis            │ SYNTHESIS · THE BRAND DNA              │
│ • Website   [verified] │                                        │
│ • Reviews    5 / 141   │ Narrative anchor   [SYNTHESIZED]       │
│ • Owner call [pending] │ ────────────────────────────────       │
│ • Locality  [verified] │ Differentiator | Target client          │
│ • Tasks     [4 critical]│ Voice fingerprint chips               │
│                        │ Compliance · CVBC                      │
└────────────────────────┴────────────────────────────────────────┘
```

## Layer rail (left)

Single column inside a `Card`, each row shows:
- Status dot (active = primary, otherwise muted)
- Label
- Right-side meta badge driven by current data:
  - Synthesis → `synthesized` / `pending`
  - Website → `verified` if `website_extraction` exists, else `pending`
  - Reviews → `{review_count} / {total_reviews_on_google}` if mined, else `pending`
  - Owner call → `{answered}/10` answered (e.g. `4 / 10` or `pending`)
  - Locality → `verified` if `locality` exists, else `pending`
  - Tasks → count of `vedant_review_checklist` items still unchecked, tinted critical/amber

Active row gets the primary tint background and dot; sticky on desktop.

## Detail panels (right)

One panel per layer, all data sourced from current hooks / fields — no schema changes:

1. **Synthesis** — Narrative anchor, Differentiator, Target client (2-col grid), Voice fingerprint chips, Compliance summary line ("CVBC · 2 active rules · review reproduction suppressed"). Reuses fields from `AdminDNAProfileCard` but laid out in the new compact card style. Edit/Save buttons live in this panel.
2. **Website** — Existing `WebsiteExtractionCard` content (hospital name, phone, hours, services, doctors, brand identity), shown in this panel only.
3. **Reviews** — Existing `ReviewMiningCard` content (themes, sentiment, signals).
4. **Owner call** — The 10-question Q&A grid + Additional details, with the current Edit / Save / Cancel toolbar moved into the panel header.
5. **Locality** — Existing `LocalityCard` content.
6. **Tasks** — `Improve Score Checklist` + Vedant Review Checklist + Activate button (admin only), all consolidated here.

Header stays at the top with score ring, status badge and the per-layer action buttons (Re-synthesize, Mine Reviews, Fetch Locality, Extract Website) shown contextually based on the active layer (e.g. Website panel only shows "Extract Website").

## Behavior

- Selected layer persisted in component state (default `synthesis`, or first layer with data if none synthesized).
- On mobile (<md), the rail collapses to a horizontal scroll of pill tabs above the panel.
- Empty states unchanged — the matching panel shows the existing "no data yet" copy with the relevant action button.
- Role gating preserved: clients still see read-only; admin/concierge see edit + activation.

## Technical notes

Single-file refactor of `src/components/social/BrandDNATab.tsx`:
- Extract the existing `WebsiteExtractionCard`, `ReviewMiningCard`, `LocalityCard`, `SynthesizedProfileCard`, `ImproveScoreChecklist` (already in the file) into the panel switcher — no logic change inside them, just moved into a `Tabs`/conditional render driven by `activeLayer`.
- Add a small `LayerRail` subcomponent (purely presentational) computing the meta badges from `dna`, `websiteExtraction`, `reviewMining`, `localityData`, `synthesizedProfile`, `answeredCount`, `vedant_review_checklist`.
- Use `react-resizable-panels` (already in repo) or a plain `grid grid-cols-[220px_1fr]` — going with the simple grid to match the reference's fixed rail.
- No DB, hook, or edge-function changes. `AdminDNAProfileCard` keeps its own card chrome but renders inside the Synthesis panel; the Team Review Checklist moves to the Tasks panel via a small prop split (`section: "synthesis" | "tasks"`).

## Out of scope

- No changes to data model, AI pipelines, or activation logic.
- No changes to `BrandDNAForm` (client-facing questionnaire).
- No changes to other Social tabs.
