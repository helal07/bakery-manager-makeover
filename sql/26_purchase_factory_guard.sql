-- ============================================================================
-- 26_purchase_factory_guard.sql
-- Raw materials belong to the FACTORY only.
--   * A purchase line that references a raw material may only exist on a
--     purchase whose showroom_id IS NULL (factory).
--   * Raw stock rows/ledger rows must stay factory-scoped.
-- The UI already warns, this makes it impossible to bypass.
-- Idempotent — safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assert_raw_purchase_is_factory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _showroom uuid;
BEGIN
  IF NEW.material_id IS NULL THEN RETURN NEW; END IF;
  SELECT showroom_id INTO _showroom FROM public.purchases WHERE id = NEW.purchase_id;
  IF _showroom IS NOT NULL THEN
    RAISE EXCEPTION 'Only the factory can purchase raw materials';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_purchase_items_factory_only ON public.purchase_items;
CREATE TRIGGER trg_purchase_items_factory_only
  BEFORE INSERT OR UPDATE ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.assert_raw_purchase_is_factory();

DROP TRIGGER IF EXISTS trg_purchase_return_items_factory_only ON public.purchase_return_items;

CREATE OR REPLACE FUNCTION public.assert_raw_return_is_factory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _showroom uuid;
BEGIN
  IF NEW.material_id IS NULL THEN RETURN NEW; END IF;
  SELECT showroom_id INTO _showroom FROM public.purchase_returns WHERE id = NEW.return_id;
  IF _showroom IS NOT NULL THEN
    RAISE EXCEPTION 'Only the factory can return raw materials';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_purchase_return_items_factory_only
  BEFORE INSERT OR UPDATE ON public.purchase_return_items
  FOR EACH ROW EXECUTE FUNCTION public.assert_raw_return_is_factory();

REVOKE ALL ON FUNCTION public.assert_raw_purchase_is_factory() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_raw_return_is_factory() FROM anon, authenticated;
