-- Allow parent client users to view profiles of their sub-accounts
CREATE POLICY "Parents can view sub-account profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.client_sub_accounts csa
    WHERE csa.sub_user_id = profiles.id
      AND csa.parent_user_id = auth.uid()
  )
);