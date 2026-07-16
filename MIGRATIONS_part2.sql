-- PART 2 — run AFTER MIGRATIONS_part1.sql has finished

-- ────────────────────────────────────────────────────────────
-- 20260709120037_61c4a271-f313-41ac-84f7-e455130557ad.sql
-- ────────────────────────────────────────────────────────────
-- =========================================================
-- Permission catalog
-- =========================================================
CREATE TABLE public.permissions (
  key TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read permissions"
  ON public.permissions FOR SELECT TO authenticated USING (true);

-- =========================================================
-- Custom roles
-- =========================================================
CREATE TABLE public.app_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
GRANT SELECT ON public.app_roles TO authenticated;
GRANT ALL ON public.app_roles TO service_role;
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Role -> permission link
-- =========================================================
CREATE TABLE public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.app_roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_key)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- User -> role assignments (scoped optionally per showroom)
-- =========================================================
CREATE TABLE public.user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES public.app_roles(id) ON DELETE CASCADE,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE UNIQUE INDEX user_role_assignments_uniq
  ON public.user_role_assignments (user_id, role_id, COALESCE(showroom_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT ON public.user_role_assignments TO authenticated;
GRANT ALL ON public.user_role_assignments TO service_role;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Helper: has_permission
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id UUID,
  _key TEXT,
  _showroom UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    -- Superadmin bypass (legacy enum or new role name)
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role::text = 'superadmin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.app_roles r ON r.id = ura.role_id
      JOIN public.role_permissions rp ON rp.role_id = r.id
      WHERE ura.user_id = _user_id
        AND r.is_active = true
        AND rp.permission_key = _key
        AND (ura.showroom_id IS NULL OR _showroom IS NULL OR ura.showroom_id = _showroom)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'superadmin'
  );
$$;

-- =========================================================
-- Policies: only Superadmin manages RBAC
-- =========================================================
CREATE POLICY "Anyone signed in can read roles"
  ON public.app_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superadmin manages roles insert"
  ON public.app_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin manages roles update"
  ON public.app_roles FOR UPDATE TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin manages roles delete"
  ON public.app_roles FOR DELETE TO authenticated
  USING (public.is_superadmin(auth.uid()) AND is_system = false);

CREATE POLICY "Anyone signed in can read role_permissions"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superadmin manages role_permissions insert"
  ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin manages role_permissions delete"
  ON public.role_permissions FOR DELETE TO authenticated
  USING (public.is_superadmin(auth.uid()));

CREATE POLICY "Users see own assignments; superadmin sees all"
  ON public.user_role_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin assigns roles insert"
  ON public.user_role_assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin assigns roles update"
  ON public.user_role_assignments FOR UPDATE TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "Superadmin assigns roles delete"
  ON public.user_role_assignments FOR DELETE TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- =========================================================
-- Triggers: updated_at
-- =========================================================
CREATE TRIGGER app_roles_set_updated_at
  BEFORE UPDATE ON public.app_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Seed permission catalog
-- =========================================================
INSERT INTO public.permissions (key, module, label) VALUES
  ('dashboard.view','Dashboard','View dashboard'),
  ('pos.use','POS','Use POS'),
  ('products.view','Products','View products'),
  ('products.create','Products','Create products'),
  ('products.edit','Products','Edit products'),
  ('products.delete','Products','Delete products'),
  ('raw_materials.view','Raw Materials','View raw materials'),
  ('raw_materials.manage','Raw Materials','Manage raw materials'),
  ('recipes.view','Recipes','View recipes'),
  ('recipes.manage','Recipes','Manage recipes'),
  ('production.view','Production','View production'),
  ('production.manage','Production','Manage production'),
  ('purchases.view','Purchases','View purchases'),
  ('purchases.manage','Purchases','Manage purchases'),
  ('sales.view','Sales','View sales'),
  ('sales.create','Sales','Create sales'),
  ('sales.edit','Sales','Edit sales'),
  ('sales.delete','Sales','Delete sales'),
  ('customers.view','Customers','View customers'),
  ('customers.manage','Customers','Manage customers'),
  ('suppliers.view','Suppliers','View suppliers'),
  ('suppliers.manage','Suppliers','Manage suppliers'),
  ('inventory.view','Inventory','View inventory'),
  ('inventory.manage','Inventory','Manage inventory'),
  ('expenses.view','Expenses','View expenses'),
  ('expenses.manage','Expenses','Manage expenses'),
  ('reports.view','Reports','View reports'),
  ('accounting.view','Accounting','View accounting'),
  ('accounting.manage','Accounting','Manage accounting'),
  ('employees.view','Employees','View employees'),
  ('employees.manage','Employees','Manage employees'),
  ('showrooms.view','Showrooms','View showrooms'),
  ('showrooms.manage','Showrooms','Manage showrooms'),
  ('landing.manage','Landing','Edit landing page content'),
  ('settings.view','Settings','View settings'),
  ('settings.manage','Settings','Manage settings'),
  ('roles.manage','Access Control','Manage roles & permissions'),
  ('users.assign_roles','Access Control','Assign roles to users');

-- =========================================================
-- Seed built-in roles
-- =========================================================
INSERT INTO public.app_roles (name, description, is_system) VALUES
  ('Superadmin','Full access, manages roles and users', true),
  ('Owner','Factory owner — full operational access', true),
  ('Admin','Administrator — most operational access', true),
  ('Factory Manager','Runs the factory (production, raw materials)', true),
  ('Showroom Manager','Runs one showroom (sales, stock, customers)', true),
  ('Cashier','POS-only at a showroom', true);

-- Superadmin gets every permission
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM public.app_roles r, public.permissions p
WHERE r.name = 'Superadmin';

-- Owner: everything except roles.manage / users.assign_roles
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM public.app_roles r, public.permissions p
WHERE r.name = 'Owner'
  AND p.key NOT IN ('roles.manage','users.assign_roles');

-- Admin: everything except sensitive access control + role mgmt
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM public.app_roles r, public.permissions p
WHERE r.name = 'Admin'
  AND p.key NOT IN ('roles.manage','users.assign_roles','landing.manage');

-- Factory Manager
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM public.app_roles r, public.permissions p
WHERE r.name = 'Factory Manager' AND p.key IN (
  'dashboard.view','products.view','raw_materials.view','raw_materials.manage',
  'recipes.view','recipes.manage','production.view','production.manage',
  'purchases.view','purchases.manage','suppliers.view','suppliers.manage',
  'inventory.view','inventory.manage','reports.view'
);

-- Showroom Manager
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM public.app_roles r, public.permissions p
WHERE r.name = 'Showroom Manager' AND p.key IN (
  'dashboard.view','pos.use','products.view',
  'sales.view','sales.create','sales.edit',
  'customers.view','customers.manage',
  'inventory.view','expenses.view','expenses.manage',
  'reports.view'
);

-- Cashier
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM public.app_roles r, public.permissions p
WHERE r.name = 'Cashier' AND p.key IN (
  'pos.use','products.view','sales.view','sales.create','customers.view'
);

-- =========================================================
-- Promote current owner(s) to superadmin (bridge legacy enum)
-- =========================================================
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT user_id, 'superadmin'::app_role
FROM public.user_roles
WHERE role = 'owner'
ON CONFLICT DO NOTHING;

-- And give them the Superadmin app_role assignment
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT DISTINCT ur.user_id, r.id
FROM public.user_roles ur, public.app_roles r
WHERE ur.role = 'owner' AND r.name = 'Superadmin'
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 20260709120104_ee3c3b73-cd58-4301-9b25-8bd742d6a2b7.sql
-- ────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 20260709120318_233b84b2-a9f2-40f2-a0eb-6fdcd3b28537.sql
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email TEXT)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  uid UUID;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  RETURN uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_user_id_by_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(TEXT) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 20260709120447_ba968422-3bbd-4880-8aea-4a0edd9b3119.sql
-- ────────────────────────────────────────────────────────────
-- All showroom IDs a user can access. NULL scope on an assignment = global (all showrooms).
CREATE OR REPLACE FUNCTION public.user_showroom_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH has_global AS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.app_roles r ON r.id = ura.role_id AND r.is_active = true
    WHERE ura.user_id = _user_id AND ura.showroom_id IS NULL
    UNION
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin','owner')
  )
  SELECT id FROM public.showrooms WHERE is_active = true AND EXISTS (SELECT 1 FROM has_global)
  UNION
  SELECT DISTINCT ura.showroom_id
  FROM public.user_role_assignments ura
  JOIN public.app_roles r ON r.id = ura.role_id AND r.is_active = true
  WHERE ura.user_id = _user_id AND ura.showroom_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.user_has_showroom_access(_user_id UUID, _showroom UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _showroom IN (SELECT public.user_showroom_ids(_user_id));
$$;

REVOKE EXECUTE ON FUNCTION public.user_showroom_ids(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_showroom_access(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_showroom_ids(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_showroom_access(UUID, UUID) TO authenticated, service_role;

-- Tighten showrooms visibility so non-admin users only see showrooms they're assigned to.
DROP POLICY IF EXISTS "Authenticated can view showrooms" ON public.showrooms;
CREATE POLICY "Users can view their assigned showrooms"
  ON public.showrooms FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_showroom_access(auth.uid(), id)
  );

-- ────────────────────────────────────────────────────────────
-- 20260709121016_a5159078-5b3e-451d-bc8b-b0a0078d49cd.sql
-- ────────────────────────────────────────────────────────────
-- =========================================================
-- Products (shared catalog)
-- =========================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'pc',
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  barcode TEXT,
  mfg_date DATE,
  expiry_date DATE,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View products" ON public.products FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'products.view'));
CREATE POLICY "Create products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'products.create'));
CREATE POLICY "Edit products" ON public.products FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'products.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'products.edit'));
CREATE POLICY "Delete products" ON public.products FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'products.delete'));

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- product_stock (per location; NULL showroom_id = factory)
-- =========================================================
CREATE TABLE public.product_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_stock_uniq
  ON public.product_stock (product_id, COALESCE(showroom_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_stock TO authenticated;
GRANT ALL ON public.product_stock TO service_role;
ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stock" ON public.product_stock FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (showroom_id IS NULL AND public.has_permission(auth.uid(), 'inventory.view'))
    OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
  );
CREATE POLICY "Write stock" ON public.product_stock FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'inventory.manage', showroom_id)
    AND (
      showroom_id IS NULL
      OR public.user_has_showroom_access(auth.uid(), showroom_id)
      OR public.is_superadmin(auth.uid())
    )
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'inventory.manage', showroom_id)
    AND (
      showroom_id IS NULL
      OR public.user_has_showroom_access(auth.uid(), showroom_id)
      OR public.is_superadmin(auth.uid())
    )
  );

