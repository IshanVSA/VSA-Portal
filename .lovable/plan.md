

## Replace Separate Date Pickers with a Single Date Range Selector

### What changes

Replace the two separate "Start Date" and "End Date" calendar popovers with a single date range picker using `Calendar mode="range"` (already used in `DateRangeFilter.tsx`).

### File to update

**`src/components/department/ticket-forms/PopupOffersForm.tsx`**

1. Replace the two state variables `startDate` and `endDate` with a single `dateRange: { from: Date | undefined; to: Date | undefined }` state
2. Remove the `grid grid-cols-2` section with two separate Popover/Calendar pickers
3. Add a single "Offer Period *" field with one Popover containing a `Calendar mode="range" numberOfMonths={2}` showing two months side by side
4. The trigger button displays the selected range as "Mar 24 – Apr 15, 2026" or "Pick date range" when empty
5. Update the `handleAutofill` callback to set `dateRange.from` and `dateRange.to` from voice dictation fields
6. Update the description serialization and `canVerify` check to use `dateRange.from` and `dateRange.to`
7. Keep the `disabled` logic preventing past dates, and the `locked` state after consent

