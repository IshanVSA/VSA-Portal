

## Replace Browser-Level Confirm Dialogs with In-App AlertDialog

### Problem
Three places use the native browser `confirm()` dialog, which looks out of place in the dashboard. The user wants all confirmations to be styled within the app.

### Files to Modify

1. **`src/components/department/DepartmentChat.tsx`** — Delete message confirmation
2. **`src/pages/Clients.tsx`** — Remove client confirmation
3. **`src/pages/Employees.tsx`** — Delete team member confirmation

### Approach

For each file, replace the `confirm()` call with a state-driven `AlertDialog` (already available in `src/components/ui/alert-dialog.tsx`):

- Add state: `deleteTarget` (stores the id/name of the item pending deletion), set to `null` by default
- When the user clicks delete, set `deleteTarget` instead of calling `confirm()`
- Render an `AlertDialog` controlled by `!!deleteTarget`:
  - Title: "Delete message?" / "Remove client?" / "Delete team member?"
  - Description: "This cannot be undone."
  - Cancel button clears `deleteTarget`
  - Continue button executes the existing delete logic, then clears `deleteTarget`
- Styled consistently with the dashboard's dark theme

### Technical Details

- Import `AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle` from `@/components/ui/alert-dialog`
- Use destructive variant styling on the confirm button (`className="bg-destructive text-destructive-foreground"`)
- No database changes needed

