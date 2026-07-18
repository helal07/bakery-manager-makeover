-- =============================================================
-- Muzahid Food — Optional Demo Data
-- =============================================================
-- Run this AFTER sql/00_baseline.sql if you want sample
-- showrooms, customers, suppliers, products, recipes, stock.
-- Skip this file for a completely empty production database.
-- =============================================================

BEGIN;
SET session_replication_role = replica;  -- skip triggers while seeding

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path TO '';
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: customer_groups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: showrooms; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.showrooms VALUES ('2eda7705-6d65-488b-8348-ecf8e6581d64', 'Main Bakery', 'MAIN', 'Dhaka', NULL, NULL, true, NULL, '2026-07-16 14:55:51.789932+00', '2026-07-16 14:55:51.789932+00', NULL);


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.products VALUES ('eaa4b545-4088-412e-9c3a-1cc998d6f999', 'BUN-01', 'Burger Bun', 'Bakery', NULL, 'pc', 20, 8, 10, NULL, NULL, NULL, NULL, NULL, NULL, true, '2026-07-16 14:57:29.27939+00', '2026-07-16 14:57:29.27939+00');
INSERT INTO public.products VALUES ('e0c0b0d5-610d-40cb-992d-7c5be4d25355', 'CAKE-01', 'Vanilla Cake', 'Bakery', NULL, 'pc', 400, 180, 2, NULL, NULL, NULL, NULL, NULL, NULL, true, '2026-07-16 14:57:29.27939+00', '2026-07-16 14:57:29.27939+00');
INSERT INTO public.products VALUES ('24ae89d5-d26f-47b1-a943-6fec410241d5', 'BIS-01', 'Butter Biscuit', 'Bakery', NULL, 'pkt', 70, 30, 5, NULL, NULL, NULL, NULL, NULL, NULL, true, '2026-07-16 14:57:29.27939+00', '2026-07-16 14:57:29.27939+00');


--
-- Data for Name: product_selling_prices; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: product_stock; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.product_stock VALUES ('5ccf6b79-f208-4ded-800c-6d8e2cb73fc6', 'eaa4b545-4088-412e-9c3a-1cc998d6f999', '2eda7705-6d65-488b-8348-ecf8e6581d64', 10, 0, '2026-07-16 14:57:48.356459+00', '2026-07-16 16:38:09.713319+00');


--
-- Data for Name: raw_materials; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.raw_materials VALUES ('dc975731-0882-40f1-9fce-53e0750191f5', 'Flour', 'g', 0.06, 5000, true, '2026-07-16 14:55:52.280112+00', '2026-07-16 14:55:52.280112+00');
INSERT INTO public.raw_materials VALUES ('fc6e3cfc-efcc-4652-9776-56f79032e38b', 'Sugar', 'g', 0.11, 2000, true, '2026-07-16 14:55:52.280112+00', '2026-07-16 14:55:52.280112+00');
INSERT INTO public.raw_materials VALUES ('3ba46215-3ed0-44ab-82bd-3b9016834792', 'Butter', 'g', 0.85, 1000, true, '2026-07-16 14:55:52.280112+00', '2026-07-16 14:55:52.280112+00');
INSERT INTO public.raw_materials VALUES ('cfcefcc3-905f-449d-85c2-56834bfe8995', 'Eggs', 'pc', 12, 50, true, '2026-07-16 14:55:52.280112+00', '2026-07-16 14:55:52.280112+00');
INSERT INTO public.raw_materials VALUES ('77c7f76c-158f-4c69-8a53-0c71858cfda7', 'Milk', 'ml', 0.09, 2000, true, '2026-07-16 14:55:52.280112+00', '2026-07-16 14:55:52.280112+00');
INSERT INTO public.raw_materials VALUES ('5bfe0660-a660-4d75-848e-f498411bde79', 'Baking Powder', 'g', 0.4, 500, true, '2026-07-16 14:55:52.280112+00', '2026-07-16 14:55:52.280112+00');


