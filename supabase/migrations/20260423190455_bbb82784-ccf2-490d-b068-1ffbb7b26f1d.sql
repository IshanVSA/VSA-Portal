-- Drop the permissive "users can view their own" policy
DROP POLICY IF EXISTS "Users can view their own override logs" ON public.compliance_override_log;

-- Add restrictive policy: clinic team members can view logs for their clinic
CREATE POLICY "Clinic members can view their clinic override logs"
ON public.compliance_override_log
FOR SELECT
USING (
  clinic_id IS NOT NULL
  AND public.is_clinic_team_member(auth.uid(), clinic_id)
);

-- Admins policy already exists ("Admins can view all override logs")
-- Insert policy already exists ("Authenticated users can insert their own override logs")