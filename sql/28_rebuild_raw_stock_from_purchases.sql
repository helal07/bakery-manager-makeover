-- 28_rebuild_raw_stock_from_purchases.sql
-- Rebuilds factory raw material stock from existing purchase history.
-- Safe to run once after 27_reset_stock_and_sales.sql.
-- Nothing is deleted except raw stock rows that this script itself rebuilds.

BEGIN;

-- 1) Clear only raw material balances + ledger (purchases stay intact)
DELETE FROM public.raw_stock_ledger;
DELETE FROM public.raw_material_stock;

-- 2) Re-post every purchased raw material line as a factory IN movement
INSERT INTO public.raw_stock_ledger (material_id, showroom_id, qty, kind, ref_type, ref_id, note, created_at)
SELECT pi.material_id,
       NULL,                     -- factory scope
       pi.qty,
       'in',
       'purchase',
       p.id,
       'Rebuilt from purchase ' || COALESCE(p.code, p.id::text),
       COALESCE(p.purchase_date::timestamptz, p.created_at)
FROM public.purchase_items pi
JOIN public.purchases p ON p.id = pi.purchase_id
WHERE pi.material_id IS NOT NULL
  AND pi.qty > 0;

-- 3) Re-post purchase returns as OUT movements
INSERT INTO public.raw_stock_ledger (material_id, showroom_id, qty, kind, ref_type, ref_id, note, created_at)
SELECT ri.material_id,
       NULL,
       -ri.qty,
       'out',
       'purchase_return',
       r.id,
       'Rebuilt from purchase return ' || COALESCE(r.code, r.id::text),
       r.created_at
FROM public.purchase_return_items ri
JOIN public.purchase_returns r ON r.id = ri.return_id
WHERE ri.material_id IS NOT NULL
  AND ri.qty > 0;

-- 4) Recompute balances from the ledger
INSERT INTO public.raw_material_stock (material_id, showroom_id, quantity, min_stock)
SELECT l.material_id, NULL, SUM(l.qty), 0
FROM public.raw_stock_ledger l
WHERE l.showroom_id IS NULL
GROUP BY l.material_id;

COMMIT;

-- Verify
-- SELECT rm.name, rms.quantity FROM public.raw_material_stock rms
--   JOIN public.raw_materials rm ON rm.id = rms.material_id
--  WHERE rms.showroom_id IS NULL ORDER BY rm.name;