CREATE TRIGGER product_stock_set_updated_at
  BEFORE UPDATE ON public.product_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- stock_ledger (append-only history)
-- =========================================================
CREATE TYPE public.stock_move_kind AS ENUM (
  'production','transfer_in','transfer_out','sale','adjustment','return','purchase'
);

CREATE TABLE public.stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  qty NUMERIC(14,3) NOT NULL,
  kind public.stock_move_kind NOT NULL,
  ref_type TEXT,
  ref_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE INDEX stock_ledger_product_idx ON public.stock_ledger (product_id, created_at DESC);
CREATE INDEX stock_ledger_scope_idx ON public.stock_ledger (showroom_id, created_at DESC);
GRANT SELECT, INSERT ON public.stock_ledger TO authenticated;
GRANT ALL ON public.stock_ledger TO service_role;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View ledger" ON public.stock_ledger FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (showroom_id IS NULL AND public.has_permission(auth.uid(), 'inventory.view'))
    OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
  );
-- Inserts flow through commit_stock_movement (SECURITY DEFINER); block direct inserts.
CREATE POLICY "No direct ledger insert" ON public.stock_ledger FOR INSERT TO authenticated
  WITH CHECK (false);

-- =========================================================
-- Transfers
-- =========================================================
CREATE TYPE public.transfer_status AS ENUM ('draft','sent','received','cancelled');

CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  source_showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL, -- NULL = factory
  dest_showroom_id UUID NOT NULL REFERENCES public.showrooms(id) ON DELETE RESTRICT,
  status public.transfer_status NOT NULL DEFAULT 'draft',
  note TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  sent_by UUID,
  received_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View transfers" ON public.transfers FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (source_showroom_id IS NULL AND public.has_permission(auth.uid(), 'inventory.view'))
    OR (source_showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), source_showroom_id))
    OR public.user_has_showroom_access(auth.uid(), dest_showroom_id)
  );
CREATE POLICY "Create transfers" ON public.transfers FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'inventory.manage', source_showroom_id)
    AND (
      source_showroom_id IS NULL
      OR public.user_has_showroom_access(auth.uid(), source_showroom_id)
      OR public.is_superadmin(auth.uid())
    )
  );
CREATE POLICY "Update transfers" ON public.transfers FOR UPDATE TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (source_showroom_id IS NULL AND public.has_permission(auth.uid(), 'inventory.manage'))
    OR (source_showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), source_showroom_id))
    OR public.user_has_showroom_access(auth.uid(), dest_showroom_id)
  )
  WITH CHECK (true);

CREATE TRIGGER transfers_set_updated_at
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_items TO authenticated;
GRANT ALL ON public.transfer_items TO service_role;
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View transfer items" ON public.transfer_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id));
CREATE POLICY "Write transfer items" ON public.transfer_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id AND t.status = 'draft'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id AND t.status = 'draft'));

-- =========================================================
-- commit_stock_movement: writes ledger + updates product_stock atomically.
-- SECURITY DEFINER so it can enforce authorization itself and bypass the
-- ledger's "no direct insert" policy.
-- =========================================================
CREATE OR REPLACE FUNCTION public.commit_stock_movement(
  _product_id UUID,
  _showroom_id UUID,
  _qty NUMERIC,
  _kind public.stock_move_kind,
  _ref_type TEXT DEFAULT NULL,
  _ref_id UUID DEFAULT NULL,
  _note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ledger_id UUID;
  uid UUID := auth.uid();
  allowed BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  allowed := public.is_superadmin(uid)
    OR public.has_role(uid, 'owner'::app_role)
    OR public.has_role(uid, 'admin'::app_role)
    OR (
      public.has_permission(uid, 'inventory.manage', _showroom_id)
      AND (_showroom_id IS NULL OR public.user_has_showroom_access(uid, _showroom_id))
    );

  IF NOT allowed THEN RAISE EXCEPTION 'Forbidden'; END IF;

  INSERT INTO public.stock_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note, created_by)
  VALUES (_product_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note, uid)
  RETURNING id INTO ledger_id;

  INSERT INTO public.product_stock (product_id, showroom_id, quantity)
  VALUES (_product_id, _showroom_id, _qty)
  ON CONFLICT (product_id, COALESCE(showroom_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET quantity = public.product_stock.quantity + EXCLUDED.quantity,
                updated_at = now();

  RETURN ledger_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.commit_stock_movement(UUID, UUID, NUMERIC, public.stock_move_kind, TEXT, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_stock_movement(UUID, UUID, NUMERIC, public.stock_move_kind, TEXT, UUID, TEXT)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 20260709121043_cf7e0423-94ee-476d-b111-03442db0ecd1.sql
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Update transfers" ON public.transfers;
CREATE POLICY "Update transfers" ON public.transfers FOR UPDATE TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (source_showroom_id IS NULL AND public.has_permission(auth.uid(), 'inventory.manage'))
    OR (source_showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), source_showroom_id))
    OR public.user_has_showroom_access(auth.uid(), dest_showroom_id)
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (source_showroom_id IS NULL AND public.has_permission(auth.uid(), 'inventory.manage'))
    OR (source_showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), source_showroom_id))
    OR public.user_has_showroom_access(auth.uid(), dest_showroom_id)
  );

