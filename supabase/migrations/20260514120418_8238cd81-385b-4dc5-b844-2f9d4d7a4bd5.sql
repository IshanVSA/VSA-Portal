INSERT INTO public.department_ticket_assignments (ticket_id, department, status)
VALUES ('6ba9becd-b334-453a-848b-8d45defa44df','social_media','open')
ON CONFLICT DO NOTHING;

INSERT INTO public.department_ticket_candidates (ticket_id, department, user_id)
VALUES
  ('6ba9becd-b334-453a-848b-8d45defa44df','social_media','84ce297f-65e0-48c2-9e33-64156d743f6f'),
  ('6ba9becd-b334-453a-848b-8d45defa44df','social_media','dd66f8bc-0dfc-41f1-97f1-22f219af1f27'),
  ('6ba9becd-b334-453a-848b-8d45defa44df','social_media','2fb797f8-f8b8-46bf-b264-70bc1851f0b5')
ON CONFLICT DO NOTHING;