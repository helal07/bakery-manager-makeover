-- ============================================================================
-- 27_reset_stock_and_sales.sql   ⚠ RUN ONCE — DESTRUCTIVE FOR THE ROWS BELOW
-- Clears: raw material stock + ledger, finished product stock + ledger,
--         damaged stock + ledger, and all sales (items, payments, returns).
-- KEEPS:  sub_recipes, sub_recipe_items, recipes, products, raw_materials,
--         customers, suppliers, purchases, expenses, employees, settings.
-- ============================================================================
BEGIN;

-- 1) Sales chain (children first)
DELETE FROM public.sale_return_items;
DELETE FROM public.sale_returns;
DELETE FROM public.sale_payments;
DELETE FROM public.sale_items;
DELETE FROM public.customer_payments WHERE sale_id IS NOT NULL;
DELETE FROM public.held_sales;
DELETE FROM public.sales;

-- 2) Finished product stock
DELETE FROM public.stock_ledger;
DELETE FROM public.product_stock;

-- 3) Damaged / wastage stock
DELETE FROM public.damaged_ledger;
DELETE FROM public.damaged_stock;
DELETE FROM public.wastage_log;
DELETE FROM public.repurpose_queue;

-- 4) Raw material stock
DELETE FROM public.raw_stock_ledger;
DELETE FROM public.raw_material_stock;

COMMIT;

-- Verify (all should be 0)
SELECT
  (SELECT count(*) FROM public.sales)              AS sales,
  (SELECT count(*) FROM public.stock_ledger)       AS product_ledger,
  (SELECT count(*) FROM public.product_stock)      AS product_stock,
  (SELECT count(*) FROM public.raw_stock_ledger)   AS raw_ledger,
  (SELECT count(*) FROM public.raw_material_stock) AS raw_stock,
  (SELECT count(*) FROM public.sub_recipes)        AS sub_recipes_kept,
  (SELECT count(*) FROM public.recipes)            AS recipes_kept;