-- ────────────────────────────────────────────────────────────
-- 20260709124239_13d9eaff-183a-4a8a-9ec3-6c30900bdc6a.sql
-- ────────────────────────────────────────────────────────────
-- sales header
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  due NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  note TEXT,
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_select_scoped" ON public.sales FOR SELECT TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
  OR (showroom_id IS NULL AND public.has_permission(auth.uid(), 'sales.view', NULL))
);

CREATE POLICY "sales_insert_scoped" ON public.sales FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
);

CREATE POLICY "sales_update_scoped" ON public.sales FOR UPDATE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
);

CREATE INDEX sales_showroom_created_idx ON public.sales(showroom_id, created_at DESC);

CREATE TRIGGER sales_set_updated_at BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- sale lines
CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  qty NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_items_select_via_sale" ON public.sale_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));

CREATE POLICY "sale_items_insert_via_sale" ON public.sale_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));

CREATE POLICY "sale_items_update_via_sale" ON public.sale_items FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));

CREATE INDEX sale_items_sale_idx ON public.sale_items(sale_id);
CREATE INDEX sale_items_product_idx ON public.sale_items(product_id);

-- allow 'sale' kind in stock ledger (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'stock_move_kind' AND e.enumlabel = 'sale'
  ) THEN
    ALTER TYPE public.stock_move_kind ADD VALUE 'sale';
  END IF;
END
$$;

-- ────────────────────────────────────────────────────────────
-- 20260709131128_3e7f8d59-79a9-4912-800f-e79860c5e68d.sql
-- ────────────────────────────────────────────────────────────
-- Enum for raw material stock movements
DO $$ BEGIN
  CREATE TYPE public.raw_stock_move_kind AS ENUM ('purchase','adjustment','production_consume','return','transfer_in','transfer_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================
-- suppliers
-- =========================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  category TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers read" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers write" ON public.suppliers FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'purchasing.manage', NULL))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'purchasing.manage', NULL));
CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- raw_materials
-- =========================
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT,
  unit TEXT NOT NULL DEFAULT 'kg',
  category TEXT,
  min_stock NUMERIC NOT NULL DEFAULT 0,
  cost NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_materials TO authenticated;
GRANT ALL ON public.raw_materials TO service_role;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raw_materials read" ON public.raw_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "raw_materials write" ON public.raw_materials FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'purchasing.manage', NULL))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'purchasing.manage', NULL));
CREATE TRIGGER set_raw_materials_updated_at BEFORE UPDATE ON public.raw_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- raw_material_stock
-- =========================
CREATE TABLE IF NOT EXISTS public.raw_material_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS raw_material_stock_uniq
  ON public.raw_material_stock (material_id, COALESCE(showroom_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT ON public.raw_material_stock TO authenticated;
GRANT ALL ON public.raw_material_stock TO service_role;
ALTER TABLE public.raw_material_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raw_material_stock read" ON public.raw_material_stock FOR SELECT TO authenticated
  USING (
    showroom_id IS NULL
    OR public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(),'owner'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.user_has_showroom_access(auth.uid(), showroom_id)
  );

-- =========================
-- raw_stock_ledger
-- =========================
CREATE TABLE IF NOT EXISTS public.raw_stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  qty NUMERIC NOT NULL,
  kind public.raw_stock_move_kind NOT NULL,
  ref_type TEXT,
  ref_id UUID,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.raw_stock_ledger TO authenticated;
GRANT ALL ON public.raw_stock_ledger TO service_role;
ALTER TABLE public.raw_stock_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raw_stock_ledger read" ON public.raw_stock_ledger FOR SELECT TO authenticated
  USING (
    showroom_id IS NULL
    OR public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(),'owner'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.user_has_showroom_access(auth.uid(), showroom_id)
  );

-- RPC to commit raw stock movements
CREATE OR REPLACE FUNCTION public.commit_raw_stock_movement(
  _material_id UUID, _showroom_id UUID, _qty NUMERIC, _kind public.raw_stock_move_kind,
  _ref_type TEXT DEFAULT NULL, _ref_id UUID DEFAULT NULL, _note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ledger_id UUID;
  uid UUID := auth.uid();
  allowed BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  allowed := public.is_superadmin(uid)
    OR public.has_role(uid, 'owner'::app_role)
    OR public.has_role(uid, 'admin'::app_role)
    OR public.has_permission(uid, 'purchasing.manage', _showroom_id)
    OR public.has_permission(uid, 'inventory.manage', _showroom_id);
  IF NOT allowed THEN RAISE EXCEPTION 'Forbidden'; END IF;

  INSERT INTO public.raw_stock_ledger (material_id, showroom_id, qty, kind, ref_type, ref_id, note, created_by)
  VALUES (_material_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note, uid)
  RETURNING id INTO ledger_id;

  INSERT INTO public.raw_material_stock (material_id, showroom_id, quantity)
  VALUES (_material_id, _showroom_id, _qty)
  ON CONFLICT (material_id, COALESCE(showroom_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET quantity = public.raw_material_stock.quantity + EXCLUDED.quantity,
                updated_at = now();
  RETURN ledger_id;
END;
$$;

-- =========================
-- purchase_categories
-- =========================
CREATE TABLE IF NOT EXISTS public.purchase_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_categories TO authenticated;
GRANT ALL ON public.purchase_categories TO service_role;
ALTER TABLE public.purchase_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_categories read" ON public.purchase_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_categories write" ON public.purchase_categories FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'purchasing.manage', NULL))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'purchasing.manage', NULL));
CREATE TRIGGER set_purchase_categories_updated_at BEFORE UPDATE ON public.purchase_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed defaults
INSERT INTO public.purchase_categories (name) VALUES
  ('Flour & Grains'),('Dairy'),('Chocolate & Nuts'),('Packaging'),('Other')
ON CONFLICT (name) DO NOTHING;

-- =========================
-- purchases + purchase_items
-- =========================
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.purchase_categories(id) ON DELETE SET NULL,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  purchase_date DATE NOT NULL DEFAULT (now()::date),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  paid NUMERIC NOT NULL DEFAULT 0,
  due NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Received',
  payment TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases read" ON public.purchases FOR SELECT TO authenticated
  USING (
    showroom_id IS NULL
    OR public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(),'owner'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.user_has_showroom_access(auth.uid(), showroom_id)
  );
CREATE POLICY "purchases write" ON public.purchases FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'purchasing.manage', showroom_id))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'purchasing.manage', showroom_id));
CREATE TRIGGER set_purchases_updated_at BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.raw_materials(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT,
  qty NUMERIC NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_items read" ON public.purchase_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id));
CREATE POLICY "purchase_items write" ON public.purchase_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id));

