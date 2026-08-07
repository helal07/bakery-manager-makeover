-- ============================================================================
-- 24_fix_sale_raw_consume.sql
-- One-time correction: earlier builds deducted recipe ingredients from raw
-- material stock again at every POS sale, even though those materials were
-- already consumed by the production batch. This reverses that double
-- deduction and folds stray showroom-scoped raw stock back into the factory.
-- Idempotent: reversals are tagged 'sale_double_consume_fix' and skipped on
-- re-run. History is preserved — nothing is deleted.
-- ============================================================================

BEGIN;

-- 1. Reverse every raw consumption booked against a sale (kind
--    'production_consume' with ref_type 'sale'), unless already reversed.
WITH bad AS (
  SELECT l.id, l.material_id, l.qty
  FROM public.raw_stock_ledger l
  WHERE l.kind = 'production_consume'
    AND l.ref_type = 'sale'
    AND NOT EXISTS (
      SELECT 1 FROM public.raw_stock_ledger f
      WHERE f.kind = 'correction'
        AND f.note = 'sale_double_consume_fix'
        AND f.ref_type = 'raw_stock_ledger'
        AND f.ref_id = l.id
    )
)
INSERT INTO public.raw_stock_ledger (material_id, showroom_id, qty, kind, ref_type, ref_id, note)
SELECT material_id, NULL, -qty, 'correction', 'raw_stock_ledger', id, 'sale_double_consume_fix'
FROM bad;

-- 2. Apply the same amounts back to the factory balances.
WITH fix AS (
  SELECT material_id, SUM(qty) AS qty
  FROM public.raw_stock_ledger
  WHERE kind = 'correction' AND note = 'sale_double_consume_fix'
  GROUP BY material_id
),
upd AS (
  UPDATE public.raw_material_stock s
     SET quantity = s.quantity + f.qty, updated_at = now()
    FROM fix f
   WHERE s.material_id = f.material_id AND s.showroom_id IS NULL
  RETURNING s.material_id
)
INSERT INTO public.raw_material_stock (material_id, showroom_id, quantity)
SELECT f.material_id, NULL, f.qty
FROM fix f
WHERE f.material_id NOT IN (SELECT material_id FROM upd);

-- 3. Fold any showroom-scoped raw material stock rows into the factory row.
--    Raw materials live at the factory only; showroom rows are invisible to
--    every report and were the source of "stock stays 0 / goes negative".
WITH stray AS (
  SELECT material_id, SUM(quantity) AS qty
  FROM public.raw_material_stock
  WHERE showroom_id IS NOT NULL
  GROUP BY material_id
),
upd AS (
  UPDATE public.raw_material_stock s
     SET quantity = s.quantity + t.qty, updated_at = now()
    FROM stray t
   WHERE s.material_id = t.material_id AND s.showroom_id IS NULL
  RETURNING s.material_id
)
INSERT INTO public.raw_material_stock (material_id, showroom_id, quantity)
SELECT t.material_id, NULL, t.qty
FROM stray t
WHERE t.material_id NOT IN (SELECT material_id FROM upd);

DELETE FROM public.raw_material_stock WHERE showroom_id IS NOT NULL;

COMMIT;

-- Verify: no negatives should remain unless real over-consumption happened.
-- SELECT m.name, s.quantity FROM public.raw_material_stock s
--   JOIN public.raw_materials m ON m.id = s.material_id
--  WHERE s.quantity < 0;
