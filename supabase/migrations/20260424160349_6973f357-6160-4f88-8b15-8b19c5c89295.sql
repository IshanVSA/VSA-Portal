
ALTER TABLE public.sm2_posts
  ADD COLUMN IF NOT EXISTS run_meta_ad boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sm2_posts_run_meta_ad_idx
  ON public.sm2_posts (clinic_id, run_meta_ad)
  WHERE run_meta_ad = true;

CREATE OR REPLACE FUNCTION public.enforce_sm2_meta_ad_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_count integer;
BEGIN
  IF NEW.run_meta_ad = true THEN
    SELECT COUNT(*) INTO selected_count
    FROM public.sm2_posts
    WHERE generation_id = NEW.generation_id
      AND run_meta_ad = true
      AND id <> NEW.id;
    IF selected_count >= 2 THEN
      RAISE EXCEPTION 'Maximum 2 posts can be selected for Meta Ads per generation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sm2_posts_meta_ad_limit ON public.sm2_posts;
CREATE TRIGGER sm2_posts_meta_ad_limit
  BEFORE INSERT OR UPDATE OF run_meta_ad ON public.sm2_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sm2_meta_ad_limit();
