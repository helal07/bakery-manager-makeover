-- ==============================================================
-- Muzahid Food — MASTER UPDATE SQL (idempotent, safe on prod)
-- Consolidates sql/02..16 + adds customer_groups.pricing_mode fix
-- Run in Supabase Studio SQL Editor as the postgres role.
-- Existing data is preserved. Everything is ADD IF NOT EXISTS / guarded.
-- ==============================================================

BEGIN;
SET search_path TO public;

-- --------------------------------------------------------------
-- 0) Fix: customer_groups.pricing_mode (renamed from 'mode')
-- --------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='customer_groups' AND column_name='mode')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='customer_groups' AND column_name='pricing_mode') THEN
    ALTER TABLE public.customer_groups RENAME COLUMN mode TO pricing_mode;
  END IF;
END $$;
ALTER TABLE public.customer_groups ADD COLUMN IF NOT EXISTS pricing_mode text DEFAULT 'percentage' NOT NULL;
ALTER TABLE public.customer_groups ADD COLUMN IF NOT EXISTS selling_price_group_id uuid;
ALTER TABLE public.customer_groups ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.customer_groups ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false NOT NULL;
ALTER TABLE public.customer_groups ADD COLUMN IF NOT EXISTS discount_pct numeric DEFAULT 0 NOT NULL;


-- ==============================================================
-- Source: sql/02_align_code_schema.sql
-- ==============================================================
-- =============================================================
-- Muzahid Food — Align Existing Database With Current Codebase
-- =============================================================
-- Run this on an EXISTING self-hosted database if you did not get a
-- fully fresh schema from sql/00_baseline.sql or still see errors like:
--   column units.code does not exist
--   column raw_materials.min_stock does not exist
-- This patch keeps data and only adds/renames columns expected by code.
-- =============================================================


SET search_path TO public;

-- Units: old DB had short_name; current code expects code + is_active.
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS code text;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'short_name'
  ) THEN
    UPDATE public.units
    SET code = COALESCE(NULLIF(code, ''), NULLIF(short_name, ''), NULLIF(name, ''), id::text)
    WHERE code IS NULL OR code = '';
  ELSE
    UPDATE public.units
    SET code = COALESCE(NULLIF(code, ''), NULLIF(name, ''), id::text)
    WHERE code IS NULL OR code = '';
  END IF;
END $$;
ALTER TABLE public.units ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'units_code_key'
      AND conrelid = 'public.units'::regclass
  ) THEN
    ALTER TABLE public.units ADD CONSTRAINT units_code_key UNIQUE (code);
  END IF;
END $$;

-- Raw materials: old DB had threshold; current code expects min_stock.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'raw_materials' AND column_name = 'threshold'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'raw_materials' AND column_name = 'min_stock'
  ) THEN
    ALTER TABLE public.raw_materials RENAME COLUMN threshold TO min_stock;
  END IF;
END $$;
ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 0 NOT NULL;
ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- Customer group pricing logic.
ALTER TABLE public.customer_groups ADD COLUMN IF NOT EXISTS mode text DEFAULT 'percentage' NOT NULL;
ALTER TABLE public.customer_groups ADD COLUMN IF NOT EXISTS selling_price_group_id uuid;

-- Product selling price groups: old DB may have price_group_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_selling_prices' AND column_name = 'price_group_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_selling_prices' AND column_name = 'selling_price_group_id'
  ) THEN
    ALTER TABLE public.product_selling_prices RENAME COLUMN price_group_id TO selling_price_group_id;
  END IF;
END $$;
ALTER TABLE public.product_selling_prices ADD COLUMN IF NOT EXISTS selling_price_group_id uuid;
ALTER TABLE public.product_selling_prices DROP CONSTRAINT IF EXISTS product_selling_prices_product_id_price_group_id_key;
ALTER TABLE public.product_selling_prices DROP CONSTRAINT IF EXISTS product_selling_prices_product_id_selling_price_group_id_key;
ALTER TABLE public.product_selling_prices
  ADD CONSTRAINT product_selling_prices_product_id_selling_price_group_id_key
  UNIQUE (product_id, selling_price_group_id);

-- Category soft-delete flags expected by stores.
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.purchase_categories ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- Payment/return audit fields expected by UI.
ALTER TABLE public.customer_payments ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS invoice_ref text;
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS created_by uuid;