-- =========================
-- expenses
-- =========================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL DEFAULT (now()::date),
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  paid_by TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses read" ON public.expenses FOR SELECT TO authenticated
  USING (
    showroom_id IS NULL
    OR public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(),'owner'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.user_has_showroom_access(auth.uid(), showroom_id)
  );
CREATE POLICY "expenses write" ON public.expenses FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'accounting.manage', showroom_id))
  WITH CHECK (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role) OR public.has_permission(auth.uid(),'accounting.manage', showroom_id));
CREATE TRIGGER set_expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 20260709132556_2632b81e-9304-4f90-b279-07fc3f44b88d.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  qty numeric NOT NULL CHECK (qty > 0),
  unit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, material_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes read" ON public.recipes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "recipes write" ON public.recipes
  FOR ALL TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'products.edit', NULL)
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'products.edit', NULL)
  );

CREATE TRIGGER recipes_set_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX recipes_product_idx ON public.recipes(product_id);
CREATE INDEX recipes_material_idx ON public.recipes(material_id);

-- ────────────────────────────────────────────────────────────
-- 20260709134218_054f864f-3161-4cd0-912a-52cf8f1b6662.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  loyalty_points NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View customers" ON public.customers
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'crm.view') OR has_any_app_role(auth.uid()));

CREATE POLICY "Insert customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'crm.manage') OR has_any_app_role(auth.uid()));

CREATE POLICY "Update customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'crm.manage') OR has_any_app_role(auth.uid()))
  WITH CHECK (has_permission(auth.uid(), 'crm.manage') OR has_any_app_role(auth.uid()));

CREATE POLICY "Delete customers" ON public.customers
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'crm.manage') OR has_any_app_role(auth.uid()));

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX customers_phone_idx ON public.customers (phone);
CREATE INDEX customers_name_idx ON public.customers (lower(name));

-- ────────────────────────────────────────────────────────────
-- 20260709134746_2565420d-cc84-4476-b024-25102b754c82.sql
-- ────────────────────────────────────────────────────────────
CREATE TYPE public.order_status AS ENUM ('Pending','In Production','Ready','Delivered','Cancelled');
CREATE TYPE public.order_type AS ENUM ('Retail','Wholesale','Custom Cake','Online');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE DEFAULT ('ORD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  order_type public.order_type NOT NULL DEFAULT 'Retail',
  status public.order_status NOT NULL DEFAULT 'Pending',
  items TEXT NOT NULL,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders view" ON public.orders FOR SELECT TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_any_app_role(auth.uid())
  OR public.has_permission(auth.uid(), 'orders.view', showroom_id)
  OR public.has_permission(auth.uid(), 'orders.manage', showroom_id)
);

CREATE POLICY "orders manage" ON public.orders FOR ALL TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_any_app_role(auth.uid())
  OR public.has_permission(auth.uid(), 'orders.manage', showroom_id)
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.has_any_app_role(auth.uid())
  OR public.has_permission(auth.uid(), 'orders.manage', showroom_id)
);

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX orders_showroom_created_idx ON public.orders (showroom_id, created_at DESC);
CREATE INDEX orders_status_idx ON public.orders (status);

