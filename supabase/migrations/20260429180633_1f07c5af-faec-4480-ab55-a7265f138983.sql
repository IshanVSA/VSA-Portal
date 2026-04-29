UPDATE public.profiles p
SET welcome_email_sent_at = u.created_at
FROM auth.users u, public.user_roles ur
WHERE p.id = u.id
  AND ur.user_id = p.id
  AND ur.role = 'client'
  AND p.welcome_email_sent_at IS NULL;