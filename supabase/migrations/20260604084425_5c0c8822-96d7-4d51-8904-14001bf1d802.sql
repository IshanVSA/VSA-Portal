CREATE POLICY "Clients can upload attachments to their own tickets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'department-files'
  AND (storage.foldername(name))[1] = 'tickets'
  AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.department_tickets dt
    WHERE dt.id = ((storage.foldername(name))[2])::uuid
      AND dt.created_by = auth.uid()
  )
);