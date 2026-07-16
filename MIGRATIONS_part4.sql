-- PART 4 — Production Suite
-- Run AFTER Part1, Part2, and Part3 have finished.
-- Adds: recipe_categories, work_orders, wastage_log, qc_checks
--       + 'wastage' value on raw_stock_move_kind enum
--       + products.recipe_category_id FK

-- ────────────────────────────────────────────────────────────
-- 1) Extend raw_stock_move_kind enum with 'wastage'
-- ────────────────────────────────────────────────────────────
ALTER TYPE public.raw_stock_move_kind ADD VALUE IF NOT EXISTS 'wastage';

-- ────────────────────────────────────────────────────────────
-- 2) recipe_categories
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipe_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_categories TO authenticated;
GRANT ALL ON public.recipe_categories TO service_role;
ALTER TABLE public.recipe_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_categories read"
  ON public.recipe_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "recipe_categories write"
  ON public.recipe_categories FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS recipe_category_id UUID
  REFERENCES public.recipe_categories(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- 3) work_orders
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  batch_qty NUMERIC(14,3) NOT NULL,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','done','cancelled')),
  planned_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE INDEX IF NOT EXISTS work_orders_scope_idx
  ON public.work_orders (showroom_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders TO authenticated;
GRANT ALL ON public.work_orders TO service_role;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_orders read" ON public.work_orders FOR SELECT TO authenticated
  USING (
    showroom_id IS NULL
    OR public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(),'owner'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.user_has_showroom_access(auth.uid(), showroom_id)
  );

CREATE POLICY "work_orders write" ON public.work_orders FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ────────────────────────────────────────────────────────────
-- 4) wastage_log
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wastage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  qty NUMERIC(14,3) NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  ref_ledger_id UUID,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wastage_log TO authenticated;
GRANT ALL ON public.wastage_log TO service_role;
ALTER TABLE public.wastage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wastage_log read" ON public.wastage_log FOR SELECT TO authenticated
  USING (
    showroom_id IS NULL
    OR public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(),'owner'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.user_has_showroom_access(auth.uid(), showroom_id)
  );

CREATE POLICY "wastage_log write" ON public.wastage_log FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ────────────────────────────────────────────────────────────
-- 5) qc_checks
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qc_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.stock_ledger(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  showroom_id UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','fail')),
  notes TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_by UUID
);
CREATE INDEX IF NOT EXISTS qc_checks_batch_idx ON public.qc_checks (batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qc_checks TO authenticated;
GRANT ALL ON public.qc_checks TO service_role;
ALTER TABLE public.qc_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qc_checks read" ON public.qc_checks FOR SELECT TO authenticated
  USING (
    showroom_id IS NULL
    OR public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(),'owner'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.user_has_showroom_access(auth.uid(), showroom_id)
  );

CREATE POLICY "qc_checks write" ON public.qc_checks FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
