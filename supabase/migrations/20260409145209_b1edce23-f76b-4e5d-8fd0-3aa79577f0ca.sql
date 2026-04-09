
-- Bulk backfill: BC clinics
UPDATE clinic_gbp_config SET
  country = 'CA', state_or_province = 'BC', governing_body = 'CVBC',
  stat_holiday_protocol = COALESCE(stat_holiday_protocol, 'CONFIRM ANNUALLY')
WHERE jurisdiction = 'BC' AND country IS NULL;

-- CA-OTHER clinics (Alberta)
UPDATE clinic_gbp_config SET
  country = 'CA', governing_body = 'ABVMA',
  stat_holiday_protocol = COALESCE(stat_holiday_protocol, 'CONFIRM ANNUALLY')
WHERE jurisdiction = 'CA-OTHER' AND country IS NULL;

-- US clinics
UPDATE clinic_gbp_config SET
  country = 'US',
  stat_holiday_protocol = COALESCE(stat_holiday_protocol, 'CONFIRM ANNUALLY')
WHERE jurisdiction = 'US' AND country IS NULL;

-- City parsing for each clinic (BC)
UPDATE clinic_gbp_config SET city = 'Surrey' WHERE clinic_id = '0900d007-5480-44c7-b0e1-c4d688d05a6a' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Ladner' WHERE clinic_id = '417749c9-688a-4757-85aa-83fcef8f9e72' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Abbotsford' WHERE clinic_id = 'e1b5d5e5-3fbe-4ccc-b4b5-4961f55838e2' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Vancouver' WHERE clinic_id = '2bdf419c-6e48-4744-83d5-2df817ab9f2e' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Squamish' WHERE clinic_id = '5167ce08-3378-4982-9ff3-650c781e963c' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Abbotsford' WHERE clinic_id = 'f80f7ace-0f91-434f-b64a-595a1fa92f1e' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Vancouver' WHERE clinic_id = '6e644265-c74a-412b-beb9-cac295d0485e' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Surrey' WHERE clinic_id = 'ee1ac34c-c03f-42cc-8277-ef16de9421b5' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Vancouver' WHERE clinic_id = '932167be-dc75-45be-b1c0-f7cbb89ec701' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Surrey' WHERE clinic_id = '40383268-a6b5-4346-bbdc-d0a4c9a4e48a' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Calgary', state_or_province = 'AB' WHERE clinic_id = '91ffa0cb-2732-491a-a9ce-7f667593fac9' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Burnaby' WHERE clinic_id = '62ecb5aa-79a3-4a41-a7a0-114541148286' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Surrey' WHERE clinic_id = '999d7f85-4e09-471b-b4b2-1d036cfbcd11' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Surrey' WHERE clinic_id = '0a9e6f0e-0267-4237-9e51-932e13ed7701' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Centennial', state_or_province = 'CO', governing_body = 'CVMA-CO' WHERE clinic_id = '02e91b1b-bb3a-414c-94e2-e338495123fc' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Nanaimo' WHERE clinic_id = '75a4dc43-b4a3-40cc-98bc-f02574731f01' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Vancouver' WHERE clinic_id = '659316b7-129c-4bb0-ae5b-6f50a2ffe016' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Burnaby' WHERE clinic_id = 'e17367f2-985c-4bcc-83a7-a1da26b8418d' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Vancouver' WHERE clinic_id = '559cc408-08ee-453f-9aa5-26c995e3ed34' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Surrey' WHERE clinic_id = '7ba3a8ff-870f-4105-8f5d-38eaacfd6f77' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Abbotsford' WHERE clinic_id = '510af439-f6d3-4084-9398-14464b7ec9c3' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Maple Ridge' WHERE clinic_id = '6fef11e6-fb97-4df5-b11b-06b7bfec864e' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Nanaimo' WHERE clinic_id = '7bd519aa-5c88-4df1-8966-681c3eb6bf11' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Vancouver' WHERE clinic_id = '4f5cd601-9c46-42c4-935c-9c92a9459874' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Vancouver' WHERE clinic_id = '333e3904-8ca3-4faa-b7ff-53cd67a0ba64' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Langley' WHERE clinic_id = '2128c8cf-874d-488c-baa2-7cfee120c5af' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Langley' WHERE clinic_id = '9b737aa6-c818-4cdb-b7e2-d5f2af950e0f' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Mission' WHERE clinic_id = 'b6dc0075-a038-4bb2-89b8-a65b98d577b8' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Surrey' WHERE clinic_id = 'c9a87c63-d2bc-44c5-a239-b725a3c7afea' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Kelowna' WHERE clinic_id = 'e0ed61d0-4e86-4321-8859-626633bf2a2f' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Victoria' WHERE clinic_id = 'c9220dc6-efe8-49e0-9d35-5d2493a000a2' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Coquitlam' WHERE clinic_id = '1792f729-4708-4e91-b7d7-2e084ecf2c15' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'North Vancouver' WHERE clinic_id = '9b056c3f-30a4-47aa-9e42-6bfb0f46f138' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Calgary', state_or_province = 'AB' WHERE clinic_id = '3d5503a4-2ff5-4cbd-9d3b-681c7c3dea86' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'San Francisco', state_or_province = 'CA', governing_body = 'CVMB' WHERE clinic_id = '6489ba8f-4906-4444-b7c9-d913fc3f01bb' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Surrey' WHERE clinic_id = '6c5b5b97-7d23-48c9-b98b-a3abdc4eaf08' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Penticton' WHERE clinic_id = '8cd3b411-1e2f-401b-997d-29b11d5f4369' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Port Coquitlam' WHERE clinic_id = '96800cc0-8415-4803-8708-51d85453a6bf' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Vancouver' WHERE clinic_id = '54931640-1923-4145-b24a-456a54de4970' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Sedro-Woolley', state_or_province = 'WA', governing_body = 'WSVMA' WHERE clinic_id = '2d11c888-f9e3-4b03-9eb2-5146615df013' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Abbotsford' WHERE clinic_id = 'ae92b66d-207e-4f1f-a49b-ef3fa5625f31' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Port Coquitlam' WHERE clinic_id = 'bff37f4e-724c-4879-bc23-dbc3138b63c3' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Surrey' WHERE clinic_id = '90ed4cf0-77e0-46a3-9dca-bd64c46bd5a0' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Palo Alto', state_or_province = 'CA', governing_body = 'CVMB' WHERE clinic_id = 'a8c8c89c-508b-4f5b-a52e-7a2cbee98ae7' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Vancouver' WHERE clinic_id = '8dc94ae6-b8cb-4a91-b26b-a6640a6f1ea0' AND city IS NULL;
UPDATE clinic_gbp_config SET city = 'Langley' WHERE clinic_id = '29836e48-a149-4d37-a952-51740f967737' AND city IS NULL;

