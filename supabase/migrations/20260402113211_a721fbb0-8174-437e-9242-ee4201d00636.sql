
-- Insert April 2026 batch queue for all 23 clusters
INSERT INTO gbp_batches (month, year, batch_number, cluster_id, clinics, status) VALUES
(4, 2026, 1, 'ABBOTSFORD', '{e1b5d5e5-3fbe-4ccc-b4b5-4961f55838e2,f80f7ace-0f91-434f-b64a-595a1fa92f1e,510af439-f6d3-4084-9398-14464b7ec9c3,ae92b66d-207e-4f1f-a49b-ef3fa5625f31}', 'queued'),
(4, 2026, 2, 'BURNABY', '{62ecb5aa-79a3-4a41-a7a0-114541148286,e17367f2-985c-4bcc-83a7-a1da26b8418d}', 'queued'),
(4, 2026, 3, 'LANGLEY', '{2128c8cf-874d-488c-baa2-7cfee120c5af,9b737aa6-c818-4cdb-b7e2-d5f2af950e0f,29836e48-a149-4d37-a952-51740f967737}', 'queued'),
(4, 2026, 4, 'NANAIMO', '{75a4dc43-b4a3-40cc-98bc-f02574731f01,7bd519aa-5c88-4df1-8966-681c3eb6bf11}', 'queued'),
(4, 2026, 5, NULL, '{91ffa0cb-2732-491a-a9ce-7f667593fac9}', 'queued'),
(4, 2026, 6, NULL, '{3d5503a4-2ff5-4cbd-9d3b-681c7c3dea86}', 'queued'),
(4, 2026, 7, NULL, '{02e91b1b-bb3a-414c-94e2-e338495123fc}', 'queued'),
(4, 2026, 8, NULL, '{e0ed61d0-4e86-4321-8859-626633bf2a2f}', 'queued'),
(4, 2026, 9, NULL, '{417749c9-688a-4757-85aa-83fcef8f9e72}', 'queued'),
(4, 2026, 10, NULL, '{6fef11e6-fb97-4df5-b11b-06b7bfec864e}', 'queued'),
(4, 2026, 11, NULL, '{b6dc0075-a038-4bb2-89b8-a65b98d577b8}', 'queued'),
(4, 2026, 12, NULL, '{9b056c3f-30a4-47aa-9e42-6bfb0f46f138}', 'queued'),
(4, 2026, 13, NULL, '{a8c8c89c-508b-4f5b-a52e-7a2cbee98ae7}', 'queued'),
(4, 2026, 14, NULL, '{8cd3b411-1e2f-401b-997d-29b11d5f4369}', 'queued'),
(4, 2026, 15, NULL, '{6489ba8f-4906-4444-b7c9-d913fc3f01bb}', 'queued'),
(4, 2026, 16, NULL, '{2d11c888-f9e3-4b03-9eb2-5146615df013}', 'queued'),
(4, 2026, 17, NULL, '{5167ce08-3378-4982-9ff3-650c781e963c}', 'queued'),
(4, 2026, 18, NULL, '{c9220dc6-efe8-49e0-9d35-5d2493a000a2}', 'queued'),
(4, 2026, 19, 'SURREY-NORTH', '{0900d007-5480-44c7-b0e1-c4d688d05a6a,0a9e6f0e-0267-4237-9e51-932e13ed7701,c9a87c63-d2bc-44c5-a239-b725a3c7afea,90ed4cf0-77e0-46a3-9dca-bd64c46bd5a0}', 'queued'),
(4, 2026, 20, 'SURREY-SOUTH', '{999d7f85-4e09-471b-b4b2-1d036cfbcd11,ee1ac34c-c03f-42cc-8277-ef16de9421b5,40383268-a6b5-4346-bbdc-d0a4c9a4e48a,7ba3a8ff-870f-4105-8f5d-38eaacfd6f77,6c5b5b97-7d23-48c9-b98b-a3abdc4eaf08}', 'queued'),
(4, 2026, 21, 'TRI-CITIES', '{1792f729-4708-4e91-b7d7-2e084ecf2c15,96800cc0-8415-4803-8708-51d85453a6bf,bff37f4e-724c-4879-bc23-dbc3138b63c3}', 'queued'),
(4, 2026, 22, 'VAN-EAST', '{932167be-dc75-45be-b1c0-f7cbb89ec701,333e3904-8ca3-4faa-b7ff-53cd67a0ba64,54931640-1923-4145-b24a-456a54de4970}', 'queued'),
(4, 2026, 23, 'VAN-WEST', '{659316b7-129c-4bb0-ae5b-6f50a2ffe016,4f5cd601-9c46-42c4-935c-9c92a9459874,8dc94ae6-b8cb-4a91-b26b-a6640a6f1ea0,b82b1dac-e3bc-447e-be0d-b93e10e44399,2bdf419c-6e48-4744-83d5-2df817ab9f2e,6e644265-c74a-412b-beb9-cac295d0485e,559cc408-08ee-453f-9aa5-26c995e3ed34}', 'queued');

-- Update clinic_gbp_config with Q2 hook styles and variant positions
-- ABBOTSFORD (4 clinics: A, B, C, D)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='e1b5d5e5-3fbe-4ccc-b4b5-4961f55838e2';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='f80f7ace-0f91-434f-b64a-595a1fa92f1e';
UPDATE clinic_gbp_config SET cluster_position='C', topic_variant_current='C', hook_style_current='MYTH-BUST' WHERE clinic_id='510af439-f6d3-4084-9398-14464b7ec9c3';
UPDATE clinic_gbp_config SET cluster_position='D', topic_variant_current='D', hook_style_current='STAT' WHERE clinic_id='ae92b66d-207e-4f1f-a49b-ef3fa5625f31';