-- Transfers: current UI expects source/dest names and timestamps.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transfers' AND column_name = 'from_showroom_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transfers' AND column_name = 'source_showroom_id'
  ) THEN
    ALTER TABLE public.transfers RENAME COLUMN from_showroom_id TO source_showroom_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transfers' AND column_name = 'to_showroom_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transfers' AND column_name = 'dest_showroom_id'
  ) THEN
    ALTER TABLE public.transfers RENAME COLUMN to_showroom_id TO dest_showroom_id;
  END IF;
END $$;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS source_showroom_id uuid;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS dest_showroom_id uuid;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS received_at timestamp with time zone;
ALTER TABLE public.transfers ALTER COLUMN status SET DEFAULT 'draft';

-- User profile software settings.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS software jsonb DEFAULT '{}'::jsonb NOT NULL;

NOTIFY pgrst, 'reload schema';


-- ==============================================================
-- Source: sql/04_landing_carousels.sql
-- ==============================================================
-- Landing page: carousels + featured products flag
set search_path = public;

-- 1) Carousel slides table
create table if not exists public.landing_carousels (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  subtitle text,
  image_url text not null,
  link_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.landing_carousels to anon;
grant select, insert, update, delete on public.landing_carousels to authenticated;
grant all on public.landing_carousels to service_role;

alter table public.landing_carousels enable row level security;

drop policy if exists "public read active carousels" on public.landing_carousels;
create policy "public read active carousels"
  on public.landing_carousels for select
  to anon
  using (is_active = true);

drop policy if exists "auth read carousels" on public.landing_carousels;
create policy "auth read carousels"
  on public.landing_carousels for select
  to authenticated
  using (true);

drop policy if exists "auth manage carousels" on public.landing_carousels;
create policy "auth manage carousels"
  on public.landing_carousels for all
  to authenticated
  using (true) with check (true);

drop trigger if exists trg_landing_carousels_updated_at on public.landing_carousels;
create trigger trg_landing_carousels_updated_at
  before update on public.landing_carousels
  for each row execute function public.update_updated_at_column();

-- 2) Products: publish on landing flag
alter table public.products add column if not exists show_on_landing boolean not null default false;

-- Allow anonymous (public) reads of active products marked show_on_landing.
grant select on public.products to anon;
drop policy if exists "public read landing products" on public.products;
create policy "public read landing products"
  on public.products for select
  to anon
  using (is_active = true and show_on_landing = true);

-- 3) Public storage bucket for carousel/landing images
insert into storage.buckets (id, name, public)
values ('landing-images', 'landing-images', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'landing-images read' and tablename = 'objects' and schemaname = 'storage') then
    create policy "landing-images read" on storage.objects for select
      to anon, authenticated using (bucket_id = 'landing-images');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'landing-images insert' and tablename = 'objects' and schemaname = 'storage') then
    create policy "landing-images insert" on storage.objects for insert
      to authenticated with check (bucket_id = 'landing-images');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'landing-images update' and tablename = 'objects' and schemaname = 'storage') then
    create policy "landing-images update" on storage.objects for update
      to authenticated using (bucket_id = 'landing-images') with check (bucket_id = 'landing-images');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'landing-images delete' and tablename = 'objects' and schemaname = 'storage') then
    create policy "landing-images delete" on storage.objects for delete
      to authenticated using (bucket_id = 'landing-images');
  end if;
end $$;

notify pgrst, 'reload schema';

-- ==============================================================
-- Source: sql/05_factory_only_production.sql
-- ==============================================================
-- ============================================================================
-- 05_factory_only_production.sql
-- Enforce factory-only model at the database level:
--   * Raw materials, raw stock, recipes, production batches, work orders,
--     wastage, QC — সব কিছুই factory-scoped (showroom_id IS NULL)।
--   * Showroom-এ শুধু finished product stock থাকবে।
-- Idempotent — safe to re-run। Self-hosted Supabase SQL Editor-এ manually চালান।
-- ============================================================================

-- 1. Existing rows normalize: production-related tables থেকে showroom_id NULL করে দাও
UPDATE public.raw_material_stock  SET showroom_id = NULL WHERE showroom_id IS NOT NULL;
UPDATE public.raw_stock_ledger    SET showroom_id = NULL WHERE showroom_id IS NOT NULL;
UPDATE public.wastage_log         SET showroom_id = NULL WHERE showroom_id IS NOT NULL;
UPDATE public.qc_checks           SET showroom_id = NULL WHERE showroom_id IS NOT NULL;
UPDATE public.work_orders         SET showroom_id = NULL WHERE showroom_id IS NOT NULL;
-- production batches finished goods factory-outlet-এ থাকতে পারে, তাই stock_ledger touch করছি না।

