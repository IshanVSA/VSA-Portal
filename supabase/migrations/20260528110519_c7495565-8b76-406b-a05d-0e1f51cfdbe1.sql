UPDATE public.sm2_generations
SET approval_status = 'approved_client',
    approved_at = COALESCE(approved_at, now())
WHERE approval_status = 'copy_approved';

UPDATE public.sm2_generations
SET approval_status = 'sent_for_final_review'
WHERE approval_status = 'sent_for_copy_review';