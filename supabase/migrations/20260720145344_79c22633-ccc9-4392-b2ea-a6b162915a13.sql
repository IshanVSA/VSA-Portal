ALTER TABLE public.website_checklist_items
  ADD COLUMN IF NOT EXISTS checklist_type text NOT NULL DEFAULT 'delivery';

ALTER TABLE public.website_checklist_items
  DROP CONSTRAINT IF EXISTS website_checklist_items_checklist_type_check;
ALTER TABLE public.website_checklist_items
  ADD CONSTRAINT website_checklist_items_checklist_type_check
  CHECK (checklist_type IN ('delivery','maintenance'));

INSERT INTO public.website_checklist_items (section, label, position, checklist_type, is_active)
VALUES
  ('Maintenance', 'Themes & Plugins Update', 1, 'maintenance', true),
  ('Maintenance', 'Forms Submissions working', 2, 'maintenance', true),
  ('Maintenance', 'Pagespeed', 3, 'maintenance', true),
  ('Maintenance', 'Security', 4, 'maintenance', true)
ON CONFLICT DO NOTHING;