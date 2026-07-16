-- ============================================================
-- Part 8: DUMMY SEED DATA (for testing only — delete later)
-- All rows tagged with note/name prefix "DEMO" so you can bulk-delete:
--   DELETE FROM public.products WHERE sku LIKE 'DEMO-%';
--   ...etc
-- Idempotent: safe to re-run.
-- ============================================================

-- Showrooms ---------------------------------------------------
INSERT INTO public.showrooms (name, code, address, city, phone, manager_name)
VALUES
  ('DEMO Dhanmondi Outlet', 'DEMO-DHN', 'Road 5, Dhanmondi', 'Dhaka', '+8801711000001', 'Rahim'),
  ('DEMO Gulshan Outlet',   'DEMO-GUL', 'Gulshan Ave',      'Dhaka', '+8801711000002', 'Karim')
ON CONFLICT (code) DO NOTHING;

-- Units -------------------------------------------------------
INSERT INTO public.units (code, name) VALUES
  ('pc',  'Piece'),
  ('kg',  'Kilogram'),
  ('g',   'Gram'),
  ('ltr', 'Liter'),
  ('pkt', 'Packet')
ON CONFLICT (code) DO NOTHING;

-- Product categories -----------------------------------------
INSERT INTO public.product_categories (name)
SELECT n FROM (VALUES ('DEMO Bread'), ('DEMO Biscuit'), ('DEMO Cake'), ('DEMO Pastry')) AS t(n)
WHERE NOT EXISTS (SELECT 1 FROM public.product_categories WHERE lower(name)=lower(t.n));

-- Purchase categories ----------------------------------------
INSERT INTO public.purchase_categories (name) VALUES
  ('DEMO Ingredients'), ('DEMO Packaging')
ON CONFLICT (name) DO NOTHING;

-- Expense categories -----------------------------------------
INSERT INTO public.expense_categories (name) VALUES
  ('DEMO Utilities'), ('DEMO Transport'), ('DEMO Salary')
ON CONFLICT (name) DO NOTHING;

-- Selling price groups ---------------------------------------
INSERT INTO public.selling_price_groups (name)
SELECT n FROM (VALUES ('DEMO Retail'), ('DEMO Wholesale')) AS t(n)
WHERE NOT EXISTS (SELECT 1 FROM public.selling_price_groups WHERE name=t.n);

-- Suppliers --------------------------------------------------
INSERT INTO public.suppliers (name, contact, phone, category)
SELECT * FROM (VALUES
  ('DEMO Flour Mills Ltd', 'Mr. Hasan', '+8801811000001', 'DEMO Ingredients'),
  ('DEMO Sugar Traders',   'Mr. Iqbal', '+8801811000002', 'DEMO Ingredients'),
  ('DEMO PackPro',         'Mr. Jamil', '+8801811000003', 'DEMO Packaging')
) AS t(name, contact, phone, category)
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE suppliers.name = t.name);

-- Raw materials ----------------------------------------------
INSERT INTO public.raw_materials (name, sku, unit, category, min_stock, cost)
SELECT * FROM (VALUES
  ('DEMO Flour',  'DEMO-RM-FLOUR', 'kg',  'DEMO Ingredients', 20, 60),
  ('DEMO Sugar',  'DEMO-RM-SUGAR', 'kg',  'DEMO Ingredients', 10, 110),
  ('DEMO Butter', 'DEMO-RM-BUTTER','kg',  'DEMO Ingredients', 5,  850),
  ('DEMO Eggs',   'DEMO-RM-EGG',   'pc',  'DEMO Ingredients', 50, 12),
  ('DEMO Milk',   'DEMO-RM-MILK',  'ltr', 'DEMO Ingredients', 10, 90)
) AS t(name, sku, unit, category, min_stock, cost)
WHERE NOT EXISTS (SELECT 1 FROM public.raw_materials WHERE raw_materials.sku = t.sku);

-- Products ---------------------------------------------------
INSERT INTO public.products (sku, name, category, unit, cost, price)
VALUES
  ('DEMO-P-001', 'DEMO Milk Bread',      'DEMO Bread',   'pc',  30, 60),
  ('DEMO-P-002', 'DEMO Sandwich Loaf',   'DEMO Bread',   'pc',  55, 95),
  ('DEMO-P-003', 'DEMO Butter Cookies',  'DEMO Biscuit', 'pkt', 40, 80),
  ('DEMO-P-004', 'DEMO Vanilla Cake 1lb','DEMO Cake',    'pc', 250, 450),
  ('DEMO-P-005', 'DEMO Chocolate Pastry','DEMO Pastry',  'pc',  35, 70)
ON CONFLICT (sku) DO NOTHING;

-- Customers --------------------------------------------------
INSERT INTO public.customers (name, phone, email, address)
SELECT * FROM (VALUES
  ('DEMO Walk-in',       '+8801911000000', NULL,                 NULL),
  ('DEMO Ayesha Khan',   '+8801911000001', 'ayesha@example.com', 'Banani, Dhaka'),
  ('DEMO Bakery Corner', '+8801911000002', 'corner@example.com', 'Mirpur, Dhaka')
) AS t(name, phone, email, address)
WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE customers.name = t.name);
