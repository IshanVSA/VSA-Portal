
Goal: stop the sidebar lock badge from disappearing when switching departments.

What’s actually causing it
- The lock UI in `DashboardLayout.tsx` depends on `clinicAccess`.
- Every department page mounts its own `<DashboardLayout>`, so changing routes unmounts and remounts the entire layout.
- On each remount:
  - `clinicAccess` starts as `null`
  - `clinicAccessLoading` starts as `true`
  - `isDepartmentLocked()` returns `false`
- Result: the lock badge briefly renders hidden until the clinic access query finishes, which is the flicker you’re seeing.

Implementation plan

1. Make `DashboardLayout` persistent across department navigation
- Refactor routing in `src/App.tsx` to use a shared authenticated layout route instead of wrapping each page individually with `<DashboardLayout>`.
- Render `DashboardLayout` once and place department pages inside it with nested routes / outlet-style composition.
- This preserves sidebar state, clinic access state, and lock indicators while moving between departments.

2. Remove per-page layout wrapping
- Update department and workspace pages that currently return:
  - `<DashboardLayout> ...page content... </DashboardLayout>`
- Change them to return only their page content.
- Main targets:
  - `src/pages/WebsiteDepartment.tsx`
  - `src/pages/SeoDepartment.tsx`
  - `src/pages/GoogleAdsDepartment.tsx`
  - `src/pages/AiSeoDepartment.tsx`
  - `src/pages/SocialMedia.tsx`
  - plus other authenticated pages already using `DashboardLayout`

3. Keep clinic access loaded in one stable place
- Keep the clinic access fetch/subscription logic in `src/components/DashboardLayout.tsx`, but let it live for the whole authenticated session instead of per page.
- Preserve current behavior:
  - admin bypass
  - real-time updates from clinic access changes
  - fixed-width lock badge container

4. Make locked-state rendering stay stable during route transitions
- Since the layout will no longer remount, the sidebar badge should remain visible continuously.
- Also keep the existing fixed-width / opacity-based badge rendering so there is no layout twitching while navigating.

5. Clean up page transitions if needed
- Verify `PageTransition` only animates page content and does not force a layout reset.
- If necessary, keep the animation keyed to route content only, not the sidebar/layout shell.

Files to update
- `src/App.tsx`
- `src/components/DashboardLayout.tsx`
- authenticated pages currently wrapping themselves in `DashboardLayout`:
  - `src/pages/WebsiteDepartment.tsx`
  - `src/pages/SeoDepartment.tsx`
  - `src/pages/GoogleAdsDepartment.tsx`
  - `src/pages/AiSeoDepartment.tsx`
  - `src/pages/SocialMedia.tsx`
  - `src/pages/Dashboard.tsx`
  - `src/pages/Clinics.tsx`
  - `src/pages/ClinicDetail.tsx`
  - `src/pages/Employees.tsx`
  - `src/pages/Clients.tsx`
  - `src/pages/AdminReview.tsx`
  - `src/pages/Reports.tsx`
  - `src/pages/Settings.tsx`

Expected result
- The selected clinic remains stable.
- Sidebar lock badges remain visible continuously when moving between departments.
- No half-second unlock flash.
- Department pages still keep their own loading/locked/content transitions, but the sidebar shell no longer resets on navigation.

Technical note
- This is a structural fix, not just a styling fix. Trying to mask the flicker inside the current setup would be less reliable because the root problem is that the entire dashboard shell is being recreated on every department route change.
