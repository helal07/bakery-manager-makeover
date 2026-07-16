-- ============================================================
-- Part 9: POS v7 — held sales, cash registers, multi-tender payments
-- Safe to re-run.
-- ============================================================

-- 1) HELD (suspended) SALES ---------------------------------
CREATE TABLE IF NOT EXISTS public.held_sales (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  showroom_id  UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  customer_id  UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  label        TEXT,
  snapshot     JSONB NOT NULL,
  total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  item_count   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.held_sales TO authenticated;
GRANT ALL ON public.held_sales TO service_role;
ALTER TABLE public.held_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS held_sales_select ON public.held_sales;
CREATE POLICY held_sales_select ON public.held_sales FOR SELECT TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR cashier_id = auth.uid()
  OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
);

DROP POLICY IF EXISTS held_sales_write ON public.held_sales;
CREATE POLICY held_sales_write ON public.held_sales FOR ALL TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR cashier_id = auth.uid()
  OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR cashier_id = auth.uid()
  OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
);

CREATE INDEX IF NOT EXISTS held_sales_cashier_idx ON public.held_sales(cashier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS held_sales_showroom_idx ON public.held_sales(showroom_id, created_at DESC);


-- 2) CASH REGISTER SESSIONS ---------------------------------
CREATE TABLE IF NOT EXISTS public.cash_registers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  showroom_id    UUID REFERENCES public.showrooms(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_float  NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_cash   NUMERIC(12,2),
  expected_cash  NUMERIC(12,2),
  difference     NUMERIC(12,2),
  note_open      TEXT,
  note_close     TEXT,
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated;
GRANT ALL ON public.cash_registers TO service_role;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_registers_rw ON public.cash_registers;
CREATE POLICY cash_registers_rw ON public.cash_registers FOR ALL TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR cashier_id = auth.uid()
  OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.has_role(auth.uid(),'owner'::app_role)
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR cashier_id = auth.uid()
  OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
);

-- Only one OPEN register per (cashier, showroom).
CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_one_open_per_cashier
  ON public.cash_registers (cashier_id, COALESCE(showroom_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'open';


-- 3) MULTI-TENDER PAYMENT ROWS ------------------------------
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('cash','card','mobile','bank','cheque','other')),
  amount     NUMERIC(12,2) NOT NULL,
  reference  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_payments_select_via_sale ON public.sale_payments;
CREATE POLICY sale_payments_select_via_sale ON public.sale_payments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));

DROP POLICY IF EXISTS sale_payments_write_via_sale ON public.sale_payments;
CREATE POLICY sale_payments_write_via_sale ON public.sale_payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id));

CREATE INDEX IF NOT EXISTS sale_payments_sale_idx ON public.sale_payments(sale_id);


-- 4) LINK SALES TO REGISTER SESSION -------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS register_id UUID REFERENCES public.cash_registers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_register_idx ON public.sales(register_id);


-- 5) LINE-LEVEL DISCOUNT & TAX ------------------------------
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_pct         NUMERIC(6,3)  NOT NULL DEFAULT 0;
