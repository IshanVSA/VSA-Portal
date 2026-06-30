
-- Fan-out task assignments: when a task is created without a specific assignee,
-- broadcast it to every matching dept team member for the clinic (mirrors ticket fanout).
CREATE OR REPLACE FUNCTION public.fanout_task_candidates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    INSERT INTO public.department_task_candidates (task_id, user_id)
    SELECT NEW.id, u
    FROM public.list_assignees_for_dept(NEW.clinic_id, NEW.department) AS u
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fanout_task_candidates ON public.department_tasks;
CREATE TRIGGER trg_fanout_task_candidates
  AFTER INSERT ON public.department_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.fanout_task_candidates();

-- Backfill for existing unclaimed tasks that have no candidates yet
INSERT INTO public.department_task_candidates (task_id, user_id)
SELECT t.id, u
FROM public.department_tasks t
CROSS JOIN LATERAL public.list_assignees_for_dept(t.clinic_id, t.department) AS u
WHERE t.assigned_to IS NULL
  AND t.status IN ('todo'::public.task_status, 'in_progress'::public.task_status)
  AND NOT EXISTS (
    SELECT 1 FROM public.department_task_candidates c WHERE c.task_id = t.id
  )
ON CONFLICT DO NOTHING;
