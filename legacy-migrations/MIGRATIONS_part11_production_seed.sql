-- ============================================================
-- Part 11: Production seed data (idempotent, safe to re-run)
-- Requires Part 10 (unique constraints on recipe_categories.name
-- and products.sku).
-- ============================================================

-- Showroom
INSERT INTO public.showrooms (name, code, city)
VALUES ('Main Bakery', 'MAIN', 'Dhaka')
ON CONFLICT (code) DO NOTHING;

-- Recipe categories
INSERT INTO public.recipe_categories (name, color, is_active) VALUES
  ('Breads & Buns', '#f59e0b', true),
  ('Cakes',         '#ec4899', true),
  ('Biscuits',      '#8b5cf6', true)
ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color, is_active = true;

-- Raw materials (upsert by name)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('Flour',         'g',  0.06, 5000),
      ('Sugar',         'g',  0.11, 2000),
      ('Butter',        'g',  0.85, 1000),
      ('Eggs',          'pc', 12.0, 50),
      ('Milk',          'ml', 0.09, 2000),
      ('Baking Powder', 'g',  0.40, 500)
    ) AS t(name, unit, cost, min_stock)
  LOOP
    INSERT INTO public.raw_materials (name, unit, cost, min_stock, is_active)
    VALUES (r.name, r.unit, r.cost, r.min_stock, true)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Products (upsert by sku)
INSERT INTO public.products (sku, name, category, price, cost, is_active) VALUES
  ('BUN-001',    'Burger Bun',    'Bread',   25,  10, true),
  ('CAKE-001',   'Vanilla Cake',  'Cake',    650, 320, true),
  ('BISC-001',   'Butter Biscuit','Biscuit', 15,  6,  true)
ON CONFLICT (sku) DO NOTHING;

-- Recipes (BOM per 1 unit of finished product)
-- Wipes existing recipe rows for these products then reinserts.
WITH p AS (
  SELECT id, sku FROM public.products WHERE sku IN ('BUN-001','CAKE-001','BISC-001')
), m AS (
  SELECT id, name FROM public.raw_materials
)
DELETE FROM public.recipes WHERE product_id IN (SELECT id FROM p);

INSERT INTO public.recipes (product_id, material_id, qty)
SELECT p.id, m.id, x.qty
FROM (VALUES
  ('BUN-001',  'Flour',         50.0),
  ('BUN-001',  'Sugar',         5.0),
  ('BUN-001',  'Butter',        5.0),
  ('BUN-001',  'Milk',          20.0),
  ('CAKE-001', 'Flour',         300.0),
  ('CAKE-001', 'Sugar',         200.0),
  ('CAKE-001', 'Butter',        150.0),
  ('CAKE-001', 'Eggs',          4.0),
  ('CAKE-001', 'Milk',          150.0),
  ('CAKE-001', 'Baking Powder', 10.0),
  ('BISC-001', 'Flour',         20.0),
  ('BISC-001', 'Sugar',         10.0),
  ('BISC-001', 'Butter',        15.0)
) AS x(sku, mat, qty)
JOIN public.products p       ON p.sku = x.sku
JOIN public.raw_materials m  ON m.name = x.mat;

-- Opening raw-material stock at the Main showroom
DO $$
DECLARE
  sr uuid;
  m RECORD;
BEGIN
  SELECT id INTO sr FROM public.showrooms WHERE code = 'MAIN';
  FOR m IN
    SELECT id, name FROM public.raw_materials
    WHERE name IN ('Flour','Sugar','Butter','Eggs','Milk','Baking Powder')
  LOOP
    PERFORM public.commit_raw_stock_movement(
      m.id, sr,
      CASE m.name
        WHEN 'Flour' THEN 10000
        WHEN 'Sugar' THEN 5000
        WHEN 'Butter' THEN 2000
        WHEN 'Eggs'   THEN 200
        WHEN 'Milk'   THEN 5000
        WHEN 'Baking Powder' THEN 1000
      END,
      'adjustment', NULL, NULL, 'Seed opening stock'
    );
  END LOOP;
END $$;

-- Sample pending work orders
INSERT INTO public.work_orders (product_id, showroom_id, batch_qty, assigned_to, status, planned_date, notes)
SELECT p.id, s.id, x.qty, x.who, 'pending', CURRENT_DATE, x.note
FROM (VALUES
  ('BUN-001',  50, 'Rahim',  'Morning batch'),
  ('CAKE-001', 5,  'Karim',  'Birthday orders'),
  ('BISC-001', 20, 'Salman', 'Retail restock')
) AS x(sku, qty, who, note)
JOIN public.products  p ON p.sku = x.sku
JOIN public.showrooms s ON s.code = 'MAIN';
