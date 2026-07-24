# Plan: Unified MetricCard primitive for dashboards

Refresh all dashboard KPI/Stats cards under one primitive with a refined Apple/Linear feel — tighter type scale, softer layered shadows, smoother spring hover motion, subtle gradient wash, better delta chips.

## Scope (only these are touched)

- `src/components/dashboard/KPICard.tsx` — used by Admin/Client/Concierge dashboards
- `src/components/StatsCard.tsx` — used across dashboards and misc pages
- Callers stay on the same props surface; no consumer refactors needed

Department KPI tiles (SeoKpiTile, FacebookInsightCard), content cards, and empty states are **out of scope** per your answer.

## New primitive

Create `src/components/ui/metric-card.tsx` — one component, variant-driven, backward-compatible with both existing prop shapes.

Props (superset of KPICard + StatsCard):
- `label` / `title` (alias)
- `value`
- `icon` (LucideIcon)
- `change` + `changeType: positive | negative | neutral`
- `description`
- `accent: blue | green | amber | purple | neutral` (was `gradient`)
- `href` (optional link wrap)
- `index` (stagger)
- `size: sm | md` (sm = current StatsCard, md = current KPICard)

## Visual system (Apple/Linear refined)

Tokens live in `src/index.css` so future cards can adopt them:
- `--shadow-card`: layered `0 1px 2px black/4%, 0 8px 24px -12px black/8%`
- `--shadow-card-hover`: `0 1px 2px black/5%, 0 20px 40px -16px black/14%`
- `--radius-card: 20px` (rounded-[20px], slightly tighter than current 2xl)
- Per-accent `--accent-*` hue tokens for icon chip + optional 1px gradient hairline

Card anatomy:
- Surface: `bg-card` with a very subtle top-to-bottom `bg-gradient-to-b from-card to-card/95`
- 1px border `border-border/50` + inner ring `ring-1 ring-inset ring-white/[0.02]` (dark) for depth
- Icon chip: 36px rounded-xl, tinted accent bg at 10%, icon at accent 100%
- Delta chip: pill, tabular-nums, arrow glyph (↑ ↓ –) + percent, accent-tinted
- Value: `text-[30px] font-semibold tracking-[-0.02em] tabular-nums`
- Label: `text-[12px] text-muted-foreground font-medium uppercase tracking-wide`

Motion (framer-motion, already installed):
- Entrance: opacity + 8px rise, spring `{ stiffness: 260, damping: 26 }`, 60ms stagger
- Hover: `y: -3`, shadow swap, icon chip scale 1.05 — spring, not tween
- Respect `prefers-reduced-motion` (freeze to static)
- Value uses a subtle count-up on mount when numeric

## Migration

1. Build `MetricCard` in `src/components/ui/metric-card.tsx`
2. Rewrite `KPICard.tsx` and `StatsCard.tsx` as thin wrappers that forward to `MetricCard` with the right `size` — zero changes required in dashboards
3. Add card shadow + radius tokens to `src/index.css`
4. Sanity-check the three dashboards render:
   - `src/components/dashboard/AdminDashboard.tsx`
   - `src/components/dashboard/ClientDashboard.tsx`
   - `src/components/dashboard/ConciergeDashboard.tsx`

## Out of scope

- Department tiles (SEO/Ads/Website/Social) — separate pass if you want
- Content, ticket, blog cards
- Empty/locked state cards
- Any business logic, data fetching, or route changes

## Technical notes

- No new deps; framer-motion already present
- Wrapper approach keeps `import { StatsCard }` / `import KPICard` working everywhere
- Semantic tokens only — no hardcoded colors, dark mode preserved
