-- Update client read policy on sm2_posts to include new two-step approval statuses
DROP POLICY IF EXISTS "Clients view shared sm2_posts" ON public.sm2_posts;
CREATE POLICY "Clients view shared sm2_posts"
ON public.sm2_posts
FOR SELECT
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
  AND generation_id IN (
    SELECT id FROM public.sm2_generations
    WHERE approval_status = ANY (ARRAY[
      'sent_to_client',
      'approved_client',
      'feedback_submitted',
      'sent_for_copy_review',
      'copy_approved',
      'copy_changes_requested',
      'sent_for_final_review',
      'final_changes_requested',
      'approved_auto'
    ])
  )
);

-- Update client update (feedback) policy to include the same statuses
DROP POLICY IF EXISTS "Clients update feedback on sm2_posts" ON public.sm2_posts;
CREATE POLICY "Clients update feedback on sm2_posts"
ON public.sm2_posts
FOR UPDATE
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
  AND generation_id IN (
    SELECT id FROM public.sm2_generations
    WHERE approval_status = ANY (ARRAY[
      'sent_to_client',
      'approved_client',
      'feedback_submitted',
      'sent_for_copy_review',
      'copy_approved',
      'copy_changes_requested',
      'sent_for_final_review',
      'final_changes_requested',
      'approved_auto'
    ])
  )
);