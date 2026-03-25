-- Drop unused SQL encrypt/decrypt functions (encryption is handled in edge functions)
DROP FUNCTION IF EXISTS public.encrypt_credential(text);
DROP FUNCTION IF EXISTS public.decrypt_credential(text);