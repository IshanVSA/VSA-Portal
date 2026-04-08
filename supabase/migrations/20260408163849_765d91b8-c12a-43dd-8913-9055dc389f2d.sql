
-- ============================================
-- Batch 3: sm2_post_performance table
-- ============================================
CREATE TABLE public.sm2_post_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES public.sm2_generations(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  post_number INTEGER NOT NULL DEFAULT 1,
  platform TEXT NOT NULL DEFAULT 'facebook',
  likes INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sm2_post_performance ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sm2_perf_clinic ON public.sm2_post_performance(clinic_id);
CREATE INDEX idx_sm2_perf_generation ON public.sm2_post_performance(generation_id);

CREATE POLICY "Admins full access on sm2_post_performance"
  ON public.sm2_post_performance FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view sm2_post_performance"
  ON public.sm2_post_performance FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (
    SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()
  ));

CREATE POLICY "Concierges can insert sm2_post_performance"
  ON public.sm2_post_performance FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (
    SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()
  ));

CREATE POLICY "Clients can view own sm2_post_performance"
  ON public.sm2_post_performance FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (
    SELECT id FROM clinics WHERE owner_user_id = auth.uid()
  ));

-- ============================================
-- Batch 5: statutory_holidays_reference table
-- ============================================
CREATE TABLE public.statutory_holidays_reference (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  province TEXT NOT NULL,
  holiday_name TEXT NOT NULL,
  month INTEGER NOT NULL,
  day_of_month INTEGER,
  day_rule TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.statutory_holidays_reference ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_stat_holidays_province ON public.statutory_holidays_reference(province);
CREATE INDEX idx_stat_holidays_month ON public.statutory_holidays_reference(month);

CREATE POLICY "Authenticated can view statutory_holidays_reference"
  ON public.statutory_holidays_reference FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins full access on statutory_holidays_reference"
  ON public.statutory_holidays_reference FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed data: National holidays (all provinces)
INSERT INTO public.statutory_holidays_reference (province, holiday_name, month, day_of_month) VALUES
('ALL', 'New Year''s Day', 1, 1),
('ALL', 'Canada Day', 7, 1),
('ALL', 'Labour Day', 9, NULL),
('ALL', 'Christmas Day', 12, 25),
('ALL', 'Truth and Reconciliation Day', 9, 30);

-- Seed: province-specific holidays
INSERT INTO public.statutory_holidays_reference (province, holiday_name, month, day_of_month, day_rule) VALUES
('BC', 'Family Day', 2, NULL, '3rd Monday'),
('BC', 'Good Friday', 3, NULL, 'varies'),
('BC', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('BC', 'BC Day', 8, NULL, '1st Monday'),
('BC', 'Thanksgiving', 10, NULL, '2nd Monday'),
('BC', 'Remembrance Day', 11, 11, NULL),
('AB', 'Family Day', 2, NULL, '3rd Monday'),
('AB', 'Good Friday', 3, NULL, 'varies'),
('AB', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('AB', 'Heritage Day', 8, NULL, '1st Monday'),
('AB', 'Thanksgiving', 10, NULL, '2nd Monday'),
('AB', 'Remembrance Day', 11, 11, NULL),
('ON', 'Family Day', 2, NULL, '3rd Monday'),
('ON', 'Good Friday', 3, NULL, 'varies'),
('ON', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('ON', 'Civic Holiday', 8, NULL, '1st Monday'),
('ON', 'Thanksgiving', 10, NULL, '2nd Monday'),
('ON', 'Boxing Day', 12, 26, NULL),
('QC', 'Good Friday', 3, NULL, 'varies'),
('QC', 'Victoria Day (Journée nationale des patriotes)', 5, NULL, 'Monday before May 25'),
('QC', 'Saint-Jean-Baptiste Day', 6, 24, NULL),
('QC', 'Thanksgiving', 10, NULL, '2nd Monday'),
('SK', 'Family Day', 2, NULL, '3rd Monday'),
('SK', 'Good Friday', 3, NULL, 'varies'),
('SK', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('SK', 'Saskatchewan Day', 8, NULL, '1st Monday'),
('SK', 'Thanksgiving', 10, NULL, '2nd Monday'),
('SK', 'Remembrance Day', 11, 11, NULL),
('MB', 'Louis Riel Day', 2, NULL, '3rd Monday'),
('MB', 'Good Friday', 3, NULL, 'varies'),
('MB', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('MB', 'Civic Holiday', 8, NULL, '1st Monday'),
('MB', 'Thanksgiving', 10, NULL, '2nd Monday'),
('MB', 'Remembrance Day', 11, 11, NULL),
('NB', 'Family Day', 2, NULL, '3rd Monday'),
('NB', 'Good Friday', 3, NULL, 'varies'),
('NB', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('NB', 'New Brunswick Day', 8, NULL, '1st Monday'),
('NB', 'Thanksgiving', 10, NULL, '2nd Monday'),
('NB', 'Remembrance Day', 11, 11, NULL),
('NS', 'Heritage Day', 2, NULL, '3rd Monday'),
('NS', 'Good Friday', 3, NULL, 'varies'),
('NS', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('NS', 'Natal Day', 8, NULL, '1st Monday'),
('NS', 'Thanksgiving', 10, NULL, '2nd Monday'),
('NS', 'Remembrance Day', 11, 11, NULL),
('PE', 'Islander Day', 2, NULL, '3rd Monday'),
('PE', 'Good Friday', 3, NULL, 'varies'),
('PE', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('PE', 'Civic Holiday', 8, NULL, '1st Monday'),
('PE', 'Thanksgiving', 10, NULL, '2nd Monday'),
('PE', 'Remembrance Day', 11, 11, NULL),
('NL', 'St. Patrick''s Day', 3, NULL, 'nearest Monday'),
('NL', 'Good Friday', 3, NULL, 'varies'),
('NL', 'St. George''s Day', 4, NULL, 'nearest Monday'),
('NL', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('NL', 'Discovery Day', 6, NULL, 'nearest Monday to June 24'),
('NL', 'Orangemen''s Day', 7, NULL, 'nearest Monday to July 12'),
('NL', 'Thanksgiving', 10, NULL, '2nd Monday'),
('NL', 'Remembrance Day', 11, 11, NULL),
('YT', 'Heritage Day', 2, NULL, 'Friday before last Sunday'),
('YT', 'Good Friday', 3, NULL, 'varies'),
('YT', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('YT', 'Discovery Day', 8, NULL, '3rd Monday'),
('YT', 'Thanksgiving', 10, NULL, '2nd Monday'),
('YT', 'Remembrance Day', 11, 11, NULL),
('NT', 'Good Friday', 3, NULL, 'varies'),
('NT', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('NT', 'National Indigenous Peoples Day', 6, 21, NULL),
('NT', 'Civic Holiday', 8, NULL, '1st Monday'),
('NT', 'Thanksgiving', 10, NULL, '2nd Monday'),
('NT', 'Remembrance Day', 11, 11, NULL),
('NU', 'Good Friday', 3, NULL, 'varies'),
('NU', 'Victoria Day', 5, NULL, 'Monday before May 25'),
('NU', 'Nunavut Day', 7, 9, NULL),
('NU', 'Civic Holiday', 8, NULL, '1st Monday'),
('NU', 'Thanksgiving', 10, NULL, '2nd Monday'),
('NU', 'Remembrance Day', 11, 11, NULL);

-- Populate function
CREATE OR REPLACE FUNCTION public.populate_monthly_holidays(
  _clinic_id UUID,
  _month INTEGER,
  _province TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  holidays JSONB;
  month_year TEXT;
BEGIN
  month_year := to_char(make_date(EXTRACT(YEAR FROM now())::int, _month, 1), 'YYYY-MM');
  
  SELECT jsonb_agg(jsonb_build_object(
    'name', holiday_name,
    'day', COALESCE(day_of_month, 0),
    'rule', COALESCE(day_rule, 'fixed')
  ))
  INTO holidays
  FROM public.statutory_holidays_reference
  WHERE (province = _province OR province = 'ALL')
    AND month = _month;

  UPDATE public.clinic_monthly_signals
  SET statutory_holidays = COALESCE(holidays, '[]'::jsonb)
  WHERE clinic_id = _clinic_id AND month_year = month_year;
END;
$$;
