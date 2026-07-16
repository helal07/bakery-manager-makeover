-- =============================================================
-- Part 12 · RBAC permission catalog + built-in role defaults
-- Idempotent · safe to re-run
-- Auto-heals legacy schema (permissions.key → permission_key)
-- =============================================================

-- 0) Schema alignment ---------------------------------------------
-- Older Part 2 shipped permissions.key; current codebase uses
-- permissions.permission_key. Rename if the legacy column exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'permissions'
      AND column_name  = 'key'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'permissions'
      AND column_name  = 'permission_key'
  ) THEN
    EXECUTE 'ALTER TABLE public.permissions RENAME COLUMN key TO permission_key';
  END IF;
END $$;

-- Ensure unique index on permission_key so ON CONFLICT resolves
CREATE UNIQUE INDEX IF NOT EXISTS permissions_permission_key_key
  ON public.permissions (permission_key);

-- 1) Built-in roles ------------------------------------------------
INSERT INTO public.app_roles (name, description, is_system, is_active)
SELECT v.name, v.description, true, true
FROM (VALUES
  ('Superadmin', 'Full access, bypasses all permission checks'),
  ('Admin',      'Full operational access'),
  ('Manager',    'Operations + production, no access control'),
  ('Cashier',    'POS + basic sales + customers')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.app_roles r WHERE r.name = v.name);

-- 2) Permission catalog -------------------------------------------
INSERT INTO public.permissions (permission_key, module, label) VALUES
  -- Dashboard
  ('dashboard.access',                    'Dashboard',   'View dashboard'),
  -- POS
  ('pos.access',                          'POS',         'Access POS terminal'),
  ('pos.discount',                        'POS',         'Apply discounts at POS'),
  ('pos.void',                            'POS',         'Void a line / sale at POS'),
  -- Sales
  ('sales.view',                          'Sales',       'View sales'),
  ('sales.create',                        'Sales',       'Create sales'),
  ('sales.edit',                          'Sales',       'Edit sales'),
  ('sales.delete',                        'Sales',       'Delete sales'),
  ('sales.return',                        'Sales',       'Sale returns'),
  ('sales.payments',                      'Sales',       'Customer payments'),
  -- Purchases
  ('purchases.view',                      'Purchases',   'View purchases'),
  ('purchases.create',                    'Purchases',   'Create purchases'),
  ('purchases.edit',                      'Purchases',   'Edit purchases'),
  ('purchases.delete',                    'Purchases',   'Delete purchases'),
  ('purchases.return',                    'Purchases',   'Purchase returns'),
  ('purchases.payments',                  'Purchases',   'Supplier payments'),
  -- Products
  ('products.view',                       'Products',    'View products'),
  ('products.create',                     'Products',    'Create products'),
  ('products.edit',                       'Products',    'Edit products'),
  ('products.delete',                     'Products',    'Delete products'),
  ('products.categories.manage',          'Products',    'Manage product categories'),
  ('products.units.manage',               'Products',    'Manage units'),
  ('products.selling_prices.manage',      'Products',    'Manage selling price groups'),
  -- Inventory
  ('inventory.view',                      'Inventory',   'View stock'),
  ('inventory.transfer',                  'Inventory',   'Transfer stock between showrooms'),
  ('inventory.adjust',                    'Inventory',   'Adjust stock'),
  -- Contacts
  ('contacts.customers.view',             'Contacts',    'View customers'),
  ('contacts.customers.manage',           'Contacts',    'Manage customers'),
  ('contacts.customer_groups.manage',     'Contacts',    'Manage customer groups'),
  ('contacts.suppliers.view',             'Contacts',    'View suppliers'),
  ('contacts.suppliers.manage',           'Contacts',    'Manage suppliers'),
  -- Production
  ('production.access',                   'Production',  'Access Production module'),
  ('production.recipes.view',             'Production',  'View recipes & BOM'),
  ('production.recipes.manage',           'Production',  'Create / edit recipes'),
  ('production.raw_materials.view',       'Production',  'View raw materials & stock'),
  ('production.raw_materials.manage',     'Production',  'Manage raw materials & stock'),
  ('production.work_orders.manage',       'Production',  'Manage work orders'),
  ('production.wastage.manage',           'Production',  'Log production wastage'),
  ('production.qc.manage',                'Production',  'Perform quality checks'),
  ('production.reports.view',             'Production',  'View production reports'),
  -- Expenses
  ('expenses.view',                       'Expenses',    'View expenses'),
  ('expenses.manage',                     'Expenses',    'Manage expenses'),
  ('expenses.categories.manage',          'Expenses',    'Manage expense categories'),
  -- Reports
  ('reports.sales',                       'Reports',     'Sales reports'),
  ('reports.purchase',                    'Reports',     'Purchase reports'),
  ('reports.stock',                       'Reports',     'Stock reports'),
  ('reports.expenses',                    'Reports',     'Expense reports'),
  ('reports.ledgers',                     'Reports',     'Payment & return ledgers'),
  -- Showrooms
  ('showrooms.view',                      'Showrooms',   'View showrooms'),
  ('showrooms.manage',                    'Showrooms',   'Manage showrooms'),
  -- Employees / Teams
  ('employees.view',                      'Employees',   'View employees'),
  ('employees.manage',                    'Employees',   'Manage employees'),
  -- Settings
  ('settings.general',                    'Settings',    'General settings'),
  ('settings.landing',                    'Settings',    'Edit landing page'),
  ('settings.access',                     'Settings',    'Access Control (roles & permissions)')
ON CONFLICT (permission_key) DO UPDATE
  SET module = EXCLUDED.module,
      label  = EXCLUDED.label;

-- 3) Default grants for built-in roles ----------------------------
-- Admin: everything except settings.access
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM public.app_roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Admin'
  AND p.permission_key <> 'settings.access'
ON CONFLICT DO NOTHING;

-- Manager: operations + production (no settings, no employees management, no purchases delete)
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM public.app_roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Manager'
  AND p.permission_key IN (
    'dashboard.access',
    'pos.access','pos.discount',
    'sales.view','sales.create','sales.edit','sales.return','sales.payments',
    'purchases.view','purchases.create','purchases.edit','purchases.return','purchases.payments',
    'products.view','products.create','products.edit','products.categories.manage','products.units.manage','products.selling_prices.manage',
    'inventory.view','inventory.transfer','inventory.adjust',
    'contacts.customers.view','contacts.customers.manage','contacts.customer_groups.manage',
    'contacts.suppliers.view','contacts.suppliers.manage',
    'production.access','production.recipes.view','production.recipes.manage',
    'production.raw_materials.view','production.raw_materials.manage',
    'production.work_orders.manage','production.wastage.manage','production.qc.manage','production.reports.view',
    'expenses.view','expenses.manage','expenses.categories.manage',
    'reports.sales','reports.purchase','reports.stock','reports.expenses','reports.ledgers',
    'showrooms.view','employees.view','settings.general'
  )
ON CONFLICT DO NOTHING;

-- Cashier: POS + basic sales + customers
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM public.app_roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Cashier'
  AND p.permission_key IN (
    'dashboard.access',
    'pos.access','pos.discount',
    'sales.view','sales.create','sales.return','sales.payments',
    'contacts.customers.view','contacts.customers.manage'
  )
ON CONFLICT DO NOTHING;
