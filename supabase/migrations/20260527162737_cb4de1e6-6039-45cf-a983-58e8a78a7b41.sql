
CREATE TABLE public.website_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_checklist_items TO authenticated;
GRANT ALL ON public.website_checklist_items TO service_role;
ALTER TABLE public.website_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read checklist items" ON public.website_checklist_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'concierge'));
CREATE POLICY "Admin insert checklist items" ON public.website_checklist_items
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update checklist items" ON public.website_checklist_items
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete checklist items" ON public.website_checklist_items
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_website_checklist_items_updated_at
  BEFORE UPDATE ON public.website_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.website_checklist_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.website_checklist_items(id) ON DELETE CASCADE,
  is_done boolean NOT NULL DEFAULT false,
  completed_by uuid,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_checklist_status TO authenticated;
GRANT ALL ON public.website_checklist_status TO service_role;
ALTER TABLE public.website_checklist_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read checklist status" ON public.website_checklist_status
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'concierge'));
CREATE POLICY "Staff insert checklist status" ON public.website_checklist_status
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'concierge'));
CREATE POLICY "Staff update checklist status" ON public.website_checklist_status
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'concierge'));
CREATE POLICY "Staff delete checklist status" ON public.website_checklist_status
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'concierge'));

CREATE TRIGGER update_website_checklist_status_updated_at
  BEFORE UPDATE ON public.website_checklist_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_website_checklist_status_clinic ON public.website_checklist_status(clinic_id);

-- Seed
INSERT INTO public.website_checklist_items (section, label, position) VALUES
  ('Before Migration', 'Check old website''s phone number, fax, emails, addresses are added correctly', 1),
  ('Before Migration', 'All the required pages are developed correctly', 2),
  ('After Migration', 'All buttons (CTAs) and links are working properly', 1),
  ('After Migration', 'Add a New Client Registration Form with signature and PDF attachment', 2),
  ('After Migration', 'Add a Contact Us form', 3),
  ('After Migration', 'Add a Make an Appointment form', 4),
  ('After Migration', 'All forms are connected to the correct email addresses', 5),
  ('After Migration', 'Set up Mail SMTP for reliable email delivery', 6),
  ('After Migration', 'Install Yoast SEO plugin', 7),
  ('After Migration', 'Add Google reCAPTCHA for spam protection', 8),
  ('After Migration', 'Use only child themes for safe customization', 9),
  ('After Migration', 'Privacy Policy, Disclaimer Content', 10),
  ('After Migration', 'Meta Title, Meta Description are added (With Correct Phone number)', 11),
  ('After Migration', 'Add Schema', 12),
  ('After Migration', 'WP Consent Plugin and configuration', 13),
  ('After Migration', 'Check all the services pages, about us page, FAQs, puppy kitten content are updated along with meta title, meta description and schemas', 14),
  ('After Migration', 'In WordPress dashboard General settings update Site Title from WordPress to Website Name', 15),
  ('After Migration', 'After pagespeed optimization check forms are working along with signature in mobile and desktop both version', 16),
  ('After Migration', 'Add sitemap in search console', 17),
  ('After Migration', 'Disable schema from Yoast and keep only Schema Structure plugin schema (avoid duplication)', 18),
  ('After Migration', 'Add Favicon', 19),
  ('After Migration', 'Add Google Business Profile link in footer with social media links', 20),
  ('After Migration', 'Disable Comments', 21),
  ('After Migration', 'Footer Designed By VSA Logo should be uploaded on current website and use current website URL (not from other website)', 22);