-- Sync synthesized DNA fields for 108th Ave Animal Hospital
UPDATE clinic_gbp_config SET
  voice_fingerprint = 'the kind of veterinary care you would want for your own pet; at a price that is fair; walk-ins always welcome; open 7 days a week; affordable, compassionate veterinary care to dogs and cats; building lasting relationships with pet owners',
  narrative_anchor = 'We started 108 Avenue Animal Hospital because we believed every pet owner in Surrey deserves quality veterinary care at a price that''s fair — the kind of care you''d want for your own pet, with the door always open, seven days a week.',
  clinic_differentiator = 'Affordable, 7-days-a-week veterinary care with extended hours and walk-ins always welcome — positioned as accessible, fair-priced general and urgent care for Surrey''s underserved communities (Whalley, Newton, Fleetwood, North Delta).'
WHERE clinic_id = '0900d007-5480-44c7-b0e1-c4d688d05a6a' AND voice_fingerprint IS NULL;

-- Sync synthesized DNA fields for alma (Dunbar)
UPDATE clinic_gbp_config SET
  voice_fingerprint = 'we provide better service as compared to other clinics; we partner with many local rescues and shelters and provide them free services; every client is an ideal client; indoor cats still need protection from germs; father-and-son veterinarians built this practice together; we give you written estimates with no hidden fees — your approval first; we call it compassion for every pet, connection with every owner; we''ve been serving the Dunbar community since 2007',
  narrative_anchor = 'My son Vazul and I built Alma Animal Hospital together on the same values that guided veterinary care on Dunbar Street since 1998 — honest communication, individualized care, and treating every pet like they''re part of our own family.',
  clinic_differentiator = 'Owner states "better service as compared to other clinics." Website supports this with emphasis on individualized care, written estimates with no hidden fees, honest communication, and approval-first billing.'
WHERE clinic_id = '2bdf419c-6e48-4744-83d5-2df817ab9f2e' AND voice_fingerprint IS NULL;

-- Sync synthesized DNA fields for Alma Animal Hospital (b82b1dac) - skip if already populated
UPDATE clinic_gbp_config SET
  voice_fingerprint = COALESCE(voice_fingerprint, 'father-and-son veterinarians; built on the same values that guided Alta Vista Animal Hospital since 1998; building trusted relationships with pet families through consistent, reliable care; a modern, community-centered practice rooted in compassion and open communication; people think their dog''s mouth is clean; proud partners with VOKRA; privately owned, family-run clinic continuing that legacy'),
  narrative_anchor = COALESCE(narrative_anchor, 'My father and I built Alma on the same values that guided Alta Vista Animal Hospital in Dunbar since 1998 — we wanted to create something modern, but rooted in the kind of honest, consistent care that keeps families coming back for decades.'),
  clinic_differentiator = COALESCE(clinic_differentiator, 'Father-and-son founded, locally owned family clinic continuing a legacy of community veterinary care in Dunbar-Southlands since 1998 (Alta Vista) and 2007 (Alma).')
WHERE clinic_id = 'b82b1dac-e3bc-447e-be0d-b93e10e44399';
