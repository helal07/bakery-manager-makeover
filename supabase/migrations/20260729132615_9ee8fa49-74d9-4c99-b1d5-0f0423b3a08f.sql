ALTER TABLE public.damaged_ledger ADD COLUMN IF NOT EXISTS sale_amount numeric;
ALTER TABLE public.damaged_ledger ADD COLUMN IF NOT EXISTS customer_name text;

CREATE OR REPLACE FUNCTION public.commit_damaged_sale(
  _product_id uuid,
  _showroom_id uuid,
  _qty numeric,
  _unit_price numeric,
  _customer_name text DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.log_finished_product_wastage(
  _product_id uuid,
  _showroom_id uuid,
  _qty numeric,
  _reason text,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  -- Deduct from finished product stock
  PERFORM public.commit_stock_movement(
    _product_id, _showroom_id, -abs(_qty),
    'wastage_out', 'wastage', NULL, COALESCE(_reason, 'Finished-product wastage')
  );

  -- Move into damaged bucket for the same location
  PERFORM public.commit_damaged_movement(
    _product_id, _showroom_id, abs(_qty),
    'damaged_in', 'wastage', NULL, COALESCE(_note, _reason)
  );

  -- Queue for repurpose / sell / discard decision
  INSERT INTO public.repurpose_queue (product_id, qty, source_showroom_id, status, note)
  VALUES (_product_id, _qty, _showroom_id, 'pending', COALESCE(_note, _reason))
  RETURNING id INTO _queue_id;

  RETURN _queue_id;
END;
$$;

INSERT INTO public.permissions (permission_key, label, module)
VALUES ('production.damaged.sell', 'Sell damaged goods', 'Production')
ON CONFLICT (permission_key) DO NOTHING;