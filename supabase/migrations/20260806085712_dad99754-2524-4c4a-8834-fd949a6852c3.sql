BEGIN;

CREATE TEMP TABLE _perm_remap(old_key text primary key, new_key text) ON COMMIT DROP;
INSERT INTO _perm_remap(old_key, new_key) VALUES
  ('production.view',       'production.access'),
  ('production.reports',    'production.reports.view'),
  ('production.recipes',    'production.recipes.manage'),
  ('production.wastage',    'production.wastage.manage'),
  ('production.wastage.log','production.wastage.manage'),
  ('raw_materials.manage',  'production.raw_materials.manage'),
  ('raw_stock.manage',      'production.raw_materials.manage'),
  ('raw_materials.view',    'production.raw_materials.view'),
  ('production.stock.view', 'production.factory_stock.view'),
  ('factory_stock.view',    'production.factory_stock.view');

INSERT INTO public.permissions (permission_key, label, module)
SELECT DISTINCT r.new_key, r.new_key, 'Production'
FROM _perm_remap r
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.permission_key = r.new_key);

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT DISTINCT rp.role_id, r.new_key
FROM public.role_permissions rp
JOIN _perm_remap r ON r.old_key = rp.permission_key
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions rp USING _perm_remap r WHERE rp.permission_key = r.old_key;
DELETE FROM public.permissions p USING _perm_remap r WHERE p.permission_key = r.old_key;

CREATE TEMP TABLE _perm_catalog(permission_key text primary key, label text, module text) ON COMMIT DROP;
INSERT INTO _perm_catalog(permission_key, label, module) VALUES
    ('contacts.customer_groups.manage', 'Manage customer groups', 'Contacts'),
    ('contacts.customers.ledger', 'View customer ledger & dues', 'Contacts'),
    ('contacts.customers.manage', 'Manage customers', 'Contacts'),
    ('contacts.customers.view', 'View customers', 'Contacts'),
    ('contacts.suppliers.manage', 'Manage suppliers', 'Contacts'),
    ('contacts.suppliers.view', 'View suppliers', 'Contacts'),
    ('dashboard.access', 'View dashboard', 'Dashboard'),
    ('employees.manage', 'Manage employees', 'Employees'),
    ('employees.view', 'View employees', 'Employees'),
    ('expenses.categories.manage', 'Manage expense categories', 'Expenses'),
    ('expenses.manage', 'Manage expenses', 'Expenses'),
    ('expenses.view', 'View expenses', 'Expenses'),
    ('inventory.adjust', 'Adjust stock', 'Inventory'),
    ('inventory.damaged_return', 'Send damaged returns to factory', 'Inventory'),
    ('inventory.receive', 'Receive incoming transfers', 'Inventory'),
    ('inventory.transfer', 'Create stock transfers', 'Inventory'),
    ('inventory.view', 'View stock', 'Inventory'),
    ('pos.access', 'Access POS terminal', 'POS'),
    ('pos.discount', 'Apply discounts at POS', 'POS'),
    ('pos.void', 'Void a line / sale at POS', 'POS'),
    ('production.access', 'Access Production module', 'Production'),
    ('production.batches', 'Run production batches', 'Production'),
    ('production.damaged.sell', 'Sell damaged goods', 'Production'),
    ('production.factory_stock.view', 'View factory stock', 'Production'),
    ('production.labels.print', 'Print batch labels', 'Production'),
    ('production.overheads.manage', 'Manage overhead categories', 'Production'),
    ('production.raw_materials.manage', 'Manage raw materials & stock', 'Production'),
    ('production.raw_materials.view', 'View raw materials & stock', 'Production'),
    ('production.recipes.manage', 'Create / edit recipes', 'Production'),
    ('production.recipes.view', 'View recipes & BOM', 'Production'),
    ('production.repurpose', 'Repurpose damaged products', 'Production'),
    ('production.sub_recipes.manage', 'Manage sub-recipes', 'Production'),
    ('production.wastage.manage', 'Log wastage & damage', 'Production'),
    ('production.reports.consumption', 'Material consumption report', 'Production Reports'),
    ('production.reports.cost', 'Production cost report', 'Production Reports'),
    ('production.reports.daily_register', 'Daily register report', 'Production Reports'),
    ('production.reports.overhead', 'Overhead report', 'Production Reports'),
    ('production.reports.profit_loss', 'Factory profit & loss report', 'Production Reports'),
    ('production.reports.view', 'View production reports (all)', 'Production Reports'),
    ('products.categories.manage', 'Manage product categories', 'Products'),
    ('products.create', 'Create products', 'Products'),
    ('products.delete', 'Delete products', 'Products'),
    ('products.edit', 'Edit products', 'Products'),
    ('products.selling_prices.manage', 'Manage selling price groups', 'Products'),
    ('products.units.manage', 'Manage units', 'Products'),
    ('products.view', 'View products', 'Products'),
    ('purchases.create', 'Create purchases', 'Purchases'),
    ('purchases.delete', 'Delete purchases', 'Purchases'),
    ('purchases.edit', 'Edit purchases', 'Purchases'),
    ('purchases.payments', 'Supplier payments', 'Purchases'),
    ('purchases.return', 'Purchase returns', 'Purchases'),
    ('purchases.view', 'View purchases', 'Purchases'),
    ('reports.expenses', 'Expense reports', 'Reports'),
    ('reports.ledgers', 'Payment & return ledgers', 'Reports'),
    ('reports.purchase', 'Purchase reports', 'Reports'),
    ('reports.sales', 'Sales reports', 'Reports'),
    ('reports.stock', 'Stock reports', 'Reports'),
    ('sales.create', 'Create sales', 'Sales'),
    ('sales.delete', 'Delete sales', 'Sales'),
    ('sales.edit', 'Edit sales', 'Sales'),
    ('sales.payments', 'Customer payments', 'Sales'),
    ('sales.return', 'Sale returns', 'Sales'),
    ('sales.return.damaged', 'Mark returned items as damaged', 'Sales'),
    ('sales.view', 'View sales', 'Sales'),
    ('settings.access', 'Access Control (roles & permissions)', 'Settings'),
    ('settings.backup', 'Backup & restore data', 'Settings'),
    ('settings.general', 'General settings', 'Settings'),
    ('settings.landing', 'Edit landing page', 'Settings'),
    ('showrooms.manage', 'Manage showrooms', 'Showrooms'),
    ('showrooms.view', 'View showrooms', 'Showrooms'),
    ('transfers.damaged.create', 'Create damaged-return transfer', 'Transfers');

INSERT INTO public.permissions (permission_key, label, module)
SELECT permission_key, label, module FROM _perm_catalog
ON CONFLICT (permission_key) DO UPDATE
  SET label = EXCLUDED.label, module = EXCLUDED.module, updated_at = now();

DELETE FROM public.role_permissions
WHERE permission_key NOT IN (SELECT permission_key FROM _perm_catalog);

DELETE FROM public.permissions
WHERE permission_key NOT IN (SELECT permission_key FROM _perm_catalog);

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, c.permission_key
FROM public.app_roles r
CROSS JOIN _perm_catalog c
WHERE r.name = 'Admin' AND c.permission_key <> 'settings.access'
ON CONFLICT DO NOTHING;

COMMIT;