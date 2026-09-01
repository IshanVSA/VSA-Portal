
REVOKE ALL ON FUNCTION public.create_clinic_onboarding_tasks(uuid, text, department_type, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_clinic_onboarding_tasks() FROM PUBLIC, anon, authenticated;
