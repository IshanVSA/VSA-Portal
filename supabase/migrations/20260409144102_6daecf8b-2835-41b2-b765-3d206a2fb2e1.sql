UPDATE clinic_gbp_config SET
  country = 'CA',
  state_or_province = 'BC',
  city = 'Vancouver',
  booking_url = 'https://almavets.ca/',
  governing_body = 'CVBC',
  after_hours_referral = 'Canada West Veterinary Specialists & Critical Care',
  species_treated = ARRAY['Dogs', 'Cats', 'Kittens'],
  accreditations = ARRAY['VOKRA rescue partner'],
  content_exclusions = ARRAY['euthanasia', 'graphic surgical images'],
  voice_fingerprint = 'warm, educational, community-focused, new-pet-owner friendly',
  narrative_anchor = 'A neighbourhood clinic in West Point Grey where first-time pet parents and seasoned owners alike receive thorough, transparent care — guided by Dr. Munjal and a team known for patience and clear communication.',
  clinic_differentiator = 'Trusted first-visit destination for new pet owners; VOKRA rescue adoption partner; transparent pricing; Dr. Munjal as named trust anchor with strong personal brand equity',
  neighbourhood_character = 'Affluent, tree-lined residential area near UBC and Pacific Spirit Park. Mix of heritage homes and families. Strong dog-walking culture with nearby off-leash beaches (Spanish Banks, Jericho). Coyote-aware community.',
  founding_story = '',
  top_services = ARRAY['Wellness Exams', 'Vaccinations', 'Spay & Neuter', 'Dental Care', 'Kitten Adoption Support', 'New Pet Consultations']
WHERE clinic_id = 'b82b1dac-e3bc-447e-be0d-b93e10e44399';
