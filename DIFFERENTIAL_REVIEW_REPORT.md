# Differential Security Review

**Scope:** `6c2297a0..HEAD` (app code only: `src/`, `.env`)
**Changed files:** 2 (`src/components/DashboardLayout.tsx`, `.env`)
**Codebase size strategy:** SMALL diff / SURGICAL (large repo, isolated change)
**Overall risk:** LOW
**Confidence:** High — full diff read, all call sites of the changed symbols enumerated.

Note: the same commit range also adds ~9k lines under `.agents/skills/` (Trail of Bits skill
definitions, docs and Python scripts). These are inert data files, not shipped app code, and are
excluded from the security analysis below except where noted under Supply Chain.

---

## Phase 0 — Triage

| File | Change | Risk |
|------|--------|------|
| `src/components/DashboardLayout.tsx` | Nav item type widened (`path?`, `external?`); external `<a target="_blank">` branch; `openingExternal` loading state | LOW |
| `.env` | Adds `VITE_MARKETING_PLATFORM_URL` | LOW (info) |

No auth, crypto, RLS, SQL, edge function, or value-transfer code touched. No validation removed
(git diff shows additions and a refactor of existing className logic only).

---

## Phase 1 — Code Analysis

1. **External link handling** — `target="_blank"` is paired with `rel="noopener noreferrer"`.
   Correct: prevents reverse tabnabbing (`window.opener`) and referrer leakage of the portal URL
   (which can contain `?clinic=<uuid>`). No finding.
2. **URL source** — `import.meta.env.VITE_MARKETING_PLATFORM_URL` with a hardcoded fallback. The
   value is baked in at build time from `.env`, not user- or DB-controlled, so no open-redirect or
   `javascript:` URI injection path exists in the current design.
3. **Type widening** — `path` became optional. Every read was updated to `const itemPath = item.path || ""`,
   and `isDepartmentLocked` / `clinicSelectorPages` lookups are guarded by `!isExternal`. No
   `undefined` reaches route construction. `active` is forced `false` for external items, so no
   spurious highlight.
4. **Keying** — external items key on `item.external`, internal on `itemPath`. Unique within the
   list; no React reconciliation hazard.
5. **`openingExternal` state** — a `setTimeout` clears it after 1200ms with no cleanup on unmount.
   Cosmetic only (React 18 no longer warns; no leak of consequence). Not a security finding.

---

## Phase 2 — Test Coverage

No tests cover `DashboardLayout` nav rendering. Given the change is presentational and the
authorization boundary is elsewhere, missing tests do not elevate severity here.

---

## Phase 3 — Blast Radius

`DashboardLayout` renders on every authenticated route (high blast radius), but the diff's behavioral
surface is confined to the nav list rendering. The refactor extracted `linkClass`/`iconClass`/
`labelContent` shared by both branches, so internal nav links render byte-equivalent markup to before
(verified against the pre-change JSX). No transitive callers affected.

---

## Findings

### INFO-1 — Admin-only nav link is a client-side control, not an access boundary
`adminSections` (including Marketing Platform) is selected via `role === "admin"` in the browser.
Any user can read the bundled URL and visit `https://vsa-email-automation.lovable.app` directly.
This is expected — the link is discoverability, not authorization — but it means the marketing
platform **must enforce its own server-side authentication and role checks**. Confirm that app is
not relying on "only admins have the link."
**Severity:** Informational. **Action:** verify auth on the linked app; no change needed here.

### INFO-2 — Config exposure via `VITE_` prefix
`VITE_MARKETING_PLATFORM_URL` is inlined into the client bundle by design. Acceptable for a public
URL. Rule to keep: never put secrets behind a `VITE_` prefix.
**Severity:** Informational.

### INFO-3 — Supply chain: newly added skill scripts
`.agents/skills/supply-chain-risk-auditor/scripts/*.py` (~4k lines) arrived from an external repo.
They are not imported by the app, not part of the Vite build, and never execute during CI or runtime.
Risk is realized only if an agent or developer runs them. They were not line-audited in this review.
**Severity:** Informational. **Action:** treat as untrusted; review before executing.

---

## Coverage Limitations

- Skill files under `.agents/skills/` were not line-by-line audited (out of app scope).
- The linked marketing platform is a separate deployment; its auth posture was not assessed.
- No runtime/browser verification was performed; analysis is static.

## Verdict

**No security-relevant defects introduced.** Safe to ship. The one item worth confirming outside this
repo is that the marketing platform enforces its own authentication (INFO-1).
