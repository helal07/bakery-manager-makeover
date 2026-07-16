-- ============================================================
-- Part 5: Selling Price Groups — per-product fixed prices
-- Run after Parts 1–4 in Supabase Studio → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.product_selling_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  selling_price_group_id UUID NOT NULL REFERENCES public.selling_price_groups(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, selling_price_group_id)
);

CREATE INDEX IF NOT EXISTS idx_psp_group ON public.product_selling_prices(selling_price_group_id);
CREATE INDEX IF NOT EXISTS idx_psp_product ON public.product_selling_prices(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_selling_prices TO authenticated;
GRANT ALL ON public.product_selling_prices TO service_role;

ALTER TABLE public.product_selling_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psp read" ON public.product_selling_prices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "psp write" ON public.product_selling_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin')
      OR public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin')
      OR public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_psp_updated ON public.product_selling_prices;
CREATE TRIGGER trg_psp_updated BEFORE UPDATE ON public.product_selling_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