-- ────────────────────────────────────────────────────────────
-- 20260709135253_e0462d3d-9f8f-4893-9549-c988f1ef698d.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.customer_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_groups TO authenticated;
GRANT ALL ON public.customer_groups TO service_role;

ALTER TABLE public.customer_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_groups view" ON public.customer_groups FOR SELECT TO authenticated
USING (public.is_superadmin(auth.uid()) OR public.has_any_app_role(auth.uid()));

CREATE POLICY "customer_groups manage" ON public.customer_groups FOR ALL TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_permission(auth.uid(),'crm.manage', NULL)
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_permission(auth.uid(),'crm.manage', NULL)
);

CREATE TRIGGER customer_groups_set_updated_at
BEFORE UPDATE ON public.customer_groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.customer_groups (name, discount_pct, is_default) VALUES
  ('No Group', 0, true),
  ('Regular', 5, false),
  ('VIP', 10, false),
  ('Wholesale', 15, false)
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 20260709135657_42ecb49f-16ed-4717-be8b-252a7cdfbce8.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,
  salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  attendance NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (attendance >= 0 AND attendance <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees view" ON public.employees FOR SELECT TO authenticated
USING (public.is_superadmin(auth.uid()) OR public.has_any_app_role(auth.uid()));

CREATE POLICY "employees manage" ON public.employees FOR ALL TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_permission(auth.uid(),'team.manage', NULL)
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_permission(auth.uid(),'team.manage', NULL)
);

CREATE TRIGGER employees_set_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX employees_showroom_idx ON public.employees (showroom_id);
CREATE INDEX employees_active_idx ON public.employees (is_active);

-- ────────────────────────────────────────────────────────────
-- 20260709140256_c00b17b5-cf9a-4bdc-a7cb-9666548b427e.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_current BOOLEAN NOT NULL DEFAULT true UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  tagline TEXT,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT,
  email TEXT,
  vat_reg TEXT,
  logo_url TEXT,
  footer_note TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_settings view" ON public.company_settings FOR SELECT TO authenticated
USING (public.is_superadmin(auth.uid()) OR public.has_any_app_role(auth.uid()));

CREATE POLICY "company_settings manage" ON public.company_settings FOR ALL TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
);

CREATE TRIGGER company_settings_set_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.company_settings (name, address, is_current)
VALUES ('Muzahid Food', 'Dhaka, Bangladesh', true)
ON CONFLICT (is_current) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 20260709140749_d3bc7422-3f4e-4593-900e-451dd3421cb3.sql
-- ────────────────────────────────────────────────────────────
CREATE TYPE public.sale_return_reason AS ENUM ('damaged','wrong_item','customer_request','expired','other');

CREATE TABLE public.sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  invoice_ref TEXT,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  customer_name TEXT,
  reason public.sale_return_reason NOT NULL DEFAULT 'other',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON public.sale_returns(showroom_id);
CREATE INDEX ON public.sale_returns(sale_id);
CREATE INDEX ON public.sale_return_items(return_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_return_items TO authenticated;
GRANT ALL ON public.sale_returns TO service_role;
GRANT ALL ON public.sale_return_items TO service_role;

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view sale returns"
  ON public.sale_returns FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_any_app_role(auth.uid())
    OR public.has_permission(auth.uid(), 'sales.view', showroom_id)
  );

CREATE POLICY "Staff can manage sale returns"
  ON public.sale_returns FOR ALL TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'sales.manage', showroom_id)
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'sales.manage', showroom_id)
  );

CREATE POLICY "Staff can view sale return items"
  ON public.sale_return_items FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sale_returns sr WHERE sr.id = return_id
      AND (public.is_superadmin(auth.uid())
           OR public.has_any_app_role(auth.uid())
           OR public.has_permission(auth.uid(), 'sales.view', sr.showroom_id)))
  );

CREATE POLICY "Staff can manage sale return items"
  ON public.sale_return_items FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sale_returns sr WHERE sr.id = return_id
      AND (public.is_superadmin(auth.uid())
           OR public.has_role(auth.uid(), 'owner'::app_role)
           OR public.has_role(auth.uid(), 'admin'::app_role)
           OR public.has_permission(auth.uid(), 'sales.manage', sr.showroom_id)))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.sale_returns sr WHERE sr.id = return_id
      AND (public.is_superadmin(auth.uid())
           OR public.has_role(auth.uid(), 'owner'::app_role)
           OR public.has_role(auth.uid(), 'admin'::app_role)
           OR public.has_permission(auth.uid(), 'sales.manage', sr.showroom_id)))
  );

CREATE TRIGGER trg_sale_returns_updated_at
  BEFORE UPDATE ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE SEQUENCE IF NOT EXISTS public.sale_returns_code_seq START 1;

