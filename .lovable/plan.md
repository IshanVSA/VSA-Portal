

## Show Existing Same-Role Members on Clinic Assignment List

### What's happening now
When editing a team member's clinic assignments, the checkbox list shows clinic names only. There's no indication of who else with the same role is already assigned to each clinic.

### What changes

**File: `src/pages/Employees.tsx`**

In the Edit dialog's "Assigned Clinics" section (lines 376-395), enhance each clinic row to show the name(s) of existing team members who share the same `team_role` and are already assigned to that clinic.

1. Compute a helper inside the edit dialog render: for the current `editForm.team_role`, find all other staff members (excluding the user being edited) who have that same `team_role` and are assigned to each clinic
2. Build a map: `clinicId → string[]` of names of same-role members assigned to that clinic
3. In each clinic checkbox row, if there are existing same-role members for that clinic, render their names in a muted text span after the clinic name — e.g. `"Alma Vet Clinic (John Doe)"`
4. If multiple members share the role on the same clinic, comma-separate: `"Alma Vet Clinic (John Doe, Jane Smith)"`

### Logic detail

```text
// For the user being edited, get their team_role from editForm.team_role
// Find all other profiles with the same team_role (exclude editDialogUser.id)
// For each of those profiles, get their assigned clinic IDs
// Build Map<clinicId, memberName[]>
// Render next to clinic name as muted text
```

Only the clinic list rendering inside the edit dialog changes. No new files, no database changes.

