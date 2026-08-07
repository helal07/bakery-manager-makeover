-- Patch 30: clean up duplicate / half-saved purchases and prevent recurrence.
--
-- Background: when a purchase save failed midway (e.g. the missing
-- assert_app_staff guard), the purchase header was already inserted while the
-- stock movement failed. Retrying kept the same reference no., so the same
-- PO code was inserted several times.
--
-- Safe to run more than once.

BEGIN;

-- 1) Remove duplicate purchases sharing the same code, keeping the oldest row.
WITH ranked AS (
  SELECT id, code,
         row_number() OVER (PARTITION BY code ORDER BY created_at, id) AS rn
  FROM public.purchases
  WHERE code IS NOT NULL
),
dupes AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM public.purchase_items WHERE purchase_id IN (SELECT id FROM dupes);

WITH ranked AS (
  SELECT id, code,
         row_number() OVER (PARTITION BY code ORDER BY created_at, id) AS rn
  FROM public.purchases
  WHERE code IS NOT NULL
),
dupes AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM public.raw_stock_ledger
WHERE ref_type = 'purchase' AND ref_id IN (SELECT id FROM dupes);

WITH ranked AS (
  SELECT id, code,
         row_number() OVER (PARTITION BY code ORDER BY created_at, id) AS rn
  FROM public.purchases
  WHERE code IS NOT NULL
),
dupes AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM public.supplier_payments WHERE purchase_id IN (SELECT id FROM dupes);

WITH ranked AS (
  SELECT id, code,
         row_number() OVER (PARTITION BY code ORDER BY created_at, id) AS rn
  FROM public.purchases
  WHERE code IS NOT NULL
),
dupes AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM public.purchases WHERE id IN (SELECT id FROM dupes);

-- 2) Stop it from ever happening again: one purchase per reference no.
CREATE UNIQUE INDEX IF NOT EXISTS purchases_code_unique
  ON public.purchases (code)
  WHERE code IS NOT NULL;

COMMIT;

-- 3) OPTIONAL: after dedupe, rebuild raw stock from the surviving purchases:
--    run sql/28_rebuild_raw_stock_from_purchases.sql