--
-- Data for Name: raw_material_stock; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.raw_material_stock VALUES ('5da57cd6-90b0-41c6-a7a0-d52560fdd264', '3ba46215-3ed0-44ab-82bd-3b9016834792', '2eda7705-6d65-488b-8348-ecf8e6581d64', 1920, 0, '2026-07-16 14:57:29.526809+00', '2026-07-16 16:38:09.713319+00');
INSERT INTO public.raw_material_stock VALUES ('b620a3f5-7d35-447e-ba1c-1aaa7af41e69', '5bfe0660-a660-4d75-848e-f498411bde79', '2eda7705-6d65-488b-8348-ecf8e6581d64', 1000, 0, '2026-07-16 14:57:29.526809+00', '2026-07-16 16:38:09.713319+00');
INSERT INTO public.raw_material_stock VALUES ('aa43f0c7-1a25-40e7-b600-36b89def5ee9', '77c7f76c-158f-4c69-8a53-0c71858cfda7', '2eda7705-6d65-488b-8348-ecf8e6581d64', 4800, 0, '2026-07-16 14:57:29.526809+00', '2026-07-16 16:38:09.713319+00');
INSERT INTO public.raw_material_stock VALUES ('aa4dc67c-9334-44b2-9e67-dad8dda96c12', 'cfcefcc3-905f-449d-85c2-56834bfe8995', '2eda7705-6d65-488b-8348-ecf8e6581d64', 200, 0, '2026-07-16 14:57:29.526809+00', '2026-07-16 16:38:09.713319+00');
INSERT INTO public.raw_material_stock VALUES ('a2031414-a740-4cd6-9553-a14e3f15ed9a', 'dc975731-0882-40f1-9fce-53e0750191f5', '2eda7705-6d65-488b-8348-ecf8e6581d64', 9400, 0, '2026-07-16 14:57:29.526809+00', '2026-07-16 16:38:09.713319+00');
INSERT INTO public.raw_material_stock VALUES ('f2cd7a36-af44-4e96-8f15-e7a1f11f45de', 'fc6e3cfc-efcc-4652-9776-56f79032e38b', '2eda7705-6d65-488b-8348-ecf8e6581d64', 4950, 0, '2026-07-16 14:57:29.526809+00', '2026-07-16 16:38:09.713319+00');


--
-- Data for Name: recipes; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.recipes VALUES ('9575b86b-5c7a-40c1-becd-359286b4030f', 'e0c0b0d5-610d-40cb-992d-7c5be4d25355', '3ba46215-3ed0-44ab-82bd-3b9016834792', NULL, 120, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('9c9a98d0-592c-40be-a858-03a70e653539', 'eaa4b545-4088-412e-9c3a-1cc998d6f999', 'fc6e3cfc-efcc-4652-9776-56f79032e38b', NULL, 5, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('9bd68149-52d8-4487-8e80-873ed39cad39', 'e0c0b0d5-610d-40cb-992d-7c5be4d25355', '77c7f76c-158f-4c69-8a53-0c71858cfda7', NULL, 100, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('d746d011-fd55-4b7a-aaa1-9423260cf0f3', '24ae89d5-d26f-47b1-a943-6fec410241d5', 'dc975731-0882-40f1-9fce-53e0750191f5', NULL, 80, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('6233e3d3-1d70-489f-b2d4-4aed308a6c5f', 'e0c0b0d5-610d-40cb-992d-7c5be4d25355', 'fc6e3cfc-efcc-4652-9776-56f79032e38b', NULL, 150, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('1ce8adc7-d95e-4f0b-94ac-f794873617ea', 'eaa4b545-4088-412e-9c3a-1cc998d6f999', '3ba46215-3ed0-44ab-82bd-3b9016834792', NULL, 8, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('9f048fa4-7cd8-438c-ae3c-30661d4d8db6', 'eaa4b545-4088-412e-9c3a-1cc998d6f999', '77c7f76c-158f-4c69-8a53-0c71858cfda7', NULL, 20, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('cde238b3-10d3-4260-b440-b1cea946330c', 'e0c0b0d5-610d-40cb-992d-7c5be4d25355', 'dc975731-0882-40f1-9fce-53e0750191f5', NULL, 200, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('4a1c3d4c-51aa-4288-b9de-7507a74c5895', 'e0c0b0d5-610d-40cb-992d-7c5be4d25355', 'cfcefcc3-905f-449d-85c2-56834bfe8995', NULL, 4, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('232c9593-ca22-4adc-b791-24fd2ce1eda0', '24ae89d5-d26f-47b1-a943-6fec410241d5', 'fc6e3cfc-efcc-4652-9776-56f79032e38b', NULL, 30, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('09b6a94e-d4c7-4cbc-9a0a-0bb878968808', '24ae89d5-d26f-47b1-a943-6fec410241d5', '3ba46215-3ed0-44ab-82bd-3b9016834792', NULL, 50, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('4dcf8892-b2ec-474f-b50f-5d0f3b59614d', 'eaa4b545-4088-412e-9c3a-1cc998d6f999', 'dc975731-0882-40f1-9fce-53e0750191f5', NULL, 60, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');
INSERT INTO public.recipes VALUES ('5f32c6a4-1dc8-4643-a3c7-f2a6741fd3be', 'e0c0b0d5-610d-40cb-992d-7c5be4d25355', '5bfe0660-a660-4d75-848e-f498411bde79', NULL, 8, '2026-07-16 14:57:29.776829+00', '2026-07-16 14:57:29.776829+00');


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--

SET session_replication_role = DEFAULT;
COMMIT;
