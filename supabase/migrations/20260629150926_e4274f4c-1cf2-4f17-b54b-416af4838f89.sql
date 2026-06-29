REVOKE EXECUTE ON FUNCTION public.get_clinic_department_team(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_department_team(uuid, text[]) TO authenticated;