-- 2. CHECK constraints — নতুন row insert-এ showroom_id NULL enforce করা
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_material_stock_factory_only') THEN
    ALTER TABLE public.raw_material_stock
      ADD CONSTRAINT raw_material_stock_factory_only CHECK (showroom_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raw_stock_ledger_factory_only') THEN
    ALTER TABLE public.raw_stock_ledger
      ADD CONSTRAINT raw_stock_ledger_factory_only CHECK (showroom_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wastage_log_factory_only') THEN
    ALTER TABLE public.wastage_log
      ADD CONSTRAINT wastage_log_factory_only CHECK (showroom_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qc_checks_factory_only') THEN
    ALTER TABLE public.qc_checks
      ADD CONSTRAINT qc_checks_factory_only CHECK (showroom_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_factory_only') THEN
    ALTER TABLE public.work_orders
      ADD CONSTRAINT work_orders_factory_only CHECK (showroom_id IS NULL);
  END IF;
END $$;

-- 3. Permissions catalog — production-related keys নিশ্চিত করা (RBAC gate)
INSERT INTO public.permissions (permission_key, label, module) VALUES
  ('production.view',        'View production module',      'Production'),
  ('production.batches',     'Run production batches',      'Production'),
  ('production.recipes',     'Manage recipes / BOM',        'Production'),
  ('production.work_orders', 'Manage work orders',          'Production'),
  ('production.qc',          'Perform QC checks',           'Production'),
  ('production.wastage',     'Log wastage',                 'Production'),
  ('production.reports',     'View production reports',     'Production'),
  ('raw_materials.manage',   'Manage raw materials',        'Production'),
  ('raw_stock.manage',       'Manage raw material stock',   'Production')
ON CONFLICT (permission_key) DO NOTHING;

-- ==============================================================
-- Source: sql/06_reverse_logistics.sql
-- ==============================================================
-- ============================================================================
-- 06_reverse_logistics.sql
-- Damaged returns, showroom → factory damaged transfers, repurpose to raw
-- material, and factory-outlet flag. Idempotent — safe to re-run.
-- Manual import on self-hosted Supabase SQL Editor.
-- ============================================================================

-- 1. sale_return_items: per-line condition
ALTER TABLE public.sale_return_items
  ADD COLUMN IF NOT EXISTS condition text DEFAULT 'resellable';

-- 2. transfers: kind (normal vs damaged_return)
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'normal';

-- 3. showrooms: factory-outlet flag (optional retail-POS location)
ALTER TABLE public.showrooms
  ADD COLUMN IF NOT EXISTS is_factory boolean DEFAULT false;

-- 4. damaged_stock — showroom-scoped bucket for unsellable finished goods
CREATE TABLE IF NOT EXISTS public.damaged_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  showroom_id uuid REFERENCES public.showrooms(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS damaged_stock_product_showroom_uniq
  ON public.damaged_stock (product_id, COALESCE(showroom_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.damaged_stock TO authenticated;
GRANT ALL ON public.damaged_stock TO service_role;
ALTER TABLE public.damaged_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "damaged_stock all authed" ON public.damaged_stock;
CREATE POLICY "damaged_stock all authed" ON public.damaged_stock
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. damaged_ledger — movement history
CREATE TABLE IF NOT EXISTS public.damaged_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  showroom_id uuid REFERENCES public.showrooms(id) ON DELETE SET NULL,
  qty numeric NOT NULL,
  kind text NOT NULL, -- 'return_in','transfer_out','transfer_in','repurpose_out','discard'
  ref_type text,
  ref_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.damaged_ledger TO authenticated;
GRANT ALL ON public.damaged_ledger TO service_role;
ALTER TABLE public.damaged_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "damaged_ledger all authed" ON public.damaged_ledger;
CREATE POLICY "damaged_ledger all authed" ON public.damaged_ledger
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. repurpose_queue — factory workshop pending items
CREATE TABLE IF NOT EXISTS public.repurpose_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty numeric NOT NULL,
  source_showroom_id uuid REFERENCES public.showrooms(id) ON DELETE SET NULL,
  transfer_id uuid REFERENCES public.transfers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | converted | discarded
  converted_material_id uuid REFERENCES public.raw_materials(id),
  yield_qty numeric,
  wastage_qty numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repurpose_queue TO authenticated;
GRANT ALL ON public.repurpose_queue TO service_role;
ALTER TABLE public.repurpose_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repurpose_queue all authed" ON public.repurpose_queue;
CREATE POLICY "repurpose_queue all authed" ON public.repurpose_queue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. RPC: commit_damaged_movement — mirror of commit_stock_movement
CREATE OR REPLACE FUNCTION public.commit_damaged_movement(
  _product_id uuid,
  _showroom_id uuid,
  _qty numeric,
  _kind text,
  _ref_type text DEFAULT NULL,
  _ref_id uuid DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _ledger_id uuid;
BEGIN
  INSERT INTO public.damaged_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_product_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;

  UPDATE public.damaged_stock
     SET quantity = quantity + _qty, updated_at = now()
   WHERE product_id = _product_id
     AND showroom_id IS NOT DISTINCT FROM _showroom_id;
  IF NOT FOUND THEN
    INSERT INTO public.damaged_stock (product_id, showroom_id, quantity)
    VALUES (_product_id, _showroom_id, _qty);
  END IF;

  RETURN _ledger_id;
END; $$;

-- 8. RPC: commit_damaged_transfer_approve
-- Called when a damaged_return transfer is received at factory.
-- Moves damaged_stock from source showroom → factory, and creates repurpose_queue rows.
CREATE OR REPLACE FUNCTION public.commit_damaged_transfer_approve(_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _t record;
  _it record;
BEGIN
  SELECT * INTO _t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer % not found', _transfer_id; END IF;
  IF _t.kind IS DISTINCT FROM 'damaged_return' THEN
    RAISE EXCEPTION 'Transfer % is not a damaged return', _transfer_id;
  END IF;

  FOR _it IN
    SELECT product_id, qty FROM public.transfer_items WHERE transfer_id = _transfer_id
  LOOP
    -- Deduct from source showroom damaged bucket
    PERFORM public.commit_damaged_movement(
      _it.product_id, _t.source_showroom_id, -abs(_it.qty),
      'transfer_out', 'transfer', _transfer_id, 'Damaged return to factory'
    );
    -- Queue at factory for repurpose decision
    INSERT INTO public.repurpose_queue (product_id, qty, source_showroom_id, transfer_id, status)
    VALUES (_it.product_id, _it.qty, _t.source_showroom_id, _transfer_id, 'pending');
  END LOOP;

  UPDATE public.transfers
     SET status = 'received', received_at = now()
   WHERE id = _transfer_id;
END; $$;

-- 9. RPC: commit_repurpose — convert queued damaged product → raw material or discard
CREATE OR REPLACE FUNCTION public.commit_repurpose(
  _queue_id uuid,
  _material_id uuid,       -- NULL = discard fully
  _yield_qty numeric,      -- ignored when material_id is NULL
  _wastage_qty numeric,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _q record;
BEGIN
  SELECT * INTO _q FROM public.repurpose_queue WHERE id = _queue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue item % not found', _queue_id; END IF;
  IF _q.status <> 'pending' THEN RAISE EXCEPTION 'Queue item already processed'; END IF;

  IF _material_id IS NOT NULL THEN
    IF _yield_qty IS NULL OR _yield_qty <= 0 THEN
      RAISE EXCEPTION 'Yield quantity must be greater than zero';
    END IF;
    -- Add yield to factory raw material stock (showroom_id = NULL = factory)
    PERFORM public.commit_raw_stock_movement(
      _material_id, NULL, _yield_qty, 'repurpose_in',
      'repurpose', _queue_id, COALESCE(_note, 'Repurposed from damaged product')
    );
  END IF;

  -- Log wastage if any
  IF _wastage_qty IS NOT NULL AND _wastage_qty > 0 THEN
    INSERT INTO public.wastage_log (material_id, showroom_id, qty, reason, notes)
    VALUES (
      COALESCE(_material_id, (SELECT id FROM public.raw_materials LIMIT 1)),
      NULL, _wastage_qty,
      CASE WHEN _material_id IS NULL THEN 'repurpose_discard' ELSE 'repurpose_wastage' END,
      _note
    );
  END IF;

  -- Remove queued qty from factory damaged bucket (audit trail)
  INSERT INTO public.damaged_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_q.product_id, NULL, -abs(_q.qty),
          CASE WHEN _material_id IS NULL THEN 'discard' ELSE 'repurpose_out' END,
          'repurpose', _queue_id, _note);

  UPDATE public.repurpose_queue
     SET status = CASE WHEN _material_id IS NULL THEN 'discarded' ELSE 'converted' END,
         converted_material_id = _material_id,
         yield_qty = _yield_qty,
         wastage_qty = _wastage_qty,
         note = COALESCE(_note, note),
         processed_at = now()
   WHERE id = _queue_id;
END; $$;

-- 10. Permissions catalog additions
INSERT INTO public.permissions (permission_key, label, module)
VALUES
  ('sales.return.damaged',        'Mark returned items as damaged',   'Sales'),
  ('transfers.damaged.create',    'Create damaged-return transfer',   'Transfers'),
  ('production.repurpose',        'Repurpose damaged products',       'Production'),
  ('production.repurpose.report', 'View repurpose history',           'Production')
ON CONFLICT (permission_key) DO NOTHING;

-- ==============================================================
-- Source: sql/07_sales_shipping.sql
-- ==============================================================
-- Add shipping charge column to sales
-- Safe to re-run.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS shipping numeric NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';

-- ==============================================================
-- Source: sql/08_employees_extended.sql
-- ==============================================================
-- Employees table: extended profile fields for full-page employee form.
-- Safe to run multiple times.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.app_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS joining_date date,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS emergency_phone text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

NOTIFY pgrst, 'reload schema';

-- ==============================================================
-- Source: sql/09_showroom_settings.sql
-- ==============================================================
-- 09_showroom_settings.sql
-- Per-showroom settings override (invoice customization, future prefs).
-- Safe to re-run.

-- 1) Add a jsonb settings column on showrooms if not present
ALTER TABLE public.showrooms
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.showrooms.settings IS
  'Per-showroom overrides. Shape: { "invoice": { ...partial InvoiceSettings } }. Keys omitted here fall back to company_settings.settings.invoice.';

-- 2) Helper: merge company invoice settings with a showroom override.
--    Usage in app / RPC:
--      select public.get_effective_invoice_settings(<showroom_id>);
CREATE OR REPLACE FUNCTION public.get_effective_invoice_settings(_showroom_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT settings->'invoice' FROM public.company_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1),
      '{}'::jsonb
    )
    ||
    COALESCE(
      (SELECT settings->'invoice' FROM public.showrooms WHERE id = _showroom_id),
      '{}'::jsonb
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_invoice_settings(uuid) TO authenticated, anon;

-- 3) No RLS change required: showrooms already has RLS; the new column
--    is read/written through the existing SELECT/UPDATE policies.
--    (Only users who can UPDATE a showroom row can change its overrides.)

-- ==============================================================
-- Source: sql/10_raw_materials_min_stock.sql
-- ==============================================================
-- Align raw_materials with production schema and app code.
-- Renames legacy "threshold" column to "min_stock" (idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_materials'
      AND column_name = 'threshold'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_materials'
      AND column_name = 'min_stock'
  ) THEN
    ALTER TABLE public.raw_materials RENAME COLUMN threshold TO min_stock;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_materials'
      AND column_name = 'min_stock'
  ) THEN
    ALTER TABLE public.raw_materials ADD COLUMN min_stock numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ==============================================================
-- Source: sql/11_transfers_align.sql
-- ==============================================================
-- =============================================================
-- Align transfers table with current codebase
-- Renames from_showroom_id → source_showroom_id, to_showroom_id → dest_showroom_id
-- Adds sent_at, received_at, kind columns; sets status default to 'draft'
-- Safe to run multiple times (idempotent).
-- =============================================================


SET search_path TO public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transfers' AND column_name='from_showroom_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transfers' AND column_name='source_showroom_id'
  ) THEN
    ALTER TABLE public.transfers RENAME COLUMN from_showroom_id TO source_showroom_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transfers' AND column_name='to_showroom_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transfers' AND column_name='dest_showroom_id'
  ) THEN
    ALTER TABLE public.transfers RENAME COLUMN to_showroom_id TO dest_showroom_id;
  END IF;
END $$;

ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS source_showroom_id uuid;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS dest_showroom_id uuid;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS received_at timestamp with time zone;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.transfers ALTER COLUMN status SET DEFAULT 'draft';

NOTIFY pgrst, 'reload schema';


-- ==============================================================
-- Source: sql/12_invoice_bundle_rpc.sql
-- ==============================================================
-- Fast invoice bundle: one round-trip for the whole invoice page.
-- Safe to re-run (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_invoice_bundle(_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale sales%ROWTYPE;
  _items jsonb;
  _pays jsonb;
  _showroom jsonb;
  _customer_address text;
  _prev_due numeric := 0;
  _outstanding numeric := 0;
  _paid_standalone numeric := 0;
  _phone text;
BEGIN
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id;
  IF NOT FOUND THEN
    SELECT * INTO _sale FROM public.sales WHERE external_ref = _sale_id::text LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO _items FROM (
    SELECT si.*, p.name AS _p_name, p.sku AS _p_sku
    FROM public.sale_items si
    LEFT JOIN public.products p ON p.id = si.product_id
    WHERE si.sale_id = _sale.id
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(sp)), '[]'::jsonb) INTO _pays
  FROM (SELECT method, amount, reference FROM public.sale_payments
        WHERE sale_id = _sale.id ORDER BY created_at ASC) sp;

  IF _sale.showroom_id IS NOT NULL THEN
    SELECT to_jsonb(s) INTO _showroom FROM (
      SELECT id, name, code, address, city, phone, manager_name
      FROM public.showrooms WHERE id = _sale.showroom_id
    ) s;
  END IF;

  IF _sale.customer_id IS NOT NULL THEN
    SELECT address INTO _customer_address FROM public.customers WHERE id = _sale.customer_id;
  END IF;
  IF _customer_address IS NULL AND _sale.customer_phone IS NOT NULL THEN
    SELECT address INTO _customer_address FROM public.customers WHERE phone = _sale.customer_phone LIMIT 1;
  END IF;

  _phone := regexp_replace(COALESCE(_sale.customer_phone, ''), '\D', '', 'g');

  IF _sale.customer_id IS NOT NULL OR _phone <> '' THEN
    SELECT COALESCE(SUM(due), 0) INTO _outstanding FROM public.sales
    WHERE id <> _sale.id
      AND created_at < _sale.created_at
      AND (
        (_sale.customer_id IS NOT NULL AND customer_id = _sale.customer_id)
        OR (_phone <> '' AND regexp_replace(COALESCE(customer_phone,''), '\D', '', 'g') = _phone)
      );

    SELECT COALESCE(SUM(amount), 0) INTO _paid_standalone FROM public.customer_payments
    WHERE sale_id IS NULL
      AND created_at < _sale.created_at
      AND (
        (_sale.customer_id IS NOT NULL AND customer_id = _sale.customer_id)
        OR (_phone <> '' AND regexp_replace(COALESCE(customer_phone,''), '\D', '', 'g') = _phone)
      );

    _prev_due := GREATEST(0, _outstanding - _paid_standalone);
  END IF;

  RETURN jsonb_build_object(
    'sale', to_jsonb(_sale),
    'items', _items,
    'payments', _pays,
    'showroom', _showroom,
    'customer_address', _customer_address,
    'previous_due', _prev_due
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_bundle(uuid) TO anon, authenticated, service_role;

-- ==============================================================
-- Source: sql/13_image_storage_buckets.sql
-- ==============================================================
-- 13_image_storage_buckets.sql
-- Create the private storage buckets used for customer avatars, product images
-- and company logos, and open read/write access to signed-in users.
--
-- Safe to re-run.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('customer-avatars', 'customer-avatars', false),
  ('product-images',   'product-images',   false),
  ('company-logos',    'company-logos',    false)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['customer-avatars','product-images','company-logos'] LOOP
    EXECUTE format($p$
      DROP POLICY IF EXISTS "auth read %1$s" ON storage.objects;
      CREATE POLICY "auth read %1$s" ON storage.objects FOR SELECT
        TO authenticated USING (bucket_id = %1$L);
      DROP POLICY IF EXISTS "auth insert %1$s" ON storage.objects;
      CREATE POLICY "auth insert %1$s" ON storage.objects FOR INSERT
        TO authenticated WITH CHECK (bucket_id = %1$L);
      DROP POLICY IF EXISTS "auth update %1$s" ON storage.objects;
      CREATE POLICY "auth update %1$s" ON storage.objects FOR UPDATE
        TO authenticated USING (bucket_id = %1$L) WITH CHECK (bucket_id = %1$L);
      DROP POLICY IF EXISTS "auth delete %1$s" ON storage.objects;
      CREATE POLICY "auth delete %1$s" ON storage.objects FOR DELETE
        TO authenticated USING (bucket_id = %1$L);
    $p$, b);
  END LOOP;
END $$;

-- ==============================================================
-- Source: sql/14_production_overheads.sql
-- ==============================================================
-- ============================================================================
-- Part 14 — Production Overheads (Gas, Electricity, Labor, Packaging, etc.)
-- ============================================================================
-- Self-hosted Supabase Studio → SQL Editor → paste → Run
-- ============================================================================


-- 1) Overhead categories (production-specific, separate from expense_categories)
CREATE TABLE IF NOT EXISTS public.production_overhead_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_overhead_categories TO authenticated;
GRANT ALL ON public.production_overhead_categories TO service_role;

ALTER TABLE public.production_overhead_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "overhead_categories_all" ON public.production_overhead_categories;
CREATE POLICY "overhead_categories_all"
  ON public.production_overhead_categories
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2) Recipe-level default overheads (per_unit or per_batch)
CREATE TABLE IF NOT EXISTS public.recipe_overheads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id  uuid NOT NULL REFERENCES public.production_overhead_categories(id) ON DELETE RESTRICT,
  amount       numeric(14,4) NOT NULL DEFAULT 0,
  mode         text NOT NULL DEFAULT 'per_unit' CHECK (mode IN ('per_unit','per_batch')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_overheads TO authenticated;
GRANT ALL ON public.recipe_overheads TO service_role;

ALTER TABLE public.recipe_overheads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipe_overheads_all" ON public.recipe_overheads;
CREATE POLICY "recipe_overheads_all"
  ON public.recipe_overheads
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS recipe_overheads_product_idx
  ON public.recipe_overheads (product_id);

-- 3) Batch overhead entries (actual overheads logged per production batch)
CREATE TABLE IF NOT EXISTS public.production_overheads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL,
  product_id   uuid REFERENCES public.products(id) ON DELETE SET NULL,
  category_id  uuid NOT NULL REFERENCES public.production_overhead_categories(id) ON DELETE RESTRICT,
  amount       numeric(14,4) NOT NULL DEFAULT 0,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_overheads TO authenticated;
GRANT ALL ON public.production_overheads TO service_role;

ALTER TABLE public.production_overheads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "production_overheads_all" ON public.production_overheads;
CREATE POLICY "production_overheads_all"
  ON public.production_overheads
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS production_overheads_batch_idx
  ON public.production_overheads (batch_id);
CREATE INDEX IF NOT EXISTS production_overheads_created_idx
  ON public.production_overheads (created_at DESC);

-- 4) updated_at triggers
DROP TRIGGER IF EXISTS trg_overhead_cat_updated ON public.production_overhead_categories;
CREATE TRIGGER trg_overhead_cat_updated
  BEFORE UPDATE ON public.production_overhead_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_recipe_overheads_updated ON public.recipe_overheads;
CREATE TRIGGER trg_recipe_overheads_updated
  BEFORE UPDATE ON public.recipe_overheads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Extend commit_production_batch RPC to accept overheads
CREATE OR REPLACE FUNCTION public.commit_production_batch(
  _product_id  uuid,
  _showroom_id uuid,
  _batch       numeric,
  _ingredients jsonb,
  _overheads   jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _batch_id uuid;
  _ingredient jsonb;
  _overhead jsonb;
  _material_id uuid;
  _qty_per_unit numeric;
  _required_qty numeric;
  _available_qty numeric;
  _shelf_life_days integer;
  _mfg_date date := current_date;
BEGIN
  IF _product_id IS NULL THEN RAISE EXCEPTION 'Product is required'; END IF;
  IF _batch IS NULL OR _batch <= 0 THEN RAISE EXCEPTION 'Batch quantity must be greater than zero'; END IF;
  IF _ingredients IS NULL OR jsonb_typeof(_ingredients) <> 'array' OR jsonb_array_length(_ingredients) = 0 THEN
    RAISE EXCEPTION 'At least one ingredient is required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_ingredients) AS item
    WHERE NULLIF(item->>'materialId','') IS NULL OR COALESCE((item->>'qty')::numeric,0) <= 0
  ) THEN
    RAISE EXCEPTION 'Each ingredient needs a material and quantity greater than zero';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_ingredients) AS item
    GROUP BY item->>'materialId' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate ingredients are not allowed in one recipe';
  END IF;

  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients) LOOP
    _material_id := (_ingredient->>'materialId')::uuid;
    _qty_per_unit := (_ingredient->>'qty')::numeric;
    _required_qty := abs(_qty_per_unit * _batch);
    SELECT quantity INTO _available_qty
      FROM public.raw_material_stock
     WHERE material_id = _material_id AND showroom_id IS NOT DISTINCT FROM _showroom_id
     FOR UPDATE;
    IF COALESCE(_available_qty,0) < _required_qty THEN
      RAISE EXCEPTION 'Insufficient raw materials for this batch';
    END IF;
  END LOOP;

  _batch_id := gen_random_uuid();

  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients) LOOP
    _material_id := (_ingredient->>'materialId')::uuid;
    _qty_per_unit := (_ingredient->>'qty')::numeric;
    _required_qty := abs(_qty_per_unit * _batch);
    PERFORM public.commit_raw_stock_movement(
      _material_id, _showroom_id, -_required_qty,
      'production_consume', 'production', _batch_id, NULL
    );
  END LOOP;

  PERFORM public.commit_stock_movement(
    _product_id, _showroom_id, _batch, 'production', 'production', _batch_id, NULL
  );

  IF _overheads IS NOT NULL AND jsonb_typeof(_overheads) = 'array' THEN
    FOR _overhead IN SELECT * FROM jsonb_array_elements(_overheads) LOOP
      IF NULLIF(_overhead->>'categoryId','') IS NOT NULL
         AND COALESCE((_overhead->>'amount')::numeric,0) > 0 THEN
        INSERT INTO public.production_overheads (batch_id, product_id, category_id, amount, note)
        VALUES (
          _batch_id, _product_id,
          (_overhead->>'categoryId')::uuid,
          (_overhead->>'amount')::numeric,
          NULLIF(_overhead->>'note','')
        );
      END IF;
    END LOOP;
  END IF;

  SELECT shelf_life_days INTO _shelf_life_days FROM public.products WHERE id = _product_id;
  UPDATE public.products
     SET mfg_date = _mfg_date,
         expiry_date = CASE WHEN COALESCE(_shelf_life_days,0) > 0
                            THEN _mfg_date + _shelf_life_days ELSE expiry_date END,
         updated_at = now()
   WHERE id = _product_id;

  RETURN _batch_id;
