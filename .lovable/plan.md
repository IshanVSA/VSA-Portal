## Problem

When using **Add/Remove Team Members** with multiple "Add" members in a single ticket, all photos go into one shared attachments list. The team can't tell which photo belongs to which person because uploaded files are stored under random UUID names and the form's only hint is a vague "name files after the member" instruction users rarely follow.

## Solution

Make each "Add" member row carry **its own photo upload slot** directly inside `AddRemoveTeamForm`. The global attachments section in the ticket dialog is hidden for this ticket type, so there's no ambiguity — a photo physically lives next to the member it belongs to, both in the UI and in the saved description.

## Changes

### 1. `AddRemoveTeamForm.tsx` — per-member photo slot
- Extend each `TeamMemberEntry` with `photo: AttachedFile | null` (only used when `action === "add"`).
- Render a compact single-file uploader inside each "Add" member card (drag-drop or click; image types only). "Remove" rows keep no uploader.
- Lift files up via a new `onFilesChange(files: { file, memberName, memberIndex }[])` callback so the parent dialog can upload them.
- In the generated description, replace the trailing "(See attachments…)" hint with explicit per-member lines like:
  ```
  #1 — Add
    Name: Dr. Jane Smith
    Photo: jane-smith-1.jpg
  ```
- Show an inline warning on any "Add" row missing a photo (non-blocking, but visible).

### 2. `NewTicketDialog.tsx` — wire the per-member files
- For ticket type `Add/Remove Team Members`, hide the existing generic attachments section (same pattern already used for `New Forms`).
- Accept the member-tagged file list from `AddRemoveTeamForm` and pass it through to `uploadFiles`.
- In `uploadFiles`, when a file has an attached `memberName`, prefix the storage filename with a slugified member name (e.g. `jane-smith__<uuid>.jpg`) so it's self-describing in storage and in the ticket's attachments list.

### 3. `TicketEditDialog.tsx` — no schema change required
The existing attachments list already shows filenames; with the slug prefix, each photo will visibly read like `jane-smith__abcd.jpg`, matching the description block.

## Technical notes

- No DB migration: `attachments` stays a `text[]` of storage paths.
- Reuses the existing `department-files` bucket and `AttachedFile` / `FileUploader` types.
- Slugify helper: lowercase, strip non-alphanumerics, collapse to dashes, max 40 chars; fallback to `member-<index>` if name empty at upload time.
- Validation stays as-is; photo is encouraged but not strictly required (matches current behaviour where attachments are optional).