CREATE OR REPLACE FUNCTION public.set_sale_return_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := 'RT-' || lpad(nextval('public.sale_returns_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sale_returns_code
  BEFORE INSERT ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_sale_return_code();

-- ────────────────────────────────────────────────────────────
-- 20260709142228_1e2522bc-b2a5-48c0-8be2-e8ef7dec7938.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.user_profiles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'Asia/Dhaka',
  software JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile" ON public.user_profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_profiles_set_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 20260709143955_035df6f4-f7f5-4c17-9e15-eb2239404122.sql
-- ────────────────────────────────────────────────────────────
-- Phase 2W: Purchase returns + supplier/customer payment ledgers

-- =========================================
-- 1) PURCHASE RETURNS
-- =========================================
CREATE TYPE public.purchase_return_reason AS ENUM ('damaged','wrong_item','expired','overstock','quality','other');

CREATE SEQUENCE IF NOT EXISTS public.purchase_returns_code_seq;

CREATE TABLE public.purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  invoice_ref TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  reason public.purchase_return_reason NOT NULL DEFAULT 'other',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX purchase_returns_purchase_id_idx ON public.purchase_returns(purchase_id);
CREATE INDEX purchase_returns_showroom_id_idx ON public.purchase_returns(showroom_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_returns TO authenticated;
GRANT ALL ON public.purchase_returns TO service_role;
GRANT USAGE ON SEQUENCE public.purchase_returns_code_seq TO authenticated, service_role;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view purchase returns" ON public.purchase_returns FOR SELECT TO authenticated
  USING (is_superadmin(auth.uid()) OR has_any_app_role(auth.uid()) OR has_permission(auth.uid(),'purchasing.view',showroom_id));
CREATE POLICY "Staff manage purchase returns" ON public.purchase_returns FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_permission(auth.uid(),'purchasing.manage',showroom_id))
  WITH CHECK (is_superadmin(auth.uid()) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_permission(auth.uid(),'purchasing.manage',showroom_id));

CREATE OR REPLACE FUNCTION public.set_purchase_return_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := 'PR-' || lpad(nextval('public.purchase_returns_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_purchase_returns_code BEFORE INSERT ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_purchase_return_code();
CREATE TRIGGER trg_purchase_returns_updated_at BEFORE UPDATE ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.purchase_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.raw_materials(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX purchase_return_items_return_id_idx ON public.purchase_return_items(return_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_return_items TO authenticated;
GRANT ALL ON public.purchase_return_items TO service_role;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View purchase return items" ON public.purchase_return_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_returns pr WHERE pr.id = return_id));
CREATE POLICY "Manage purchase return items" ON public.purchase_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_returns pr WHERE pr.id = return_id
    AND (is_superadmin(auth.uid()) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_permission(auth.uid(),'purchasing.manage',pr.showroom_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_returns pr WHERE pr.id = return_id
    AND (is_superadmin(auth.uid()) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_permission(auth.uid(),'purchasing.manage',pr.showroom_id))));

-- =========================================
-- 2) SUPPLIER PAYMENTS LEDGER (money OUT to suppliers)
-- =========================================
CREATE TABLE public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  paid_on DATE NOT NULL DEFAULT now()::date,
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX supplier_payments_supplier_idx ON public.supplier_payments(supplier_id);
CREATE INDEX supplier_payments_purchase_idx ON public.supplier_payments(purchase_id);
CREATE INDEX supplier_payments_showroom_idx ON public.supplier_payments(showroom_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view supplier payments" ON public.supplier_payments FOR SELECT TO authenticated
  USING (is_superadmin(auth.uid()) OR has_any_app_role(auth.uid()) OR has_permission(auth.uid(),'purchasing.view',showroom_id));
CREATE POLICY "Staff manage supplier payments" ON public.supplier_payments FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_permission(auth.uid(),'purchasing.manage',showroom_id))
  WITH CHECK (is_superadmin(auth.uid()) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_permission(auth.uid(),'purchasing.manage',showroom_id));

CREATE TRIGGER trg_supplier_payments_updated_at BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 3) CUSTOMER PAYMENTS LEDGER (money IN from customers, links to sale invoices)
-- =========================================
CREATE TABLE public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  invoice_ref TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  paid_on DATE NOT NULL DEFAULT now()::date,
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_payments_customer_idx ON public.customer_payments(customer_id);
CREATE INDEX customer_payments_sale_idx ON public.customer_payments(sale_id);
CREATE INDEX customer_payments_showroom_idx ON public.customer_payments(showroom_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view customer payments" ON public.customer_payments FOR SELECT TO authenticated
  USING (is_superadmin(auth.uid()) OR has_any_app_role(auth.uid()) OR has_permission(auth.uid(),'sales.view',showroom_id));
CREATE POLICY "Staff manage customer payments" ON public.customer_payments FOR ALL TO authenticated
  USING (is_superadmin(auth.uid()) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_permission(auth.uid(),'sales.manage',showroom_id))
  WITH CHECK (is_superadmin(auth.uid()) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_permission(auth.uid(),'sales.manage',showroom_id));

CREATE TRIGGER trg_customer_payments_updated_at BEFORE UPDATE ON public.customer_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 20260709152052_c4a7fe59-92fd-4897-9a1b-dcb868bf1926.sql
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Storage policies for the three buckets. Any authenticated user (staff) may
-- read and write. Anonymous users have no access — files served via signed URLs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='app_buckets_authenticated_read') THEN
    CREATE POLICY app_buckets_authenticated_read ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id IN ('product-images','customer-avatars','company-logos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='app_buckets_authenticated_insert') THEN
    CREATE POLICY app_buckets_authenticated_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id IN ('product-images','customer-avatars','company-logos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='app_buckets_authenticated_update') THEN
    CREATE POLICY app_buckets_authenticated_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id IN ('product-images','customer-avatars','company-logos'))
      WITH CHECK (bucket_id IN ('product-images','customer-avatars','company-logos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='app_buckets_authenticated_delete') THEN
    CREATE POLICY app_buckets_authenticated_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id IN ('product-images','customer-avatars','company-logos'));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 20260709153706_2db53b17-bb22-40d7-8c1e-d85ee3a9c963.sql
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owners and admins can insert showrooms" ON public.showrooms;
DROP POLICY IF EXISTS "Owners and admins can update showrooms" ON public.showrooms;
DROP POLICY IF EXISTS "Owners and admins can delete showrooms" ON public.showrooms;

CREATE POLICY "Admins can insert showrooms" ON public.showrooms
FOR INSERT TO authenticated
WITH CHECK (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Admins can update showrooms" ON public.showrooms
FOR UPDATE TO authenticated
USING (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
WITH CHECK (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Admins can delete showrooms" ON public.showrooms
FOR DELETE TO authenticated
USING (public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

-- ────────────────────────────────────────────────────────────
-- 20260709155540_343605af-60ea-4085-903b-90fe84e9d98b.sql
-- ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.showrooms TO authenticated;
GRANT ALL ON public.showrooms TO service_role;

-- ────────────────────────────────────────────────────────────
-- 20260709160030_7f55dbeb-d2ce-444f-83cb-2f0b449b7b4e.sql
-- ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_showroom_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_showroom_access(uuid, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 20260709162214_611fdde5-dced-4b08-a686-002b2f3b1a13.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX product_categories_name_key ON public.product_categories (lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view categories"
  ON public.product_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Create categories via products.create"
  ON public.product_categories FOR INSERT
  TO authenticated WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'products.create', NULL)
  );

CREATE POLICY "Edit categories via products.edit"
  ON public.product_categories FOR UPDATE
  TO authenticated USING (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'products.edit', NULL)
  ) WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'products.edit', NULL)
  );

CREATE POLICY "Delete categories via products.delete"
  ON public.product_categories FOR DELETE
  TO authenticated USING (
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'products.delete', NULL)
  );

CREATE TRIGGER product_categories_set_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.product_categories (name)
VALUES ('Cake'), ('Bread'), ('Biscuit'), ('Pastry')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 20260712084952_e34daa71-9748-42d0-8667-3e8029e923b3.sql
-- ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.has_any_app_role(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_has_showroom_access(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_showroom_ids(uuid) TO authenticated, anon;

-- ────────────────────────────────────────────────────────────
-- 20260714134940_752a3de6-bbfb-469a-832a-dc218e426d0a.sql
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;

-- ────────────────────────────────────────────────────────────
-- 20260714140608_34e5d613-9a3e-4154-9a76-e9e33e319914.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view units"
  ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users can insert units"
  ON public.units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Signed-in users can update units"
  ON public.units FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Signed-in users can delete units"
  ON public.units FOR DELETE TO authenticated USING (true);

CREATE TRIGGER units_set_updated_at
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.units (code, name) VALUES
  ('kg', 'Kilogram'),
  ('g', 'Gram'),
  ('L', 'Litre'),
  ('ml', 'Millilitre'),
  ('pc', 'Piece'),
  ('dozen', 'Dozen'),
  ('pack', 'Pack')
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 20260714141224_f39aef93-d1a0-4f19-aa4e-8bffa3621507.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read expense categories" ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage expense categories" ON public.expense_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.expense_categories (name) VALUES
  ('Rent'),('Salary'),('Utilities'),('Transportation'),('Supplies'),('Marketing'),('Maintenance'),('Other')
ON CONFLICT (name) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 20260714144640_f3f9578e-ffdb-40eb-a32e-ef7eb9bccb29.sql
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.customer_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_group_id ON public.customers(group_id);

-- ────────────────────────────────────────────────────────────
-- 20260714150347_3f78a047-215d-4803-b71f-28cbea4e4630.sql
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.selling_price_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.selling_price_groups TO authenticated;
GRANT ALL ON public.selling_price_groups TO service_role;
ALTER TABLE public.selling_price_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spg read" ON public.selling_price_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "spg write" ON public.selling_price_groups FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'crm.manage') OR public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_permission(auth.uid(), 'crm.manage') OR public.is_superadmin(auth.uid()) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_spg_updated BEFORE UPDATE ON public.selling_price_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_groups
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'percentage' CHECK (mode IN ('percentage','price_group')),
  ADD COLUMN IF NOT EXISTS selling_price_group_id UUID REFERENCES public.selling_price_groups(id) ON DELETE SET NULL;

-- allow negative discount_pct (markup) — drop old positive-only check if present
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.customer_groups'::regclass AND contype='c'
  LOOP
    IF pg_get_constraintdef(c.conname::regclass::oid) ILIKE '%discount_pct%' THEN
      EXECUTE 'ALTER TABLE public.customer_groups DROP CONSTRAINT ' || quote_ident(c.conname);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.customer_groups
  ADD CONSTRAINT customer_groups_discount_pct_range CHECK (discount_pct >= -100 AND discount_pct <= 100);
