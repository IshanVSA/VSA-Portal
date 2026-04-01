

## Fix: Add Client Journey to Dashboard Sidebar

The Client Journey link exists in `AppSidebar.tsx`, but the app actually uses the sidebar defined in `DashboardLayout.tsx`. The item needs to be added there.

### Changes — `src/components/DashboardLayout.tsx`

1. **Import `Milestone` icon** (already imported in the file's import list — need to verify, if not, add it).

2. **Add "Client Journey" nav item** to all three role sections, placed after "Book a Meeting":

   - **`adminSections`** (line 69): Add `{ label: "Client Journey", icon: Milestone, path: "/client-journey" }` to the first section's items array, after "Book a Meeting".
   
   - **`conciergeSections`** (line 92): Same placement — after "Book a Meeting" in the first section.
   
   - **`clientSections`** (line 248): Same placement — after "Book a Meeting" in the first section.

3. **Add page title mapping** (line 111): Add `"/client-journey": "Client Journey"` to `pageTitles`.

This is a straightforward 4-line addition across the file. No other files need changes.

