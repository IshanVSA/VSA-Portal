
ALTER TABLE public.client_sub_accounts DROP CONSTRAINT IF EXISTS client_sub_accounts_sub_user_id_key;
ALTER TABLE public.client_sub_accounts ADD CONSTRAINT client_sub_accounts_parent_sub_unique UNIQUE (parent_user_id, sub_user_id);

CREATE OR REPLACE FUNCTION public.sub_account_hides_financials(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.client_sub_accounts
    WHERE sub_user_id = _user_id AND hide_financials = true
  )
$function$;
