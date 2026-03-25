-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create encrypt function (SECURITY DEFINER so it can access the key)
CREATE OR REPLACE FUNCTION public.encrypt_credential(plain_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF plain_text IS NULL OR plain_text = '' THEN
    RETURN plain_text;
  END IF;
  RETURN encode(
    pgp_sym_encrypt(plain_text, current_setting('app.encryption_key', true)),
    'base64'
  );
END;
$$;

-- Create decrypt function (SECURITY DEFINER, only callable server-side)
CREATE OR REPLACE FUNCTION public.decrypt_credential(encrypted_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF encrypted_text IS NULL OR encrypted_text = '' THEN
    RETURN encrypted_text;
  END IF;
  RETURN pgp_sym_decrypt(
    decode(encrypted_text, 'base64'),
    current_setting('app.encryption_key', true)
  );
END;
$$;

-- Revoke direct execute from public/anon, only service_role can call
REVOKE EXECUTE ON FUNCTION public.encrypt_credential(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.encrypt_credential(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.decrypt_credential(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decrypt_credential(text) TO service_role;