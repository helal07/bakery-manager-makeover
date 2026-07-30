-- ============================================================
-- Patch 20: Finished-product wastage + damaged-goods resale
-- Safe to re-run (idempotent).
-- ============================================================

-- 1) damaged_ledger: revenue tracking columns
ALTER TABLE public.damaged_ledger
  ADD COLUMN IF NOT EXISTS sale_amount numeric,
  ADD COLUMN IF NOT EXISTS customer_name text;

-- 2) Log finished-product wastage:
--    product_stock -qty  ->  damaged_stock +qty  ->  repurpose_queue (pending)
CREATE OR REPLACE FUNCTION public.log_finished_product_wastage(
  _product_id uuid,
  _showroom_id uuid,
  _qty numeric,
  _reason text,
  _note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _available numeric;
  _queue_id uuid;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;

  SELECT quantity INTO _available
    FROM public.product_stock
   WHERE product_id = _product_id
     AND showroom_id IS NOT DISTINCT FROM _showroom_id
   FOR UPDATE;

  IF COALESCE(_available, 0) < _qty THEN
    RAISE EXCEPTION 'Insufficient finished-product stock (have %, need %)', COALESCE(_available, 0), _qty;
  END IF;

  PERFORM public.commit_stock_movement(
    _product_id, _showroom_id, -abs(_qty),
    'wastage_out', 'wastage', NULL, COALESCE(_reason, 'Finished-product wastage')
  );

  PERFORM public.commit_damaged_movement(
    _product_id, _showroom_id, abs(_qty),
    'damaged_in', 'wastage', NULL, COALESCE(_note, _reason)
  );

  INSERT INTO public.repurpose_queue (product_id, qty, source_showroom_id, status, note)
  VALUES (_product_id, _qty, _showroom_id, 'pending', COALESCE(_note, _reason))
  RETURNING id INTO _queue_id;

  RETURN _queue_id;
END;
$function$;

-- 3) Sell damaged goods (income recovery)
CREATE OR REPLACE FUNCTION public.commit_damaged_sale(
  _product_id uuid,
  _showroom_id uuid,
  _qty numeric,
  _unit_price numeric,
  _customer_name text DEFAULT NULL::text,
  _note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ledger_id uuid;
  _available numeric;
  _amount numeric;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF _unit_price IS NULL OR _unit_price < 0 THEN RAISE EXCEPTION 'Unit price must be zero or greater'; END IF;

  SELECT quantity INTO _available
    FROM public.damaged_stock
   WHERE product_id = _product_id
     AND showroom_id IS NOT DISTINCT FROM _showroom_id
   FOR UPDATE;

  IF COALESCE(_available, 0) < _qty THEN
    RAISE EXCEPTION 'Insufficient damaged stock (have %, need %)', COALESCE(_available, 0), _qty;
  END IF;

  _amount := _qty * _unit_price;

  INSERT INTO public.damaged_ledger
    (product_id, showroom_id, qty, kind, ref_type, note, sale_amount, customer_name)
  VALUES
    (_product_id, _showroom_id, -abs(_qty), 'sale_out', 'damaged_sale', _note, _amount, _customer_name)
  RETURNING id INTO _ledger_id;

  UPDATE public.damaged_stock
     SET quantity = quantity - _qty, updated_at = now()
   WHERE product_id = _product_id
     AND showroom_id IS NOT DISTINCT FROM _showroom_id;

  RETURN _ledger_id;
END;
$function$;

-- 4) Grants
REVOKE ALL ON FUNCTION public.log_finished_product_wastage(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_finished_product_wastage(uuid, uuid, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.commit_damaged_sale(uuid, uuid, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_damaged_sale(uuid, uuid, numeric, numeric, text, text) TO authenticated, service_role;

-- 5) RBAC permission for damaged-goods selling
INSERT INTO public.permissions (key, label, module)
VALUES ('production.damaged.sell', 'Sell damaged goods', 'production')
ON CONFLICT (key) DO NOTHING;
