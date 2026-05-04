-- 1) Backfill the orphan attachment for the Cherry Knolls ticket so it appears
--    in the Edit dialog and Uploads tab immediately.
UPDATE public.department_tickets
SET attachments = ARRAY['tickets/f9c17c66-7be4-4b78-8ced-966c61445b31/2893b80a-5e4f-4834-ad5f-2ae1e428cc2a.jpg']::text[]
WHERE id = 'f9c17c66-7be4-4b78-8ced-966c61445b31'
  AND (attachments IS NULL OR cardinality(attachments) = 0);

-- 2) Allow the user who created a ticket to update that ticket's row.
--    Without this, the post-insert "save attachment paths" call from
--    NewTicketDialog silently fails for clients (RLS blocks the UPDATE),
--    leaving uploaded files orphaned in storage.
CREATE POLICY "Ticket creators can update their own tickets"
ON public.department_tickets
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());