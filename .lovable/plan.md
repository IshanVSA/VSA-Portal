I found the root cause. The clinic delete is not failing because the button or main `delete_clinic_by_id` RPC is missing the clinic id. It is failing because deleting a clinic cascades into `clinic_gbp_config`, and that table has an `AFTER DELETE` trigger that runs `regenerate_gbp_batches()`. That trigger contains:

```sql
DELETE FROM public.gbp_batches;
```

Your database has the `pg-safeupdate` behavior enabled, so any `DELETE` without a `WHERE` clause throws exactly the toast you’re seeing: `DELETE requires a WHERE clause`.

Previous fixes focused on the clinic delete function, but the error is coming from this secondary trigger fired during cascade cleanup.

Plan to fix it correctly:

1. Replace the unsafe GBP batch regeneration delete
   - Update `public.regenerate_gbp_batches()` so it no longer uses a bare `DELETE FROM public.gbp_batches;`.
   - Use a safe, explicit condition such as:
     ```sql
     DELETE FROM public.gbp_batches WHERE id IS NOT NULL;
     ```
   - This satisfies safe-update rules while preserving the intended “clear and rebuild batches” behavior.

2. Make the batch cleanup robust for future data
   - Since `gbp_post_history.batch_id` and `gbp_compliance_scans.batch_id` reference `gbp_batches(id)`, first null out those nullable references before clearing batches:
     ```sql
     UPDATE public.gbp_post_history SET batch_id = NULL WHERE batch_id IS NOT NULL;
     UPDATE public.gbp_compliance_scans SET batch_id = NULL WHERE batch_id IS NOT NULL;
     DELETE FROM public.gbp_batches WHERE id IS NOT NULL;
     ```
   - Current data has zero rows using those batch references, but this prevents the next failure once batch history exists.

3. Simplify `delete_clinic_by_id`
   - Keep admin-only validation via `public.has_role(auth.uid(), 'admin')`.
   - Stop manually deleting rows that already have `ON DELETE CASCADE` unless required.
   - Delete direct children with non-cascading relationships only where needed, then delete the clinic by id.
   - Keep all delete/update statements safe-update compatible with explicit `WHERE` clauses.

4. Improve the UI error handling on `/clinics`
   - Keep calling `supabase.rpc('delete_clinic_by_id', { _clinic_id: targetId })`.
   - Show a clearer toast if the backend returns a constraint/safe-update/database error.
   - Refresh the clinic list after success so the UI matches the database.

5. Verify the actual path
   - Re-check the live database function definitions after migration.
   - Test deleting a clinic that has GBP config rows, because that is the path currently triggering the hidden `gbp_batches` failure.
   - Confirm the clinic disappears and no `DELETE requires a WHERE clause` toast appears.