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