-- Backfill existing sm2_generations rows to the new two-step approval vocabulary.
-- Old single-step rows already had images attached (old gate), so map them to the
-- final-review stage rather than restarting at copy review.

UPDATE public.sm2_generations
SET approval_status = 'sent_for_final_review'
WHERE approval_status = 'sent_to_client';

UPDATE public.sm2_generations
SET approval_status = 'final_changes_requested'
WHERE approval_status = 'feedback_submitted';

-- approved_client / approved_auto / pending / generation_failed / queued / processing / retrying
-- all remain unchanged.