END;
$function$;

-- 6) Seed default categories
INSERT INTO public.production_overhead_categories (name) VALUES
  ('Gas'), ('Electricity'), ('Labor'), ('Packaging'), ('Maintenance')
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- Done. Refresh PostgREST schema cache:
--   NOTIFY pgrst, 'reload schema';
-- অথবা Supabase Studio → Settings → API → Reload schema
-- ============================================================================

-- ==============================================================
-- Source: sql/15_employee_login_link.sql
-- ==============================================================
-- Employee ↔ auth.users link + first-run signup lock helpers.
-- Idempotent; safe to run multiple times on self-hosted Supabase.

-- 1. employees.user_id ---------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_uniq
  ON public.employees(user_id)
  WHERE user_id IS NOT NULL;

-- 2. has_any_user() RPC (callable by anon so /auth can decide) ------------
CREATE OR REPLACE FUNCTION public.has_any_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users);
$$;

GRANT EXECUTE ON FUNCTION public.has_any_user() TO anon, authenticated;

-- 3. Reload PostgREST schema ---------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ==============================================================
-- Source: sql/16_landing_public_access.sql
-- ==============================================================
-- Ensure the public landing page can read CMS content anonymously.
-- Idempotent: safe to re-apply on self-hosted Supabase.
set search_path = public;

-- landing_content: anon read of the current row
grant select on public.landing_content to anon;
drop policy if exists "public read landing content" on public.landing_content;
create policy "public read landing content"
  on public.landing_content for select
  to anon
  using (is_current = true);

-- landing_carousels: anon read of active slides
grant select on public.landing_carousels to anon;
drop policy if exists "public read active carousels" on public.landing_carousels;
create policy "public read active carousels"
  on public.landing_carousels for select
  to anon
  using (is_active = true);

-- products: anon read of items flagged for landing
grant select on public.products to anon;
drop policy if exists "public read landing products" on public.products;
create policy "public read landing products"
  on public.products for select
  to anon
  using (is_active = true and show_on_landing = true);

NOTIFY pgrst, 'reload schema';
COMMIT;

-- =====================================================================
-- Patch 17 (2026-07): allow anonymous reads of public branding fields
-- so the PWA manifest endpoint can render the company logo & name
-- even when called without a signed-in user (public /manifest URL).
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.company_settings'::regclass
      AND polname = 'company_settings_public_branding'
  ) THEN
    CREATE POLICY company_settings_public_branding
      ON public.company_settings
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

GRANT SELECT ON public.company_settings TO anon;