-- BURNABY (2 clinics: A, B)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='62ecb5aa-79a3-4a41-a7a0-114541148286';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='e17367f2-985c-4bcc-83a7-a1da26b8418d';

-- LANGLEY (3 clinics: A, B, C)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='2128c8cf-874d-488c-baa2-7cfee120c5af';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='9b737aa6-c818-4cdb-b7e2-d5f2af950e0f';
UPDATE clinic_gbp_config SET cluster_position='C', topic_variant_current='C', hook_style_current='MYTH-BUST' WHERE clinic_id='29836e48-a149-4d37-a952-51740f967737';

-- NANAIMO (2 clinics: A, B)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='75a4dc43-b4a3-40cc-98bc-f02574731f01';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='7bd519aa-5c88-4df1-8966-681c3eb6bf11';

-- Solo clinics all get position A, variant A, hook QUESTION (Q2)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='91ffa0cb-2732-491a-a9ce-7f667593fac9';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='3d5503a4-2ff5-4cbd-9d3b-681c7c3dea86';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='02e91b1b-bb3a-414c-94e2-e338495123fc';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='e0ed61d0-4e86-4321-8859-626633bf2a2f';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='417749c9-688a-4757-85aa-83fcef8f9e72';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='6fef11e6-fb97-4df5-b11b-06b7bfec864e';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='b6dc0075-a038-4bb2-89b8-a65b98d577b8';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='9b056c3f-30a4-47aa-9e42-6bfb0f46f138';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='a8c8c89c-508b-4f5b-a52e-7a2cbee98ae7';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='8cd3b411-1e2f-401b-997d-29b11d5f4369';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='6489ba8f-4906-4444-b7c9-d913fc3f01bb';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='2d11c888-f9e3-4b03-9eb2-5146615df013';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='5167ce08-3378-4982-9ff3-650c781e963c';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='c9220dc6-efe8-49e0-9d35-5d2493a000a2';

-- SURREY-NORTH (4 clinics: A, B, C, D)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='0900d007-5480-44c7-b0e1-c4d688d05a6a';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='0a9e6f0e-0267-4237-9e51-932e13ed7701';
UPDATE clinic_gbp_config SET cluster_position='C', topic_variant_current='C', hook_style_current='MYTH-BUST' WHERE clinic_id='c9a87c63-d2bc-44c5-a239-b725a3c7afea';
UPDATE clinic_gbp_config SET cluster_position='D', topic_variant_current='D', hook_style_current='STAT' WHERE clinic_id='90ed4cf0-77e0-46a3-9dca-bd64c46bd5a0';

-- SURREY-SOUTH (5 clinics: A, B, C, D, A)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='999d7f85-4e09-471b-b4b2-1d036cfbcd11';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='ee1ac34c-c03f-42cc-8277-ef16de9421b5';
UPDATE clinic_gbp_config SET cluster_position='C', topic_variant_current='C', hook_style_current='MYTH-BUST' WHERE clinic_id='40383268-a6b5-4346-bbdc-d0a4c9a4e48a';
UPDATE clinic_gbp_config SET cluster_position='D', topic_variant_current='D', hook_style_current='STAT' WHERE clinic_id='7ba3a8ff-870f-4105-8f5d-38eaacfd6f77';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='6c5b5b97-7d23-48c9-b98b-a3abdc4eaf08';

-- TRI-CITIES (3 clinics: A, B, C)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='1792f729-4708-4e91-b7d7-2e084ecf2c15';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='96800cc0-8415-4803-8708-51d85453a6bf';
UPDATE clinic_gbp_config SET cluster_position='C', topic_variant_current='C', hook_style_current='MYTH-BUST' WHERE clinic_id='bff37f4e-724c-4879-bc23-dbc3138b63c3';

-- VAN-EAST (3 clinics: A, B, C)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='932167be-dc75-45be-b1c0-f7cbb89ec701';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='333e3904-8ca3-4faa-b7ff-53cd67a0ba64';
UPDATE clinic_gbp_config SET cluster_position='C', topic_variant_current='C', hook_style_current='MYTH-BUST' WHERE clinic_id='54931640-1923-4145-b24a-456a54de4970';

-- VAN-WEST (7 clinics: A, B, C, D, A, B, C)
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='659316b7-129c-4bb0-ae5b-6f50a2ffe016';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='4f5cd601-9c46-42c4-935c-9c92a9459874';
UPDATE clinic_gbp_config SET cluster_position='C', topic_variant_current='C', hook_style_current='MYTH-BUST' WHERE clinic_id='8dc94ae6-b8cb-4a91-b26b-a6640a6f1ea0';
UPDATE clinic_gbp_config SET cluster_position='D', topic_variant_current='D', hook_style_current='STAT' WHERE clinic_id='b82b1dac-e3bc-447e-be0d-b93e10e44399';
UPDATE clinic_gbp_config SET cluster_position='A', topic_variant_current='A', hook_style_current='QUESTION' WHERE clinic_id='2bdf419c-6e48-4744-83d5-2df817ab9f2e';
UPDATE clinic_gbp_config SET cluster_position='B', topic_variant_current='B', hook_style_current='URGENCY' WHERE clinic_id='6e644265-c74a-412b-beb9-cac295d0485e';
UPDATE clinic_gbp_config SET cluster_position='C', topic_variant_current='C', hook_style_current='MYTH-BUST' WHERE clinic_id='559cc408-08ee-453f-9aa5-26c995e3ed34';
